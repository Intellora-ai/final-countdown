"""What every hook shares: read the event, find the state, never raise.

A hook is a process Claude Code runs with JSON on stdin. If it raises, the
session pays for it. So every entry point runs under `guarded`, which turns
any exception into a line on stderr (Claude Code's debug log) and exit 0 --
the harness records nothing rather than breaking the tool that would have
done the recording.

No subprocess is run from a hook. The commit is read from `.git` by hand.
"""

from __future__ import annotations

import json
import os
import sys
import traceback
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, cast

from harness.gitinfo import head_commit

__all__ = [
    "EDIT_TOOLS", "REPO", "context", "emit", "guarded", "head_commit", "now", "project_dir",
    "read_event", "relative", "root", "tool_file",
]

EDIT_TOOLS = {"Edit", "Write", "MultiEdit"}

#: The repository these hooks live in: scripts/harness/hooks/_common.py -> repo.
#: MEASURED, NOT ASSUMED: `$CLAUDE_PROJECT_DIR` was the folder Claude Code was
#: opened in, one level above this repository, so state anchored there would
#: have lived outside the checkout and outside `.gitignore`.
REPO = Path(__file__).resolve().parents[3]


def read_event() -> dict[str, Any] | None:
    try:
        loaded: Any = json.load(sys.stdin)
    except (ValueError, OSError):
        return None
    if not isinstance(loaded, dict):
        return None
    return cast(dict[str, Any], loaded)


def project_dir(event: dict[str, Any]) -> Path:
    """Where the commit is read from: the Claude project dir when it is set
    (the tests point it at a temporary repository), else this repository."""
    named = os.environ.get("CLAUDE_PROJECT_DIR", "").strip()
    return Path(named) if named else REPO


def root(event: dict[str, Any]) -> Path:
    """`$HARNESS_ROOT`, else `.harness/` in this repository -- never in whatever
    folder Claude Code happened to be opened in."""
    named = os.environ.get("HARNESS_ROOT", "").strip()
    return Path(named) if named else REPO / ".harness"


def now() -> str:
    """Microseconds, not seconds. MEASURED: at one-second resolution a failing
    run and the transition into `red` landed on the same stamp, so the run
    counted as evidence for a phase it preceded, and a production edit and a
    failing run in the same second could not be ordered at all -- which is the
    one ordering the whole harness exists to see."""
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def relative(path: str, event: dict[str, Any]) -> str:
    """The path as the repository knows it: the shortest form relative to this
    repository, the Claude project dir, or the session's cwd -- whichever
    contains it. An outside path is kept as it came."""
    candidates: list[Path] = [REPO, project_dir(event)]
    cwd = event.get("cwd")
    if isinstance(cwd, str) and cwd:
        candidates.append(Path(cwd))
    best: str | None = None
    for base in candidates:
        try:
            rel = str(Path(path).resolve().relative_to(base.resolve()))
        except (ValueError, OSError):
            continue
        if best is None or len(rel) < len(best):
            best = rel
    return best if best is not None else path


def emit(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def context(event_name: str, text: str) -> None:
    emit({"hookSpecificOutput": {"hookEventName": event_name, "additionalContext": text}})


def tool_file(event: dict[str, Any]) -> str | None:
    tool_input = event.get("tool_input")
    if not isinstance(tool_input, dict):
        return None
    path = cast(dict[str, Any], tool_input).get("file_path")
    return path if isinstance(path, str) and path else None


def guarded(main: Callable[[], None]) -> None:
    """Run the hook; on any exception say so on stderr and still exit 0. A
    hook that raises takes the session down; one that explains on stderr
    and steps aside costs nothing but one recording."""
    try:
        main()
    except Exception:  # noqa: BLE001 - every failure mode of a hook ends the same way: recorded, not raised
        sys.stderr.write("harness hook failed:\n" + traceback.format_exc())
    sys.exit(0)
