"""Failure memory: what a completed task learned, keyed by the flight
recorder's fingerprint, replayed when that fingerprint appears again.

NOTHING IS INFERRED. A record exists only because a task that carried the
fingerprint reached PASS with a hypothesis on file. The next time the same
`FP-xxxxxx` shows up in a test run, the hook hands Claude that root cause and
the commit that fixed it -- and no more than that.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

MEMORY_DIR = "memory"
_FINGERPRINT = re.compile(r"\bFP-[0-9a-f]{6}\b")


def fingerprints_in(text: str) -> list[str]:
    """Every distinct fingerprint in the text, in order of first appearance."""
    seen: list[str] = []
    for found in _FINGERPRINT.findall(text):
        if found not in seen:
            seen.append(found)
    return seen


def remember(
    root: Path,
    fingerprints: list[str],
    *,
    root_cause: str,
    fix_commit: str,
    title: str,
    now: str,
) -> None:
    where = root / MEMORY_DIR
    where.mkdir(parents=True, exist_ok=True)
    for fingerprint in fingerprints:
        record = {
            "fingerprint": fingerprint,
            "root_cause": root_cause,
            "fix_commit": fix_commit,
            "title": title,
            "at": now,
        }
        (where / f"{fingerprint}.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")


def recall(root: Path, fingerprints: list[str]) -> list[dict[str, Any]]:
    """The records for the fingerprints that have one; a broken file is skipped."""
    out: list[dict[str, Any]] = []
    for fingerprint in fingerprints:
        path = root / MEMORY_DIR / f"{fingerprint}.json"
        try:
            loaded = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if isinstance(loaded, dict):
            record: dict[str, Any] = loaded
            out.append(record)
    return out
