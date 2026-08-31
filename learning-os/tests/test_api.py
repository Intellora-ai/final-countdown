"""The emitter, held to the canvas's schema rather than to a copy of it.

Every constant here was read out of `frontend/src/canvas/spec/spec.ts`. The
duplication across a language boundary is real and is why these tests exist: when
the Zod schema changes, something has to fail on the Python side, and it should
be here rather than in a browser where the payload is all anyone can see.
"""

from __future__ import annotations

import json

import pytest

from learning_os.api import TEXT_BLOCK_KINDS, EmitError, Lesson, emit, slug
from learning_os.llm.client import GeneratedContent
from learning_os.llm.contract import DiagnosisKind, InstructionContract, Strategy
from learning_os.llm.validation import BLOCK_KINDS
from learning_os.models.contracts import ActionKind

SKILL = "python.recursion.identify_base_case"


def _contract(**over: object) -> InstructionContract:
    base: dict[str, object] = {
        "target_skill": SKILL,
        "question": "Why does a recursive function need a base case?",
        "diagnosis": DiagnosisKind.CONCEPT_GAP,
        "strategy": Strategy.WORKED_EXAMPLE,
        "action": ActionKind.TEACH_BY_EXAMPLE,
        "success_evidence_required": "learner identifies the base case unaided",
    }
    base.update(over)
    return InstructionContract(**base)  # type: ignore[arg-type]


def _content(*blocks: tuple[str, str]) -> GeneratedContent:
    return GeneratedContent(blocks=blocks or (("prose", "a body"),))


# --------------------------------------------------------------------------
# The shape the canvas will accept
# --------------------------------------------------------------------------


def test_the_payload_has_exactly_the_schemas_top_level_keys() -> None:
    """`.strict()` refuses the WHOLE lesson on one unknown key, so an extra field
    is not a degraded render -- it is nothing rendered at all."""
    payload = emit(_contract(), _content()).as_payload()
    assert set(payload) <= {"id", "question", "blocks", "relations", "subject"}
    assert {"id", "question", "blocks", "relations"} <= set(payload)


def test_an_absent_subject_is_omitted_rather_than_null() -> None:
    """`Label.optional()` accepts a MISSING key, not a null. Sending null fails
    parsing for a field that was meant to be skipped."""
    assert "subject" not in emit(_contract(), _content()).as_payload()


def test_relations_are_always_present_even_when_empty() -> None:
    """It has a `.default([])` so omitting it is legal. Explicit empty
    distinguishes "no relations" from "the emitter forgot" -- and those have very
    different consequences, because beats are derived from relations."""
    assert emit(_contract(), _content()).as_payload()["relations"] == []


def test_the_payload_is_json_serialisable() -> None:
    """It crosses a process boundary. A tuple or an enum surviving into the
    payload fails at the transport rather than here."""
    json.dumps(emit(_contract(), _content(("prose", "a"), ("callout", "b"))).as_payload())


# --------------------------------------------------------------------------
# Ids
# --------------------------------------------------------------------------


def test_ids_are_lowercase_kebab_case() -> None:
    """Skill ids carry dots and underscores, which the Zod `Id` pattern refuses.
    Generated rather than hand-written, because a hand-written id is a per-lesson
    chance to break the whole payload."""
    lesson = emit(_contract(), _content(("prose", "a"), ("callout", "b")))
    assert lesson.id == "python-recursion-identify-base-case"
    for block in lesson.blocks:
        assert isinstance(block["id"], str)
        assert block["id"].replace("-", "").isalnum()
        assert block["id"] == block["id"].lower()


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("python.recursion.trace_calls", "python-recursion-trace-calls"),
        ("Already Kebab", "already-kebab"),
        ("__leading_and_trailing__", "leading-and-trailing"),
        ("multiple___underscores", "multiple-underscores"),
        ("!!!", "lesson"),
        ("", "lesson"),
    ],
)
def test_slug_handles_what_real_ids_actually_contain(raw: str, expected: str) -> None:
    assert slug(raw) == expected


