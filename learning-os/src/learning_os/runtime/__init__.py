"""The loop: the only place the layers are composed.

Each module below it answers one question well. Composition is where the
interesting failures live — a validator that works and is never consulted, a
memory nothing writes to, a repair path that loops because nothing counts.
"""

from learning_os.runtime.loop import (
    MAX_GENERATION_ATTEMPTS,
    NoInstruction,
    Turn,
    TurnStatus,
    teach_next,
    teach_once,
)
from learning_os.runtime.observe import PARTIAL_FLOOR, Observation, observe

__all__ = [
    "MAX_GENERATION_ATTEMPTS",
    "PARTIAL_FLOOR",
    "NoInstruction",
    "Observation",
    "Turn",
    "TurnStatus",
    "observe",
    "teach_next",
    "teach_once",
]
