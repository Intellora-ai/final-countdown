"""Google's provider, behind the same one-method boundary as the fake.

WHY A SECOND LIVE PROVIDER AND NOT JUST THE FIRST
-------------------------------------------------
`AnthropicClient` proved the boundary holds. This one proves it is a BOUNDARY
and not a shape that happens to fit one vendor: it reuses `build_prompt`
verbatim, reuses the parse rules verbatim, and differs only where the provider
genuinely differs -- the request call, the credential it reads, and the schema
dialect it accepts. Everything a second provider had to change is the honest
list of what was vendor-specific all along.

The practical reason is access. Gemini has a free tier that needs a Google
account and no card, so "run this engine against a real model" stops requiring
a billing decision. That matters more than it sounds: every honesty property in
this engine is asserted against `FakeLLMClient`, and a property nobody can
cheaply check against a real model is a property that drifts.

WHAT IS OBTAINED HERE, AND WHAT IS NOT
--------------------------------------
This file obtains nothing. It reads `LEARNING_OS_GEMINI_API_KEY` from the
environment at call time. Creating the account and issuing the key is the
owner's action, in Google's own interface, and no part of this repository asks
for, stores, defaults, or logs the value.

THE OFFLINE GUARANTEE IS NOT WEAKENED
-------------------------------------
The same three mechanisms that hold for the Anthropic adapter hold here, and
none of them is this file behaving well:

  * `google-genai` is an OPTIONAL dependency. CI installs only
    `requirements-learning-os.lock`, which does not contain it, so the SDK is
    not present in the job at all.
  * the import is INSIDE the method. Importing this module on a machine without
    the SDK is fine; only calling `generate` is not.
  * `tests/conftest.py` blocks `socket.connect` for every test. Even with the
    SDK installed and a key exported, a test that reached the network fails
    rather than succeeding slowly and expensively.

THE SCHEMA IS DERIVED, NOT COPIED
---------------------------------
`response_json_schema` accepts a documented SUBSET of JSON Schema. Anthropic's
schema uses `minLength`, which is outside it. An unsupported keyword is not an
error at the call site -- it is ignored, so the constraint stops being enforced
and the first visible symptom is a block with no text in it, blamed on the
model. `SUPPORTED_SCHEMA_KEYWORDS` is the documented list, `schema_keywords`
reads what a schema actually uses, and the test asserts the difference is empty.
That makes the drift detectable the day the schema changes rather than the day a
lesson renders wrong.

THE KEY IS READ AT CALL TIME AND NEVER STORED
---------------------------------------------
Not a constructor default, not a module constant, not an attribute. A key on the
instance ends up in a `repr`, a traceback, or a pickled test fixture, and the CI
credential grep only catches the literal that was committed -- not the one that
leaked through a log line.
"""

from __future__ import annotations

import json
import re
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Protocol

from learning_os.llm.anthropic_client import BUILDABLE, SYSTEM, build_prompt
from learning_os.llm.client import GEMINI_API_KEY_ENV, GeneratedContent, LLMUnavailable
from learning_os.llm.contract import InstructionContract
from learning_os.llm.groq_client import WAIT_BEFORE_RETRY_SECONDS, worth_another_try

#: `retryDelay: '19s'` -- the shape Google's RESOURCE_EXHAUSTED error carries
#: its own reset figure in, buried in the SDK's stringified detail. Read from
#: the service rather than guessed, for the reason `groq_client.py` records:
#: both hand-picked waits there expired before the budget came back.
_RETRY_DELAY = re.compile(r"retryDelay['\"]?\s*:\s*['\"]?(\d+(?:\.\d+)?)s")

#: A pause longer than this is not a retry, it is a hang in front of a child.
_LONGEST_WAIT_SECONDS = 30.0


class Unreachable(LLMUnavailable):
    """`LLMUnavailable`, plus what the service said about trying again.

    `status` is the HTTP code the SDK's error carried (None when it carried
    none), and `asked_to_wait` is the service's own reset figure in seconds
    when the error named one. Both exist so the retry decision in `generate`
    can be the service's rather than a guess, and both are optional so a
    vendor error of any shape still arrives as the one exception the runtime
    knows how to route around.
    """

    def __init__(
        self, message: str, *, status: int | None = None, asked_to_wait: float | None = None
    ) -> None:
        super().__init__(message)
        self.status = status
        self.asked_to_wait = asked_to_wait


