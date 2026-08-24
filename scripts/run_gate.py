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
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any, cast

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gate import REPORTS, SEVERITIES, Gate  # noqa: E402

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


def first_location(text: str) -> str:
    """The first `path:line` in tool output that names a file that exists.

    Existence is checked rather than assumed. This string becomes a GitHub
    annotation, and an annotation on a path that is not in the tree sends a
    reader somewhere there is nothing to read -- worse than giving no position
    at all. Returns "" when the output names no real file, and the caller then
    keeps its previous behaviour.
    """
    for match in _POSITION.finditer(text):
        candidate = repo_relative(match.group(1))
        if candidate is not None:
            return f"{candidate}:{match.group(2)}"
    return ""


def repo_relative(raw: str) -> str | None:
    """`raw` as a path relative to this repository, or None if it is not one.

    Every extractor below routes its path through here rather than trusting
    what a tool printed, for the same reason `first_location` always has: the
    string becomes a GitHub annotation, and an annotation on a path that is
    not in the tree sends a reader somewhere there is nothing to read.

    pyright prints absolute paths -- on a runner that is
    /home/runner/work/<repo>/<repo>/tests/x.py -- while bandit prints
    repository-relative ones. An annotation needs the relative form, so an
    absolute path under this repository is rebased and one outside it (a
    dependency in site-packages, say) is skipped: it is a real file, but not
    one the reader can open in this diff.

    Both sides are resolved. Resolving only the reported path makes the
    comparison fail wherever a symlink sits above the checkout -- on macOS
    /var is a link to /private/var, so an unresolved REPO never matches a
    resolved path and every absolute position was silently discarded.

    `removeprefix`, never `lstrip`. `lstrip` strips a character SET, so
    `".github/workflows/verify.yml".lstrip("./")` is
    `"github/workflows/verify.yml"` -- a path that does not exist, which this
    function would then reject while `_position` kept the mangled string in
    `where` and presented it as a location. Exactly the harm the paragraph
    above says this exists to prevent, for every dot-directory in the tree.
    """
    path = Path(raw)
    if path.is_absolute():
        try:
            candidate = str(path.resolve().relative_to(REPO.resolve()))
        except (ValueError, OSError):
            return None
    else:
        candidate = raw.removeprefix("./")
    return candidate if (REPO / candidate).is_file() else None


# Scope lines worth lifting out of gate stdout into structured evidence.
SCOPE_PATTERNS = [
    (re.compile(r"Total coverage:\s*([\d.]+%)"), "coverage"),
    (re.compile(r"(\d+)\s+errors?,\s+\d+\s+warnings?"), "type_errors"),
    (re.compile(r"mutation discrimination:\s*(\d+/\d+)"), "mutants_killed"),
    # Matches mutation_gate's current wording. The previous pattern
    # ("equivalent mutants:") stopped matching when that gate renamed the
    # concept, and a scope field silently stopped being populated — a dead
    # regex reports nothing rather than failing, so nothing noticed.
    (
        re.compile(r"indistinguishable on sample:\s*(\d+)"),
        "indistinguishable_on_sample",
    ),
    (re.compile(r"JOINT strength:\s*([\d.]+)"), "joint_strength"),
    (re.compile(r"bandit:\s*(\d+) findings"), "security_findings"),
    (re.compile(r"PASS \(with (\d+) verified exceptions\)"), "verified_exceptions"),
    (re.compile(r"^\s*(\d+) passed", re.MULTILINE), "tests_passed"),
    (re.compile(r"Sufficiency:\s+(\w+)"), "sufficiency"),
    (re.compile(r"(\d+)\s+proofs? verified"), "proofs_verified"),
    (re.compile(r"^✓ (\w+): verified", re.MULTILINE), "axle_verified"),
]


# ---------------------------------------------------------------------------
# FINDING EXTRACTION — N defects in, N findings out.
#
# THE DEFECT THIS REMOVES. A wrapped gate that failed recorded exactly ONE
# failure: `what="<gate> failed"`, `why=` the last six lines of output. Ten
# vacuous specs and one vacuous spec produced the same single record, so the
# finalizer could not say how much was wrong, could not annotate nine of the
# ten files, and could not tell a reader which defect to fix first. Only
# pytest escaped that, because `per_test_failures` was written for it.
#
# Measured over the eight gates run_gate.py wraps other than `coverage`:
# spec-strength, spec-composition, vacuity-check, counterexample-search,
# honest-report, pyright, bandit and mutmut. Every one of them prints its
# defects, one per line, and every one of them arrived in the report as a
# single record with the lines as prose.
#
# WHY EVERY EXTRACTOR RUNS ON EVERY GATE, rather than dispatching on --name.
# The `bandit` gate is one run_gate.py invocation over four different tools
# (security_gate.py, sarif_suppress.py, shellcheck, credential_scan.py), so a
# name-keyed table would have to know that, and would silently stop applying
# the day a gate is renamed -- the same failure mode as the dead SCOPE_PATTERN
# documented above. Extractors key on the SHAPE of a defect line instead, so
# they follow the tool rather than the job id.
#
# WHY A DEAD PATTERN HERE FAILS A TEST RATHER THAN REPORTING NOTHING. That is
# the whole risk of parsing prose, and it already happened once in this file.
# tests/test_run_gate_findings.py runs the REAL verifier, makes it emit a known
# number of defects, and asserts the extractor recovers that number. A renamed
# message turns a test red instead of quietly emptying the report.
#
# FAIL CLOSED. If nothing matches, `main` still records the single fallback
# record. A failure is never recorded as zero failures.
# ---------------------------------------------------------------------------

