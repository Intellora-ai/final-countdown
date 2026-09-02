#!/usr/bin/env python3
"""PostToolUse(Bash): record what ran, and read the test summary if it was one.

This is where "the tests pass" stops being a sentence. The runner's own
summary is parsed into numbers; anything that cannot be parsed is `None`,
which the verifier treats as no evidence. A fingerprint seen before brings
back the root cause a completed task recorded for it.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any, cast

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from harness.evidence import Store, looks_like_test_command, parse_test_output  # noqa: E402
from harness.hooks._common import context, guarded, now, project_dir, read_event, root  # noqa: E402
from harness.memory import fingerprints_in, recall  # noqa: E402

_EXIT_KEYS = ("exit_code", "exitCode", "returncode", "return_code", "status")
_TAIL = 600


def _text_and_exit(response: Any) -> tuple[str, int | None]:
    """The output text, and what can honestly be said about the exit status.

    THE FIELD IS NOT THERE, AND THIS WAS MEASURED. Claude Code's PostToolUse
    response for a Bash call carries exactly five keys on this build --
    `stdout`, `stderr`, `interrupted`, `isImage`, `noOutputExpected` -- and no
    exit code under any of the five names below. The consequence was visible
    in this repository's own evidence file: 1,076 recorded commands, EVERY one
    with `exit_code: null`, so `VERIFICATION_RAN` (which requires
    `exit_code == 0`) could never pass for anybody, and the harness could not
    tell a green typecheck from a red one.

    SO WHAT DOES ABSENCE MEAN. `echo x && exit 7` and `echo y && exit 3` were
    run through the real tool with this hook dumping every event it received.
    Four events arrived and both failures were absent: PostToolUse does not
    fire for a Bash call that exited non-zero. The hook's own invocation is
    therefore the evidence that the command succeeded, and reading absence as
    zero is a measurement rather than an assumption.

    IT IS FENCED ON BOTH SIDES, because an inference that outlives its
    measurement is how a gate starts lying:
      - an explicit exit code always wins, so a future build that sends one
        (or starts firing on failure) is believed instead of overruled;
      - `interrupted` means the person pressed stop, which proves nothing, so
        it stays unknown;
      - a response that is only a string has no fields to read, so nothing is
        inferred from it either.
    """
    if isinstance(response, str):
        return response, None
    if not isinstance(response, dict):
        return "", None
    fields = cast(dict[str, Any], response)
    parts: list[str] = []
    for key in ("stdout", "output", "stderr"):
        value = fields.get(key)
        if isinstance(value, str) and value:
            parts.append(value)
    exit_code: int | None = None
    for key in _EXIT_KEYS:
        value = fields.get(key)
        if isinstance(value, bool):
            continue
        if isinstance(value, int):
            exit_code = value
            break
    return "\n".join(parts), exit_code


# The shell operators that join one command to the next. `2>&1` is a redirect,
# not a join, and is deliberately not matched: a lone `&` is not in this list.
_JOINS = re.compile(r"&&|\|\||;|\|")
# A trailing `&` puts the command in the background, so the shell returns
# before it has finished and its status is not the command's.
_TRAILING_BACKGROUND = re.compile(r"&\s*$")


def _finished_and_clean(command: str, event: dict[str, Any], response: Any, text: str) -> bool:
    """Whether the hook can honestly say this command succeeded.

    THE FIELD IS NOT THERE, AND THAT WAS MEASURED. Claude Code's PostToolUse
    response for a Bash call carries `stdout`, `stderr`, `interrupted`,
    `isImage`, `noOutputExpected` and nothing else -- no exit code under any of
    the five names tried above. The consequence was visible in this
    repository's own evidence file: 1,076 recorded commands, EVERY one with
    `exit_code: null`, so `VERIFICATION_RAN` (which requires 0) could never
    pass for anybody and the harness could not tell a green typecheck from a
    red one.

    ABSENCE CAN MEAN SUCCESS, BUT ONLY SOMETIMES, and the difference was found
    by review after a first version got it wrong. `exit 7` and `exit 3` in the
    FOREGROUND produce no event at all, so an event that arrives is evidence
    the command finished and returned 0. A BACKGROUNDED command fires this
    hook at LAUNCH instead -- reproduced: `ruff check /nonexistent` in the
    background was reported by the runner as "failed with exit code 1" while
    its evidence row said `exit_code: 0`, and no later event corrects it.

    So the inference is fenced four ways, and each fence is a measurement:

      1. a background marker (`backgroundTaskId`, or `run_in_background` in the
         tool input) means nothing has been proved yet;
      2. `interrupted` means the person pressed stop;
      3. NO OUTPUT AT ALL means it cannot be told apart from a launch, which is
         always silent -- a check that finishes silently is recorded unknown,
         exactly as it was before any of this;
      4. a shell whose parts are joined by anything but `&&` reports a status
         that need not be the verifier's: `ruff ... | tail` reports tail's, and
         `ruff ...; echo done` reports echo's. With `&&` alone, a 0 means every
         link succeeded, which is the everyday `cd x && ruff check .`.
    """
    if not isinstance(response, dict):
        return False
    fields = cast(dict[str, Any], response)
    if fields.get("backgroundTaskId"):
        return False
    tool_input = event.get("tool_input")
    if isinstance(tool_input, dict) and tool_input.get("run_in_background"):
        return False
    if bool(fields.get("interrupted")):
        return False
    if not text.strip():
        return False
    if _TRAILING_BACKGROUND.search(command):
        return False
    return all(join == "&&" for join in _JOINS.findall(command))


def _recorded_fingerprints(project: Path) -> list[str]:
    """What the flight recorder wrote for the last run, if it wrote anything."""
    path = project / "test-results" / "failures.json"
    try:
        loaded: Any = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    found: list[str] = []
    if not isinstance(loaded, dict):
        return found
    failures = cast(dict[str, Any], loaded).get("failures")
    if not isinstance(failures, list):
        return found
    for item in failures:
        if isinstance(item, dict):
            fingerprint = cast(dict[str, Any], item).get("fingerprint")
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

    response = event.get("tool_response")
    text, exit_code = _text_and_exit(response)
    if exit_code is None and _finished_and_clean(command, event, response, text):
        exit_code = 0
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
