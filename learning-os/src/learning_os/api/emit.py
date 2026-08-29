"""Emitting a lesson the canvas will accept.

THERE IS NO SECOND SCHEMA, AND THAT IS THE MAIN DESIGN DECISION
---------------------------------------------------------------
The canvas already defines `LessonSpec` in `frontend/src/canvas/spec/spec.ts`,
with `LessonInput` (what a model writes, defaults optional) and `Lesson` (what
the validator returns, defaults filled). `validateLesson` is the adapter, at the
canvas edge.

This module emits `LessonInput`-shaped JSON and nothing else. A third shape on
the engine side would be one more thing to keep in step with two others, and when
it drifted the same payload would render differently depending which door it came
in through. So the Zod schema is the contract and this file is a producer of it,
not a peer definition of it.

WHAT MAY NOT BE EMITTED, EVER
-----------------------------
`x`, `y`, `width`, `height`, colour, font size, spacing, alignment, radius.
Laws 2 and 3. But the canvas owner's rule is broader and is the one that actually
binds: **the spec may not state anything the canvas can derive.** Beats,
ordering by importance, and representation choice are the same category as
position -- if the canvas can compute it, the engine stating it IS the engine
positioning. So no beats are emitted, and no step counts.

WHY `emphasis` AND `relations` ARE NOT DECORATION
-------------------------------------------------
The canvas derives beats from them. Twelve blocks left at the default
`supporting` with no relations produce one twelve-block beat -- a lecture, which
is the exact failure the beat system exists to prevent. So this module always
sets emphasis deliberately and always emits relations when it has them, rather
than treating both as optional metadata.

VALIDATION HERE IS A COURTESY, NOT THE GATE
-------------------------------------------
`validateLesson` in the browser is the gate. The checks in this file exist so a
malformed payload fails where the engine is still in the stack and can say which
contract produced it, instead of failing in a renderer where the payload is all
anyone can see.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from learning_os.llm.client import GeneratedContent
from learning_os.llm.contract import InstructionContract
from learning_os.llm.validation import BLOCK_KINDS

#: `^[a-z0-9][a-z0-9-]*$`, 1..64 -- copied from the Zod `Id`. Duplicated across a
#: language boundary, which is why it is CHECKED here rather than assumed: an id
#: the canvas would refuse fails in Python with the contract that produced it in
#: hand.
_ID = re.compile(r"^[a-z0-9][a-z0-9-]*$")
MAX_ID = 64
MAX_QUESTION = 200
MAX_PROSE = 2000
MAX_BLOCKS = 24
MAX_RELATIONS = 48

#: The three emphasis values. A scale would invite `emphasis: 7`; three words
#: cannot be averaged, which is the point.
EMPHASIS = ("primary", "supporting", "aside")

#: Relation kinds. `supports` says B is evidence for A -- NOT that B sits below A.
RELATION_KINDS = ("supports", "derives", "contrasts", "exemplifies")

#: The kinds this emitter can actually BUILD from a `(kind, text)` pair.
#:
#: NOT `BLOCK_KINDS`, and conflating the two was a real bug that shipped.
#:
#: `BLOCK_KINDS` lists what the canvas has a RENDERER for -- eight kinds. This
#: lists what a sentence of prose is sufficient to construct, which is two. A
#: `table` needs `columns` and `rows`; a `chart` needs `series`; an `equation`
#: needs its latex. The emitter built all eight the same way, as
#: `{id, kind, emphasis, body}`, so a model returning ("table", "a sentence")
#: produced a table-shaped hole that Zod refuses with
#: `Unrecognized key(s) in object: 'body'`.
#:
#: The old check tested that the kind had a NAME the canvas knew, and inferred
#: from that that the payload was renderable. Those are different properties,
#: and only the first was ever verified -- the cross-language fixture happens to
#: use WORKED_EXAMPLE, which is all prose, so the broken path had no coverage.
#:
#: Emitting a kind whose data was never supplied is fabricating structure on the
#: model's behalf. Refusing is the only honest option: an empty table is not a
#: lesser table, it is a claim about content that does not exist.
TEXT_BLOCK_KINDS = frozenset({"prose", "callout"})

#: Where a block's ONE SENTENCE goes, per kind.
#:
#: Slot 2 of a block is always "the sentence"; slot 3 is always "the structure".
#: Different kinds spell the sentence differently -- `prose` calls it `body`, a
#: `summary` calls it `mentalModel`, a `flow` calls it `caption` -- and this map
#: is that spelling, declared once. It is a NAMING table, not an inference: the
#: emitter never chooses which sentence a block gets, only what the canvas calls
#: the field it lands in.
#:
#: A kind absent from this map has no single-sentence field at all, and is
#: buildable only from structured data.
PROSE_FIELD: dict[str, str] = {
    "prose": "body",
    "callout": "body",
    "summary": "mentalModel",
    "flow": "caption",
}

#: The roles the canvas knows, mirroring `spec/roles.ts`.
#:
#: Checked here rather than left to Zod because the failure modes differ in
#: kind: a bad role from this emitter is a bug in this repository, and it should
#: be named here with the offending value rather than surfacing in a browser as
#: a strict-parse refusal against the whole document.
#:
#: WHY ROLE IS TAKEN FROM THE MODEL AND NEVER INFERRED. `checkArc` reads `role`
#: to find the definition and the summary, and every block defaulting to
#: `support` is precisely why every engine lesson failed `no-definition` and
#: `no-summary` and had to be held at `answer` level. The obvious repair --
#: "first block is the definition, last is the summary" -- would assert an
#: ordering the model never claimed, which is the same fabrication as emitting
#: an empty table. So the model declares it, or it stays `support`.
BLOCK_ROLES = frozenset(
    {
        "anchor",
        "definition",
        "notation",
        "framework",
        "classification",
        "component",
        "rule",
        "restriction",
        "contrast",
        "misconception",
        "example",
        "summary",
        "support",
    }
)

#: Fields the emitter consumes itself rather than passing through to the block.
_RESERVED = frozenset({"role", "terms", "kind", "id", "emphasis"})


class EmitError(ValueError):
    """The payload would have been refused by the canvas.

    Raised rather than returned because, unlike a contract violation, there is no
    partial recovery: a lesson the schema rejects is not a worse lesson, it is
    nothing at all. `.strict()` means one bad key refuses the whole document.
    """


@dataclass(frozen=True, slots=True)
class Lesson:
    """A `LessonInput`-shaped payload, ready to serialise.

    A dataclass rather than a dict so the emitter cannot silently grow a field
    the canvas does not know about -- `.strict()` would refuse the whole lesson,
    and the error would surface in a browser rather than here.
    """

    id: str
    question: str
    blocks: tuple[dict[str, object], ...]
    relations: tuple[dict[str, str], ...] = ()
    subject: str | None = None

    def as_payload(self) -> dict[str, object]:
        """The dict to serialise.

        `subject` is omitted rather than sent as None when absent: it is
        `Label.optional()` in Zod, and `optional` accepts a missing key, not a
        null. Sending null fails `.strict()` parsing for a field that was meant
        to be skipped.

        `relations` is always present, even empty. It has a `.default([])`, so
        omitting it is legal -- but an explicit empty list distinguishes "this
        lesson has no relations" from "the emitter forgot", and those have very
        different consequences for beats.
        """
        payload: dict[str, object] = {
            "id": self.id,
            "question": self.question,
            "blocks": list(self.blocks),
            "relations": list(self.relations),
        }
        if self.subject is not None:
            payload["subject"] = self.subject
        return payload


def slug(text: str, *, fallback: str = "lesson") -> str:
    """A lowercase kebab-case id the canvas will accept.

    Ids come from skill ids and block roles, which contain dots and underscores
    the Zod pattern refuses. Generated rather than hand-written because a
    hand-written id is a per-lesson opportunity to break the whole payload.
    """
    cleaned = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    cleaned = re.sub(r"-{2,}", "-", cleaned)[:MAX_ID]
    if not cleaned or not _ID.match(cleaned):
        return fallback
    return cleaned


def emit(contract: InstructionContract, content: GeneratedContent) -> Lesson:
    """Turn validated content into a payload the canvas will render.

    Takes content that has ALREADY passed `llm.validation.validate`. This is not
    a second gate on the model -- it is the translation step, and mixing the two
    would mean a schema problem and a teaching problem arriving through the same
    error path with the same shape.
    """
    if not content.blocks:
        raise EmitError("no blocks: `blocks` is min(1) and an empty lesson renders nothing")
    if len(content.blocks) > MAX_BLOCKS:
        raise EmitError(f"{len(content.blocks)} blocks exceeds the canvas maximum of {MAX_BLOCKS}")

    question = contract.question.strip()
    if not question or len(question) > MAX_QUESTION:
        raise EmitError(f"question must be 1..{MAX_QUESTION} characters, got {len(question)}")

    lesson_id = slug(contract.target_skill, fallback="lesson")
    blocks: list[dict[str, object]] = []
    seen: set[str] = set()

    for index, block in enumerate(content.blocks):
        # Indexed, not unpacked: slot 3 is optional (see `GeneratedContent`), and
        # a two-name unpack would raise ValueError on a structured block.
        kind = block[0]
        body = block[1]
        extra: dict[str, object] = dict(block[2]) if len(block) > 2 else {}

        if kind not in BLOCK_KINDS:
            raise EmitError(
                f"block kind {kind!r} has no renderer; the schema is strict and "
                f"would refuse the whole lesson"
            )

        prose_field = PROSE_FIELD.get(kind)
        structural = {k: v for k, v in extra.items() if k not in _RESERVED}

        if kind not in TEXT_BLOCK_KINDS and not structural:
            # Known to the canvas, and still not buildable from a sentence
            # alone. Naming both facts, because "has no renderer" would be wrong
            # here and would send whoever hits this looking in the wrong
            # language.
            raise EmitError(
                f"block kind {kind!r} needs structured data this emitter was not "
                f"given; only {sorted(TEXT_BLOCK_KINDS)} can be built from text. "
                f"The model claimed a {kind} and supplied prose."
            )

        text = body.strip()
        if not text and kind in TEXT_BLOCK_KINDS:
            raise EmitError(f"block {index} has empty body; `Prose` is min(1)")
        if len(text) > MAX_PROSE:
            raise EmitError(f"block {index} body is {len(text)} chars, over the {MAX_PROSE} limit")

        block_id = slug(f"{kind}-{index}", fallback=f"b{index}")
        if block_id in seen:
            raise EmitError(
                f"duplicate block id {block_id!r}; relations would bind to the wrong one"
            )
        seen.add(block_id)

        role = str(extra.get("role", "support"))
        if role not in BLOCK_ROLES:
            raise EmitError(
                f"block {index} declares role {role!r}, which the canvas does not "
                f"know; roles are {sorted(BLOCK_ROLES)}"
            )

        built: dict[str, object] = {
            "id": block_id,
            "kind": kind,
                # EMPHASIS IS SET DELIBERATELY, NEVER LEFT TO THE DEFAULT.
                #
                # The canvas derives beats from emphasis and relations. Leaving
                # everything at the default `supporting` collapses the lesson
                # into one beat -- a lecture, which is the failure the beat
                # system exists to prevent. The first block carries the idea, so
                # it is primary; the rest support it.
            "emphasis": "primary" if index == 0 else "supporting",
            # THE ROLE THE MODEL DECLARED, never one this emitter guessed.
            "role": role,
        }
        if prose_field is not None and text:
            built[prose_field] = text
        if extra.get("terms"):
            built["terms"] = extra["terms"]
        built.update(structural)
        blocks.append(built)

    relations = _relations_over(blocks)
    return Lesson(id=lesson_id, question=question, blocks=tuple(blocks), relations=relations)


def _relations_over(blocks: list[dict[str, object]]) -> tuple[dict[str, str], ...]:
    """How the later blocks relate to the first.

    `supports` says the later block is EVIDENCE FOR the first -- it is a semantic
    claim, not a layout instruction, and the canvas decides where that puts
    anything. Emitting these rather than leaving `relations` empty is what lets
    the beat system split a lesson at all.

    Deliberately conservative: only relations that are actually true of this
    content. Inventing `derives` or `contrasts` to make the graph look richer
    would be the engine asserting structure it does not have, and the canvas
    would render that assertion faithfully.
    """
    if len(blocks) < 2:
        return ()
    primary = str(blocks[0]["id"])
    out = [
        {"from": str(b["id"]), "to": primary, "kind": "supports"}
        for b in blocks[1:]
    ]
    return tuple(out[:MAX_RELATIONS])
