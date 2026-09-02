"""The wiring: the hooks Claude Code will actually run, as configured.

A hook that exists but is not wired enforces nothing, and a wired command
that points at a missing file fails silently on every event. So this reads
the project settings the way Claude Code does and checks each event in the
spec's table is bound to a script that exists, with the matcher the spec
names. It also checks the runtime directory can never be committed.

Spec: docs/superpowers/specs/2026-09-02-engineering-harness-design.md
"""

from __future__ import annotations

import ast
import json
import re
import subprocess
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parent.parent
SETTINGS = REPO / ".claude" / "settings.json"
HOOKS = REPO / "scripts" / "harness" / "hooks"

#: event -> (matcher or None, script name)
EXPECTED: dict[str, list[tuple[str | None, str]]] = {
    "UserPromptSubmit": [(None, "route.py")],
    "PostToolUse": [("Bash", "record_command.py"), ("Edit|Write|MultiEdit", "record_change.py")],
    "PreToolUse": [("Edit|Write|MultiEdit", "precondition.py")],
    "Stop": [(None, "completion_gate.py")],
}


def _settings() -> dict[str, Any]:
    loaded: dict[str, Any] = json.loads(SETTINGS.read_text(encoding="utf-8"))
    return loaded


def _bindings(settings: dict[str, Any], event: str) -> list[tuple[str | None, str]]:
    out: list[tuple[str | None, str]] = []
    for group in settings.get("hooks", {}).get(event, []):
        matcher = group.get("matcher")
        for entry in group.get("hooks", []):
            out.append((matcher if isinstance(matcher, str) and matcher else None, str(entry.get("command", ""))))
    return out


def test_the_settings_file_is_json_with_a_hooks_section() -> None:
    settings = _settings()
    assert isinstance(settings.get("hooks"), dict)


@pytest.mark.parametrize(("event", "expected"), sorted(EXPECTED.items()))
def test_every_event_in_the_spec_is_wired_to_its_script(event: str, expected: list[tuple[str | None, str]]) -> None:
    bound = _bindings(_settings(), event)
    for matcher, script in expected:
        matching = [cmd for m, cmd in bound if m == matcher and script in cmd]
        assert matching, f"{event} with matcher {matcher!r} is not wired to {script}; bound: {bound}"


def test_every_wired_command_points_at_a_file_that_exists_and_is_a_hook() -> None:
    for event in EXPECTED:
        for _, command in _bindings(_settings(), event):
            found = re.search(r"scripts/harness/hooks/([a-z_]+\.py)", command)
            assert found, f"{event}: {command!r} does not name a harness hook"
            assert (HOOKS / found.group(1)).exists(), f"{event}: {found.group(1)} is missing"
            assert "$CLAUDE_PROJECT_DIR" in command or "${CLAUDE_PROJECT_DIR}" in command, command


def test_every_hook_is_a_command_hook_with_a_short_timeout() -> None:
    settings = _settings()
    for event in EXPECTED:
        for group in settings["hooks"].get(event, []):
            for entry in group.get("hooks", []):
                assert entry.get("type") == "command"
                assert 0 < int(entry.get("timeout", 0)) <= 30, entry


def test_the_runtime_directory_is_ignored_by_git() -> None:
    done = subprocess.run(
        ["git", "-C", str(REPO), "check-ignore", "-q", ".harness/task.json"], check=False, capture_output=True,
    )
    assert done.returncode == 0, ".harness/ is not gitignored"


def test_nothing_in_the_harness_imports_a_way_to_spawn_a_process() -> None:
    """Hooks must finish in milliseconds and never spawn anything: the spec's
    'cheap, deterministic, narrow'. The rest of the package follows, because
    the security gate verifies every subprocess call in scripts/ against a
    registry, and admitting new code to that registry is editing a gate. The
    commit is read from .git by hand instead. Judged from the import graph,
    not from the words in the file -- a docstring may say 'subprocess'; code
    may not import it."""
    forbidden = {"subprocess", "os.system", "os.popen", "pty", "multiprocessing"}
    for path in HOOKS.parent.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        imported: set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported.update(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imported.add(node.module)
                imported.update(f"{node.module}.{alias.name}" for alias in node.names)
        assert not (imported & forbidden), f"{path.name} imports {sorted(imported & forbidden)}"


def test_every_hook_command_exits_zero_when_the_script_cannot_be_found(tmp_path: Path) -> None:
    """Measured on the first wiring: $CLAUDE_PROJECT_DIR was the folder Claude
    Code was opened in, not this repository, python exited 2, and a PreToolUse
    exit 2 blocked every edit -- including the one that would have fixed it."""
    for event in EXPECTED:
        for _, command in _bindings(_settings(), event):
            done = subprocess.run(
                ["sh", "-c", command], cwd=tmp_path, input="{}", capture_output=True, text=True, check=False,
                env={"PATH": "/usr/bin:/bin", "CLAUDE_PROJECT_DIR": str(tmp_path), "PWD": str(tmp_path)},
            )
            assert done.returncode == 0, f"{event}: {command!r} exited {done.returncode}: {done.stderr}"


def test_every_hook_command_finds_the_script_from_a_child_of_the_project_dir(tmp_path: Path) -> None:
    """The layout that broke it: the repository is a child of the folder Claude
    Code was opened in. The command must still find and run the hook."""
    for event in EXPECTED:
        for _, command in _bindings(_settings(), event):
            done = subprocess.run(
                ["sh", "-c", command], cwd=tmp_path, input="{}", capture_output=True, text=True, check=False,
                env={"PATH": "/usr/bin:/bin:/opt/homebrew/bin", "CLAUDE_PROJECT_DIR": str(REPO.parent), "PWD": str(tmp_path)},
            )
            assert done.returncode == 0, f"{event}: {command!r} exited {done.returncode}: {done.stderr}"
