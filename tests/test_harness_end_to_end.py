"""One bug, start to finish, through the real seams: the hooks as processes
with the event JSON Claude Code sends, and the CLI as a process.

This is the dogfood run the plan asks for, kept as a test so it runs on every
push. It is the whole promise in one sitting: the router opens the task, the
hooks record what happened, the gate refuses until the evidence is there, the
verifier passes only on evidence, and the task ends `complete` without Claude
ever being allowed to say so itself.

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
CLI = REPO / "scripts" / "harness" / "cli.py"
sys.path.insert(0, str(REPO / "scripts"))

from harness.state import load  # noqa: E402


@pytest.fixture
def project(tmp_path: Path) -> Path:
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    subprocess.run(["git", "-C", str(tmp_path), "config", "user.email", "t@example.com"], check=True)
    subprocess.run(["git", "-C", str(tmp_path), "config", "user.name", "t"], check=True)
    (tmp_path / "src").mkdir()
    (tmp_path / "tests").mkdir()
    (tmp_path / "src" / "save.py").write_text("def save(x):\n    return x\n", encoding="utf-8")
    subprocess.run(["git", "-C", str(tmp_path), "add", "."], check=True)
    subprocess.run(["git", "-C", str(tmp_path), "commit", "-q", "-m", "first"], check=True)
    return tmp_path


def _env(project: Path) -> dict[str, str]:
    return {**os.environ, "HARNESS_ROOT": str(project / ".harness"), "CLAUDE_PROJECT_DIR": str(project)}


def hook(project: Path, name: str, **fields: Any) -> dict[str, Any] | None:
    payload = {"session_id": "s", "transcript_path": "t", "cwd": str(project), **fields}
    done = subprocess.run(
        [sys.executable, str(HOOKS / f"{name}.py")], input=json.dumps(payload), cwd=project, env=_env(project),
        capture_output=True, text=True, check=False, timeout=60,
    )
    assert done.returncode == 0, done.stderr
    if not done.stdout.strip():
        return None
    out: dict[str, Any] = json.loads(done.stdout)
    return out


def cli(project: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(CLI), *args], cwd=project, env=_env(project),
        capture_output=True, text=True, check=False, timeout=60,
    )


def bash(project: Path, command: str, stdout: str, exit_code: int) -> dict[str, Any] | None:
    return hook(project, "record_command", hook_event_name="PostToolUse", tool_name="Bash",
                tool_input={"command": command}, tool_response={"stdout": stdout, "stderr": "", "exit_code": exit_code})


def _tool_input(project: Path, path: str) -> dict[str, str]:
    return {"file_path": str(project / path), "old_string": "a", "new_string": "b"}


def attempt(project: Path, path: str) -> dict[str, Any] | None:
    """The moment BEFORE an edit: only the precondition hook runs. What it
    says is what Claude sees before deciding whether to go ahead."""
    return hook(project, "precondition", hook_event_name="PreToolUse", tool_name="Edit",
                tool_input=_tool_input(project, path))


def edit(project: Path, path: str) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """An edit that was made: the precondition ran, and then the change was recorded."""
    before = attempt(project, path)
    after = hook(project, "record_change", hook_event_name="PostToolUse", tool_name="Edit",
                 tool_input=_tool_input(project, path), tool_response={})
    return before, after


def stop(project: Path) -> dict[str, Any] | None:
    return hook(project, "completion_gate", hook_event_name="Stop", stop_hook_active=False)


def phase(project: Path) -> str:
    task = load(project / ".harness")
    assert task is not None
    return task.phase


def test_a_bug_travels_from_report_to_complete_on_evidence_alone(project: Path) -> None:
    # 1. The person reports a bug. The router opens the task and suggests the skill.
    routed = hook(project, "route", hook_event_name="UserPromptSubmit", prompt="fix the crash when saving a lesson")
    assert routed is not None and "systematic-debugging" in routed["hookSpecificOutput"]["additionalContext"]
    assert phase(project) == "investigate"

    # 2. Stopping now is refused: nothing is on record.
    refused = stop(project)
    assert refused is not None and refused["decision"] == "block" and "ROOT_CAUSE_RECORDED" in refused["reason"]

    # 3. Investigate: reproduce by running the thing and watching it fail; write the hypothesis down.
    bash(project, "pytest -q -k save", "1 failed in 0.05s\n", 1)
    assert cli(project, "hypothesis", "save() returns its input instead of writing it").returncode == 0
    assert cli(project, "advance").returncode == 0 and phase(project) == "root_cause"
    assert cli(project, "advance").returncode == 0 and phase(project) == "red"

    # 4. In red, reaching for production first is warned about -- and, heeding
    #    it, the edit is not made. Writing the test is not warned about.
    warned = attempt(project, "src/save.py")
    assert warned is not None and "RED" in warned["hookSpecificOutput"]["additionalContext"]
    silent, _ = edit(project, "tests/test_save.py")
    assert silent is None

    # 5. Tests before code: the new test runs and fails. Only now may red become green.
    assert cli(project, "advance").returncode == 1  # no failing run after the test was written yet
    bash(project, "pytest tests/test_save.py -q", "1 failed in 0.04s\n", 1)
    assert cli(project, "advance").returncode == 0 and phase(project) == "green"

    # 6. Implement, then watch it pass. A stop is still refused: no green run after the change yet.
    edit(project, "src/save.py")
    refused_again = stop(project)
    assert refused_again is not None and refused_again["decision"] == "block"
    assert "GREEN_AFTER_LAST_CHANGE" in refused_again["reason"]
    bash(project, "pytest tests/test_save.py -q", "2 passed in 0.04s\n", 0)
    assert cli(project, "advance").returncode == 0 and phase(project) == "refactor"
    assert cli(project, "advance").returncode == 0 and phase(project) == "verify"

    # 7. Verification is the static half, and it has to run after the last change.
    still = stop(project)
    assert still is not None and "VERIFICATION_RAN" in still["reason"]
    bash(project, "ruff check src", "All checks passed!\n", 0)

    # 8. Now the verifier passes and the gate lets the stop through, completing the task itself.
    allowed = stop(project)
    assert allowed is not None and "block" not in json.dumps(allowed)
    assert "PASS" in allowed["systemMessage"]
    assert phase(project) == "complete"

    # 9. The whole story is on disk, in order, as evidence a person can read.
    kinds = [json.loads(line)["kind"] for line in (project / ".harness" / "evidence.jsonl").read_text().splitlines()]
    assert kinds[0] == "route" and kinds[-1] == "verdict"
    assert kinds.count("file_change") == 2 and kinds.count("hypothesis") == 1  # the test, then the fix
    verdict = json.loads((project / ".harness" / "verdict.json").read_text(encoding="utf-8"))
    assert verdict["status"] == "PASS" and all(r["ok"] for r in verdict["rules"])


def test_code_before_tests_is_refused_all_the_way_to_the_gate(project: Path) -> None:
    """The other direction of the whole harness: an honest-looking session that
    wrote the code first never reaches complete."""
    hook(project, "route", hook_event_name="UserPromptSubmit", prompt="add an export button")
    assert phase(project) == "spec"
    assert cli(project, "advance").returncode == 0 and phase(project) == "red"

    edit(project, "src/save.py")  # code first
    edit(project, "tests/test_save.py")  # test after
    bash(project, "pytest -q", "1 failed in 0.04s\n", 1)  # it fails, but the order is wrong
    blocked = cli(project, "advance")
    assert blocked.returncode == 1 and "production code changed before" in blocked.stdout

    # Even if the phases are forced and every later run is green, the verifier still says no.
    bash(project, "pytest -q", "2 passed in 0.04s\n", 0)
    bash(project, "ruff check src", "All checks passed!\n", 0)
    verdict = cli(project, "done")
    assert verdict.returncode == 1 and "RED_BEFORE_GREEN" in verdict.stdout
    assert phase(project) != "complete"