def test_block_ids_are_unique() -> None:
    """Relations bind by id. A duplicate would silently attach a relation to the
    wrong block, and the canvas would render that faithfully."""
    lesson = emit(_contract(), _content(("prose", "a"), ("prose", "b"), ("prose", "c")))
    ids = [b["id"] for b in lesson.blocks]
    assert len(set(ids)) == len(ids)


# --------------------------------------------------------------------------
# emphasis and relations are load-bearing, not metadata
# --------------------------------------------------------------------------


def test_emphasis_is_set_deliberately_rather_than_defaulted() -> None:
    """THE FAILURE THIS PREVENTS IS A LECTURE.

    The canvas derives beats from emphasis and relations. Every block left at the
    default `supporting` with no relations collapses into one beat — which is
    exactly the thing the step-by-step system exists to prevent.
    """
    lesson = emit(_contract(), _content(("prose", "a"), ("callout", "b"), ("prose", "c")))
    assert lesson.blocks[0]["emphasis"] == "primary"
    assert {b["emphasis"] for b in lesson.blocks[1:]} == {"supporting"}


def test_relations_are_emitted_so_the_lesson_can_be_split() -> None:
    lesson = emit(_contract(), _content(("prose", "a"), ("callout", "b"), ("prose", "c")))
    assert len(lesson.relations) == 2
    for rel in lesson.relations:
        assert rel["kind"] == "supports"
        assert rel["to"] == lesson.blocks[0]["id"]


def test_a_single_block_lesson_has_no_relations() -> None:
    """Nothing to relate. Inventing one would be the engine asserting structure
    it does not have, and the canvas would render the assertion."""
    assert emit(_contract(), _content(("prose", "only"))).relations == ()


def test_only_supports_is_emitted() -> None:
    """`derives` and `contrasts` would make the graph look richer and would be
    claims this content does not support."""
    lesson = emit(_contract(), _content(("prose", "a"), ("prose", "b")))
    assert {r["kind"] for r in lesson.relations} == {"supports"}


# --------------------------------------------------------------------------
# Nothing the canvas can derive, and nothing about style
# --------------------------------------------------------------------------


def test_no_geometry_or_style_field_reaches_the_payload() -> None:
    """Laws 2 and 3, asserted over the serialised bytes rather than the fields.

    Checking the dataclass would only prove the fields this version has are
    clean; checking the JSON catches one added later inside a block dict, which
    is where it would actually appear.
    """
    # Two prose blocks rather than prose + chart. A chart cannot be built from a
    # sentence and is now refused outright, so passing one here would have
    # tested the refusal path instead of Laws 2 and 3 -- and would have passed
    # for a reason that has nothing to do with geometry. See `test_emit.py`.
    payload = json.dumps(emit(_contract(), _content(("prose", "a"), ("prose", "b"))).as_payload())
    for banned in (
        '"x"', '"y"', '"width"', '"height"', '"top"', '"left"',
        '"color"', '"colour"', '"fontSize"', '"font_size"', '"spacing"',
        '"padding"', '"margin"', '"align"', '"radius"',
    ):
        assert banned not in payload, f"{banned} reached the payload"


def test_no_beat_or_step_count_reaches_the_payload() -> None:
    """The canvas derives beats. The engine stating them is the engine
    positioning, and a count is a promise about a decision not yet made."""
    payload = json.dumps(emit(_contract(), _content(("prose", "a"), ("prose", "b"))).as_payload())
    for banned in ('"beat"', '"beats"', '"step"', '"steps"', '"total"', '"index"', '"order"'):
        assert banned not in payload, f"{banned} reached the payload"


# --------------------------------------------------------------------------
# Refusals — loud, in Python, with the contract still in hand
# --------------------------------------------------------------------------


