"""The seam: a real diagnosis driving a real lesson, with nothing stubbed.

WHY THIS FILE HAS TO EXIST SEPARATELY

`test_diagnosis.py` proves the bottleneck engine picks correctly against fixture
learners. `test_policy.py` and `test_runtime.py` prove the teaching loop behaves
against a four-field stand-in that satisfies `BottleneckLike` structurally.
Both suites are honest and both would stay green through the one failure that
matters most here: the real `Bottleneck` drifting out of `BottleneckLike`.

Neither suite can catch it, because neither one ever holds both objects. The
stand-in cannot drift -- it is defined to match. The real class is never handed
to the loop. So the drift lives exactly in the gap between two green suites,
which is the shape of defect this project has now hit three times: a check that
passes because of the configuration it runs in rather than because the thing
under it is right.

THE ASSERTION THAT EARNS ITS PLACE

`bottleneck.skill_id != TARGET`. Without it this file passes against an engine
that simply echoes back the skill it was asked about, which is the failure the
whole diagnosis module exists to avoid and the one an end-to-end test is most
likely to wave through.
"""

from __future__ import annotations

from datetime import UTC, datetime

from learning_os.api import emit
from learning_os.diagnosis import Bottleneck, select_bottleneck
from learning_os.domain.knowledge import CognitiveOperation
from learning_os.domain.python_recursion import GRAPH
from learning_os.llm.client import FakeLLMClient
from learning_os.llm.contract import DiagnosisKind
from learning_os.memory.store import MemoryStore
from learning_os.models.contracts import LearnerState, SkillEstimate
from learning_os.policy import BottleneckLike
from learning_os.runtime import TurnStatus, teach_once

TRACE = "python.recursion.trace_calls"
BASE_CASE = "python.recursion.identify_base_case"
TARGET = "python.recursion.write_recursive_function"

FIXED_NOW = datetime(2026, 1, 1, tzinfo=UTC)


def _now() -> datetime:
    return FIXED_NOW


def _estimate(skill: str, value: float) -> SkillEstimate:
    """A well-evidenced estimate.

    `evidence_ids` is not decoration: `SkillEstimate._updates_cite_evidence`
    refuses a state off `unknown` without it, which is the contract saying an
    estimate must carry what moved it.
    """
    return SkillEstimate(
        skill_id=skill,
        estimate=value,
        confidence=0.85,
        evidence_count=6,
        evidence_diversity=3,
        evidence_ids=tuple(f"ev-{skill}-{i}" for i in range(6)),
        state="developing" if value < 0.8 else "competent",
    )


def _learner() -> LearnerState:
    """Strong at tracing, weak at the base case, middling at the target.

    Shaped so the answer is not the lowest number and not the named target:
    `identify_base_case` at 0.2 is a PREREQUISITE of the target, and an engine
    that sorts by estimate or echoes the request gets a different answer than an
    engine that reasons about what the target depends on.

    `skills` is a DICT keyed by skill id, not a tuple of estimates -- pydantic
    refuses the tuple, and the field reads either way at a glance.
    """
    return LearnerState(
        learner_id="l1",
        version=1,
        skills={
            e.skill_id: e
            for e in (
                _estimate(TRACE, 0.9),
                _estimate(BASE_CASE, 0.2),
                _estimate(TARGET, 0.4),
            )
        },
    )


# --------------------------------------------------------------------------
# The seam itself
# --------------------------------------------------------------------------


def test_a_real_bottleneck_drives_a_real_lesson() -> None:
    """Diagnosis -> policy -> generation -> validation -> emitted lesson.

    Every module is the real one. The only fake is the LLM, which is fake by
    design rather than by convenience: a suite that needs a live model is a
    suite that stops running the first time a key expires.
    """
    found = select_bottleneck(GRAPH, _learner(), MemoryStore(), TARGET)

    assert isinstance(found, Bottleneck), (
        f"a learner weak at a prerequisite has a bottleneck, got {found!r}"
    )
    assert found.skill_id != TARGET, (
        "the engine returned the skill it was asked about. A diagnosis that "
        "echoes the target is not a diagnosis -- the point is to name the thing "
        "BLOCKING the target."
    )
    assert found.skill_id == BASE_CASE, (
        f"expected the weak prerequisite, got {found.skill_id}"
    )

    # The structural claim the policy relies on, asserted against the real
    # class rather than a stand-in built to satisfy it.
    assert isinstance(found, BottleneckLike)

    turn = teach_once(
        GRAPH,
        MemoryStore(),
        FakeLLMClient(),
        found,
        DiagnosisKind.PREREQUISITE_GAP,
        question="Why does a recursive function need a base case?",
        now=_now,
    )

    assert turn.status is TurnStatus.TAUGHT, (
        f"the loop did not teach: {turn.status} with {len(turn.violations)} violation(s)"
    )
    assert turn.content is not None

    lesson = emit(turn.contract, turn.content)
    assert lesson is not None


