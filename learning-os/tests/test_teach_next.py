"""Deciding whether to teach at all, which the engine previously could not do.

`ActionKind.DO_NOTHING` sat in the enum and was selected by nothing.
`MasteryState.MASTERED` was computed and read by nothing. `teach_once` required
a bottleneck, so every caller had to have found one -- and a system that can
only teach will teach a finished learner forever.

The tests here are mostly about what must NOT happen on the no-teach path: no
model call, no attempt recorded, no mechanism burned. A learner who was never
taught anything must not acquire a failure on their record, and a strategy that
was never used must not be excluded next time.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from learning_os.diagnosis import NoBottleneck, select_bottleneck
from learning_os.domain.python_recursion import GRAPH
from learning_os.llm.client import FakeLLMClient, GeneratedContent
from learning_os.llm.contract import DiagnosisKind, InstructionContract
from learning_os.memory.store import MemoryStore
from learning_os.models.contracts import ActionKind, LearnerState, SkillEstimate
from learning_os.runtime import NoInstruction, teach_next
from learning_os.runtime.loop import Turn

TARGET = "python.recursion.write_recursive_function"
NOW = datetime(2026, 1, 1, tzinfo=UTC)


def _now() -> datetime:
    return NOW


class _RefusesToBeCalled:
    """A client that fails the test if the engine generates anything.

    Asserting "no lesson was returned" is weaker than asserting "no model was
    called": the first is satisfied by an engine that generates content and then
    throws it away, which costs money on every finished learner.
    """

    def __init__(self) -> None:
        self.calls = 0

    def generate(self, contract: InstructionContract) -> GeneratedContent:
        self.calls += 1
        raise AssertionError("the engine called the model when it had nothing to teach")


def _estimate(skill_id: str, value: float) -> SkillEstimate:
    return SkillEstimate(
        skill_id=skill_id,
        estimate=value,
        confidence=0.9,
        evidence_count=10,
        evidence_diversity=4,
        evidence_ids=("ev0", "ev1", "ev2"),
    )


def _candidates() -> tuple[str, ...]:
    return (TARGET, *GRAPH.prerequisites_of(TARGET))


def _mastered() -> LearnerState:
    return LearnerState(
        learner_id="done",
        version=1,
        skills={s: _estimate(s, 0.95) for s in _candidates()},
    )


def _unknown() -> LearnerState:
    return LearnerState(learner_id="new", version=1, skills={})


def _struggling() -> LearnerState:
    return LearnerState(
        learner_id="stuck",
        version=1,
        skills={s: _estimate(s, 0.25) for s in _candidates()},
    )


def _run(
    state: LearnerState,
    *,
    memory: MemoryStore | None = None,
    client: object | None = None,
) -> Turn | NoInstruction:
    memory = memory if memory is not None else MemoryStore()
    bottleneck = select_bottleneck(GRAPH, state, memory, TARGET)
    return teach_next(
        GRAPH,
        memory,
        client if client is not None else FakeLLMClient(),  # type: ignore[arg-type]
        bottleneck,
        DiagnosisKind.CONCEPT_GAP,
        question="Why does a recursive function need a base case?",
        now=_now,
    )


# --------------------------------------------------------------------------
# The engine can now decide a learner is done
# --------------------------------------------------------------------------


def test_a_mastered_learner_is_taught_nothing() -> None:
    """THE GAP THIS CLOSES. `DO_NOTHING` is finally reachable from real code."""
    result = _run(_mastered())
    assert isinstance(result, NoInstruction)
    assert result.reason is NoBottleneck.MASTERED
    assert result.action is ActionKind.DO_NOTHING


def test_deciding_not_to_teach_does_not_call_the_model() -> None:
    """Otherwise every finished learner costs a generation to tell them so."""
    client = _RefusesToBeCalled()
    _run(_mastered(), client=client)
    assert client.calls == 0


def test_an_unknown_learner_is_diagnosed_rather_than_declared_finished() -> None:
    """The opposite move from mastery, off the same absent bottleneck.

    This is the pair the old `None` could not distinguish -- and reading it as
    "nothing is wrong" would abandon a learner the engine has simply never seen.
    """
    result = _run(_unknown())
    assert isinstance(result, NoInstruction)
    assert result.reason is NoBottleneck.UNEVIDENCED
    assert result.action is ActionKind.DIAGNOSE


def test_the_two_absences_do_not_produce_the_same_action() -> None:
    """The regression guard. If these ever collapse again, the engine has gone
    back to treating a finished learner and an unknown one identically."""
    done = _run(_mastered())
    new = _run(_unknown())
    assert isinstance(done, NoInstruction)
    assert isinstance(new, NoInstruction)
    assert done.action is not new.action


# --------------------------------------------------------------------------
# Nothing is recorded against a learner who was never taught
# --------------------------------------------------------------------------


def test_no_attempt_is_recorded_when_nothing_was_taught() -> None:
    """`teach_once` records on every terminal state, correctly -- it TRIED.

    This path did not. An attempt here would put a failure on the record of
    somebody who was never taught anything.
    """
    memory = MemoryStore()
    _run(_mastered(), memory=memory)
    assert memory.attempt_count(TARGET) == 0


def test_no_mechanism_is_burned_when_nothing_was_taught() -> None:
    """No strategy was chosen, so none may be excluded next time.

    Burning one here would make the engine avoid a mechanism it has never used,
    on a learner it decided not to teach.
    """
    memory = MemoryStore()
    _run(_mastered(), memory=memory)
    assert memory.failed_mechanisms(TARGET) == frozenset() or not memory.failed_mechanisms(TARGET)


# --------------------------------------------------------------------------
# The control: a real bottleneck still teaches, unchanged
# --------------------------------------------------------------------------


def test_a_struggling_learner_is_still_taught() -> None:
    """Without this, "does not teach" is satisfied by an engine that never
    teaches -- a different failure, not a fix."""
    result = _run(_struggling())
    assert isinstance(result, Turn), f"expected a lesson, got {result!r}"
    assert result.content is not None


def test_teach_next_delegates_unchanged_to_teach_once() -> None:
    """The additive claim. `teach_once` was not modified, and the composed path
    must produce exactly what calling it directly produces."""
    from learning_os.runtime.loop import teach_once

    state = _struggling()
    bottleneck = select_bottleneck(GRAPH, state, MemoryStore(), TARGET)
    assert not isinstance(bottleneck, NoBottleneck)

    via_next = _run(state)
    direct = teach_once(
        GRAPH,
        MemoryStore(),
        FakeLLMClient(),
        bottleneck,
        DiagnosisKind.CONCEPT_GAP,
        question="Why does a recursive function need a base case?",
        now=_now,
    )
    assert isinstance(via_next, Turn)
    assert via_next.contract == direct.contract
    assert via_next.status is direct.status


# --------------------------------------------------------------------------
# Every reason is handled
# --------------------------------------------------------------------------


@pytest.mark.parametrize("reason", list(NoBottleneck))
def test_every_absence_reason_maps_to_an_action(reason: NoBottleneck) -> None:
    """Enumerates the enum rather than spot-checking members, so a fourth reason
    fails here in CI instead of raising KeyError in front of a learner."""
    from learning_os.runtime.loop import _ACTION_FOR_ABSENCE

    assert reason in _ACTION_FOR_ABSENCE


def test_an_unmodelled_target_is_not_reported_as_mastery() -> None:
    """Both do nothing; only one is a statement about the learner.

    Collapsing them would log a learner as finished because a caller typed a
    skill id this domain does not model.
    """
    memory = MemoryStore()
    bottleneck = select_bottleneck(GRAPH, _struggling(), memory, "nope.not.a.skill")
    result = teach_next(
        GRAPH,
        memory,
        FakeLLMClient(),
        bottleneck,
        DiagnosisKind.CONCEPT_GAP,
        question="q",
        now=_now,
    )
    assert isinstance(result, NoInstruction)
    assert result.reason is NoBottleneck.UNKNOWN_TARGET
    # The shared action is what makes this worth stating: both do nothing, and
    # only `reason` records that one is a learner and the other is a bad call.
    assert result.action is ActionKind.DO_NOTHING
