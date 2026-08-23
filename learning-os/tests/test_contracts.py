"""The invariants, held to their own claims.

Every test here constructs something the spec says must be impossible and
asserts that it IS impossible. A contract that merely documents an invariant
has not enforced it, and the difference only shows up on the day somebody
writes the violating call -- which is exactly the day nobody is looking.

So each test is written as the mistake a real caller would make, not as an
abstract probe.
"""

from __future__ import annotations

from datetime import datetime
from itertools import pairwise

import pytest
from pydantic import ValidationError

from learning_os.models.contracts import (
    ActionKind,
    CandidateAction,
    Certainty,
    Decision,
    DecisionEvent,
    EvaluationStatus,
    Event,
    EventType,
    Evidence,
    EvidenceStrength,
    LearnerState,
    ObservationalHypothesis,
    PolicyUpdate,
    SkillEstimate,
    ToolResult,
    Verifiability,
    may_transition,
)

SKILL = "python.recursion.base_case"


def _action(kind: ActionKind = ActionKind.TEACH_BY_EXAMPLE, **over: float) -> CandidateAction:
    return CandidateAction(
        kind=kind,
        representation=over.pop("representation", "worked_example"),  # type: ignore[arg-type]
        expected_learning_gain=over.pop("expected_learning_gain", 0.5),
        probability_of_success=over.pop("probability_of_success", 0.6),
        expected_cost_seconds=over.pop("expected_cost_seconds", 60.0),
        **over,  # type: ignore[arg-type]
    )


# --------------------------------------------------------------------------
# Invariant 3 -- every state update references evidence
# --------------------------------------------------------------------------


def test_an_estimate_that_moved_must_say_what_moved_it() -> None:
    with pytest.raises(ValidationError, match="cites no evidence"):
        SkillEstimate(
            skill_id=SKILL,
            estimate=0.84,
            confidence=0.7,
            evidence_count=0,
            evidence_diversity=0,
            state="developing",
        )


def test_an_estimate_cannot_count_evidence_it_cannot_name() -> None:
    """The subtler half: a count without ids is a number with no provenance."""
    with pytest.raises(ValidationError, match="no evidence_ids"):
        SkillEstimate(
            skill_id=SKILL,
            estimate=0.5,
            confidence=0.5,
            evidence_count=4,
            evidence_diversity=2,
            state="unknown",
        )


def test_an_untouched_estimate_needs_no_evidence() -> None:
    """The negative control. Without it, "requires evidence" could be satisfied
    by a rule that rejects every estimate, which would be useless."""
    e = SkillEstimate(skill_id=SKILL, estimate=0.0, confidence=0.0, evidence_count=0,
                      evidence_diversity=0)
    assert e.state == "unknown"


# --------------------------------------------------------------------------
# Invariant 10 -- a mastery claim requires independent evidence
# --------------------------------------------------------------------------


def test_mastery_off_one_answer_is_refused() -> None:
    """The failure the spec names: an answer given straight after being shown
    the answer, promoted to mastery."""
    thin = SkillEstimate(
        skill_id=SKILL, estimate=0.95, confidence=0.9, evidence_count=1,
        evidence_diversity=1, evidence_ids=("ev1",), state="mastered",
    )
    assert thin.can_claim_mastery() is False


def test_mastery_with_varied_independent_evidence_is_allowed() -> None:
    solid = SkillEstimate(
        skill_id=SKILL, estimate=0.9, confidence=0.85, evidence_count=6,
        evidence_diversity=4, evidence_ids=("ev1", "ev2", "ev3"), state="mastered",
    )
    assert solid.can_claim_mastery() is True


def test_ten_identical_observations_do_not_equal_ten_independent_ones() -> None:
    """Diversity, not volume. This is the whole reason the field exists."""
    repetitive = SkillEstimate(
        skill_id=SKILL, estimate=0.9, confidence=0.85, evidence_count=10,
        evidence_diversity=1, evidence_ids=("ev1",), state="mastered",
    )
    assert repetitive.can_claim_mastery() is False


# --------------------------------------------------------------------------
# The no-diagnosis rule
# --------------------------------------------------------------------------


def test_a_diagnosis_cannot_be_written_as_a_signal() -> None:
    """The vocabulary is closed. "has_adhd" is not in it and cannot be added
    by a caller."""
    with pytest.raises(ValidationError):
        ObservationalHypothesis(
            signal="has_adhd",  # type: ignore[arg-type]
            confidence=0.9,
            evidence_ids=("ev1",),
        )


