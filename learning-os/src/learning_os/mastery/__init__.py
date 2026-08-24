"""The learner model: what the system believes, and how sure it may be.

The module whose failure mode is being confidently wrong — which is worse than
teaching badly, because a bad explanation is corrected by the learner's
confusion and a wrong belief about the learner is not.
"""

from learning_os.mastery.estimate import (
    EVIDENCE_WEIGHT,
    LEARNING_RATE,
    PROGRAMMING_V1,
    RETENTION_SCHEDULE,
    Belief,
    DomainWeights,
    Gates,
    MasteryState,
    confidence_from,
    evidence_weight,
    is_due_for_retrieval,
    state_of,
    update,
)

__all__ = [
    "EVIDENCE_WEIGHT",
    "LEARNING_RATE",
    "PROGRAMMING_V1",
    "RETENTION_SCHEDULE",
    "Belief",
    "DomainWeights",
    "Gates",
    "MasteryState",
    "confidence_from",
    "evidence_weight",
    "is_due_for_retrieval",
    "state_of",
    "update",
]
