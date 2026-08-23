"""The bottleneck engine: what is actually stopping this learner.

THE DEFINITION, AND WHY IT IS NOT "THE LOWEST SCORE"
----------------------------------------------------
The bottleneck is the SMALLEST unresolved subskill that is

  weak            -- the estimate is low
  evidenced       -- there is enough behind that estimate to act on
  relevant        -- the current target actually depends on it
  causal          -- it can explain the failure being observed

Sorting by estimate satisfies only the first. A learner can be weakest at
something nothing depends on: teaching it is a correct answer to the wrong
question, and the real blocker survives untouched while the numbers improve.

WHY SELF-REPORT IS AN INPUT AND NOT AN ANSWER
---------------------------------------------
"Graphs confuse me" is real information and it is not a diagnosis. Learners name
the topic they have a word for, which is usually the visible surface rather than
the mechanism underneath. If reading values is strong and interpreting meaning
is weak, the honest reading of that sentence is "something in the graphs area",
and the engine's job is to find which part.

So self-report ENTERS the scoring as a prior and can be OVERRULED by evidence --
but never silently. Overruling it without recording that it was heard makes a
considered disagreement indistinguishable from a bug six weeks later.

THIS IS A HEURISTIC, AND IT IS BUILT TO BE REPLACED
----------------------------------------------------
The score below is a decision rule, not a truth. Each factor is a separate named
function with its own test so that a wrong diagnosis can be traced to the factor
that produced it, rather than to one inline expression nobody can take apart.
Swapping in a probabilistic model later should mean replacing these functions,
not rewriting the module.
"""

from __future__ import annotations

from dataclasses import dataclass
from types import MappingProxyType
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from learning_os.domain.knowledge import CognitiveOperation, KnowledgeGraph, Subskill
from learning_os.llm.contract import DiagnosisKind
from learning_os.memory.store import MemoryStore, Outcome
from learning_os.models.contracts import Confidence, LearnerState, SkillEstimate, SkillId

#: The spec's ceiling. Two targeted questions is the point past which a
#: diagnostic stops feeling like learning and starts feeling like a test.
MAX_TARGETED_DIAGNOSTICS = 2

#: Below this, an estimate is not trustworthy enough to act on alone.
#: Not a truth -- a threshold, and the failure on each side is stated so it can
#: be recalibrated against real cohorts rather than argued about.
#: Lower: the engine commits to a diagnosis off one lucky answer.
#: Higher: it interrogates learners it already has enough evidence about.
SUFFICIENT_CONFIDENCE = 0.55

#: A skill at or above this is not a bottleneck no matter what else is true.
#: Without a floor, "weakest available" always returns something, and an engine
#: that always finds a problem will always teach one.
COMPETENT_ENOUGH = 0.8


# THERE IS ONE ENUM OF FAILURE KINDS, AND IT IS NOT DEFINED HERE.
#
# This module used to declare its own `HypothesisKind` -- ten members, closed
# set, good docstring. `llm.contract.DiagnosisKind` declares the same ten, and
# `policy.select` routes a strategy off THAT one. Compared member by member the
# two were byte-identical: same names, same values, nothing keeping them so.
#
# Two identical enums across a seam is not duplication that costs a little
# typing. It is a diagnosis this module can name and the policy cannot route,
# waiting on whichever of the two someone extends first -- and both test suites
# stay green while it happens, because each only ever sees its own copy.
#
# So the duplicate is deleted rather than synchronised. Importing the policy's
# enum makes the seam a type error instead of a silent mismatch, which is the
# same reason the verifier stopped keeping a private list of what it could check.
HypothesisKind = DiagnosisKind

