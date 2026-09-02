"""The Python failure envelope, both directions, on sentences real red runs printed."""

from __future__ import annotations

import json
from pathlib import Path

from failure_envelope import (
    classify,
    envelope,
    error_class,
    fingerprint,
    known_failures,
    top_frame,
    workflow_command,
)

SOCKET_GUARD = (
    "AssertionError: a test tried to open a network connection. The learning-os suite "
    "must run offline\n"
    '  File "/home/runner/work/final-countdown/final-countdown/learning-os/tests/conftest.py", '
    "line 34, in _refuse"
)
QUOTA = (
    "LLMUnavailable: the model could not be reached: 429 RESOURCE_EXHAUSTED. "
    "{'error': {'code': 429, 'message': 'You exceeded your current quota'}}"
)
ASSERTION = (
    "AssertionError: assert document['outcome'] == 'answered'\n"
    '  File "/home/runner/work/final-countdown/final-countdown/learning-os/tests/'
    'test_grounded_answer.py", line 457, in test_the_bridge_answers'
)


def test_a_forbidden_socket_is_environment_not_code() -> None:
    assert classify(SOCKET_GUARD).kind == "ENVIRONMENT"
    assert classify("PermissionError: [Errno 1] Operation not permitted").kind == "ENVIRONMENT"


def test_a_vendor_quota_is_external_never_a_code_fix() -> None:
    found = classify(QUOTA)
    assert found.kind == "EXTERNAL"
    assert "429" in found.evidence or "RESOURCE_EXHAUSTED" in found.evidence


def test_a_plain_assertion_is_code() -> None:
    assert classify(ASSERTION).kind == "CODE"


def test_a_recorded_fingerprint_is_flake_unless_a_new_reason_wears_its_name() -> None:
    fp = fingerprint("tests/test_x.py::test_y", ASSERTION)
    known = {fp: {"reason": "timing on a shared runner"}}
    assert classify(ASSERTION, fp, known).kind == "FLAKE"
    assert classify(QUOTA, fp, known).kind == "EXTERNAL"


def test_environment_wins_over_external_when_both_appear() -> None:
    assert classify(SOCKET_GUARD + "\n" + QUOTA).kind == "ENVIRONMENT"


def test_the_fingerprint_is_stable_across_machines_and_moves_with_the_failure() -> None:
    a = fingerprint("t", ASSERTION)
    elsewhere = ASSERTION.replace("/home/runner/work/final-countdown/final-countdown/", "/Users/x/")
    b = fingerprint("t", elsewhere)
    assert a == b
    assert a.startswith("FP-") and len(a) == 9
    assert fingerprint("other", ASSERTION) != a
    assert fingerprint("t", ASSERTION.replace("AssertionError", "TypeError")) != a
    assert fingerprint("t", ASSERTION.replace("line 457", "line 458")) != a
    # The first line's wording does not move it: only class and frame do.
    assert fingerprint("t", ASSERTION.replace("'answered'", "'answered' (port 5183)")) == a


def test_the_pieces() -> None:
    assert error_class(ASSERTION) == "AssertionError"
    assert error_class(QUOTA) == "LLMUnavailable"
    assert top_frame(ASSERTION) == "learning-os/tests/test_grounded_answer.py:457"
    assert top_frame(SOCKET_GUARD) == "learning-os/tests/conftest.py:34"
    assert top_frame("no frames") == ""


def test_the_reproduction_names_the_command_and_the_machine() -> None:
    env = envelope(
        runner="pytest",
        test="tests/test_grounded_answer.py::test_the_bridge_answers",
        file="learning-os/tests/test_grounded_answer.py",
        message=SOCKET_GUARD,
        commit="abc1234",
    )
    assert env.reproduction.command == (
        'cd learning-os && pytest "tests/test_grounded_answer.py::test_the_bridge_answers"'
    )
    assert env.reproduction.runner == "cloud-network"
    assert env.title("pytest") == f"pytest [{env.fingerprint} ENVIRONMENT]"
    line = env.trailer()
    assert line.startswith("envelope: {") and "\n" not in line
    assert json.loads(line[len("envelope: ") :])["reproduce"].startswith("cd learning-os")

    plain = envelope(
        runner="pytest", test="tests/test_x.py::test_y", file="tests/test_x.py", message=ASSERTION
    )
    assert plain.reproduction.runner == "sandbox"
    assert plain.reproduction.command == 'pytest "tests/test_x.py::test_y"'


def test_the_workflow_command_is_escaped_per_github_rules() -> None:
    line = workflow_command("error", "learning-os/tests/a.py", 12, "t: x, y", "100% wrong\nsecond")
    assert line.startswith("::error file=learning-os/tests/a.py,line=12,title=t%3A x%2C y::")
    assert line.endswith("100%25 wrong%0Asecond")
    assert "\n" not in line


def test_known_failures_reads_only_well_shaped_entries(tmp_path: Path) -> None:
    good = tmp_path / "known.json"
    good.write_text(
        json.dumps({"_": "a note", "FP-abc123": {"reason": "flaky", "since": "run 1"}, "nope": 3}),
        encoding="utf-8",
    )
    assert known_failures(good) == {"FP-abc123": {"reason": "flaky", "since": "run 1"}}
    assert known_failures(tmp_path / "missing.json") == {}
    bad = tmp_path / "bad.json"
    bad.write_text("not json", encoding="utf-8")
    assert known_failures(bad) == {}
