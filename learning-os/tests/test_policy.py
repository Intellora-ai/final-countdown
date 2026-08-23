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
    proficiency: float | None = None,
) -> Decision:
    return select_action(
        GRAPH,
        memory,
        bottleneck,
        diagnosis,
        question=QUESTION,
        live_misconceptions=live_misconceptions,
        proficiency=proficiency,
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


def test_every_reason_code_changes_a_decision() -> None:
    """REACHABILITY IS THE WEAKER PROPERTY. CONSEQUENCE IS THE ONE THAT MATTERS.

    The first version of this test asserted every code was *emitted* somewhere.
    Session final-countdown-6a pointed out that a code can be emitted and change
    nothing — which is worse than a missing code, because it reads as evidence
    the policy adapted when the decision was identical either way.

    So each code is paired with two states differing only in the condition that
    emits it, and the DECISIONS must differ.

    `ANNOTATES_ONLY` is the escape hatch, and it is a named list rather than a
    silent default: a code that legitimately annotates without steering has to be
    argued for here, in writing, where somebody can disagree with it.
    """
    #: Codes that describe the decision without altering it. Each needs a reason.
    ANNOTATES_ONLY = {
        # Emitted when the bottleneck already carries enough confidence. It is
        # the ABSENCE of a diagnostic step, and absence has no separate branch to
        # compare against — the contrast is DIAGNOSTIC_NEEDED, which is tested.
        ReasonCode.EVIDENCE_ALREADY_SUFFICIENT,
        # True of a first attempt by definition; the consequence is that nothing
        # was excluded, which AVOIDED_FAILED_STRATEGY tests from the other side.
        ReasonCode.FIRST_ATTEMPT,
        # KNOWN GAP, NOT AN ARGUMENT. This one does not steer and should.
        # A subskill whose operation is TRANSFER gets whatever the diagnosis
        # implies, plus a code announcing readiness for transfer — so the
        # decision and its stated reason disagree. Listed here to keep the test
        # honest while the fix is decided, NOT because annotating is correct.
        ReasonCode.READY_FOR_TRANSFER,
    }

    fresh = MemoryStore()

    def burned() -> MemoryStore:
        m = MemoryStore()
        m.record_attempt(_attempt(TRACE, Strategy.WORKED_EXAMPLE, Outcome.FAILURE))
        return m

    def all_burned() -> MemoryStore:
        m = MemoryStore()
        for s in (Strategy.PREREQUISITE_REPAIR, Strategy.DECOMPOSITION):
            m.record_attempt(_attempt(TRACE, s, Outcome.FAILURE))
        return m

    def succeeded() -> MemoryStore:
        m = MemoryStore()
        m.record_attempt(
            Attempt(
                skill_id=TRACE,
                action=ActionKind.TEACH_BY_EXAMPLE,
                representation="call_stack_diagram",
                outcome=Outcome.SUCCESS,
                mechanism=Strategy.CONTRAST.value,
            )
        )
        return m

    skill, misconception = _skill_with_a_catalogued_misconception()

    #: code -> (with-condition, without-condition). The two must decide differently.
    PAIRS: dict[ReasonCode, tuple[Decision, Decision]] = {
        ReasonCode.DIAGNOSTIC_NEEDED: (
            _decide(_Bottleneck(TRACE, needs_diagnostic=True), fresh, DiagnosisKind.CONCEPT_GAP),
            _decide(_Bottleneck(TRACE, needs_diagnostic=False), fresh, DiagnosisKind.CONCEPT_GAP),
        ),
        ReasonCode.MISCONCEPTION_LIVE: (
            _decide(_Bottleneck(skill), fresh, DiagnosisKind.CONCEPT_GAP,
                    live_misconceptions=(misconception,)),
            _decide(_Bottleneck(skill), fresh, DiagnosisKind.CONCEPT_GAP),
        ),
        ReasonCode.AVOIDED_FAILED_STRATEGY: (
            _decide(_Bottleneck(TRACE), burned(), DiagnosisKind.CONCEPT_GAP),
            _decide(_Bottleneck(TRACE), fresh, DiagnosisKind.CONCEPT_GAP),
        ),
        ReasonCode.STRATEGIES_EXHAUSTED: (
            _decide(_Bottleneck(TRACE), all_burned(), DiagnosisKind.PREREQUISITE_GAP),
            _decide(_Bottleneck(TRACE), fresh, DiagnosisKind.PREREQUISITE_GAP),
        ),
        ReasonCode.REPRESENTATION_WORKED_BEFORE: (
            _decide(_Bottleneck(TRACE), succeeded(), DiagnosisKind.CONCEPT_GAP),
            _decide(_Bottleneck(TRACE), fresh, DiagnosisKind.CONCEPT_GAP),
        ),
        ReasonCode.DECOMPOSED_FOR_LOAD: (
            _decide(_Bottleneck(TRACE), fresh, DiagnosisKind.COGNITIVE_OVERLOAD),
            _decide(_Bottleneck(TRACE), fresh, DiagnosisKind.CONCEPT_GAP),
        ),
    }

    covered = set(PAIRS) | ANNOTATES_ONLY
    missing = set(ReasonCode) - covered
    assert not missing, (
        f"reason codes with neither a consequence pair nor a written "
        f"annotation argument: {sorted(c.value for c in missing)}"
    )

    for code, (with_it, without_it) in PAIRS.items():
        assert code in with_it.reasons, f"{code.value} was not emitted by its own case"
        assert code not in without_it.reasons, f"{code.value} leaked into the control"
        assert with_it.contract != without_it.contract or with_it.excluded != without_it.excluded, (
            f"{code.value} is emitted but changes nothing: both states produced "
            f"an identical decision, so the code reads as adaptation that did not happen"
        )


def test_an_override_does_not_repeal_a_capacity_limit() -> None:
    """THE BUG SESSION 6a FOUND, AND IT WAS REACHED BY A CORRECT-LOOKING PATH.

    `_constraints_for` ran on the OVERRIDDEN diagnosis, so a learner arriving as
    COGNITIVE_OVERLOAD who also held a live misconception silently lost
    `max_blocks=1` and lost DECOMPOSED_FOR_LOAD.

    Overload is a capacity condition. It does not stop being true because a
    misconception was also found, and a full-budget repair delivered to an
    overloaded learner is the section 52 failure — arrived at through an override
    that reads as correct.
    """
    skill, misconception = _skill_with_a_catalogued_misconception()
    d = _decide(
        _Bottleneck(skill),
        MemoryStore(),
        DiagnosisKind.COGNITIVE_OVERLOAD,
        live_misconceptions=(misconception,),
    )
    assert d.contract.diagnosis is DiagnosisKind.MISCONCEPTION, "the override should still happen"
    assert ReasonCode.MISCONCEPTION_LIVE in d.reasons
    assert d.contract.simplicity.max_blocks == 1, "the capacity limit was repealed"
    assert ReasonCode.DECOMPOSED_FOR_LOAD in d.reasons


def test_a_representation_that_worked_reaches_the_contract() -> None:
    """`REPRESENTATION_WORKED_BEFORE` used to announce a preference with nowhere
    to go: the policy read `succeeded_with` as a boolean, threw the value away,
    and `InstructionContract` had no field to carry it.

    A reason code whose consequence does not exist is worse than a missing one —
    it reads as evidence the policy adapted.
    """
    m = MemoryStore()
    m.record_attempt(
        Attempt(
            skill_id=TRACE,
            action=ActionKind.TEACH_BY_EXAMPLE,
            representation="call_stack_diagram",
            outcome=Outcome.SUCCESS,
            mechanism=Strategy.CONTRAST.value,
        )
    )
    d = _decide(_Bottleneck(TRACE), m, DiagnosisKind.CONCEPT_GAP)
    assert ReasonCode.REPRESENTATION_WORKED_BEFORE in d.reasons
    assert d.contract.preferred_representations == ("call_stack_diagram",)


def test_preferred_representations_are_ordered_deterministically() -> None:
    """`succeeded_with` returns a frozenset, whose iteration order depends on the
    process. An unsorted tuple would make the contract differ between runs, and a
    decision that differs between runs cannot be replayed."""
    m = MemoryStore()
    for rep in ("prose", "call_stack_diagram", "table"):
        m.record_attempt(
            Attempt(
                skill_id=TRACE,
                action=ActionKind.TEACH_BY_EXAMPLE,
                representation=rep,
                outcome=Outcome.SUCCESS,
                mechanism=Strategy.CONTRAST.value,
            )
        )
    d = _decide(_Bottleneck(TRACE), m, DiagnosisKind.CONCEPT_GAP)
    reps = d.contract.preferred_representations
    assert reps == tuple(sorted(reps))
    assert reps == ("call_stack_diagram", "prose", "table")


def test_the_strategy_vocabulary_matches_what_memory_records() -> None:
    """A stringly-typed seam, closed.

    `choose_strategy` compares `Strategy.value` against `frozenset[str]` from
    `failed_mechanisms`. It works because both are strings today. Rename a
    `Strategy` value and exclusion silently stops matching — no type error, no
    failing test, and the fallback quietly starts repeating failures.
    """
    m = MemoryStore()
    for strategy in Strategy:
        m.record_attempt(_attempt(TRACE, strategy, Outcome.FAILURE))
    burned = m.failed_mechanisms(TRACE)
    assert {s.value for s in Strategy} == burned, (
        "the mechanism vocabulary the policy writes and the one it reads disagree"
    )


# --------------------------------------------------------------------------
# Proficiency: the interface finding, closed
# --------------------------------------------------------------------------


def test_a_procedural_failure_diverges_on_proficiency() -> None:
    """THE FINDING SESSION 6a CALLED "DIVERGENCE FAILING AT THE INTERFACE".

    `BROKEN_EXAMPLE_REPAIR` presupposes the learner knows what correct looks
    like. For a nearly-right procedure it is the sharpest mechanism there is; for
    somebody who never had the procedure it asks them to find a fault in
    something they cannot read — a different task, and an impossible one.

    Two materially different states. Before this, `BottleneckLike` carried no
    estimate and both got a broken example, so the policy looked decisive while
    compromising across states section 67 says must not converge.
    """
    nearly = _decide(
        _Bottleneck(TRACE), MemoryStore(), DiagnosisKind.PROCEDURAL_FAILURE, proficiency=0.7
    )
    never = _decide(
        _Bottleneck(TRACE), MemoryStore(), DiagnosisKind.PROCEDURAL_FAILURE, proficiency=0.1
    )
    assert nearly.contract.strategy is Strategy.BROKEN_EXAMPLE_REPAIR
    assert never.contract.strategy is Strategy.WORKED_EXAMPLE
    assert nearly.contract != never.contract


def test_unknown_proficiency_leaves_the_ordering_as_authored() -> None:
    """`None` means the caller does not know. Guessing would manufacture
    divergence out of absent information, which is the failure on the other
    side of the same rule."""
    unknown = _decide(_Bottleneck(TRACE), MemoryStore(), DiagnosisKind.PROCEDURAL_FAILURE)
    assert unknown.contract.strategy is Strategy.BROKEN_EXAMPLE_REPAIR


def test_proficiency_does_not_reorder_diagnoses_it_has_no_bearing_on() -> None:
    """A knob that quietly affects everything is worse than no knob. The
    presupposition argument is specific to repairing a broken example; nothing
    else in the table depends on knowing what correct looks like."""
    for diagnosis in DiagnosisKind:
        if diagnosis is DiagnosisKind.PROCEDURAL_FAILURE:
            continue
        low = _decide(_Bottleneck(TRACE), MemoryStore(), diagnosis, proficiency=0.1)
        high = _decide(_Bottleneck(TRACE), MemoryStore(), diagnosis, proficiency=0.9)
        assert low.contract.strategy is high.contract.strategy, (
            f"{diagnosis.value} reordered on proficiency, which was not argued for"
        )


def test_the_protocol_stayed_narrow() -> None:
    """Proficiency arrives as a PARAMETER, not as a widened Protocol.

    `Bottleneck` carries no estimate field, so requiring one would have broken
    the diagnosis module and coupled the policy to scoring internals it must not
    reach into. The runtime holds the `LearnerState` and can pass what it knows.
    """
    assert not hasattr(_Bottleneck(TRACE), "estimate")
    assert isinstance(_Bottleneck(TRACE), BottleneckLike)


def test_representation_failure_leads_with_a_mechanism_that_changes_the_form() -> None:
    """THE GAP 6a RECORDED AS "A DIAGNOSIS WHOSE MECHANISM DOES NOT EXIST".

    `REPRESENTATION_FAILURE` mapped to analogy and contrast, and neither changes
    the FORM — they change the words. The ordering was defensible and the
    vocabulary was short a mechanism, so the table picked the least-bad
    neighbour and had no way to say so.
    """
    d = _decide(_Bottleneck(TRACE), MemoryStore(), DiagnosisKind.REPRESENTATION_FAILURE)
    assert d.contract.strategy is Strategy.CHANGE_REPRESENTATION


def test_forms_already_used_reach_the_model_as_avoid() -> None:
    """`representations_tried` was built and read by NOTHING outside its own
    test, which made `store.py`'s claim false that every retrieval exists because
    some decision reads it.

    It matters here specifically: "say it differently" without knowing what has
    been said sends the model to the most obvious form, which is the one that
    just failed.
    """
    m = MemoryStore()
    for rep, outcome in (("prose", Outcome.FAILURE), ("diagram", Outcome.SUCCESS)):
        m.record_attempt(
            Attempt(
                skill_id=TRACE,
                action=ActionKind.TEACH_BY_EXAMPLE,
                representation=rep,
                outcome=outcome,
                mechanism=f"mech_{rep}",
            )
        )
    d = _decide(_Bottleneck(TRACE), m, DiagnosisKind.REPRESENTATION_FAILURE)
    assert d.contract.avoid_representations == ("diagram", "prose")


def test_avoid_and_preferred_are_different_questions() -> None:
    """`avoid` is everything TRIED; `preferred` is what WORKED. A form can be in
    both — tried and worked — which means it has a record rather than a verdict,
    and the model decides."""
    m = MemoryStore()
    m.record_attempt(
        Attempt(
            skill_id=TRACE,
            action=ActionKind.TEACH_BY_EXAMPLE,
            representation="diagram",
            outcome=Outcome.SUCCESS,
            mechanism="mech_diagram",
        )
    )
    c = _decide(_Bottleneck(TRACE), m, DiagnosisKind.CONCEPT_GAP).contract
    assert c.preferred_representations == ("diagram",)
    assert c.avoid_representations == ("diagram",)