def test_a_diagnosis_cannot_be_smuggled_through_misconceptions() -> None:
    """The hole that a closed enum alone does NOT close.

    If any free-text field survives on the learner model, a trait gets written
    into it eventually. `misconceptions` was `tuple[str, ...]` and would have
    accepted this string without complaint.
    """
    with pytest.raises(ValidationError):
        LearnerState(
            learner_id="l1",
            version=1,
            misconceptions=("the student is lazy and probably has ADHD",),  # type: ignore[arg-type]
        )


def test_a_real_misconception_reference_is_accepted() -> None:
    """Negative control: the field still works for what it is for."""
    st = LearnerState(
        learner_id="l1", version=1,
        misconceptions=("python.recursion.thinks_base_case_is_optional",),
    )
    assert len(st.misconceptions) == 1


def test_a_signal_with_no_evidence_is_an_opinion_and_is_refused() -> None:
    with pytest.raises(ValidationError, match="opinion"):
        ObservationalHypothesis(signal="possible_confusion", confidence=0.8)


def test_signals_expire_by_default() -> None:
    """A signal that outlives its session hardens into a label. The default
    has to be expiry, because defaults are what actually ship."""
    h = ObservationalHypothesis(
        signal="possible_confusion", confidence=0.6, evidence_ids=("ev1",)
    )
    assert h.expires_after_session is True


# --------------------------------------------------------------------------
# Invariant 11 -- unsupported domains produce uncertainty
# --------------------------------------------------------------------------


def test_an_unsupported_domain_cannot_report_confidence() -> None:
    with pytest.raises(ValidationError, match="fabricated confidence"):
        ToolResult(
            tool="rubric", tool_input="was the essay persuasive?", result="fairly",
            source="inference", verification=Verifiability.UNSUPPORTED, confidence=0.9,
        )


def test_a_verifiable_domain_may_report_confidence() -> None:
    r = ToolResult(
        tool="pytest", tool_input="test_base_case", result="1 passed",
        source="execution", verification=Verifiability.VERIFIABLE, confidence=0.95,
    )
    assert r.confidence == 0.95
    assert r.retrieved_at.tzinfo is not None


# --------------------------------------------------------------------------
# Invariants 1, 2, 12 -- decisions are targeted, predicted, and replayable
# --------------------------------------------------------------------------


def test_a_decision_must_name_the_skill_it_targets() -> None:
    with pytest.raises(ValidationError):
        Decision(
            decision_id="d1",
            candidate_actions=(_action(),),
            selected=_action(),
            expected_evidence=EvidenceStrength.PREDICTION,
            confidence=0.8,
            certainty=Certainty.LIKELY,
            reason_codes=("only_option",),
        )  # type: ignore[call-arg]


def test_the_selected_action_must_be_one_of_the_candidates() -> None:
    """Replay means seeing what the winner was chosen OVER. A selection that
    was never a candidate makes the decision unfalsifiable."""
    considered = _action(expected_learning_gain=0.4)
    smuggled = _action(kind=ActionKind.TRANSFER_CHALLENGE, expected_learning_gain=0.9)
    with pytest.raises(ValidationError, match="not among the candidates"):
        Decision(
            decision_id="d1", target_skill=SKILL,
            candidate_actions=(considered,), selected=smuggled,
            expected_evidence=EvidenceStrength.PREDICTION,
            confidence=0.8, certainty=Certainty.LIKELY, reason_codes=("x",),
        )


def test_a_decision_records_what_would_count_as_success() -> None:
    """Invariant 2. Chosen before acting, so the bar cannot move afterwards."""
    a = _action()
    d = Decision(
        decision_id="d1", target_skill=SKILL, candidate_actions=(a,), selected=a,
        expected_evidence=EvidenceStrength.INDEPENDENT_APPLICATION,
        confidence=0.8, certainty=Certainty.LIKELY, reason_codes=("no_prior_failure",),
    )
    assert d.expected_evidence is EvidenceStrength.INDEPENDENT_APPLICATION


def test_a_decision_must_give_at_least_one_reason() -> None:
    a = _action()
    with pytest.raises(ValidationError):
        Decision(
            decision_id="d1", target_skill=SKILL, candidate_actions=(a,), selected=a,
            expected_evidence=EvidenceStrength.PREDICTION,
            confidence=0.8, certainty=Certainty.LIKELY, reason_codes=(),
        )


