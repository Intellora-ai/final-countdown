"""What happens between lessons: doubts the lesson itself cannot answer.

The canvas resolves doubts from material the author already wrote, and refuses
anything else on purpose. This package is what catches the refusal.
"""

from learning_os.session.doubt import (
    MATCH_STRENGTH,
    Doubt,
    DoubtOutcome,
    Resolution,
    map_to_skill,
    resolve,
)

__all__ = [
    "MATCH_STRENGTH",
    "Doubt",
    "DoubtOutcome",
    "Resolution",
    "map_to_skill",
    "resolve",
]
