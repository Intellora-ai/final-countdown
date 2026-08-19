#!/usr/bin/env python3
"""CI durations, measured from GitHub's own run metadata.

The question this exists to answer is "did that change actually make CI
faster", and the only honest way to answer it is to compare distributions
before and after rather than two lucky runs. So this reports N, median, p50,
p95, min and max per workflow, and refuses to print a comparison it cannot
support.

It deliberately installs nothing. GitHub already records `run_started_at` and
`updated_at` for every run; a monitoring platform would be a second source of
truth for a number the first source already has.

WHAT IS COUNTED. Only completed runs, and by default only successful ones. A
cancelled run's duration measures when someone hit the button, and a failed
run's measures how fast it fell over -- averaging either into "how long does
CI take" produces a number that answers no question. `--include-failures`
overrides this when the failures are what you are studying.

    python3 scripts/ci_metrics.py                      # per-workflow summary
    python3 scripts/ci_metrics.py --since 2026-08-19   # only runs after a date
    python3 scripts/ci_metrics.py --baseline base.json # compare against a saved run
    python3 scripts/ci_metrics.py --save base.json     # save the current numbers
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
# Workflows this repository owns. Dependabot's own runs are noise here: their
# duration says something about Dependabot, not about our CI.
OURS = {"verify", "codeql", "e2e", "pr-fast"}


def gh_json(path: str) -> Any:
    gh = shutil.which("gh")
    if gh is None:
        raise SystemExit("gh is not on PATH, so GitHub cannot be consulted")
    out = subprocess.run([gh, "api", path], capture_output=True, text=True,
                         timeout=120)
    if out.returncode != 0:
        raise SystemExit(f"gh api failed: {(out.stderr or out.stdout)[:200]}")
    return json.loads(out.stdout)


def percentile(values: list[float], fraction: float) -> float:
    """Nearest-rank. With N below ~20 this lands on an actual observation,
    which is more honest than interpolating between two points that were
    never measured."""
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, int(round(fraction * (len(ordered) - 1))))
    return ordered[index]


def collect(pages: int, since: str | None,
            include_failures: bool) -> dict[str, list[float]]:
    cutoff = dt.datetime.fromisoformat(since).replace(
        tzinfo=dt.timezone.utc) if since else None
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
                run["run_started_at"].replace("Z", "+00:00"))
            ended = dt.datetime.fromisoformat(
                run["updated_at"].replace("Z", "+00:00"))
            if cutoff and started < cutoff:
                continue
            durations[run["name"]].append((ended - started).total_seconds())
    return durations


def summarise(durations: dict[str, list[float]]) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    for name, values in durations.items():
        if not values:
            continue
        out[name] = {"n": len(values), "median": statistics.median(values),
                     "p50": percentile(values, 0.50),
                     "p95": percentile(values, 0.95),
                     "min": min(values), "max": max(values),
                     "total": sum(values)}
    return out


def render(summary: dict[str, dict[str, float]]) -> None:
    print(f"  {'workflow':10s} {'N':>4s} {'median':>9s} {'p95':>9s} "
          f"{'min':>8s} {'max':>8s}")
    for name in sorted(summary):
        s = summary[name]
        print(f"  {name:10s} {int(s['n']):4d} {s['median']:8.1f}s "
              f"{s['p95']:8.1f}s {s['min']:7.1f}s {s['max']:7.1f}s")


def compare(now: dict[str, dict[str, float]],
            base: dict[str, dict[str, float]]) -> None:
    print(f"\n  {'workflow':10s} {'median before':>14s} {'after':>9s} "
          f"{'delta':>9s} {'change':>9s}")
    for name in sorted(set(now) | set(base)):
        if name not in now or name not in base:
            print(f"  {name:10s} {'— present in only one sample —':>44s}")
            continue
        before, after = base[name]["median"], now[name]["median"]
        delta = after - before
        pct = (delta / before * 100) if before else 0.0
        # A sample of one or two says nothing about a distribution. Saying so
        # is more useful than a percentage that will not reproduce.
        weak = min(now[name]["n"], base[name]["n"]) < 3
        note = "  (N<3, preliminary)" if weak else ""
        print(f"  {name:10s} {before:13.1f}s {after:8.1f}s "
              f"{delta:+8.1f}s {pct:+8.1f}%{note}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=int, default=3,
                    help="pages of 100 runs to read (default 3)")
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
    print(f"[CI DURATIONS]  {scope} runs"
          f"{f', since {ns.since}' if ns.since else ''}\n")
    render(summary)

    if ns.baseline:
        base = json.loads(Path(ns.baseline).read_text(encoding="utf-8"))
        compare(summary, base)

    if ns.save:
        Path(ns.save).write_text(json.dumps(summary, indent=2) + "\n",
                                 encoding="utf-8")
        print(f"\n  baseline written to {ns.save}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