# The fields a report must match to belong to THIS run, and the variable each
# comes from. Same set ci/gates.toml declares as `run_identity` and
# aggregate_gates.rejection() enforces; kept here so `absorb` refuses foreign
# evidence for the same reason the finalizer does.
_RUN_IDENTITY = {
    "commit": "GITHUB_SHA",
    "run_id": "GITHUB_RUN_ID",
    "run_attempt": "GITHUB_RUN_ATTEMPT",
    "workflow": "GITHUB_WORKFLOW",
}

Finding = dict[str, Any]

_MUST_FIX_THE_CODE = "Read the captured output above; fix the code, not the gate."


def _position(raw: str, line: str, column: str = "") -> Finding:
    """The machine half of a location, for a path this repository really has.

    Returns the `file`/`line`/`column` trio plus the `where` string the report
    has always carried.

    A tool naming a file that is not in the tree gets NO machine position:
    those three fields drive GitHub annotations, and an annotation on a path
    the reader cannot open is worse than none.

    `where` keeps the line either way. It is free text by design -- gates use
    it for things that are not positions at all -- and dropping the line there
    made two defects at two lines of one unopenable file collide: `where` is
    two thirds of the basis `finding_id` is derived from, so they became a
    single finding and the count under-reported the work.
    """
    rel = repo_relative(raw)
    where = f"{raw}:{line}" if line else raw
    if rel is None:
        return {"where": where, "file": None, "line": None, "column": None}
    return {
        "where": f"{rel}:{line}" if line else rel,
        "file": rel,
        "line": int(line) if line else None,
        "column": int(column) if column else None,
    }


# --- pytest ---------------------------------------------------------------

_PYTEST_FAILED = re.compile(
    r"^(?:FAILED|ERROR)\s+(?P<file>[\w./-]+\.py)(?:::(?P<test>[\w\[\].:-]+))?"
    r"(?:\s+-\s+(?P<message>.*))?$",
    re.MULTILINE,
)


# --- pyright --------------------------------------------------------------
#
# Real output, captured from pyright 1.1.x:
#
#     /abs/path/bad.py:2:12 - error: Type "int" is not assignable to ...
#         "int" is not assignable to "str" (reportReturnType)
#
# The rule name is on the CONTINUATION line as often as it is on the first,
# which is why it is searched for separately instead of being pulled out of
# the message. No spaces in the path: the position pattern this file has
# always used cannot cross one, and a GitHub runner checks out to
# /home/runner/work/<repo>/<repo>, which has none.
_PYRIGHT = re.compile(
    r"^\s*(?P<path>/?[\w./-]+\.pyi?):(?P<line>\d+):(?P<col>\d+)"
    r"\s+-\s+(?P<severity>error|warning|information):\s+(?P<message>.*)$",
    re.MULTILINE,
)
_PYRIGHT_RULE = re.compile(r"\((report[A-Za-z]+)\)")

# --- shellcheck, `-f gcc` -------------------------------------------------
#
#     scripts/x.sh:3:6: warning: bar is referenced but not assigned. [SC2154]
#
# The workflow asks for `gcc` format for exactly this reason. shellcheck's
# default rendering is three lines per finding with a caret ruler, which is
# pleasant to read and cannot be turned into a location without reassembling
# state across lines. `gcc` is a format the tool itself guarantees.
_SHELLCHECK = re.compile(
    r"^(?P<path>[\w./-]+):(?P<line>\d+):(?P<col>\d+):\s+"
    r"(?P<severity>error|warning|note|style):\s+(?P<message>.*?)"
    r"\s*\[(?P<code>SC\d+)\]$",
    re.MULTILINE,
)

# --- scripts/security_gate.py --------------------------------------------
#
#     UNRESOLVED  B603 scripts/ci_metrics.py:43  subprocess_without_shell...
_SECURITY_UNRESOLVED = re.compile(
    r"^\s*UNRESOLVED\s+(?P<code>B\d+)\s+(?P<path>[\w./-]+):(?P<line>\d+)\s+"
    r"(?P<detail>.*)$",
    re.MULTILINE,
)

# --- scripts/credential_scan.py ------------------------------------------
#
#     CREDENTIAL SHAPE  github-pat  evidence.md:12  (93 chars, value withheld)
#
# The matched value is never printed by that scanner and is never reproduced
# here. The finding carries a label, a location and a length, because this
# report is a public artifact.
_CREDENTIAL = re.compile(
    r"^\s*CREDENTIAL SHAPE\s+(?P<label>\S+)\s+(?P<path>[\w./-]+):(?P<line>\d+)"
    r"\s+\((?P<length>\d+) chars",
    re.MULTILINE,
)

# --- scripts/enforce_spec.py ---------------------------------------------
#
#     ❌ Spec specs/add_spec.lean failed: Not vacuous
#
# Seven independent checks run per spec and every one that fails prints its
# own line, so one spec can legitimately produce several findings.
_ENFORCE_SPEC = re.compile(
    r"^❌ Spec (?P<path>\S+) failed: (?P<check>.+)$", re.MULTILINE
)

