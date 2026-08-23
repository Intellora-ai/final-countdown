"""Closing the loop: a learner's answer becomes evidence, and evidence moves a belief.

WHAT WAS MISSING, AND WHY IT WAS EASY TO MISS
---------------------------------------------
Every other leg of the adaptive loop existed. Bottleneck, policy, generation,
validation, emission to the canvas, and a mastery estimator that updates from
evidence. `DomainVerifier.evaluate_response` was written, tested, and called by
NOTHING.

So the engine could decide what to teach and teach it, and a learner could answer,
and the answer changed nothing. The system would have taught the same thing at
the same difficulty forever, adapting confidently to evidence it never collected.

It was easy to miss because every module passed its own tests. The gap was not
inside any of them; it was the absence of the call between two of them -- which is
exactly the class of defect a test suite cannot see, because a suite is a
cooperative caller that constructs what the author expected.

WHY THE JUDGEMENT -> EVIDENCE CONVERSION LIVES HERE
---------------------------------------------------
A verifier returns a `Judgement`: what it checked and how far that can be
trusted. It deliberately does NOT return `Evidence`, because evidence carries
things the verifier cannot know -- when the engine asked, which representation
was on screen, how many attempts this is, whether help was given. Those belong to
the runtime.

Putting the conversion in the verifier would force every future verifier -- Lean,
a rubric, a symbolic checker -- to invent that context or leave it blank. One
boundary, converted once.

THE INVARIANT THIS FILE EXISTS TO PROTECT
-----------------------------------------
An unsettled judgement must not move an estimate.

`HUMAN_REVIEW_REQUIRED` means the verifier could not decide. Treating that as a
zero would punish a learner for the engine's inability to check, and treating it
as a pass would manufacture mastery. Both are worse than recording that nothing
was learned about this skill -- which is what happens instead.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime

from learning_os.llm.contract import InstructionContract
from learning_os.mastery.estimate import Belief, update
from learning_os.memory.store import Attempt, MemoryStore, Outcome
from learning_os.models.contracts import Evidence, EvidenceStrength, Verifiability
from learning_os.verifiers.base import DomainVerifier, Judgement, Task

#: Below this fraction of the task's checks, an attempt counts as a failure.
#: Above it and short of everything, PARTIAL -- which the fallback engine reads
#: as traction worth varying rather than an approach worth abandoning.
PARTIAL_FLOOR = 0.5


@dataclass(frozen=True, slots=True)
class Observation:
    """What one answer told the system, and what it changed.

    `belief` is the UPDATED belief, returned rather than mutated. The estimator
    is pure and this keeps it that way through the runtime: a caller holding the
    old belief still holds the old belief, which is what makes a decision
    replayable against the state that produced it.

    `evidence` is None when nothing was settled. Not an empty Evidence with zeros
    -- a zero is a claim that the learner failed, and "we could not tell" is a
    different statement that must not be recorded as one.
    """

    judgement: Judgement
    belief: Belief
    evidence: Evidence | None = None
    outcome: Outcome = Outcome.FAILURE

    @property
    def settled(self) -> bool:
        """Whether the verifier actually decided anything."""
        return self.evidence is not None


def observe(
    verifier: DomainVerifier,
    memory: MemoryStore,
    task: Task,
    response: str,
    belief: Belief,
    contract: InstructionContract,
    *,
    now: Callable[[], datetime],
    event_id: str,
    evidence_id: str,
    response_time_ms: int = 0,
    hint_factor: float = 0.0,
) -> Observation:
    """Run the verifier, turn its judgement into evidence, and update the belief.

    `evidence_id` and `event_id` are supplied by the caller rather than generated
    here. Generating them would need a clock or a random source inside a function
    that must stay replayable, and provenance that changes on replay is not
    provenance.
    """
    judgement = verifier.evaluate_response(task, response)

    if judgement.verifiability is not Verifiability.VERIFIABLE:
        # NOTHING WAS SETTLED, SO NOTHING MOVES.
        #
        # The attempt is still recorded -- the policy needs to know this mechanism
        # was tried -- but as a FAILURE of the intervention rather than of the
        # learner, and with no evidence attached. An estimate that moved here
        # would be moving on the engine's inability to check.
        _record(memory, contract, Outcome.FAILURE)
        return Observation(judgement=judgement, belief=belief, outcome=Outcome.FAILURE)

    strength = _strength_of(task, hint_factor=hint_factor)
    evidence = Evidence(
        evidence_id=evidence_id,
        event_id=event_id,
        skill_id=task.skill_id,
        strength=strength,
        observed_performance=judgement.performance,
        task_difficulty=_difficulty_of(task),
        # Execution is a reliable instrument; that is the whole reason Python was
        # chosen as the first domain. A rubric verifier would supply a lower
        # number here, which is why it is a field rather than a constant.
        task_reliability=1.0,
        independence=1.0 - hint_factor,
        hint_factor=hint_factor,
        context_novelty=1.0 if task.is_novel_context else 0.0,
        response_time_ms=response_time_ms,
        representation=contract.strategy.value,
        attempt_number=memory.attempt_count(task.skill_id) + 1,
    )

    outcome = _outcome_of(judgement)
    _record(memory, contract, outcome)
    memory.record_evidence(evidence)

    return Observation(
        judgement=judgement,
        belief=update(belief, evidence, now=now),
        evidence=evidence,
        outcome=outcome,
    )


def _strength_of(task: Task, *, hint_factor: float) -> EvidenceStrength:
    """How strong this evidence is, from what was ASKED, not from how it went.

    Invariant 2. `Task.expected_evidence` is fixed when the task is created, so
    deciding strength here means reading a decision already made -- not making
    one after seeing the answer, which is how every intervention ends up looking
    successful.

    Hints are the one legitimate demotion, and they demote rather than zero: a
    hinted answer is real evidence of something weaker, not an absence of
    evidence. The learner still did something.
    """
    if hint_factor > 0.0:
        return EvidenceStrength.ANSWER_AFTER_HINT
    return task.expected_evidence


def _difficulty_of(task: Task) -> float:
    """A novel-context task is harder than a familiar one.

    Coarse on purpose. A finer per-task difficulty would be a number nobody
    calibrated, and section 12 is explicit that these are configuration
    hypotheses rather than findings -- a made-up 0.63 reads as measured in a way
    that two honest values do not.
    """
    return 0.75 if task.is_novel_context else 0.5


def _outcome_of(judgement: Judgement) -> Outcome:
    """Success, traction, or neither.

    PARTIAL is the case the fallback engine most needs and the one a boolean
    destroys. A learner who passed three of five checks was moved by this
    approach and not far enough: that is a reason to VARY it, while a failure is
    a reason to abandon it. Collapsing them throws away the only approach showing
    any traction.
    """
    if judgement.passed:
        return Outcome.SUCCESS
    if judgement.performance >= PARTIAL_FLOOR:
        return Outcome.PARTIAL
    return Outcome.FAILURE


def _record(memory: MemoryStore, contract: InstructionContract, outcome: Outcome) -> None:
    """Write the attempt down in the vocabulary the policy reads.

    `mechanism` is the strategy name, matching `failed_mechanisms`. Recording the
    action instead is what once let a single failure burn four distinct
    mechanisms that happened to share an `ActionKind`.
    """
    memory.record_attempt(
        Attempt(
            skill_id=contract.target_skill,
            action=contract.action,
            representation=contract.strategy.value,
            outcome=outcome,
            mechanism=contract.strategy.value,
        )
    )
