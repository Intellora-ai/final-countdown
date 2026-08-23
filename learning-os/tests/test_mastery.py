"""The learner model, held to the one failure that matters.

Not "is the estimate accurate" — that cannot be tested without learners. The
testable property is narrower and more important: **the system must not be
confident where it has no right to be.** A bad explanation gets corrected by the
learner's confusion. A wrong belief about the learner does not.

So every test here is a way confidence could be manufactured: from repetition,
from hints, from a familiar context, from an unreliable task, from one lucky
answer. Each has to fail to produce it.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from learning_os.mastery import (
    EVIDENCE_WEIGHT,
    PROGRAMMING_V1,
    Belief,
    Gates,
    MasteryState,
    confidence_from,
    evidence_weight,
    is_due_for_retrieval,
    state_of,
    update,
)
from learning_os.models.contracts import Evidence, EvidenceStrength, SkillEstimate

SKILL = "python.recursion.trace_calls"
NOW = datetime(2026, 1, 1, tzinfo=UTC)


def _now() -> datetime:
    return NOW


def _belief(**over: object) -> Belief:
    base: dict[str, object] = {
        "skill_id": SKILL,
        "estimate": 0.0,
        "confidence": 0.0,
        "evidence_count": 0,
        "evidence_diversity": 0,
    }
    base.update(over)
    return Belief(estimate=SkillEstimate(**base))  # type: ignore[arg-type]


def _evidence(
    strength: EvidenceStrength = EvidenceStrength.INDEPENDENT_APPLICATION,
    *,
    performance: float = 1.0,
    independence: float = 1.0,
    hint_factor: float = 0.0,
    novelty: float = 1.0,
    reliability: float = 1.0,
    eid: str = "ev1",
) -> Evidence:
    return Evidence(
        evidence_id=eid,
        event_id="e1",
        skill_id=SKILL,
        strength=strength,
        observed_performance=performance,
        task_difficulty=0.5,
        task_reliability=reliability,
        independence=independence,
        hint_factor=hint_factor,
        context_novelty=novelty,
        response_time_ms=1000,
        representation="prose",
        attempt_number=1,
    )


# --------------------------------------------------------------------------
# Repetition must not become confidence
# --------------------------------------------------------------------------


def test_ten_identical_observations_do_not_equal_four_varied_ones() -> None:
    """THE TEST THIS MODULE EXISTS FOR.

    Repetition is cheap and variety is not, so a confidence that grew with volume
    would peak exactly where the system has learned least — and the engine would
    then stop asking, having convinced itself.
    """
    repetitive = _belief()
    for i in range(10):
        repetitive = update(
            repetitive,
            _evidence(EvidenceStrength.RECOGNITION, eid=f"r{i}"),
            now=_now,
        )

    varied = _belief()
    for i, strength in enumerate(
        (
            EvidenceStrength.RECOGNITION,
            EvidenceStrength.PREDICTION,
            EvidenceStrength.OWN_WORD_EXPLANATION,
            EvidenceStrength.INDEPENDENT_APPLICATION,
        )
    ):
        varied = update(varied, _evidence(strength, eid=f"v{i}"), now=_now)

    assert repetitive.estimate.evidence_count == 10
    assert varied.estimate.evidence_count == 4
    assert varied.estimate.confidence > repetitive.estimate.confidence, (
        "four varied observations must beat ten identical ones"
    )


def test_repeating_a_kind_does_not_raise_diversity() -> None:
    """The bug the first implementation had.

    `SkillEstimate` stores diversity as a COUNT, and reconstructing a set from a
    count incremented on every observation — so ten identical questions read as
    ten kinds, the exact inversion of the property above.
    """
    b = _belief()
    for i in range(5):
        b = update(b, _evidence(EvidenceStrength.RECALL, eid=f"x{i}"), now=_now)
    assert b.estimate.evidence_diversity == 1
    assert b.estimate.evidence_count == 5


def test_a_new_kind_does_raise_diversity() -> None:
    """The negative control: a diversity that never moves would pass the test
    above while measuring nothing."""
    b = update(_belief(), _evidence(EvidenceStrength.RECALL), now=_now)
    b = update(b, _evidence(EvidenceStrength.PREDICTION, eid="e2"), now=_now)
    assert b.estimate.evidence_diversity == 2


def test_confidence_saturates_on_count_alone() -> None:
    """Count contributes a bounded term. Without the bound, enough repetition
    eventually buys full confidence and diversity stops mattering."""
    assert confidence_from(count=1000, diversity=1) < 0.7


# --------------------------------------------------------------------------
# Evidence weighting — the hierarchy, and the ways an answer looks better
# --------------------------------------------------------------------------


def test_the_evidence_hierarchy_is_monotonic() -> None:
    """The ORDER is the claim, not the numbers. Recalibrating the weights must
    not be able to silently invert the hierarchy."""
    order = [
        EvidenceStrength.INDEPENDENT_NOVEL_TRANSFER,
        EvidenceStrength.INDEPENDENT_APPLICATION,
        EvidenceStrength.REPAIR_OR_CONSTRUCTION,
        EvidenceStrength.OWN_WORD_EXPLANATION,
        EvidenceStrength.PREDICTION,
        EvidenceStrength.RECALL,
        EvidenceStrength.RECOGNITION,
        EvidenceStrength.ANSWER_AFTER_HINT,
        EvidenceStrength.ANSWER_AFTER_EXPLANATION,
        # Weakest of all: a learner can misunderstand what they misunderstand.
        EvidenceStrength.SELF_REPORT,
    ]
    weights = [EVIDENCE_WEIGHT[s] for s in order]
    assert weights == sorted(weights, reverse=True), "the hierarchy is not monotonic"


def test_every_evidence_strength_has_a_weight() -> None:
    """A missing key raises KeyError mid-update, while a learner is waiting."""
    for strength in EvidenceStrength:
        assert strength in EVIDENCE_WEIGHT


def test_a_hinted_answer_is_weaker_than_the_same_answer_unaided() -> None:
    assert evidence_weight(_evidence(hint_factor=0.8)) < evidence_weight(_evidence(hint_factor=0.0))


def test_a_dependent_answer_is_weaker_than_an_independent_one() -> None:
    assert evidence_weight(_evidence(independence=0.2)) < evidence_weight(_evidence())


def test_a_familiar_context_is_weaker_evidence_than_a_novel_one() -> None:
    """A familiar context may be recall wearing application's coat."""
    assert evidence_weight(_evidence(novelty=0.0)) < evidence_weight(_evidence(novelty=1.0))


