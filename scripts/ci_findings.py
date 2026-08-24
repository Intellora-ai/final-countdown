#!/usr/bin/env python3
"""CI FINDINGS — make a GitHub Actions run readable by software.

WHY THIS EXISTS.

`frontend/scripts/gh-annotate.mjs` converts tool output into
`::error file=F,line=L,col=C` workflow commands, and everything guarding it
measures the EMITTING side: how many commands were written to stdout. GitHub
decides which of them LAND. It resolves `file=` against the commit being
annotated and SILENTLY DISCARDS anything it cannot find -- a `node_modules`
path, a path outside the checkout, a stale path after a rename.

So a run can emit forty annotations, land none, and report itself healthy,
because the number the emitter counted went up. The failure is red with no
location anywhere, which is the precise state gh-annotate was written to make
impossible, entered from the side its guard does not watch.

This module answers three questions nothing else here can:

  * every error line in a log, as a record, with the step it came from
  * what class of failure each one is, so a reader knows which to open first
  * did every failure actually LAND somewhere a human can click

WHAT IT IS NOT. It does not decide whether the code is correct -- the gates
already did that. It decides whether their verdict is ADDRESSABLE. A gate that
fails without a location costs twenty minutes of log scrolling; a thousand of
them cost a week.

NO SUBPROCESS, DELIBERATELY.

`scripts/security_gate.py` keeps an allowlist keyed by (bandit rule, path).
Any script here importing subprocess raises B404/B603/B607, and until its path
is added to that allowlist `sarif_suppress.py` cannot adjudicate the findings.
An earlier version of this file had a `fetch` subcommand that shelled out to
`gh`, and it broke three tests in tests/test_sarif_suppress.py for exactly that
reason. The allowlist lives in a file this lane does not own, so rather than
couple the two lanes, fetching is the CALLER's job and this module reads files.
`tests/test_ci_findings.py::test_the_module_shells_out_to_nothing` keeps it
that way.

USAGE

  # a raw log into one JSON object per finding
  gh run view <run-id> --log > run.log
  python3 scripts/ci_findings.py extract --log run.log > findings.jsonl

  # what GitHub ACCEPTED, checked against the tree
  gh api repos/$REPO/actions/runs/<run-id>/jobs --paginate \
     --jq '.jobs' > jobs.json
  gh api repos/$REPO/check-runs/<check-id>/annotations > annotations.json
  python3 scripts/ci_findings.py reconcile --jobs jobs.json \
     --annotations annotations.json

`reconcile` exits non-zero when a failure on this run cannot be located, which
is the whole point: it composes in a shell chain and in a workflow step.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# Every line of a downloaded Actions log carries this. Not stripping it is why
# grepping a log is misery and why every ^-anchored pattern below would miss.
TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s?")

MARKER = re.compile(r"^##\[(error|warning|notice)\](.*)$")
GROUP = re.compile(r"^##\[group\](.*)$")

# `src/x.ts(12,5): error TS2345: ...` -- tsc, msbuild, several linters.
PAREN_LOC = re.compile(
    r"^(?P<file>[^\s(][^(]*?)\((?P<line>\d+),(?P<col>\d+)\):\s*(?P<rest>.*)$"
)

# `src/x.ts:12:5: message` and `src/x.ts:12: message` -- gcc style, vitest,
# eslint stylish, ruff, mypy, pyright.
COLON_LOC = re.compile(
    r"^(?P<file>[^\s:][^:]*?):(?P<line>\d+)(?::(?P<col>\d+))?:\s*(?P<rest>.*)$"
)

# A line with no runner marker is only a finding if it says something went
# wrong. Without this, every path-shaped line in a build log is reported, and a
# findings file nobody trusts is worse than no findings file at all.
ERRORISH = re.compile(
    r"\b(error|failed|failure|exception|assertion\w*)\b", re.IGNORECASE
)

# ORDERED, MOST SPECIFIC FIRST. The label is what turns "47 errors" into
# "3 tsc, 1 pytest, 43 npm noise" -- the first is a number, the second tells
# the reader which line to open. Order matters because several of these match
# the same line and only the first is right: a tsc diagnostic and a pyright
# diagnostic are both `file:line: error ...`.
PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("tsc", re.compile(r"\bTS\d{4,5}\b")),
    ("eslint", re.compile(r"@typescript-eslint|\beslint\b", re.IGNORECASE)),
    ("pyright", re.compile(r"\berror:\s.*\[[a-zA-Z][\w-]*\]\s*$")),
    ("traceback", re.compile(r"^Traceback \(most recent call last\)")),
    ("assert", re.compile(r"\bAssertionError\b|^E\s{2,}\w+Error\b")),
    ("pytest", re.compile(r"^(FAILED|ERROR)\s+\S+::|^\s*\d+ failed")),
    ("vitest", re.compile(r"\bFAIL\s+\S+\.(test|spec)\.[tj]sx?\b")),
    ("segfault", re.compile(r"\bSegmentation fault\b|\bcore dumped\b", re.IGNORECASE)),
    ("gate", re.compile(r"^\s*\[GATE (RESULT|END)\]|\bGATE FAILED\b")),
    ("exit", re.compile(r"\bexit code \d+\b", re.IGNORECASE)),
    ("npm", re.compile(r"^npm (ERR|WARN)!")),
)

# Lines the runner prints on every failure that name nothing. A findings file
# where forty of forty-three rows are the same boilerplate trains the reader to
# skim, which is how the three real rows get missed.
#
# `exit code 1` is muted and other codes are not, on purpose: 1 is the generic
# "a command failed" that the failing command already reported, while 137 (OOM)
# and 143 (SIGTERM) are the only record that the job was killed rather than
# failing on its own merits.
MUTED: tuple[re.Pattern[str], ...] = (
    re.compile(r"^npm ERR! A complete log of this run"),
    re.compile(r"^npm ERR! .*_logs/.*\.log\s*$"),
    re.compile(r"^Process completed with exit code 1\.\s*$"),
)


@dataclass(frozen=True)
class Finding:
    """One thing that went wrong, with the step and the class it belongs to."""

    step: str
    level: str
    file: str | None
    line: int | None
    col: int | None
    message: str
    label: str = "unclassified"

    def as_dict(self) -> dict[str, Any]:
        return {
            "step": self.step,
            "level": self.level,
            "label": self.label,
            "file": self.file,
            "line": self.line,
            "col": self.col,
            "message": self.message,
        }


@dataclass(frozen=True)
class Problem:
    """A way this run's verdict is not addressable."""

    kind: str
    detail: str
    where: str

    def as_dict(self) -> dict[str, Any]:
        return {"kind": self.kind, "detail": self.detail, "where": self.where}


