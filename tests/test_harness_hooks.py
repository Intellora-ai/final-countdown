"""The hooks, run exactly as Claude Code runs them: a process, JSON on stdin.

Each hook is the seam between Claude acting and the harness remembering. They
are tested as subprocesses with the real event JSON, a temporary project
directory and a temporary `.harness/`, asserting what they appended and what
they printed. Nothing here imports a hook module; the interface is the one
the harness will actually be driven through.

Every hook must exit 0 on malformed input and write nothing: a hook that
raises takes the whole session down with it.

Spec: docs/superpowers/specs/2026-09-02-engineering-harness-design.md
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parent.parent
HOOKS = REPO / "scripts" / "harness" / "hooks"
sys.path.insert(0, str(REPO / "scripts"))

from harness.evidence import Store  # noqa: E402
from harness.state import Task, load, save, start  # noqa: E402

NOW = "2026-09-02T10:00:00+00:00"


def _at(seconds: int) -> str:
    return f"2026-09-02T10:00:{seconds:02d}+00:00"


@pytest.fixture
def project(tmp_path: Path) -> Path:
    (tmp_path / ".harness").mkdir()
    (tmp_path / "src").mkdir()
    (tmp_path / "tests").mkdir()
    return tmp_path


def hook(project: Path, name: str, payload: Any) -> subprocess.CompletedProcess[str]:
    env = {**os.environ, "HARNESS_ROOT": str(project / ".harness"), "CLAUDE_PROJECT_DIR": str(project)}
    stdin = payload if isinstance(payload, str) else json.dumps(payload)
    return subprocess.run(
        [sys.executable, str(HOOKS / f"{name}.py")],
        input=stdin, cwd=project, env=env, capture_output=True, text=True, check=False, timeout=60,
    )


def event(project: Path, name: str, **fields: Any) -> dict[str, Any]:
    return {
        "session_id": "s1", "transcript_path": str(project / "transcript.jsonl"), "cwd": str(project),
        "hook_event_name": name, **fields,
    }


def output_json(done: subprocess.CompletedProcess[str]) -> dict[str, Any]:
    assert done.returncode == 0, done.stderr
    assert done.stdout.strip(), "the hook printed nothing"
    parsed: dict[str, Any] = json.loads(done.stdout)
    return parsed


def context_of(done: subprocess.CompletedProcess[str]) -> str:
    out = output_json(done)
    return str(out["hookSpecificOutput"]["additionalContext"])


def evidence(project: Path) -> list[dict[str, Any]]:
    return Store(project / ".harness").read()


def _task(project: Path, task_type: str, phase: str, policy: str = "warn", risk: str = "medium") -> Task:
    task = start(task_type, "x", now=NOW, commit="abc1234", policy=policy, risk=risk)
    placed = Task(**{**task.__dict__, "phase": phase})
    save(project / ".harness", placed)
    return placed


PYTEST_RED = "============ 3 passed, 2 failed in 0.12s ============\n"
PYTEST_GREEN = "5 passed in 0.10s\n"


class TestEveryHookSurvivesGarbage:
    @pytest.mark.parametrize("name", ["route", "record_command", "record_change", "precondition", "completion_gate"])
    def test_malformed_stdin_exits_zero_and_writes_nothing(self, project: Path, name: str) -> None:
        done = hook(project, name, "{not json")
        assert done.returncode == 0
        assert done.stdout.strip() == ""
        assert evidence(project) == []

    @pytest.mark.parametrize("name", ["route", "record_command", "record_change", "precondition", "completion_gate"])
    def test_an_empty_object_exits_zero(self, project: Path, name: str) -> None:
        done = hook(project, name, {})
        assert done.returncode == 0


class TestRecordCommand:
    def test_a_test_run_is_recorded_with_its_numbers(self, project: Path) -> None:
        payload = event(
            project, "PostToolUse", tool_name="Bash", tool_input={"command": "pytest tests -q"},
            tool_response={"stdout": "collecting...\n" + PYTEST_RED, "stderr": "", "exit_code": 1},
        )
        done = hook(project, "record_command", payload)
        assert done.returncode == 0
        [record] = evidence(project)
        assert record["kind"] == "command" and record["command"] == "pytest tests -q"
        assert record["exit_code"] == 1
        assert record["test_run"] == {"runner": "pytest", "passed": 3, "failed": 2, "errors": 0}
        assert record["at"]

    def test_a_non_test_command_is_recorded_with_no_test_run(self, project: Path) -> None:
        payload = event(project, "PostToolUse", tool_name="Bash", tool_input={"command": "git status"},
                        tool_response={"stdout": "On branch codex", "stderr": "", "exit_code": 0})
        hook(project, "record_command", payload)
        [record] = evidence(project)
        assert record["test_run"] is None and record["exit_code"] == 0

    @pytest.mark.parametrize(
        "response",
        [
            "collecting...\n5 passed in 0.10s\n",
            {"output": "5 passed in 0.10s", "returncode": 0},
            {"stdout": "5 passed in 0.10s", "exitCode": 0},
            {"stdout": "5 passed in 0.10s"},
        ],
    )
    def test_the_response_shape_may_vary_and_the_summary_is_still_read(self, project: Path, response: Any) -> None:
        payload = event(project, "PostToolUse", tool_name="Bash", tool_input={"command": "pytest -q"}, tool_response=response)
        hook(project, "record_command", payload)
        [record] = evidence(project)
        assert record["test_run"] is not None and record["test_run"]["passed"] == 5

    def test_a_missing_exit_code_is_recorded_as_unknown_not_zero(self, project: Path) -> None:
        payload = event(project, "PostToolUse", tool_name="Bash", tool_input={"command": "pytest -q"},
                        tool_response={"stdout": PYTEST_GREEN})
        hook(project, "record_command", payload)
        assert evidence(project)[0]["exit_code"] is None

    def test_other_tools_are_ignored(self, project: Path) -> None:
        payload = event(project, "PostToolUse", tool_name="Read", tool_input={"file_path": "x"}, tool_response={})
        done = hook(project, "record_command", payload)
        assert done.returncode == 0 and evidence(project) == []

    def test_a_known_fingerprint_brings_back_its_root_cause(self, project: Path) -> None:
        memory = project / ".harness" / "memory"
        memory.mkdir()
        (memory / "FP-82c05b.json").write_text(json.dumps({
            "fingerprint": "FP-82c05b", "root_cause": "the write lock is released before COMMIT",
            "fix_commit": "50c6d446", "title": "M4 database is locked",
        }), encoding="utf-8")
        annotation = "::error title=M4 [FP-82c05b CODE]::Error: database is locked\n" + PYTEST_RED
        payload = event(project, "PostToolUse", tool_name="Bash", tool_input={"command": "pytest -q"},
                        tool_response={"stdout": annotation, "exit_code": 1})
        done = hook(project, "record_command", payload)
        text = context_of(done)
        assert "FP-82c05b" in text and "released before COMMIT" in text and "50c6d446" in text
        assert evidence(project)[0]["fingerprints"] == ["FP-82c05b"]

    def test_an_unknown_fingerprint_is_recorded_but_recalls_nothing(self, project: Path) -> None:
        payload = event(project, "PostToolUse", tool_name="Bash", tool_input={"command": "pytest -q"},
                        tool_response={"stdout": "[FP-000000 CODE] x\n" + PYTEST_RED, "exit_code": 1})
        done = hook(project, "record_command", payload)
        assert done.stdout.strip() == ""
        assert evidence(project)[0]["fingerprints"] == ["FP-000000"]


class TestRecordChange:
    def test_a_production_edit_is_recorded_relative_to_the_project(self, project: Path) -> None:
        payload = event(project, "PostToolUse", tool_name="Edit",
                        tool_input={"file_path": str(project / "src" / "x.py"), "old_string": "a", "new_string": "b"},
                        tool_response={})
        done = hook(project, "record_change", payload)
        assert done.returncode == 0
        [record] = evidence(project)
        assert record == {**record, "kind": "file_change", "path": "src/x.py", "role": "production", "tool": "Edit"}

    def test_a_test_edit_during_green_asks_for_the_reason_and_never_denies(self, project: Path) -> None:
        _task(project, "feature", "green")
        payload = event(project, "PostToolUse", tool_name="Write",
                        tool_input={"file_path": str(project / "tests" / "test_x.py"), "content": "x"}, tool_response={})
        done = hook(project, "record_change", payload)
        text = context_of(done)
        assert "reason" in text.lower() and "tests/test_x.py" in text
        assert "permissionDecision" not in done.stdout
        assert evidence(project)[0]["role"] == "test"

    def test_a_test_edit_before_red_is_silent(self, project: Path) -> None:
        _task(project, "feature", "red")
        payload = event(project, "PostToolUse", tool_name="Write",
                        tool_input={"file_path": str(project / "tests" / "test_x.py"), "content": "x"}, tool_response={})
        done = hook(project, "record_change", payload)
        assert done.stdout.strip() == ""
        assert evidence(project)[0]["role"] == "test"

    def test_other_tools_are_ignored(self, project: Path) -> None:
        payload = event(project, "PostToolUse", tool_name="Bash", tool_input={"command": "ls"}, tool_response={})
        hook(project, "record_change", payload)
        assert evidence(project) == []


class TestPrecondition:
    def _edit(self, project: Path, path: str) -> dict[str, Any]:
        return event(project, "PreToolUse", tool_name="Edit",
                     tool_input={"file_path": str(project / path), "old_string": "a", "new_string": "b"})

    def test_production_code_in_red_without_a_failing_run_is_warned_about(self, project: Path) -> None:
        _task(project, "bug", "red", policy="warn")
        done = hook(project, "precondition", self._edit(project, "src/x.py"))
        text = context_of(done)
        assert "RED" in text and "failing" in text.lower()
        assert "permissionDecision" not in done.stdout

    def test_with_policy_block_it_is_denied_with_the_reason(self, project: Path) -> None:
        _task(project, "feature", "red", policy="block")
        done = hook(project, "precondition", self._edit(project, "src/x.py"))
        out = output_json(done)
        assert out["hookSpecificOutput"]["permissionDecision"] == "deny"
        assert "failing" in out["hookSpecificOutput"]["permissionDecisionReason"].lower()

    def test_with_a_failing_run_on_record_it_is_silent(self, project: Path) -> None:
        _task(project, "bug", "red", policy="block")
        Store(project / ".harness").append({"at": _at(1), "kind": "file_change", "path": "tests/test_x.py", "role": "test"})
        Store(project / ".harness").append({"at": _at(2), "kind": "command", "command": "pytest", "exit_code": 1,
                                            "test_run": {"runner": "pytest", "passed": 0, "failed": 1, "errors": 0}})
        done = hook(project, "precondition", self._edit(project, "src/x.py"))
        assert done.stdout.strip() == ""

    def test_a_test_file_is_always_allowed(self, project: Path) -> None:
        _task(project, "bug", "red", policy="block")
        done = hook(project, "precondition", self._edit(project, "tests/test_x.py"))
        assert done.stdout.strip() == ""

    def test_outside_red_it_is_silent(self, project: Path) -> None:
        _task(project, "bug", "green", policy="block")
        done = hook(project, "precondition", self._edit(project, "src/x.py"))
        assert done.stdout.strip() == ""

    def test_with_no_task_it_is_silent(self, project: Path) -> None:
        done = hook(project, "precondition", self._edit(project, "src/x.py"))
        assert done.stdout.strip() == ""


class TestRoute:
    def test_a_bug_report_opens_a_bug_and_suggests_systematic_debugging(self, project: Path) -> None:
        done = hook(project, "route", event(project, "UserPromptSubmit", prompt="fix the crash when saving a lesson"))
        text = context_of(done)
        task = load(project / ".harness")
        assert task is not None and task.type == "bug" and task.phase == "investigate"
        assert "systematic-debugging" in text and "investigate" in text

    def test_a_feature_request_opens_a_feature_and_suggests_brainstorming(self, project: Path) -> None:
        done = hook(project, "route", event(project, "UserPromptSubmit", prompt="add a button to export the plan"))
        text = context_of(done)
        task = load(project / ".harness")
        assert task is not None and task.type == "feature"
        assert "brainstorming" in text

    def test_an_open_task_is_never_replaced(self, project: Path) -> None:
        _task(project, "bug", "green")
        done = hook(project, "route", event(project, "UserPromptSubmit", prompt="add a button to export the plan"))
        text = context_of(done)
        task = load(project / ".harness")
        assert task is not None and task.type == "bug" and task.title == "x"
        assert "green" in text

    def test_small_talk_and_slash_commands_open_nothing(self, project: Path) -> None:
        for prompt in ("ok great", "/goal do everything", "thanks"):
            done = hook(project, "route", event(project, "UserPromptSubmit", prompt=prompt))
            assert done.returncode == 0
            assert load(project / ".harness") is None, prompt

    def test_the_suggestion_is_recorded_as_evidence(self, project: Path) -> None:
        hook(project, "route", event(project, "UserPromptSubmit", prompt="fix the crash when saving"))
        kinds = [r["kind"] for r in evidence(project)]
        assert "route" in kinds


HONEST: list[dict[str, Any]] = [
    {"at": _at(1), "kind": "file_change", "path": "tests/test_x.py", "role": "test"},
    {"at": _at(2), "kind": "command", "command": "pytest", "exit_code": 1,
     "test_run": {"runner": "pytest", "passed": 0, "failed": 1, "errors": 0}},
    {"at": _at(3), "kind": "file_change", "path": "src/x.py", "role": "production"},
    {"at": _at(4), "kind": "command", "command": "pytest", "exit_code": 0,
     "test_run": {"runner": "pytest", "passed": 1, "failed": 0, "errors": 0}},
    {"at": _at(5), "kind": "command", "command": "ruff check src", "exit_code": 0, "test_run": None},
]


class TestCompletionGate:
    def test_no_task_means_no_opinion(self, project: Path) -> None:
        done = hook(project, "completion_gate", event(project, "Stop", stop_hook_active=False))
        assert done.returncode == 0 and done.stdout.strip() == ""

    def test_an_incomplete_task_blocks_the_stop_once_with_the_gap(self, project: Path) -> None:
        _task(project, "feature", "spec")
        done = hook(project, "completion_gate", event(project, "Stop", stop_hook_active=False))
        out = output_json(done)
        assert out["decision"] == "block"
        assert "RED_BEFORE_GREEN" in out["reason"] and "UNVERIFIED" in out["reason"]

    def test_when_the_stop_hook_is_already_active_it_never_blocks(self, project: Path) -> None:
        _task(project, "feature", "spec")
        done = hook(project, "completion_gate", event(project, "Stop", stop_hook_active=True))
        assert "block" not in done.stdout

    def test_it_stops_blocking_after_two_tries_with_no_new_evidence(self, project: Path) -> None:
        """A gate that blocks forever is the bureaucracy the design rejects. Two
        refusals on the same evidence, then it steps aside and only says so."""
        _task(project, "feature", "spec")
        first = output_json(hook(project, "completion_gate", event(project, "Stop", stop_hook_active=False)))
        second = output_json(hook(project, "completion_gate", event(project, "Stop", stop_hook_active=False)))
        assert first["decision"] == "block" and second["decision"] == "block"
        third = hook(project, "completion_gate", event(project, "Stop", stop_hook_active=False))
        assert "\"block\"" not in third.stdout
        assert "UNVERIFIED" in third.stdout

    def test_new_evidence_resets_the_budget(self, project: Path) -> None:
        _task(project, "feature", "spec")
        for _ in range(2):
            hook(project, "completion_gate", event(project, "Stop", stop_hook_active=False))
        Store(project / ".harness").append({"at": _at(1), "kind": "hypothesis", "text": "new"})
        again = output_json(hook(project, "completion_gate", event(project, "Stop", stop_hook_active=False)))
        assert again["decision"] == "block"

    def test_a_pass_lets_the_stop_through_and_completes_the_task(self, project: Path) -> None:
        _task(project, "feature", "verify")
        for record in HONEST:
            Store(project / ".harness").append(record)
        done = hook(project, "completion_gate", event(project, "Stop", stop_hook_active=False))
        assert "block" not in done.stdout
        task = load(project / ".harness")
        assert task is not None and task.phase == "complete"

    def test_a_complete_task_is_left_alone(self, project: Path) -> None:
        _task(project, "spike", "complete")
        done = hook(project, "completion_gate", event(project, "Stop", stop_hook_active=False))
        assert done.stdout.strip() == ""