def test_an_unreliable_task_cannot_produce_strong_evidence() -> None:
    assert evidence_weight(_evidence(reliability=0.1)) < 0.2


def test_the_factors_multiply_so_one_weak_link_disqualifies() -> None:
    """Averaging would let one strong factor carry four weak ones — a heavily
    hinted answer on an unreliable task in a familiar context would still score
    respectably. Evidence is only as good as its weakest link."""
    weak = _evidence(
        EvidenceStrength.INDEPENDENT_NOVEL_TRANSFER,
        independence=0.1,
        hint_factor=0.9,
        novelty=0.0,
        reliability=0.2,
    )
    assert evidence_weight(weak) < 0.05


# --------------------------------------------------------------------------
# The update
# --------------------------------------------------------------------------


def test_a_single_answer_cannot_produce_mastery() -> None:
    """One lucky guess is not a demonstration. Without this, the fastest route to
    "mastered" is a coin flip on a recognition question."""
    b = update(_belief(), _evidence(performance=1.0), now=_now)
    assert b.estimate.estimate < 0.5
    assert state_of(b.estimate) is MasteryState.INSUFFICIENT_EVIDENCE


def test_strong_evidence_moves_the_estimate_further_than_weak() -> None:
    strong = update(_belief(), _evidence(EvidenceStrength.INDEPENDENT_NOVEL_TRANSFER), now=_now)
    weak = update(_belief(), _evidence(EvidenceStrength.ANSWER_AFTER_EXPLANATION), now=_now)
    assert strong.estimate.estimate > weak.estimate.estimate


def test_the_estimate_stays_in_range() -> None:
    """A bound that only holds for plausible inputs is not a bound."""
    high = _belief(estimate=0.99, confidence=0.9, evidence_count=5,
                   evidence_diversity=4, evidence_ids=("a",))
    assert update(high, _evidence(performance=1.0), now=_now).estimate.estimate <= 1.0

    low = _belief(estimate=0.01, confidence=0.9, evidence_count=5,
                  evidence_diversity=4, evidence_ids=("a",))
    assert update(low, _evidence(performance=0.0), now=_now).estimate.estimate >= 0.0


def test_a_failure_moves_the_estimate_down() -> None:
    prior = _belief(estimate=0.8, confidence=0.7, evidence_count=4,
                    evidence_diversity=3, evidence_ids=("a",))
    assert update(prior, _evidence(performance=0.0), now=_now).estimate.estimate < 0.8


def test_the_update_is_pure_and_uses_the_injected_clock() -> None:
    """An estimator that reads the wall clock cannot be replayed, and replay is
    how a decision is shown to have been wrong."""
    before = _belief()
    after = update(before, _evidence(), now=_now)
    assert before.estimate.evidence_count == 0, "the prior was mutated"
    assert after.estimate.last_updated == NOW


def test_evidence_ids_are_bounded() -> None:
    """Provenance matters; an unbounded id list on a long-lived learner is a slow
    leak nobody notices until it is large."""
    b = _belief()
    for i in range(40):
        b = update(b, _evidence(eid=f"e{i}"), now=_now)
    assert len(b.estimate.evidence_ids) <= 16


# --------------------------------------------------------------------------
# States — the number is never checked first
# --------------------------------------------------------------------------


