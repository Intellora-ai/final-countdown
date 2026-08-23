"""The six runtime contracts, frozen.

WHY THESE ARE FROZEN BEFORE ANY ENGINE CODE EXISTS
--------------------------------------------------
The spec is explicit: freeze these six interfaces before writing large amounts
of code. The reason is not tidiness. This system's entire value is that a bad
decision can be explained after the fact, and an explanation is only possible if
the decision, the evidence it rested on, and the state it changed were all
recorded in a shape that cannot drift. A dict that grows a key in one module and
loses it in another destroys replay silently -- the log still parses, it just no
longer answers the question.

So every boundary in the engine speaks one of these six types, they are
versioned, and they validate. Nothing crosses a layer as a bare dict.

THE TWELVE INVARIANTS ARE ENFORCED HERE, NOT DOCUMENTED HERE
------------------------------------------------------------
Each one that CAN be a type constraint is a type constraint. An invariant that
lives only in a document is a suggestion; the ones below fail at construction:

  1  every important action has a target skill        -> Decision.target_skill required
  2  every action specifies expected evidence         -> Decision.expected_evidence required
  3  every state update references evidence           -> SkillEstimate.evidence_ids non-empty
  5  every tool result has provenance and timestamp   -> ToolResult.source + retrieved_at required
  7  a failed strategy cannot repeat without a reason -> Decision.repeat_justification
  8  self-report cannot override objective evidence   -> EvidenceStrength.SELF_REPORT floor
  9  production policy cannot update unevaluated      -> PolicyUpdate._live_policy_was_approved
 10  a mastery claim requires independent evidence    -> SkillEstimate.can_claim_mastery()
 11  unsupported domains produce uncertainty          -> ToolResult._unsupported_cannot_be_confident
 12  every decision is replayable from the log        -> DecisionEvent carries every input

Invariants 4 and 6 are architectural rather than structural -- memory is scoped
so that only decision-bearing facts are kept, and the knowledge model is frozen
so the LLM layer is never handed a writable reference. Both are named in the
docstrings of the places that enforce them.

(9 was listed as architectural here and that was wrong: it is a constructor
validator, so a PolicyUpdate cannot even be built in a live state. Corrected
after a reviewer went looking for an enforcement that was already present.)
"""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

# --------------------------------------------------------------------------
# Versioning
# --------------------------------------------------------------------------

#: Bumped when a contract changes shape in a way an older log cannot be read
#: under. Every persisted event carries it, so a replay knows which reader to
#: use rather than guessing from the presence of a field.
CONTRACT_VERSION = "1.0.0"


def _now() -> datetime:
    """Timezone-aware UTC.

    A naive datetime in an event log is a bug waiting for the first machine in
    another timezone: two events an hour apart can sort backwards, and a replay
    then reconstructs a decision from state that did not exist yet.
    """
    return datetime.now(UTC)


class _Frozen(BaseModel):
    """Immutable, strict, and closed to unknown keys.

    `extra="forbid"` is the load-bearing one. The failure this prevents is a
    caller writing `evidence_count` where the field is `evidence_ids`: with
    extras allowed the object constructs, the real field silently keeps its
    default, and the mistake surfaces much later as a mastery estimate computed
    from nothing.
    """

    model_config = ConfigDict(frozen=True, extra="forbid", strict=True)


# --------------------------------------------------------------------------
# Shared vocabulary
# --------------------------------------------------------------------------

SkillId = Annotated[str, Field(pattern=r"^[a-z0-9]+(\.[a-z0-9_]+)+$", max_length=120)]
"""`domain.concept.subskill`. Dotted so the graph is legible in a raw log."""

