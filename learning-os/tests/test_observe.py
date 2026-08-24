"""The leg of the loop that was missing, held to what it must not fabricate.

Before this, `evaluate_response` was written, tested, and called by nothing. The
engine could decide and teach; a learner could answer; the answer changed
nothing. Every module passed its own tests, because the defect was the absence
of a call BETWEEN two of them.

So these tests are about the seam rather than the parts: does an answer become
evidence, does that evidence move the belief, and — the one that matters most —
does an UNSETTLED judgement leave the belief alone.
"""

from __future__ import annotations

from datetime import UTC, datetime

from learning_os.domain.python_recursion import GRAPH
from learning_os.llm.contract import DiagnosisKind, InstructionContract, Strategy
from learning_os.mastery import Belief
from learning_os.memory.store import MemoryStore, Outcome
from learning_os.models.contracts import (
    ActionKind,
    EvidenceStrength,
    SkillEstimate,
    Verifiability,
)
from learning_os.runtime import Observation, observe
from learning_os.verifiers.base import Judgement, Task
from learning_os.verifiers.python_verifier import PythonVerifier

SKILL = "python.recursion.write_recursive_function"
NOW = datetime(2026, 1, 1, tzinfo=UTC)


def _now() -> datetime:
    return NOW


def _contract() -> InstructionContract:
    return InstructionContract(
        target_skill=SKILL,
        question="Write a recursive factorial.",
        diagnosis=DiagnosisKind.CONCEPT_GAP,
        strategy=Strategy.WORKED_EXAMPLE,
        action=ActionKind.TEACH_BY_EXAMPLE,
        success_evidence_required="learner writes it unaided",
    )


def _belief(estimate: float = 0.3) -> Belief:
    return Belief(
        estimate=SkillEstimate(
            skill_id=SKILL,
            estimate=estimate,
            confidence=0.5,
            evidence_count=3,
            evidence_diversity=2,
            evidence_ids=("ev0",),
        )
    )


def _task(checker: str, *, skill: str = SKILL, novel: bool = False) -> Task:
    return Task(
        task_id="t1",
        skill_id=skill,
        prompt="write it",
        checker=checker,
        expected_evidence=EvidenceStrength.INDEPENDENT_APPLICATION,
        is_novel_context=novel,
    )


GOOD = """
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)
"""

ALL_PASS = "print('CHECK PASS' if factorial(5) == 120 else 'CHECK FAIL')"
HALF = (
    "print('CHECK PASS' if factorial(1) == 1 else 'CHECK FAIL')\n"
    "print('CHECK FAIL')\n"
)
ALL_FAIL = "print('CHECK FAIL')\nprint('CHECK FAIL')"


def _observe(
    checker: str,
    response: str = GOOD,
    *,
    memory: MemoryStore | None = None,
    task: Task | None = None,
    belief: Belief | None = None,
    hint_factor: float = 0.0,
) -> Observation:
    return observe(
        PythonVerifier(GRAPH),
        memory if memory is not None else MemoryStore(),
        task if task is not None else _task(checker),
        response,
        belief if belief is not None else _belief(),
        _contract(),
        now=_now,
        event_id="e1",
        evidence_id="ev1",
        hint_factor=hint_factor,
    )


# --------------------------------------------------------------------------
# The loop closes
# --------------------------------------------------------------------------


def test_an_answer_becomes_evidence_and_moves_the_belief() -> None:
    """THE MISSING LEG. Without this the system teaches forever and learns
    nothing about the learner."""
    before = _belief(0.3)
    result = _observe(ALL_PASS, belief=before)

    assert result.settled
    assert result.evidence is not None
    assert result.belief.estimate.estimate > before.estimate.estimate
    assert result.belief.estimate.evidence_count == before.estimate.evidence_count + 1


def test_a_wrong_answer_moves_the_belief_down() -> None:
    before = _belief(0.8)
    result = _observe(ALL_FAIL, belief=before)
    assert result.belief.estimate.estimate < before.estimate.estimate


def test_the_prior_belief_is_not_mutated() -> None:
    """The estimator is pure and the runtime keeps it that way. A caller holding
    the old belief must still hold it, or a decision cannot be replayed against
    the state that produced it."""
    before = _belief(0.3)
    _observe(ALL_PASS, belief=before)
    assert before.estimate.estimate == 0.3
    assert before.estimate.evidence_count == 3


def test_the_evidence_is_recorded_in_memory() -> None:
    memory = MemoryStore()
    _observe(ALL_PASS, memory=memory)
    assert len(memory.evidence_for(SKILL)) == 1


# --------------------------------------------------------------------------
# An unsettled judgement must not move anything
# --------------------------------------------------------------------------


def test_an_unverifiable_skill_leaves_the_belief_untouched() -> None:
    """THE INVARIANT THIS FILE EXISTS FOR.

    `HUMAN_REVIEW_REQUIRED` means the verifier could not decide. Scoring it zero
    punishes the learner for the engine's inability to check; scoring it a pass
    manufactures mastery. Recording that nothing was learned is the only honest
    third option.
    """
    before = _belief(0.4)
    result = _observe(
        ALL_PASS,
        task=_task(ALL_PASS, skill="python.recursion.explain_termination"),
        belief=before,
    )
    assert result.judgement.verifiability is Verifiability.HUMAN_REVIEW_REQUIRED
    assert result.settled is False
    assert result.evidence is None
    assert result.belief == before, "an unsettled judgement moved the estimate"


