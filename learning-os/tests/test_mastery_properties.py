"""The estimator's contracts, over the whole input space rather than points.

WHY THESE ARE PROPERTIES AND NOT MORE EXAMPLES
----------------------------------------------
`test_mastery.py` already checks each of these behaviours at one carefully
chosen point, and those tests are worth having: they document the intent in a
form a reader can follow. But an example proves the claim at one coordinate,
and every failure this module was written to prevent is a failure at a
coordinate nobody chose.

`test_the_estimate_stays_in_range` picks one prior and one observation. The
clamp it exercises has to hold for every prior, every observation, every
learning rate and every one of the ten evidence strengths — and the value that
breaks a bounded update is a negative delta on a near-zero prior, which is not
a value anybody writes down by hand.

WHAT IS ASSERTED
----------------
Only claims the module makes about itself, in its own docstrings:

  evidence_weight   bounded; ordered by strength; multiplicative, so any single
                    factor at zero disqualifies regardless of the other four
  update            bounded; count rises by exactly one; diversity never falls
                    and never exceeds count; a REPEATED form does not raise
                    diversity; the estimate moves toward the observation and
                    never past it; provenance stays bounded
  confidence_from   bounded; non-decreasing in both arguments; count alone can
                    never reach 0.4, so volume cannot buy confidence
  state_of          the precedence order holds — a misconception outranks any
                    number, and thin evidence outranks a high one

Retention scheduling is NOT here. `test_scheduling_properties.py` already owns
`is_due_for_retrieval` across zones and instants, and a second file generating
the same dates would be duplicated coverage wearing two names.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from tests.strategies import (
    beliefs,
    evidences,
    representations,
    skill_estimates,
    unit_floats,
)

from learning_os.mastery.estimate import (
    DEFAULT_GATES,
    EVIDENCE_WEIGHT,
    Belief,
    Gates,
    MasteryState,
    confidence_from,
    evidence_weight,
    state_of,
    update,
)
from learning_os.models.contracts import Evidence, EvidenceStrength, SkillEstimate

FIXED_NOW = datetime(2026, 1, 1, tzinfo=UTC)


def _clock() -> datetime:
    return FIXED_NOW


def _evidence(**overrides: object) -> Evidence:
    """A neutral observation, so a property can vary one factor at a time."""
    base: dict[str, object] = {
        "evidence_id": "e1",
        "event_id": "ev1",
        "skill_id": "python.loops",
        "strength": EvidenceStrength.INDEPENDENT_APPLICATION,
        "observed_performance": 1.0,
        "task_difficulty": 0.5,
        "task_reliability": 1.0,
        "independence": 1.0,
        "hint_factor": 0.0,
        "context_novelty": 1.0,
        "response_time_ms": 1000,
        "representation": "code",
        "attempt_number": 1,
    }
    base.update(overrides)
    return Evidence(**base)  # type: ignore[arg-type]


class TestEvidenceWeight:
    """Properties of `evidence_weight`."""

    @given(evidence=evidences())
    def test_stays_on_the_unit_interval(self, evidence: Evidence) -> None:
        assert 0.0 <= evidence_weight(evidence) <= 1.0

    @given(
        a=st.sampled_from(list(EvidenceStrength)),
        b=st.sampled_from(list(EvidenceStrength)),
    )
    def test_is_ordered_by_strength(self, a: EvidenceStrength, b: EvidenceStrength) -> None:
        """The ORDER of the table is the claim; the numbers are a hypothesis.

        Holding every other factor fixed, a stronger kind of evidence must never
        weigh less than a weaker one — so recalibrating the table cannot
        silently invert the hierarchy the module exists to encode.
        """
        if a.rank > b.rank:
            a, b = b, a
        assert evidence_weight(_evidence(strength=a)) >= evidence_weight(_evidence(strength=b))

    @given(factor=st.sampled_from(["independence", "task_reliability"]))
    def test_a_zero_factor_disqualifies_whatever_the_others_say(self, factor: str) -> None:
        """Multiplication, not averaging: the weakest link decides."""
        assert evidence_weight(_evidence(**{factor: 0.0})) == 0.0

    def test_a_fully_hinted_answer_weighs_nothing(self) -> None:
        assert evidence_weight(_evidence(hint_factor=1.0)) == 0.0

    @given(low=unit_floats, high=unit_floats)
    def test_falls_as_hints_rise(self, low: float, high: float) -> None:
        if low > high:
            low, high = high, low
        assert evidence_weight(_evidence(hint_factor=low)) >= evidence_weight(
            _evidence(hint_factor=high)
        )

    @given(low=unit_floats, high=unit_floats, factor=st.sampled_from(
        ["independence", "task_reliability", "context_novelty"]
    ))
    def test_rises_with_independence_reliability_and_novelty(
        self, low: float, high: float, factor: str
    ) -> None:
        if low > high:
            low, high = high, low
        assert evidence_weight(_evidence(**{factor: high})) >= evidence_weight(
            _evidence(**{factor: low})
        )

    def test_every_strength_is_weighted(self) -> None:
        """A missing member raised KeyError mid-lesson once. It cannot recur."""
        assert set(EVIDENCE_WEIGHT) == set(EvidenceStrength)


class TestUpdate:
    """Properties of `update`."""

    @given(
        prior=beliefs(skill_id="python.loops"),
        evidence=evidences(skill_id="python.loops"),
        #: RATES ABOVE 1 ARE DRAWN ON PURPOSE, and finding out why is what this
        #: test was for. `learning_rate` is a public parameter with no declared
        #: bound, and at the default 0.35 the clamp is UNREACHABLE:
        #:
        #:     new = old*(1 - rate*w) + observed*(rate*w)
        #:
        #: with `rate*w` in [0, 1] that is a convex combination of two values
        #: already inside [0, 1], so it cannot leave. Generated only over sane
        #: rates, this property passed with `_clamp` deleted -- a mutant
        #: survived it, which is the definition of a hole. The clamp is real
        #: protection against a caller who passes a large rate, so the test now
        #: goes where that caller would.
        rate=st.floats(min_value=0.0, max_value=5.0, allow_nan=False),
    )
    #: RAISED, never lowered. The corner that makes the clamp matter needs five
    #: unit factors at their extreme AND a large rate AND a distant observation
    #: at the same time; the default budget of 100 does not reliably reach it,
    #: and a property that only sometimes finds its own counterexample is a
    #: property that will pass on the day it should not.
    @settings(max_examples=600)
    def test_the_estimate_stays_on_the_unit_interval(
        self, prior: Belief, evidence: Evidence, rate: float
    ) -> None:
        after = update(prior, evidence, now=_clock, learning_rate=rate)
        assert 0.0 <= after.estimate.estimate <= 1.0

    @given(prior=beliefs(skill_id="python.loops"), evidence=evidences(skill_id="python.loops"))
    def test_one_observation_raises_the_count_by_exactly_one(
        self, prior: Belief, evidence: Evidence
    ) -> None:
        after = update(prior, evidence, now=_clock)
        assert after.estimate.evidence_count == prior.estimate.evidence_count + 1

    @given(prior=beliefs(skill_id="python.loops"), evidence=evidences(skill_id="python.loops"))
    def test_diversity_never_falls(self, prior: Belief, evidence: Evidence) -> None:
        after = update(prior, evidence, now=_clock)
        assert after.estimate.evidence_diversity >= len(prior.seen_contexts)

    @given(
        prior=beliefs(skill_id="python.loops"),
        evidence=evidences(skill_id="python.loops"),
        repeats=st.integers(min_value=1, max_value=8),
    )
    def test_repeating_one_form_never_raises_diversity(
        self, prior: Belief, evidence: Evidence, repeats: int
    ) -> None:
        """THE property the module exists to enforce.

        Ten identical questions are one demonstration repeated. Applying the
        same observation again — same representation, same novelty band — must
        leave diversity exactly where the first application put it, however many
        times it arrives.
        """
        first = update(prior, evidence, now=_clock)
        current = first
        for _ in range(repeats):
            current = update(current, evidence, now=_clock)
        assert current.estimate.evidence_diversity == first.estimate.evidence_diversity

    @given(
        prior=beliefs(skill_id="python.loops"),
        evidence=evidences(skill_id="python.loops"),
        other=representations,
    )
    def test_a_genuinely_new_form_raises_diversity_by_one(
        self, prior: Belief, evidence: Evidence, other: str
    ) -> None:
        first = update(prior, evidence, now=_clock)
        second = update(
            first,
            evidence.model_copy(update={"representation": other}),
            now=_clock,
        )
        expected = first.estimate.evidence_diversity + (
            0 if (other, evidence.context_novelty >= 0.5) in first.seen_contexts else 1
        )
        assert second.estimate.evidence_diversity == expected

    @given(
        prior=beliefs(skill_id="python.loops"),
        evidence=evidences(skill_id="python.loops"),
        #: BOUNDED AT 1 HERE, unlike the range test above, and the boundary is
        #: the contract rather than convenience. "Moves toward and never past"
        #: is only true while `rate * weight <= 1`; at 3.0 an update from 0.5
        #: toward 0.6 lands on 0.8, which is past it. The default 0.35 is
        #: inside this range, so this covers every rate the product uses, and
        #: the range property above covers the ones it does not.
        rate=st.floats(min_value=0.0, max_value=1.0, allow_nan=False),
    )
    def test_the_estimate_moves_toward_the_observation_and_never_past_it(
        self, prior: Belief, evidence: Evidence, rate: float
    ) -> None:
        """A bounded delta. An update that could overshoot would let one lucky
        answer carry an estimate beyond anything observed."""
        after = update(prior, evidence, now=_clock, learning_rate=rate)
        target = evidence.observed_performance
        assert abs(after.estimate.estimate - target) <= abs(prior.estimate.estimate - target) + 1e-9

    @given(
        prior=beliefs(skill_id="python.loops"),
        evidence=evidences(skill_id="python.loops"),
        extra=st.lists(evidences(skill_id="python.loops"), min_size=17, max_size=24),
    )
    @settings(max_examples=40)
    def test_provenance_stays_bounded(
        self, prior: Belief, evidence: Evidence, extra: list[Evidence]
    ) -> None:
        """An unbounded id list on a long-lived learner is a slow leak."""
        current = update(prior, evidence, now=_clock)
        for item in extra:
            current = update(current, item, now=_clock)
        assert len(current.estimate.evidence_ids) <= 16

    @given(prior=beliefs(skill_id="python.loops"), evidence=evidences(skill_id="python.loops"))
    def test_is_pure(self, prior: Belief, evidence: Evidence) -> None:
        """Same inputs, same output — the property that makes replay possible."""
        first = update(prior, evidence, now=_clock)
        second = update(prior, evidence, now=_clock)
        assert first == second


class TestConfidenceFrom:
    """Properties of `confidence_from`."""

    @given(count=st.integers(min_value=0, max_value=10_000), diversity=st.integers(0, 50))
    def test_stays_on_the_unit_interval(self, count: int, diversity: int) -> None:
        assert 0.0 <= confidence_from(count, diversity) <= 1.0

    @given(
        low=st.integers(min_value=0, max_value=5_000),
        gap=st.integers(min_value=0, max_value=5_000),
        diversity=st.integers(0, 50),
    )
    def test_never_falls_as_count_rises(self, low: int, gap: int, diversity: int) -> None:
        assert confidence_from(low + gap, diversity) >= confidence_from(low, diversity)

    @given(
        count=st.integers(min_value=1, max_value=5_000),
        low=st.integers(min_value=0, max_value=50),
        gap=st.integers(min_value=0, max_value=50),
    )
    def test_never_falls_as_diversity_rises(self, count: int, low: int, gap: int) -> None:
        assert confidence_from(count, low + gap) >= confidence_from(count, low)

    @given(count=st.integers(min_value=0, max_value=1_000_000))
    def test_volume_alone_can_never_reach_the_count_ceiling(self, count: int) -> None:
        """Repetition is cheap and variety is not.

        With no variety at all, confidence must stay under the 0.4 the module
        allots to count — otherwise a learner answering the same question a
        thousand times would be treated as well understood.
        """
        assert confidence_from(count, 0) < 0.4


class TestStateOf:
    """Properties of `state_of`. The ORDER of the checks is the contract."""

    @given(estimate=skill_estimates())
    def test_a_misconception_outranks_every_number(self, estimate: SkillEstimate) -> None:
        assert (
            state_of(estimate, has_critical_misconception=True) is MasteryState.MISCONCEIVED
        )

    @given(estimate=skill_estimates())
    def test_no_evidence_is_unknown_whatever_the_estimate_says(
        self, estimate: SkillEstimate
    ) -> None:
        empty = estimate.model_copy(
            update={"evidence_count": 0, "evidence_diversity": 0, "evidence_ids": ()}
        )
        assert state_of(empty) is MasteryState.UNKNOWN

    @given(estimate=skill_estimates())
    def test_mastery_always_implies_every_gate_was_cleared(
        self, estimate: SkillEstimate
    ) -> None:
        """The one direction worth asserting.

        Whether a given record SHOULD be mastered restates the function. That
        mastery is never reported without the evidence behind it is the claim
        a learner is harmed by breaking.
        """
        if state_of(estimate) is MasteryState.MASTERED:
            assert estimate.estimate >= DEFAULT_GATES.mastered_estimate
            assert estimate.confidence >= DEFAULT_GATES.mastered_confidence
            assert estimate.evidence_diversity >= DEFAULT_GATES.min_diversity_for_mastery
            assert estimate.evidence_count >= DEFAULT_GATES.min_evidence_for_any_claim

    @given(estimate=skill_estimates(), gates=st.builds(Gates))
    def test_thin_evidence_is_never_reported_as_strength(
        self, estimate: SkillEstimate, gates: Gates
    ) -> None:
        if 0 < estimate.evidence_count < gates.min_evidence_for_any_claim:
            assert state_of(estimate, gates=gates) is MasteryState.INSUFFICIENT_EVIDENCE

    @given(estimate=skill_estimates())
    def test_decay_outranks_the_number(self, estimate: SkillEstimate) -> None:
        if estimate.evidence_count >= DEFAULT_GATES.min_evidence_for_any_claim:
            assert state_of(estimate, is_decaying=True) is MasteryState.DECAYING


# TODO: `DomainWeights.weight_of` returns 0.0 for an unknown dimension, which is
# indistinguishable from a dimension genuinely weighted zero. That is a design
# question for the owner, not a property — noted rather than tested so it is
# findable without inflating coverage.
if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(pytest.main([__file__]))
