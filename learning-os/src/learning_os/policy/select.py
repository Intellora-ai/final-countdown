"""The instruction policy: what to do next, and why.

THIS IS THE FILE THAT MAKES THE SYSTEM NON-GENERIC
--------------------------------------------------
Everything before it describes a learner. Nothing before it CHOOSES. Without this
layer the engine can say what a learner knows and check an answer, and will still
hand two different learners the same lesson -- because nothing is deciding.

Non-generic has a precise meaning here, and it is not "varied". Section 67: the
objective is APPROPRIATE divergence. Two learners in the same state must get the
same next action -- personalisation that varies for its own sake is noise wearing
the costume of adaptation. Two learners in materially different states must not.
Both directions are asserted in the tests, because a policy that always diverges
is exactly as broken as one that never does, and only one of them looks broken.

WHY THE POLICY IS NOT THE MODEL
-------------------------------
Section 40 puts a layer between the learner model and the LLM, and the reason is
authority. A model asked "what should I teach next?" will answer -- fluently,
plausibly, and without any of the evidence that makes the answer checkable. Then
the decision belongs to the model, the engine cannot explain it, and nothing can
be replayed. Here the decision is a pure function of state, so it can be
recomputed, argued with, and shown to be wrong.

WHY EVERY DECISION CARRIES REASON CODES
---------------------------------------
An unexplainable decision cannot be improved. If the only account of why a
learner got a worked example is "the policy chose it", then a bad outcome
produces no information -- there is nothing to disagree with. Reason codes are
what turn an outcome into evidence about the policy rather than just about the
learner.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol, runtime_checkable

from learning_os.domain.knowledge import CognitiveOperation, KnowledgeGraph
from learning_os.llm.contract import (
    DiagnosisKind,
    InstructionContract,
    SimplicityConstraints,
    Strategy,
)
from learning_os.memory.store import MemoryStore
from learning_os.models.contracts import ActionKind


class ReasonCode(StrEnum):
    """Why this action, in terms that can be counted across many decisions.

    Free text would be more expressive and useless in aggregate: "because the
    learner seemed stuck" cannot be tallied, compared, or used to find out which
    reasons precede bad outcomes. These are the vocabulary doc 04 was
    speculating about; they are derived from what the selector actually branches
    on, so every one of them corresponds to a real code path.
    """

    #: Evidence was insufficient, so the next move gathers some.
    DIAGNOSTIC_NEEDED = "diagnostic_needed"
    #: Confidence sufficed, so no question was asked. Section 28.
    EVIDENCE_ALREADY_SUFFICIENT = "evidence_already_sufficient"
    # THERE WAS A `PREREQUISITE_FIRST` HERE. IT WAS NEVER EMITTED.
    #
    # A reason code no branch produces is a vocabulary entry pretending to be a
    # code path. It makes the policy look as though it weighs something it does
    # not, and any later analysis counting reason codes would be waiting for a
    # decision that cannot occur.
    #
    # It was also the wrong layer's explanation. Choosing a prerequisite over the
    # named target is the BOTTLENECK engine's decision, taken before the policy
    # is called — the policy receives a skill and does not know whether it was
    # the target. Explaining another layer's decision is how two layers end up
    # disagreeing about what happened.
    #
    # Deleted rather than implemented. `test_every_reason_code_is_reachable`
    # now fails if a code is added without a branch that emits it.
    #: A named misconception is live; repairing beats re-explaining.
    MISCONCEPTION_LIVE = "misconception_live"
    #: The previously chosen strategy failed here and was excluded.
    AVOIDED_FAILED_STRATEGY = "avoided_failed_strategy"
    #: A representation that has worked for this learner on this skill.
    REPRESENTATION_WORKED_BEFORE = "representation_worked_before"
    #: Nothing has been tried yet; this is the opening move.
    FIRST_ATTEMPT = "first_attempt"
    #: The skill is strong enough that the useful next step is transfer.
    READY_FOR_TRANSFER = "ready_for_transfer"
    #: Every distinct mechanism has been tried and failed.
    STRATEGIES_EXHAUSTED = "strategies_exhausted"
    #: Load was too high, so the target was narrowed rather than re-explained.
    DECOMPOSED_FOR_LOAD = "decomposed_for_load"


@runtime_checkable
class BottleneckLike(Protocol):
    """What the policy needs from a diagnosis, and nothing more.

    A Protocol rather than an import of `diagnosis.Bottleneck`, for two reasons
    that are both about keeping the layers honest:

      * the policy must not reach past this into scoring internals, and a
        structural type makes that a compile-time fact rather than a convention;
      * the diagnosis module is being built in parallel, and coupling to its
        concrete class would mean neither layer could be tested until both were
        finished.

    The real `Bottleneck` satisfies this structurally. If it stops satisfying it,
    that is a deliberate interface change and it fails here loudly.
    """

    @property
    def skill_id(self) -> str: ...
    @property
    def confidence(self) -> float: ...
    @property
    def needs_diagnostic(self) -> bool: ...


@dataclass(frozen=True, slots=True)
class Decision:
    """The chosen action, with the reasoning attached rather than discarded.

    `contract` is what the model receives. `reasons` is what a human -- or a
    later analysis asking which policies produce learning -- receives. Keeping
    them together is the difference between a system that can be improved and
    one that can only be observed.
    """

    contract: InstructionContract
    reasons: tuple[ReasonCode, ...]
    #: Strategies excluded because they already failed on this skill. Recorded
    #: because "we did not repeat ourselves" is a claim that should be checkable.
    excluded: tuple[Strategy, ...] = ()


#: Which action carries each strategy. Separate from `Strategy` because the
#: strategy is the MECHANISM and the action is what the runtime performs -- three
#: different mechanisms can all arrive as "teach by example", and collapsing them
#: would make the fallback engine unable to tell that it had changed anything.
_ACTION_FOR: dict[Strategy, ActionKind] = {
    Strategy.WORKED_EXAMPLE: ActionKind.TEACH_BY_EXAMPLE,
    Strategy.BROKEN_EXAMPLE_REPAIR: ActionKind.REPAIR_BROKEN_EXAMPLE,
    Strategy.TRANSFER_CHALLENGE: ActionKind.TRANSFER_CHALLENGE,
    Strategy.CONTRAST: ActionKind.TEACH_BY_EXAMPLE,
    Strategy.DECOMPOSITION: ActionKind.TEACH_BY_EXAMPLE,
    Strategy.ANALOGY: ActionKind.TEACH_BY_EXAMPLE,
    Strategy.GUIDED_REASONING: ActionKind.TEACH_BY_EXAMPLE,
    Strategy.PREREQUISITE_REPAIR: ActionKind.TEACH_BY_EXAMPLE,
    Strategy.MISCONCEPTION_REPAIR: ActionKind.REPAIR_BROKEN_EXAMPLE,
    Strategy.NEW_CONTEXT: ActionKind.TRANSFER_CHALLENGE,
}

#: Which mechanism suits which diagnosis, best first.
#:
#: Ordered preference rather than a single answer, because the first choice may
#: already have failed for this learner and the fallback needs somewhere to go
#: that is not a paraphrase. Section 45: the next intervention must change the
#: MECHANISM.
_STRATEGIES_FOR: dict[DiagnosisKind, tuple[Strategy, ...]] = {
    DiagnosisKind.TERM_GAP: (Strategy.WORKED_EXAMPLE, Strategy.CONTRAST, Strategy.ANALOGY),
    DiagnosisKind.CONCEPT_GAP: (
        Strategy.WORKED_EXAMPLE,
        Strategy.CONTRAST,
        Strategy.ANALOGY,
        Strategy.DECOMPOSITION,
    ),
    DiagnosisKind.PREREQUISITE_GAP: (Strategy.PREREQUISITE_REPAIR, Strategy.DECOMPOSITION),
    DiagnosisKind.MISCONCEPTION: (Strategy.MISCONCEPTION_REPAIR, Strategy.CONTRAST),
    DiagnosisKind.CAUSAL_REASONING_FAILURE: (
        Strategy.GUIDED_REASONING,
        Strategy.CONTRAST,
        Strategy.WORKED_EXAMPLE,
    ),
    DiagnosisKind.PROCEDURAL_FAILURE: (
        Strategy.BROKEN_EXAMPLE_REPAIR,
        Strategy.WORKED_EXAMPLE,
        Strategy.GUIDED_REASONING,
    ),
    DiagnosisKind.REPRESENTATION_FAILURE: (Strategy.ANALOGY, Strategy.CONTRAST),
    DiagnosisKind.LANGUAGE_FAILURE: (Strategy.WORKED_EXAMPLE, Strategy.ANALOGY),
    DiagnosisKind.COGNITIVE_OVERLOAD: (Strategy.DECOMPOSITION, Strategy.WORKED_EXAMPLE),
    DiagnosisKind.TRANSFER_FAILURE: (Strategy.NEW_CONTEXT, Strategy.TRANSFER_CHALLENGE),
}


def choose_strategy(
    diagnosis: DiagnosisKind,
    memory: MemoryStore,
    skill_id: str,
) -> tuple[Strategy, tuple[Strategy, ...], tuple[ReasonCode, ...]]:
    """The first mechanism for this diagnosis that has not already failed here.

    Returns the choice, what was excluded, and why -- all three, because
    "we did not repeat a failed strategy" is a claim the caller should be able to
    check rather than take on trust.

    THE EXHAUSTION CASE IS NOT A CRASH.

    When every mechanism has failed, this returns the first one anyway, with
    `STRATEGIES_EXHAUSTED`. Refusing to act would leave the learner with nothing,
    which is worse than a repeat -- and the reason code is what lets the runtime
    escalate to a human instead of silently looping. Section 46 forbids blindly
    repeating; doing it visibly, having run out, is a different thing.
    """
    # EXCLUDE BY MECHANISM, NOT BY ACTION. THE FIRST VERSION DID THE OPPOSITE.
    #
    # `memory.failed_strategies()` answers at ActionKind granularity, and four of
    # the strategies for CONCEPT_GAP -- worked example, contrast, analogy,
    # decomposition -- all carry `TEACH_BY_EXAMPLE`. Excluding on the action
    # therefore burned all four on a single failure, and the fallback engine
    # reported STRATEGIES_EXHAUSTED after one attempt.
    #
    # The irony is that the comment on `_ACTION_FOR` already said why: the
    # strategy is the MECHANISM and the action is what the runtime performs, and
    # collapsing them leaves the fallback unable to tell it changed anything.
    # Knowing that and then keying the exclusion on the collapsed value is how
    # the bug got in.
    #
    # `failed_mechanisms` asks in the vocabulary the answer lives in, so a
    # genuinely different teaching move stays available after a sibling fails.
    # It also keeps memory's asymmetry -- failed AND never worked -- which
    # `is_repeat` does not, since that answers the different question of whether
    # this has been tried at all.
    preferred = _STRATEGIES_FOR[diagnosis]
    burned = memory.failed_mechanisms(skill_id)
    excluded = tuple(s for s in preferred if s.value in burned)
    available = tuple(s for s in preferred if s not in excluded)

    if not available:
        return preferred[0], excluded, (ReasonCode.STRATEGIES_EXHAUSTED,)

    reasons: list[ReasonCode] = []
    if excluded:
        reasons.append(ReasonCode.AVOIDED_FAILED_STRATEGY)
    if memory.attempt_count(skill_id) == 0:
        reasons.append(ReasonCode.FIRST_ATTEMPT)
    return available[0], excluded, tuple(reasons)


def _constraints_for(
    *diagnoses: DiagnosisKind,
) -> tuple[SimplicityConstraints, tuple[ReasonCode, ...]]:
    """Narrow the budget when ANY of these diagnoses is load.

    Section 52 says load is a constraint, not a fact about the human mind. So the
    response to overload is to reduce simultaneous novelty -- one block, one
    concept -- rather than to re-explain the same amount more slowly, which is
    the intuitive move and adds load rather than removing it.

    VARIADIC BECAUSE A DIAGNOSIS CAN BE OVERRIDDEN AND STILL BE TRUE.

    A misconception override replaces the diagnosis for the purpose of choosing a
    MECHANISM. It does not repeal a capacity limit: a learner who was overloaded
    a moment ago is still overloaded while their misconception is repaired. Taking
    the tighter of the arriving and the final diagnosis is what stops an override
    quietly loosening a constraint that still applies.
    """
    if DiagnosisKind.COGNITIVE_OVERLOAD in diagnoses:
        return SimplicityConstraints(max_blocks=1), (ReasonCode.DECOMPOSED_FOR_LOAD,)
    return SimplicityConstraints(), ()


def select_action(
    graph: KnowledgeGraph,
    memory: MemoryStore,
    bottleneck: BottleneckLike,
    diagnosis: DiagnosisKind,
    *,
    question: str,
    known_prerequisites: tuple[str, ...] = (),
    live_misconceptions: tuple[str, ...] = (),
) -> Decision:
    """The next instructional contract, as a pure function of state.

    Pure on purpose. A decision that depends on wall-clock time, a random seed,
    or a live service cannot be replayed, and a decision that cannot be replayed
    cannot be shown to have been wrong -- which means the policy can never be
    corrected, only argued about.

    Deterministic does NOT mean identical: the same state gives the same action,
    and different states give different actions. That is the whole definition of
    appropriate divergence, and it is why this is a function rather than a prompt.
    """
    skill_id = bottleneck.skill_id
    reasons: list[ReasonCode] = []

    if bottleneck.needs_diagnostic:
        reasons.append(ReasonCode.DIAGNOSTIC_NEEDED)
    else:
        # Section 28: do not ask when the evidence already answers. Friction the
        # learner pays for nothing is friction that buys a worse learner model,
        # because it spends attention that teaching needed.
        reasons.append(ReasonCode.EVIDENCE_ALREADY_SUFFICIENT)

    subskill = graph.subskill(skill_id)
    concept = graph.concept_of(skill_id)

    # A misconception the LEARNER HOLDS outranks the diagnosis that arrived,
    # because re-explaining a concept to somebody holding a specific wrong model
    # teaches them to hold both.
    #
    # THE INTERSECTION IS THE WHOLE POINT, AND OMITTING IT WAS A REAL BUG.
    #
    # This first read `if subskill.misconceptions:` -- true whenever the GRAPH
    # catalogues a misconception for the skill, which is a statement about the
    # subject, not about this learner. Every skill with a catalogued
    # misconception became a misconception repair for everybody, so all ten
    # diagnoses collapsed to one and the policy produced identical teaching for
    # materially different states. Perfectly generic behaviour, in the module
    # whose entire job is not being generic.
    #
    # The catalogue says what CAN go wrong here. `live_misconceptions` says what
    # HAS gone wrong for this learner. Only the intersection is a reason to
    # change course.
    # THE ORIGINAL DIAGNOSIS IS KEPT, BECAUSE THE OVERRIDE USED TO DISCARD IT.
    #
    # Overriding to MISCONCEPTION changed which strategy was chosen AND which
    # constraints applied, because `_constraints_for` ran on the overridden
    # value. A learner arriving as COGNITIVE_OVERLOAD who also held a live
    # misconception silently lost `max_blocks=1` and lost DECOMPOSED_FOR_LOAD.
    #
    # Overload is a CAPACITY condition. It does not stop being true because a
    # misconception was also found, and delivering a full-budget repair to an
    # overloaded learner is the section 52 failure reached by a path that looks
    # like a correct override. The override should change what is TAUGHT, not how
    # much the learner can hold.
    #
    # Reported by session final-countdown-6a.
    arrived_as = diagnosis
    if subskill is not None and live_misconceptions:
        held = set(subskill.misconceptions) & set(live_misconceptions)
        if held:
            diagnosis = DiagnosisKind.MISCONCEPTION
            reasons.append(ReasonCode.MISCONCEPTION_LIVE)

    strategy, excluded, choice_reasons = choose_strategy(diagnosis, memory, skill_id)
    reasons.extend(choice_reasons)

    if subskill is not None and subskill.operation is CognitiveOperation.TRANSFER:
        reasons.append(ReasonCode.READY_FOR_TRANSFER)

    # Representations that have worked here, as a PREFERENCE the model can see.
    #
    # This used to be a truthiness check whose value was thrown away, while
    # `InstructionContract` had no field to carry it -- so the reason code
    # announced a preference that had nowhere to go. `MemoryStore.succeeded_with`
    # documents itself as "read by the policy layer as a preference"; reading it
    # as a boolean made that docstring false.
    #
    # Sorted, because a frozenset iterates in an order that depends on the
    # process, and a decision that differs between runs cannot be replayed.
    worked = tuple(sorted(memory.succeeded_with(skill_id)))
    if worked:
        # A preference, never a rule. A system that always repeats its last
        # success stops adapting the moment it finds one.
        reasons.append(ReasonCode.REPRESENTATION_WORKED_BEFORE)

    # Constraints come from the TIGHTER of the two diagnoses, so an override
    # cannot loosen a capacity limit that still applies.
    constraints, load_reasons = _constraints_for(arrived_as, diagnosis)
    reasons.extend(load_reasons)

    required = tuple(concept.technical_terms) if concept is not None else ()
    forbidden = tuple(concept.forbidden_simplifications) if concept is not None else ()

    contract = InstructionContract(
        target_skill=skill_id,
        question=question,
        diagnosis=diagnosis,
        strategy=strategy,
        action=_ACTION_FOR[strategy],
        known_prerequisites=known_prerequisites,
        weak_subskills=(skill_id,),
        preferred_representations=worked,
        simplicity=constraints,
        required_terms=required,
        forbidden_phrases=forbidden,
        success_evidence_required=_evidence_for(strategy, skill_id),
    )
    return Decision(contract=contract, reasons=tuple(reasons), excluded=excluded)


def _evidence_for(strategy: Strategy, skill_id: str) -> str:
    """What would count as this having worked, fixed BEFORE the learner responds.

    Invariant 2. Deciding what counts as success after seeing the answer is how
    every intervention ends up looking successful, and it is the single easiest
    way for a system like this to fool the people building it.
    """
    name = skill_id.rsplit(".", 1)[-1].replace("_", " ")
    if strategy in (Strategy.TRANSFER_CHALLENGE, Strategy.NEW_CONTEXT):
        return f"learner applies {name} unaided in a context they have not seen"
    if strategy is Strategy.BROKEN_EXAMPLE_REPAIR:
        return f"learner locates and corrects the fault in {name} without hints"
    if strategy is Strategy.MISCONCEPTION_REPAIR:
        return f"learner predicts the case that contradicts their model of {name}"
    return f"learner demonstrates {name} independently on a fresh instance"
