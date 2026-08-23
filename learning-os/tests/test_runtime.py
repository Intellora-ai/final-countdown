"""The loop, held to what composition breaks rather than what modules do.

Each module is tested on its own elsewhere. These tests exist for the failures
that only appear when they are wired together: a validator that works and is
never consulted, a memory nothing writes to, a repair path with no ceiling, an
outage recorded as a teaching failure.

None of those are visible in the modules. All of them are visible here.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from learning_os.domain.python_recursion import GRAPH
from learning_os.llm.client import FailureMode, FakeLLMClient, GeneratedContent, LLMClient
from learning_os.llm.contract import DiagnosisKind, InstructionContract, Strategy
from learning_os.memory.store import Attempt, MemoryStore, Outcome
from learning_os.models.contracts import ActionKind
from learning_os.runtime import MAX_GENERATION_ATTEMPTS, Turn, TurnStatus, teach_once


@dataclass(frozen=True, slots=True)
class _Bottleneck:
    """A stand-in satisfying `BottleneckLike` structurally.

    Defined here rather than imported from `test_policy`. Sharing it would make
    one test file's fixtures load-bearing for another's, so a change made for
    policy reasons could break runtime tests for reasons unrelated to the
    runtime. Four lines is cheaper than that coupling.
    """

    skill_id: str
    confidence: float = 0.9
    needs_diagnostic: bool = False


TRACE = "python.recursion.trace_calls"
QUESTION = "Why does a recursive function need a base case?"

#: Injected rather than read. A loop that calls the wall clock cannot be
#: replayed, and replay is the only way to ask whether a decision would still be
#: made given what is known now.
FIXED_NOW = datetime(2026, 1, 1, tzinfo=UTC)


def _now() -> datetime:
    return FIXED_NOW


def _run(
    client: LLMClient,
    memory: MemoryStore | None = None,
    *,
    diagnosis: DiagnosisKind = DiagnosisKind.CONCEPT_GAP,
    **over: object,
) -> Turn:
    return teach_once(
        GRAPH,
        memory if memory is not None else MemoryStore(),
        client,
        _Bottleneck(TRACE),
        diagnosis,
        question=QUESTION,
        now=_now,
        **over,  # type: ignore[arg-type]
    )


# --------------------------------------------------------------------------
# The happy path, and that it is actually checked
# --------------------------------------------------------------------------


def test_a_good_turn_teaches_and_records_a_success() -> None:
    m = MemoryStore()
    turn = _run(FakeLLMClient(), m)

    assert turn.status is TurnStatus.TAUGHT
    assert turn.content is not None
    assert turn.attempts == 1
    assert m.attempts_on(TRACE)[0].outcome is Outcome.SUCCESS


def test_content_is_validated_rather_than_trusted() -> None:
    """The composition failure that no module test can catch: a validator that
    works perfectly and is never called.

    The fake's CONSTRAINT_VIOLATION output is well-formed and breaks the
    contract. If the loop returned it as TAUGHT, every module would still pass
    its own tests.
    """
    turn = _run(FakeLLMClient(failure=FailureMode.CONSTRAINT_VIOLATION))
    assert turn.status is not TurnStatus.TAUGHT
    assert turn.content is None


def test_failed_content_is_unreachable_rather_than_merely_flagged() -> None:
    """`content` is None on every non-TAUGHT path, structurally.

    A `usable` boolean beside real content invites rendering it anyway. Nothing
    to render is a stronger guarantee than a flag somebody has to check.
    """
    for mode in (FailureMode.CONSTRAINT_VIOLATION, FailureMode.MALFORMED, FailureMode.TIMEOUT):
        assert _run(FakeLLMClient(failure=mode)).content is None


# --------------------------------------------------------------------------
# Outage is not a teaching failure
# --------------------------------------------------------------------------


def test_an_outage_does_not_raise() -> None:
    """An outage is a normal state of the world and the caller has a real choice
    to make about it. Delivering it as an exception pushes control flow into a
    `try` and discards the decision that was already made."""
    turn = _run(FakeLLMClient(failure=FailureMode.TIMEOUT))
    assert turn.status is TurnStatus.UNAVAILABLE
    assert turn.decision is not None


def test_an_outage_does_not_burn_the_strategy() -> None:
    """THE SUBTLE ONE, AND THE REASON THE STATUSES ARE SEPARATE.

    Nothing was taught, so recording a failed attempt would count an outage
    against this mechanism. The fallback engine would then avoid a perfectly good
    teaching move forever on the strength of one timeout -- a network fault
    permanently narrowing what the learner can be taught.
    """
    m = MemoryStore()
    _run(FakeLLMClient(failure=FailureMode.RATE_LIMIT), m)
    assert m.attempts_on(TRACE) == ()


def test_a_contract_failure_IS_recorded() -> None:
    """The other side. A generation that broke its contract is exactly what the
    policy needs next time, and a loop that raised would leave no trace -- so the
    same strategy gets chosen again and the engine never learns."""
    m = MemoryStore()
    _run(FakeLLMClient(failure=FailureMode.CONSTRAINT_VIOLATION), m)
    assert m.attempts_on(TRACE)[0].outcome is Outcome.FAILURE


def test_the_recorded_mechanism_matches_the_policys_vocabulary() -> None:
    """If the loop records the action while the policy excludes on mechanism,
    nothing is ever excluded and the fallback silently stops working."""
    m = MemoryStore()
    turn = _run(FakeLLMClient(), m)
    assert m.attempts_on(TRACE)[0].mechanism == turn.contract.strategy.value


# --------------------------------------------------------------------------
# Repair is bounded, and unrepairable means stop
# --------------------------------------------------------------------------


def test_repair_is_bounded() -> None:
    """A repair loop with no ceiling hides a policy problem as a latency problem:
    content failing three times says the CONTRACT is wrong, not that the model
    needs another go."""
    turn = _run(FakeLLMClient(failure=FailureMode.CONSTRAINT_VIOLATION))
    assert turn.attempts <= MAX_GENERATION_ATTEMPTS


def test_an_unrepairable_violation_stops_immediately() -> None:
    """Regenerating would be the blind repeat, just faster: the contract's
    strategy led the model there, so the same contract leads it back."""
    class _Unrenderable:
        def generate(self, contract: InstructionContract) -> GeneratedContent:
            return GeneratedContent(blocks=(("hologram", "x"),))

    turn = _run(_Unrenderable())
    assert turn.status is TurnStatus.CONTRACT_UNSATISFIABLE
    assert turn.attempts == 1, "an unrepairable failure was retried"


def test_the_violations_survive_to_the_caller() -> None:
    """Without them the caller knows only that it failed, and cannot tell a
    missing term from a generation that went somewhere else entirely."""
    turn = _run(FakeLLMClient(failure=FailureMode.CONSTRAINT_VIOLATION))
    assert turn.violations


# --------------------------------------------------------------------------
# Exhaustion is decided before spending a call
# --------------------------------------------------------------------------


def test_exhaustion_does_not_call_the_model() -> None:
    """The policy already knows every mechanism here has failed. Generating
    anyway spends a call to produce content the caller has been told not to
    trust."""
    calls = 0

    class _Counting:
        def generate(self, contract: InstructionContract) -> GeneratedContent:
            nonlocal calls
            calls += 1
            return GeneratedContent(blocks=(("prose", "x"),))

    m = MemoryStore()
    for strategy in (Strategy.WORKED_EXAMPLE, Strategy.CONTRAST,
                     Strategy.ANALOGY, Strategy.DECOMPOSITION):
        m.record_attempt(
            Attempt(
                skill_id=TRACE,
                action=turn_action(strategy),
                representation="prose",
                outcome=Outcome.FAILURE,
                mechanism=strategy.value,
            )
        )

    turn = _run(_Counting(), m)
    assert turn.status is TurnStatus.EXHAUSTED
    assert calls == 0, "the model was called after the policy had run out of ideas"


def turn_action(strategy: Strategy) -> ActionKind:
    from learning_os.policy.select import _ACTION_FOR

    return _ACTION_FOR[strategy]


# --------------------------------------------------------------------------
# Replay
# --------------------------------------------------------------------------


def test_the_turn_is_stamped_with_the_injected_clock() -> None:
    assert _run(FakeLLMClient()).at == FIXED_NOW


def test_the_same_state_produces_the_same_turn() -> None:
    """The loop inherits the policy's determinism rather than quietly adding
    nondeterminism of its own -- which is what a wall-clock read or a random
    retry jitter would do."""
    a = _run(FakeLLMClient(), MemoryStore())
    b = _run(FakeLLMClient(), MemoryStore())
    assert a.status == b.status
    assert a.contract == b.contract
    assert a.content == b.content


def test_proficiency_reaches_the_policy() -> None:
    """A PARAMETER NOTHING PASSES IS DEAD CODE WEARING AN INTERFACE.

    `select_action` gained `proficiency` so a procedural failure could diverge on
    whether the learner ever had the procedure. If the runtime — the only caller,
    and the only layer holding the learner state — does not pass it, the whole
    fix is inert in production and lives only in the policy's own tests.

    That is the same shape as a reason code no branch emits, which this session
    already fixed once. Asserting the effect end-to-end rather than asserting the
    argument was forwarded: forwarding can be correct and still reach a policy
    that ignores it.
    """
    nearly = _run(FakeLLMClient(), diagnosis=DiagnosisKind.PROCEDURAL_FAILURE, proficiency=0.7)
    never = _run(FakeLLMClient(), diagnosis=DiagnosisKind.PROCEDURAL_FAILURE, proficiency=0.1)
    assert nearly.contract.strategy is not never.contract.strategy