# --- the spec verifiers ---------------------------------------------------
#
#     ❌ specs/x_spec.lean: vacuous — precondition holds for 0.00% of inputs
#     ❌ specs/x_spec.lean: COUNTEREXAMPLE — the spec is false of src/x.py
#     ❌ specs/x_spec.lean: unparsable — ...
#     ❌ specs/x_spec.lean: unresolvable
#
# check_vacuity.py, find_counterexample.py and check_composition.py all print
# this shape, which is why one extractor covers three gates. Disjoint from
# _ENFORCE_SPEC: `Spec` is followed by a space, never a colon.
_SPEC_REJECTION = re.compile(r"^❌ (?P<path>[^\s:]+): (?P<reason>.+)$", re.MULTILINE)

# --- scripts/mutation_gate.py and scripts/check_composition.py ------------
#
#     survivors: mutant_a, mutant_b
#     survives the whole set: mutant_a, mutant_b
#
# A surviving mutant is a defect in the SPEC SET, not in a file, so these
# findings carry no position -- there is nothing to annotate. They are still
# one finding each: "three mutants survived" and "one mutant survived" are
# different amounts of work.
_SURVIVORS = re.compile(
    r"^\s*(?:survivors|survives the whole set):\s*(?P<names>.+)$", re.MULTILINE
)
_ZERO_DENOMINATOR = re.compile(r"^\s*ZERO DENOMINATOR — (?P<reason>.+)$", re.MULTILINE)

# --- scripts/honest_report.py --------------------------------------------
#
#     Truth:                    FAIL
#     Formal proof:             UNVERIFIED  (120ms)
#
# `Overall:` is excluded by the lookahead, deliberately. honest_report.py
# DEFINES it as a function of the dimensions above it --
# `blocking_ok = truth and vacuity and proof and mutation` -- so recording it
# too would count one defect twice and inflate every failing run of this gate
# by exactly one.
_DIMENSION = re.compile(
    r"^ {2}(?!Overall\b)(?P<dimension>[A-Z][A-Za-z ]+?):\s{2,}"
    r"(?P<verdict>FAIL|UNVERIFIED|REJECTED|MISSING|NOT_ESTABLISHED)\b",
    re.MULTILINE,
)


def per_test_failures(text: str) -> list[Finding]:
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
    out: list[Finding] = []
    for match in _PYTEST_FAILED.finditer(text):
        path = match.group("file")
        if repo_relative(path) is None:
            # pytest prints repository-relative paths. Anything else is not a
            # test in this tree, and a location that cannot be opened is worse
            # than none -- same rule the annotator applies.
            continue
        test = match.group("test") or "(collection)"
        node = path + (f"::{test}" if test != "(collection)" else "")
        out.append(
            {
                "_at": match.start(),
                "what": f"{test} failed",
                **_position(path, ""),
                "why": (match.group("message") or "").strip()
                or "see the captured output above",
                "requirement": "Every test in this suite must pass.",
                "fix": f"Reproduce with: pytest {node}",
                "code": None,
                "reproduction": f"pytest {node}",
            }
        )
    return out


def _continuation(text: str, start: int) -> str:
    """The wrapped remainder of the pyright diagnostic ending at `start`.

    pyright indents a diagnostic by two spaces and its continuation lines by
    four, and it puts the rule name at the very end -- so for any message long
    enough to wrap, the rule is not on the line that carries the position.

    Stops at the next diagnostic and at the first line that is not indented as
    a continuation. Without that a diagnostic with no rule name would borrow
    the NEXT one's, which is a false attribution in a field a reader searches
    documentation with.
    """
    out: list[str] = []
    for line in text[start:].splitlines()[1:]:
        if not line.startswith("    ") or _PYRIGHT.match(line):
            break
        out.append(line)
    return "\n".join(out)


def pyright_diagnostics(text: str) -> list[Finding]:
    """One finding per type error, carrying pyright's own rule name.

    The rule name is what makes a type error searchable -- `reportReturnType`
    finds the documentation, `Type "int" is not assignable ...` finds nothing --
    and it was previously discarded along with everything else that was not in
    the last six lines.
    """
    out: list[Finding] = []
    for match in _PYRIGHT.finditer(text):
        severity = match.group("severity")
        if severity == "information":
            # pyright reports these alongside errors and they do not fail the
            # run. Recording one as a merge-blocking finding would be false.
            continue
        message = match.group("message").strip()
        # The rule name sits on the message line OR on the indented
        # continuation beneath it, depending on how long the message is.
        rule = _PYRIGHT_RULE.search(message) or _PYRIGHT_RULE.search(
            _continuation(text, match.end())
        )
        out.append(
            {
                "_at": match.start(),
                "what": message[:160],
                **_position(
                    match.group("path"), match.group("line"), match.group("col")
                ),
                "why": f"pyright reports this as an {severity}.",
                "requirement": "This repository type-checks with zero pyright errors.",
                "fix": "Annotate or narrow the value pyright could not resolve.",
                "severity": "ERROR" if severity == "error" else "WARNING",
                "code": rule.group(1) if rule else None,
                "reproduction": f"pyright {repo_relative(match.group('path')) or ''}".strip(),
            }
        )
    return out


