"""ADVERSARIAL TESTS for scripts/ci_findings.py.

WHAT THIS MODULE IS FOR, AND WHY THE EXISTING MACHINERY IS NOT ENOUGH.

`gh-annotate.mjs` turns tool output into `::error file=F,line=L` commands. Every
guard around it measures the EMITTING side: how many workflow commands were
written to stdout. GitHub decides which of them LAND -- it resolves `file=`
against the commit being annotated and silently discards anything it cannot
find. A run can therefore emit forty annotations, land none, and report itself
healthy, because the number the emitter counted went up.

This module closes that gap by reading back what GitHub ACCEPTED and comparing
it against what actually failed. Two pure functions carry the weight and are
tested here without a network:

  parse_log   raw Actions log text  -> findings, with the step each came from
  reconcile   jobs + landed annotations -> the failures nobody can locate

Every test below is a way for a real failure to become invisible.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

from ci_findings import (  # noqa: E402 - the sys.path insert above must run first
    Finding,
    Problem,
    parse_log,
    reconcile,
    to_jsonl,
)

# A downloaded Actions log: every line carries an ISO timestamp prefix, groups
# delimit steps, and `##[error]` is what the runner emits for a failure.
LOG = (
    "2026-08-24T10:00:00.1234567Z ##[group]Run npm run typecheck\n"
    "2026-08-24T10:00:01.1234567Z src/canvas/spec/figure.ts(12,5): error TS2345: bad arg\n"
    "2026-08-24T10:00:02.1234567Z ##[error]Process completed with exit code 2.\n"
    "2026-08-24T10:00:03.1234567Z ##[endgroup]\n"
    "2026-08-24T10:00:04.1234567Z ##[group]Run npm test\n"
    "2026-08-24T10:00:05.1234567Z ##[error]frontend/src/canvas/layout/layout.ts:88:3: "
    "AssertionError: overlapping blocks\n"
    "2026-08-24T10:00:06.1234567Z ##[endgroup]\n"
)


def test_parse_log_strips_timestamps_and_keeps_the_message() -> None:
    """A timestamp on the front of every line is why grepping logs is misery."""
    findings = parse_log(LOG)
    assert findings, "no findings parsed from a log containing two ##[error] lines"
    for f in findings:
        assert not f.message.startswith("2026-"), (
            f"timestamp leaked into the message: {f.message!r}"
        )


def test_parse_log_attributes_each_finding_to_its_step() -> None:
    """WITHOUT THE STEP, A FINDING CANNOT BE ROUTED TO A GATE.

    The whole point of machine-readable findings is that software can answer
    "which step failed and where". A flat list of error strings cannot.
    """
    findings = parse_log(LOG)
    steps = {f.step for f in findings}
    assert "Run npm run typecheck" in steps
    assert "Run npm test" in steps


def test_parse_log_recovers_file_and_line_from_a_tsc_message() -> None:
    """`file(line,col)` is the shape tsc uses and the shape humans click."""
    hit = next(f for f in parse_log(LOG) if "TS2345" in f.message)
    assert hit.file == "src/canvas/spec/figure.ts"
    assert hit.line == 12
    assert hit.col == 5


def test_parse_log_recovers_file_and_line_from_a_colon_message() -> None:
    hit = next(f for f in parse_log(LOG) if "overlapping blocks" in f.message)
    assert hit.file == "frontend/src/canvas/layout/layout.ts"
    assert hit.line == 88


def test_parse_log_marks_a_locationless_error_rather_than_dropping_it() -> None:
    """ "Process completed with exit code 2" has no file, and must still appear.

    Dropping it would make the findings file disagree with the log about how
    many things went wrong, and a reader who trusts the file would conclude the
    run was cleaner than it was.
    """
    findings = parse_log(LOG)
    bare = [f for f in findings if f.file is None]
    assert bare, "the locationless error was dropped instead of recorded"
    assert any("exit code 2" in f.message for f in bare)


def test_to_jsonl_is_one_object_per_line_and_parses() -> None:
    import json

    text = to_jsonl(parse_log(LOG))
    lines = [ln for ln in text.splitlines() if ln.strip()]
    assert len(lines) == len(parse_log(LOG))
    for line in lines:
        json.loads(line)  # raises if this is not machine-readable


# --- reconcile ---------------------------------------------------------------

FAILED_JOB = [
    {
        "name": "frontend",
        "conclusion": "failure",
        "steps": [
            {"name": "Typecheck", "conclusion": "failure"},
            {"name": "Build", "conclusion": "success"},
        ],
    }
]


def test_reconcile_flags_a_failed_job_with_no_annotations() -> None:
    """RED BUILD, ZERO LOCATIONS -- the state the annotator exists to prevent.

    This is the outcome of a parser that did not recognise its input, a mode
    typo, or a tool whose output nothing converts. The job is red and there is
    nothing to click anywhere on the run.
    """
    problems = reconcile(FAILED_JOB, annotations=[], path_exists=lambda p: True)
    assert any(p.kind == "job-failed-with-no-annotations" for p in problems), problems


def test_reconcile_flags_an_annotation_whose_path_does_not_exist() -> None:
    """THE SILENT DROP, WHICH IS THE ENTIRE REASON THIS FUNCTION EXISTS.

    GitHub discards an annotation whose `file=` it cannot resolve, and says
    nothing. The emitter counted it, so every guard upstream is satisfied. Only
    a check that resolves the path against the tree can see the loss.
    """
    annotations = [
        {
            "path": "frontend/node_modules/chai/chai.js",
            "start_line": 9203,
            "annotation_level": "failure",
            "message": "AssertionError",
        }
    ]
    problems = reconcile(
        FAILED_JOB,
        annotations=annotations,
        path_exists=lambda p: not p.startswith("frontend/node_modules"),
    )
    assert any(p.kind == "annotation-path-not-in-tree" for p in problems), problems
    assert any("chai" in p.detail for p in problems)


def test_reconcile_flags_an_annotation_with_no_line() -> None:
    """A file-only annotation pins to line 1, which is a location that lies."""
    annotations = [
        {
            "path": "frontend/src/canvas/layout/layout.ts",
            "start_line": None,
            "annotation_level": "failure",
            "message": "something",
        }
    ]
    problems = reconcile(
        FAILED_JOB, annotations=annotations, path_exists=lambda p: True
    )
    assert any(p.kind == "annotation-without-a-line" for p in problems), problems


def test_reconcile_is_silent_on_a_healthy_failed_run() -> None:
    """A failure WITH a resolvable file and line is the good case, not a problem.

    A checker that fires on correct input gets deleted, so this is as important
    as the cases above.
    """
    annotations = [
        {
            "path": "frontend/src/canvas/layout/layout.ts",
            "start_line": 88,
            "annotation_level": "failure",
            "message": "AssertionError: overlapping blocks",
        }
    ]
    problems = reconcile(
        FAILED_JOB, annotations=annotations, path_exists=lambda p: True
    )
    assert problems == [], problems


LOCATED_ANNOTATION = [
    {
        "path": "frontend/src/canvas/layout/layout.ts",
        "start_line": 88,
        "annotation_level": "failure",
        "message": "AssertionError: overlapping blocks",
    }
]


def test_reconcile_refuses_to_certify_when_annotation_data_was_not_fetched() -> None:
    """AN API ERROR IS NOT AN EMPTY RESULT, AND THE DIFFERENCE IS THE WHOLE POINT.

    `ci-findings.yml` fetched each job's annotations with

        gh api ".../check-runs/$id/annotations" > one.json 2>/dev/null \\
            || echo '[]' > one.json

    so an auth failure, a rate limit, a timeout or a 5xx all arrived here as
    zero annotations -- indistinguishable from a job that genuinely produced
    none. Every located failure then reconciled cleanly and this module printed

        ci-findings: PASS -- every failure on this run has a resolvable location.

    which is a statement about data it never received. That sentence is the
    output a human reads to decide whether a red run is diagnosable, and it was
    capable of being confidently wrong in the one direction that matters.

    So the caller now records which check-runs it could NOT read, and an
    unreadable one is a problem in its own right. The annotation below is
    perfectly good: without the fetch failure this input is the healthy case
    asserted directly above, so nothing here can pass by accident.
    """
    problems = reconcile(
        FAILED_JOB,
        annotations=LOCATED_ANNOTATION,
        path_exists=lambda p: True,
        fetch_failures=["4242"],
    )
    assert any(p.kind == "annotation-data-unavailable" for p in problems), problems
    assert any("4242" in p.detail or "4242" in p.where for p in problems), problems


def test_reconcile_stays_silent_when_every_fetch_succeeded() -> None:
    """THE PAIR. Without this, `return [Problem(...)]` satisfies the test above.

    Same job, same annotation, empty failure list -- the only difference is the
    thing under test. A checker that fires on a clean fetch would turn every
    green run into a diagnosis nobody needs, and would be switched off within a
    week.
    """
    problems = reconcile(
        FAILED_JOB,
        annotations=LOCATED_ANNOTATION,
        path_exists=lambda p: True,
        fetch_failures=[],
    )
    assert problems == [], problems


def test_reconcile_ignores_a_green_run() -> None:
    # Annotated because `steps: []` alone infers `list[Unknown]`, which
    # pyright reports as a partially unknown argument at the call below.
    green: list[dict[str, Any]] = [
        {"name": "frontend", "conclusion": "success", "steps": []}
    ]
    assert reconcile(green, annotations=[], path_exists=lambda p: True) == []


@pytest.mark.parametrize("level", ["failure", "warning", "notice"])
def test_reconcile_checks_paths_at_every_level(level: str) -> None:
    """A warning that points nowhere is still a lost message."""
    annotations = [
        {
            "path": "does/not/exist.ts",
            "start_line": 3,
            "annotation_level": level,
            "message": "m",
        }
    ]
    problems = reconcile(
        FAILED_JOB, annotations=annotations, path_exists=lambda p: False
    )
    assert any(p.kind == "annotation-path-not-in-tree" for p in problems)


def test_finding_and_problem_are_serialisable() -> None:
    """Both types cross a process boundary, so both must survive JSON."""
    import json

    f = Finding(
        step="s", level="error", file="a.ts", line=1, col=2, message="m", label="tsc"
    )
    p = Problem(kind="k", detail="d", where="w")
    json.loads(json.dumps(f.as_dict()))
    json.loads(json.dumps(p.as_dict()))


# --- classification ----------------------------------------------------------
#
# A label is what makes a findings file triageable instead of merely machine
# readable. "47 errors" is not actionable; "3 tsc, 1 pytest, 43 npm noise" is,
# and the reader knows which one to open first.


@pytest.mark.parametrize(
    ("line", "expected"),
    [
        ("src/x.ts(9,2): error TS2345: Argument of type", "tsc"),
        ("src/x.ts:4:1: error  no-unused-vars  @typescript-eslint", "eslint"),
        ("  /repo/scripts/g.py:12: error: Incompatible types  [assignment]", "pyright"),
        ("E   AssertionError: expected 2 to equal 3", "assert"),
        ("Traceback (most recent call last):", "traceback"),
        ("##[error]Process completed with exit code 137.", "exit"),
    ],
)
def test_each_finding_carries_a_label(line: str, expected: str) -> None:
    findings = parse_log(
        f"2026-08-24T10:00:00.0000000Z ##[group]Run x\n"
        f"2026-08-24T10:00:01.0000000Z {line}\n"
    )
    assert findings, f"nothing parsed from {line!r}"
    assert findings[0].label == expected, (
        f"{line!r} labelled {findings[0].label!r}, expected {expected!r}"
    )


def test_known_noise_is_muted() -> None:
    """npm's footer is printed on every failure and names nothing.

    Muting it is not cosmetic: a findings file where 40 of 43 rows are the same
    boilerplate trains the reader to skim, which is how the three real rows get
    missed.
    """
    # A MARKER LINE, because only a marker line proves anything here.
    #
    # The first version of this test used two bare `npm ERR!` lines. They have
    # no location and no STRONG label, so parse_log would have dropped them
    # whether MUTED existed or not -- the test passed for a reason unrelated to
    # what it claimed, and deleting the whole MUTED list left it green. Mutation
    # testing caught that; the fix is an input the parser would otherwise keep.
    #
    # `##[error]` lines are always captured, so muting one is the only way this
    # assertion can hold.
    noisy = (
        "2026-08-24T10:00:00.0000000Z ##[group]Run npm ci\n"
        "2026-08-24T10:00:01.0000000Z ##[error]Process completed with exit code 1.\n"
    )
    assert [f.message for f in parse_log(noisy)] == []


def test_a_meaningful_exit_code_is_not_muted() -> None:
    """137 is OOM and 143 is SIGTERM. Muting those hides why a job died.

    Only the generic `exit code 1` is dropped, because the command that failed
    already reported itself. This is the other half of the mute rule and it is
    tested separately so a wider mute pattern cannot pass unnoticed.
    """
    killed = (
        "2026-08-24T10:00:00.0000000Z ##[group]Run npm test\n"
        "2026-08-24T10:00:01.0000000Z ##[error]Process completed with exit code 137.\n"
    )
    findings = parse_log(killed)
    assert len(findings) == 1
    assert findings[0].label == "exit"
    assert "137" in findings[0].message


def test_an_unrecognised_error_is_labelled_not_dropped() -> None:
    """THE SILENT-MISS CHANNEL, CLOSED.

    A pattern table only reports what it recognises, so a tool whose output
    nobody wrote a pattern for produces "no recognised error pattern" and the
    failure is invisible -- the same shape as the annotation GitHub discarded.

    An `##[error]` the table cannot classify is still an error the runner
    emitted. It is labelled `unclassified` and kept, so a gap in the table
    shows up as a row a human can read rather than as silence.
    """
    odd = (
        "2026-08-24T10:00:00.0000000Z ##[group]Run ./weird-tool\n"
        "2026-08-24T10:00:01.0000000Z ##[error]glorp: the flux capacitor dissented\n"
    )
    findings = parse_log(odd)
    assert len(findings) == 1
    assert findings[0].label == "unclassified"
    assert "flux capacitor" in findings[0].message


def test_the_module_shells_out_to_nothing() -> None:
    """NO SUBPROCESS, AND THIS IS LOAD-BEARING RATHER THAN TIDINESS.

    `scripts/security_gate.py` keeps an allowlist keyed by (bandit rule, path).
    Any script here that imports subprocess raises B404/B603/B607, and until its
    path is added to that allowlist `sarif_suppress.py` cannot adjudicate the
    findings -- which failed three tests in tests/test_sarif_suppress.py when
    this module had a `fetch` subcommand.

    That allowlist lives in a file this lane does not own. Rather than couple
    the two, the fetching is left to the caller: `gh api ... > jobs.json` in a
    shell, and this module reads files. It keeps the module pure, testable
    without a network, and unable to reintroduce the coupling by accident.
    """
    src = (REPO / "scripts" / "ci_findings.py").read_text(encoding="utf-8")
    assert "import subprocess" not in src
    assert "subprocess.run" not in src


def test_the_path_finding_does_not_claim_github_discarded_it() -> None:
    """THE FINDING SURVIVED THE TRUTH, ITS EXPLANATION DID NOT.

    This finding was written on the rule that GitHub discards an annotation
    whose `file=` does not resolve. `scripts/annotation_canary.py` tested that
    against GitHub on run 32696164034 and it is FALSE -- the API returned the
    unresolvable probe.

    The finding still earns its place, and that was checked rather than assumed.
    From the same payload, at the same SHA:

        contents/scripts/__annotation_canary_no_such_file__.py  -> 404 Not Found
        contents/scripts/annotation_canary.py                   -> 8097 bytes

    So the annotation is RETAINED but its `blob_href` genuinely 404s, and GitHub
    only renders annotations inline on files that are part of the diff. It is
    reachable in the API and unreachable everywhere a human looks. That is a
    real defect, not a non-event -- which is why the check stays and only the
    explanation changes.

    A reworded finding that fired on nothing would be worse than the wrong one
    it replaced, because it would also look reviewed.
    """
    annotations = [
        {
            "path": "frontend/node_modules/chai/chai.js",
            "start_line": 9203,
            "annotation_level": "failure",
            "message": "AssertionError",
        }
    ]
    problems = reconcile(
        FAILED_JOB, annotations=annotations, path_exists=lambda p: False
    )
    hit = next(p for p in problems if p.kind == "annotation-path-not-in-tree")
    assert "discard" not in hit.detail.lower(), (
        f"the finding still claims a discard, which GitHub was observed not to "
        f"do: {hit.detail!r}"
    )
    assert "404" in hit.detail, (
        f"the finding should name the observable damage — the link 404s: {hit.detail!r}"
    )
