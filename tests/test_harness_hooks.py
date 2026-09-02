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

    def test_the_real_event_this_build_sends_carries_no_exit_code_at_all(self, project: Path) -> None:
        """CAPTURED, NOT IMAGINED. 2026-09-02, Claude Code on this machine.

        Every other test in this class feeds `tool_response` an `exit_code`
        field. This build never sends one. The real PostToolUse response for a
        Bash call has exactly these five keys, captured by dumping the raw
        event from inside the hook:

            {"stdout": ..., "stderr": ..., "interrupted": false,
             "isImage": false, "noOutputExpected": false}

        The consequence was measured in this repository's own evidence file:
        1,076 recorded commands, EVERY ONE with `exit_code: null`, so
        `VERIFICATION_RAN` -- which requires `exit_code == 0` -- could never
        pass for anybody. The suite was green against a shape that does not
        exist.
        """
        payload = event(
            project, "PostToolUse", tool_name="Bash", tool_input={"command": "ruff check ."},
            tool_response={"stdout": "All checks passed!", "stderr": "", "interrupted": False,
                           "isImage": False, "noOutputExpected": False},
        )
        hook(project, "record_command", payload)
        assert evidence(project)[0]["exit_code"] == 0

    def test_a_command_that_failed_never_reaches_this_hook_so_absence_means_success(self, project: Path) -> None:
        """WHY ABSENCE MAY BE READ AS SUCCESS, and it is a measurement.

        `echo x && exit 7` and `echo y && exit 3` were run through the real
        tool with the hook dumping every event it received. Four events
        arrived; both failures were absent. PostToolUse does not fire for a
        Bash call that exited non-zero in this build, so the hook's own
        invocation is the evidence that the command succeeded.

        This is the one inference in the file, it rests on a capture rather
        than on a guess, and the two tests below fence it: an explicit code
        still wins, and an interrupted run is still unknown.
        """
        payload = event(project, "PostToolUse", tool_name="Bash", tool_input={"command": "pytest -q"},
                        tool_response={"stdout": PYTEST_GREEN})
        hook(project, "record_command", payload)
        assert evidence(project)[0]["exit_code"] == 0

    @pytest.mark.parametrize("key", ["exit_code", "exitCode", "returncode", "return_code", "status"])
    def test_every_spelling_of_an_explicit_failure_is_believed(self, project: Path, key: str) -> None:
        """FIVE NAMES ARE READ, SO FIVE NAMES ARE TESTED.

        The fence "an explicit exit code always wins" was tested for one
        spelling, so deleting four of the five from `_EXIT_KEYS` was a mutant
        that survived -- and every one it dropped would have turned a reported
        failure into a recorded success. Claude Code sends none of these today;
        they are here for the build that starts to, and a fence nobody tests is
        a fence that is not there.
        """
        payload = event(project, "PostToolUse", tool_name="Bash", tool_input={"command": "ruff check src"},
                        tool_response={"stdout": "Found 1 error.", "stderr": "", key: 1})
        hook(project, "record_command", payload)
        assert evidence(project)[0]["exit_code"] == 1

    def test_a_boolean_is_not_an_exit_code(self, project: Path) -> None:
        """`True` is an `int` in Python, so a response carrying `status: true`
        would be read as exit 1 and a passing command recorded as failed. The
        guard that skips booleans had no test, so removing it was a surviving
        mutant."""
        payload = event(project, "PostToolUse", tool_name="Bash", tool_input={"command": "ruff check src"},
                        tool_response={"stdout": "All checks passed!", "stderr": "", "status": True})
        hook(project, "record_command", payload)
        assert evidence(project)[0]["exit_code"] == 0

    def test_an_explicit_exit_code_still_wins_over_the_inference(self, project: Path) -> None:
        """A future build may start sending one, or start firing on failure.

        Then the field is the truth and the inference must not overrule it --
        recording 0 for a command that reported 1 would make every gate lie.
        """
        payload = event(project, "PostToolUse", tool_name="Bash", tool_input={"command": "pytest -q"},
                        tool_response={"stdout": PYTEST_RED, "exit_code": 1})
        hook(project, "record_command", payload)
        assert evidence(project)[0]["exit_code"] == 1

    def test_an_interrupted_command_is_unknown_not_success(self, project: Path) -> None:
        """The user pressed stop. Nothing was proved, and the row must not say
        it was: this is the half of "unknown, not zero" that still holds."""
        payload = event(project, "PostToolUse", tool_name="Bash", tool_input={"command": "pytest -q"},
                        tool_response={"stdout": "collecting...", "interrupted": True})
        hook(project, "record_command", payload)
        assert evidence(project)[0]["exit_code"] is None

    def test_a_backgrounded_command_is_unknown_because_it_has_not_finished(self, project: Path) -> None:
        """THE INFERENCE'S WORST FAILURE, FOUND BY REVIEW AND REPRODUCED.

        A Bash call started in the background fires this hook AT LAUNCH, with an
        empty response and no exit status, and no later event ever corrects the
        row. Reading absence as success there records 0 for a command that goes
        on to fail -- measured: `ruff check /nonexistent` run in the background
        was reported by the runner as "failed with exit code 1" while the
        evidence row said `exit_code: 0`. A gate that passes off that row is
        worse than one that never passes.

        The launch response carries `backgroundTaskId`, and the tool input
        carries `run_in_background`. Either is enough to know nothing has been
        proved yet.
        """
        payload = event(
            project, "PostToolUse", tool_name="Bash",
            tool_input={"command": "ruff check src", "run_in_background": True},
            tool_response={"stdout": "", "stderr": "", "interrupted": False, "isImage": False,
                           "noOutputExpected": False, "backgroundTaskId": "bs5r630ed"},
        )
        hook(project, "record_command", payload)
        assert evidence(project)[0]["exit_code"] is None

    def test_a_background_marker_alone_is_enough_to_stay_unknown(self, project: Path) -> None:
        """A command MOVED to the background after outrunning its timeout is
        recorded the same way and does not carry `run_in_background` in its
        input. Measured in this repository's own evidence: a pytest run moved
        to the background was recorded `exit_code: 0` with an empty output tail
        while it was still running."""
        payload = event(
            project, "PostToolUse", tool_name="Bash", tool_input={"command": "ruff check src"},
            tool_response={"stdout": "", "stderr": "", "backgroundTaskId": "bvpzy8vrx"},
        )
        hook(project, "record_command", payload)
        assert evidence(project)[0]["exit_code"] is None

    def test_a_silent_response_is_unknown_because_a_launch_looks_exactly_like_it(self, project: Path) -> None:
        """The last fence, and the one that needs no knowledge of how the runner
        backgrounds things. Every launch event observed has empty stdout AND
        empty stderr. A command that finished silently looks identical, and the
        hook cannot tell them apart -- so it says nothing, which is what it said
        before any of this. A check whose output is silent can be made to speak
        (`ruff check . && echo ok`); a gate that guesses cannot be un-lied."""
        payload = event(project, "PostToolUse", tool_name="Bash", tool_input={"command": "ruff check src"},
                        tool_response={"stdout": "", "stderr": "", "interrupted": False})
        hook(project, "record_command", payload)
        assert evidence(project)[0]["exit_code"] is None

    def test_a_pipeline_hides_the_verifier_failure_so_it_stays_unknown(self, project: Path) -> None:
        """THE SECOND FINDING. `looks_like_verification` matches a verifier in
        ANY segment, while an exit status belongs to the whole shell. In
        `ruff ... | tail` the pipeline reports tail's status, so ruff can fail
        while the shell succeeds -- and every red test run in this repository's
        history is piped through grep or tail, because an unpiped failure
        produces no event at all. Inferring 0 there would certify a failure."""
        payload = event(project, "PostToolUse", tool_name="Bash",
                        tool_input={"command": "ruff check src 2>&1 | tail -2"},
                        tool_response={"stdout": "Found 1 error.", "stderr": ""})
        hook(project, "record_command", payload)
        assert evidence(project)[0]["exit_code"] is None

    def test_a_semicolon_or_an_or_also_hides_it(self, project: Path) -> None:
        """`;` runs the next command regardless, and `||` runs it BECAUSE the
        first failed. Both leave a shell status that says nothing about the
        verifier."""
        for command in ("ruff check src; echo done", "ruff check src || echo tried"):
            fresh = event(project, "PostToolUse", tool_name="Bash", tool_input={"command": command},
                          tool_response={"stdout": "done", "stderr": ""})
            hook(project, "record_command", fresh)
        assert [r["exit_code"] for r in evidence(project)] == [None, None]

    def test_an_and_chain_is_safe_because_every_link_must_have_succeeded(self, project: Path) -> None:
        """`cd x && ruff check .` is the everyday shape, and it is sound: with
        `&&` the shell exits 0 only when every command in the chain did."""
        payload = event(project, "PostToolUse", tool_name="Bash",
                        tool_input={"command": 'cd "/repo" && ruff check src'},
                        tool_response={"stdout": "All checks passed!", "stderr": ""})
        hook(project, "record_command", payload)
        assert evidence(project)[0]["exit_code"] == 0

    def test_a_response_that_is_only_text_says_nothing_about_the_exit(self, project: Path) -> None:
        """A bare string carries no `interrupted` flag and no fields at all, so
        there is nothing to read -- and nothing is invented."""
        payload = event(project, "PostToolUse", tool_name="Bash", tool_input={"command": "pytest -q"},
                        tool_response=PYTEST_GREEN)
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

    def test_a_pasted_report_that_quotes_failure_words_opens_nothing(self, project: Path) -> None:
        """MEASURED in the router's first hour: the owner pasted a status report
        whose table quoted 'failed' and 'error' and ended with a question, and a
        bug task was opened with the report's first eighty characters as its
        title. A report is not an ask."""
        pasted = (
            "What exists now, mapped to your phases\n\n"
            "| Phase | Built as |\n|---|---|\n| 1 | tests failed with ModuleNotFoundError, then passed |\n\n"
            "the end-to-end test drives one bug from prompt to complete\n"
            "/goal what works now and what happens when i send a task spec"
        )
        hook(project, "route", event(project, "UserPromptSubmit", prompt=pasted))
        assert load(project / ".harness") is None

    def test_a_bug_report_followed_by_a_long_paste_still_opens_a_bug(self, project: Path) -> None:
        """The ask is the first line a person types; what follows may be the log."""
        prompt = "fix the crash when saving a lesson, here is the log:\n" + "\n".join(f"line {i}" for i in range(80))
        hook(project, "route", event(project, "UserPromptSubmit", prompt=prompt))
        task = load(project / ".harness")
        assert task is not None and task.type == "bug"
        assert task.title.startswith("fix the crash when saving a lesson")

    def test_a_code_block_is_never_an_ask(self, project: Path) -> None:
        prompt = "fix this\n```\nError: broken\n```"
        hook(project, "route", event(project, "UserPromptSubmit", prompt=prompt))
        assert load(project / ".harness") is None

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