# EVERY COGNITIVE OPERATION MAPS TO A KIND, AND THE TEST SAYS SO.
#
# Read with a bare `[]` on purpose: a missing operation should stop the
# diagnosis, not quietly become a default kind that reads like a real finding.
# But `KeyError` during a live diagnosis is a poor place to learn about it, so
# `test_every_cognitive_operation_has_a_hypothesis_kind` enumerates the enum
# rather than spot-checking members -- it fails the day a ninth operation is
# added, in CI, instead of in front of a learner.
#
# Not every DiagnosisKind appears here, and that is correct rather than a gap:
# REPRESENTATION_FAILURE, LANGUAGE_FAILURE and COGNITIVE_OVERLOAD are properties
# of how the material was DELIVERED, not of the operation the subskill demands.
# Nothing in a knowledge graph can imply them; they are raised by the runtime
# from what happened in a turn, and the policy handles all ten.
_KIND_BY_OPERATION: MappingProxyType[CognitiveOperation, DiagnosisKind] = MappingProxyType({
    CognitiveOperation.RECOGNISE: DiagnosisKind.TERM_GAP,
    CognitiveOperation.RECALL: DiagnosisKind.TERM_GAP,
    CognitiveOperation.EXPLAIN: DiagnosisKind.CONCEPT_GAP,
    CognitiveOperation.PREDICT: DiagnosisKind.CAUSAL_REASONING_FAILURE,
    CognitiveOperation.APPLY: DiagnosisKind.PROCEDURAL_FAILURE,
    CognitiveOperation.DEBUG: DiagnosisKind.PROCEDURAL_FAILURE,
    CognitiveOperation.CONSTRUCT: DiagnosisKind.PROCEDURAL_FAILURE,
    CognitiveOperation.TRANSFER: DiagnosisKind.TRANSFER_FAILURE,
})


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", strict=True)


class Hypothesis(_Frozen):
    """One candidate explanation, with what supports it.

    `probability` is explicitly not a belief the system defends. It is a
    ranking device, and it updates as evidence arrives.
    """

    kind: DiagnosisKind
    probability: Confidence
    evidence_ids: tuple[str, ...] = ()


class Bottleneck(_Frozen):
    """A diagnosis, with everything needed to audit it.

    `contradicting_evidence` is not decoration. A diagnosis that lists only what
    agrees with it is an argument, not an assessment -- and the case this engine
    exists to get right (self-report against evidence) is precisely one where
    something had to be overruled. If that cannot be seen afterwards, nobody can
    tell a considered call from a bug.
    """

    skill_id: SkillId
    confidence: Confidence
    evidence_sources: tuple[str, ...] = Field(min_length=1)
    supporting_evidence: tuple[str, ...] = ()
    contradicting_evidence: tuple[str, ...] = ()
    hypotheses: tuple[Hypothesis, ...] = ()
    score: Annotated[float, Field(ge=0.0)] = 0.0

    #: True when the engine wants one targeted interaction before committing.
    #: Separate from low confidence: it is a REQUEST, and the policy layer
    #: decides whether the budget allows it.
    needs_diagnostic: bool = False

    @model_validator(mode="after")
    def _uncertain_diagnoses_ask_rather_than_assert(self) -> Self:
        """A confident-looking diagnosis built on thin evidence is the worst
        output here, so the two are tied together in the type."""
        if self.confidence < SUFFICIENT_CONFIDENCE and not self.needs_diagnostic:
            raise ValueError(
                f"confidence {self.confidence:.2f} is below {SUFFICIENT_CONFIDENCE} "
                "but no diagnostic was requested; an uncertain diagnosis must ask, "
                "not assert"
            )
        return self


@dataclass(frozen=True, slots=True)
class DiagnosticBudget:
    """How many targeted questions remain.

    A frozen value rather than a counter, so spending one produces a NEW budget
    the caller has to carry. A mutable counter can be reset by anything holding
    a reference; this cannot, and the ceiling stops being advisory.
    """

    remaining: int = MAX_TARGETED_DIAGNOSTICS

    def __post_init__(self) -> None:
        if not 0 <= self.remaining <= MAX_TARGETED_DIAGNOSTICS:
            raise ValueError(
                f"a learner may be asked at most {MAX_TARGETED_DIAGNOSTICS} targeted "
                f"diagnostics; {self.remaining} was requested"
            )

    def spend(self) -> DiagnosticBudget:
        if self.remaining <= 0:
            raise ValueError(
                f"at most {MAX_TARGETED_DIAGNOSTICS} targeted diagnostics; the budget "
                "is exhausted. Decide on the evidence available or teach the most "
                "likely candidate."
            )
        return DiagnosticBudget(remaining=self.remaining - 1)


# --------------------------------------------------------------------------
# The factors. One function each, one test each.
# --------------------------------------------------------------------------


def weakness(estimate: SkillEstimate) -> float:
    """How far below mastery this skill sits. 1.0 is knows nothing."""
    return 1.0 - estimate.estimate


