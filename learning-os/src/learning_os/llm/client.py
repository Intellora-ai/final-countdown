"""The model boundary: an interface, a deterministic fake, and no live calls.

WHY THE FAKE IS THE DEFAULT AND THE REAL CLIENT IS THE EXCEPTION
---------------------------------------------------------------
A test suite that needs a real model is a suite that gets skipped the first time
a key expires or a rate limit hits. The tests that then stop running are exactly
the ones asserting the engine does not fabricate confidence -- so the checks
guarding against overconfident output are the first casualties of an outage. That
is backwards, and it is why `FakeLLMClient` is not a testing convenience but the
reference implementation of the boundary.

DETERMINISM IS A PROPERTY, NOT A SHORTCUT
-----------------------------------------
The same contract must produce the same content, every run, on every machine.
Without that, a failing assertion about generated output cannot be distinguished
from sampling noise, and the response is to loosen the assertion until it stops
failing -- which removes the check rather than the bug. So the fake derives its
output from a hash of the contract: stable across processes (no PYTHONHASHSEED
dependence, because `hashlib` is used rather than `hash()`), and different
contracts genuinely produce different content.

FAILURE IS SIMULATED BECAUSE FAILURE IS NORMAL
----------------------------------------------
Real providers time out, refuse, rate-limit, and return malformed output. Code
that has only ever seen success handles none of it, and discovers this in front
of a learner. `FailureMode` makes each of those reproducible, so the runtime's
behaviour under them is a test rather than a hope.

CREDENTIALS
-----------
No key is read here, and no default endpoint exists. When a real provider is
added it reads `LEARNING_OS_LLM_API_KEY` from the environment at call time. A key
is never a constructor default, never a module constant, and never committed --
`learning-os.yml` greps for an assigned value on every run.
"""

from __future__ import annotations

import hashlib
import os
from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol, runtime_checkable

from learning_os.llm.contract import InstructionContract, Strategy

#: Read at call time by a real provider adapter, if one is ever added. Named here
#: so there is exactly one spelling of it in the codebase; the value is never
#: stored, defaulted, or logged.
API_KEY_ENV = "LEARNING_OS_LLM_API_KEY"

#: The same rule, for Google's provider.
#:
#: A SECOND VARIABLE RATHER THAN A SHARED ONE, AND THAT IS THE WHOLE POINT.
#: One `LEARNING_OS_LLM_API_KEY` read by every adapter makes the two providers
#: mutually exclusive on one machine, and -- worse -- means the first switch
#: between them sends one vendor's credential to the other vendor's endpoint.
#: A key disclosed to the wrong party is disclosed; there is no undo that does
#: not involve rotation. Separate names make that mistake unreachable rather
#: than unlikely.
GEMINI_API_KEY_ENV = "LEARNING_OS_GEMINI_API_KEY"


class LLMUnavailable(RuntimeError):
    """The model could not be reached, or refused.

    Distinct from "the model returned something unusable", which is a validation
    failure and reaches the caller as violations rather than an exception. The
    difference decides the runtime's next move: unavailable means retry or fall
    back to a non-generated intervention; unusable means the contract was not
    honoured and the generation should be repaired or regenerated.
    """


class FailureMode(StrEnum):
    """Ways a provider fails, made reproducible.

    `MALFORMED` and `CONSTRAINT_VIOLATION` are the two that matter most and the
    two a naive fake omits, because they are the failures where the call
    SUCCEEDS and the output is still wrong. Code that only simulates timeouts is
    untested against the common case.
    """

    NONE = "none"
    TIMEOUT = "timeout"
    REFUSAL = "refusal"
    RATE_LIMIT = "rate_limit"
    #: Returns content that is not the shape the caller expects.
    MALFORMED = "malformed"
    #: Returns well-formed content that breaks the contract -- omits a required
    #: term, or introduces more concepts than the budget allows.
    CONSTRAINT_VIOLATION = "constraint_violation"


