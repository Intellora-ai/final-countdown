#!/usr/bin/env python3
"""Stop: Claude cannot declare success by itself.

When a task is open and not complete, the verifier runs. PASS completes the
task and the stop goes through. Anything else blocks the stop with the named
gaps -- at most twice for the same evidence, so a gate can never become the
bureaucracy the design rejects: after two refusals with nothing new on
record it steps aside and says UNVERIFIED where the person can see it.

`stop_hook_active` is honoured so the gate can never loop.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from harness.evidence import Store  # noqa: E402
from harness.hooks._common import emit, guarded, now, read_event, root  # noqa: E402
from harness.state import load  # noqa: E402
from harness.verify import run  # noqa: E402

GATE_FILE = "gate.json"
BLOCKS_PER_EVIDENCE_STATE = 2


def _evidence_count(where: Path) -> int:
    """Records other than verdicts: a verdict is written by every gate run and
    must not count as new evidence, or the budget would never be spent."""
    return sum(1 for r in Store(where).read() if r.get("kind") != "verdict")


def _budget(where: Path) -> dict[str, Any]:
    try:
        loaded = json.loads((where / GATE_FILE).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"evidence_count": -1, "blocks": 0}
    if not isinstance(loaded, dict):
        return {"evidence_count": -1, "blocks": 0}
    budget: dict[str, Any] = loaded
    return budget


def main() -> None:
    event = read_event()
    if event is None or event.get("stop_hook_active") is True:
        return
    where = root(event)
    task = load(where)
    if task is None or task.phase == "complete":
        return

    verdict = run(where, now=now(), commit=True)
    if verdict.status == "PASS":
        emit({"systemMessage": f"harness: verifier PASS -- task {task.title!r} is complete"})
        return

    gaps = "; ".join(f"{r.name}: {r.detail}" for r in verdict.gaps())
    count = _evidence_count(where)
    budget = _budget(where)
    blocks = int(budget.get("blocks", 0)) if budget.get("evidence_count") == count else 0
    if blocks >= BLOCKS_PER_EVIDENCE_STATE:
        emit({
            "systemMessage": (
                f"harness: UNVERIFIED -- task {task.title!r} ({task.type}, phase {task.phase}) is not complete. "
                f"Verifier says {verdict.status}: {gaps}. Stopping anyway after {blocks} refusals with no new evidence."
            )
        })
        return

    (where / GATE_FILE).write_text(json.dumps({"evidence_count": count, "blocks": blocks + 1}), encoding="utf-8")
    emit({
        "decision": "block",
        "reason": (
            f"UNVERIFIED: task {task.title!r} ({task.type}) is in phase {task.phase} and the verifier says "
            f"{verdict.status}: {gaps}. Claude cannot declare this done; add the evidence the gaps name, "
            "or close the task with `python3 scripts/harness/cli.py abandon \"why\"`. "
            "`python3 scripts/harness/cli.py status` shows what the next phase needs."
        ),
    })


if __name__ == "__main__":
    guarded(main)
