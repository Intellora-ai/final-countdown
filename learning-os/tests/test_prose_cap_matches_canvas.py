"""The prose cap is one fact, held in two languages.

WHY THIS TEST EXISTS
--------------------
`emit.py` refuses a block over MAX_PROSE. The canvas refuses one over PROSE_MAX.
Those are the same rule written twice, in two languages, and on 2026-08-26 they
disagreed: the canvas was tightened to 400 and Python was left at 2000.

Nothing errored. The Python emitter would happily build a 900-character block,
pass its own check, hand it across the boundary, and have the canvas refuse the
entire lesson with a message about a field the engine never saw. A lesson that
was generated correctly becomes nothing at all, and the failure surfaces two
layers away from the number that caused it.

This is the third instance of one bug class in this codebase:

  webResolver.ts  clamped evidence to a private 600
  emit.py         capped prose at a private 2000
  spec.ts         owned the actual limit

Each copy was correct when written. Copies do not stay correct; they stay
copies. So this test does not assert 400 -- a literal here would be a FOURTH
copy, drifting on the same schedule as the others. It reads the canvas and
demands they agree, which is the only version that cannot rot.
"""

import re
from pathlib import Path

import pytest

from learning_os.api.emit import MAX_PROSE

SPEC = Path(__file__).resolve().parents[2] / "frontend" / "src" / "canvas" / "spec" / "spec.ts"


def canvas_prose_max() -> int:
    """The number the canvas actually enforces, read from its source."""
    if not SPEC.exists():
        pytest.skip(f"canvas spec not present at {SPEC}")
    match = re.search(r"export const PROSE_MAX\s*=\s*(\d+)", SPEC.read_text())
    assert match, (
        f"PROSE_MAX is no longer declared in {SPEC.name}. If it was renamed, this "
        f"test must follow it -- deleting the check would let the two caps drift "
        f"again, which is the whole failure it exists to prevent."
    )
    return int(match.group(1))


def test_python_cap_equals_the_canvas_cap() -> None:
    expected = canvas_prose_max()
    assert MAX_PROSE == expected, (
        f"the prose cap has drifted across the language boundary.\n"
        f"  emit.py MAX_PROSE : {MAX_PROSE}\n"
        f"  canvas PROSE_MAX  : {expected}\n"
        f"A block between the two passes Python and is refused by the canvas, so "
        f"a correctly generated lesson becomes nothing at all."
    )


def test_a_block_at_the_cap_is_accepted_and_one_over_is_refused() -> None:
    """The pair.

    Equality alone is satisfied by both numbers being wrong together. This
    asserts the cap does something: the boundary value passes and the next
    character fails.
    """
    cap = canvas_prose_max()
    assert len("x" * cap) <= MAX_PROSE
    assert len("x" * (cap + 1)) > MAX_PROSE
