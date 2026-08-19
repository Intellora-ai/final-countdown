#!/usr/bin/env python3
"""Wrap any command as a gate, so it emits evidence without changing its logic.

    python3 scripts/run_gate.py --name coverage -- pytest --cov-fail-under=95

Every gate then produces reports/<name>.json, a $GITHUB_STEP_SUMMARY entry and
the [GATE START]..[GATE END] block, whether it is a Python verifier, pytest,
pyright or a shell script. One wrapper rather than ten edited call sites: the
gates keep owning their pass/fail decision, this only records it.

The wrapped command's exit code is the verdict and is never rewritten. Non-zero
stays non-zero; the wrapper exits non-zero too.
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import cast

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gate import Gate  # noqa: E402

REPO = Path(__file__).resolve().parent.parent

# A compiler-style position in tool output. Deliberately narrow: a real
# extension, then a line number. `1:30` in a duration and `95%` in a coverage
# line must not look like locations.
#
# No leading `\b`. A word boundary does not exist between a space and a `/`,
# so anchoring on one silently dropped the leading slash of every absolute
# path -- `/tmp/x/y.py:12` was captured as `tmp/x/y.py`, which is not
# absolute, is not relative to this repository either, and therefore resolved
# to nothing. The optional `/` is what makes pyright's output usable.
# The column is optional and is the third group. It was not captured at all
# until now, and that was a loss with no upside: pyright is the one wrapped
# tool that prints columns -- `/abs/x.py:12:5 - error: ...` -- and
# blocker_report.location() has always parsed a `file:line:col` `where` and
# emitted `,col=` into the annotation. Nothing ever produced one, so that
# branch was unreachable: the system carried the code to report a column and
# threw the column away one function earlier.
_POSITION = re.compile(r"(/?[\w./-]+\.[A-Za-z]{1,6}):(\d+)(?::(\d+))?\b")


# pytest's short summary: `FAILED tests/x.py::test_y - AssertionError: msg`.
# The `- msg` half is optional; a collection error prints the id alone.
_PYTEST_FAILED = re.compile(
    r"^(?:FAILED|ERROR)\s+(?P<file>[\w./-]+\.py)(?:::(?P<test>[\w\[\].:-]+))?"
    r"(?:\s+-\s+(?P<message>.*))?$", re.MULTILINE)


def per_test_failures(text: str) -> list[dict[str, str]]:
    """One structured record per failing test, from pytest's short summary.

    WHY THIS IS PARSED FROM STDOUT AND NOT FROM JUNIT XML.

    The XML is richer -- durations, skips, per-test capture -- and this gate
    emits it as an artifact for exactly that reason. It is not PARSED here,
    because parsing it in-process means `xml.etree`, which bandit flags as B405
    and B314, and clearing those would mean a new verified exemption in
    security_gate.py for a parser handling a file this repository generated
    seconds earlier. That is real trusted-computing-base surface bought to
    re-read data already present in captured stdout.

    So the standard artifact is produced for anything downstream that wants it,
    and the gate's own decision path stays dependency-free.

    WHAT THIS BUYS. Before, a failing test run produced ONE failure record --
    "coverage failed" -- with the last six lines of output as prose. Twenty
    failing tests and one failing test were indistinguishable in the finalizer,
    and neither carried a location the report could annotate. Each failing test
    is now its own record with its own file, so the log lists them and the
    annotations land on the right files.
    """
    out: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for match in _PYTEST_FAILED.finditer(text):
        path = match.group("file")
        if not (REPO / path).is_file():
            # pytest prints repository-relative paths. Anything else is not a
            # test in this tree, and a location that cannot be opened is worse
            # than none -- same rule the annotator applies.
            continue
        test = match.group("test") or "(collection)"
        key = (path, test)
        if key in seen:
            continue
        seen.add(key)
        out.append({"test": test, "file": path,
                    "message": (match.group("message") or "").strip()})
    return out


def first_location(text: str) -> str:
    """The first `path:line` in tool output that names a file that exists.

    Existence is checked rather than assumed. This string becomes a GitHub
    annotation, and an annotation on a path that is not in the tree sends a
    reader somewhere there is nothing to read -- worse than giving no position
    at all. Returns "" when the output names no real file, and the caller then
    keeps its previous behaviour.
    """
    for match in _POSITION.finditer(text):
        raw = match.group(1)
        # pyright prints absolute paths -- on a runner that is
        # /home/runner/work/<repo>/<repo>/tests/x.py -- while bandit prints
        # repository-relative ones. An annotation needs the relative form, so
        # an absolute path under this repository is rebased and one outside it
        # (a dependency in site-packages, say) is skipped: it is a real file,
        # but not one the reader can open in this diff.
        path = Path(raw)
        if path.is_absolute():
            try:
                # Both sides are resolved. Resolving only the reported path
                # makes the comparison fail wherever a symlink sits above the
                # checkout -- on macOS /var is a link to /private/var, so an
                # unresolved REPO never matches a resolved path and every
                # absolute position was silently discarded.
                candidate = str(path.resolve().relative_to(REPO.resolve()))
            except (ValueError, OSError):
                continue
        else:
            candidate = raw.lstrip("./")
        if (REPO / candidate).is_file():
            column = match.group(3)
            return (f"{candidate}:{match.group(2)}"
                    + (f":{column}" if column else ""))
    return ""


# Scope lines worth lifting out of gate stdout into structured evidence.
SCOPE_PATTERNS = [
    (re.compile(r"Total coverage:\s*([\d.]+%)"), "coverage"),
    (re.compile(r"(\d+)\s+errors?,\s+\d+\s+warnings?"), "type_errors"),
    (re.compile(r"mutation discrimination:\s*(\d+/\d+)"), "mutants_killed"),
    # Matches mutation_gate's current wording. The previous pattern
    # ("equivalent mutants:") stopped matching when that gate renamed the
    # concept, and a scope field silently stopped being populated — a dead
    # regex reports nothing rather than failing, so nothing noticed.
    (re.compile(r"indistinguishable on sample:\s*(\d+)"), "indistinguishable_on_sample"),
    (re.compile(r"JOINT strength:\s*([\d.]+)"), "joint_strength"),
    (re.compile(r"bandit:\s*(\d+) findings"), "security_findings"),
    (re.compile(r"PASS \(with (\d+) verified exceptions\)"), "verified_exceptions"),
    (re.compile(r"^\s*(\d+) passed", re.MULTILINE), "tests_passed"),
    (re.compile(r"Sufficiency:\s+(\w+)"), "sufficiency"),
    (re.compile(r"(\d+)\s+proofs? verified"), "proofs_verified"),
    (re.compile(r"^✓ (\w+): verified", re.MULTILINE), "axle_verified"),
]


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--name", required=True, help="gate name; becomes reports/<name>.json")
    p.add_argument("--version", default="1.0.0")
    p.add_argument("--timeout", type=int, default=1800)
    p.add_argument("command", nargs=argparse.REMAINDER)
    ns = p.parse_args()

    cmd = ns.command[1:] if ns.command and ns.command[0] == "--" else ns.command
    if not cmd:
        print("usage: run_gate.py --name NAME -- COMMAND...", file=sys.stderr)
        sys.exit(2)

    with Gate(ns.name, version=ns.version) as g:
        exe = cast("str | None", shutil.which(cmd[0]))
        if exe is None:
            g.infrastructure_failure(f"{cmd[0]!r} is not on PATH")
            return
        resolved = exe
        g.set_scope(command=" ".join(cmd))

        try:
            # shell=False, absolute executable, fixed argv from this repo's
            # workflows - never a shell string.
            out = subprocess.run([resolved, *cmd[1:]], capture_output=True, text=True,
                                 timeout=ns.timeout)
        except subprocess.TimeoutExpired:
            g.infrastructure_failure(f"timed out after {ns.timeout}s")
            return

        combined = out.stdout + out.stderr
        print(combined, end="" if combined.endswith("\n") else "\n")

        counts: dict[str, object] = {}
        for pattern, label in SCOPE_PATTERNS:
            found = pattern.findall(combined)
            if found:
                counts[label] = len(found) if label == "axle_verified" else found[-1]
        g.set_scope(**counts)

        g.check(f"{ns.name} exit code", out.returncode == 0, f"exit={out.returncode}")
        if out.returncode == 0:
            g.passed()
        else:
            tail = [ln for ln in combined.strip().splitlines() if ln.strip()][-6:]
            g.failed()
            # `where` used to be the command, which is already in scope.command
            # and is not a place a reader can open. The tools wrapped here do
            # print a position -- bandit says
            # `UNRESOLVED B603 scripts/ci_metrics.py:43`, pyright says
            # `scripts/x.py:12:5 - error: ...` -- but it stayed as prose in the
            # tail, so the finalizer had no location to annotate and every
            # annotation this repository could emit was silently empty.
            # Falls back to the command when the output names no real file, so
            # a gate whose failure has no position is unchanged.
            per_test = per_test_failures(combined)
            for failure in per_test:
                # One record per failing test rather than one for the whole
                # run. Twenty failures and one failure used to look identical
                # in the finalizer, and neither carried a file to annotate.
                g.fail(what=f"{failure['test']} failed",
                       where=failure["file"],
                       why=failure["message"] or "see the captured output above",
                       requirement="Every test in this suite must pass.",
                       fix=f"Reproduce with: pytest {failure['file']}"
                           + (f"::{failure['test']}"
                              if failure["test"] != "(collection)" else ""))
            if not per_test:
                # Not a test-suite failure, or a shape the summary did not
                # print -- a crash before collection, a threshold miss, a tool
                # that is not pytest at all. The single record is kept for
                # those, so a failure is never recorded as zero failures.
                g.fail(what=f"{ns.name} failed",
                       where=first_location(combined) or " ".join(cmd[:3]),
                       why="\n".join(tail)[:500],
                       requirement="This gate is required by the ruleset; it must exit 0.",
                       fix="Read reports/ and the log above; fix the code, not the gate.")
        g.artifact(f"reports/{ns.name}.json")


if __name__ == "__main__":
    main()
