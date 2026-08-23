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
from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol, runtime_checkable

from learning_os.llm.contract import InstructionContract, Strategy

#: Read at call time by a real provider adapter, if one is ever added. Named here
#: so there is exactly one spelling of it in the codebase; the value is never
#: stored, defaulted, or logged.
API_KEY_ENV = "LEARNING_OS_LLM_API_KEY"


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
    """

    blocks: tuple[tuple[str, str], ...]
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
        return "\n".join(body for _, body in self.blocks)


@runtime_checkable
class LLMClient(Protocol):
    """One method, because the boundary should be narrow.

    A wider interface -- `summarise`, `classify`, `judge` -- would invite the
    model back into decisions the engine must own. It generates language inside a
    contract. Everything else is somebody else's job.
    """

    def generate(self, contract: InstructionContract) -> GeneratedContent: ...


#: Prose skeletons per strategy. Deliberately thin: the fake exists to be
#: predictable and to exercise the validator, NOT to imitate a good explanation.
#: A convincing fake is worse than an obvious one -- it invites judging the
#: system's teaching quality from output no model produced.
_SKELETONS: dict[Strategy, tuple[tuple[str, str], ...]] = {
    Strategy.WORKED_EXAMPLE: (
        ("prose", "Here is one worked case of {skill}, start to finish."),
        ("prose", "Each step follows from the one before it."),
    ),
    Strategy.BROKEN_EXAMPLE_REPAIR: (
        ("prose", "This attempt at {skill} is wrong in exactly one place."),
        ("callout", "Find the one line that has to change."),
    ),
    Strategy.TRANSFER_CHALLENGE: (
        ("prose", "Same principle as {skill}, different surface."),
        ("callout", "Nothing here is new; only the wrapping is."),
    ),
    Strategy.CONTRAST: (
        ("prose", "Two cases that look alike and are not."),
        ("table", "The difference is the single row that disagrees."),
    ),
    Strategy.DECOMPOSITION: (
        ("prose", "{skill} is three smaller things. Here is the first."),
    ),
    Strategy.ANALOGY: (
        ("prose", "{skill} behaves like something already familiar."),
        ("callout", "Where the analogy stops holding."),
    ),
    Strategy.GUIDED_REASONING: (
        ("prose", "Work through {skill} one decision at a time."),
    ),
    Strategy.PREREQUISITE_REPAIR: (
        ("prose", "Before {skill}, the piece underneath it."),
    ),
    Strategy.MISCONCEPTION_REPAIR: (
        ("prose", "A common belief about {skill}, and the case that breaks it."),
        ("callout", "What is true instead."),
    ),
    Strategy.CHANGE_REPRESENTATION: (
        ("prose", "{skill}, in a different form this time."),
        ("table", "The same thing laid out rather than described."),
    ),
    Strategy.NEW_CONTEXT: (
        ("prose", "{skill} again, somewhere it has not been seen."),
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
        blocks = [(kind, body.format(skill=skill)) for kind, body in skeleton[:budget]]

        if self.failure is FailureMode.CONSTRAINT_VIOLATION:
            # Well-formed, and breaks the contract two ways at once: it omits
            # every required term and introduces more concepts than the budget.
            # Both are silent without a validator, which is the point.
            return GeneratedContent(
                blocks=(("prose", "Something adjacent, using none of the required words."),),
                introduced_concepts=tuple(f"extra_concept_{i}" for i in range(4)),
                note="constraint_violation",
            )

        # Required terms are appended rather than woven in. The fake is not
        # pretending to write well; it is guaranteeing the terms survive so the
        # validator's PASSING path is exercised too. A fake that only ever fails
        # the validator tests half of it.
        if contract.required_terms:
            blocks.append(("prose", "Terms that stay: " + ", ".join(contract.required_terms)))

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
