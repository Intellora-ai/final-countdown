"""Groq, behind the same one-method boundary as the fake, and with no SDK.

WHY A FOURTH PROVIDER
---------------------
Because the one the real-life job was configured for cannot run. `real-life.yml`
selected `gemini` and failed loudly on an absent `GEMINI_API_KEY`; the key this
repository actually holds is `GROQ_API_KEY`, which the TypeScript half of the
product has been using successfully all along. So the engine had a live adapter
for two providers nobody could reach from CI and none for the one it could.

NOTHING HERE WAS GUESSED. `frontend/server/groq.ts` calls this service today,
from this repository, and every vendor-specific fact below was read out of it:
the endpoint, the bearer header, the model, the `response_format` spelling, the
token ceiling, and which two failures a second attempt genuinely fixes. Where
that file records something MEASURED against the live API -- and it records
three such things, each one having broken every request until it was found --
the measurement is repeated here rather than re-derived.

THE OFFLINE GUARANTEE IS NOT WEAKENED, AND IT IS STRUCTURAL HERE
-----------------------------------------------------------------
The other two hosted adapters keep it by importing their SDK inside `generate`.
This one has no SDK to import: one POST and one JSON parse over `urllib`, for
the reason `frontend/server/groq.ts` gives in its own header -- a dependency in
the process that holds the key is a supply-chain surface, bought for a hundred
lines nobody needs. Three consequences, all wanted:

  * `select.PROVIDER_SDK_MODULE["groq"]` is `None` and the pre-flight in
    `api/ask.py` never sends anybody to install anything;
  * `real-life.yml` installs `requirements-learning-os.lock` and `behave` and
    nothing else, so this provider is runnable in the job exactly as it stands;
  * `tests/conftest.py` blocks `socket.connect` for every test, and the
    transport is a constructor argument, so every path in this file -- retries
    included -- is exercised with no network and no key.

`tests/test_groq_client.py` reads this module's own imports and fails if one of
them leaves the standard library, because the `None` above is a claim the
pre-flight repeats to whoever is trying to configure the thing.

THE KEY IS READ AT CALL TIME, CARRIED IN ONE HEADER, AND NEVER REPEATED
-----------------------------------------------------------------------
Not a constructor default, not a module constant, not an attribute. And no
upstream error body is ever quoted back: a 401 from an OpenAI-compatible service
routinely echoes the credential it just rejected, `LLMUnavailable` text reaches
stderr and a CI artifact retained for thirty days, and that is how a key becomes
public. Only the status and the vendor's short codes are repeated.
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field, replace
from typing import Any

from learning_os.llm.anthropic_client import (
    RESPONSE_SCHEMA,
    SYSTEM,
    build_prompt,
)
from learning_os.llm.anthropic_client import (
    parse_blocks as _parse_shared,
)
from learning_os.llm.client import GROQ_API_KEY_ENV, GeneratedContent, LLMUnavailable
from learning_os.llm.contract import InstructionContract

__all__ = [
    "GROQ_URL",
    "MAX_TOKENS",
    "MODEL",
    "SCHEMA_NAME",
    "TIMEOUT_SECONDS",
    "WAIT_BEFORE_RETRY_SECONDS",
    "GroqClient",
    "Reply",
    "build_http_request",
    "build_request",
    "content_of",
    "parse_blocks",
    "wait_the_service_asks_for",
    "worth_another_try",
]

#: The OpenAI-compatible endpoint. Groq documents this path rather than a
#: bespoke one, and `frontend/server/groq.ts` reaches it today.
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

#: The model this adapter is written against, and the same one the TypeScript
#: planner uses.
#:
#: Pinned rather than caller-supplied, for the reason the other adapters pin
#: theirs: "which model taught this learner" belongs in the record of a
#: decision, and a caller-supplied default makes it unanswerable afterwards.
#: THE SAME model as the planner on purpose -- both halves of this product teach
#: the same child, and a lesson that reads differently depending on which half
#: produced it is a difference nobody chose.
MODEL = "openai/gpt-oss-120b"

#: How much the model may write in one reply.
#:
#: MEASURED AGAINST THE ACCOUNT, NOT COPIED FROM THE SIBLING ADAPTERS.
#:
#: `frontend/server/groq.ts` carried 16000 over from the Anthropic client and
#: EVERY request failed. Groq reports this account's real ceiling in its own
#: headers -- `x-ratelimit-limit-tokens: 8000`, the whole per-MINUTE budget --
#: and `max_tokens` is a RESERVATION rather than a measurement of what gets
#: used, so each request was asking to hold twice the entire minute and the
#: service refused with 413 before writing a word.
#:
#: The other two adapters here ask for 8000, which is that whole budget. 2000 is
#: chosen from what a lesson actually needs: the block budget in
#: `SimplicityConstraints` caps at eight, and the longest real lesson measured
#: in the frontend came back well under this. It also leaves the input -- a long
#: system prompt plus the schema -- comfortable room inside the same 8000.
MAX_TOKENS = 2000

#: The name the structured-output block requires. Any label works; this one says
#: what the object is when it turns up in a vendor-side log.
SCHEMA_NAME = "lesson"

#: A ceiling on one attempt. Long enough for a slow generation, short enough
#: that a hung connection cannot outlive the CI job it is running in.
TIMEOUT_SECONDS = 120

#: How long to wait before trying again, when the service does not say.
#:
#: TAKEN FROM THE SERVICE'S OWN RESET FIGURE, NOT PICKED. Groq reports
#: `x-ratelimit-reset-tokens: 12.577s`, and the first hand-chosen pair -- 1.2s
#: and 4s -- both expired long before the budget came back, so three attempts
#: inside five seconds was one attempt spent three times.
#:
#: A bad JSON roll is fixed by asking again at once, which the short first wait
#: is for. A spent token budget is fixed only by waiting for the minute to turn,
#: which the second one is for. Its length is the reason `sleep` is injectable:
#: a suite that really waited fourteen seconds per retry test would be deleted
#: within a week.
WAIT_BEFORE_RETRY_SECONDS: tuple[float, ...] = (0.8, 14.0)

#: A pause longer than this is not a retry, it is a hang in front of a child.
#: Better to fail honestly and let her ask again.
_LONGEST_WAIT_SECONDS = 30.0

#: `1m2.3s`, `12.577s`, `1m`. The shapes `x-ratelimit-reset-tokens` arrives in.
_RESET_FORMAT = re.compile(r"^(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$")

#: Bare seconds, which is what `retry-after` carries.
_BARE_SECONDS = re.compile(r"^\d+(?:\.\d+)?$")

#: The model stopped early and the answer is not the whole answer.
_TRUNCATED = "length"

#: The service declined. Not an outage, and not a bad contract.
_DECLINED = "content_filter"


@dataclass(frozen=True, slots=True)
class Reply:
    """What one HTTP attempt produced, success or failure alike.

    A FAILING STATUS IS DATA HERE RATHER THAN AN EXCEPTION, and that is what
    makes the retry decision testable. `urllib` raises `HTTPError` on a 429, so
    a transport that let it propagate would force the loop to read a status off
    an exception -- and a test would then have to construct one, with a file
    handle, to say "rate limited". One small object says it instead.
    """

    status: int

    #: The decoded JSON body, or the raw text when it was not JSON. Typed
    #: `object` rather than `Any` on purpose: `Any` would let every reader index
    #: straight into a vendor's shape with no check at all, which is the failure
    #: `_field` exists to make impossible. NEVER repeated in an error message:
    #: see `_why`.
    body: object

    #: Response headers, lowercased. The service's own reset figure lives here
    #: and is preferred over any wait this file could guess -- which is why it
    #: has NO DEFAULT. An empty mapping is a legitimate answer ("the service
    #: said nothing"), and a default would let an attempt mean that by accident
    #: and then wait the wrong amount for a reason nobody wrote down.
    headers: Mapping[str, str]


def build_request(
    contract: InstructionContract, *, model: str = MODEL, max_tokens: int = MAX_TOKENS
) -> dict[str, Any]:
    """The request body, separated from the sending so it can be asserted on.

    `SYSTEM`, `build_prompt` and `RESPONSE_SCHEMA` are imported rather than
    copied. Four providers building four prompts from one contract is four
    behaviours to keep in step, and they drift on the first edit to any of them.
    Only the transport is genuinely different here.
    """
    return {
        "model": model,
        "max_tokens": max_tokens,
        # NOT `strict: true`, AND THAT IS MEASURED RATHER THAN CAUTIOUS.
        #
        # `frontend/server/groq.ts` records an afternoon of every lesson request
        # failing `400 invalid_request_error` with strict set, while a plain
        # request to the same key and model returned 200: strict
        # structured-output mode refuses `minItems`, `minLength`, `pattern` and
        # `maxLength`, and additionally demands every property appear in
        # `required`. The shared schema uses two of those keywords.
        #
        # Loosening the schema to fit the vendor would be the wrong direction --
        # those bounds are the product's rules about what a lesson may contain,
        # and a vendor flag is not a reason to weaken them. Nothing is lost,
        # because the vendor was never the gate: `parse_blocks` refuses a
        # malformed lesson and `validation.validate` refuses one that ignored
        # the contract.
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": SCHEMA_NAME, "schema": RESPONSE_SCHEMA},
        },
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": build_prompt(contract)},
        ],
    }


def build_http_request(url: str, payload: dict[str, Any], key: str) -> urllib.request.Request:
    """The HTTP request, built where it can be inspected without a socket.

    Split out of `_post` so the credential's carrier is a testable fact rather
    than a line nobody can reach: the key belongs in ONE header, never in the
    URL, which every proxy in the path logs, and never in the body, which
    anything that records requests logs.
    """
    return urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
        },
        method="POST",
    )


def _decode(raw: bytes) -> object:
    """The body as JSON, or as text when it is not JSON.

    A gateway between here and the vendor answers HTML, and a body that will not
    parse must not become a `JSONDecodeError` out of the transport -- the caller
    would read that as the MODEL returning bad JSON, which is a different
    failure with a different remedy.
    """
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return raw.decode("utf-8", errors="replace")


def _post(url: str, payload: dict[str, Any], key: str) -> Reply:
    """The real transport. Replaced wholesale in tests.

    Returns a `Reply` for any HTTP status the service produced, and raises only
    when no answer arrived at all. The distinction is the retry decision: a 429
    is an answer that says "later", a refused connection is not an answer.
    """
    request = build_http_request(url, payload, key)
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return Reply(
                status=int(response.status),
                body=_decode(response.read()),
                headers={name.lower(): value for name, value in response.headers.items()},
            )
    except urllib.error.HTTPError as error:
        return Reply(
            status=int(error.code),
            body=_decode(error.read()),
            headers={name.lower(): value for name, value in error.headers.items()},
        )


def worth_another_try(status: int, code: str) -> bool:
    """Whether a second attempt is a different attempt.

    MEASURED AGAINST THE LIVE API BY `frontend/server/groq.ts`, NOT GUESSED.

    `json_validate_failed` -- the model wrote JSON that did not fit the schema.
    The same question asked three times failed this way once and produced a
    correct lesson by the third. It is a bad roll of the dice, not a broken
    request, and a re-ask clears it.

    `rate_limit_exceeded` (413 / 429) -- the tokens-per-minute ceiling, hit
    repeatedly just by testing quickly. Waiting is the entire fix.

    NOT RETRIED: 401 and 404. A wrong key and a wrong model name are identical
    on the second attempt, and retrying them turns an instant, clear failure
    into a slow, confusing one.
    """
    if status in {401, 404}:
        return False
    if code in {"json_validate_failed", "rate_limit_exceeded"}:
        return True
    return status in {429, 413} or status >= 500


def wait_the_service_asks_for(headers: Mapping[str, str]) -> float | None:
    """How long the SERVICE says to wait, read from its own headers.

    THE WHOLE POINT OF THIS FUNCTION IS THAT THE ALTERNATIVE WAS MEASURED WRONG.
    Groq reports the real figure on every reply, so guessing is a choice to be
    wrong -- and both hand-picked waits expired before a budget resetting in
    12.577 seconds.

    Anything unrecognised returns `None` and lets the caller fall back, because
    a wait that cannot be parsed must never become a crash on a path that is
    already failing.
    """
    raw = headers.get("x-ratelimit-reset-tokens") or headers.get("retry-after") or ""
    text = raw.strip()
    if not text:
        return None

    if _BARE_SECONDS.match(text):
        return min(float(text), _LONGEST_WAIT_SECONDS)

    found = _RESET_FORMAT.match(text)
    if found is None:
        return None
    minutes, seconds = found.group(1), found.group(2)
    total = float(minutes or 0) * 60.0 + float(seconds or 0)
    if total <= 0:
        return None
    # Half a second past what was asked for. A wait that lands exactly on the
    # reset instant races it, and losing the race spends the whole attempt.
    return min(total + 0.5, _LONGEST_WAIT_SECONDS)


def _field(source: object, name: str) -> object:
    """One named field of a vendor-shaped reply, or `None` if it is not there.

    EVERY READ BELOW THIS LINE CROSSED A NETWORK FROM A VENDOR. Written as
    `body["choices"][0]["message"]["content"]`, a shape that changed under us
    raises `KeyError` or `TypeError` depending on which layer moved -- and the
    runtime reads both as engine bugs rather than as a bad reply, so the
    misattribution survives all the way to whoever is paged.

    Returns `object`, so a caller cannot use what it gets back without narrowing
    it first. That is the point: the checks are then verified by the type
    checker rather than remembered.
    """
    if not isinstance(source, dict):
        return None
    value: object = source.get(name)
    return value


def _why(reply: Reply) -> str:
    """The vendor's short codes, and never its message.

    Its MESSAGE can quote the request, and on a 401 it routinely quotes the
    credential that was rejected. The codes carry everything a reader needs and
    nothing that must not be logged.
    """
    error = _field(reply.body, "error")
    parts = [str(_field(error, name) or "") for name in ("type", "code")]
    return "/".join(part for part in parts if part)


def _code(reply: Reply) -> str:
    return str(_field(_field(reply.body, "error"), "code") or "")


def content_of(body: object) -> str:
    """The lesson text out of an OpenAI-shaped reply, or why there is none.

    Read defensively at every step. This crossed a network from a vendor, and a
    shape that changed under us must fail with a sentence naming what was
    missing rather than with a `TypeError` the runtime reads as an engine bug.

    THE ORDER IS LOAD-BEARING, EXACTLY AS IT IS IN THE GEMINI ADAPTER. A decline
    always arrives with empty content, so reading the content first would report
    every safety refusal as an outage -- and the runtime retries outages,
    forever, against a decision that will not change.
    """
    choices = _field(body, "choices")
    if not isinstance(choices, list) or not choices:
        raise LLMUnavailable("the model returned no choices; there is no lesson to render")

    first: object = choices[0]
    if not isinstance(first, dict):
        # Named as a shape problem rather than folded into "no text". A choice
        # that is not an object means the dialect moved under us, and reporting
        # it as an empty answer would send the reader to the prompt.
        raise LLMUnavailable("the model returned a choice that is not an object")

    finish = str(_field(first, "finish_reason") or "")
    if finish == _DECLINED:
        raise LLMUnavailable("the model declined to generate for this contract")
    if finish == _TRUNCATED:
        # Reported as truncation rather than left to the JSON parser. A cut
        # reply fails as "not JSON", which sends the reader hunting a prompt bug
        # when the fix is a higher ceiling or a shorter contract.
        raise LLMUnavailable(
            "the reply was truncated before it finished; raise the ceiling or "
            "shorten the contract"
        )

    content = _field(_field(first, "message"), "content")
    if not isinstance(content, str) or not content.strip():
        raise LLMUnavailable("the model returned no text")
    return content


def parse_blocks(payload: str, *, model: str = MODEL) -> GeneratedContent:
    """The shared parse, restamped with who actually wrote the lesson.

    DELEGATED RATHER THAN COPIED. The Gemini adapter duplicates these twenty-five
    lines for one reason -- a shared parser would stamp every lesson
    `anthropic:` regardless of who produced it -- and pays for it with a second
    copy of the rules that can drift into being gentler than the first. That is
    the more expensive half of the trade: a lenient parser somewhere means one
    provider is quietly allowed a half-lesson the others are not, and nothing
    downstream can tell.

    So the rules stay in one place and only the provenance is rewritten. The
    MODEL is the instance's, not the constant: a note built from the default
    while the client ran something else is a provenance record that is
    confidently wrong, which is worse than none because it cannot be doubted
    from outside.
    """
    return replace(_parse_shared(payload), note=f"groq:{model}")


@dataclass(frozen=True)
class GroqClient:
    """The Groq provider. Same one method as the fake, same failure vocabulary.

    Frozen and holding no key: construction is free and safe on a machine with
    no credential at all. It fails when it is CALLED, which is when the caller
    can do something about it.
    """

    model: str = MODEL
    max_tokens: int = MAX_TOKENS
    #: The transport, injectable so every path below is reachable offline.
    post: Callable[[str, dict[str, Any], str], Reply] = field(default=_post)
    #: Injectable for the same reason, and for one more: `WAIT_BEFORE_RETRY_SECONDS`
    #: is fourteen seconds at its longest, and a test suite that really waited
    #: would be deleted rather than fixed.
    sleep: Callable[[float], None] = field(default=time.sleep)

    def generate(self, contract: InstructionContract) -> GeneratedContent:
        """One lesson. Any provider problem arrives as `LLMUnavailable`.

        The runtime distinguishes "could not reach the model" from "the model
        returned something unusable" -- the first is retried or routed around,
        the second means the CONTRACT was wrong. Raising anything else from here
        would make that distinction unavailable to the caller.
        """
        key = os.environ.get(GROQ_API_KEY_ENV) or ""
        if not key.strip():
            # Checked FIRST, and whitespace counts as absent: `export KEY=" "`
            # is an unset variable that does not look unset, and sending it
            # spends a request to learn something that was free to know.
            raise LLMUnavailable(
                f"{GROQ_API_KEY_ENV} is not set. The engine runs on FakeLLMClient "
                f"without it; this client is the opt-in path. Issue a key from the "
                f"Groq console and export it -- never commit it."
            )

        payload = build_request(contract, model=self.model, max_tokens=self.max_tokens)

        last_status = 0
        last_why = ""
        #: What the service told us to wait, if it did. Preferred over the fixed
        #: waits, because it is the truth and they are an estimate.
        asked_to_wait: float | None = None

        # One attempt, then one more per fixed wait, for the failures a retry
        # actually fixes. See `worth_another_try`.
        for attempt in range(len(WAIT_BEFORE_RETRY_SECONDS) + 1):
            if attempt:
                self.sleep(
                    asked_to_wait
                    if asked_to_wait is not None
                    else WAIT_BEFORE_RETRY_SECONDS[attempt - 1]
                )

            reply = self._attempt(payload, key)

            if reply.status == 200:
                return parse_blocks(content_of(reply.body), model=self.model)

            last_status, last_why = reply.status, _why(reply)
            asked_to_wait = wait_the_service_asks_for(reply.headers)
            if not worth_another_try(reply.status, _code(reply)):
                break

        # THE BODY IS NOT IN HERE, AND THAT IS THE POINT. See `_why`.
        detail = f" {last_why}" if last_why else ""
        raise LLMUnavailable(f"the model could not be reached ({last_status}{detail})")

    def _attempt(self, payload: dict[str, Any], key: str) -> Reply:
        """One request, with every transport failure in this layer's vocabulary.

        The key is PASSED rather than re-read. A second `os.environ` lookup here
        would be a second chance for the variable to be gone -- a `KeyError` out
        of a provider adapter, which the runtime reads as an engine bug rather
        than as a missing credential.
        """
        try:
            return self.post(GROQ_URL, payload, key)
        except LLMUnavailable:
            # Already the right vocabulary, and already more specific than
            # anything this line could add. Re-wrapping would bury the remedy.
            raise
        except Exception as error:
            # Deliberately broad. This layer's contract is "any provider problem
            # is LLMUnavailable"; letting a transport's own exception class
            # escape would make the runtime's retry decision depend on which
            # provider happens to be configured.
            raise LLMUnavailable(f"the model could not be reached: {error}") from error