@dataclass(frozen=True, slots=True)
class GeneratedContent:
    """What the model produced, before anything has checked it.

    Named for what it is. Calling it `Explanation` would invite treating it as
    usable on arrival, and the entire reason the validator exists is that it is
    not usable until checked.

    `blocks` are (kind, text) pairs rather than a rendered structure: the model
    supplies prose and says what sort of block it belongs in, and the emitter
    turns that into `LessonInput`. The model never builds the wire format --
    that keeps Law 1 true at the boundary rather than by convention.

    THE OPTIONAL THIRD SLOT, AND WHY IT IS A SLOT RATHER THAN A RESHAPE
    -------------------------------------------------------------------
    A pair carries everything a `prose` or `callout` block needs and nothing
    else. That was not a simplification -- it was the whole ceiling. The canvas
    reads `role` to decide which block is the DEFINITION and which is the
    SUMMARY, reads `terms` to know what survives a skim, and needs real columns
    or steps before it will call anything shown. None of those fit in a pair,
    so `emit` could build two of eleven kinds and every engine lesson was held
    at `answer` level: no definition, no summary, nothing shown.

    The third slot is a mapping of the fields that pair could not carry. It is
    OPTIONAL and additive on purpose: seventeen modules read `.blocks`, and a
    reshape would have rewritten all of them to buy the same capability. A
    two-tuple still means exactly what it meant before.

    It stays the MODEL'S declaration, never the emitter's inference. Deciding
    positionally that the first block is the definition would fabricate
    semantics on the model's behalf, which is the same failure as emitting an
    empty table -- a claim about content nobody supplied.
    """

    blocks: tuple[tuple[str, str] | tuple[str, str, Mapping[str, object]], ...]
    #: The concepts the model believes it introduced. Self-reported, therefore
    #: evidence and not truth -- the validator counts independently and the two
    #: are compared. A model that under-reports is exactly the case worth
    #: catching.
    introduced_concepts: tuple[str, ...] = ()
    #: Free-form provider detail. Never parsed for meaning.
    note: str = ""

    @property
    def text(self) -> str:
        """All generated prose, for substring checks."""
        return "\n".join(block[1] for block in self.blocks)


@runtime_checkable
class LLMClient(Protocol):
    """One method, because the boundary should be narrow.

    A wider interface -- `summarise`, `classify`, `judge` -- would invite the
    model back into decisions the engine must own. It generates language inside a
    contract. Everything else is somebody else's job.
    """

    def generate(self, contract: InstructionContract) -> GeneratedContent: ...


#: The closing arc every strategy owes, and the reason it is shared.
#:
#: `checkArc` in the canvas reads `role` to find the DEFINITION and the SUMMARY,
#: and `nothing-is-shown` refuses a lesson made only of words. Those three
#: properties are structural, not stylistic: they are true of every good lesson
#: regardless of which strategy produced it, so they belong in one place rather
#: than repeated eleven times with eleven chances to drift.
#:
#: This does NOT make the fake a convincing explanation, and it must not. The
#: prose stays deliberately flat. What changes is that the fake now exercises
#: the SHAPE the emitter has to be able to build -- which is the whole thing
#: Batch 4 was measuring, and which prose-only skeletons could never reach.
_TEACHING_TAIL: tuple[tuple[str, str, dict[str, object]], ...] = (
    (
        "flow",
        "The same three steps, laid out rather than described.",
        {
            "role": "framework",
            "nodes": [
                {"id": "start", "label": "the case you are given"},
                {"id": "check", "label": "the question that decides"},
                {"id": "done", "label": "the case that stops"},
            ],
            "links": [
                {"from": "start", "to": "check"},
                {"from": "check", "to": "done"},
            ],
        },
    ),
    (
        "summary",
        "One case that stops is what keeps the rest finite.",
        {
            "role": "summary",
            "progression": [
                "take the case you are given",
                "ask the question that decides",
                "stop at the case that needs no further work",
            ],
        },
    ),
)