def need(subskill: Subskill) -> float:
    """How much the rest of the subject leans on this skill.

    Straight from `criticality`, which the knowledge model author sets. It is a
    property of the SUBJECT, not of the learner, which is why it lives there and
    is only read here.
    """
    return subskill.criticality


def causal_relevance(graph: KnowledgeGraph, target: str, candidate: str) -> float:
    """Whether failing at `candidate` could explain failing at `target`.

    A GATE, returned as a multiplier so that zero zeroes the whole score. A
    subskill the target does not depend on cannot be what is blocking the
    target, however weak it is -- and expressing that as a weight rather than a
    filter would let a sufficiently low estimate buy its way back in.

    Nearer prerequisites score higher. When two things on the chain are weak,
    the one closest to the target is the one to fix first: repairing the deepest
    leaves the learner still blocked by everything above it.
    """
    if candidate == target:
        return 1.0
    chain = graph.prerequisites_of(target)
    if candidate not in chain:
        return 0.0
    distance = chain.index(candidate)
    return 1.0 / (1.0 + distance)


def evidence_confidence(estimate: SkillEstimate) -> float:
    """How much the estimate can be trusted.

    Diversity is weighted alongside volume deliberately. Ten identical
    multiple-choice answers and ten varied demonstrations produce the same
    `evidence_count` and are not the same evidence, and an engine that cannot
    tell them apart will commit hardest exactly where a learner has been
    drilled on one question format.
    """
    if estimate.evidence_count == 0:
        return 0.0
    volume = min(estimate.evidence_count / 6.0, 1.0)
    variety = min(estimate.evidence_diversity / 3.0, 1.0)
    return estimate.confidence * (0.6 * volume + 0.4 * variety)


def recency(memory: MemoryStore, skill_id: str) -> float:
    """How recently this skill was involved in something that went wrong.

    A failure a minute ago explains the current situation better than one last
    week. Position in the append-only log stands in for wall-clock time: no
    clock is read, so the same log always produces the same score and a replay
    cannot drift.

    Neutral (0.5) when nothing has been attempted, so an untouched skill is
    neither favoured nor buried.
    """
    attempts = memory.attempts_on(skill_id)
    if not attempts:
        return 0.5
    recent = attempts[-3:]
    bad = sum(1 for a in recent if a.outcome is not Outcome.SUCCESS)
    return 0.5 + 0.5 * (bad / len(recent))


def _score(
    graph: KnowledgeGraph,
    memory: MemoryStore,
    target: str,
    subskill: Subskill,
    estimate: SkillEstimate,
    *,
    self_report_boost: float = 1.0,
) -> float:
    """The five factors, multiplied.

    Multiplied rather than summed so that any factor being zero zeroes the
    result. That is the behaviour wanted: an irrelevant skill, or one with no
    evidence, is not a bottleneck no matter how good the other factors look. A
    weighted sum would let three strong factors carry one that is disqualifying.
    """
    return (
        need(subskill)
        * weakness(estimate)
        * causal_relevance(graph, target, subskill.skill_id)
        * evidence_confidence(estimate)
        * recency(memory, subskill.skill_id)
        * self_report_boost
    )


#: How much a learner naming a skill raises it. Deliberately mild.
#:
#: Large enough to break a tie between two similar candidates, because the
#: learner's sense of where they are stuck is genuine information. Far too small
#: to lift a well-evidenced strong skill over a well-evidenced weak one, which
#: is the whole failure being guarded against.
SELF_REPORT_WEIGHT = 1.25


def _hypotheses(
    graph: KnowledgeGraph, subskill: Subskill, estimate: SkillEstimate
) -> tuple[Hypothesis, ...]:
    """Competing explanations for this subskill being weak.

    Derived from the operation and the knowledge model, never from prose. The
    point is not to be right first time -- it is to hold more than one candidate
    so the next interaction can be chosen to TELL THEM APART, rather than to
    confirm the first guess.
    """
    out: list[Hypothesis] = []
    ids = estimate.evidence_ids

    if subskill.misconceptions:
        out.append(Hypothesis(kind=DiagnosisKind.MISCONCEPTION, probability=0.4, evidence_ids=ids))
    if subskill.prerequisites:
        out.append(
            Hypothesis(kind=DiagnosisKind.PREREQUISITE_GAP, probability=0.3, evidence_ids=ids)
        )

    out.append(
        Hypothesis(kind=_KIND_BY_OPERATION[subskill.operation], probability=0.3, evidence_ids=ids)
    )
    return tuple(out)


