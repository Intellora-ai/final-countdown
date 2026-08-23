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

    for index, (kind, body) in enumerate(content.blocks):
        if kind not in BLOCK_KINDS:
            raise EmitError(
                f"block kind {kind!r} has no renderer; the schema is strict and "
                f"would refuse the whole lesson"
            )
        text = body.strip()
        if not text:
            raise EmitError(f"block {index} has empty body; `Prose` is min(1)")
        if len(text) > MAX_PROSE:
            raise EmitError(f"block {index} body is {len(text)} chars, over the {MAX_PROSE} limit")

        block_id = slug(f"{kind}-{index}", fallback=f"b{index}")
        if block_id in seen:
            raise EmitError(
                f"duplicate block id {block_id!r}; relations would bind to the wrong one"
            )
        seen.add(block_id)

        blocks.append(
            {
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
                "body": text,
            }
        )

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