#: Prose skeletons per strategy. Deliberately thin: the fake exists to be
#: predictable and to exercise the validator, NOT to imitate a good explanation.
#: A convincing fake is worse than an obvious one -- it invites judging the
#: system's teaching quality from output no model produced.
#:
#: The opening block of each carries `role: "definition"` and one marked term.
#: Both are DECLARATIONS the model makes, never inferences the emitter draws --
#: see `api/emit.BLOCK_ROLES` for why that distinction is load-bearing.
_SKELETONS: dict[Strategy, tuple[tuple[str, str] | tuple[str, str, dict[str, object]], ...]] = {
    Strategy.WORKED_EXAMPLE: (
        ("prose", "Here is one worked case of {skill}, start to finish.", {"role": "definition"}),
        ("prose", "Each step follows from the one before it."),
    ),
    Strategy.BROKEN_EXAMPLE_REPAIR: (
        ("prose", "This attempt at {skill} is wrong in exactly one place.", {"role": "definition"}),
        ("callout", "Find the one line that has to change."),
    ),
    Strategy.TRANSFER_CHALLENGE: (
        ("prose", "Same principle as {skill}, different surface.", {"role": "definition"}),
        ("callout", "Nothing here is new; only the wrapping is."),
    ),
    Strategy.CONTRAST: (
        ("prose", "Two cases that look alike and are not.", {"role": "definition"}),
        # `callout`, not `table`. The fake has no columns or rows to give, and a
        # fake that names a kind it cannot fill teaches the emitter to fabricate
        # one -- which is exactly what it did until the canvas refused the result.
        ("callout", "The difference is the single line that disagrees."),
    ),
    Strategy.DECOMPOSITION: (
        ("prose", "{skill} is three smaller things. Here is the first.", {"role": "definition"}),
    ),
    Strategy.ANALOGY: (
        ("prose", "{skill} behaves like something already familiar.", {"role": "definition"}),
        ("callout", "Where the analogy stops holding."),
    ),
    Strategy.GUIDED_REASONING: (
        ("prose", "Work through {skill} one decision at a time.", {"role": "definition"}),
    ),
    Strategy.PREREQUISITE_REPAIR: (
        ("prose", "Before {skill}, the piece underneath it.", {"role": "definition"}),
    ),
    Strategy.MISCONCEPTION_REPAIR: (
        (
            "prose",
            "A common belief about {skill}, and the case that breaks it.",
            {"role": "definition"},
        ),
        ("callout", "What is true instead."),
    ),
    Strategy.CHANGE_REPRESENTATION: (
        ("prose", "{skill}, in a different form this time.", {"role": "definition"}),
        ("callout", "The same thing laid out rather than described."),
    ),
    Strategy.NEW_CONTEXT: (
        ("prose", "{skill} again, somewhere it has not been seen.", {"role": "definition"}),
    ),
}


