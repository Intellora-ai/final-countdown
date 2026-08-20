#!/usr/bin/env python3
"""CI durations, measured from GitHub's own run metadata.

The script reads GitHub Actions metadata through the local `gh` CLI and reports
measured distributions rather than guessing from individual runs.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import shutil
import statistics
import subprocess
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

REPO = "Intellora-ai/final-countdown"
OURS = {"verify", "codeql", "e2e"}


def gh_json(path: str) -> Any:
    """Call the fixed `gh api` command without a shell.

    `path` is constructed internally from fixed repository/workflow constants;
    it is never accepted as a shell command or executed through a shell.
    """
    gh = shutil.which("gh")
    if gh is None:
        raise SystemExit("gh is not on PATH, so GitHub cannot be consulted")
    # No `# nosec`. B404 and B603 are cleared for this file by
    # scripts/security_gate.py, which re-derives the safe pattern from this
    # AST on every run -- shell=False, argv a list literal, argv[0] from
    # shutil.which, timeout set. A `# nosec` deletes the finding before the
    # gate ever sees it, which swaps that re-derivation for an assertion.
    # Measured: with `# nosec B603` here, replacing argv[0] with a
    # caller-supplied string and dropping the timeout still reported
    # `PASS (with 27 verified exceptions)`; without it, the same edit reports
    # `FAIL -- no timeout` and `argv[0] is 'path' -- not shutil.which(...)`.
    out = subprocess.run(
        [gh, "api", path],
        capture_output=True,
        text=True,
        timeout=120,
        stdin=subprocess.DEVNULL,
        shell=False,
    )
    if out.returncode != 0:
        raise SystemExit("gh api failed; see the command output above")
    try:
        return json.loads(out.stdout)
    except json.JSONDecodeError as exc:
        raise SystemExit("gh api returned invalid JSON") from exc


def percentile(values: list[float], fraction: float) -> float:
    """Nearest-rank percentile based on observed measurements."""
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, int(round(fraction * (len(ordered) - 1))))
    return ordered[index]


def collect(
    pages: int, since: str | None, include_failures: bool
) -> dict[str, list[float]]:
    cutoff = (
        dt.datetime.fromisoformat(since).replace(tzinfo=dt.timezone.utc)
        if since
        else None
    )
    durations: dict[str, list[float]] = defaultdict(list)
    for page in range(1, pages + 1):
        data = gh_json(f"repos/{REPO}/actions/runs?per_page=100&page={page}")
        runs = data.get("workflow_runs", [])
        if not runs:
            break
        for run in runs:
            if run.get("name") not in OURS:
                continue
            if run.get("status") != "completed":
                continue
            if not include_failures and run.get("conclusion") != "success":
                continue
            started = dt.datetime.fromisoformat(
                run["run_started_at"].replace("Z", "+00:00")
            )
            ended = dt.datetime.fromisoformat(run["updated_at"].replace("Z", "+00:00"))
            if cutoff and started < cutoff:
                continue
            durations[run["name"]].append((ended - started).total_seconds())
    return durations


def summarise(durations: dict[str, list[float]]) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    for name, values in durations.items():
        if not values:
            continue
        out[name] = {
            "n": len(values),
            "median": statistics.median(values),
            "p50": percentile(values, 0.50),
            "p95": percentile(values, 0.95),
            "min": min(values),
            "max": max(values),
            "total": sum(values),
        }
    return out


def render(summary: dict[str, dict[str, float]]) -> None:
    print(
        f"  {'workflow':10s} {'N':>4s} {'median':>9s} {'p95':>9s} "
        f"{'min':>8s} {'max':>8s}"
    )
    for name in sorted(summary):
        s = summary[name]
        print(
            f"  {name:10s} {int(s['n']):4d} {s['median']:8.1f}s "
            f"{s['p95']:8.1f}s {s['min']:7.1f}s {s['max']:7.1f}s"
        )


def compare(
    now: dict[str, dict[str, float]], base: dict[str, dict[str, float]]
) -> None:
    print(
        f"\n  {'workflow':10s} {'median before':>14s} {'after':>9s} "
        f"{'delta':>9s} {'change':>9s}"
    )
    for name in sorted(set(now) | set(base)):
        if name not in now or name not in base:
            print(f"  {name:10s} {'— present in only one sample —':>44s}")
            continue
        before, after = base[name]["median"], now[name]["median"]
        delta = after - before
        pct = (delta / before * 100) if before else 0.0
        weak = min(now[name]["n"], base[name]["n"]) < 3
        note = "  (N<3, preliminary)" if weak else ""
        print(
            f"  {name:10s} {before:13.1f}s {after:8.1f}s "
            f"{delta:+8.1f}s {pct:+8.1f}%{note}"
        )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--pages", type=int, default=3, help="pages of 100 runs to read (default 3)"
    )
    ap.add_argument("--since", help="ISO date; ignore runs started before it")
    ap.add_argument("--include-failures", action="store_true")
    ap.add_argument("--save", help="write these numbers to a JSON baseline")
    ap.add_argument("--baseline", help="compare against a saved baseline")
    ns = ap.parse_args()

    durations = collect(ns.pages, ns.since, ns.include_failures)
    summary = summarise(durations)
    if not summary:
        print("no completed runs matched", file=sys.stderr)
        return 1

    scope = "all completed" if ns.include_failures else "successful"
    print(f"[CI DURATIONS]  {scope} runs{f', since {ns.since}' if ns.since else ''}\n")
    render(summary)

    if ns.baseline:
        base = json.loads(Path(ns.baseline).read_text(encoding="utf-8"))
        compare(summary, base)

    if ns.save:
        Path(ns.save).write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
        print(f"\n  baseline written to {ns.save}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
