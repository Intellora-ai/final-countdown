"""The policy, held to the property the product is named for.

The claim this module has to earn is "non-generic": materially different learner
states produce materially different teaching. Two tests carry that, and they pull
in OPPOSITE directions on purpose --

    same state       -> same action        (or the variation is noise)
    different state  -> different action   (or nothing is adapting)

A policy that always diverges passes the second and fails the first, and it looks
like personalisation while being random. Only asserting both distinguishes them.
"""

from __future__ import annotations

from dataclasses import dataclass

import pytest

from learning_os.domain.python_recursion import GRAPH
from learning_os.llm.contract import DiagnosisKind, Strategy
from learning_os.memory.store import Attempt, MemoryStore, Outcome
from learning_os.models.contracts import ActionKind
from learning_os.policy import (
    BottleneckLike,
    Decision,
    ReasonCode,
    choose_strategy,
    select_action,
)

TRACE = "python.recursion.trace_calls"
WRITE = "python.recursion.write_recursive_function"
TRANSFER = "python.recursion.apply_to_nested_structure"
QUESTION = "Why does a recursive function need a base case?"


@dataclass(frozen=True, slots=True)
class _Bottleneck:
    """A stand-in satisfying `BottleneckLike` structurally.

    Deliberately not an import of `diagnosis.Bottleneck`: the policy must depend
    only on the three fields it reads, and a test that imports the concrete class
    would stop enforcing that. The real one satisfies this Protocol.
    """

    skill_id: str
    confidence: float = 0.9
    needs_diagnostic: bool = False


def _attempt(skill: str, strategy: Strategy, outcome: Outcome) -> Attempt:
    """One recorded attempt.

    `mechanism` is the STRATEGY name, because that is the vocabulary the policy
    asks its exclusion question in. Recording the action here instead is what
    made a single failure burn four distinct mechanisms.
    """
    return Attempt(
        skill_id=skill,
        action=_ACTION_OF(strategy),
        representation="prose",
        outcome=outcome,
        mechanism=strategy.value,
    )


def _decide(
    bottleneck: BottleneckLike,
    memory: MemoryStore,
    diagnosis: DiagnosisKind,
    *,
    live_misconceptions: tuple[str, ...] = (),
) -> Decision:
    return select_action(
        GRAPH,
        memory,
        bottleneck,
        diagnosis,
        question=QUESTION,
        live_misconceptions=live_misconceptions,
    )


# --------------------------------------------------------------------------
# The property the whole product rests on
# --------------------------------------------------------------------------


def test_identical_states_produce_identical_decisions() -> None:
    """Personalisation that varies for its own sake is noise in a costume.

    Section 67: the objective is APPROPRIATE divergence, not maximum divergence.
    Two learners the engine cannot distinguish must get the same next action, or
    the differences it produces mean nothing.
    """
    a = _decide(_Bottleneck(TRACE), MemoryStore(), DiagnosisKind.CONCEPT_GAP)
    b = _decide(_Bottleneck(TRACE), MemoryStore(), DiagnosisKind.CONCEPT_GAP)
    assert a == b


def test_different_diagnoses_produce_different_strategies() -> None:
    """The other direction, and the reason the product exists.

    Same skill, same history, different reason for being stuck. If these came
    back the same, the diagnosis would be decoration.
    """
    gap = _decide(_Bottleneck(TRACE), MemoryStore(), DiagnosisKind.CONCEPT_GAP)
    overload = _decide(_Bottleneck(TRACE), MemoryStore(), DiagnosisKind.COGNITIVE_OVERLOAD)
    procedural = _decide(_Bottleneck(TRACE), MemoryStore(), DiagnosisKind.PROCEDURAL_FAILURE)

    chosen = {
        gap.contract.strategy,
        overload.contract.strategy,
        procedural.contract.strategy,
    }
    assert len(chosen) == 3, f"three different diagnoses collapsed to {chosen}"


def test_the_same_diagnosis_diverges_once_histories_differ() -> None:
    """Identical state today, different state because of what already happened.

    This is the case a stateless system cannot express at all: nothing about the
    learner's knowledge differs, only what has already been tried on them.
    """
    fresh = MemoryStore()

    burned = MemoryStore()
    burned.record_attempt(_attempt(TRACE, Strategy.WORKED_EXAMPLE, Outcome.FAILURE))

    a = _decide(_Bottleneck(TRACE), fresh, DiagnosisKind.CONCEPT_GAP)
    b = _decide(_Bottleneck(TRACE), burned, DiagnosisKind.CONCEPT_GAP)
    assert a.contract.strategy != b.contract.strategy


