"""The real provider, behind the same one-method boundary as the fake.

WHY THIS CHANGES ALMOST NOTHING
-------------------------------
`LLMClient` is one method. Everything that decides -- bottleneck, policy,
constraints, validation, exclusion -- already runs against `FakeLLMClient`, so
this file adds a writer and not a thinker. If plugging in a real model changed
any behaviour beyond the quality of the sentences, the engine would have been
letting the model decide, which is the thing the whole design refuses.

THE OFFLINE GUARANTEE IS NOT WEAKENED
-------------------------------------
Three separate things keep it true and none of them is this file behaving well:

  * `anthropic` is an OPTIONAL dependency. CI installs only
    `requirements-learning-os.lock`, which does not contain it, so the SDK is
    not present in the job at all.
  * the import is INSIDE the method. Importing this module on a machine without
    the SDK is fine; only calling `generate` is not.
  * `tests/conftest.py` blocks `socket.connect` for every test. Even with the
    SDK installed and a key exported, a test that reached the network would
    fail rather than succeed slowly and expensively.

So the fake stays the reference implementation. This is the exception path.

THE KEY IS READ AT CALL TIME AND NEVER STORED
---------------------------------------------
Not a constructor default, not a module constant, not an attribute. A key on
the instance ends up in a `repr`, a traceback, or a pickled test fixture, and
the CI credential grep only catches the literal that was committed -- not the
one that leaked through a log line.

WHAT IS PURE HERE, DELIBERATELY
-------------------------------
`build_prompt` and `parse_blocks` are module-level functions taking and
returning plain data. They carry every judgement worth testing -- whether the
contract's constraints actually reach the model, whether a malformed response is
refused rather than half-read -- and they are testable with no SDK, no key and
no network. What is left unmockable is one `messages.create` call.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any

from learning_os.llm.client import API_KEY_ENV, GeneratedContent, LLMUnavailable
from learning_os.llm.contract import InstructionContract

#: The model this engine is written against. Named here rather than passed in,
#: because "which model taught this learner" belongs in the record of a
#: decision, and a caller-supplied default would make it unanswerable later.
MODEL = "claude-opus-5"

#: Generous, because a lesson is short but thinking is not, and a truncated
#: lesson fails validation for a reason that has nothing to do with teaching.
MAX_TOKENS = 8000

#: The block kinds this emitter can actually build. Duplicated from
#: `api.emit.TEXT_BLOCK_KINDS` on purpose: this is what the MODEL is told, and
#: importing the emitter here would make the llm layer depend on the api layer
#: to answer a question about its own prompt.
BUILDABLE = ("prose", "callout")

#: What the model must return. A schema rather than a request in prose, because
#: "return JSON like this" is a hope and a schema is a constraint -- and the
#: failure it prevents (a paragraph where an array was expected) is one the
#: validator downstream cannot repair.
RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "blocks": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "properties": {
                    "kind": {"type": "string", "enum": list(BUILDABLE)},
                    "text": {"type": "string", "minLength": 1},
                },
                "required": ["kind", "text"],
                "additionalProperties": False,
            },
        },
        "introduced_concepts": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": ["blocks", "introduced_concepts"],
    "additionalProperties": False,
}

#: Constant across every call, so it sits at the front of the cached prefix.
#: Nothing learner-specific belongs here -- that goes in the user turn, after
#: the cache breakpoint.
SYSTEM = """You write one short lesson, inside a contract another system decided.

You are not choosing what to teach. A decision engine has already selected the
skill, the diagnosis, and the mechanism, from this learner's evidence and from
what has already failed on them. Your job is the language.

Rules that are checked mechanically after you answer:
- Every required term must appear, verbatim. They are not jargon to soften;
  a learner who is taught a friendlier word has to unlearn it later.
- Every forbidden simplification must be avoided. Each one is tempting
  precisely because it makes the moment easier and leaves the learner holding
  something false.
- Do not exceed the block budget.
- Never state a step count or a position in a sequence. The next step depends
  on evidence that does not exist yet, so "step 2 of 5" is a promise about a
  decision nobody has made.

