"""The Ollama provider. Local, free, and needs no credential.

WHY THIS ONE IS DIFFERENT IN KIND
---------------------------------
The model runs on the machine that runs the engine. No key, no rate limit, no
bill, no network egress, and no learner text leaving the device -- which for a
system that reads what a child typed is a property worth having on purpose
rather than by accident.

The failure modes move accordingly. A hosted client fails on credentials and
quotas; this one fails on "the server is not running" and "that model was never
pulled". Both of those have a one-line fix, so both messages carry it.

THE RESPONSE SHAPE HERE WAS MEASURED, NOT REMEMBERED
----------------------------------------------------
A real call to a real server on this machine returned:

    keys          created_at, done, done_reason, eval_count, message, model, ...
    message keys  content, role
    done_reason   "stop"
    content       '{"blocks": [{"kind": "...", "text": "..."}]}'

Ollama 0.32.15, HTTP 200, 3.6s, structured output via `format` honoured. Every
field this module reads was observed in that response. The other providers'
shapes came from documentation; this one came from the wire.

WHAT IS SHARED, AND WHY
-----------------------
`build_prompt`, `SYSTEM` and `RESPONSE_SCHEMA` are imported from the Anthropic
module rather than copied. Three providers building three prompts from one
contract is three behaviours to keep in step, and they drift on the first edit
to any of them. Only the transport is genuinely different.

`stream: false` is required rather than stylistic. A streamed reply arrives as
many JSON objects on one connection, and `json.loads` over the whole body fails
on the second one.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable

from learning_os.llm.anthropic_client import (
    RESPONSE_SCHEMA,
    SYSTEM,
    build_prompt,
    parse_blocks,
)
from learning_os.llm.client import GeneratedContent, LLMUnavailable
from learning_os.llm.contract import InstructionContract

#: Where the server listens. An env var rather than a constant because the
#: server can legitimately live on another machine on the LAN, and hardcoding
#: localhost would make that a code change.
OLLAMA_HOST_ENV = "LEARNING_OS_OLLAMA_HOST"
DEFAULT_HOST = "http://localhost:11434"

MODEL = "qwen3:8b"

_TIMEOUT_SECONDS = 300

#: Anything other than this means the reply is not a complete answer.
_DONE_OK = "stop"


def build_request(contract: InstructionContract, *, model: str = MODEL) -> dict[str, Any]:
    """The request body, separated from the sending so it can be asserted on."""
    return {
        "model": model,
        "stream": False,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": build_prompt(contract)},
        ],
        "format": RESPONSE_SCHEMA,
    }


def _post(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    """The real transport. Replaced wholesale in tests."""
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=_TIMEOUT_SECONDS) as response:
            body: Any = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:300]
        if error.code == 404:
            raise LLMUnavailable(
                f"the model is not on this machine. Fix: ollama pull <model>. ({detail})"
            ) from error
        raise LLMUnavailable(f"the server answered {error.code}: {detail}") from error
    if not isinstance(body, dict):
        raise LLMUnavailable("the server returned a body that is not an object")
    return body


def _content_of(body: dict[str, Any]) -> str:
    """Checked at every layer, because every layer is server-shaped.

    `body["message"]["content"]` with brackets raises KeyError or TypeError
    depending on which part is missing, and the runtime reads those as engine
    bugs rather than bad replies.
    """
    message = body.get("message")
    if not isinstance(message, dict):
        return ""
    content = message.get("content")
    return content if isinstance(content, str) else ""


@dataclass(frozen=True)
class OllamaClient:
    """The local provider. Same one method, same failure vocabulary.

    Frozen and holding nothing: constructing one is free and safe on a machine
    with no server running. It fails when CALLED, which is when the caller can
    start the server.
    """

    model: str = MODEL
    post: Callable[[str, dict[str, Any]], dict[str, Any]] = field(default=_post)

    def generate(self, contract: InstructionContract) -> GeneratedContent:
        """One call. Any provider problem arrives as `LLMUnavailable`."""
        host = os.environ.get(OLLAMA_HOST_ENV) or DEFAULT_HOST
        url = f"{host.rstrip('/')}/api/chat"

        try:
            body = self.post(url, build_request(contract, model=self.model))
        except LLMUnavailable as error:
            # Already the right vocabulary. Re-wrapping would bury the specific
            # remedy -- `ollama pull` -- under a generic transport message.
            if "not found" in str(error) and "ollama pull" not in str(error):
                raise LLMUnavailable(
                    f"the model is not on this machine. Fix: ollama pull {self.model}. "
                    f"({error})"
                ) from error
            raise
        except (ConnectionRefusedError, ConnectionError) as error:
            raise LLMUnavailable(
                f"nothing is listening on {host}. Fix: ollama serve. ({error})"
            ) from error
        except Exception as error:
            raise LLMUnavailable(f"the model could not be reached: {error}") from error

        if not isinstance(body, dict):
            raise LLMUnavailable("the server returned a body that is not an object")

        reason = body.get("done_reason")
        if isinstance(reason, str) and reason and reason != _DONE_OK:
            # Reported as truncation rather than left to the JSON parser. A cut
            # reply fails as "not JSON", which sends the reader hunting a prompt
            # bug when the fix is a higher token ceiling.
            raise LLMUnavailable(
                f"the reply was truncated before it finished (done_reason={reason!r}); "
                f"raise the ceiling or shorten the contract"
            )

        text = _content_of(body)
        if not text.strip():
            raise LLMUnavailable("the model returned no text")

        return parse_blocks(text)