MisconceptionId = Annotated[str, Field(pattern=r"^[a-z0-9]+(\.[a-z0-9_]+)+$", max_length=120)]
"""A REFERENCE into the knowledge model's misconception library, never prose.

WHY THIS IS AN ID AND NOT A STRING.

This field began as `tuple[str, ...]` and that was the one hole big enough to
undo the whole no-diagnosis rule. A closed signal vocabulary is worthless if a
free-text field survives anywhere on the learner model, because the day someone
needs to record something the enum does not cover, they will write it into the
nearest string that accepts it -- and `misconceptions=["probably has ADHD"]`
validates perfectly against `str`.

Constraining the pattern means a misconception must already exist in the
canonical knowledge model to be attached to a learner. Prose does not match, so
the diagnosis cannot be written; and the set of nameable misconceptions becomes
a reviewed artefact rather than whatever a caller typed."""

Confidence = Annotated[float, Field(ge=0.0, le=1.0)]
Estimate = Annotated[float, Field(ge=0.0, le=1.0)]


class Verifiability(StrEnum):
    """How far this domain can be checked by machine.

    Invariant 11. The spec is blunt that "universal" must mean extensible
    through domain adapters, not that the core pretends to know every subject
    equally well. Python execution is checkable; historical interpretation is
    not, and a system that reports the same confidence for both is lying about
    the second one.
    """

    VERIFIABLE = "verifiable"
    PARTIALLY_VERIFIABLE = "partially_verifiable"
    SOURCE_VERIFIABLE = "source_verifiable"
    HUMAN_REVIEW_REQUIRED = "human_review_required"
    UNSUPPORTED = "unsupported"


class Certainty(StrEnum):
    """What the engine knows, as opposed to what it estimates.

    `CONFLICTING` is separate from `UNCERTAIN` on purpose: uncertain means thin
    evidence and is fixed by gathering more, conflicting means the evidence
    disagrees with itself and is made WORSE by gathering more of the same. They
    call for different next actions, so they cannot share a name.
    """

    KNOWN = "known"
    LIKELY = "likely"
    UNCERTAIN = "uncertain"
    UNKNOWN = "unknown"
    CONFLICTING = "conflicting"


class EvidenceStrength(StrEnum):
    """The default evidence hierarchy, strongest first.

    Ordering matters and is exposed through `rank` below, because invariant 8
    ("self-report cannot override objective evidence automatically") is only
    checkable if the two are comparable.
    """

    INDEPENDENT_NOVEL_TRANSFER = "independent_novel_transfer"
    INDEPENDENT_APPLICATION = "independent_application"
    REPAIR_OR_CONSTRUCTION = "repair_or_construction"
    OWN_WORD_EXPLANATION = "own_word_explanation"
    PREDICTION = "prediction"
    RECALL = "recall"
    RECOGNITION = "recognition"
    ANSWER_AFTER_HINT = "answer_after_hint"
    ANSWER_AFTER_EXPLANATION = "answer_after_explanation"
    SELF_REPORT = "self_report"

    @property
    def rank(self) -> int:
        """0 is strongest. Used for comparison, never shown to a learner."""
        return _EVIDENCE_ORDER.index(self)

    @property
    def is_objective(self) -> bool:
        """Self-report is the only non-objective kind. See invariant 8."""
        return self is not EvidenceStrength.SELF_REPORT


_EVIDENCE_ORDER: list[EvidenceStrength] = list(EvidenceStrength)


# --------------------------------------------------------------------------
# CONTRACT 1 -- Event. What happened?
# --------------------------------------------------------------------------


class EventType(StrEnum):
    STUDENT_MESSAGE = "student_message"
    TASK_STARTED = "task_started"
    RESPONSE_SUBMITTED = "response_submitted"
    HINT_USED = "hint_used"
    TOOL_CALLED = "tool_called"
    INTERVENTION_STARTED = "intervention_started"
    INTERVENTION_COMPLETED = "intervention_completed"
    CONCEPT_SWITCHED = "concept_switched"
    SESSION_ENDED = "session_ended"