Write for someone who is stuck, not for someone browsing. No preamble, no
summary of what you are about to say, no encouragement. Start with the idea."""


def build_prompt(contract: InstructionContract) -> str:
    """The contract, as the model reads it.

    Every constraint the validator will check appears here. That symmetry is the
    point: a rule enforced after generation but never stated before it turns the
    model's job into a guess, and turns the validator into a random tax.

    Built as text rather than by nesting the contract's JSON. The model has to
    act on these, and a flat labelled list is read more reliably than a nested
    object -- and it keeps the schema an internal detail rather than something
    the prompt depends on.
    """
    lines = [
        f"SKILL TO TEACH: {contract.target_skill}",
        f"THE LEARNER ASKED: {contract.question}",
        f"WHY THEY ARE STUCK: {contract.diagnosis.value}",
        f"MECHANISM TO USE: {contract.strategy.value}",
        f"BLOCK BUDGET: at most {contract.simplicity.max_blocks} blocks",
        f"BLOCK KINDS AVAILABLE: {', '.join(BUILDABLE)}",
        f"SUCCESS MEANS: {contract.success_evidence_required}",
    ]

    if contract.required_terms:
        lines.append("TERMS THAT MUST APPEAR VERBATIM: " + ", ".join(contract.required_terms))
    if contract.forbidden_phrases:
        lines.append("DO NOT SAY ANY OF THESE:")
        lines.extend(f"  - {rule}" for rule in contract.forbidden_phrases)
    if contract.known_prerequisites:
        # Stated as something to BUILD ON. Without that framing a model reads a
        # list of skills and re-explains them, which spends the learner's
        # attention on what they already have.
        lines.append(
            "THEY CAN ALREADY DO THESE -- build on them, do not re-teach them: "
            + ", ".join(contract.known_prerequisites)
        )
    if contract.weak_subskills:
        lines.append(
            "DO NOT LEAN ON THESE, they are weak too: " + ", ".join(contract.weak_subskills)
        )
    if contract.avoid_representations:
        # The single most important line for a returning learner. Without it the
        # model reaches for the most natural explanation, which is the one that
        # already failed on them.
        lines.append(
            "ALREADY TRIED AND FAILED ON THIS LEARNER -- do not repeat: "
            + ", ".join(contract.avoid_representations)
        )
    if contract.preferred_representations:
        lines.append("HAS WORKED BEFORE: " + ", ".join(contract.preferred_representations))

    return "\n".join(lines)


def parse_blocks(payload: str) -> GeneratedContent:
    """Turn the model's JSON into the shape the emitter expects.

    Refuses rather than salvages. A response missing `blocks`, or carrying an
    unbuildable kind, is a contract failure the caller must see -- half-reading
    it produces a lesson that is quietly shorter or differently shaped than the
    one that was asked for, and nothing downstream can tell.
    """
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as error:
        raise LLMUnavailable(f"the model returned something that is not JSON: {error}") from error

    raw = data.get("blocks")
    if not isinstance(raw, list) or not raw:
        raise LLMUnavailable("the model returned no blocks; there is no lesson to render")

    blocks: list[tuple[str, str]] = []
    for index, item in enumerate(raw):
        if not isinstance(item, dict):
            raise LLMUnavailable(f"block {index} is not an object")
        kind, text = item.get("kind"), item.get("text")
        if kind not in BUILDABLE:
            raise LLMUnavailable(f"block {index} has kind {kind!r}, which cannot be built")
        if not isinstance(text, str) or not text.strip():
            raise LLMUnavailable(f"block {index} has no text")
        blocks.append((kind, text.strip()))

    concepts = data.get("introduced_concepts") or []
    return GeneratedContent(
        blocks=tuple(blocks),
        introduced_concepts=tuple(str(c) for c in concepts if str(c).strip()),
        note=f"anthropic:{MODEL}",
    )


@dataclass(frozen=True, slots=True)
class AnthropicClient:
    """The live provider. Same one method as the fake, same failure vocabulary.

    Frozen and holding no key: construction is free and safe, and an instance
    can be built on a machine that has neither the SDK nor a credential. It
    fails when it is CALLED, which is when the caller can do something about it.
    """

    model: str = MODEL
    max_tokens: int = MAX_TOKENS

    def generate(self, contract: InstructionContract) -> GeneratedContent:
        """One call. Any provider problem arrives as `LLMUnavailable`.

        The runtime already distinguishes "could not reach the model" from "the
        model returned something unusable" -- the first is retried or routed
        around, the second means the CONTRACT was wrong. Raising anything else
        from here would make that distinction unavailable to the caller.
        """
        key = os.environ.get(API_KEY_ENV)
        if not key:
            raise LLMUnavailable(
                f"{API_KEY_ENV} is not set. The engine runs on FakeLLMClient without it; "
                f"this client is the opt-in path."
            )

        try:
            import anthropic
        except ImportError as error:
            raise LLMUnavailable(
                "the anthropic SDK is not installed. It is an optional dependency on "
                "purpose -- CI installs only the hash-locked base set so the suite "
                "cannot reach the network. Install with: pip install 'learning-os[live]'"
            ) from error

        client = anthropic.Anthropic(api_key=key)
        try:
            response = client.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                system=SYSTEM,
                messages=[{"role": "user", "content": build_prompt(contract)}],
                output_config={"format": {"type": "json_schema", "schema": RESPONSE_SCHEMA}},
            )
        except Exception as error:
            raise LLMUnavailable(f"the model could not be reached: {error}") from error

        if getattr(response, "stop_reason", None) == "refusal":
            # A safety decline is not an outage and not a bad contract. Naming it
            # separately keeps it out of the "retry the same thing" path, where
            # it would loop.
            raise LLMUnavailable("the model declined to generate for this contract")

        text = "".join(
            block.text for block in response.content if getattr(block, "type", None) == "text"
        )
        if not text.strip():
            raise LLMUnavailable("the model returned no text")

        return parse_blocks(text)