def shellcheck_diagnostics(text: str) -> list[Finding]:
    """One finding per shell defect, carrying its SC code.

    SC codes are the searchable half: every one has a wiki page keyed on
    exactly that string.
    """
    out: list[Finding] = []
    for match in _SHELLCHECK.finditer(text):
        severity = match.group("severity")
        rel = repo_relative(match.group("path"))
        out.append(
            {
                "_at": match.start(),
                "what": match.group("message").strip()[:160],
                **_position(
                    match.group("path"), match.group("line"), match.group("col")
                ),
                "why": f"shellcheck reports {match.group('code')} as a {severity}.",
                "requirement": "Shell in this repository passes shellcheck clean.",
                "fix": f"See https://www.shellcheck.net/wiki/{match.group('code')}",
                "severity": "ERROR" if severity == "error" else "WARNING",
                "code": match.group("code"),
                "reproduction": f"shellcheck -f gcc {rel}" if rel else None,
            }
        )
    return out


def security_findings(text: str) -> list[Finding]:
    """One finding per bandit result the security gate could not clear.

    The gate's own adjudication is the interesting part and it is already in
    the line: a finding is UNRESOLVED because no verified safe pattern covers
    it, or because a pattern that used to hold no longer does. Both reasons
    are carried through rather than flattened into "bandit failed".

    bandit's `issue_text` is deliberately NOT read here. For B105 that text IS
    the candidate credential, and this report is a public artifact -- the same
    reason security_gate.py prints the rule id and location instead.
    """
    out: list[Finding] = []
    for match in _SECURITY_UNRESOLVED.finditer(text):
        rel = repo_relative(match.group("path"))
        out.append(
            {
                "_at": match.start(),
                "what": f"{match.group('code')} not covered by a verified safe pattern",
                **_position(match.group("path"), match.group("line")),
                "why": match.group("detail").strip()[:300],
                "requirement": "Every bandit finding is fixed or covered by a "
                "pattern security_gate.py re-derives from the AST.",
                "fix": "Fix the code, or extend the verified pattern in "
                "scripts/security_gate.py so the exemption stays proven.",
                "code": match.group("code"),
                "reproduction": f"python3 scripts/security_gate.py {rel}"
                if rel
                else "python3 scripts/security_gate.py src scripts",
            }
        )
    return out


def credential_findings(text: str) -> list[Finding]:
    """One finding per credential-shaped match in tracked content.

    Label, location and length only. The value is not in the scanner's output
    and is not reconstructed here: a push publishes tracked content, and this
    report is published with it.
    """
    out: list[Finding] = []
    for match in _CREDENTIAL.finditer(text):
        out.append(
            {
                "_at": match.start(),
                "what": f"credential shape {match.group('label')} in tracked content",
                **_position(match.group("path"), match.group("line")),
                "why": f"{match.group('length')} characters matching "
                f"{match.group('label')}; the value is withheld.",
                "requirement": "No credential material in tracked content.",
                "fix": "Remove the value AND rotate the credential: a prefix on a "
                "public branch is disclosed the moment it is fetched, and "
                "deleting it later does not recall it.",
                "severity": "CRITICAL",
                "code": match.group("label"),
                "reproduction": "python3 scripts/credential_scan.py",
            }
        )
    return out


def spec_rejections(text: str) -> list[Finding]:
    """One finding per spec a verifier rejected, and per check it failed.

    Covers four verifiers because they print one shape: check_vacuity.py,
    find_counterexample.py and check_composition.py emit
    `❌ <spec>: <reason>`, and enforce_spec.py emits
    `❌ Spec <spec> failed: <check>` once per failing check, so a single spec
    that breaks three of the seven syntactic rules is three findings.
    """
    out: list[Finding] = []
    for match in _ENFORCE_SPEC.finditer(text):
        rel = repo_relative(match.group("path"))
        out.append(
            {
                "_at": match.start(),
                "what": f"{Path(match.group('path')).name}: {match.group('check')}",
                **_position(match.group("path"), ""),
                "why": f"enforce_spec.py check {match.group('check')!r} did not hold.",
                "requirement": "A spec must make a non-trivial claim about the "
                "function it names.",
                "fix": "Strengthen the theorem statement; a spec that states "
                "nothing proves nothing.",
                "code": match.group("check"),
                "reproduction": f"python3 scripts/enforce_spec.py {rel}"
                if rel
                else None,
            }
        )
    for match in _SPEC_REJECTION.finditer(text):
        path, reason = match.group("path"), match.group("reason").strip()
        rel = repo_relative(path)
        verdict = reason.split("—")[0].strip().rstrip(":").lower()
        out.append(
            {
                "_at": match.start(),
                "what": f"{Path(path).name}: {verdict}"[:160],
                **_position(path, ""),
                "why": reason[:300],
                "requirement": "Every spec must be parseable, resolvable, true of "
                "its source and non-vacuous.",
                "fix": _MUST_FIX_THE_CODE,
                "code": verdict.split()[0].upper() if verdict else None,
                "reproduction": f"python3 scripts/find_counterexample.py {rel}"
                if rel
                else None,
            }
        )
    return out