class Event(_Frozen):
    """One immutable thing that happened.

    Append-only. Nothing in the engine may edit an event after it is written --
    that is what makes replay meaningful, and it is why this model is frozen
    rather than merely conventionally-not-mutated.
    """

    contract_version: str = CONTRACT_VERSION
    event_id: str = Field(min_length=1, max_length=64)
    event_type: EventType
    timestamp: datetime = Field(default_factory=_now)
    learner_id: str = Field(min_length=1, max_length=64)
    session_id: str = Field(min_length=1, max_length=64)

    #: State versions at the moment this event was recorded. Replay reads these
    #: to rebuild the exact inputs a decision saw, rather than the state as it
    #: looks now -- which is the difference between explaining a past decision
    #: and re-deciding it with hindsight.
    situation_state_version: int = Field(ge=0)
    learner_state_version: int = Field(ge=0)
    knowledge_version: str = Field(min_length=1, max_length=64)

    skill_id: SkillId | None = None
    payload: dict[str, str | int | float | bool | None] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _timestamp_is_aware(self) -> Self:
        if self.timestamp.tzinfo is None:
            raise ValueError("event timestamp must be timezone-aware; see _now()")
        return self


# --------------------------------------------------------------------------
# CONTRACT 5 -- Evidence. What did the learner's behaviour demonstrate?
# --------------------------------------------------------------------------


class Evidence(_Frozen):
    """What one interaction actually demonstrated.

    NOT A CORRECT/WRONG FLAG, AND THAT IS THE WHOLE POINT.
    A response can be correct by guessing, by recognition, by memorisation, or
    because the wording was familiar. It can be wrong through a careless slip on
    a concept the learner holds perfectly well. So the raw outcome is only one
    field among several, and the estimator is required to read the others.
    """

    contract_version: str = CONTRACT_VERSION
    evidence_id: str = Field(min_length=1, max_length=64)
    event_id: str = Field(min_length=1, max_length=64)
    skill_id: SkillId
    strength: EvidenceStrength

    observed_performance: Annotated[float, Field(ge=0.0, le=1.0)]
    task_difficulty: Annotated[float, Field(ge=0.0, le=1.0)]
    task_reliability: Annotated[float, Field(ge=0.0, le=1.0)]

    #: 1.0 = unaided. Drops as hints are taken. An answer produced after being
    #: told the answer is evidence of listening, not of knowing, and this is the
    #: field that keeps those apart.
    independence: Annotated[float, Field(ge=0.0, le=1.0)]
    hint_factor: Annotated[float, Field(ge=0.0, le=1.0)] = 0.0

    #: 1.0 = a context never seen before. Transfer is the strongest signal the
    #: system can get, and it is only transfer if the context is genuinely new.
    context_novelty: Annotated[float, Field(ge=0.0, le=1.0)] = 0.0

    response_time_ms: int = Field(ge=0)
    representation: str = Field(min_length=1, max_length=64)
    attempt_number: int = Field(ge=1)
    error_type: str | None = Field(default=None, max_length=64)

    @property
    def weight(self) -> float:
        """How much this evidence should move an estimate.

        Deliberately NOT the estimator itself -- the spec requires the learner
        state interface to survive replacing the estimator with Bayesian
        Knowledge Tracing or IRT. This is the part every estimator agrees on:
        reliable, independent, novel evidence counts for more.
        """
        return self.task_reliability * self.independence * (1.0 - self.hint_factor)


# --------------------------------------------------------------------------
# CONTRACT 2 -- Learner state. What is currently estimated?
# --------------------------------------------------------------------------