# --------------------------------------------------------------------------
# Never blindly repeat a failed strategy — section 46
# --------------------------------------------------------------------------


def test_a_failed_strategy_is_excluded_and_the_exclusion_is_recorded() -> None:
    """"We did not repeat ourselves" is a claim, and a claim should be
    checkable rather than trusted."""
    m = MemoryStore()
    m.record_attempt(_attempt(TRACE, Strategy.WORKED_EXAMPLE, Outcome.FAILURE))

    d = _decide(_Bottleneck(TRACE), m, DiagnosisKind.CONCEPT_GAP)
    assert ReasonCode.AVOIDED_FAILED_STRATEGY in d.reasons
    assert d.excluded == (Strategy.WORKED_EXAMPLE,)

    # THE MECHANISM CHANGED. THE ACTION DID NOT, AND THAT IS CORRECT.
    #
    # This first asserted the ActionKind differed, and it failed for a good
    # reason: a contrast and a worked example are genuinely different teaching
    # moves that both arrive as TEACH_BY_EXAMPLE. Requiring the ACTION to change
    # would force the fallback to jump to a different KIND of interaction when a
    # different explanation was what was needed, and would make three quarters of
    # the available mechanisms unreachable after a single failure.
    assert d.contract.strategy is not Strategy.WORKED_EXAMPLE
    assert _ACTION_OF(d.contract.strategy) is ActionKind.TEACH_BY_EXAMPLE


def _ACTION_OF(strategy: Strategy) -> ActionKind:
    from learning_os.policy.select import _ACTION_FOR

    return _ACTION_FOR[strategy]


def test_a_strategy_that_failed_once_but_usually_works_is_not_excluded() -> None:
    """Memory's asymmetry, honoured here rather than re-derived.

    Banning an approach on a single bad outcome throws away the one that mostly
    works for this learner.
    """
    m = MemoryStore()
    m.record_attempt(_attempt(TRACE, Strategy.WORKED_EXAMPLE, Outcome.FAILURE))
    m.record_attempt(_attempt(TRACE, Strategy.WORKED_EXAMPLE, Outcome.SUCCESS))

    d = _decide(_Bottleneck(TRACE), m, DiagnosisKind.CONCEPT_GAP)
    assert ReasonCode.AVOIDED_FAILED_STRATEGY not in d.reasons


def test_exhaustion_still_returns_an_action_and_says_so() -> None:
    """Running out must not mean returning nothing.

    A learner left with no next step is worse off than one shown a repeat. The
    reason code is what lets the runtime escalate instead of looping silently --
    the failure is visible rather than blind, which is the distinction section 46
    actually draws.
    """
    m = MemoryStore()
    for strategy in (Strategy.PREREQUISITE_REPAIR, Strategy.DECOMPOSITION):
        m.record_attempt(_attempt(TRACE, strategy, Outcome.FAILURE))

    d = _decide(_Bottleneck(TRACE), m, DiagnosisKind.PREREQUISITE_GAP)
    assert ReasonCode.STRATEGIES_EXHAUSTED in d.reasons
    assert d.contract.strategy is not None


def test_memory_is_scoped_so_another_skill_is_unaffected() -> None:
    """A mechanism that failed for tracing may be exactly right for writing.
    Recursion's subskills come apart in practice, which is the whole reason the
    concept was chosen."""
    m = MemoryStore()
    m.record_attempt(_attempt(WRITE, Strategy.WORKED_EXAMPLE, Outcome.FAILURE))

    d = _decide(_Bottleneck(TRACE), m, DiagnosisKind.CONCEPT_GAP)
    assert ReasonCode.AVOIDED_FAILED_STRATEGY not in d.reasons


# --------------------------------------------------------------------------
# Friction, load, and misconceptions
# --------------------------------------------------------------------------


def test_no_question_is_asked_when_the_evidence_already_answers() -> None:
    """Section 28. Friction the learner pays for nothing buys a worse learner
    model, because it spends the attention that teaching needed."""
    d = _decide(
        _Bottleneck(TRACE, needs_diagnostic=False), MemoryStore(), DiagnosisKind.CONCEPT_GAP
    )
    assert ReasonCode.EVIDENCE_ALREADY_SUFFICIENT in d.reasons
    assert ReasonCode.DIAGNOSTIC_NEEDED not in d.reasons


def test_a_diagnostic_is_requested_when_the_bottleneck_says_so() -> None:
    d = _decide(_Bottleneck(TRACE, confidence=0.3, needs_diagnostic=True),
                MemoryStore(), DiagnosisKind.CONCEPT_GAP)
    assert ReasonCode.DIAGNOSTIC_NEEDED in d.reasons