def test_doing_nothing_is_a_decision_the_engine_can_take() -> None:
    """"Intelligence includes doing nothing." If the action set were only
    teaching actions the engine would always teach, including when the right
    move was to leave a learner alone who already understood."""
    a = _action(kind=ActionKind.DO_NOTHING, expected_learning_gain=0.0)
    d = Decision(
        decision_id="d1", target_skill=SKILL, candidate_actions=(a,), selected=a,
        expected_evidence=EvidenceStrength.RECALL, confidence=0.9,
        certainty=Certainty.KNOWN, reason_codes=("already_mastered",),
    )
    assert d.selected.kind is ActionKind.DO_NOTHING


# --------------------------------------------------------------------------
# Invariant 9 -- production policy cannot change from one live outcome
# --------------------------------------------------------------------------


def _policy(status: EvaluationStatus) -> PolicyUpdate:
    a = _action()
    return PolicyUpdate(
        policy_version="p1", decision_id="d1",
        state_before=LearnerState(learner_id="l1", version=1),
        action=a, predicted_outcome=0.6, actual_outcome=0.8,
        learning_gain=0.2, cost_seconds=45.0, recovered=True,
        evaluation_status=status,
    )


def test_an_outcome_cannot_be_born_live() -> None:
    """The naive loop -- outcome updates policy directly -- is rejected for
    production. One unusual learner response must not be able to change the
    system for everyone."""
    with pytest.raises(ValidationError, match="evaluation pipeline"):
        _policy(EvaluationStatus.LIVE)


def test_an_outcome_cannot_be_born_in_canary_either() -> None:
    with pytest.raises(ValidationError, match="evaluation pipeline"):
        _policy(EvaluationStatus.CANARY)


def test_an_observed_outcome_is_fine() -> None:
    assert _policy(EvaluationStatus.OBSERVED).evaluation_status is EvaluationStatus.OBSERVED


def test_the_pipeline_cannot_be_skipped() -> None:
    """No path from observed straight to live. Every gate is a place a human
    or a check can say no, and skipping one silently is the failure mode."""
    assert may_transition(EvaluationStatus.OBSERVED, EvaluationStatus.LIVE) is False
    assert may_transition(EvaluationStatus.OBSERVED, EvaluationStatus.APPROVED) is False
    assert may_transition(EvaluationStatus.GATES_PASSED, EvaluationStatus.LIVE) is False


def test_human_approval_is_on_the_only_road_to_live() -> None:
    path = [
        EvaluationStatus.OBSERVED,
        EvaluationStatus.OFFLINE_EVALUATED,
        EvaluationStatus.BENCHMARK_REPLAYED,
        EvaluationStatus.GATES_PASSED,
        EvaluationStatus.AWAITING_HUMAN_APPROVAL,
        EvaluationStatus.APPROVED,
        EvaluationStatus.CANARY,
        EvaluationStatus.LIVE,
    ]
    for a, b in pairwise(path):
        assert may_transition(a, b), f"{a} -> {b} should be allowed"
    assert EvaluationStatus.AWAITING_HUMAN_APPROVAL in path


def test_a_live_rollout_can_still_be_rejected() -> None:
    """A canary that cannot be stopped is not a canary."""
    assert may_transition(EvaluationStatus.LIVE, EvaluationStatus.REJECTED) is True
    assert may_transition(EvaluationStatus.CANARY, EvaluationStatus.REJECTED) is True


# --------------------------------------------------------------------------
# Invariant 8 -- self-report does not outrank objective evidence
# --------------------------------------------------------------------------


def test_self_report_is_the_weakest_evidence_there_is() -> None:
    assert EvidenceStrength.SELF_REPORT.rank == max(e.rank for e in EvidenceStrength)
    assert EvidenceStrength.SELF_REPORT.is_objective is False
    assert EvidenceStrength.INDEPENDENT_NOVEL_TRANSFER.rank == 0
    assert EvidenceStrength.INDEPENDENT_NOVEL_TRANSFER.is_objective is True


def test_a_hinted_answer_weighs_less_than_an_unaided_one() -> None:
    """Not correct/wrong. The same observed performance means different things
    depending on how much help produced it."""
    common = dict(
        evidence_id="e", event_id="ev", skill_id=SKILL,
        observed_performance=1.0, task_difficulty=0.5, task_reliability=1.0,
        response_time_ms=1000, representation="worked_example", attempt_number=1,
    )
    unaided = Evidence(strength=EvidenceStrength.INDEPENDENT_APPLICATION,
                       independence=1.0, hint_factor=0.0, **common)  # type: ignore[arg-type]
    hinted = Evidence(strength=EvidenceStrength.ANSWER_AFTER_HINT,
                      independence=0.4, hint_factor=0.6, **common)  # type: ignore[arg-type]
    assert unaided.weight > hinted.weight