class SkillEstimate(_Frozen):
    """An estimate with its own uncertainty. Never a fact.

    The spec forbids storing `understands_x = 0.84` as truth. An estimate
    without a confidence and an evidence count cannot be reasoned about: 0.84
    from eight varied demonstrations and 0.84 from one lucky guess are the same
    number and completely different situations.
    """

    skill_id: SkillId
    estimate: Estimate
    confidence: Confidence
    evidence_count: int = Field(ge=0)

    #: How many DISTINCT kinds of evidence. Ten identical multiple-choice
    #: answers are not ten independent observations, and without this field the
    #: two are indistinguishable in the state.
    evidence_diversity: int = Field(ge=0)

    #: Invariant 3: every state update references the evidence that caused it.
    evidence_ids: tuple[str, ...] = ()
    last_updated: datetime = Field(default_factory=_now)
    state: Literal["unknown", "developing", "competent", "mastered"] = "unknown"

    @model_validator(mode="after")
    def _updates_cite_evidence(self) -> Self:
        """Invariant 3, enforced rather than trusted.

        An estimate that has moved off `unknown` without naming the evidence
        that moved it is unexplainable by construction, and this system exists
        to be explainable.
        """
        if self.state != "unknown" and not self.evidence_ids:
            raise ValueError(
                f"{self.skill_id}: state '{self.state}' cites no evidence "
                "(invariant 3: every state update must reference evidence)"
            )
        if self.evidence_count and not self.evidence_ids:
            raise ValueError(
                f"{self.skill_id}: evidence_count={self.evidence_count} but no evidence_ids"
            )
        return self

    def can_claim_mastery(self, *, min_independent: int = 2) -> bool:
        """Invariant 10: a mastery claim needs independent evidence.

        The count is a floor, not a formula. What it rules out is the failure
        the spec names directly -- calling something mastered off a single
        answer given immediately after being shown the answer.
        """
        return (
            self.state == "mastered"
            and self.evidence_count >= min_independent
            and self.evidence_diversity >= min_independent
            and self.confidence >= 0.7
        )


class ObservationalHypothesis(_Frozen):
    """An interaction signal, and the ONLY shape one may be stored in.

    THIS TYPE EXISTS TO MAKE A DIAGNOSIS UNREPRESENTABLE.

    The system may be used by children. It may notice that a learner abandoned
    three tasks in a row and adapt what it offers next. It may NEVER convert
    that into "the student has ADHD", "is lazy", or "is emotionally unstable".

    Writing that rule in a document is not enough -- somebody eventually adds a
    `traits` dict "just for the recommender". So the learner model has no field
    a diagnosis fits in: the only place an interaction signal may live is here,
    the vocabulary is closed, and every instance carries an expiry. A signal
    that cannot outlive the session it came from cannot harden into a label.
    """

    signal: Literal[
        "possible_confusion",
        "possible_disengagement",
        "possible_overload",
        "possible_guessing",
        "high_friction",
    ]
    confidence: Confidence
    observed_at: datetime = Field(default_factory=_now)
    expires_after_session: bool = True
    evidence_ids: tuple[str, ...] = ()

    @model_validator(mode="after")
    def _signals_cite_evidence(self) -> Self:
        if not self.evidence_ids:
            raise ValueError(
                "an observational signal with no evidence is an opinion; "
                "cite the interactions that produced it"
            )
        return self


class LearnerState(_Frozen):
    """What the engine currently believes about one learner."""

    contract_version: str = CONTRACT_VERSION
    learner_id: str = Field(min_length=1, max_length=64)
    version: int = Field(ge=0)
    skills: dict[str, SkillEstimate] = Field(default_factory=dict)
    misconceptions: tuple[MisconceptionId, ...] = ()
    prerequisite_gaps: tuple[SkillId, ...] = ()

    #: Strategy -> (attempts, successes). Feeds the fallback engine so a
    #: strategy that has already failed for this learner is not re-selected
    #: without a reason (invariant 7).
    strategy_stats: dict[str, tuple[int, int]] = Field(default_factory=dict)
    signals: tuple[ObservationalHypothesis, ...] = ()
    current_bottleneck: SkillId | None = None
    updated_at: datetime = Field(default_factory=_now)


# --------------------------------------------------------------------------
# CONTRACT 4 -- Tool result. What did an external tool establish?
# --------------------------------------------------------------------------


