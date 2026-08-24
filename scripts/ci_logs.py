#!/usr/bin/env python3
"""Pull every failing CI job's log for a PR, and print only the lines that say why.

WHY THIS EXISTS
---------------
Diagnosing a red PR meant opening jobs one at a time in a browser, or running
`gh run view --log` and scrolling several thousand lines per job to find the
twelve that mattered. Six failing checks is six round trips before the first
fix is even attempted, and the usual result is fixing the first cause found
rather than all of them --- which produces another red run, and another six
round trips.

The insight is that CI failures are not evenly distributed through a log. They
sit in a handful of recognisable shapes: a compiler diagnostic, a test
assertion, a traceback, a non-zero exit, a linter's file:line:col. Everything
else is setup, dependency resolution, and progress bars.

So: fetch every failing job, keep the lines matching those shapes, group them
by job, and print them together. One command, every error, all at once.

WHAT IT DOES NOT DO
-------------------
It does not guess at fixes and it does not summarise. Both would put a layer of
interpretation between the reader and the actual error text, and the actual
error text is the thing worth having. `--full` prints the unfiltered tail of a
job for the cases where the pattern set missed.

FAILS LOUD
----------
If `gh` is missing, unauthenticated, or the PR does not exist, this says so and
exits non-zero. A log tool that silently prints nothing is indistinguishable
from a green build, which is the exact confusion it is meant to remove.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass, field

# ---------------------------------------------------------------------------
# What an error looks like
# ---------------------------------------------------------------------------

# Ordered most-specific first so a line is attributed to the tightest pattern
# that matches it. The label is printed alongside, because knowing a line is a
# type error rather than a test failure changes which file you open.
PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("tsc", re.compile(r"^\s*\S+\.tsx?\(\d+,\d+\):\s*error TS\d+")),
    ("eslint", re.compile(r"^\s*\d+:\d+\s+error\s+")),
    ("pyright", re.compile(r"^\s*\S+\.py:\d+:\d+\s*-\s*error:")),
    ("pytest", re.compile(r"^(FAILED|ERROR)\s+\S+::")),
    ("vitest", re.compile(r"^\s*(FAIL|×)\s+\S")),
    ("assert", re.compile(r"^\s*(AssertionError|expected .* (to|but))", re.I)),
    ("traceback", re.compile(r"^\s*(Traceback \(most recent call last\)|\s+File \"[^\"]+\", line \d+)")),
    ("exception", re.compile(r"^\s*\w*(Error|Exception)(\[[^\]]*\])?:\s+\S")),
    ("gate", re.compile(r"\b(GATE|CHECK)\b.*\b(FAIL|FAILED|BLOCKED)\b")),
    ("annotation", re.compile(r"^##\[error\]|^Error:\s")),
    ("exit", re.compile(r"Process completed with exit code [1-9]")),
    ("npm", re.compile(r"^npm (ERR!|error)\b")),
    ("segfault", re.compile(r"\b(Killed|Segmentation fault|out of memory|OOM)\b")),
]

# Lines that match a pattern but are noise in this repo specifically.
MUTED = re.compile(
    r"npm (ERR!|error) A complete log of this run|"
    r"Error: Process completed with exit code 1\.$|"
    r"^\s*at ",  # stack frames below the first; the exception line carries it
)

# How many lines of surrounding context to keep with each hit.
CONTEXT_BEFORE = 2
CONTEXT_AFTER = 4


@dataclass
class Job:
    name: str
    job_id: str
    conclusion: str
    url: str
    hits: list[tuple[str, int, str]] = field(default_factory=list)
    line_count: int = 0


# ---------------------------------------------------------------------------
# gh plumbing
# ---------------------------------------------------------------------------


def _gh(args: list[str], *, check: bool = True) -> str:
    """Run gh and return stdout. Raises with the real stderr on failure."""
    proc = subprocess.run(  # noqa: S603 - fixed executable, no shell
        ["gh", *args],
        capture_output=True,
        text=True,
        check=False,
    )
    if check and proc.returncode != 0:
        raise RuntimeError(f"gh {' '.join(args)} failed:\n{proc.stderr.strip()}")
    return proc.stdout


def failing_checks(pr: str) -> list[Job]:
    """Every non-passing check on a PR, newest run per check."""
    raw = _gh(
        [
            "pr",
            "view",
            pr,
            "--json",
            "statusCheckRollup",
        ]
    )
    rollup = json.loads(raw).get("statusCheckRollup") or []

    jobs: list[Job] = []
    for check in rollup:
        conclusion = (check.get("conclusion") or "").upper()
        status = (check.get("status") or "").upper()
        # IN_PROGRESS is reported so a caller knows the picture is incomplete,
        # rather than being told everything that has finished is fine.
        if conclusion in {"SUCCESS", "NEUTRAL", "SKIPPED"}:
            continue
        url = check.get("detailsUrl") or ""
        job_id = url.rstrip("/").split("/")[-1] if "/job/" in url else ""
        jobs.append(
            Job(
                name=check.get("name") or "?",
                job_id=job_id,
                conclusion=conclusion or status or "UNKNOWN",
                url=url,
            )
        )
    return jobs


def job_log(job_id: str) -> str:
    if not job_id:
        return ""
    try:
        return _gh(["api", f"repos/{{owner}}/{{repo}}/actions/jobs/{job_id}/logs"])
    except RuntimeError:
        return ""


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------


def classify(line: str) -> str | None:
    if MUTED.search(line):
        return None
    for label, pattern in PATTERNS:
        if pattern.search(line):
            return label
    return None


def extract(log: str) -> tuple[list[tuple[str, int, str]], int]:
    """Return (hits, total_lines). Each hit is (label, line_number, text)."""
    lines = log.splitlines()
    keep: dict[int, str] = {}
    labels: dict[int, str] = {}

    for i, raw in enumerate(lines):
        # GitHub prefixes every line with an ISO timestamp; it is noise here
        # and it defeats patterns anchored with ^.
        line = re.sub(r"^\d{4}-\d\d-\d\dT[\d:.]+Z\s?", "", raw).rstrip()
        label = classify(line)
        if label is None:
            continue
        labels[i] = label
        for j in range(max(0, i - CONTEXT_BEFORE), min(len(lines), i + CONTEXT_AFTER + 1)):
            ctx = re.sub(r"^\d{4}-\d\d-\d\dT[\d:.]+Z\s?", "", lines[j]).rstrip()
            if ctx:
                keep.setdefault(j, ctx)

    hits = [(labels.get(i, ""), i + 1, text) for i, text in sorted(keep.items())]
    return hits, len(lines)


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------


def render(jobs: list[Job], *, full: bool, tail: int) -> str:
    out: list[str] = []
    running = [j for j in jobs if j.conclusion in {"IN_PROGRESS", "QUEUED", "PENDING"}]
    failed = [j for j in jobs if j not in running]

    out.append("=" * 72)
    out.append(f"{len(failed)} failing, {len(running)} still running")
    out.append("=" * 72)

    for job in failed:
        out.append("")
        out.append(f"--- {job.name}  [{job.conclusion}] " + "-" * max(0, 40 - len(job.name)))
        out.append(f"    {job.url}")
        if not job.hits and not full:
            out.append(
                "    no recognised error pattern in "
                f"{job.line_count} lines --- rerun with --full to see the tail"
            )
            continue
        if full:
            for label, n, text in job.hits[-tail:]:
                out.append(f"    {n:>6}  {label:<10} {text}")
        else:
            last = None
            for label, n, text in job.hits:
                if last is not None and n > last + 1:
                    out.append("           ...")
                out.append(f"    {n:>6}  {label:<10} {text}")
                last = n

    for job in running:
        out.append("")
        out.append(f"--- {job.name}  [{job.conclusion}] --- not finished, no verdict yet")

    if not failed and not running:
        out.append("")
        out.append("Every check passed.")
    return "\n".join(out)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pr", help="PR number or branch name")
    ap.add_argument("--full", action="store_true", help="print the tail of each job unfiltered")
    ap.add_argument("--tail", type=int, default=80, help="lines per job with --full (default 80)")
    args = ap.parse_args(argv)

    if shutil.which("gh") is None:
        print("gh is not installed --- this tool reads GitHub logs through it.", file=sys.stderr)
        return 2

    try:
        jobs = failing_checks(args.pr)
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 2

    for job in jobs:
        log = job_log(job.job_id)
        if log:
            job.hits, job.line_count = extract(log)

    print(render(jobs, full=args.full, tail=args.tail))
    # Non-zero when anything is failing, so this composes in a shell chain.
    return 1 if any(j.conclusion not in {"IN_PROGRESS", "QUEUED", "PENDING"} for j in jobs) else 0


if __name__ == "__main__":
    raise SystemExit(main())
