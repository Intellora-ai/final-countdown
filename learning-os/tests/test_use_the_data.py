"""Two fields that existed, were wired end to end, and were never filled.

Same defect twice, found by running the engine on a domain it had not seen:

  * `forbidden_phrases` held instruction sentences and the validator matched
    them as substrings, so the check fired only when the model quoted a rule
    back and never when it broke one.
  * `known_prerequisites` was a parameter with a default of `()`. Nothing
    derived it, so two learners differing only in prerequisite mastery got
    byte-identical contracts.

Neither had a failing test, because both were shaped correctly. A field that is
present, typed, threaded, and empty looks exactly like a field that works.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from learning_os.diagnosis import prerequisite_split, select_bottleneck
from learning_os.diagnosis.bottleneck import COMPETENT_ENOUGH, Bottleneck
from learning_os.domain.knowledge import ForbiddenSimplification
from learning_os.domain.python_recursion import GRAPH
from learning_os.llm.client import FakeLLMClient, GeneratedContent
from learning_os.llm.contract import DiagnosisKind, InstructionContract
from learning_os.llm.validation import ViolationKind, validate
from learning_os.memory.store import MemoryStore
from learning_os.models.contracts import LearnerState, SkillEstimate
from learning_os.policy import select_action
from learning_os.runtime import teach_next
from learning_os.runtime.loop import Turn

TARGET = "python.recursion.write_recursive_function"
NOW = datetime(2026, 1, 1, tzinfo=UTC)


def _now() -> datetime:
    return NOW


def _est(skill_id: str, value: float) -> SkillEstimate:
    return SkillEstimate(
        skill_id=skill_id,
        estimate=value,
        confidence=0.85,
        evidence_count=8,
        evidence_diversity=3,
        evidence_ids=("a", "b", "c"),
    )


def _state(**by_skill: float) -> LearnerState:
    skills = {s.replace("__", "."): _est(s.replace("__", "."), v) for s, v in by_skill.items()}
    return LearnerState(learner_id="l", version=1, skills=skills)


def _contract_for(state: LearnerState) -> InstructionContract:
    memory = MemoryStore()
    bottleneck = select_bottleneck(GRAPH, state, memory, TARGET)
    assert isinstance(bottleneck, Bottleneck), bottleneck
    return select_action(
        GRAPH, memory, bottleneck, DiagnosisKind.CONCEPT_GAP, question="q?"
    ).contract


# --------------------------------------------------------------------------
# The forbidden check fired on the wrong thing entirely
# --------------------------------------------------------------------------

BREAKS_THE_RULES = GeneratedContent(
    blocks=(
        (
            "prose",
            "Recursion just repeats the function over and over until it finishes. "
            "A base case is usually needed but you can often leave it out. "
            "The stack can hold as many calls as you like.",
        ),
    )
)


def _forbidden(contract: InstructionContract, content: GeneratedContent) -> list[str]:
    return [
        v.detail
        for v in validate(contract, content)
        if v.kind is ViolationKind.FORBIDDEN_PHRASE
    ]


def test_prose_that_breaks_the_rules_is_caught() -> None:
    """THE BUG. This exact prose produced ZERO forbidden violations before."""
    contract = _contract_for(_state(**{TARGET.replace(".", "__"): 0.30}))
    assert _forbidden(contract, BREAKS_THE_RULES), (
        "prose breaking all three forbidden rules passed the validator"
    )


def test_quoting_a_rule_is_not_itself_a_violation() -> None:
    """The old check's ONLY firing condition, now correctly silent.

    Matching instruction text against prose is backwards: it flags the model for
    repeating the rule and ignores it for breaking the rule.
    """
    contract = _contract_for(_state(**{TARGET.replace(".", "__"): 0.30}))
    assert contract.forbidden_phrases, "fixture assumes this concept has rules"
    echoes = GeneratedContent(blocks=(("prose", contract.forbidden_phrases[0]),))
    assert _forbidden(contract, echoes) == []


def test_the_rules_and_the_detectors_are_different_text() -> None:
    """If these ever become the same tuple, the vacuous check is back and every
    other test here still passes."""
    contract = _contract_for(_state(**{TARGET.replace(".", "__"): 0.30}))
    assert contract.forbidden_phrases
    assert contract.forbidden_tells
    assert set(contract.forbidden_phrases).isdisjoint(contract.forbidden_tells)


def test_every_rule_carries_at_least_one_detector() -> None:
    """A rule nobody can detect is a rule nobody enforces. Enumerates the whole
    graph so a newly authored rule without tells fails in CI."""
    for concept in GRAPH.concepts:
        for forbidden in concept.forbidden_simplifications:
            assert forbidden.tells, f"{concept.concept_id}: {forbidden.rule!r} has no tell"


def test_a_rule_without_a_detector_cannot_be_written() -> None:
    """Enforced by the schema, not by review. The unenforceable state is
    unrepresentable."""
    with pytest.raises(ValidationError):
        ForbiddenSimplification(rule="Do not say something false.", tells=())


def test_a_detector_as_long_as_the_rule_is_refused() -> None:
    """The obvious way to satisfy the schema without fixing anything: paste the
    rule into `tells`. That restores the original bug with the right shape."""
    rule = "Do not say recursion 'repeats' the function -- that is the loop misconception."
    with pytest.raises(ValidationError, match="not a marker"):
        ForbiddenSimplification(rule=rule, tells=(rule,))


def test_a_blank_detector_is_refused() -> None:
    """An empty string is a substring of everything, so it would flag every
    generation and be deleted within a day."""
    with pytest.raises(ValidationError, match="matches everything"):
        ForbiddenSimplification(rule="Do not say something false.", tells=("  ",))


# --------------------------------------------------------------------------
# known_prerequisites was threaded end to end and filled by nobody
# --------------------------------------------------------------------------


def test_prerequisites_split_by_what_the_learner_can_actually_do() -> None:
    prereqs = GRAPH.prerequisites_of(TARGET)
    assert len(prereqs) >= 2, "fixture assumes a real prerequisite chain"

    strong, weak = prereqs[0], prereqs[1]
    state = _state(**{strong.replace(".", "__"): 0.95, weak.replace(".", "__"): 0.20})

    known, still_weak = prerequisite_split(GRAPH, state, TARGET)
    assert strong in known
    assert weak in still_weak
    assert strong not in still_weak


def test_an_unevidenced_prerequisite_lands_in_neither_bucket() -> None:
    """"Never seen them do it" is not evidence either way. Putting it in either
    bucket states something the record does not support."""
    prereqs = GRAPH.prerequisites_of(TARGET)
    state = _state()  # nothing known at all
    known, weak = prerequisite_split(GRAPH, state, TARGET)
    for skill_id in prereqs:
        assert skill_id not in known
        assert skill_id not in weak


def test_the_split_uses_the_same_floor_as_bottleneck_selection() -> None:
    """Two thresholds for "competent" would let a skill be simultaneously not a
    bottleneck and not a known prerequisite."""
    prereqs = GRAPH.prerequisites_of(TARGET)
    just_over = _state(**{prereqs[0].replace(".", "__"): COMPETENT_ENOUGH})
    just_under = _state(**{prereqs[0].replace(".", "__"): COMPETENT_ENOUGH - 0.01})

    assert prereqs[0] in prerequisite_split(GRAPH, just_over, TARGET)[0]
    assert prereqs[0] in prerequisite_split(GRAPH, just_under, TARGET)[1]


def test_the_runtime_fills_the_contract_from_the_learner_state() -> None:
    """THE SECOND BUG. The field was threaded end to end and derived nowhere, so
    it stayed `()` unless a caller computed it by hand."""
    prereqs = GRAPH.prerequisites_of(TARGET)
    state = _state(
        **{TARGET.replace(".", "__"): 0.30, **{p.replace(".", "__"): 0.95 for p in prereqs}}
    )
    memory = MemoryStore()
    bottleneck = select_bottleneck(GRAPH, state, memory, TARGET)
    assert isinstance(bottleneck, Bottleneck)

    turn = teach_next(
        GRAPH, memory, FakeLLMClient(), bottleneck, DiagnosisKind.CONCEPT_GAP,
        question="q?", now=_now, learner_state=state,
    )
    assert isinstance(turn, Turn)
    assert turn.contract.known_prerequisites, "contract still empty with state supplied"


def test_two_learners_differing_only_in_prerequisites_get_different_contracts() -> None:
    """The point of the field. Before this they were byte-identical."""
    prereqs = GRAPH.prerequisites_of(TARGET)
    target_key = TARGET.replace(".", "__")

    strong = _state(**{target_key: 0.30, **{p.replace(".", "__"): 0.95 for p in prereqs}})
    shaky = _state(**{target_key: 0.30, **{p.replace(".", "__"): 0.20 for p in prereqs}})

    contracts = []
    for state in (strong, shaky):
        memory = MemoryStore()
        bottleneck = select_bottleneck(GRAPH, state, memory, TARGET)
        assert isinstance(bottleneck, Bottleneck)
        turn = teach_next(
            GRAPH, memory, FakeLLMClient(), bottleneck, DiagnosisKind.CONCEPT_GAP,
            question="q?", now=_now, learner_state=state,
        )
        assert isinstance(turn, Turn)
        contracts.append(turn.contract.known_prerequisites)

    assert contracts[0] != contracts[1], contracts
    assert contracts[0] and not contracts[1]


def test_an_explicit_value_is_not_overruled_by_the_stored_state() -> None:
    """A caller who knows something the record does not should win. Derivation
    fills a gap; it does not override a decision already made."""
    state = _state(**{TARGET.replace(".", "__"): 0.30})
    memory = MemoryStore()
    bottleneck = select_bottleneck(GRAPH, state, memory, TARGET)
    assert isinstance(bottleneck, Bottleneck)

    explicit = (GRAPH.prerequisites_of(TARGET)[0],)
    turn = teach_next(
        GRAPH, memory, FakeLLMClient(), bottleneck, DiagnosisKind.CONCEPT_GAP,
        question="q?", now=_now, learner_state=state, known_prerequisites=explicit,
    )
    assert isinstance(turn, Turn)
    assert turn.contract.known_prerequisites == explicit
