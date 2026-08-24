"""The memory survives the process, and the fallback engine finally fires.

Two things here, and the second was found by building the first.

Persistence: everything that makes this engine non-generic is history. In
process that worked; between processes it evaporated, so every learner was a
stranger on every run.

And once sessions could actually see each other's history, the exclusion still
did not fire — because `teach_once` recorded a successful GENERATION as
`Outcome.SUCCESS`, and `_burned` reads success as "this teaching worked on this
learner". Every taught mechanism cleared itself the moment its content
validated. `Outcome.DELIVERED` separates the two claims.

The end-to-end test is the one that matters. Every test that previously covered
exclusion built the memory by hand, and a bare FAILURE attempt is not something
the live loop produces.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest

from learning_os.diagnosis import select_bottleneck
from learning_os.diagnosis.bottleneck import Bottleneck
from learning_os.domain.python_recursion import GRAPH
from learning_os.llm.client import FakeLLMClient
from learning_os.llm.contract import DiagnosisKind
from learning_os.mastery import Belief
from learning_os.memory.journal import JournalError, JournalledMemory, replay
from learning_os.memory.store import Attempt, MemoryStore, Outcome
from learning_os.models.contracts import (
    ActionKind,
    EvidenceStrength,
    LearnerState,
    SkillEstimate,
)
from learning_os.runtime import observe, teach_next
from learning_os.runtime.loop import Turn, TurnStatus
from learning_os.verifiers.base import Task
from learning_os.verifiers.python_verifier import PythonVerifier

TARGET = "python.recursion.write_recursive_function"
NOW = datetime(2026, 1, 1, tzinfo=UTC)


def _now() -> datetime:
    return NOW


def _est(value: float) -> SkillEstimate:
    return SkillEstimate(
        skill_id=TARGET,
        estimate=value,
        confidence=0.85,
        evidence_count=6,
        evidence_diversity=3,
        evidence_ids=("a", "b", "c"),
    )


def _state() -> LearnerState:
    return LearnerState(learner_id="maya", version=1, skills={TARGET: _est(0.30)})


def _attempt(mechanism: str, outcome: Outcome) -> Attempt:
    return Attempt(
        skill_id=TARGET,
        action=ActionKind.TEACH_BY_EXAMPLE,
        representation=mechanism,
        outcome=outcome,
        mechanism=mechanism,
    )


# --------------------------------------------------------------------------
# The memory outlives the process
# --------------------------------------------------------------------------


def test_a_second_session_knows_what_the_first_one_tried(tmp_path: Path) -> None:
    """THE HOLE. Without this every learner is a stranger on every run."""
    first = JournalledMemory.for_learner(tmp_path, "maya")
    first.record_attempt(_attempt("worked_example", Outcome.FAILURE))

    second = JournalledMemory.for_learner(tmp_path, "maya")
    assert second.failed_mechanisms(TARGET) == frozenset({"worked_example"})
    assert second.attempt_count(TARGET) == 1


def test_replaying_reconstructs_the_same_store(tmp_path: Path) -> None:
    """Replay, not snapshot-restore. A store rebuilt from the log must be
    indistinguishable from one that never stopped."""
    live = JournalledMemory.for_learner(tmp_path, "maya")
    for mechanism, outcome in (
        ("worked_example", Outcome.FAILURE),
        ("contrast", Outcome.PARTIAL),
        ("analogy", Outcome.DELIVERED),
    ):
        live.record_attempt(_attempt(mechanism, outcome))

    restored = replay(live.path)
    assert restored.attempts == live.attempts


def test_a_missing_journal_is_an_empty_learner_not_an_error(tmp_path: Path) -> None:
    """A first session has no file yet. Treating that as a failure would make
    the common case the exceptional one."""
    assert replay(tmp_path / "nobody.jsonl").attempts == []


def test_a_corrupt_line_refuses_to_load_rather_than_dropping_history(tmp_path: Path) -> None:
    """Loud beats lossy.

    A store that silently skips an unreadable record hands the engine a learner
    whose history is partly missing. It would then re-choose a mechanism that
    already failed and have no way to know.
    """
    path = tmp_path / "maya.jsonl"
    JournalledMemory(path).record_attempt(_attempt("worked_example", Outcome.FAILURE))
    with path.open("a", encoding="utf-8") as handle:
        handle.write('{"kind":"attempt","record":"{\\"skill_id\\":')  # truncated

    with pytest.raises(JournalError, match="incomplete"):
        replay(path)


def test_each_learner_gets_their_own_journal(tmp_path: Path) -> None:
    """One shared file needs every read to filter by learner, and the first
    forgotten filter mixes one learner's failures into another's."""
    JournalledMemory.for_learner(tmp_path, "maya").record_attempt(
        _attempt("worked_example", Outcome.FAILURE)
    )
    other = JournalledMemory.for_learner(tmp_path, "sam")
    assert other.failed_mechanisms(TARGET) == frozenset()


def test_a_blank_learner_id_is_refused(tmp_path: Path) -> None:
    with pytest.raises(JournalError, match="blank learner id"):
        JournalledMemory.for_learner(tmp_path, "   ")


def test_ids_that_sanitise_alike_do_not_share_a_journal(tmp_path: Path) -> None:
    """`maya/1` and `maya_1` both sanitise to `maya_1`.

    Without the digest they share a file, so one learner's failure history
    steers the other's teaching — silently, and in the direction of a mechanism
    that never failed on them.
    """
    JournalledMemory.for_learner(tmp_path, "maya/1").record_attempt(
        _attempt("worked_example", Outcome.FAILURE)
    )
    other = JournalledMemory.for_learner(tmp_path, "maya_1")
    assert other.failed_mechanisms(TARGET) == frozenset(), "two learners shared a journal"


def test_the_same_id_always_resolves_to_the_same_journal(tmp_path: Path) -> None:
    """A path that changed between runs would lose the learner every session,
    which is the bug this whole module exists to fix."""
    a = JournalledMemory.for_learner(tmp_path, "maya").path
    b = JournalledMemory.for_learner(tmp_path, "maya").path
    assert a == b


def test_reads_fall_through_to_the_store(tmp_path: Path) -> None:
    """Only the four writers are wrapped, so a read method added to
    `MemoryStore` tomorrow works here without being re-declared."""
    memory = JournalledMemory.for_learner(tmp_path, "maya")
    # SUCCESS, not PARTIAL: `succeeded_with` counts only outright successes.
    memory.record_attempt(_attempt("worked_example", Outcome.SUCCESS))
    assert memory.succeeded_with(TARGET) == frozenset({"worked_example"})


# --------------------------------------------------------------------------
# Delivering content is not the same as teaching successfully
# --------------------------------------------------------------------------


def test_delivered_neither_burns_a_mechanism_nor_clears_it() -> None:
    """DELIVERED must sit in neither set.

    Counting it as `worked` is what disabled exclusion; counting it as `failed`
    would burn a mechanism the learner has not even answered yet.
    """
    memory = MemoryStore()
    memory.record_attempt(_attempt("worked_example", Outcome.DELIVERED))
    assert memory.failed_mechanisms(TARGET) == frozenset()
    assert memory.succeeded_with(TARGET) == frozenset()


def test_a_delivered_then_failed_mechanism_is_burned() -> None:
    """THE BUG, at unit level. Before `DELIVERED` the first record was SUCCESS,
    so `failed - worked` was empty and nothing was ever excluded."""
    memory = MemoryStore()
    memory.record_attempt(_attempt("worked_example", Outcome.DELIVERED))
    memory.record_attempt(_attempt("worked_example", Outcome.FAILURE))
    assert memory.failed_mechanisms(TARGET) == frozenset({"worked_example"})


def test_a_genuine_success_still_clears_a_failure() -> None:
    """The asymmetry `_burned` exists for: something that failed once and worked
    later is an approach, not a failed approach."""
    memory = MemoryStore()
    memory.record_attempt(_attempt("worked_example", Outcome.FAILURE))
    memory.record_attempt(_attempt("worked_example", Outcome.SUCCESS))
    assert memory.failed_mechanisms(TARGET) == frozenset()


# --------------------------------------------------------------------------
# The whole loop, across process boundaries
# --------------------------------------------------------------------------


def _session(directory: Path) -> Turn:
    """One full turn from a memory rebuilt off disk, as a new process would."""
    state = _state()
    memory = JournalledMemory.for_learner(directory, "maya")
    bottleneck = select_bottleneck(GRAPH, state, memory, TARGET)
    assert isinstance(bottleneck, Bottleneck)

    turn = teach_next(
        GRAPH, memory, FakeLLMClient(), bottleneck, DiagnosisKind.CONCEPT_GAP,
        question="Why does a recursive function need a base case?",
        now=_now, learner_state=state,
    )
    assert isinstance(turn, Turn)

    if turn.status is TurnStatus.TAUGHT:
        # The learner gets it wrong.
        observe(
            PythonVerifier(GRAPH), memory,
            Task(
                task_id="t", skill_id=TARGET, prompt="p",
                checker="print('CHECK FAIL')",
                expected_evidence=EvidenceStrength.INDEPENDENT_APPLICATION,
            ),
            "def f(n): return f(n - 1)",
            Belief(estimate=_est(0.30)), turn.contract,
            now=_now, event_id="e", evidence_id="v",
        )
    return turn


def test_a_failing_learner_gets_a_different_mechanism_every_session(tmp_path: Path) -> None:
    """THE CLAIM THE WHOLE ENGINE RESTS ON, end to end and across restarts.

    Nothing is carried in memory between these calls -- each rebuilds its store
    from the file. If the strategies repeat, either persistence or exclusion is
    broken, and for the entire history of this codebase exclusion was.
    """
    seen = []
    for _ in range(4):
        turn = _session(tmp_path)
        if turn.status is not TurnStatus.TAUGHT:
            break
        seen.append(turn.contract.strategy.value)

    assert len(seen) == 4, seen
    assert len(set(seen)) == 4, f"repeated a mechanism across sessions: {seen}"


def test_running_out_of_mechanisms_is_visible_rather_than_a_silent_repeat(
    tmp_path: Path,
) -> None:
    """Section 46. Repeating blindly and repeating having run out are different
    things, and only the second lets a human be brought in."""
    for _ in range(12):
        turn = _session(tmp_path)
        if turn.status is TurnStatus.EXHAUSTED:
            break
    else:  # pragma: no cover - would mean exclusion never converges
        pytest.fail("never reported exhaustion; mechanisms are not being burned")

    assert turn.status is TurnStatus.EXHAUSTED
    assert any(r.value == "strategies_exhausted" for r in turn.decision.reasons)


def test_the_journal_records_the_whole_turn_not_just_the_answer(tmp_path: Path) -> None:
    """Both the teaching attempt and the learner's outcome have to survive. With
    only the second, the engine forgets what it tried; with only the first, it
    forgets how it went."""
    _session(tmp_path)
    restored = replay(JournalledMemory.for_learner(tmp_path, "maya").path)
    outcomes = [a.outcome for a in restored.attempts]
    assert Outcome.DELIVERED in outcomes
    assert Outcome.FAILURE in outcomes
    assert restored.evidence, "the learner's evidence did not survive"