def surviving_mutants(text: str) -> list[Finding]:
    """One finding per mutant the spec set failed to kill.

    A survivor is a defect in the SPECS, not in a file, so these carry no
    position: there is nothing for an annotation to point at. They are still
    counted individually, because three survivors and one survivor are
    different amounts of work and the single record made them identical.
    """
    out: list[Finding] = []
    for match in _SURVIVORS.finditer(text):
        for name in (n.strip() for n in match.group("names").split(",")):
            if not name:
                continue
            out.append(
                {
                    "_at": match.start(),
                    "what": f"mutant {name} survives the spec set",
                    "where": "specs/",
                    "why": "The specs hold for a mutated implementation, so they "
                    "do not discriminate it from the real one.",
                    "requirement": "The spec set must kill every non-equivalent "
                    "mutant.",
                    "fix": f"Add a spec that is false of the {name} mutation.",
                    "code": name,
                    "reproduction": "python3 scripts/mutation_gate.py "
                    "specs/*_spec.lean --min-score 0.95",
                }
            )
    for match in _ZERO_DENOMINATOR.finditer(text):
        out.append(
            {
                "_at": match.start(),
                "what": "zero denominator: the spec set killed nothing",
                "where": "specs/",
                "why": match.group("reason").strip()[:300],
                "requirement": "A mutation score needs a non-empty denominator; "
                "a spec that killed nothing scored nothing.",
                "fix": "Write a spec that the mutations can violate.",
                "severity": "CRITICAL",
                "code": "ZERO_DENOMINATOR",
                "reproduction": "python3 scripts/mutation_gate.py "
                "specs/*_spec.lean --min-score 0.95",
            }
        )
    return out


def failed_dimensions(text: str) -> list[Finding]:
    """One finding per honest-report dimension that did not hold.

    The gate prints ten dimensions and never collapses them, which is the
    point of the layer -- TRUE != USEFUL != SUFFICIENT != VERIFIED. Recording
    the run as one failure collapsed exactly what the gate refuses to collapse.
    """
    return [
        {
            "_at": match.start(),
            "what": f"{match.group('dimension').strip()} is {match.group('verdict')}",
            "where": "specs/",
            "why": f"honest_report.py reports {match.group('dimension').strip()!r} "
            f"as {match.group('verdict')}.",
            "requirement": "Every blocking dimension of the honest report must "
            "hold: truth, vacuity, formal proof and mutation "
            "discrimination.",
            "fix": _MUST_FIX_THE_CODE,
            "code": match.group("verdict"),
            "reproduction": "bash scripts/verify_per_function.sh "
            "scripts/honest_report.py --min-strength 0.9",
        }
        for match in _DIMENSION.finditer(text)
    ]


# Order is the order findings appear in the report, so the tool-specific
# extractors come before the generic ones.
EXTRACTORS: list[Callable[[str], list[Finding]]] = [
    per_test_failures,
    pyright_diagnostics,
    shellcheck_diagnostics,
    security_findings,
    credential_findings,
    spec_rejections,
    surviving_mutants,
    failed_dimensions,
]


# ---------------------------------------------------------------------------
# WHAT THE GATE NEVER GOT TO CHECK.
#
# Three gates wrap a CHAIN of verifications in one invocation, under `set -e`:
#
#   bandit          security_gate.py, sarif_suppress.py, shellcheck,
#                   credential_scan.py           (4 steps)
#   correspondence  correspondence_gate.py, pytest -m axle        (2 steps)
#   spec-composition / honest-report / mutmut
#                   verify_per_function.sh, one verifier call per source file
#
# `set -e` stops the chain at the first non-zero exit, which is what makes the
# gate's verdict the chain's verdict -- and also means every later step NEVER
# RAN. The report said nothing about them. A reader saw three findings from
# step 1 and had no way to tell that steps 2, 3 and 4 were unexamined, so the
# gate read as "three problems" when the truth was "three problems and three
# unknowns".
#
# That is the same distinction this repository draws everywhere else and had
# not drawn here: could not check is not checked and fine. registry_gate.py
# says it, check_ruleset.py says it, aggregate_gates.py turns a missing report
# into a blocking UNKNOWN for exactly this reason.
#
# It also silently rewarded stopping early. Findings are counted across runs,
# and a chain that died at step 1 with three findings looked BETTER than one
# that ran all four and found four -- when the first checked less.
#
# NO LABEL IS INVENTED FOR A STEP THAT DID NOT RUN. Its `echo` never executed,
# so its name was never printed, and the only place that name exists is
# .github/workflows/verify.yml. Reading the workflow from inside the gate
# would put a second copy of the step names here, which is the duplicate
# declaration ci/gates.toml exists to prevent -- and a stale copy would name
# the wrong step, which is worse than naming none. The index, the total and
# the step that stopped the chain are all recorded, and all three are true.
# ---------------------------------------------------------------------------

# `== bandit gate 3/4: shell analysis`, written to stderr by the workflow.
_CHAIN_STEP = re.compile(
    r"^==\s+.*?\bgate\s+(?P<index>\d+)/(?P<total>\d+):\s*(?P<label>.+?)\s*$",
    re.MULTILINE,
)

# scripts/verify_per_function.sh announces the size of its loop, then names
# each source file as it reaches it.
_LOOP_TOTAL = re.compile(r"^verifying (?P<total>\d+) source file\(s\)$", re.MULTILINE)
_LOOP_STEP = re.compile(r"^──\s+(?P<source>\S+)\s+←", re.MULTILINE)