class ToolResult(_Frozen):
    """What a tool established, and how far it can be trusted.

    Invariant 5: provenance and timestamp are required, not optional. The spec
    is explicit that canonical knowledge, retrieved evidence, learner-provided
    information and inference must not be merged blindly -- `source` is what
    keeps them apart, and a result with no source cannot be told from a guess
    once it is three layers deep in a decision.
    """

    contract_version: str = CONTRACT_VERSION
    tool: str = Field(min_length=1, max_length=64)
    tool_input: str = Field(max_length=4000)
    result: str = Field(max_length=20000)

    source: Literal["execution", "web", "calculation", "memory", "canonical", "inference"]
    retrieved_at: datetime = Field(default_factory=_now)
    verification: Verifiability
    confidence: Confidence

    #: What this result does NOT establish. A passing test proves the cases it
    #: covers and nothing else, and the engine reads this before letting a tool
    #: result support a mastery claim.
    limitations: tuple[str, ...] = ()

    @model_validator(mode="after")
    def _unsupported_cannot_be_confident(self) -> Self:
        """Invariant 11: an unsupported domain produces uncertainty.

        Without this, a verifier that cannot check a claim still returns a
        confidence, and the policy layer has no way to tell "checked and true"
        from "could not check".
        """
        if self.verification is Verifiability.UNSUPPORTED and self.confidence > 0.0:
            raise ValueError(
                "an UNSUPPORTED domain cannot report confidence; "
                "it must produce uncertainty, not fabricated confidence"
            )
        return self


# --------------------------------------------------------------------------
# CONTRACT 3 -- Decision. What should happen next?
# --------------------------------------------------------------------------


class ActionKind(StrEnum):
    """V1 keeps three teaching actions, plus the two non-teaching outcomes.

    `DIAGNOSE` and `DO_NOTHING` are first-class. The spec says knowing what not
    to do is part of smart behaviour, and an engine whose action set is only
    teaching actions will always teach -- including at the moments when the
    right move was to ask, or to leave a learner alone who already understood.
    """

    TEACH_BY_EXAMPLE = "teach_by_example"
    REPAIR_BROKEN_EXAMPLE = "repair_broken_example"
    TRANSFER_CHALLENGE = "transfer_challenge"
    DIAGNOSE = "diagnose"
    DO_NOTHING = "do_nothing"


class CandidateAction(_Frozen):
    """One option the policy considered, with the numbers it was judged on.

    Every candidate is recorded, not just the winner. Replaying a bad decision
    means seeing what it was chosen OVER -- a selection with no alternatives in
    the log is unfalsifiable.
    """

    kind: ActionKind
    representation: str = Field(min_length=1, max_length=64)
    expected_learning_gain: Annotated[float, Field(ge=0.0, le=1.0)]
    probability_of_success: Confidence
    expected_cost_seconds: float = Field(ge=0.0)
    diagnostic_value: Annotated[float, Field(ge=0.0, le=1.0)] = 0.0
    learner_friction: Annotated[float, Field(ge=0.0, le=1.0)] = 0.0
    overload_risk: Annotated[float, Field(ge=0.0, le=1.0)] = 0.0

    @property
    def expected_value(self) -> float:
        """Gain weighted by the chance of getting it, less what it costs.

        Kept small and readable on purpose. The spec requires the optimisation
        algorithm to stay replaceable, so the ranking lives here as one honest
        expression rather than being spread through the policy layer.
        """
        gain = self.expected_learning_gain * self.probability_of_success
        return (
            gain
            + 0.25 * self.diagnostic_value
            - 0.35 * self.learner_friction
            - 0.4 * self.overload_risk
        )


class Hypothesis(_Frozen):
    """A competing explanation for what is blocking the learner."""

    label: str = Field(min_length=1, max_length=120)
    probability: Confidence
    supporting_evidence_ids: tuple[str, ...] = ()
    contradicting_evidence_ids: tuple[str, ...] = ()


