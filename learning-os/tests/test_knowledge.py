"""The knowledge graph, held to the properties the engine relies on.

The bottleneck engine walks this graph on every decision. A graph that admits a
cycle, a dangling prerequisite, or a subskill filed under the wrong concept does
not produce a wrong answer -- it produces a walk that never terminates, or one
that silently cannot reach a subskill. Both are far harder to notice than a
crash, so they are refused at construction.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from learning_os.domain.knowledge import (
    CognitiveOperation,
    Concept,
    KnowledgeGraph,
    Misconception,
    Subskill,
)
from learning_os.domain.python_recursion import GRAPH, KNOWLEDGE_VERSION
from learning_os.models.contracts import Verifiability


def _sub(skill_id: str, **over: object) -> Subskill:
    return Subskill(
        skill_id=skill_id,
        name=over.pop("name", "a subskill"),  # type: ignore[arg-type]
        operation=over.pop("operation", CognitiveOperation.APPLY),  # type: ignore[arg-type]
        **over,  # type: ignore[arg-type]
    )


def _concept(concept_id: str, subs: tuple[Subskill, ...], **over: object) -> Concept:
    return Concept(
        concept_id=concept_id,
        name=over.pop("name", "a concept"),  # type: ignore[arg-type]
        definition=over.pop("definition", "a definition"),  # type: ignore[arg-type]
        subskills=subs,
        **over,  # type: ignore[arg-type]
    )


# --------------------------------------------------------------------------
# Structure the engine depends on
# --------------------------------------------------------------------------


def test_a_prerequisite_cycle_is_refused() -> None:
    """A cycle means there is no order in which these can be taught.

    Caught at construction because the runtime symptom is not an exception --
    it is a tutor recursing forever looking for something to teach first.
    """
    a = _sub("x.c.a", prerequisites=("x.c.b",))
    b = _sub("x.c.b", prerequisites=("x.c.a",))
    with pytest.raises(ValidationError, match="prerequisite cycle"):
        KnowledgeGraph(version="v", concepts=(_concept("x.c", (a, b)),))


def test_a_diamond_is_not_a_cycle() -> None:
    """Two subskills sharing one foundation is normal and must be allowed.

    The naive "have I seen this node" cycle check reports a false positive here,
    which would make most real prerequisite graphs unconstructable.
    """
    base = _sub("x.c.base")
    left = _sub("x.c.left", prerequisites=("x.c.base",))
    right = _sub("x.c.right", prerequisites=("x.c.base",))
    top = _sub("x.c.top", prerequisites=("x.c.left", "x.c.right"))
    g = KnowledgeGraph(version="v", concepts=(_concept("x.c", (base, left, right, top)),))
    assert len(g.teachable_order()) == 4


def test_a_prerequisite_nothing_defines_is_refused() -> None:
    with pytest.raises(ValidationError, match="which no concept defines"):
        KnowledgeGraph(
            version="v",
            concepts=(_concept("x.c", (_sub("x.c.a", prerequisites=("x.c.ghost",)),)),),
        )


def test_a_subskill_filed_under_the_wrong_concept_is_refused() -> None:
    """The id prefix is what links a subskill back to its concept. A mismatch
    detaches it from every lookup the engine does."""
    with pytest.raises(ValidationError, match="does not belong to it"):
        _concept("x.c", (_sub("y.other.a"),))


def test_a_subskill_cannot_cite_an_undefined_misconception() -> None:
    """A dangling id reads as a repaired misconception rather than a missing
    one -- the engine attaches it and then finds nothing to repair."""
    with pytest.raises(ValidationError, match="does not define"):
        _concept("x.c", (_sub("x.c.a", misconceptions=("x.c.nope",)),))


def test_a_concept_must_have_at_least_one_subskill() -> None:
    """A concept with no subskills can never be the bottleneck, so it can never
    be taught -- it would be invisible to the engine while looking present."""
    with pytest.raises(ValidationError):
        _concept("x.c", ())


# --------------------------------------------------------------------------
# Traversal
# --------------------------------------------------------------------------


def test_prerequisites_come_back_nearest_first() -> None:
    """When a learner is blocked, the thing to check is the immediate
    prerequisite, not the deepest. Order is what lets the bottleneck engine
    stop at the first weak link."""
    a = _sub("x.c.a")
    b = _sub("x.c.b", prerequisites=("x.c.a",))
    c = _sub("x.c.c", prerequisites=("x.c.b",))
    g = KnowledgeGraph(version="v", concepts=(_concept("x.c", (a, b, c)),))
    assert g.prerequisites_of("x.c.c") == ("x.c.b", "x.c.a")


def test_teachable_order_never_places_a_skill_before_its_prerequisite() -> None:
    order = GRAPH.teachable_order()
    position = {skill: i for i, skill in enumerate(order)}
    for concept in GRAPH.concepts:
        for sub in concept.subskills:
            for pre in sub.prerequisites:
                assert position[pre] < position[sub.skill_id], (
                    f"{sub.skill_id} is placed before its prerequisite {pre}"
                )


def test_teachable_order_is_deterministic() -> None:
    """Two runs must agree, or a replayed decision reads a different graph than
    the one that produced it."""
    assert GRAPH.teachable_order() == GRAPH.teachable_order()


def test_lookup_by_skill_finds_its_concept() -> None:
    assert GRAPH.concept_of("python.recursion.trace_calls") is not None
    assert GRAPH.concept_of("python.recursion.trace_calls").concept_id == "python.recursion"  # type: ignore[union-attr]
    assert GRAPH.subskill("python.recursion.trace_calls") is not None
    assert GRAPH.subskill("nope.nope.nope") is None


# --------------------------------------------------------------------------
# The V1 subject itself
# --------------------------------------------------------------------------


def test_the_v1_graph_is_valid_and_versioned() -> None:
    assert GRAPH.version == KNOWLEDGE_VERSION
    assert len(GRAPH.concepts) == 2


def test_recursion_subskills_are_genuinely_different_operations() -> None:
    """The whole reason this concept was chosen: its subskills come apart in
    practice. If they all shared one cognitive operation the bottleneck engine
    would have nothing to distinguish."""
    recursion = next(c for c in GRAPH.concepts if c.concept_id == "python.recursion")
    ops = {s.operation for s in recursion.subskills}
    assert len(ops) >= 4, f"only {len(ops)} distinct operations: {ops}"


def test_explaining_termination_is_not_claimed_machine_checkable() -> None:
    """Verifiability is per SUBSKILL, not per subject.

    Within one Python concept, writing a base case can be checked by running
    the code; explaining why it terminates cannot. A single per-domain flag
    would let the second borrow the first's confidence.
    """
    explain = GRAPH.subskill("python.recursion.explain_termination")
    assert explain is not None
    assert explain.verifiability is Verifiability.HUMAN_REVIEW_REQUIRED

    write = GRAPH.subskill("python.recursion.write_recursive_function")
    assert write is not None
    assert write.verifiability is Verifiability.VERIFIABLE


def test_every_misconception_predicts_a_specific_error() -> None:
    """A misconception that does not predict an observable mistake is a label,
    not a diagnosis -- there is no evidence that could ever detect it."""
    for concept in GRAPH.concepts:
        for m in concept.misconceptions:
            assert m.predicts_error.strip(), f"{m.misconception_id} predicts nothing"
            assert len(m.predicts_error) > 20, (
                f"{m.misconception_id}: '{m.predicts_error}' is too vague to detect"
            )


def test_recursion_forbids_the_simplifications_that_teach_falsehoods() -> None:
    """These are the things it is tempting to say when a learner is struggling,
    each of which leaves them holding something untrue."""
    recursion = next(c for c in GRAPH.concepts if c.concept_id == "python.recursion")
    forbidden = " ".join(recursion.forbidden_simplifications).lower()
    assert "repeats" in forbidden, "the loop misconception must be forbidden explicitly"
    assert "optional" in forbidden, "calling the base case optional must be forbidden"


def test_the_knowledge_model_cannot_be_mutated() -> None:
    """Invariant 6: the LLM cannot mutate the canonical knowledge model.

    Enforced by the objects being frozen, so a writable reference cannot be
    handed out by accident.
    """
    recursion = next(c for c in GRAPH.concepts if c.concept_id == "python.recursion")
    with pytest.raises(ValidationError):
        recursion.definition = "something the model made up"  # type: ignore[misc]


def test_a_misconception_id_is_a_reference_not_prose() -> None:
    """Same rule as the learner model: ids, never free text, so a diagnosis
    cannot be written where a misconception belongs."""
    with pytest.raises(ValidationError):
        Misconception(
            misconception_id="the student is lazy",
            statement="s",
            predicts_error="e",
        )


def test_verifiability_defaults_to_the_conservative_value() -> None:
    """The default must be the one that under-claims.

    It was VERIFIABLE, which meant a subskill asserted machine-checkability by
    saying nothing. For a field whose only job is stopping a claim borrowing
    confidence it did not earn, that is backwards: a permissive default fails
    silently, a strict one fails visibly and gets corrected.
    """
    bare = _sub("x.c.a")
    assert bare.verifiability is Verifiability.HUMAN_REVIEW_REQUIRED


def test_recognition_skills_are_not_claimed_executable() -> None:
    """Both were marked VERIFIABLE purely by omission. Picking a base case out
    of a function runs nothing, so nothing can be executed to check it."""
    for skill_id in (
        "python.recursion.identify_base_case",
        "python.functions.missing_return_is_none",
    ):
        sub = GRAPH.subskill(skill_id)
        assert sub is not None
        assert sub.verifiability is Verifiability.HUMAN_REVIEW_REQUIRED, skill_id


def test_executable_skills_say_so_deliberately() -> None:
    """The other side: asserting checkability is now an explicit act."""
    for skill_id in (
        "python.recursion.trace_calls",
        "python.recursion.repair_missing_base_case",
        "python.recursion.write_recursive_function",
        "python.recursion.apply_to_nested_structure",
    ):
        sub = GRAPH.subskill(skill_id)
        assert sub is not None
        assert sub.verifiability is Verifiability.VERIFIABLE, skill_id