def test_an_unsettled_attempt_is_still_recorded_as_tried() -> None:
    """The policy must not re-choose a mechanism that has already been used, even
    when the outcome could not be judged. Otherwise the fallback repeats an
    approach whose result nobody knows."""
    memory = MemoryStore()
    _observe(
        ALL_PASS,
        task=_task(ALL_PASS, skill="python.recursion.explain_termination"),
        memory=memory,
    )
    assert memory.attempt_count(SKILL) == 1
    assert memory.evidence_for(SKILL) == ()


# --------------------------------------------------------------------------
# Outcomes: partial is not failure
# --------------------------------------------------------------------------


def test_half_the_checks_is_traction_not_failure() -> None:
    """A learner moved by an approach and not far enough is a reason to VARY it.
    A boolean would abandon the only approach showing traction."""
    memory = MemoryStore()
    result = _observe(HALF, memory=memory)
    assert result.outcome is Outcome.PARTIAL
    assert memory.attempts_on(SKILL)[0].outcome is Outcome.PARTIAL


def test_everything_passing_is_success() -> None:
    assert _observe(ALL_PASS).outcome is Outcome.SUCCESS


def test_everything_failing_is_failure() -> None:
    assert _observe(ALL_FAIL).outcome is Outcome.FAILURE


def test_a_partial_does_not_burn_the_mechanism() -> None:
    """`failed_mechanisms` excludes anything that has also shown traction.
    Recording PARTIAL rather than FAILURE is what keeps that true."""
    memory = MemoryStore()
    _observe(HALF, memory=memory)
    assert Strategy.WORKED_EXAMPLE.value not in memory.failed_mechanisms(SKILL)


# --------------------------------------------------------------------------
# Evidence strength is decided BEFORE the answer is seen
# --------------------------------------------------------------------------


def test_strength_comes_from_the_task_not_the_result() -> None:
    """Invariant 2. Deciding what counts as strong evidence after seeing the
    answer is how every intervention ends up looking successful."""
    passed = _observe(ALL_PASS)
    failed = _observe(ALL_FAIL)
    assert passed.evidence is not None
    assert failed.evidence is not None
    assert passed.evidence.strength is failed.evidence.strength
    assert passed.evidence.strength is EvidenceStrength.INDEPENDENT_APPLICATION


def test_a_hint_demotes_the_evidence_without_erasing_it() -> None:
    """A hinted answer is real evidence of something weaker, not an absence of
    evidence — the learner still did something."""
    result = _observe(ALL_PASS, hint_factor=0.6)
    assert result.evidence is not None
    assert result.evidence.strength is EvidenceStrength.ANSWER_AFTER_HINT
    assert result.evidence.independence < 1.0


def test_a_hinted_pass_moves_the_belief_less_than_an_unaided_one() -> None:
    """The whole point of tracking independence. Same answer, same checks,
    different evidentiary weight."""
    unaided = _observe(ALL_PASS, belief=_belief(0.3))
    hinted = _observe(ALL_PASS, belief=_belief(0.3), hint_factor=0.6)
    assert hinted.belief.estimate.estimate < unaided.belief.estimate.estimate


def test_a_novel_context_is_recorded_as_harder_and_newer() -> None:
    result = _observe(ALL_PASS, task=_task(ALL_PASS, novel=True))
    assert result.evidence is not None
    assert result.evidence.context_novelty == 1.0
    assert result.evidence.task_difficulty > 0.5


# --------------------------------------------------------------------------
# Provenance
# --------------------------------------------------------------------------


def test_ids_come_from_the_caller_so_a_replay_is_identical() -> None:
    """Generating them here would need a clock or a random source inside a
    function that must stay replayable, and provenance that changes on replay is
    not provenance."""
    a = _observe(ALL_PASS)
    b = _observe(ALL_PASS)
    assert a.evidence is not None
    assert b.evidence is not None
    assert a.evidence == b.evidence


def test_the_attempt_number_counts_prior_attempts() -> None:
    memory = MemoryStore()
    _observe(ALL_PASS, memory=memory)
    second = _observe(ALL_PASS, memory=memory)
    assert second.evidence is not None
    assert second.evidence.attempt_number == 2


def test_the_recorded_mechanism_matches_the_policys_vocabulary() -> None:
    """If this records the action while the policy excludes on mechanism,
    nothing is ever excluded and the fallback silently stops working."""
    memory = MemoryStore()
    _observe(ALL_FAIL, memory=memory)
    assert memory.attempts_on(SKILL)[0].mechanism == Strategy.WORKED_EXAMPLE.value


def test_a_syntax_error_is_settled_and_counts_against_the_learner() -> None:
    """Definitive, not uncertain: the code cannot run and there is nothing
    ambiguous about that. It must produce evidence, unlike an unverifiable
    skill."""
    result = _observe(ALL_PASS, response="def broken(:\n  pass")
    assert result.judgement.verifiability is Verifiability.VERIFIABLE
    assert result.settled
    assert result.outcome is Outcome.FAILURE


def test_the_judgement_survives_to_the_caller() -> None:
    """Without it the caller knows the outcome and not why — and `detail` is what
    a human reads when a learner disputes a mark."""
    result = _observe(ALL_FAIL)
    assert isinstance(result.judgement, Judgement)
    assert result.judgement.detail