def unreached(stdout: str, stderr: str) -> list[Finding]:
    """One finding per verification the chain never reached.

    `is_root_cause` is False and `dependent_on` is filled in by the caller,
    which is the only place the root's id is known. Severity is UNKNOWN
    because nothing was found wrong here -- nothing was looked at. UNKNOWN is
    already this file's word for "outcome could not be determined", and
    calling it an ERROR would assert a defect that was never observed.

    EACH DETECTOR READS ONLY THE STREAM ITS MARKERS ARE WRITTEN TO, and that
    is a correctness requirement rather than tidiness. Both patterns match
    plain text at column 0, so run against the combined capture they fire on
    any gate whose output happens to CONTAIN a marker -- and this repository
    contains those exact strings at column 0 in
    tests/test_within_gate_dependency.py. A pytest failure that echoed that
    file would fabricate NOT_RUN findings for a gate that has no chain at all.
    Measured before the split: a pyright capture with one echoed loop line
    produced 4 fabricated findings.

    The split is not a guess about where output goes. verify.yml writes every
    `== <gate> N/M:` marker with `>&2`, deliberately, so that concatenating
    stderr after stdout puts the last marker at the end of the capture. And
    verify_per_function.sh writes both of its markers with a plain `echo`, to
    stdout. Tests assert both of those, so a change to either stream fails
    loudly instead of silently reverting this.
    """
    out: list[Finding] = []

    steps = list(_CHAIN_STEP.finditer(stderr))
    if steps:
        last = steps[-1]
        total, reached = int(last.group("total")), int(last.group("index"))
        for index in range(reached + 1, total + 1):
            out.append(
                {
                    "what": f"verification {index} of {total} did not run",
                    "where": f"step {index}/{total}",
                    "why": f"the chain stopped at step {reached}/{total} "
                    f"({last.group('label')}), which failed under `set -e`.",
                    "requirement": "Every verification in this gate must run "
                    "before the gate's verdict means anything.",
                    "fix": "Fix the failure above; the remaining checks run once "
                    "the chain gets past it.",
                    "severity": "UNKNOWN",
                    "code": "NOT_RUN",
                    "is_root_cause": False,
                    # `why` is what happened. This is the mechanism, and they are
                    # not the same sentence: the chain is `bash -c` under `set -e`,
                    # so a non-zero exit ends the script and every later command is
                    # simply never executed. Nothing decided to skip this check.
                    "root_cause": "`set -e` ends the chain at the first non-zero "
                    "exit, so this command was never executed.",
                    # Fixing the root makes this disappear on its own. Counting it
                    # as blocking would tell a reader there is separate work here.
                    "merge_blocking": False,
                }
            )

    loop = _LOOP_TOTAL.search(stdout)
    if loop is not None:
        total = int(loop.group("total"))
        reached = _LOOP_STEP.findall(stdout)
        for source in range(len(reached), total):
            out.append(
                {
                    "what": f"source file {source + 1} of {total} was not verified",
                    "where": f"source {source + 1}/{total}",
                    "why": f"verify_per_function.sh stopped at "
                    f"{reached[-1] if reached else 'the first source'}, "
                    f"so {total - len(reached)} of {total} source file(s) "
                    f"were never checked.",
                    "requirement": "This gate's verdict covers every source file "
                    "the specs resolve to, or it covers none.",
                    "fix": "Fix the failing function above; the loop continues "
                    "past it once it exits 0.",
                    "severity": "UNKNOWN",
                    "code": "NOT_RUN",
                    "is_root_cause": False,
                    "root_cause": "verify_per_function.sh runs under `set -e`, so "
                    "the first source file that fails ends the loop "
                    "and the rest are never reached.",
                    "merge_blocking": False,
                }
            )
    return out


def extract_findings(text: str) -> list[Finding]:
    """Every defect the captured output names, one record each.

    Deduplicated on (what, where), which is two thirds of the basis gate.py
    derives `finding_id` from: two extractors that recognise the same line
    must not turn one defect into two, because a reader comparing runs counts
    findings.

    ORDERED BY POSITION IN THE OUTPUT, not by position in EXTRACTORS. `main`
    takes findings[0] as the root cause every skipped verification is recorded
    against, and describes it as "the first defect the chain hit" -- which was
    false while this returned extractor order. With two extractors matching one
    capture, the root was whichever of them happened to sit earlier in the
    list, and every consequence inherited that mis-attribution. Each extractor
    records `_at`, the offset of its match, and it is stripped here so it never
    reaches Gate.fail.

    Sorting is stable, so findings that share an offset keep extractor order,
    and findings from one extractor stay in the order the tool printed them.
    """
    out: list[Finding] = []
    seen: set[tuple[str, str]] = set()
    for extractor in EXTRACTORS:
        for finding in extractor(text):
            key = (str(finding.get("what", "")), str(finding.get("where", "")))
            if key in seen:
                continue
            seen.add(key)
            out.append(finding)
    out.sort(key=lambda f: cast("int", f.get("_at", 0)))
    for finding in out:
        finding.pop("_at", None)
    return out