@dataclass(frozen=True, slots=True)
class FakeLLMClient:
    """A deterministic stand-in that obeys contracts, or fails on purpose.

    Two jobs, and the second is the one a naive fake misses:

      * produce stable, contract-respecting content so the rest of the engine
        can be tested end to end without a network;
      * produce specific, reproducible BAD output, so the validator and the
        runtime's repair path are tested against real failures rather than
        assumed to work.
    """

    failure: FailureMode = FailureMode.NONE

    def generate(self, contract: InstructionContract) -> GeneratedContent:
        if self.failure is FailureMode.TIMEOUT:
            raise LLMUnavailable("the model did not respond within the deadline")
        if self.failure is FailureMode.REFUSAL:
            raise LLMUnavailable("the model refused to generate for this contract")
        if self.failure is FailureMode.RATE_LIMIT:
            raise LLMUnavailable("rate limited")
        if self.failure is FailureMode.MALFORMED:
            # An empty block list. Well-typed, entirely unusable -- the shape of
            # failure that a `try/except` around the call does not catch.
            return GeneratedContent(blocks=(), note="malformed")

        skill = contract.target_skill.rsplit(".", 1)[-1].replace("_", " ")
        skeleton = _SKELETONS[contract.strategy]
        budget = contract.simplicity.max_blocks
        # THE BUDGET TRIMS THE MIDDLE, NEVER THE ARC.
        #
        # Slicing the whole list would cut the summary off first, because it is
        # last -- and a lesson that stops rather than ending is exactly the
        # `no-summary` failure this batch exists to remove. The opening
        # definition and the closing pair are what make the thing a lesson; the
        # blocks between them are what a tight budget is actually asking to
        # lose.
        # THE ARC IS APPENDED ONLY WHEN THE BUDGET HAS ROOM FOR IT.
        #
        # `policy/select.py` sets `max_blocks=1` for a learner under cognitive
        # load, with the reason code DECOMPOSED_FOR_LOAD. That is a deliberate
        # decision about a person who is already struggling, and appending two
        # more blocks anyway would overrule it -- the validator would then refuse
        # the whole turn for BLOCK_BUDGET, which is how this was discovered.
        #
        # So a tight budget still produces an ANSWER rather than a full lesson,
        # exactly as before. What changed is that a normal budget now produces a
        # lesson instead of being unable to.
        arc = _TEACHING_TAIL if budget >= len(_TEACHING_TAIL) + 1 else ()
        room = max(1, budget - len(arc))
        # Indexed rather than unpacked, for the same reason `emit` is: only the
        # opening block of each skeleton carries a third slot, so a fixed-arity
        # unpack would raise on every plain pair that follows it.
        blocks = [(block[0], block[1].format(skill=skill), *block[2:]) for block in skeleton[:room]]
        # Required terms are guaranteed to survive, but they are MERGED into the
        # last core block rather than given a block of their own.
        #
        # WHY THIS STOPPED BEING A BLOCK. It cost a slot, and the slot was the
        # one carrying the strategy. With a budget of four, a definition, a
        # terms block, a flow and a summary left exactly ONE block for the
        # strategy's own content -- so WORKED_EXAMPLE and CONTRAST both came out
        # as (prose, prose, flow, summary), and `test_demo` correctly refused two
        # lessons that differed only in wording. The engine's decision has to
        # survive into the SHAPE, or the emitter has flattened the decision.
        #
        # Merging keeps the guarantee -- the terms are still in the text, so the
        # validator's passing path is still exercised -- and gives the slot back.
        if contract.required_terms and blocks:
            last = blocks[-1]
            carried: dict[str, object] = dict(last[2]) if len(last) > 2 else {}
            # The merged sentence lists the terms verbatim, so marking the first
            # of them is a statement about text that is demonstrably present --
            # which is exactly what `marked-term-absent` checks. Without this the
            # merged block carries no mark at all and `nothing-marked` fires.
            carried.setdefault("terms", [{"text": contract.required_terms[0], "mark": "key"}])
            blocks[-1] = (
                last[0],
                last[1] + " Terms that stay: " + ", ".join(contract.required_terms) + ".",
                carried,
            )

        # A MARK IS ONLY HONEST WHERE THE WORD IS ACTUALLY THERE.
        #
        # `marked-term-absent` fires when a block claims a marked term its body
        # does not contain, and a static table cannot know: each strategy words
        # its opening differently, and only some mention the skill at all. So
        # the mark is attached HERE, where the formatted sentence is in hand,
        # and only to blocks that really say the word.
        #
        # `nothing-marked` applies to prose and callout above a word threshold,
        # so short blocks are left alone rather than given a mark to satisfy a
        # checker -- which is the behaviour that rule was written to prevent.
        marked: list[tuple[str, str] | tuple[str, str, dict[str, object]]] = []
        for block in blocks:
            kind, body = block[0], block[1]
            extra: dict[str, object] = dict(block[2]) if len(block) > 2 else {}
            if kind in {"prose", "callout"} and "terms" not in extra and skill in body:
                extra["terms"] = [{"text": skill, "mark": "key"}]
            marked.append((kind, body, extra) if extra else (kind, body))
        blocks = marked

        blocks.extend(arc)

        if self.failure is FailureMode.CONSTRAINT_VIOLATION:
            # Well-formed, and breaks the contract two ways at once: it omits
            # every required term and introduces more concepts than the budget.
            # Both are silent without a validator, which is the point.
            return GeneratedContent(
                blocks=(("prose", "Something adjacent, using none of the required words."),),
                introduced_concepts=tuple(f"extra_concept_{i}" for i in range(4)),
                note="constraint_violation",
            )

        return GeneratedContent(
            blocks=tuple(blocks),
            introduced_concepts=(skill,),
            note=f"fake:{contract.strategy.value}:{_fingerprint(contract)}",
        )


def _fingerprint(contract: InstructionContract) -> str:
    """A stable short digest of a contract.

    `hashlib`, not `hash()`. The builtin is randomised per process unless
    PYTHONHASHSEED is pinned, so a fake built on it would produce different
    output on a developer's machine than in CI -- and "works locally, differs in
    CI" is the single most expensive kind of nondeterminism to chase.
    """
    payload = contract.model_dump_json().encode("utf-8")
    return hashlib.sha256(payload).hexdigest()[:12]


def api_key_present() -> bool:
    """Whether a real provider could be configured right now.

    Returns a bool and never the value, so a key cannot reach a log, an error
    message, or a test failure through this function. Nothing in the engine calls
    it yet -- it exists so that when a provider adapter is added, the check that
    already exists is the safe one.
    """
    return bool(os.environ.get(API_KEY_ENV))