def select_bottleneck(
    graph: KnowledgeGraph,
    learner_state: LearnerState,
    memory: MemoryStore,
    target_skill: str,
    *,
    self_reported_skill: str | None = None,
) -> Bottleneck | None:
    """The smallest evidenced thing standing between this learner and the target.

    Returns None when the evidence will not support a diagnosis. That is a real
    answer and the policy layer must treat it as one: no diagnosis means gather
    more, never "nothing is wrong".
    """
    if graph.subskill(target_skill) is None:
        return None

    # The target and everything it rests on. Nothing else can be the blocker,
    # so nothing else is scored -- relevance is applied before ranking rather
    # than as a tiebreak afterwards.
    candidates = (target_skill, *graph.prerequisites_of(target_skill))

    scored: list[tuple[float, Subskill, SkillEstimate]] = []
    for skill_id in candidates:
        subskill = graph.subskill(skill_id)
        estimate = learner_state.skills.get(skill_id)
        if subskill is None or estimate is None:
            continue
        if estimate.estimate >= COMPETENT_ENOUGH:
            # Competent skills are not bottlenecks. Without this an engine
            # always returns its weakest candidate, and one that always finds a
            # problem will always teach one.
            continue
        boost = (
            SELF_REPORT_WEIGHT
            if self_reported_skill is not None and skill_id == self_reported_skill
            else 1.0
        )
        value = _score(graph, memory, target_skill, subskill, estimate, self_report_boost=boost)
        if value > 0.0:
            scored.append((value, subskill, estimate))

    if not scored:
        return None

    # Sorted by score, then by skill_id. The tiebreak is what makes selection
    # deterministic: two equal scores must not depend on dict ordering, or a
    # replayed decision can reach a different bottleneck than the original.
    scored.sort(key=lambda row: (-row[0], row[1].skill_id))
    best_score, best_sub, best_estimate = scored[0]

    sources: list[str] = ["learner_state"]
    supporting: list[str] = list(best_estimate.evidence_ids)
    contradicting: list[str] = []

    for evidence in memory.evidence_for(best_sub.skill_id):
        sources.append("memory")
        if evidence.evidence_id not in supporting:
            supporting.append(evidence.evidence_id)

    # THE SELF-REPORT RECORD.
    #
    # If the learner named a skill and the engine chose a different one, that
    # disagreement is written down. Overruling silently is what makes a
    # considered call indistinguishable from a bug later, and this is the case
    # the module exists to get right.
    if self_reported_skill is not None:
        sources.append("self_report")
        if self_reported_skill != best_sub.skill_id:
            reported = learner_state.skills.get(self_reported_skill)
            detail = (
                f"{self_reported_skill} (self-reported, estimate "
                f"{reported.estimate:.2f} with confidence {reported.confidence:.2f})"
                if reported is not None
                else f"{self_reported_skill} (self-reported, no evidence on record)"
            )
            contradicting.append(detail)
        else:
            supporting.append(f"self_report:{self_reported_skill}")

    confidence = evidence_confidence(best_estimate)
    needs_diagnostic = confidence < SUFFICIENT_CONFIDENCE

    return Bottleneck(
        skill_id=best_sub.skill_id,
        confidence=confidence,
        evidence_sources=tuple(dict.fromkeys(sources)),
        supporting_evidence=tuple(dict.fromkeys(supporting)),
        contradicting_evidence=tuple(contradicting),
        hypotheses=_hypotheses(graph, best_sub, best_estimate),
        score=best_score,
        needs_diagnostic=needs_diagnostic,
    )


__all__ = [
    "COMPETENT_ENOUGH",
    "MAX_TARGETED_DIAGNOSTICS",
    "SUFFICIENT_CONFIDENCE",
    "Bottleneck",
    "DiagnosticBudget",
    "Hypothesis",
    "HypothesisKind",
    "causal_relevance",
    "evidence_confidence",
    "need",
    "recency",
    "select_bottleneck",
    "weakness",
]