def test_overload_narrows_the_lesson_rather_than_re_explaining_it() -> None:
    """The intuitive response to overload is to say the same amount more slowly,
    which adds load. Section 52: reduce simultaneous novelty."""
    d = _decide(_Bottleneck(TRACE), MemoryStore(), DiagnosisKind.COGNITIVE_OVERLOAD)
    assert d.contract.simplicity.max_blocks == 1
    assert ReasonCode.DECOMPOSED_FOR_LOAD in d.reasons


def _skill_with_a_catalogued_misconception() -> tuple[str, str]:
    for concept in GRAPH.concepts:
        for sub in concept.subskills:
            if sub.misconceptions:
                return sub.skill_id, sub.misconceptions[0]
    raise AssertionError("the V1 graph catalogues no misconceptions at all")


def test_a_misconception_the_learner_holds_outranks_the_arriving_diagnosis() -> None:
    """Re-explaining a concept to somebody holding a specific wrong model
    teaches them to hold both."""
    skill, misconception = _skill_with_a_catalogued_misconception()
    d = _decide(
        _Bottleneck(skill),
        MemoryStore(),
        DiagnosisKind.CONCEPT_GAP,
        live_misconceptions=(misconception,),
    )
    assert d.contract.diagnosis is DiagnosisKind.MISCONCEPTION
    assert ReasonCode.MISCONCEPTION_LIVE in d.reasons


def test_a_catalogued_misconception_the_learner_does_not_hold_changes_nothing() -> None:
    """THE BUG THIS TEST EXISTS FOR, CAUGHT BY THE DIVERGENCE TESTS.

    The override first fired on `subskill.misconceptions` -- true whenever the
    GRAPH catalogues a misconception for the skill. That is a fact about the
    subject, not about this learner, so every skill with a catalogued
    misconception became a misconception repair for everybody. All ten diagnoses
    collapsed to one, and the policy produced identical teaching for materially
    different states: perfectly generic behaviour, in the module whose entire job
    is not being generic.

    The catalogue says what CAN go wrong. Only what HAS gone wrong for this
    learner is a reason to change course.
    """
    skill, _ = _skill_with_a_catalogued_misconception()
    d = _decide(_Bottleneck(skill), MemoryStore(), DiagnosisKind.CONCEPT_GAP)
    assert d.contract.diagnosis is DiagnosisKind.CONCEPT_GAP
    assert ReasonCode.MISCONCEPTION_LIVE not in d.reasons


def test_an_unrelated_held_misconception_does_not_hijack_the_diagnosis() -> None:
    """Holding a wrong model about one subskill is not a reason to repair a
    different one. Without the intersection, any live misconception anywhere
    would redirect every decision."""
    skill, _ = _skill_with_a_catalogued_misconception()
    d = _decide(
        _Bottleneck(skill),
        MemoryStore(),
        DiagnosisKind.CONCEPT_GAP,
        live_misconceptions=("python.functions.something_else_entirely",),
    )
    assert d.contract.diagnosis is DiagnosisKind.CONCEPT_GAP


# --------------------------------------------------------------------------
# The contract the policy hands over must itself be valid
# --------------------------------------------------------------------------


def test_the_contract_carries_the_concepts_technical_terms() -> None:
    """Simplify the path through the knowledge, never the knowledge. The terms
    reach the model as a requirement a validator enforces, not as advice."""
    d = _decide(_Bottleneck(TRACE), MemoryStore(), DiagnosisKind.CONCEPT_GAP)
    assert d.contract.required_terms, "no technical terms were carried through"


def test_the_contract_forbids_this_concepts_specific_falsehoods() -> None:
    """Not a generic banned-word list: the specific untrue things it is tempting
    to say about THIS concept when a learner is struggling."""
    d = _decide(_Bottleneck(TRACE), MemoryStore(), DiagnosisKind.CONCEPT_GAP)
    joined = " ".join(d.contract.forbidden_phrases).lower()
    assert "repeats" in joined or "optional" in joined


def test_success_is_defined_before_the_learner_responds() -> None:
    """Invariant 2. Deciding what counts as success after seeing the answer is
    how every intervention ends up looking successful."""
    d = _decide(_Bottleneck(TRACE), MemoryStore(), DiagnosisKind.CONCEPT_GAP)
    assert d.contract.success_evidence_required.strip()