# Labels that mean "this line IS a failure" on their own, with or without a
# path attached. Everything else needs a location before an unmarked line is
# recorded, or the parser reports half the build log.
STRONG = frozenset({"traceback", "assert", "pytest", "vitest", "segfault"})


def classify(text: str) -> str:
    """Which kind of failure this line is, or `unclassified`.

    `unclassified` is a real answer and never a reason to drop the line. A
    pattern table only reports what it recognises, so a tool nobody wrote a
    pattern for would otherwise vanish -- the same silent-miss shape as an
    annotation GitHub discarded. A gap in this table must surface as a row a
    human can read.
    """
    for label, pattern in PATTERNS:
        if pattern.search(text):
            return label
    return "unclassified"


def _muted(text: str) -> bool:
    return any(p.search(text) for p in MUTED)


def _locate(text: str) -> tuple[str | None, int | None, int | None]:
    """Pull a file/line/col off the front of a message, if one is there."""
    m = PAREN_LOC.match(text)
    if m and ERRORISH.search(m.group("rest")):
        return m.group("file"), int(m.group("line")), int(m.group("col"))
    m = COLON_LOC.match(text)
    if m:
        col = m.group("col")
        return m.group("file"), int(m.group("line")), int(col) if col else None
    return None, None, None


def parse_log(text: str) -> list[Finding]:
    """Raw Actions log text -> findings, each attributed to its step.

    THE STEP IS NOT DECORATION. A flat list of error strings cannot be routed to
    the gate that owns it, and routing is the whole reason to have records
    instead of prose. `##[group]` is what the runner uses to delimit steps.
    """
    findings: list[Finding] = []
    step = "(no step)"
    for raw in text.splitlines():
        line = TIMESTAMP.sub("", raw).rstrip()
        if not line:
            continue
        g = GROUP.match(line)
        if g:
            step = g.group(1).strip()
            continue
        if line.startswith("##[endgroup]"):
            continue

        m = MARKER.match(line)
        if m:
            level, body = m.group(1), m.group(2).strip()
            if _muted(body):
                continue
            f, ln, col = _locate(body)
            findings.append(Finding(step, level, f, ln, col, body, classify(body)))
            continue

        # No marker. Tools print to stdout and the runner does not mark them,
        # which is how a real error ends up invisible inside a collapsed group.
        if _muted(line):
            continue
        # Indented diagnostics are the norm, not the exception: pytest indents
        # its `E   ` lines and pyright indents under a file heading. Both
        # location patterns are ^-anchored, so matching the raw line drops
        # every one of them.
        probe = line.lstrip()
        f, ln, col = _locate(probe)
        label = classify(probe)
        # A traceback header, a bare AssertionError and a `FAILED test::name`
        # carry no path ON THAT LINE and are unambiguously failures. Requiring
        # a location before recording them is what makes a python failure
        # invisible in a log that states it plainly.
        if (f is not None and ERRORISH.search(probe)) or label in STRONG:
            findings.append(Finding(step, "error", f, ln, col, probe, label))
    return findings