class Decision(_Frozen):
    """What the engine chose, and everything it needs to be judged later."""

    contract_version: str = CONTRACT_VERSION
    decision_id: str = Field(min_length=1, max_length=64)

    #: Invariant 1: every important action has a target skill. Not optional --
    #: an action with no target cannot be evaluated, because there is no skill
    #: whose movement would tell you whether it worked.
    target_skill: SkillId

    hypotheses: tuple[Hypothesis, ...] = ()
    candidate_actions: tuple[CandidateAction, ...] = Field(min_length=1)
    selected: CandidateAction

    #: Invariant 2: what would show this worked, decided BEFORE acting.
    #: Choosing the success criterion after seeing the outcome is how every
    #: intervention comes to look successful.
    expected_evidence: EvidenceStrength

    confidence: Confidence
    certainty: Certainty
    reason_codes: tuple[str, ...] = Field(min_length=1)

    #: Invariant 7. A strategy that already failed for this learner may only be
    #: repeated with a stated reason -- a changed diagnosis, a changed context,
    #: or a judgement that the failure was not caused by the strategy.
    repeat_justification: str | None = None

    @model_validator(mode="after")
    def _selected_was_a_candidate(self) -> Self:
        if self.selected not in self.candidate_actions:
            raise ValueError(
                "the selected action is not among the candidates; "
                "the decision would not be replayable (invariant 12)"
            )
        return self


# --------------------------------------------------------------------------
# CONTRACT 6 -- Policy update. What did the system learn from the outcome?
# --------------------------------------------------------------------------


class EvaluationStatus(StrEnum):
    """Where a candidate policy change is in the approval pipeline.

    THIS ENUM IS THE PRODUCTION SAFETY CONTROL.

    The naive research loop -- outcome updates policy directly -- is rejected
    for production, because one unusual learner response could make the system
    worse for everyone. A change has to survive offline evaluation, benchmark
    replay, safety gates, a HUMAN, and a canary before it is live. Modelling
    those as states means a change cannot skip one silently: there is no
    transition from `observed` to `live`.
    """

    OBSERVED = "observed"
    OFFLINE_EVALUATED = "offline_evaluated"
    BENCHMARK_REPLAYED = "benchmark_replayed"
    GATES_PASSED = "gates_passed"
    AWAITING_HUMAN_APPROVAL = "awaiting_human_approval"
    APPROVED = "approved"
    CANARY = "canary"
    LIVE = "live"
    REJECTED = "rejected"


#: The only transitions that exist. Invariant 9: production policy cannot
#: update without evaluation and versioning.
_ALLOWED_TRANSITIONS: dict[EvaluationStatus, frozenset[EvaluationStatus]] = {
    EvaluationStatus.OBSERVED: frozenset(
        {EvaluationStatus.OFFLINE_EVALUATED, EvaluationStatus.REJECTED}
    ),
    EvaluationStatus.OFFLINE_EVALUATED: frozenset(
        {EvaluationStatus.BENCHMARK_REPLAYED, EvaluationStatus.REJECTED}
    ),
    EvaluationStatus.BENCHMARK_REPLAYED: frozenset(
        {EvaluationStatus.GATES_PASSED, EvaluationStatus.REJECTED}
    ),
    EvaluationStatus.GATES_PASSED: frozenset(
        {EvaluationStatus.AWAITING_HUMAN_APPROVAL, EvaluationStatus.REJECTED}
    ),
    EvaluationStatus.AWAITING_HUMAN_APPROVAL: frozenset(
        {EvaluationStatus.APPROVED, EvaluationStatus.REJECTED}
    ),
    EvaluationStatus.APPROVED: frozenset({EvaluationStatus.CANARY, EvaluationStatus.REJECTED}),
    EvaluationStatus.CANARY: frozenset({EvaluationStatus.LIVE, EvaluationStatus.REJECTED}),
    EvaluationStatus.LIVE: frozenset({EvaluationStatus.REJECTED}),
    EvaluationStatus.REJECTED: frozenset(),
}


