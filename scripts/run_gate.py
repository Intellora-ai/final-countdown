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
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, cast

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
_POSITION = re.compile(r"(/?[\w./-]+\.[A-Za-z]{1,6}):(\d+)\b")


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
            return f"{candidate}:{match.group(2)}"
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



# --- ONE WRITER PER REPORT PATH -------------------------------------------
#
# THE DEFECT THIS CLOSES, MEASURED BEFORE THE FIX.
#
# Some wrapped verifiers own a Gate themselves. `correspondence_gate.py` opens
# `Gate("correspondence")` and writes reports/correspondence.json with one
# record per bad pair -- each carrying a runnable
# `python3 scripts/gen_correspondence.py --function <name>`. ci/gates.toml then
# mandates that the whole thing run inside `run_gate.py --name correspondence`,
# and this wrapper opened `Gate("correspondence")` too. Same path, two writers,
# last one wins. Reproduced with a five-finding stand-in:
#
#     inner alone            failures: 5  checks: 5
#     through run_gate.py    failures: 1  checks: 1
#     surviving fix command: False
#
# Every per-function finding was destroyed between being written and being
# uploaded, and gate_integrity enforces the wrapper, so the collision was
# required by the contract rather than accidental.
#
# WHY THE WRAPPER STILL WRITES. It wraps ten gates and eight of them --
# pyright, bandit, coverage, mutmut, spec-strength, spec-composition,
# honest-report, vacuity-check, counterexample-search -- run tools that write
# no report at all. If this simply stopped constructing a Gate, those eight
# would produce no evidence and the finalizer would block every one of them as
# MISSING. So the rule is one writer per path PER RUN, decided at runtime:
# adopt an inner report when there is one, be the sole writer when there is not.


def report_fingerprint(name: str) -> tuple[bool, float, int]:
    """(exists, mtime, size) for reports/<name>.json, taken before the run.

    Compared against the same triple afterwards. A clock floor was tried first
    and is wrong on a filesystem with one-second mtime granularity: a stale
    report written in the same second the wrapper starts is indistinguishable
    from one the wrapped process just wrote. Comparing the file against itself
    has no such window.
    """
    path = REPO / "reports" / f"{name}.json"
    try:
        st = path.stat()
    except OSError:
        return (False, 0.0, 0)
    return (True, st.st_mtime, st.st_size)


def adopt_inner_report(g: Gate, name: str,
                       before: tuple[bool, float, int]) -> int:
    """Fold a report the wrapped process wrote into `g`. Returns findings taken.

    Returns 0 when there is nothing to adopt, which is the common case and
    leaves this wrapper's behaviour exactly as it was.

    Two guards, both fail-safe in the direction of ignoring the file:

    `before` is the file's fingerprint taken before the wrapped command ran.
    An unchanged file was not written by this invocation -- it belongs to an
    earlier run of the same gate on the same runner, and merging it would let a
    previous PASS supply findings for a commit it never saw.

    Identity is then checked against the run the same way gate.py records it.
    A mismatch is recorded as a finding rather than silently dropped: evidence
    that does not belong to this run is itself a fact about this run.
    """
    path = REPO / "reports" / f"{name}.json"
    if report_fingerprint(name) == before:
        return 0  # nothing new was written; this wrapper is the sole writer
    try:
        inner = cast("dict[str, Any]",
                     json.loads(path.read_text(encoding="utf-8")))
    except (OSError, ValueError) as exc:
        # Unreadable is not fatal: this wrapper writes its own record anyway,
        # so the gate still reports. Say so rather than losing it quietly.
        g.warn(f"reports/{name}.json existed but could not be read ({exc}); "
               f"the wrapped verifier's own findings were not adopted")
        return 0

    for field, env in (("commit", "GITHUB_SHA"), ("run_id", "GITHUB_RUN_ID"),
                       ("run_attempt", "GITHUB_RUN_ATTEMPT")):
        expected = os.environ.get(env, "local")
        if str(inner.get(field, "")) != expected:
            g.fail(what=f"{name} wrote evidence belonging to another run",
                   where=f"reports/{name}.json",
                   why=f"{field}={inner.get(field)!r} but {env}={expected!r}",
                   requirement="Evidence must belong to the run that reads it.",
                   fix="This is an infrastructure fault, not a code defect; "
                       "re-run the job on a clean workspace.")
            return 0

    taken = 0
    for check in cast("list[Any]", inner.get("checks") or []):
        if isinstance(check, dict):
            g.checks.append(cast("dict[str, Any]", check))
    for failure in cast("list[Any]", inner.get("failures") or []):
        if isinstance(failure, dict):
            g.failures.append(cast("dict[str, Any]", failure))
            taken += 1
    for warning in cast("list[Any]", inner.get("warnings") or []):
        g.warnings.append(str(warning))
    return taken


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

        # Taken before the command runs so the report it may write can be told
        # apart from one left behind by an earlier run. See adopt_inner_report.
        before = report_fingerprint(ns.name)

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

        # Adopted before the verdict is recorded, so a verifier that owns a
        # Gate keeps every finding it wrote. The wrapper's exit code is still
        # what decides PASS/FAIL -- an inner report claiming PASS does not
        # survive a non-zero exit.
        adopted = adopt_inner_report(g, ns.name, before)

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
            if not per_test and not adopted:
                # Not a test-suite failure, and the wrapped verifier recorded
                # nothing itself -- or a shape the summary did not
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