# --------------------------------------------------------------------------
# Replay
# --------------------------------------------------------------------------


def test_events_must_carry_an_aware_timestamp() -> None:
    """A naive datetime lets two events an hour apart sort backwards, and a
    replay then rebuilds a decision from state that did not exist yet."""
    with pytest.raises(ValidationError, match="timezone-aware"):
        Event(
            event_id="e1", event_type=EventType.STUDENT_MESSAGE, learner_id="l1",
            session_id="s1", situation_state_version=1, learner_state_version=1,
            knowledge_version="python_v1",
            timestamp=datetime(2026, 1, 1, 12, 0, 0),  # naive on purpose
        )


def test_a_decision_event_cannot_replay_out_of_order() -> None:
    a = _action()
    d = Decision(
        decision_id="d1", target_skill=SKILL, candidate_actions=(a,), selected=a,
        expected_evidence=EvidenceStrength.PREDICTION, confidence=0.7,
        certainty=Certainty.LIKELY, reason_codes=("r",),
    )
    with pytest.raises(ValidationError, match="out of order"):
        DecisionEvent(
            event_id="e1", learner_id="l1", situation_state_version=14,
            learner_state_version=31, knowledge_version="python_v1",
            decision=d, post_state_version=30,
        )


def test_a_decision_event_carries_every_input_the_decision_saw() -> None:
    """Invariant 12. If any of these were missing, "why did it do that?" has
    no answer six weeks later."""
    a = _action()
    d = Decision(
        decision_id="d1", target_skill=SKILL, candidate_actions=(a,), selected=a,
        expected_evidence=EvidenceStrength.PREDICTION, confidence=0.7,
        certainty=Certainty.LIKELY, reason_codes=("previous_text_failed",),
    )
    ev = DecisionEvent(
        event_id="e1", learner_id="l1", situation_state_version=14,
        learner_state_version=31, knowledge_version="python_v1",
        retrieved_memory_ids=("mem_4", "mem_9"), decision=d, post_state_version=32,
    )
    for field in (
        "situation_state_version", "learner_state_version", "knowledge_version",
        "retrieved_memory_ids", "decision", "post_state_version",
    ):
        assert getattr(ev, field) is not None, f"replay needs {field}"
    assert ev.decision.candidate_actions, "replay needs what was NOT chosen too"


# --------------------------------------------------------------------------
# The shape of the contracts themselves
# --------------------------------------------------------------------------


def test_contracts_are_immutable() -> None:
    """Append-only is what makes replay meaningful. An event that can be edited
    after the fact is a record of the present, not the past."""
    e = Event(
        event_id="e1", event_type=EventType.STUDENT_MESSAGE, learner_id="l1",
        session_id="s1", situation_state_version=1, learner_state_version=1,
        knowledge_version="python_v1",
    )
    with pytest.raises(ValidationError):
        e.learner_id = "someone_else"  # type: ignore[misc]


def test_a_typo_in_a_field_name_is_refused_not_ignored() -> None:
    """`extra="forbid"`. Otherwise the object constructs, the real field keeps
    its default, and the mistake surfaces later as an estimate computed from
    nothing."""
    with pytest.raises(ValidationError):
        SkillEstimate(
            skill_id=SKILL, estimate=0.5, confidence=0.5,
            evidence_count=0, evidence_diversity=0,
            evidence_id=("ev1",),  # type: ignore[call-arg] -- singular, wrong
        )


def test_a_skill_id_must_be_dotted() -> None:
    with pytest.raises(ValidationError):
        SkillEstimate(skill_id="recursion", estimate=0.0, confidence=0.0,
                      evidence_count=0, evidence_diversity=0)


def test_every_contract_carries_its_version() -> None:
    """A log written under one shape and read under another is how a replay
    quietly reconstructs the wrong decision."""
    e = Event(
        event_id="e1", event_type=EventType.SESSION_ENDED, learner_id="l1",
        session_id="s1", situation_state_version=0, learner_state_version=0,
        knowledge_version="python_v1",
    )
    assert e.contract_version
    assert _policy(EvaluationStatus.OBSERVED).contract_version == e.contract_version


def test_prediction_error_is_recorded_so_the_policy_can_be_scored() -> None:
    p = _policy(EvaluationStatus.OBSERVED)
    assert abs(p.prediction_error - 0.2) < 1e-9