# ---------------------------------------------------------------------------
# EVIDENCE A WRAPPED VERIFIER ALREADY WROTE
#
# THE DEFECT THIS REMOVES. Six verifications run as bare steps inside a job
# whose report is written by a DIFFERENT script:
#
#   preflight       tcb_gate.py, check_ruleset.py, registry_gate.py
#                   ... then gate_integrity.py, which writes preflight.json
#   axle-verify     axle_health.py, enforce_spec.py
#                   ... then axle_gate.py, which writes axle-verify.json
#   correspondence  axle_health.py
#
# The ordering is deliberate and fail-closed: the report writer runs LAST, so a
# failure in any earlier step means no report exists at all, and
# aggregate_gates.py turns that absence into a blocking UNKNOWN. Merge stays
# blocked. What is missing is not the verdict -- it is every detail of it. The
# finalizer can only say "no evidence was produced for this gate", never which
# trusted path drifted or which spec broke which rule. That detail exists only
# in the job log, which is the thing this whole effort removes.
#
# Wrapping the chain in run_gate.py is how bandit and correspondence already
# solve this. The obstacle was that the report writer inside the chain owns the
# same reports/<name>.json the wrapper is about to write, so the wrapper simply
# overwrote it. MEASURED: reports/preflight.json carries 84 structured checks;
# a wrapper report carries one. Overwriting trades 84 checks for N findings,
# which is a net loss of evidence and not a fix.
#
# So the wrapper MERGES. The inner script's `checks` and `scope` are folded in;
# the wrapper's STATUS wins, because the chain's exit code is the verdict and
# the inner script only ever saw its own step. An inner report saying PASS from
# step 4 of 5 must never survive a chain that failed at step 5.
# ---------------------------------------------------------------------------


