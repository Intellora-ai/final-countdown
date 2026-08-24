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

import pytest

from learning_os.api.emit import TEXT_BLOCK_KINDS, EmitError, emit
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
        assert block["kind"] in TEXT_BLOCK_KINDS, (
            f"{strategy.value} emitted a {block['kind']} built from prose; "
            f"the canvas refuses it"
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