def test_every_diagnosis_can_be_acted_on() -> None:
    """A diagnosis with no strategy raises KeyError mid-lesson, in front of a
    learner. Cheap to prove here instead."""
    for diagnosis in DiagnosisKind:
        d = _decide(_Bottleneck(TRACE), MemoryStore(), diagnosis)
        assert d.contract.action in ActionKind


def test_every_strategy_maps_to_an_action() -> None:
    """The other half: a strategy with no action is unreachable but constructible,
    so the gap only shows when the policy finally picks it."""
    from learning_os.policy.select import _ACTION_FOR

    missing = [s for s in Strategy if s not in _ACTION_FOR]
    assert not missing, f"strategies with no action: {missing}"


def test_a_transfer_skill_is_recognised_as_ready() -> None:
    d = _decide(_Bottleneck(TRANSFER), MemoryStore(), DiagnosisKind.CONCEPT_GAP)
    assert ReasonCode.READY_FOR_TRANSFER in d.reasons


def test_the_real_bottleneck_shape_satisfies_the_protocol() -> None:
    """The Protocol exists so the policy cannot reach into scoring internals.
    This asserts the stand-in is not quietly weaker than the real thing."""
    assert isinstance(_Bottleneck(TRACE), BottleneckLike)


# --------------------------------------------------------------------------
# Reason codes
# --------------------------------------------------------------------------


def test_every_decision_can_explain_itself() -> None:
    """An unexplainable decision cannot be improved: a bad outcome produces no
    information, because there is nothing to disagree with."""
    for diagnosis in DiagnosisKind:
        d = _decide(_Bottleneck(TRACE), MemoryStore(), diagnosis)
        assert d.reasons, f"{diagnosis} produced a decision with no reasoning"


@pytest.mark.parametrize("diagnosis", list(DiagnosisKind))
def test_choose_strategy_never_returns_an_unmapped_strategy(diagnosis: DiagnosisKind) -> None:
    from learning_os.policy.select import _ACTION_FOR

    strategy, _, _ = choose_strategy(diagnosis, MemoryStore(), TRACE)
    assert strategy in _ACTION_FOR


def test_every_reason_code_is_reachable() -> None:
    """A reason code no branch emits is a vocabulary entry pretending to be a
    code path.

    It makes the policy look as though it weighs something it does not, and any
    analysis counting reason codes waits for a decision that cannot occur.
    `PREREQUISITE_FIRST` was exactly that — defined, documented, never emitted —
    and it survived every other test in this file because nothing asserted the
    set was covered.

    Enumerating rather than spot-checking: a test naming the codes it expects
    would pass the day an eleventh was added and never emitted.
    """
    emitted: set[ReasonCode] = set()

    for diagnosis in DiagnosisKind:
        emitted.update(_decide(_Bottleneck(TRACE), MemoryStore(), diagnosis).reasons)

    emitted.update(
        _decide(
            _Bottleneck(TRACE, confidence=0.3, needs_diagnostic=True),
            MemoryStore(),
            DiagnosisKind.CONCEPT_GAP,
        ).reasons
    )
    emitted.update(_decide(_Bottleneck(TRANSFER), MemoryStore(), DiagnosisKind.CONCEPT_GAP).reasons)

    skill, misconception = _skill_with_a_catalogued_misconception()
    emitted.update(
        _decide(
            _Bottleneck(skill),
            MemoryStore(),
            DiagnosisKind.CONCEPT_GAP,
            live_misconceptions=(misconception,),
        ).reasons
    )

    one_failed = MemoryStore()
    one_failed.record_attempt(_attempt(TRACE, Strategy.WORKED_EXAMPLE, Outcome.FAILURE))
    emitted.update(_decide(_Bottleneck(TRACE), one_failed, DiagnosisKind.CONCEPT_GAP).reasons)

    all_failed = MemoryStore()
    for strategy in (Strategy.PREREQUISITE_REPAIR, Strategy.DECOMPOSITION):
        all_failed.record_attempt(_attempt(TRACE, strategy, Outcome.FAILURE))
    emitted.update(
        _decide(_Bottleneck(TRACE), all_failed, DiagnosisKind.PREREQUISITE_GAP).reasons
    )

    succeeded = MemoryStore()
    succeeded.record_attempt(_attempt(TRACE, Strategy.CONTRAST, Outcome.SUCCESS))
    emitted.update(_decide(_Bottleneck(TRACE), succeeded, DiagnosisKind.CONCEPT_GAP).reasons)

    unreachable = set(ReasonCode) - emitted
    assert not unreachable, f"reason codes no branch emits: {sorted(c.value for c in unreachable)}"