def absorb(g: Gate, name: str, not_before: float) -> None:
    """Fold a report the wrapped command wrote into this gate's own.

    `not_before` is the wall time the wrapped command started. A report older
    than that is from a PREVIOUS run -- a re-run against a warm working tree,
    or a checkout that never cleaned reports/ -- and folding it would publish
    last run's checks as evidence for this one. That is the exact class of lie
    aggregate_gates.py rejects with its identity fields, and it is refused
    here for the same reason rather than trusted because the file happens to
    be on disk.

    Never raises. This runs inside a gate that has already decided its verdict,
    and a reporting bug must not be able to change one. Every refusal is
    recorded as a warning instead, because a merge that silently did nothing
    looks exactly like a merge that had nothing to do.
    """
    path = REPORTS / f"{name}.json"
    try:
        if not path.is_file():
            # The normal case: most gates wrap a command that writes no report.
            return
        if path.stat().st_mtime < not_before:
            # NAMED, not silent -- the docstring above promises it and this
            # path was the one place that broke the promise. If the guard ever
            # fires correctly the report drops from 87 checks to 1, and with
            # nothing saying why that is indistinguishable from a gate that
            # wrapped a command writing no report at all.
            g.warn(
                f"{path} predates this run's command and was not folded in; "
                f"it is evidence for an earlier run"
            )
            return
        raw: object = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        g.warn(f"could not read the report {name} wrote for itself: {exc}")
        return

    if not isinstance(raw, dict):
        g.warn(f"the report {name} wrote for itself is not a JSON object")
        return
    data = cast("dict[str, Any]", raw)

    # IDENTITY, NOT ONLY FRESHNESS. mtime answers "was this written recently";
    # it does not answer "was this written by THIS run". Any mechanism that
    # preserves or advances a timestamp -- an archive extraction, a warm
    # self-hosted workspace, a clock that stepped forward -- defeats a
    # freshness test alone, and the fields that settle it are already in the
    # file. Same comparison aggregate_gates.rejection() makes, for the same
    # reason: a report that cannot be shown to belong to this run is not
    # evidence for it.
    for field, var in _RUN_IDENTITY.items():
        want = os.environ.get(var)
        if want is None:
            # Outside CI there is nothing to compare against, and refusing
            # every local run would make the wrapper untestable by hand.
            continue
        found_value = str(data.get(field, ""))
        if found_value != want:
            g.warn(
                f"{path} carries {field}={found_value!r} but this run is "
                f"{want!r}; not folded in"
            )
            return

    claimed = str(data.get("gate", ""))
    if claimed != name:
        # A report claiming another gate is evidence for that gate, not this
        # one. Folding it would let one gate's checks stand in for another's.
        g.warn(
            f"a report claiming gate {claimed!r} was left in {path}; "
            f"not folded into {name}"
        )
        return

    checks = data.get("checks")
    if isinstance(checks, list):
        for entry in cast("list[Any]", checks):
            if not isinstance(entry, dict):
                continue
            item = cast("dict[str, Any]", entry)
            g.check(
                str(item.get("subject", "")),
                str(item.get("result", "")) == "PASS",
                str(item.get("detail", "")),
            )

    scope = data.get("scope")
    if isinstance(scope, dict):
        # `command` is the wrapper's own and describes the whole chain; the
        # inner value names one step of it and would be the more specific
        # answer to a less useful question.
        inner = {
            k: v for k, v in cast("dict[str, Any]", scope).items() if k != "command"
        }
        if inner:
            g.set_scope(**inner)

    # THE FINDINGS, WHICH ARE THE WHOLE POINT. Folding checks and scope while
    # dropping `failures` loses exactly what this change exists to keep: when
    # the inner writer is the step that FAILS, its findings are the routable
    # ones. Measured before this: gate_integrity failing on a missing
    # must_contain token produced two findings with a file, a requirement and
    # a fix each; wrapped, they became ONE fallback record whose `where` was
    # the multi-line bash script and whose `why` was the inner gate's own
    # [GATE END] banner -- the six-line tail of a nested Gate is always its
    # end banner. blocker_report could place no annotation on either.
    #
    # Re-emitted through `fail` rather than appended, so every finding in the
    # merged report is derived by one code path and `finding_id` is rederived
    # against THIS gate's name.
    for entry in cast("list[Any]", data.get("failures", []) or []):
        if not isinstance(entry, dict):
            continue
        found = cast("dict[str, Any]", entry)
        severity = str(found.get("severity") or "ERROR")
        g.fail(
            what=str(found.get("what", "")),
            where=str(found.get("where", "")),
            why=str(found.get("why", "")),
            requirement=str(found.get("requirement", "")),
            fix=str(found.get("how_to_fix", "")),
            severity=severity if severity in SEVERITIES else "ERROR",
            code=cast("str | None", found.get("code")),
            file=cast("str | None", found.get("file")),
            line=cast("int | None", found.get("line")),
            column=cast("int | None", found.get("column")),
            root_cause=cast("str | None", found.get("root_cause")),
            reproduction=cast("str | None", found.get("reproduction_command")),
            is_root_cause=bool(found.get("is_root_cause", True)),
            dependent_on=cast("str | None", found.get("dependent_on")),
            merge_blocking=bool(found.get("merge_blocking", True)),
        )

    # The version belongs to the gate, not to the wrapper. gate_integrity.py
    # and axle_gate.py both declare 2.0.0; run_gate's --version defaults to
    # 1.0.0, so wrapping silently regressed the field for both. Adopting the
    # inner value keeps ONE declaration of it, in the script that owns the
    # gate, rather than a second copy in the workflow that can drift.
    inner_version = data.get("gate_version")
    if isinstance(inner_version, str) and inner_version:
        g.version = inner_version

    for recorded in cast("list[Any]", data.get("warnings", []) or []):
        g.warn(str(recorded))


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--name", required=True, help="gate name; becomes reports/<name>.json"
    )
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

        # Taken BEFORE the command runs, so `absorb` can tell a report this
        # command wrote from one a previous run left behind. Read after the
        # fact it would be later than the file it is meant to judge.
        started = time.time()
        try:
            # shell=False, absolute executable, fixed argv from this repo's
            # workflows - never a shell string.
            out = subprocess.run(
                [resolved, *cmd[1:]], capture_output=True, text=True, timeout=ns.timeout
            )
        except subprocess.TimeoutExpired:
            g.infrastructure_failure(f"timed out after {ns.timeout}s")
            return

        # Before the verdict is recorded, so a chain whose own report writer
        # ran keeps that writer's checks. The status is decided below from the
        # exit code and is never taken from the absorbed report.
        absorb(g, ns.name, started)

        # THE JOIN IS NOT COSMETIC. These are two separately captured streams,
        # and a tool whose last stdout line has no trailing newline glues that
        # line onto the first line of stderr. Every pattern here is anchored
        # with `^` under re.MULTILINE, so a glued first stderr line stops
        # matching -- and the chain markers are written to stderr, first one
        # first. When a chain stops at step 1 there IS only one marker, it is
        # the glued one, and `unreached` would report that nothing was skipped
        # for the case where three quarters of the gate never ran. Measured:
        # glued -> 0 steps, 0 unreached; separated -> 1 step, 3 unreached.
        gap = "" if (not out.stdout or out.stdout.endswith("\n")) else "\n"
        combined = out.stdout + gap + out.stderr
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
            #
            # ONE RECORD PER DEFECT, not one per run. Every tool wrapped here
            # prints its defects one per line; the report used to keep only
            # the last six lines of that as prose, so ten vacuous specs and
            # one vacuous spec were the same single record. See EXTRACTORS.
            findings = extract_findings(combined)
            for finding in findings:
                g.fail(**finding)
            if not findings:
                # A shape no extractor recognised -- a crash before any defect
                # was printed, a threshold miss with no per-item output, a
                # tool this repository does not wrap. The single record is
                # kept for those, so a failure is never recorded as zero
                # failures. Falls back to the command when the output names no
                # real file, so a gate whose failure has no position is
                # unchanged.
                fallback: Finding = {
                    "what": f"{ns.name} failed",
                    "where": first_location(combined) or " ".join(cmd[:3]),
                    "why": "\n".join(tail)[:500],
                    "requirement": "This gate is required by the ruleset; "
                    "it must exit 0.",
                    "fix": "Read reports/ and the log above; fix the code, "
                    "not the gate.",
                    "reproduction": " ".join(cmd),
                }
                findings = [fallback]
                g.fail(**fallback)

            # THE ROOT IS THE FIRST DEFECT THE CHAIN HIT, and every
            # verification after it is a consequence rather than an
            # independent problem. Across gates this repository states the
            # opposite and proves it -- no gate job declares `needs:` on
            # another, so five red gates are five problems. Inside one gate
            # the topology is `set -e`, which IS a dependency, and recording
            # an unrun step as a further defect would overstate the work by
            # however many steps were left.
            #
            # Computed after the fallback rather than inside the `if`, because
            # the case where no extractor recognised the failure is exactly
            # the case where the rest of the chain still did not run.
            root = findings[0]
            root_id = g.finding_id_for(
                str(root.get("what", "")), str(root.get("where", ""))
            )
            for consequence in unreached(out.stdout, out.stderr):
                g.fail(**consequence, dependent_on=root_id)
        g.artifact(f"reports/{ns.name}.json")


if __name__ == "__main__":
    main()
