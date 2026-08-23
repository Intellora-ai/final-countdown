"""What the system believes about a learner, and how sure it is entitled to be.

THE ONE RULE THIS MODULE EXISTS TO ENFORCE
------------------------------------------
An estimate is not a fact. `understanding = 0.84` looks like a measurement and is
an inference from evidence about an unobservable state -- and the difference is
the whole product. A system that forgets it will teach confidently in the wrong
place, which is worse than teaching badly: a bad explanation gets corrected by the
learner's confusion, a wrong belief about the learner does not.

So nothing here returns a bare float. Every estimate travels with its confidence,
how much evidence produced it, how VARIED that evidence was, and when it was last
touched. `SkillEstimate` already makes that structural; this module is the thing
that must not undermine it.

WHY DIVERSITY IS TRACKED SEPARATELY FROM COUNT
----------------------------------------------
Ten near-identical questions are not ten demonstrations. They are one
demonstration, repeated -- and a system counting volume becomes most confident
exactly where it has learned least, because repetition is cheap and variety is
not. Section 18. Confidence here rises with DIVERSITY and only weakly with count,
which is why `evidence_diversity` is a first-class field rather than a derived
statistic.

WHY THERE IS NO UNIVERSAL WEIGHTING
-----------------------------------
Section 11 forbids one hard-coded mastery formula. Programming, mathematics and
vocabulary do not weigh recognition and transfer the same way, and a single set
of weights would silently impose one subject's epistemology on every other.
`DomainWeights` is configuration, and the V1 values are a starting hypothesis to
be calibrated against outcomes -- not a finding.

WHAT THIS IS NOT
----------------
Not a research-grade estimator. The update is a bounded delta, labelled V1, and
the architecture keeps it swappable: BKT, IRT, DKT and state-space models all fit
behind the same call. Locking the product to one estimation algorithm is the
thing section 17 warns about, so the algorithm lives in one function.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum

from learning_os.models.contracts import Evidence, EvidenceStrength, SkillEstimate


class MasteryState(StrEnum):
    """Where a skill stands, in terms that carry their own caveat.

    Nine states rather than a threshold on a number, because the interesting
    cases are the ones a number cannot express. `INSUFFICIENT_EVIDENCE` and
    `FRAGILE` both sit near the middle of any scale and call for opposite
    responses -- gather evidence, versus consolidate what is there. `DECAYING`
    and `DEVELOPING` can share an estimate and mean the reverse of each other.
    """

    UNKNOWN = "unknown"
    INSUFFICIENT_EVIDENCE = "insufficient_evidence"
    FRAGILE = "fragile"
    DEVELOPING = "developing"
    FUNCTIONAL = "functional"
    STRONG = "strong"
    MASTERED = "mastered"
    DECAYING = "decaying"
    MISCONCEIVED = "misconceived"


#: How much each kind of evidence is worth, section 15.
#:
#: Independent behaviour in a novel context outranks everything; self-report
#: outranks nothing. The ORDER is the claim, not the exact numbers -- these are a
#: starting hypothesis for calibration, and the property the tests hold is
#: monotonicity, so recalibrating cannot silently invert the hierarchy.
EVIDENCE_WEIGHT: dict[EvidenceStrength, float] = {
    EvidenceStrength.INDEPENDENT_NOVEL_TRANSFER: 1.00,
    EvidenceStrength.INDEPENDENT_APPLICATION: 0.85,
    EvidenceStrength.REPAIR_OR_CONSTRUCTION: 0.75,
    EvidenceStrength.OWN_WORD_EXPLANATION: 0.60,
    EvidenceStrength.PREDICTION: 0.50,
    EvidenceStrength.RECALL: 0.35,
    EvidenceStrength.RECOGNITION: 0.25,
    EvidenceStrength.ANSWER_AFTER_HINT: 0.15,
    EvidenceStrength.ANSWER_AFTER_EXPLANATION: 0.10,
    # SELF-REPORT IS EVIDENCE, AND IT IS THE WEAKEST EVIDENCE THERE IS.
    #
    # Section 16. "I understand" is a genuinely useful signal and it is not a
    # measurement: a learner can misunderstand what they misunderstand, and the
    # ones most confident they follow are often the ones who have pattern-matched
    # the surface. Weighting it near zero means it can nudge an estimate and can
    # never carry one.
    #
    # It was missing from this table, which was worse than weighting it wrongly:
    # `EVIDENCE_WEIGHT[SELF_REPORT]` raised KeyError inside `update`, so the
    # first learner to say "I get it" would have crashed the estimator mid-lesson.
    EvidenceStrength.SELF_REPORT: 0.05,
}


@dataclass(frozen=True, slots=True)
class Gates:
    """Thresholds a skill must clear, per domain.

    Frozen and passed in rather than read from a module constant, so two subjects
    can disagree about what mastery means without either editing the other's
    definition.
    """

    mastered_estimate: float = 0.85
    mastered_confidence: float = 0.70
    strong_estimate: float = 0.75
    functional_estimate: float = 0.55
    developing_estimate: float = 0.35
    #: Below this, an estimate is a guess regardless of its value.
    min_evidence_for_any_claim: int = 2
    #: Distinct evidence kinds required before mastery. Two demonstrations of the
    #: same kind are one demonstration repeated.
    min_diversity_for_mastery: int = 3


@dataclass(frozen=True, slots=True)
class DomainWeights:
    """Per-domain dimension weighting, section 12.

    V1 ships one set for programming. The point is not the numbers -- it is that
    they are DATA, so mathematics or vocabulary can supply their own without
    anybody editing an estimator.
    """

    domain: str
    weights: tuple[tuple[str, float], ...]

    def weight_of(self, dimension: str) -> float:
        for name, value in self.weights:
            if name == dimension:
                return value
        return 0.0


#: The default thresholds, as a module singleton rather than `Gates()` in a
#: parameter default. Frozen, so sharing one instance is safe -- and a default
#: constructed at import time is constructed once, where it can be inspected,
#: instead of on every call.
DEFAULT_GATES = Gates()


PROGRAMMING_V1 = DomainWeights(
    domain="python",
    weights=(
        ("recognition", 0.05),
        ("recall", 0.10),
        ("understanding", 0.20),
        ("prediction", 0.15),
        ("explanation", 0.15),
        ("application", 0.10),
        ("transfer", 0.10),
        ("robustness", 0.10),
        ("retention", 0.05),
    ),
)

#: How fast the update moves. Small on purpose: a rate near 1 makes the newest
#: answer the whole estimate, which turns a lucky guess into mastery and a
#: careless slip into a regression.
LEARNING_RATE = 0.35


def evidence_weight(evidence: Evidence) -> float:
    """How much this observation is entitled to move the estimate.

    Five factors, and each removes a specific way a response can look better than
    it was:

      strength      -- what the learner actually DID (section 15)
      independence  -- did they get there alone
      hints         -- a hinted answer is weaker evidence of the same answer
      novelty       -- a familiar context may be recall wearing application's coat
      reliability   -- a task that measures poorly cannot produce strong evidence

    Multiplied rather than averaged. Averaging lets one strong factor carry four
    weak ones, so a heavily hinted answer on an unreliable task in a familiar
    context still scores respectably. Multiplication means any single factor near
    zero disqualifies, which is the correct behaviour: evidence is only as good as
    its weakest link.
    """
    base = EVIDENCE_WEIGHT[evidence.strength]
    hint_penalty = 1.0 - evidence.hint_factor
    # Novelty raises the ceiling rather than gating: a familiar context is not
    # worthless evidence, it is just weaker evidence of transfer.
    novelty_bonus = 0.75 + 0.25 * evidence.context_novelty
    return base * evidence.independence * hint_penalty * novelty_bonus * evidence.task_reliability


@dataclass(frozen=True, slots=True)
class Belief:
    """An estimate plus the bookkeeping that makes its diversity honest.

    WHY THIS EXISTS RATHER THAN A HELPER ON SkillEstimate.

    `SkillEstimate` stores `evidence_diversity` as a COUNT. A count cannot answer
    "is this observation a kind we have already seen", and the first version of
    `update` tried to reconstruct the set from the number -- which incremented
    diversity for every observation including exact repeats, and so produced the
    opposite of the property this module exists to enforce. Ten identical
    questions would have read as ten kinds.

    A count is not a set and cannot be made into one. So the set is carried, here,
    where it belongs: `SkillEstimate` is the shared contract and stays untouched,
    and the estimator owns the state its own arithmetic needs.
    """

    estimate: SkillEstimate
    #: The distinct (representation, novel-context) pairs seen for this skill.
    #:
    #: DIVERSITY IS COUNTED HERE, AND IT USED TO BE COUNTED ON STRENGTH.
    #:
    #: That was wrong in a way that inverted the mastery gate. Production emits
    #: three of the ten `EvidenceStrength` members and two of those are unhinted,
    #: so a third DISTINCT strength could only ever be `ANSWER_AFTER_HINT`. A
    #: learner answering fifty questions perfectly and unaided reached STRONG and
    #: could not reach MASTERED; one hinted answer took them to MASTERED. The
    #: gate requiring varied STRONG evidence was requiring a WEAK kind.
    #:
    #: Strength is the one axis where more variety means the evidence got
    #: WEAKER, so it can never measure breadth. Section 18 names the axes that
    #: can: representation and context. Those widen when a learner demonstrates
    #: the same competence in a new form or an unfamiliar setting, and a hint
    #: cannot widen them at all.
    #:
    #: Strength still decides WEIGHT, in `evidence_weight`. The two questions are
    #: separate: how much this observation is worth, and how many different ways
    #: the learner has now shown it.
    seen_contexts: frozenset[tuple[str, bool]] = frozenset()

    @property
    def state(self) -> MasteryState:
        return state_of(self.estimate)


def update(
    prior: Belief,
    evidence: Evidence,
    *,
    now: Callable[[], datetime],
    learning_rate: float = LEARNING_RATE,
) -> Belief:
    """Fold one observation into an estimate. Pure; no clock, no I/O.

    `new = old + rate * weight * (observed - old)`

    A V1 mechanism, labelled as one. It is bounded, it moves further on strong
    evidence than weak, and it cannot be driven to a value the observations do not
    support. `correct/total` is explicitly what this is not: that treats a hinted
    recognition and an independent novel transfer as the same event, which is the
    single assumption that makes a tutor confident in the wrong place.

    `now` is injected. An estimator that reads the wall clock cannot be replayed,
    and replay is how a decision is shown to have been wrong.
    """
    old = prior.estimate
    weight = evidence_weight(evidence)
    delta = learning_rate * weight * (evidence.observed_performance - old.estimate)
    estimate = _clamp(old.estimate + delta)

    # The set, not a count. A repeat of a form already seen leaves diversity
    # unchanged, which is the entire reason this is a set.
    #
    # Keyed on (representation, was-the-context-novel) because those are the axes
    # section 18 names and the axes a learner widens by demonstrating the same
    # competence differently. `context_novelty` is banded to a bool rather than
    # kept as a float: two 0.8-novel tasks are not two different contexts, and a
    # continuous key would let rounding noise manufacture diversity.
    contexts = prior.seen_contexts | {
        (evidence.representation, evidence.context_novelty >= 0.5)
    }
    count = old.evidence_count + 1

    return Belief(
        estimate=SkillEstimate(
            skill_id=old.skill_id,
            estimate=estimate,
            confidence=confidence_from(count, len(contexts)),
            evidence_count=count,
            evidence_diversity=len(contexts),
            #: Bounded. Provenance matters, and an unbounded id list on a
            #: long-lived learner is a slow leak nobody notices until it is large.
            evidence_ids=(*old.evidence_ids, evidence.evidence_id)[-16:],
            state=old.state,
            last_updated=now(),
        ),
        seen_contexts=contexts,
    )


def confidence_from(count: int, diversity: int) -> float:
    """How far the estimate itself can be trusted.

    DIVERSITY DOMINATES COUNT, AND THAT IS THE WHOLE POINT.

    Ten identical questions are one demonstration repeated. A confidence that grew
    with volume would peak exactly where the system has learned least, because
    repetition is cheap and variety is not -- and the engine would then stop
    asking, having convinced itself.

    So count contributes a saturating term that cannot exceed 0.4 on its own, and
    diversity carries the rest.
    """
    if count <= 0:
        return 0.0
    from_count = 0.4 * (1.0 - 1.0 / (1.0 + count))
    from_diversity = 0.6 * min(1.0, diversity / 4.0)
    return _clamp(from_count + from_diversity)


def state_of(
    estimate: SkillEstimate,
    *,
    gates: Gates = DEFAULT_GATES,
    has_critical_misconception: bool = False,
    is_decaying: bool = False,
) -> MasteryState:
    """The state, from the whole record rather than from the number.

    ORDER MATTERS HERE AND IS NOT COSMETIC.

    A live misconception outranks any estimate: a learner who reliably produces
    the right answer from a wrong model is not `STRONG`, they are `MISCONCEIVED`
    and will fail the first case their model does not cover. Thin evidence
    outranks a high estimate for the same reason -- 0.9 from two observations is
    a guess with a decimal point.

    Checking the number first would let both of those be reported as strength,
    which is precisely the confident-in-the-wrong-place failure.
    """
    if has_critical_misconception:
        return MasteryState.MISCONCEIVED
    if estimate.evidence_count == 0:
        return MasteryState.UNKNOWN
    if estimate.evidence_count < gates.min_evidence_for_any_claim:
        return MasteryState.INSUFFICIENT_EVIDENCE
    if is_decaying:
        return MasteryState.DECAYING

    # FRAGILE is a high estimate the evidence does not support. Without it, thin
    # evidence and solid evidence at the same value are indistinguishable, and
    # the engine moves on from something it has not established.
    if estimate.estimate >= gates.strong_estimate and estimate.confidence < 0.5:
        return MasteryState.FRAGILE

    if (
        estimate.estimate >= gates.mastered_estimate
        and estimate.confidence >= gates.mastered_confidence
        and estimate.evidence_diversity >= gates.min_diversity_for_mastery
    ):
        return MasteryState.MASTERED
    if estimate.estimate >= gates.strong_estimate:
        return MasteryState.STRONG
    if estimate.estimate >= gates.functional_estimate:
        return MasteryState.FUNCTIONAL
    if estimate.estimate >= gates.developing_estimate:
        return MasteryState.DEVELOPING
    return MasteryState.FRAGILE


#: Delays at which retention is checked, section 23. A DEFAULT, not a constant:
#: the right schedule is an empirical question per domain, and freezing one is
#: how a system stops being able to learn the answer.
RETENTION_SCHEDULE: tuple[timedelta, ...] = (
    timedelta(0),
    timedelta(days=1),
    timedelta(days=3),
    timedelta(days=7),
    timedelta(days=21),
    timedelta(days=30),
)


def is_due_for_retrieval(
    estimate: SkillEstimate,
    *,
    now: datetime,
    schedule: tuple[timedelta, ...] = RETENTION_SCHEDULE,
) -> bool:
    """Whether enough time has passed that the estimate is no longer evidence.

    Immediate post-teaching performance is not evidence of durable learning --
    section 64. An estimate that has not been re-checked past the next scheduled
    delay is describing what was true then, not what is true now.
    """
    # No `is None` guard: `SkillEstimate.last_updated` has a default_factory, so
    # it is always set. mypy flagged the guard as unreachable, which was correct
    # — a defensive branch for a state the type cannot be in is dead code that
    # reads as caution.
    elapsed = now - estimate.last_updated
    return any(elapsed >= delay for delay in schedule if delay > timedelta(0))


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, value))
