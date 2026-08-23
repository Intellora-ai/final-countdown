"""Diagnosis: what is actually stopping this learner, and why we believe it.

Everything else in the engine measures, checks, or teaches. This module is the
one that COMMITS to an explanation, which is why every value it returns carries
the evidence behind it -- including the evidence that argued the other way.

Exported here rather than only from `diagnosis.bottleneck` so a consumer does
not have to know this module's internal file layout. That is not tidiness: the
short form is what everyone tries first, and a package whose public name only
works one level down teaches every caller to import an implementation path,
which then cannot be moved.
"""

from learning_os.diagnosis.bottleneck import (
    COMPETENT_ENOUGH,
    MAX_TARGETED_DIAGNOSTICS,
    SUFFICIENT_CONFIDENCE,
    Bottleneck,
    DiagnosticBudget,
    Hypothesis,
    NoBottleneck,
    causal_relevance,
    evidence_confidence,
    need,
    recency,
    select_bottleneck,
    weakness,
)

# Imported from its home rather than re-exported through `bottleneck`, which is
# both what `mypy --strict` demands and the more honest line: this module does
# not own this enum, it agrees to use the policy's.
from learning_os.llm.contract import DiagnosisKind

__all__ = [
    "COMPETENT_ENOUGH",
    "MAX_TARGETED_DIAGNOSTICS",
    "SUFFICIENT_CONFIDENCE",
    "Bottleneck",
    # Re-exported, not redefined. `DiagnosisKind` belongs to `llm.contract` and
    # is what `policy.select` routes on; this module used to keep an identical
    # copy called `HypothesisKind`, which is exactly the drift a seam like this
    # cannot afford. Named here so a consumer of a diagnosis can read the kinds
    # off the same module without importing two.
    "DiagnosisKind",
    "DiagnosticBudget",
    "Hypothesis",
    "NoBottleneck",
    # The five factors are public on purpose. A diagnosis nobody can take apart
    # is a diagnosis nobody can correct, and the whole reason they are separate
    # named functions is so a wrong answer traces to the one that produced it.
    "causal_relevance",
    "evidence_confidence",
    "need",
    "recency",
    "select_bottleneck",
    "weakness",
]