def test_the_real_bottleneck_satisfies_the_protocol_the_policy_declares() -> None:
    """Stated on its own, so a drift reports as an interface break.

    Inside the end-to-end test above, a `Bottleneck` that stopped satisfying
    `BottleneckLike` would surface as a confusing failure somewhere inside
    `teach_once`. Here it names itself.

    Checked on an INSTANCE, not with `issubclass`: a `runtime_checkable`
    Protocol whose members are properties rejects `issubclass` outright, and
    `skill_id`/`confidence`/`needs_diagnostic` are exactly that. The instance
    check is also the stronger claim -- it verifies the attributes are really
    there, rather than that a class was annotated as though they were.
    """
    found = select_bottleneck(GRAPH, _learner(), MemoryStore(), TARGET)
    assert isinstance(found, Bottleneck)
    assert isinstance(found, BottleneckLike)


def test_a_confident_diagnosis_lets_the_policy_skip_the_diagnostic() -> None:
    """`needs_diagnostic` crossing the boundary and changing what happens.

    This is the field whose whole purpose is to be read by another module. A
    test that only checked it was set would pass on an engine whose value is
    ignored downstream.
    """
    found = select_bottleneck(GRAPH, _learner(), MemoryStore(), TARGET)
    assert isinstance(found, Bottleneck), found
    assert found.needs_diagnostic is False, (
        "six pieces of evidence at 0.85 confidence is enough to act on; asking "
        "another question here is interrogation, not teaching"
    )

    turn = teach_once(
        GRAPH,
        MemoryStore(),
        FakeLLMClient(),
        found,
        DiagnosisKind.PREREQUISITE_GAP,
        question="Why does a recursive function need a base case?",
        now=_now,
    )
    assert turn.status is TurnStatus.TAUGHT
    # The decision names why it went this way. `ASKED_FOR_A_DIAGNOSTIC` would
    # mean the policy read `needs_diagnostic` and disagreed with it.
    assert turn.decision.reasons, "a decision with no reasons cannot be reviewed"


# --------------------------------------------------------------------------
# The enum, enumerated rather than spot-checked
# --------------------------------------------------------------------------


def test_every_cognitive_operation_has_a_hypothesis_kind() -> None:
    """A missing operation is a `KeyError` in front of a learner.

    `_KIND_BY_OPERATION` is read with a bare `[]` on purpose -- a default would
    invent a plausible-looking diagnosis for an operation nobody mapped. The
    cost is that the failure lands at runtime, so the enum is enumerated here
    instead of spot-checked: this fails the day a ninth operation is added,
    in CI, which is the only place that discovery is cheap.
    """
    from learning_os.diagnosis.bottleneck import _KIND_BY_OPERATION

    missing = [op.name for op in CognitiveOperation if op not in _KIND_BY_OPERATION]
    assert missing == [], (
        f"cognitive operation(s) with no hypothesis kind: {missing}. "
        "A diagnosis for a subskill using one would raise KeyError mid-turn."
    )


def test_diagnosis_does_not_define_a_second_failure_enum() -> None:
    """One enum of failure kinds across the whole engine.

    This module once declared its own `HypothesisKind` with the same ten
    members as `llm.contract.DiagnosisKind`, which `policy.select` routes on.
    Byte-identical, and nothing kept them so -- an eleventh member added to
    either would have produced a diagnosis this side could name and the policy
    could not route, with both suites green throughout.

    Asserted by identity rather than by comparing members, because two enums
    that happen to match today is the exact state this is here to forbid.
    """
    from learning_os.diagnosis import bottleneck

    assert bottleneck.HypothesisKind is DiagnosisKind