def test_a_high_estimate_with_thin_evidence_is_fragile_not_strong() -> None:
    """0.9 from two observations is a guess with a decimal point."""
    e = SkillEstimate(skill_id=SKILL, estimate=0.9, confidence=0.3, evidence_count=2,
                      evidence_diversity=1, evidence_ids=("a",))
    assert state_of(e) is MasteryState.FRAGILE


def test_a_live_misconception_outranks_any_estimate() -> None:
    """A learner who reliably produces the right answer from a wrong model is not
    STRONG. They will fail the first case their model does not cover."""
    e = SkillEstimate(skill_id=SKILL, estimate=0.95, confidence=0.95, evidence_count=20,
                      evidence_diversity=6, evidence_ids=("a",))
    assert state_of(e, has_critical_misconception=True) is MasteryState.MISCONCEIVED


def test_mastery_requires_diversity_not_only_a_high_number() -> None:
    """Six observations of one kind is one demonstration repeated six times."""
    e = SkillEstimate(skill_id=SKILL, estimate=0.95, confidence=0.9, evidence_count=6,
                      evidence_diversity=1, evidence_ids=("a",))
    assert state_of(e) is not MasteryState.MASTERED


def test_mastery_is_reachable_with_varied_confident_evidence() -> None:
    """The positive control. Without it, "hard to reach mastery" could be
    satisfied by a rule that never grants it."""
    e = SkillEstimate(skill_id=SKILL, estimate=0.9, confidence=0.85, evidence_count=8,
                      evidence_diversity=4, evidence_ids=("a",))
    assert state_of(e) is MasteryState.MASTERED


def test_no_evidence_is_unknown_not_zero() -> None:
    """"We have not looked" and "they cannot do it" are different claims and call
    for opposite responses."""
    assert state_of(SkillEstimate(skill_id=SKILL, estimate=0.0, confidence=0.0,
                                  evidence_count=0, evidence_diversity=0)) is MasteryState.UNKNOWN


def test_decay_outranks_the_estimate() -> None:
    """A previously mastered skill that has deteriorated needs retrieval, not
    relearning from zero — and the estimate alone cannot tell the difference."""
    e = SkillEstimate(skill_id=SKILL, estimate=0.9, confidence=0.9, evidence_count=8,
                      evidence_diversity=4, evidence_ids=("a",))
    assert state_of(e, is_decaying=True) is MasteryState.DECAYING


@pytest.mark.parametrize(
    ("estimate", "expected"),
    [
        (0.95, MasteryState.MASTERED),
        (0.80, MasteryState.STRONG),
        (0.60, MasteryState.FUNCTIONAL),
        (0.40, MasteryState.DEVELOPING),
        (0.10, MasteryState.FRAGILE),
    ],
)
def test_the_bands_are_ordered(estimate: float, expected: MasteryState) -> None:
    e = SkillEstimate(skill_id=SKILL, estimate=estimate, confidence=0.85, evidence_count=8,
                      evidence_diversity=4, evidence_ids=("a",))
    assert state_of(e) is expected


def test_gates_are_configurable_per_domain() -> None:
    """Section 21. A hard-coded threshold imposes one subject's idea of mastery
    on every other."""
    e = SkillEstimate(skill_id=SKILL, estimate=0.80, confidence=0.85, evidence_count=8,
                      evidence_diversity=4, evidence_ids=("a",))
    assert state_of(e) is MasteryState.STRONG
    assert state_of(e, gates=Gates(mastered_estimate=0.75)) is MasteryState.MASTERED


# --------------------------------------------------------------------------
# Weights and retention are data, not constants
# --------------------------------------------------------------------------


def test_domain_weights_are_data() -> None:
    """No universal mastery formula — section 11."""
    assert PROGRAMMING_V1.domain == "python"
    assert PROGRAMMING_V1.weight_of("transfer") > 0
    assert PROGRAMMING_V1.weight_of("not_a_dimension") == 0.0


def test_the_weighting_sums_to_one() -> None:
    """Not required by anything, and wrong if it drifts: a set summing to 1.3
    means a composite can exceed its own scale."""
    assert sum(w for _, w in PROGRAMMING_V1.weights) == pytest.approx(1.0)


def test_immediate_performance_is_not_durable_learning() -> None:
    """Section 64. An estimate not re-checked past the next scheduled delay
    describes what was true then."""
    stale = SkillEstimate(skill_id=SKILL, estimate=0.9, confidence=0.9, evidence_count=8,
                          evidence_diversity=4, evidence_ids=("a",),
                          last_updated=NOW - timedelta(days=10))
    assert is_due_for_retrieval(stale, now=NOW) is True


def test_a_freshly_updated_estimate_is_not_yet_due() -> None:
    fresh = SkillEstimate(skill_id=SKILL, estimate=0.9, confidence=0.9, evidence_count=8,
                          evidence_diversity=4, evidence_ids=("a",), last_updated=NOW)
    assert is_due_for_retrieval(fresh, now=NOW) is False
