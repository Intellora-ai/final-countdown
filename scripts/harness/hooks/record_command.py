#!/usr/bin/env python3
"""PostToolUse(Bash): record what ran, and read the test summary if it was one.

This is where "the tests pass" stops being a sentence. The runner's own
summary is parsed into numbers; anything that cannot be parsed is `None`,
which the verifier treats as no evidence. A fingerprint seen before brings
back the root cause a completed task recorded for it.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from harness.evidence import Store, looks_like_test_command, parse_test_output  # noqa: E402
from harness.hooks._common import context, guarded, now, project_dir, read_event, root  # noqa: E402
from harness.memory import fingerprints_in, recall  # noqa: E402

_EXIT_KEYS = ("exit_code", "exitCode", "returncode", "return_code", "status")
_TAIL = 600


def _text_and_exit(response: Any) -> tuple[str, int | None]:
    if isinstance(response, str):
        return response, None
    if not isinstance(response, dict):
        return "", None
    parts: list[str] = []
    for key in ("stdout", "output", "stderr"):
        value = response.get(key)
        if isinstance(value, str) and value:
            parts.append(value)
    exit_code: int | None = None
    for key in _EXIT_KEYS:
        value = response.get(key)
        if isinstance(value, bool):
            continue
        if isinstance(value, int):
            exit_code = value
            break
    return "\n".join(parts), exit_code


def _recorded_fingerprints(project: Path) -> list[str]:
    """What the flight recorder wrote for the last run, if it wrote anything."""
    path = project / "test-results" / "failures.json"
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    found: list[str] = []
    failures = loaded.get("failures") if isinstance(loaded, dict) else None
    if isinstance(failures, list):
        for item in failures:
            if isinstance(item, dict):
                fingerprint = item.get("fingerprint")
                if isinstance(fingerprint, str) and fingerprint not in found:
                    found.append(fingerprint)
    return found


def main() -> None:
    event = read_event()
    if event is None or event.get("tool_name") != "Bash":
        return
    tool_input = event.get("tool_input")
    command = tool_input.get("command") if isinstance(tool_input, dict) else None
    if not isinstance(command, str) or not command.strip():
        return

    text, exit_code = _text_and_exit(event.get("tool_response"))
    runner = looks_like_test_command(command)
    test_run = parse_test_output(runner, text) if runner else None

    fingerprints = fingerprints_in(text)
    if runner:
        for extra in _recorded_fingerprints(project_dir(event)):
            if extra not in fingerprints:
                fingerprints.append(extra)

    Store(root(event)).append({
        "at": now(),
        "kind": "command",
        "command": command,
        "exit_code": exit_code,
        "test_run": test_run,
        "fingerprints": fingerprints,
        "output_tail": text[-_TAIL:],
    })

    known = recall(root(event), fingerprints)
    if known:
        lines = ["harness memory: this failure has been seen and fixed before."]
        for record in known:
            lines.append(
                f"  {record.get('fingerprint')}: root cause was {record.get('root_cause')!r}, "
                f"fixed in commit {record.get('fix_commit')} ({record.get('title')}). "
                "Check that fix before forming a new hypothesis."
            )
        context("PostToolUse", "\n".join(lines))


if __name__ == "__main__":
    guarded(main)
