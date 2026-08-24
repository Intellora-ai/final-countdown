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

from ci_findings import (
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
    lines = [l for l in text.splitlines() if l.strip()]
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


# --- severity: what may block, and what may only inform ----------------------
#
# MEASURED BEFORE THIS SPLIT EXISTED, across 10 real red runs:
#
#     annotation-without-a-line     18 instances
#     annotation-path-not-in-tree    2 instances
#     red runs with zero annotations 0
#
# Treating all 20 as blocking put the enforced pass rate at 60%. The 18 are not
# defects. `scripts/blocker_report.py` states the reasoning in its own docstring:
# most gates here record a bare path, "requiring a line meant every one of those
# produced no annotation at all", and GitHub attaching a line-less annotation to
# the file "is a true and useful claim; refusing to make it bought nothing."
#
# So a line-less annotation is a DELIBERATE, reasoned choice. Blocking on it
# would fail 40% of red runs for doing the right thing -- the same shape as #69,
# whose title is "the ratchet test punished anyone who added a mutant".
#
# The split is therefore: an annotation nobody can OPEN blocks; one that opens
# at the wrong line informs.


def test_a_line_less_annotation_informs_and_does_not_block() -> None:
    """It opens at line 1 rather than the failing line. Imprecise, not lost."""
    annotations = [
        {
            "path": "scripts/ci_findings.py",
            "start_line": None,
            "annotation_level": "failure",
            "message": "m",
        }
    ]
    problems = reconcile(
        FAILED_JOB, annotations=annotations, path_exists=lambda p: True
    )
    hit = next(p for p in problems if p.kind == "annotation-without-a-line")
    assert hit.blocking is False, (
        "a line-less annotation blocks the build, which punishes every gate that "
        "records a bare path on purpose"
    )
    assert problems, "it must still be REPORTED — advisory is not silent"


def test_an_unopenable_annotation_blocks() -> None:
    """A 404 link is a lost message. That is the thing worth stopping for."""
    annotations = [
        {
            "path": "frontend/node_modules/chai/chai.js",
            "start_line": 9203,
            "annotation_level": "failure",
            "message": "m",
        }
    ]
    problems = reconcile(
        FAILED_JOB,
        annotations=annotations,
        path_exists=lambda p: not p.startswith("frontend/node_modules"),
    )
    hit = next(p for p in problems if p.kind == "annotation-path-not-in-tree")
    assert hit.blocking is True


def test_a_failed_job_with_no_annotations_at_all_blocks() -> None:
    """Red with nothing to click is the worst case and must never be advisory."""
    problems = reconcile(FAILED_JOB, annotations=[], path_exists=lambda p: True)
    hit = next(p for p in problems if p.kind == "job-failed-with-no-annotations")
    assert hit.blocking is True


def test_advisory_findings_alone_do_not_fail_the_run() -> None:
    """THE WHOLE POINT OF THE SPLIT, stated as the case that decides it.

    A run whose only complaint is imprecision must be reportable without being
    blockable, or this check can never become a required context without
    failing correct work.
    """
    annotations = [
        {
            "path": "scripts/ci_findings.py",
            "start_line": None,
            "annotation_level": "failure",
            "message": "m",
        }
    ]
    problems = reconcile(
        FAILED_JOB, annotations=annotations, path_exists=lambda p: True
    )
    assert problems, "still reported"
    assert not any(p.blocking for p in problems), "nothing here should block"


def test_problem_severity_survives_json() -> None:
    import json

    p = Problem(kind="k", detail="d", where="w", blocking=True)
    assert json.loads(json.dumps(p.as_dict()))["blocking"] is True


# --- B: the enforcement surface ----------------------------------------------
#
# The severity split is only worth anything if the EXIT CODE honours it. A
# reconciler that reports advisories and still exits 1 cannot be made a required
# context without failing correct work, which is the whole reason the split
# exists.


def _run_cli(tmp_path: Path, jobs: list[Any], annotations: list[Any]) -> int:
    import json as _json
    import subprocess as _sp
    import sys as _sys

    (tmp_path / "jobs.json").write_text(_json.dumps(jobs), encoding="utf-8")
    (tmp_path / "ann.json").write_text(_json.dumps(annotations), encoding="utf-8")
    return _sp.run(
        [
            _sys.executable,
            str(REPO / "scripts" / "ci_findings.py"),
            "reconcile",
            "--jobs",
            str(tmp_path / "jobs.json"),
            "--annotations",
            str(tmp_path / "ann.json"),
            "--root",
            str(REPO),
        ],
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    ).returncode


def test_cli_exits_zero_when_only_advisories(tmp_path: Path) -> None:
    """A run whose only complaint is imprecision must not fail.

    This is the case that decides whether this check can ever be required.
    Measured: 18 of 20 findings across 10 red runs were this kind.
    """
    code = _run_cli(
        tmp_path,
        FAILED_JOB,
        [
            {
                "path": "scripts/ci_findings.py",
                "start_line": None,
                "annotation_level": "failure",
                "message": "m",
            }
        ],
    )
    assert code == 0, "advisories alone failed the run; enforcement is unsafe"


def test_cli_exits_non_zero_on_an_unopenable_annotation(tmp_path: Path) -> None:
    """A 404 link is a lost message and is exactly what enforcement is for."""
    code = _run_cli(
        tmp_path,
        FAILED_JOB,
        [
            {
                "path": "does/not/exist/anywhere.ts",
                "start_line": 3,
                "annotation_level": "failure",
                "message": "m",
            }
        ],
    )
    assert code != 0


def test_cli_exits_non_zero_when_a_failed_job_has_no_annotations(
    tmp_path: Path,
) -> None:
    """Red with nothing to click. The worst case, and never advisory."""
    assert _run_cli(tmp_path, FAILED_JOB, []) != 0


def test_cli_exits_zero_on_a_healthy_failed_run(tmp_path: Path) -> None:
    """A failure WITH a resolvable file and line is the good case."""
    code = _run_cli(
        tmp_path,
        FAILED_JOB,
        [
            {
                "path": "scripts/ci_findings.py",
                "start_line": 1,
                "annotation_level": "failure",
                "message": "m",
            }
        ],
    )
    assert code == 0


def test_an_advisory_is_annotated_as_notice_not_error(
    tmp_path: Path, capsys: Any
) -> None:
    """LEVEL TRACKS SEVERITY, and mutation testing is why this test exists.

    Disabling the level choice -- printing every finding as `::error` -- left
    every other test in this file green. An advisory painted red is a red
    annotation for a deliberate choice, and a reader who sees those learns to
    ignore the real ones too. That is the same "signal so constant it carries no
    information" failure the annotation canary was re-anchored to avoid.
    """
    import contextlib
    import io
    import sys as _sys

    _sys.path.insert(0, str(REPO / "scripts"))
    from ci_findings import Problem, emit_problem

    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        emit_problem(Problem(kind="k", detail="d", where="a/b.py", blocking=False))
    advisory = buf.getvalue()

    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        emit_problem(Problem(kind="k", detail="d", where="a/b.py", blocking=True))
    blocking = buf.getvalue()

    assert advisory.startswith("::notice "), advisory
    assert blocking.startswith("::error "), blocking
    assert "imprecise location" in advisory
    assert "unlocatable failure" in blocking