def _status_of(error: BaseException) -> int | None:
    """The HTTP status an SDK error carries, read without importing the SDK."""
    code = getattr(error, "code", None)
    return code if isinstance(code, int) else None


def _wait_named_in(error: BaseException) -> float | None:
    found = _RETRY_DELAY.search(str(error))
    if found is None:
        return None
    # Half a second past what was asked for: landing exactly on the reset
    # instant races it, and losing the race spends the whole attempt.
    return min(float(found.group(1)) + 0.5, _LONGEST_WAIT_SECONDS)


def generate_with_retries(
    send: Callable[[], GeneratedContent],
    *,
    sleep: Callable[[float], None],
    waits: tuple[float, ...] = WAIT_BEFORE_RETRY_SECONDS,
) -> GeneratedContent:
    """One attempt, then one more per wait, for the failures a retry fixes.

    WHY THIS EXISTS, MEASURED ON CI RUN 33596448923 (real-tutor): "the whole
    class asks at once" and "Ada refreshes and asks again" both came back
    `unavailable` -- "I could not reach the part of me that writes
    explanations" -- while every single-ask scenario answered. That is a
    burst meeting Google's requests-per-minute ceiling: a 429 with its own
    `retryDelay`, which `_send` used to fold into a bare LLMUnavailable on
    the first attempt. Groq's client had learned the same lesson already and
    this mirrors it exactly: retry only what the service says is worth a
    second attempt (429, 413, 5xx -- never 401, 404 or a bad request), wait
    what the service asks for when it says, and stop at the same ceiling.

    Split out of `generate` so it is reachable without the SDK, a key, or a
    socket -- the same reason `_send` and `_content_of` are.
    """
    last: Unreachable | None = None
    for attempt in range(len(waits) + 1):
        if attempt:
            asked = last.asked_to_wait if last is not None else None
            sleep(asked if asked is not None else waits[attempt - 1])
        try:
            return send()
        except Unreachable as refused:
            last = refused
            if refused.status is None or not worth_another_try(refused.status, ""):
                raise
    assert last is not None  # the loop body always runs at least once
    raise last

__all__ = [
    "BUILDABLE",
    "MAX_TOKENS",
    "MODEL",
    "RESPONSE_SCHEMA",
    "SDK_MODULE",
    "SUPPORTED_SCHEMA_KEYWORDS",
    "GeminiClient",
    "build_prompt",
    "parse_blocks",
    "schema_keywords",
]

#: The model this adapter is written against.
#:
#: Pinned rather than caller-supplied, for the reason the Anthropic adapter pins
#: its own: "which model taught this learner" belongs in the record of a
#: decision, and a caller-supplied default makes it unanswerable afterwards.
#:
#: Flash rather than Pro because this is the tier the free key actually reaches,
#: and an adapter whose default cannot be run by the person who just followed
#: the setup instructions is an adapter that gets reported as broken. A model id
#: this service does not serve arrives as its own error text through
#: `LLMUnavailable` below -- it is never quietly swapped for another.
MODEL = "gemini-2.5-flash"

#: Generous, because a lesson is short but thinking is not, and a truncated
#: lesson fails validation for a reason that has nothing to do with teaching.
MAX_TOKENS = 8000

#: The import path the adapter needs. Named once so the test that forces the
#: import to fail is patching the same string the code imports, rather than a
#: second copy of it that can drift out of agreement silently.
SDK_MODULE = "google.genai"

#: The JSON Schema keywords `response_json_schema` documents as supported.
#:
#: Transcribed from the SDK's own docstring for the field. Anything outside this
#: set is accepted by the call and ignored by the service, which is why it is
#: written down as data and checked, rather than remembered.
SUPPORTED_SCHEMA_KEYWORDS: frozenset[str] = frozenset(
    {
        "$id",
        "$defs",
        "$ref",
        "$anchor",
        "type",
        "format",
        "title",
        "description",
        "enum",
        "items",
        "prefixItems",
        "minItems",
        "maxItems",
        "minimum",
        "maximum",
        "anyOf",
        "oneOf",
        "properties",
        "additionalProperties",
        "required",
        "propertyOrdering",
    }
)

