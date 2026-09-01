"""What the emitter may build, versus what the canvas can render.

Those are two different sets and the code treated them as one. `BLOCK_KINDS`
names the eight kinds the canvas has a renderer for; the emitter constructs
every block the same way, as `{id, kind, emphasis, body}`, which is only a
valid shape for two of them. The check that existed verified the kind had a
NAME the canvas knew and inferred from that that the payload was renderable.

The defect shipped, and the reason it shipped is the interesting part: the
committed cross-language fixture is emitted under WORKED_EXAMPLE, whose blocks
are all prose. The one strategy with a fixture was the one that worked.

So these tests enumerate `Strategy` rather than sampling it.
"""

from __future__ import annotations

import pathlib
import re
from learning_os.api.ask import MAX_QUESTION as ENDPOINT_MAX_QUESTION
from learning_os.api.emit import MAX_QUESTION as EMIT_MAX_QUESTION
from learning_os.llm.contract import MAX_LESSON_QUESTION

import pytest

from learning_os.api.emit import PROSE_FIELD, TEXT_BLOCK_KINDS, EmitError, emit
from learning_os.llm.client import FakeLLMClient, GeneratedContent
from learning_os.llm.contract import DiagnosisKind, InstructionContract, Strategy
from learning_os.llm.validation import BLOCK_KINDS
from learning_os.models.contracts import ActionKind

# --------------------------------------------------------------------------
# A kind the canvas KNOWS is not the same as a kind this emitter can BUILD
# --------------------------------------------------------------------------


@pytest.mark.parametrize("strategy", list(Strategy))
def test_no_strategy_emits_a_block_the_canvas_would_refuse(strategy: Strategy) -> None:
    """THE BUG THIS CATCHES SHIPPED.

    `BLOCK_KINDS` lists what the canvas has a renderer for; the emitter builds
    every block as `{id, kind, emphasis, body}`. Those agree for `prose` and
    `callout` and for nothing else -- a `table` needs columns and rows. The fake
    named a table for CONTRAST, the emitter built it out of a sentence, and the
    canvas refused the lesson with `Unrecognized key(s) in object: 'body'`.

    Nothing caught it because the committed cross-language fixture is emitted
    under WORKED_EXAMPLE, which is all prose. Enumerating `Strategy` rather than
    spot-checking one is the whole point: the broken path was the one nobody
    had a fixture for.
    """
    contract = InstructionContract(
        target_skill="python.recursion.identify_base_case",
        question="q?",
        diagnosis=DiagnosisKind.CONCEPT_GAP,
        strategy=strategy,
        action=ActionKind.TEACH_BY_EXAMPLE,
        success_evidence_required="e",
    )
    content = FakeLLMClient().generate(contract)
    # `.blocks` rather than `as_payload()["blocks"]`: the payload is
    # `dict[str, Any]` for JSON's sake, so indexing it hands mypy an `object`
    # and the loop below stops being checked at all.
    for block in emit(contract, content).blocks:
        kind = str(block["kind"])

        # 1. THE RENDERER EXISTS. Unchanged in force from the original check.
        assert kind in BLOCK_KINDS, (
            f"{strategy.value} emitted a {kind} the canvas has no renderer for"
        )

        # 2. THE EXACT BUG THAT SHIPPED, now asserted directly rather than by
        #    proxy. `body` on a kind whose schema has no `body` field is what
        #    produced `Unrecognized key(s) in object: 'body'` against a strict
        #    parser. The old check inferred this from "kind is prose or
        #    callout", which was true of the emitter then and stopped being true
        #    when the emitter learned to build structured kinds -- so the proxy
        #    began refusing blocks the canvas demonstrably accepts.
        if "body" in block:
            assert PROSE_FIELD.get(kind) == "body", (
                f"{strategy.value} emitted a {kind} carrying `body`, which its "
                f"schema does not define; a strict parse refuses the whole lesson"
            )

        # 3. NOTHING IS FABRICATED. A kind that cannot be built from a sentence
        #    must carry the structure it claims, or it is a shaped hole.
        if kind not in TEXT_BLOCK_KINDS:
            structural = set(block) - {"id", "kind", "emphasis", "role", "terms"}
            assert structural, (
                f"{strategy.value} emitted a {kind} with no structural fields; "
                f"an empty {kind} is not a lesser {kind}, it is a claim about "
                f"content that does not exist"
            )


def test_a_structured_kind_supplied_as_prose_is_refused_not_faked() -> None:
    """Refusing beats degrading.

    Emitting an empty table would satisfy the schema and tell the learner that
    a comparison exists which nobody wrote. A raise puts the problem in front of
    whoever can fix it, in the language that produced it.
    """
    contract = InstructionContract(
        target_skill="python.recursion.identify_base_case",
        question="q?",
        diagnosis=DiagnosisKind.CONCEPT_GAP,
        strategy=Strategy.WORKED_EXAMPLE,
        action=ActionKind.TEACH_BY_EXAMPLE,
        success_evidence_required="e",
    )
    faked = GeneratedContent(blocks=(("table", "two things differ"),))
    with pytest.raises(EmitError, match="structured data"):
        emit(contract, faked)


def test_the_two_kind_sets_are_deliberately_different() -> None:
    """If these are ever made equal, the bug is back.

    A future edit that "tidies" `TEXT_BLOCK_KINDS` into `BLOCK_KINDS` restores
    exactly the defect above, and every other test here would still pass.
    """
    assert TEXT_BLOCK_KINDS < BLOCK_KINDS, "text kinds must be a strict subset"
    assert "table" in BLOCK_KINDS and "table" not in TEXT_BLOCK_KINDS


# --------------------------------------------------------------------------
# One number, in four places, in two languages
# --------------------------------------------------------------------------
def test_every_cap_on_a_question_is_the_same_number() -> None:
    """The canvas, the emitter, the contract and the endpoint must agree.

    THE BUG THIS WOULD HAVE CAUGHT ON THE DAY IT WAS WRITTEN. Three of these
    said 200 and `api/ask.py` said 400. A learner could send 300 characters,
    the endpoint accepted them, and the answer came back quoting a question cut
    to 199 -- one they had not asked. Raising the other three to 400 instead is
    not available: `spec.ts` is the wire format the canvas validates against,
    and Python does not get to widen it unilaterally.

    `spec.ts` is READ rather than restated. A number copied into this file
    would be a fifth place to drift, which is the failure being tested for.
    """
    spec = (
        pathlib.Path(__file__).resolve().parents[2]
        / "frontend"
        / "src"
        / "canvas"
        / "spec"
        / "spec.ts"
    )
    assert spec.is_file(), f"the canvas spec is not where this test looks: {spec}"

    found = re.search(r"question:\s*z\.string\(\)\.min\(1\)\.max\((\d+)\)", spec.read_text())
    assert found is not None, (
        f"no `question` length rule found in {spec.name}; if the canvas stopped "
        f"bounding it, the Python caps below are no longer mirroring anything"
    )
    canvas = int(found.group(1))

    assert MAX_LESSON_QUESTION == canvas, (
        f"the LLM contract permits {MAX_LESSON_QUESTION} characters and the "
        f"canvas permits {canvas}; the model can be told to write a title the "
        f"canvas will refuse to render"
    )
    assert EMIT_MAX_QUESTION == canvas, (
        f"the emitter permits {EMIT_MAX_QUESTION} and the canvas {canvas}"
    )
    assert ENDPOINT_MAX_QUESTION == canvas, (
        f"the endpoint advertises {ENDPOINT_MAX_QUESTION} characters and everything "
        f"downstream permits {canvas}, so a question between the two is accepted "
        f"and then silently cut"
    )
