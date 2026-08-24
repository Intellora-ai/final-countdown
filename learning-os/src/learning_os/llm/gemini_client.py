"""The Gemini provider. Second implementation of the same one-method seam.

WHY A SECOND PROVIDER IS A NEW FILE
-----------------------------------
`LLMClient` is a Protocol with a single method, so adding a model means adding a
file rather than editing one. `runtime/loop.py` never learns which model
answered, and the two providers cannot drift into different call shapes because
neither can see the other.

WHY REST AND NOT THE SDK
------------------------
`tests/test_supply_chain.py` rejects any install that is not hash-locked, and CI
installs only the locked base set so the suite cannot reach the network. An
optional `google-genai` dependency would either fail that gate or sit untested
in the one place that matters. The REST surface needs no package: `urllib` is in
the standard library and is already available everywhere this runs.

The trade is real and worth naming. The SDK would handle retries, streaming and
model-name aliasing; this does none of those. What it buys is a provider that
installs nowhere, tests without a socket, and cannot break the supply-chain gate.

WHAT IS SHARED WITH THE ANTHROPIC PATH, AND WHY
-----------------------------------------------
`build_prompt`, `SYSTEM` and `RESPONSE_SCHEMA` are imported, not copied. Two
providers building two prompts from one contract is two behaviours to keep in
step, and they drift on the first edit to either. Only the transport differs,
because only the transport is genuinely different.

THE TRANSPORT IS INJECTED
-------------------------
`post` defaults to the real `urllib` call and is replaceable. Tests drive a stub,
so the suite never opens a socket -- which `tests/conftest.py` blocks anyway. A
test that needs the harness to permit the thing it forbids is a test that passes
for the wrong reason.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable

from learning_os.llm.anthropic_client import (
    MAX_TOKENS,
    RESPONSE_SCHEMA,
    SYSTEM,
    build_prompt,
    parse_blocks,
)
from learning_os.llm.client import GeneratedContent, LLMUnavailable
from learning_os.llm.contract import InstructionContract

#: Its OWN variable, not the Anthropic one. Sharing a single key name would make
#: "which provider am I actually talking to" depend on which client happened to
#: be constructed, which is the kind of ambiguity that produces a bill nobody
#: expected.
GEMINI_API_KEY_ENV = "LEARNING_OS_GEMINI_API_KEY"

MODEL = "gemini-2.5-pro"

ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

#: Finish reasons that mean the model chose not to answer. These are NOT
#: outages: retrying the identical contract produces the identical refusal, so
#: they must stay out of the retry path or the loop never terminates.
_REFUSALS = frozenset({"SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "RECITATION"})

_TIMEOUT_SECONDS = 60


def build_request(contract: InstructionContract, *, model: str = MODEL) -> dict[str, Any]:
    """The request body, separated from the sending so it can be asserted on.

    A request shape only checkable by making a real call is a request shape
    nobody checks.
    """
    return {
        "systemInstruction": {"parts": [{"text": SYSTEM}]},
        "contents": [{"role": "user", "parts": [{"text": build_prompt(contract)}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": RESPONSE_SCHEMA,
            "maxOutputTokens": MAX_TOKENS,
        },
    }


def _post(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    """The real transport. Replaced wholesale in tests."""
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=_TIMEOUT_SECONDS) as response:
        body: Any = json.loads(response.read().decode("utf-8"))
    if not isinstance(body, dict):
        raise LLMUnavailable("the model returned a body that is not an object")
    return body


def _text_of(body: dict[str, Any]) -> str:
    """Every step defensive, because every step is provider-shaped.

    Reaching into `candidates[0].content.parts[*].text` with dots and brackets
    raises `KeyError`, `IndexError` or `TypeError` depending on which layer is
    missing. The runtime reads those as engine bugs, not bad responses, so each
    layer is checked and the failure arrives in the one vocabulary the caller
    knows how to route.
    """
    candidates = body.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        return ""
    first = candidates[0]
    if not isinstance(first, dict):
        return ""
    content = first.get("content")
    if not isinstance(content, dict):
        return ""
    parts = content.get("parts")
    if not isinstance(parts, list):
        return ""
    return "".join(
        part["text"] for part in parts if isinstance(part, dict) and isinstance(part.get("text"), str)
    )


def _refusal_of(body: dict[str, Any]) -> str | None:
    candidates = body.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        return None
    first = candidates[0]
    if not isinstance(first, dict):
        return None
    reason = first.get("finishReason")
    return reason if isinstance(reason, str) and reason in _REFUSALS else None


@dataclass(frozen=True)
class GeminiClient:
    """The live Gemini provider. Same one method, same failure vocabulary.

    Frozen and holding no key: constructing one is free and safe on a machine
    with no credential. It fails when CALLED, which is when the caller can do
    something about it.
    """

    model: str = MODEL
    post: Callable[[str, dict[str, Any]], dict[str, Any]] = field(default=_post)

    def generate(self, contract: InstructionContract) -> GeneratedContent:
        """One call. Any provider problem arrives as `LLMUnavailable`."""
        key = os.environ.get(GEMINI_API_KEY_ENV)
        if not key:
            raise LLMUnavailable(
                f"{GEMINI_API_KEY_ENV} is not set. The engine runs on FakeLLMClient "
                f"without it; this client is the opt-in path."
            )

        url = f"{ENDPOINT.format(model=self.model)}?key={key}"
        try:
            body = self.post(url, build_request(contract, model=self.model))
        except LLMUnavailable:
            # Already in the right vocabulary. Re-wrapping would bury the
            # specific message under a generic one.
            raise
        except Exception as error:
            raise LLMUnavailable(f"the model could not be reached: {error}") from error

        if not isinstance(body, dict):
            raise LLMUnavailable("the model returned a body that is not an object")

        refusal = _refusal_of(body)
        if refusal is not None:
            raise LLMUnavailable(
                f"the model declined to generate for this contract ({refusal})"
            )

        text = _text_of(body)
        if not text.strip():
            raise LLMUnavailable("the model returned no text")

        return parse_blocks(text)
