"""The blockers-first log must be complete, and must not invent positions.

Two properties matter here and they pull against each other. The log has to
carry every field a reader needs so nobody opens a second page; and it has to
refuse to point at a line it cannot prove, because an annotation on the wrong
line sends a reader to code that is not the problem, which is worse than
printing no position at all.

A third property outranks both: rendering must never change a verdict.
`aggregate_gates.py` decides, `blocker_report.py` formats. These pin that the
formatter is pure and that a crash in it cannot make a failing run pass.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

import blocker_report  # noqa: E402

MERGEABLE = {"PASS", "NOT_APPLICABLE"}


def manifest(gates: dict[str, Any], blocking: list[str],
             overall: str = "FAIL") -> dict[str, Any]:
    return {"overall": overall, "mergeable": overall == "PASS",
            "blocking": blocking, "gates": gates,
            "run_identity": {"commit": "a" * 40, "run_id": "1",
                             "run_attempt": "1", "workflow": "verify"}}


def one_failure(**over: str) -> dict[str, str]:
    base = {"what": "a thing went wrong", "where": "scripts/gate.py:1",
            "why": "because of a reason", "requirement": "it must not",
            "how_to_fix": "do the other thing"}
    base.update(over)
    return base


# --- the log must carry every field, not a truncation of them ---------------

def test_every_recorded_field_reaches_the_log() -> None:
    """The defect this file exists for: `what` alone is not actionable."""
    f = one_failure()
    text, _ = blocker_report.render(
        manifest({"bandit": {"status": "FAIL", "failures": [f]}}, ["bandit"]),
        MERGEABLE)
    for value in f.values():
        assert value in text, f"the log dropped {value!r}"


def test_blockers_are_printed_before_passes() -> None:
    """A reader must not scroll past twelve green gates to find the red one."""
    gates: dict[str, Any] = {
        "pyright": {"status": "PASS", "duration_ms": 10},
        "bandit": {"status": "FAIL", "failures": [one_failure()]}}
    text, _ = blocker_report.render(manifest(gates, ["bandit"]), MERGEABLE)
    assert text.index("BLOCKERS") < text.index("PASSED"), (
        "the passing gates were printed above the blockers")


def test_a_gate_with_no_report_is_still_a_blocker() -> None:
    """MISSING is the most serious state and has no failure record to print.

    An empty section here would read as 'nothing wrong' for the one case that
    means the verification did not happen at all.
    """
    gates: dict[str, Any] = {
        "mutmut": {"status": "UNKNOWN", "note": "no report produced",
                   "failures": []}}
    text, _ = blocker_report.render(manifest(gates, ["mutmut"]), MERGEABLE)
    assert "mutmut" in text
    assert "no report produced" in text
    assert "absence is never a pass" in text


def test_the_counts_separate_ran_and_failed_from_never_concluded() -> None:
    """A gate that said no is a different problem from a gate that never ran."""
    gates: dict[str, Any] = {
        "a": {"status": "PASS"}, "b": {"status": "FAIL", "failures": []},
        "c": {"status": "UNKNOWN"}, "d": {"status": "INFRASTRUCTURE_FAILURE"}}
    text, _ = blocker_report.render(manifest(gates, ["b", "c", "d"]), MERGEABLE)
    assert "PASS             1" in text
    assert "FAIL             1" in text
    assert "NEVER CONCLUDED  2" in text


# --- it must not claim a position it cannot prove ---------------------------

@pytest.mark.parametrize("where", [
    "scripts/does_not_exist_at_all.py:12",   # file is not in the tree
    "scripts/gate.py:999999",                # past the end of a real file
    "scripts/gate.py:0",                     # lines are 1-based
    "somewhere in the coverage report",      # not a location at all
    "",                                      # nothing recorded
])
def test_an_unprovable_location_is_never_annotated(where: str) -> None:
    """`::error file=` is a claim a reader acts on. Wrong is worse than absent."""
    f = one_failure(where=where)
    text, _ = blocker_report.render(
        manifest({"g": {"status": "FAIL", "failures": [f]}}, ["g"]), MERGEABLE)
    assert "::error file=" not in text, (
        f"annotated a location it could not verify: {where!r}")
    # ...but the finding itself must still be fully reported.
    assert f["what"] in text and f["how_to_fix"] in text


def test_a_real_location_is_annotated() -> None:
    """The control: without this, the test above passes by doing nothing."""
    text, _ = blocker_report.render(
        manifest({"bandit": {"status": "FAIL",
                             "failures": [one_failure(where="scripts/gate.py:1")]}},
                 ["bandit"]), MERGEABLE)
    assert "::error file=scripts/gate.py,line=1" in text


@pytest.mark.parametrize("nasty", [
    "what\nline two",                 # a newline ends an annotation command
    "what ::warning file=x::spoof",   # a second command inside the message
])
def test_an_annotation_message_cannot_open_a_second_command(nasty: str) -> None:
    """Gate text is data. It must not be able to forge workflow commands."""
    f = one_failure(what=nasty, where="scripts/gate.py:1")
    mark = blocker_report.annotate("bandit", "ABC123", f)
    assert mark is not None
    assert "\n" not in mark, "a newline would terminate the annotation"
    assert mark.count("::") == 2, f"message opened another command: {mark}"


# --- failure ids are stable, which is what makes RESOLVED checkable ---------

def test_the_same_defect_keeps_its_id_across_runs() -> None:
    f = one_failure()
    assert blocker_report.failure_id("bandit", f) == \
        blocker_report.failure_id("bandit", dict(f))


def test_a_different_defect_gets_a_different_id() -> None:
    a = blocker_report.failure_id("bandit", one_failure())
    b = blocker_report.failure_id("bandit", one_failure(what="something else"))
    c = blocker_report.failure_id("coverage", one_failure())
    assert len({a, b, c}) == 3, "distinct defects collided on one id"


# --- rendering must never be able to change a verdict -----------------------

def test_a_crashing_renderer_does_not_turn_a_failure_into_a_pass(
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """The finalizer catches rendering errors. Prove the exit code survives.

    Runs the real aggregator over an evidence tree with one FAIL, against a
    copy of blocker_report.py that raises on import-time use.
    """
    work = tmp_path / "w"
    (work / "scripts").mkdir(parents=True)
    (work / "evidence" / "reports-bandit").mkdir(parents=True)
    for name in ("aggregate_gates.py", "gate.py"):
        (work / "scripts" / name).write_text(
            (REPO / "scripts" / name).read_text(encoding="utf-8"),
            encoding="utf-8")
    (work / "ci").mkdir()
    (work / "ci" / "gates.toml").write_text(
        (REPO / "ci" / "gates.toml").read_text(encoding="utf-8"),
        encoding="utf-8")
    (work / "scripts" / "blocker_report.py").write_text(
        "def emit(*a, **k):\n    raise RuntimeError('renderer exploded')\n",
        encoding="utf-8")

    ident = {"commit": "b" * 40, "run_id": "7", "run_attempt": "1",
             "workflow": "verify", "repository": "o/r"}
    (work / "evidence" / "reports-bandit" / "bandit.json").write_text(
        json.dumps({"schema_version": "1.1", "gate": "bandit", "status": "FAIL",
                    "duration_ms": 1, "failures": [one_failure()], **ident}),
        encoding="utf-8")

    env = {"GITHUB_SHA": ident["commit"], "GITHUB_RUN_ID": "7",
           "GITHUB_RUN_ATTEMPT": "1", "GITHUB_WORKFLOW": "verify",
           "GITHUB_REPOSITORY": "o/r", "PATH": "/usr/bin:/bin"}
    r = subprocess.run([sys.executable, "scripts/aggregate_gates.py",
                        "--evidence-root", "evidence"],
                       cwd=work, capture_output=True, text=True, timeout=120,
                       env=env)
    assert r.returncode == 1, (
        "a crash in rendering changed the verdict\n" + r.stdout[-800:])
    assert "blocker report unavailable" in r.stdout, (
        "the crash was swallowed without saying so")


# --- warnings must not vanish just because nothing blocked -----------------

def test_a_warning_is_visible_on_a_completely_green_run() -> None:
    """The gap this closes: warnings reached the artifact and stopped there.

    `gate.py` has recorded warnings since schema 1.0 and writes them into every
    report, but `aggregate_gates.py` never read them back -- it had no
    reference to the field at all. So on a green run the one log a human opens
    said nothing about them, and a finding that exists only inside a file
    nobody downloads is a finding the system discarded.

    Policy is unchanged: a warning does not block. It must still be counted
    and printed.
    """
    gates: dict[str, Any] = {
        "spec-strength": {"status": "PASS", "duration_ms": 5,
                          "warnings": ["sampling was truncated at 481 points"]},
        "pyright": {"status": "PASS", "duration_ms": 5},
    }
    text, md = blocker_report.render(manifest(gates, [], overall="PASS"),
                                     MERGEABLE)
    assert "OVERALL          PASS" in text, "this must be a green run"
    assert "WARNINGS         1" in text, "the warning was not counted"
    assert "sampling was truncated at 481 points" in text, (
        "the warning text never reached the log")
    assert "spec-strength" in text
    assert "1 warning(s)" in md, "the summary dropped the warning count"


def test_warnings_are_counted_but_do_not_change_the_verdict() -> None:
    """Visible is not the same as blocking. Neither promote nor discard."""
    gates: dict[str, Any] = {
        "a": {"status": "PASS", "warnings": ["one", "two", "three"]}}
    text, _ = blocker_report.render(manifest(gates, [], overall="PASS"),
                                    MERGEABLE)
    assert "WARNINGS         3" in text
    assert "OVERALL          PASS" in text
    assert "BLOCKERS" not in text, "a warning was promoted to a blocker"


def test_a_warning_with_a_real_location_becomes_a_warning_annotation() -> None:
    """And an error annotation is never used for something that did not block."""
    gates: dict[str, Any] = {
        "lint": {"status": "PASS",
                 "warnings": ["scripts/gate.py:1 unused import"]}}
    text, _ = blocker_report.render(manifest(gates, [], overall="PASS"),
                                    MERGEABLE)
    assert "::warning file=scripts/gate.py,line=1" in text
    assert "::error" not in text, "a warning was raised to an error annotation"