#: What the model must return.
#:
#: Deliberately NOT `anthropic_client.RESPONSE_SCHEMA`. That one carries
#: `minLength: 1` on the block text, which this dialect does not support -- so
#: the emptiness of a block is enforced HERE, in `parse_blocks`, for both
#: providers. Stating it in a schema Gemini ignores would have looked like a
#: guarantee and been a comment.
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
                    "text": {
                        "type": "string",
                        # `minLength` is not in the supported subset, so the
                        # requirement is stated in prose where the model reads it
                        # and enforced in `parse_blocks` where it binds.
                        "description": "The prose for this block. Never empty.",
                    },
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


def schema_keywords(schema: object) -> set[str]:
    """Every JSON Schema keyword a schema actually uses, at any depth.

    Walks keys rather than values, and steps INTO `properties` without treating
    the property names themselves as keywords -- a property called `format` is a
    field name, not a constraint, and counting it would produce a warning about
    a keyword nobody wrote.
    """
    found: set[str] = set()

    def walk(node: object, *, inside_properties: bool) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                if not inside_properties:
                    found.add(str(key))
                walk(value, inside_properties=(not inside_properties and key == "properties"))
        elif isinstance(node, list):
            for item in node:
                walk(item, inside_properties=False)

    walk(schema, inside_properties=False)
    return found


def parse_blocks(payload: str) -> GeneratedContent:
    """Turn the model's JSON into the shape the emitter expects.

    THE SAME RULES AS THE OTHER PROVIDER, INCLUDING THE ONE THE SCHEMA CANNOT
    STATE. Refuses rather than salvages: a response missing `blocks`, carrying
    an unbuildable kind, or carrying an empty one is a contract failure the
    caller must see. Half-reading it produces a lesson quietly shorter or
    differently shaped than the one that was asked for, and nothing downstream
    can tell.

    Not delegated to `anthropic_client.parse_blocks` for one reason: `note`.
    Provenance has to name the provider that wrote the lesson, and a shared
    parser would stamp every lesson `anthropic:` regardless of who produced it.
    """
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as error:
        raise LLMUnavailable(f"the model returned something that is not JSON: {error}") from error

    raw = data.get("blocks") if isinstance(data, dict) else None
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
        note=f"gemini:{MODEL}",
    )


@dataclass(frozen=True, slots=True)
class GeminiClient:
    """The live Google provider. Same one method as the fake, same failures.

    Frozen and holding no key: construction is free and safe, and an instance can
    be built on a machine that has neither the SDK nor a credential. It fails
    when it is CALLED, which is when the caller can do something about it.
    """

    model: str = MODEL
    max_tokens: int = MAX_TOKENS
    #: Injectable so the retry path is testable without waiting through it --
    #: the same reason `GroqClient.sleep` is.
    sleep: Callable[[float], None] = field(default=time.sleep)

    def generate(self, contract: InstructionContract) -> GeneratedContent:
        """One call. Any provider problem arrives as `LLMUnavailable`.

        The runtime already distinguishes "could not reach the model" from "the
        model returned something unusable" -- the first is retried or routed
        around, the second means the CONTRACT was wrong. Raising anything else
        from here would make that distinction unavailable to the caller.
        """
        # Imported here rather than at module scope so the key is read without
        # touching `os` at import time, and so this stays a one-import module.
        import os

        key = os.environ.get(GEMINI_API_KEY_ENV)
        if not key:
            raise LLMUnavailable(
                f"{GEMINI_API_KEY_ENV} is not set. The engine runs on FakeLLMClient "
                f"without it; this client is the opt-in path. Issue a key from Google "
                f"AI Studio and export it -- never commit it."
            )

        try:
            from google import genai
        except ImportError as error:
            raise LLMUnavailable(
                "the google-genai SDK is not installed. It is an optional dependency "
                "on purpose -- CI installs only the hash-locked base set so the suite "
                "cannot reach the network. Install with: pip install 'learning-os[live]'"
            ) from error

        # BOUND TO A NAME, NEVER CHAINED. THIS IS A FIX, NOT A STYLE CHOICE.
        #
        # Written as `genai.Client(api_key=key).models.generate_content(...)` the
        # client is a temporary: it is finalised while the request is still in
        # flight, and every call fails with
        #
        #     Cannot send a request, as the client has been closed.
        #
        # Measured. With the reference held, the same call against a deliberately
        # invalid key reaches Google and returns `400 API_KEY_INVALID` -- which
        # is the correct answer to a bad key and proof the request left the
        # machine. `tests/test_gemini_client.py` asserts the shape of this line,
        # because no offline test can catch a lifetime bug that only appears
        # once a socket is opened.
        client = genai.Client(api_key=key)

        return generate_with_retries(
            lambda: _content_of(_send(client, self.model, contract, self.max_tokens)),
            sleep=self.sleep,
        )


