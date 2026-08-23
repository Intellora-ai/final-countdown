"""The teaching loop: one turn, and what it records.

WHAT THIS FILE IS FOR
---------------------
Every other module answers one question well. This is the only place they are
composed, and composition is where the interesting failures live -- a validator
that works and is never consulted, a memory that records nothing because the
caller forgot, a repair path that loops because nothing counts attempts. None of
those are visible in the modules themselves; all of them are visible here.

THE LOOP RECORDS EVEN WHEN IT FAILS
-----------------------------------
The tempting shape is: generate, validate, return content on success, raise on
failure. It loses the most valuable information the system produces. A generation
that broke its contract twice and was abandoned is exactly what the policy needs
to know next time, and a loop that raises leaves no trace of it -- so the same
strategy gets chosen again, fails again, and the engine never learns because
nobody wrote it down.

So every terminal state records an `Attempt`. Success, exhaustion, refusal,
outage. `Outcome.FAILURE` on the way out is not an error path; it is the output.

WHY REPAIR IS BOUNDED AND THE BOUND IS SMALL
--------------------------------------------
A repair loop with no ceiling is a bill with no ceiling, and worse, it hides a
policy problem as a latency problem: content that fails validation three times is
telling you the CONTRACT is wrong, not that the model needs another go. Two
attempts, then stop and let the policy choose differently.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from learning_os.diagnosis.bottleneck import Bottleneck, NoBottleneck, prerequisite_split
from learning_os.domain.knowledge import KnowledgeGraph
from learning_os.llm.client import GeneratedContent, LLMClient, LLMUnavailable
from learning_os.llm.contract import DiagnosisKind, InstructionContract
from learning_os.llm.validation import Violation, is_repairable, is_usable, validate
from learning_os.mastery.estimate import Belief, MasteryState, state_of
from learning_os.memory.store import Attempt, MemoryStore, Outcome
from learning_os.models.contracts import ActionKind, LearnerState
from learning_os.policy.select import BottleneckLike, Decision, ReasonCode, select_action

#: Generations per turn. Two, not three: content failing its contract twice is
#: evidence about the CONTRACT, and a third attempt spends money to learn nothing
#: the second did not already say.
MAX_GENERATION_ATTEMPTS = 2


class TurnStatus(StrEnum):
    """How a turn ended, in terms the caller can branch on.

    Four states rather than a bool, because the right next move differs for each
    and collapsing them forces the caller to re-derive which happened from
    whatever incidental detail survived.
    """

    #: Content generated and honoured its contract.
    TAUGHT = "taught"
    #: The model could not be reached. Retry later, or teach without generation.
    UNAVAILABLE = "unavailable"
    #: Generated content broke the contract in ways rewriting cannot fix. The
    #: POLICY must choose differently; regenerating is the blind repeat.
    CONTRACT_UNSATISFIABLE = "contract_unsatisfiable"
    #: Every mechanism for this diagnosis has already failed here. Escalate --
    #: this is where a human belongs.
    EXHAUSTED = "exhausted"


@dataclass(frozen=True, slots=True)
class Turn:
    """One pass of the loop, with everything needed to explain or replay it.

    `content` is None unless `status is TAUGHT`. Making that structural rather
    than a convention is deliberate: a caller cannot accidentally render content
    that failed validation, because on that path there is nothing to render.
    """

    status: TurnStatus
    decision: Decision
    content: GeneratedContent | None = None
    violations: tuple[Violation, ...] = ()
    attempts: int = 0
    at: datetime | None = None

    @property
    def contract(self) -> InstructionContract:
        return self.decision.contract


def teach_once(
    graph: KnowledgeGraph,
    memory: MemoryStore,
    client: LLMClient,
    bottleneck: BottleneckLike,
    diagnosis: DiagnosisKind,
    *,
    question: str,
    now: Callable[[], datetime],
    known_prerequisites: tuple[str, ...] = (),
    live_misconceptions: tuple[str, ...] = (),
    belief: Belief | None = None,
) -> Turn:
    """Decide, generate, check, and record. One turn.

    `now` is injected rather than called. A loop that reads the wall clock cannot
    be replayed, and replay is the only way to ask "would this decision still be
    made, given what we know now" -- which is the question that makes a policy
    improvable rather than merely observable.

    Never raises for an unavailable model. An outage is a normal state of the
    world and the caller has a real choice to make about it; delivering that as
    an exception pushes control flow into a `try` block and loses the decision
    that was already made, which is worth keeping either way.
    """
    decision = select_action(
        graph,
        memory,
        bottleneck,
        diagnosis,
        question=question,
        known_prerequisites=known_prerequisites,
        live_misconceptions=live_misconceptions,
        # DERIVED HERE, NOT PASSED THROUGH.
        #
        # The runtime is the only layer that can do this translation. `mastery`
        # owns `Belief`, which carries an estimate AND the confidence and
        # diversity behind it; `policy` takes a bare float because it must not
        # reach into the learner model. Putting the conversion in the middle is
        # what keeps both boundaries honest.
        #
        # It also gives `mastery/` a consumer. Before this, nothing outside
        # `test_mastery.py` imported it -- and a module whose only caller is its
        # own suite has never had its interface used in anger, which is where
        # interface defects hide. Observed by session final-countdown-6a.
        proficiency=_proficiency_of(belief),
    )
    contract = decision.contract

    # Exhaustion is decided BEFORE generating, not after.
    #
    # The policy already knows every mechanism here has failed; generating anyway
    # would spend a call to produce content the caller has been told not to
    # trust. The reason code is the whole point of section 46 -- running out
    # VISIBLY is different from blindly repeating, and only the visible version
    # lets a human be brought in.
    if ReasonCode.STRATEGIES_EXHAUSTED in decision.reasons:
        _record(memory, contract, Outcome.FAILURE)
        return Turn(status=TurnStatus.EXHAUSTED, decision=decision, at=now())

    violations: list[Violation] = []
    attempt = 0
    for attempt in range(1, MAX_GENERATION_ATTEMPTS + 1):
        try:
            content = client.generate(contract)
        except LLMUnavailable:
            # Not recorded as a failed teaching attempt. Nothing was taught, so
            # counting it against this strategy would burn a mechanism for a
            # reason that has nothing to do with whether it teaches -- and the
            # fallback engine would then avoid it forever on the strength of one
            # outage.
            return Turn(
                status=TurnStatus.UNAVAILABLE,
                decision=decision,
                attempts=attempt,
                at=now(),
            )

        violations = validate(contract, content)
        if is_usable(violations):
            # DELIVERED, not SUCCESS. What just happened is that the model
            # honoured its contract -- which says nothing about whether the
            # learner understood. `observe` writes the real outcome when they
            # answer. Recording SUCCESS here made every mechanism permanently
            # un-burnable; see `Outcome.DELIVERED`.
            _record(memory, contract, Outcome.DELIVERED, content=content)
            return Turn(
                status=TurnStatus.TAUGHT,
                decision=decision,
                content=content,
                attempts=attempt,
                at=now(),
            )

        if not is_repairable(violations):
            # Rewriting cannot fix this: the contract's strategy led the model
            # here, so the same contract leads it back. Regenerating would be the
            # blind repeat, just faster.
            break

    _record(memory, contract, Outcome.FAILURE)
    return Turn(
        status=TurnStatus.CONTRACT_UNSATISFIABLE,
        decision=decision,
        violations=tuple(violations),
        attempts=attempt,
        at=now(),
    )


@dataclass(frozen=True, slots=True)
class NoInstruction:
    """No lesson was produced, and that is the right answer rather than a failure.

    Distinct from every `TurnStatus`, because those describe a turn that TRIED
    to teach and could not. This describes a turn that should not have started:
    nothing was generated, nothing was validated, no model was called, and no
    attempt is recorded against the learner -- recording one would put a failure
    on the record of somebody who was never taught anything.
    """

    reason: NoBottleneck
    #: What the runtime should actually do. Derived rather than stored by the
    #: caller, so "mastered" cannot be paired with "diagnose" by accident.
    action: ActionKind
    at: datetime | None = None


#: Reason -> what to do about it. The whole point of `NoBottleneck` being an
#: enum: three reasons that look identical from outside and demand different
#: moves. UNKNOWN_TARGET shares `DO_NOTHING` with MASTERED because there is
#: equally nothing to teach -- but it is a caller asking about an unmodelled
#: skill, not a finished learner, and `reason` keeps the two apart for anyone
#: reading the log later.
_ACTION_FOR_ABSENCE: dict[NoBottleneck, ActionKind] = {
    NoBottleneck.MASTERED: ActionKind.DO_NOTHING,
    NoBottleneck.UNEVIDENCED: ActionKind.DIAGNOSE,
    NoBottleneck.UNKNOWN_TARGET: ActionKind.DO_NOTHING,
}


def teach_next(
    graph: KnowledgeGraph,
    memory: MemoryStore,
    client: LLMClient,
    bottleneck: Bottleneck | NoBottleneck,
    diagnosis: DiagnosisKind,
    *,
    question: str,
    now: Callable[[], datetime],
    known_prerequisites: tuple[str, ...] = (),
    live_misconceptions: tuple[str, ...] = (),
    belief: Belief | None = None,
    learner_state: LearnerState | None = None,
) -> Turn | NoInstruction:
    """Decide whether to teach at all, then what -- in that order.

    THE ORDER IS THE POINT, AND IT WAS MISSING.

    `teach_once` takes a bottleneck and teaches it. Every caller therefore had
    to have found one, so the engine could not answer "this learner is done":
    `ActionKind.DO_NOTHING` existed in the enum and was selected by nothing,
    while `MasteryState.MASTERED` was computed and read by nothing. A system
    that can only ever teach will teach a finished learner forever.

    Additive on purpose. `teach_once` keeps its exact signature and behaviour,
    so the ninety-odd call sites that already know they hold a real bottleneck
    are untouched -- widening `Turn.decision` to an Optional would have made
    every one of them prove something it already knows.
    """
    if isinstance(bottleneck, NoBottleneck):
        # NOTHING IS RECORDED HERE.
        #
        # `teach_once` records an Attempt on every terminal state, and that is
        # right for a turn that tried. This one did not: no mechanism was
        # chosen, so burning one would exclude a strategy that was never used.
        return NoInstruction(
            reason=bottleneck,
            action=_ACTION_FOR_ABSENCE[bottleneck],
            at=now(),
        )

    # DERIVED HERE, LIKE `proficiency`, AND FOR THE SAME REASON.
    #
    # `select_action` must not reach into the learner model, so the policy takes
    # a bare tuple of skill ids. The runtime is the only layer holding both the
    # graph and the learner's estimates, which makes it the only place the split
    # can honestly be computed.
    #
    # Before this it was computed nowhere. The parameter existed, was threaded
    # end to end, and defaulted to `()` -- so a learner competent at every
    # prerequisite and one competent at none produced identical contracts unless
    # the caller did the work by hand. The field looked wired and was inert.
    #
    # An explicitly passed value still wins: a caller who knows something the
    # stored state does not should not be overruled by it.
    if not known_prerequisites and learner_state is not None:
        known_prerequisites, _ = prerequisite_split(
            graph, learner_state, bottleneck.skill_id
        )

    return teach_once(
        graph,
        memory,
        client,
        bottleneck,
        diagnosis,
        question=question,
        now=now,
        known_prerequisites=known_prerequisites,
        live_misconceptions=live_misconceptions,
        belief=belief,
    )


def _record(
    memory: MemoryStore,
    contract: InstructionContract,
    outcome: Outcome,
    *,
    content: GeneratedContent | None = None,
) -> None:
    """Write the attempt down, whatever happened.

    `mechanism` is the STRATEGY name, matching the vocabulary the policy asks its
    exclusion question in. Recording the action here instead is what once let a
    single failure burn four distinct mechanisms.

    `example_signature` carries the generated text so the novelty check can see
    through a reworded repeat later. Empty on the failure paths, because there is
    nothing to compare against and storing a placeholder would make an unrelated
    future attempt look like a repeat of it.
    """
    memory.record_attempt(
        Attempt(
            skill_id=contract.target_skill,
            action=contract.action,
            representation=contract.strategy.value,
            outcome=outcome,
            mechanism=contract.strategy.value,
            example_signature=content.text if content is not None else "",
        )
    )


def _proficiency_of(belief: Belief | None) -> float | None:
    """The estimate, but only when the system has earned the right to use it.

    `None` for no belief at all, and ALSO `None` for a belief the mastery model
    does not yet stand behind. That second case is the point.

    An estimate of 0.9 from two observations is a guess with a decimal point, and
    handing it to the policy would let thin evidence steer a strategy choice as
    confidently as solid evidence does -- the exact failure `MasteryState`
    exists to make visible. `UNKNOWN` and `INSUFFICIENT_EVIDENCE` are the model
    saying "do not use this number yet", so the runtime does not.

    `None` is a real answer downstream: the policy keeps its authored ordering
    rather than guessing, so the cost of withholding is a compromise rather than
    a wrong turn.
    """
    if belief is None:
        return None
    if state_of(belief.estimate) in (MasteryState.UNKNOWN, MasteryState.INSUFFICIENT_EVIDENCE):
        return None
    return belief.estimate.estimate
