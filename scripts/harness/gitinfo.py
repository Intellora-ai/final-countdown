"""What the harness needs from git, read from `.git` by hand.

NO SUBPROCESS ANYWHERE IN THE HARNESS. The security gate verifies every
`subprocess` call in `scripts/` against a safe pattern and a registry; adding
this package to that registry would be editing a gate to admit new code, and
the hooks must never spawn a process at all. Reading two files is enough for
the one fact the harness records: the short commit a task started at.
"""

from __future__ import annotations

from pathlib import Path


def head_commit(project: Path) -> str:
    """The short HEAD commit of the repository at `project`, or '' when there
    is none to read. Seven characters, the length `git rev-parse --short`
    prints unless the prefix is ambiguous. Handles a symbolic HEAD, a loose
    ref, a packed ref and a detached HEAD; anything unreadable is ''."""
    git = project / ".git"
    try:
        head = (git / "HEAD").read_text(encoding="utf-8").strip()
    except OSError:
        return ""
    if not head.startswith("ref: "):
        return head[:7]
    ref = head[5:]
    loose = git / ref
    try:
        return loose.read_text(encoding="utf-8").strip()[:7]
    except OSError:
        pass
    try:
        packed = (git / "packed-refs").read_text(encoding="utf-8")
    except OSError:
        return ""
    for line in packed.splitlines():
        parts = line.split()
        if len(parts) == 2 and parts[1] == ref:
            return parts[0][:7]
    return ""
