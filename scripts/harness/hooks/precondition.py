#!/usr/bin/env python3
"""PreToolUse(Edit|Write|MultiEdit): production code in phase `red` needs a
failing test run on record first.

This is "tests before code" as a precondition on the action rather than a
line in CLAUDE.md. With `policy=warn` (the default) Claude is told and may
proceed with a stated reason; with `policy=block` the edit is denied. A rigid
system that rejects everything is the bureaucracy the design rejects, so the
default is the warning.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, cast

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from harness.evidence import Store, classify_path  # noqa: E402
from harness.hooks._common import EDIT_TOOLS, context, emit, guarded, read_event, relative, root, tool_file  # noqa: E402
from harness.state import entered_phase_at, load  # noqa: E402


def _has_red_since(where: Path, since: str) -> bool:
    for record in Store(where).read():
        if record.get("kind") != "command" or str(record.get("at", "")) < since:
            continue
        counts = record.get("test_run")
        if not isinstance(counts, dict):
            continue
        run = cast(dict[str, Any], counts)
        if int(run.get("failed", 0)) > 0 or int(run.get("errors", 0)) > 0:
            return True
    return False


def main() -> None:
    event = read_event()
    if event is None or event.get("tool_name") not in EDIT_TOOLS:
        return
    path = tool_file(event)
    if path is None:
        return
    where = root(event)
    task = load(where)
    if task is None or task.type not in ("bug", "feature") or task.phase != "red":
        return
    rel = relative(path, event)
    if classify_path(rel) != "production":
        return
    if _has_red_since(where, entered_phase_at(task)):
        return

    reason = (
        f"no RED evidence yet: {task.type} {task.title!r} is in phase red and {rel} is production code, "
        "but no failing test run is on record since this phase began. Write the test, run it, watch it "
        "fail, then implement."
    )
    if task.policy == "block":
        emit({
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": reason + " (policy block)",
            }
        })
    else:
        context("PreToolUse", "harness: " + reason + " (policy warn: not blocked; if you proceed anyway, say why)")


if __name__ == "__main__":
    guarded(main)
