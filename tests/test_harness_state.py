"""The workflow state: phases a task moves through, gated by evidence.

WHY THESE TESTS EXIST. The harness's whole claim is that a phase change is a
FACT read from evidence, never a sentence Claude wrote. So every transition is
asserted in both directions: it refuses without the evidence, and accepts with
exactly the evidence the spec names. A state machine that only ever advances
would pass a one-directional suite and enforce nothing.

Spec: docs/superpowers/specs/2026-09-02-engineering-harness-design.md
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

from harness.state import (  # noqa: E402
    PHASES,
    Blocked,
    Task,
    advance,
    complete,
    load,
    next_phase,
    save,
    start,
)

NOW = "2026-09-02T10:00:00+00:00"


def _at(seconds: int) -> str:
    return f"2026-09-02T10:00:{seconds:02d}+00:00"


def test_every_task_type_has_the_phase_sequence_the_spec_names() -> None:
    assert PHASES["bug"] == ("investigate", "root_cause", "red", "green", "refactor", "verify", "complete")
    assert PHASES["feature"] == ("spec", "red", "green", "refactor", "verify", "complete")
    assert PHASES["refactor"] == ("baseline", "refactor", "verify", "complete")
    assert PHASES["investigation"] == ("investigate", "report", "complete")
    assert PHASES["spike"] == ("probe", "report", "complete")
    assert PHASES["config"] == ("change", "verify", "complete")


def test_a_started_task_sits_in_its_first_phase_with_defaults() -> None:
    task = start("bug", "the save button crashes", now=NOW, commit="abc1234")
    assert task.phase == "investigate"
    assert task.risk == "medium"
    assert task.policy == "warn"
    assert task.start_commit == "abc1234"
    assert task.history == []
    assert next_phase(task) == "root_cause"


def test_an_unknown_type_is_refused_not_guessed() -> None:
    with pytest.raises(ValueError):
        start("chore", "x", now=NOW, commit="")


def test_investigate_needs_both_a_hypothesis_and_a_reproduction() -> None:
    task = start("bug", "x", now=NOW, commit="")
    with pytest.raises(Blocked) as refused:
        advance(task, [], now=_at(1))
    assert "hypothesis" in refused.value.gap and "reproduction" in refused.value.gap

    only_hypothesis: list[dict[str, Any]] = [{"at": _at(1), "kind": "hypothesis", "text": "the lock is dropped early"}]
    with pytest.raises(Blocked) as still:
        advance(task, only_hypothesis, now=_at(2))
    assert "reproduction" in still.value.gap

    both = only_hypothesis + [{"at": _at(2), "kind": "reproduction", "how": "pytest -k save"}]
    moved = advance(task, both, now=_at(3))
    assert moved.phase == "root_cause"
    assert moved.history[-1]["from"] == "investigate" and moved.history[-1]["to"] == "root_cause"


def test_a_failed_command_counts_as_a_reproduction() -> None:
    task = start("bug", "x", now=NOW, commit="")
    evidence: list[dict[str, Any]] = [
        {"at": _at(1), "kind": "hypothesis", "text": "x"},
        {"at": _at(2), "kind": "command", "command": "pytest -k save", "exit_code": 1, "test_run": None},
    ]
    assert advance(task, evidence, now=_at(3)).phase == "root_cause"


def _in_phase(task_type: str, phase: str) -> Task:
    """A task placed directly in `phase`, for testing one transition in isolation.
    The phase must be one this type has, or the fixture itself is the bug."""
    task = start(task_type, "x", now=NOW, commit="")
    assert phase in PHASES[task_type], f"{task_type} has no phase {phase}"
    return Task(**{**task.__dict__, "phase": phase})


def _in_red(task_type: str) -> Task:
    return _in_phase(task_type, "red")


def test_red_to_green_needs_a_failing_run_after_the_test_was_written() -> None:
    task = _in_red("feature")
    with pytest.raises(Blocked) as refused:
        advance(task, [], now=_at(1))
    assert "failing" in refused.value.gap.lower()

    test_written: dict[str, Any] = {"at": _at(1), "kind": "file_change", "path": "tests/test_x.py", "role": "test"}
    failing_run: dict[str, Any] = {
        "at": _at(2), "kind": "command", "command": "pytest tests/test_x.py", "exit_code": 1,
        "test_run": {"runner": "pytest", "passed": 0, "failed": 1, "errors": 0},
    }
    moved = advance(task, [test_written, failing_run], now=_at(3))
    assert moved.phase == "green"


def test_red_to_green_is_refused_when_production_code_came_before_the_failing_run() -> None:
    """Tests before code, as an observable fact: a production edit that precedes
    the first failing run means the test was written after, or never failed."""
    task = _in_red("feature")
    evidence: list[dict[str, Any]] = [
        {"at": _at(1), "kind": "file_change", "path": "src/x.py", "role": "production"},
        {"at": _at(2), "kind": "file_change", "path": "tests/test_x.py", "role": "test"},
        {"at": _at(3), "kind": "command", "command": "pytest", "exit_code": 1,
         "test_run": {"runner": "pytest", "passed": 0, "failed": 1, "errors": 0}},
    ]
    with pytest.raises(Blocked) as refused:
        advance(task, evidence, now=_at(4))
    assert "production" in refused.value.gap.lower()


def test_red_to_green_ignores_a_failing_run_older_than_the_test_change() -> None:
    task = _in_red("feature")
    evidence: list[dict[str, Any]] = [
        {"at": _at(1), "kind": "command", "command": "pytest", "exit_code": 1,
         "test_run": {"runner": "pytest", "passed": 0, "failed": 1, "errors": 0}},
        {"at": _at(2), "kind": "file_change", "path": "tests/test_x.py", "role": "test"},
    ]
    with pytest.raises(Blocked):
        advance(task, evidence, now=_at(3))


def test_green_to_refactor_needs_a_green_run_after_the_last_production_change() -> None:
    task = _in_phase("feature", "green")
    evidence: list[dict[str, Any]] = [
        {"at": _at(1), "kind": "file_change", "path": "src/x.py", "role": "production"},
        {"at": _at(2), "kind": "command", "command": "pytest", "exit_code": 0,
         "test_run": {"runner": "pytest", "passed": 4, "failed": 0, "errors": 0}},
    ]
    assert advance(task, evidence, now=_at(3)).phase == "refactor"

    stale: list[dict[str, Any]] = [
        {"at": _at(1), "kind": "command", "command": "pytest", "exit_code": 0,
         "test_run": {"runner": "pytest", "passed": 4, "failed": 0, "errors": 0}},
        {"at": _at(2), "kind": "file_change", "path": "src/x.py", "role": "production"},
    ]
    with pytest.raises(Blocked) as refused:
        advance(task, stale, now=_at(3))
    assert "after" in refused.value.gap.lower()


def test_a_red_run_never_counts_as_green() -> None:
    task = _in_phase("feature", "green")
    evidence: list[dict[str, Any]] = [
        {"at": _at(1), "kind": "file_change", "path": "src/x.py", "role": "production"},
        {"at": _at(2), "kind": "command", "command": "pytest", "exit_code": 1,
         "test_run": {"runner": "pytest", "passed": 3, "failed": 1, "errors": 0}},
    ]
    with pytest.raises(Blocked):
        advance(task, evidence, now=_at(3))


def test_advance_never_reaches_complete_only_the_verifier_does() -> None:
    task = _in_phase("config", "verify")
    green: list[dict[str, Any]] = [{"at": _at(1), "kind": "command", "command": "pytest", "exit_code": 0,
              "test_run": {"runner": "pytest", "passed": 1, "failed": 0, "errors": 0}}]
    with pytest.raises(Blocked) as refused:
        advance(task, green, now=_at(2))
    assert "verifier" in refused.value.gap.lower()
    assert complete(task, now=_at(3)).phase == "complete"


def test_a_complete_task_cannot_advance_further() -> None:
    task = complete(start("spike", "x", now=NOW, commit=""), now=_at(1))
    assert next_phase(task) is None
    with pytest.raises(Blocked):
        advance(task, [], now=_at(2))


def test_save_and_load_round_trip_and_a_corrupt_file_is_no_task(tmp_path: Path) -> None:
    task = start("refactor", "split the handler", now=NOW, commit="deadbee", risk="high", policy="block")
    save(tmp_path, task)
    assert load(tmp_path) == task
    (tmp_path / "task.json").write_text("{not json", encoding="utf-8")
    assert load(tmp_path) is None
    (tmp_path / "task.json").unlink()
    assert load(tmp_path) is None


def test_saved_task_is_plain_json_a_person_can_read(tmp_path: Path) -> None:
    save(tmp_path, start("bug", "x", now=NOW, commit="c"))
    raw = json.loads((tmp_path / "task.json").read_text(encoding="utf-8"))
    assert raw["type"] == "bug" and raw["phase"] == "investigate" and raw["policy"] == "warn"