class _Models(Protocol):
    """The single SDK method this module calls."""

    def generate_content(self, **kwargs: object) -> object: ...


class _GenAIClient(Protocol):
    """The shape `genai.Client` presents to this module, and nothing more.

    Declared here rather than importing the SDK's own types because the SDK is
    an OPTIONAL dependency -- CI installs only the hash-locked base set. A real
    import would make this module unimportable exactly where it is most
    important that it stay importable: on a machine with no key and no SDK.

    Narrow on purpose. `_send` is the only place that talks to the vendor, so
    the vendor's surface is described in one place and in one line.
    """

    @property
    def models(self) -> _Models: ...


def _send(
    client: _GenAIClient, model: str, contract: InstructionContract, max_tokens: int
) -> object:
    """Make the request. Any provider problem arrives as `LLMUnavailable`.

    Split out of `generate()` so the failure path is reachable from a test. It
    takes the client rather than building one, which means a stub whose
    `models.generate_content` raises exercises the wrap with no SDK, no key and
    no network.
    """
    try:
        return client.models.generate_content(
            model=model,
            contents=build_prompt(contract),
            config={
                "system_instruction": SYSTEM,
                "max_output_tokens": max_tokens,
                # Both are required together: the schema without the mime
                # type is ignored, which is the silent version of no schema
                # at all.
                "response_mime_type": "application/json",
                "response_json_schema": RESPONSE_SCHEMA,
            },
        )
    except Exception as error:
        # Deliberately broad. The SDK raises its own exception hierarchy and
        # this layer's contract is "any provider problem is LLMUnavailable";
        # letting one vendor's class escape would make the runtime's retry
        # decision depend on which vendor is configured. What the error SAID
        # about trying again travels with it, so `generate` can act on the
        # service's word without ever seeing the vendor's class.
        raise Unreachable(
            f"the model could not be reached: {error}",
            status=_status_of(error),
            asked_to_wait=_wait_named_in(error),
        ) from error


def _content_of(response: object) -> GeneratedContent:
    """Interpret a provider response, or say why it is unusable.

    Split out for the same reason as `_send`: these three outcomes sit
    downstream of the SDK call, so nothing could reach them while they lived
    inline. `_refusal_reason` already promised in its own docstring to work
    without the SDK installed; that was true of the helper and false of the
    branch that called it.

    THE ORDER IS LOAD-BEARING. A refusal always arrives with empty text, so
    reading the text first would report every safety decline as an outage --
    and the runtime retries outages, forever, against a decision that will not
    change.
    """
    blocked = _refusal_reason(response)
    if blocked is not None:
        # A safety decline is not an outage and not a bad contract. Naming it
        # separately keeps it out of the "retry the same thing" path.
        raise LLMUnavailable(f"the model declined to generate for this contract: {blocked}")

    text = getattr(response, "text", None)
    if not isinstance(text, str) or not text.strip():
        raise LLMUnavailable("the model returned no text")

    return parse_blocks(text)


def _refusal_reason(response: object) -> str | None:
    """Why the provider declined, or `None` if it did not.

    Two places carry it and they mean different things: `prompt_feedback` is the
    request being refused, a candidate's `finish_reason` is the answer being cut
    off. Both produce empty text, and collapsing them into "no text" would report
    a safety decline as an outage -- which the runtime would then retry, forever,
    against a decision that does not change.

    Reads defensively through `getattr` because this must not require the SDK to
    be installed in order to be imported or tested.
    """
    feedback = getattr(response, "prompt_feedback", None)
    block_reason = getattr(feedback, "block_reason", None)
    if block_reason:
        return f"prompt blocked ({block_reason})"

    candidates = getattr(response, "candidates", None) or []
    for candidate in candidates:
        finish = getattr(candidate, "finish_reason", None)
        if finish is None:
            continue
        name = str(getattr(finish, "name", finish)).upper()
        if name in {"SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"}:
            return f"candidate stopped ({name})"
    return None
