#!/usr/bin/env python3
"""PostToolUse(Edit|Write|MultiEdit): record which file changed and what it is.

A test file changing after the failing run that established red is not
forbidden -- requirements get corrected -- but it is never silent. The hook
asks for the reason and tells Claude how to record it; the verifier holds the
task at MORE_WORK until it is.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from harness.evidence import Store, classify_path  # noqa: E402
from harness.hooks._common import EDIT_TOOLS, context, guarded, now, read_event, relative, root, tool_file  # noqa: E402
from harness.state import load  # noqa: E402

_AFTER_RED = {"green", "refactor", "verify"}


def main() -> None:
    event = read_event()
    if event is None or event.get("tool_name") not in EDIT_TOOLS:
        return
    path = tool_file(event)
    if path is None:
        return

    rel = relative(path, event)
    role = classify_path(rel)
    where = root(event)
    Store(where).append({
        "at": now(), "kind": "file_change", "path": rel, "role": role, "tool": str(event.get("tool_name")),
    })

    task = load(where)
    if role == "test" and task is not None and task.phase in _AFTER_RED:
        context(
            "PostToolUse",
            f"harness: {rel} is a test file and it changed during phase {task.phase}, after the failing "
            "run that established red. That is allowed, never silent: record why with\n"
            "  python3 scripts/harness/cli.py reason \"<what changed in the requirement, or what was wrong in the test>\"\n"
            "A test change with no reason keeps the verifier at MORE_WORK.",
        )


if __name__ == "__main__":
    guarded(main)