def to_jsonl(findings: Iterable[Finding]) -> str:
    """One JSON object per line. The point of the whole module."""
    return "".join(json.dumps(f.as_dict(), sort_keys=True) + "\n" for f in findings)


def reconcile(
    jobs: list[dict[str, Any]],
    annotations: list[dict[str, Any]],
    path_exists: Callable[[str], bool],
) -> list[Problem]:
    """Compare what failed against what can actually be located.

    `path_exists` is injected rather than hardcoded to `Path.exists` so this
    stays pure and the silent-drop case is testable without building a tree.
    """
    problems: list[Problem] = []

    for a in annotations:
        path = a.get("path")
        level = a.get("annotation_level", "failure")
        if not path:
            continue
        if not path_exists(path):
            # THE SILENT DROP. GitHub resolved this against the commit, found
            # nothing, and discarded it without a word. The emitter still
            # counted it, so every guard upstream stayed satisfied.
            problems.append(
                Problem(
                    kind="annotation-path-not-in-tree",
                    detail=(
                        f"{path!r} does not exist at this commit, so GitHub "
                        f"discarded this {level} and it appears nowhere on the run"
                    ),
                    where=path,
                )
            )
            continue
        if a.get("start_line") in (None, 0):
            problems.append(
                Problem(
                    kind="annotation-without-a-line",
                    detail=(
                        f"{path!r} was annotated with no line, so it pins to line 1 "
                        "-- a location pointing at the wrong code rather than none"
                    ),
                    where=path,
                )
            )

    failed = [j for j in jobs if j.get("conclusion") == "failure"]
    if failed and not annotations:
        for j in failed:
            steps = [
                s.get("name", "?")
                for s in j.get("steps", [])
                if s.get("conclusion") == "failure"
            ]
            problems.append(
                Problem(
                    kind="job-failed-with-no-annotations",
                    detail=(
                        f"job {j.get('name')!r} failed"
                        + (f" at step(s) {', '.join(steps)}" if steps else "")
                        + " and produced no annotations, so the failure has no file "
                        "or line anywhere on this run"
                    ),
                    where=str(j.get("name")),
                )
            )
    return problems


def _emit_problem(p: Problem) -> None:
    """Annotate the reconciler's own findings, so it is not another silent log."""
    where = f"file={p.where}," if "/" in p.where else ""
    print(f"::error {where}title=unlocatable failure: {p.kind}::{p.detail}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Make a CI run readable by software.")
    sub = ap.add_subparsers(dest="cmd", required=True)

    ex = sub.add_parser("extract", help="raw Actions log -> findings JSONL")
    ex.add_argument("--log", type=Path, help="log file; omit to read stdin")

    rc = sub.add_parser("reconcile", help="fail when a failure has no location")
    rc.add_argument("--jobs", type=Path, required=True)
    rc.add_argument("--annotations", type=Path, required=True)
    rc.add_argument("--root", type=Path, default=Path("."))

    args = ap.parse_args(argv)

    if args.cmd == "extract":
        text = args.log.read_text(encoding="utf-8") if args.log else sys.stdin.read()
        findings = parse_log(text)
        sys.stdout.write(to_jsonl(findings))
        counts: dict[str, int] = {}
        for f in findings:
            counts[f.label] = counts.get(f.label, 0) + 1
        summary = ", ".join(f"{n} {k}" for k, n in sorted(counts.items()))
        print(f"# {len(findings)} finding(s): {summary or 'none'}", file=sys.stderr)
        return 0

    if args.cmd == "reconcile":
        jobs = json.loads(args.jobs.read_text(encoding="utf-8"))
        annotations = json.loads(args.annotations.read_text(encoding="utf-8"))
        root: Path = args.root
        problems = reconcile(
            jobs if isinstance(jobs, list) else jobs.get("jobs", []),
            annotations if isinstance(annotations, list) else [],
            path_exists=lambda p: (root / p).exists(),
        )
        for p in problems:
            _emit_problem(p)
        target = os.environ.get("GITHUB_STEP_SUMMARY")
        if target and problems:
            with open(target, "a", encoding="utf-8") as fh:
                fh.write("### Failures with no usable location\n\n")
                fh.write("| kind | where | detail |\n| --- | --- | --- |\n")
                for p in problems:
                    fh.write(f"| {p.kind} | `{p.where}` | {p.detail} |\n")
        print(json.dumps([p.as_dict() for p in problems], indent=2))
        if problems:
            print(
                f"\nci-findings: FAIL — {len(problems)} failure(s) on this run "
                "cannot be located from the annotations alone."
            )
            return 1
        print(
            "ci-findings: PASS — every failure on this run has a resolvable location."
        )
        return 0

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