def test_an_unrenderable_block_kind_is_refused() -> None:
    with pytest.raises(EmitError, match="no renderer"):
        emit(_contract(), _content(("hologram", "x")))


def test_an_empty_lesson_is_refused() -> None:
    with pytest.raises(EmitError, match=r"min\(1\)|no blocks"):
        emit(_contract(), GeneratedContent(blocks=()))


def test_an_empty_block_body_is_refused() -> None:
    """`Prose` is min(1). A whitespace-only body passes a truthiness check and
    fails the schema."""
    with pytest.raises(EmitError, match="empty body"):
        emit(_contract(), _content(("prose", "   ")))


def test_too_many_blocks_is_refused() -> None:
    with pytest.raises(EmitError, match="maximum"):
        emit(_contract(), GeneratedContent(blocks=tuple(("prose", f"b{i}") for i in range(25))))


def test_an_over_long_body_is_refused() -> None:
    with pytest.raises(EmitError, match="over the"):
        emit(_contract(), _content(("prose", "x" * 2001)))


def test_every_canvas_block_kind_is_built_or_refused_but_never_faked() -> None:
    """REWRITTEN, BECAUSE THE OLD VERSION ASSERTED THE BUG.

    It read: "a kind the canvas renders but this emitter refuses is a
    capability lost silently". That is true for `callout` and false for
    `table` -- and it made a BROKEN capability look like a working one. The
    emitter built all eight kinds as `{id, kind, emphasis, body}`, so `table`
    "succeeded" here and was then refused by Zod with `Unrecognized key(s) in
    object: 'body'` the moment the canvas actually imported one.

    The real property is not that every kind can be emitted. It is that every
    kind is either built correctly or refused loudly -- never mis-built. A
    capability genuinely missing is worth knowing about; this test now says
    which kinds those are instead of hiding them behind a pass.
    """
    built: list[str] = []
    refused: list[str] = []

    for kind in sorted(BLOCK_KINDS):
        try:
            lesson = emit(_contract(), _content((kind, "body")))
        except EmitError:
            refused.append(kind)
            continue
        assert lesson.blocks[0]["kind"] == kind
        built.append(kind)

    assert built == sorted(TEXT_BLOCK_KINDS), built
    # Named explicitly rather than derived, so ADDING a real builder for one of
    # these has to come here and delete it from the list -- which is the moment
    # to notice the capability arrived.
    #
    # Four kinds joined this list rather than the one above, and that is the
    # test working rather than the test being loosened. `figure`,
    # `misconception`, `reasoning` and `summary` became renderable on the canvas
    # and were added to `BLOCK_KINDS`; the emitter cannot build any of them,
    # because `emit` produces `{id, kind, emphasis, body}` and none of the four
    # is a body-carrying block. `misconception` needs wrong/correct/why,
    # `reasoning` needs justified steps, `summary` needs a progression, and
    # `figure` needs a shape payload.
    #
    # So each is REFUSED loudly instead of mis-built -- which is the exact
    # property this test exists to hold, and the growth of this list is the
    # honest record of four capabilities the engine does not yet have.
    assert refused == [
        "chart",
        "equation",
        "figure",
        "flow",
        "metric",
        "misconception",
        "reasoning",
        "simulation",
        "summary",
        "table",
    ], refused


def test_the_lesson_is_frozen() -> None:
    lesson = emit(_contract(), _content())
    with pytest.raises((AttributeError, TypeError)):
        lesson.id = "something-else"  # type: ignore[misc]


def test_two_identical_inputs_emit_identical_payloads() -> None:
    """Ids are derived, never generated randomly. A random id would make every
    payload differ and every diff useless."""
    a = emit(_contract(), _content(("prose", "a"), ("prose", "b")))
    b = emit(_contract(), _content(("prose", "a"), ("prose", "b")))
    assert a == b
    assert isinstance(a, Lesson)