def may_transition(current: EvaluationStatus, proposed: EvaluationStatus) -> bool:
    """Whether a candidate policy may move from one state to the next.

    Rejection is reachable from everywhere, including LIVE -- a rollout that
    turns out badly has to be stoppable, and a state machine that can only move
    forward would make the canary pointless.
    """
    return proposed in _ALLOWED_TRANSITIONS[current]


class PolicyUpdate(_Frozen):
    """One observed outcome, and the change it is a candidate for.

    A CANDIDATE. Constructing one of these changes nothing in production -- it
    records that an intervention happened and what it produced. Whether that
    ever becomes live policy is the business of the evaluation pipeline above.
    """

    contract_version: str = CONTRACT_VERSION
    policy_version: str = Field(min_length=1, max_length=64)
    decision_id: str = Field(min_length=1, max_length=64)

    state_before: LearnerState
    action: CandidateAction
    predicted_outcome: Annotated[float, Field(ge=0.0, le=1.0)]
    actual_outcome: Annotated[float, Field(ge=0.0, le=1.0)]

    learning_gain: float
    cost_seconds: float = Field(ge=0.0)
    recovered: bool
    evaluation_status: EvaluationStatus = EvaluationStatus.OBSERVED
    candidate_change: str | None = Field(default=None, max_length=2000)

    @property
    def prediction_error(self) -> float:
        """How wrong the policy was. This is the training signal.

        Recorded per decision because the spec wants the system to learn which
        interventions actually CAUSE improvement, and an outcome with no
        prediction beside it only ever supports a correlation.
        """
        return self.actual_outcome - self.predicted_outcome

    @model_validator(mode="after")
    def _live_policy_was_approved(self) -> Self:
        """Invariant 9, at the type level.

        A `PolicyUpdate` cannot be constructed already LIVE. Reaching LIVE
        requires walking the state machine, and every step of that walk is a
        place a human or a gate can say no.
        """
        if self.evaluation_status in {EvaluationStatus.LIVE, EvaluationStatus.CANARY}:
            raise ValueError(
                f"a PolicyUpdate cannot be created at '{self.evaluation_status}'; "
                "production policy only changes through the evaluation pipeline "
                "(invariant 9)"
            )
        return self


# --------------------------------------------------------------------------
# The replay record
# --------------------------------------------------------------------------


class DecisionEvent(_Frozen):
    """Invariant 12: one row from which a decision can be rebuilt entirely.

    Everything the decision saw and everything it produced, in one immutable
    record: the state versions, which memories were retrieved, what was
    considered, what was chosen and why, what the tools said, and what the state
    became. Without this, "why did it do that?" has no answer six weeks later,
    and a system nobody can debug after a failure is not one anybody should put
    in front of a child.
    """

    contract_version: str = CONTRACT_VERSION
    event_id: str = Field(min_length=1, max_length=64)
    event_type: Literal["instruction_intervention"] = "instruction_intervention"
    timestamp: datetime = Field(default_factory=_now)
    learner_id: str = Field(min_length=1, max_length=64)

    situation_state_version: int = Field(ge=0)
    learner_state_version: int = Field(ge=0)
    knowledge_version: str = Field(min_length=1, max_length=64)

    retrieved_memory_ids: tuple[str, ...] = ()
    decision: Decision
    tool_results: tuple[ToolResult, ...] = ()
    generated_output_hash: str | None = Field(default=None, max_length=128)
    verification: Verifiability = Verifiability.UNSUPPORTED

    actual_outcome: float | None = Field(default=None, ge=0.0, le=1.0)
    post_state_version: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def _state_moves_forward(self) -> Self:
        if (
            self.post_state_version is not None
            and self.post_state_version < self.learner_state_version
        ):
            raise ValueError(
                "post_state_version precedes the state the decision was made on; "
                "the log would replay out of order"
            )
        return self
