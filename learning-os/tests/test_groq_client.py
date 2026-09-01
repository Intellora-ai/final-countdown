"""The hosted provider that needs no SDK, tested with no key and no socket.

WHY THIS PROVIDER IS NOT A COPY OF THE GEMINI ONE
-------------------------------------------------
Groq speaks OpenAI's chat-completions dialect, so three things differ from every
other adapter here and each one is a place a wrong guess is invisible until a
learner is waiting: the endpoint, the credential's carrier (an `Authorization`
header rather than an SDK constructor), and the reply shape
(`choices[0].message.content` carrying the lesson as a STRING of JSON).

NONE OF IT WAS GUESSED. `frontend/server/groq.ts` already calls this service
successfully in this repository and every fact this file asserts was read out
of that client: the URL, the bearer header, the model, the `response_format`
spelling, the two failures worth retrying, and the token ceiling.

WHY THERE IS NO "THE SDK IS MISSING" TEST HERE, AND WHAT REPLACES IT
--------------------------------------------------------------------
The other two hosted adapters import a vendor SDK inside `generate`, so "a key
is set and the SDK is absent" is a real branch with a real message. This one
imports NOTHING outside the standard library -- one POST and one JSON parse --
for the reason `frontend/server/groq.ts` states in its own header: a dependency
here is a supply-chain surface on the process that holds the key. It is also
what makes the CI job work at all, measured rather than assumed:
`.github/workflows/real-life.yml` installs `requirements-learning-os.lock` and
`behave` and nothing else, so an adapter needing `pip install groq` would fail
`api/ask.py`'s pre-flight with `no_sdk` -- the exact red this work removes.

A claim like that decays the first time somebody adds an import, and
`select.PROVIDER_SDK_MODULE["groq"] = None` would then be a lie that the
pre-flight repeats to a reader. So the branch is replaced by a test that reads
this module's own imports and fails if any of them leaves the standard library.

NO TEST HERE SKIPS, AND NO TEST HERE OPENS A SOCKET.
`conftest.py` blocks `socket.connect` for every test in this suite. The
transport is a constructor argument, so every path below -- including the
retries -- is exercised without a network, without a key, and without waiting.
"""

from __future__ import annotations

import ast
import importlib.util
import inspect
import io as _io
import sys
import urllib.error
import urllib.request
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from dataclasses import fields
from typing import Any

import pytest

from learning_os.llm import anthropic_client
from learning_os.llm.anthropic_client import RESPONSE_SCHEMA, SYSTEM, build_prompt
from learning_os.llm.client import (
    API_KEY_ENV,
    GEMINI_API_KEY_ENV,
    GROQ_API_KEY_ENV,
    LLMClient,
    LLMUnavailable,
)
from learning_os.llm.contract import (
    DiagnosisKind,
    InstructionContract,
    SimplicityConstraints,
    Strategy,
)
from learning_os.llm.groq_client import (
    GROQ_URL,
    MAX_TOKENS,
    MODEL,
    SCHEMA_NAME,
    WAIT_BEFORE_RETRY_SECONDS,
    GroqClient,
    Reply,
    _post,
    build_http_request,
    build_request,
    content_of,
    parse_blocks,
    wait_the_service_asks_for,
    worth_another_try,
)
from learning_os.llm.validation import ViolationKind, validate
from learning_os.models.contracts import ActionKind

SKILL = "python.recursion.identify_base_case"

#: Never sent anywhere: every transport in this file is a Python object, and
#: `conftest.py` blocks the socket underneath them all. Written in the same
#: shape the rest of this suite uses, and deliberately NOT in the shape a real
#: credential takes -- a fixture that looks like the real thing is a fixture a
#: secret scanner blocks a push over, and then somebody edits the scanner.
KEY = "a-value-that-is-never-sent"


def _contract(**over: object) -> InstructionContract:
    base: dict[str, object] = {
        "target_skill": SKILL,
        "question": "Why does a recursive function need a base case?",
        "diagnosis": DiagnosisKind.CONCEPT_GAP,
        "strategy": Strategy.WORKED_EXAMPLE,
        "action": ActionKind.TEACH_BY_EXAMPLE,
        "success_evidence_required": "names the base case unaided",
    }
    base.update(over)
    return InstructionContract(**base)  # type: ignore[arg-type]


_LESSON = (
    '{"blocks": [{"kind": "prose", "text": "A base case stops it."}], '
    '"introduced_concepts": ["base case"]}'
)


def _reply(
    text: str = _LESSON,
    *,
    finish: str | None = "stop",
    status: int = 200,
    headers: Mapping[str, str] | None = None,
) -> Reply:
    """The reply shape `frontend/server/groq.ts` reads, and nothing more."""
    choice: dict[str, Any] = {"index": 0, "message": {"role": "assistant", "content": text}}
    if finish is not None:
        choice["finish_reason"] = finish
    return Reply(status=status, body={"choices": [choice]}, headers=dict(headers or {}))


def _failure(
    status: int,
    *,
    code: str = "",
    type_: str = "",
    message: str = "",
    headers: Mapping[str, str] | None = None,
) -> Reply:
    """The error shape Groq returns: a single `error` object with short codes."""
    return Reply(
        status=status,
        body={"error": {"message": message, "type": type_, "code": code}},
        headers=dict(headers or {}),
    )


class _Transport:
    """Records every request and answers from a queue.

    The last reply repeats once the queue runs out, so a test about retries can
    say "always rate limited" in one line without pretending to know how many
    attempts the client will make.
    """

    def __init__(self, *replies: Reply) -> None:
        self._replies = list(replies)
        self.calls: list[tuple[str, dict[str, Any], str]] = []

    def __call__(self, url: str, payload: dict[str, Any], key: str) -> Reply:
        self.calls.append((url, payload, key))
        index = min(len(self.calls) - 1, len(self._replies) - 1)
        return self._replies[index]


class _Naps:
    """A sleep that records instead of waiting. A suite that really slept for
    fourteen seconds per retry test would be deleted within a week."""

    def __init__(self) -> None:
        self.slept: list[float] = []

    def __call__(self, seconds: float) -> None:
        self.slept.append(seconds)


def _client(*replies: Reply) -> tuple[GroqClient, _Transport, _Naps]:
    transport, naps = _Transport(*replies), _Naps()
    return GroqClient(post=transport, sleep=naps), transport, naps


# --------------------------------------------------------------------------
# It is the same boundary as the fake, and it carries no vendor dependency
# --------------------------------------------------------------------------


def test_it_satisfies_the_same_protocol_as_the_fake() -> None:
    assert isinstance(GroqClient(), LLMClient)


def test_the_model_is_pinned_rather_than_caller_supplied() -> None:
    """"Which model taught this learner" belongs in the record of a decision, so
    it cannot be whatever an environment variable happened to hold."""
    assert GroqClient().model == MODEL


def test_this_module_imports_on_a_machine_with_no_provider_installed() -> None:
    assert importlib.util.find_spec("learning_os.llm.groq_client") is not None


def test_the_module_imports_nothing_outside_the_standard_library() -> None:
    """THE TEST THAT STANDS IN FOR "THE SDK IS MISSING".

    `select.PROVIDER_SDK_MODULE["groq"] is None` is a claim the pre-flight in
    `api/ask.py` repeats to whoever is trying to configure this. The day someone
    adds `import groq` to the adapter, that claim becomes a lie: the run fails
    with "an outage, a rate limit, or a refusal" and the reader goes hunting a
    network problem that is not happening. That is the misattribution
    `test_select.py::test_an_absent_sdk_is_reported_by_name` exists to prevent,
    and this is the half of it that lives with the adapter.

    Reads the imports rather than trusting the docstring, and allows `learning_os`
    itself, which is not an optional dependency of anything.
    """
    from learning_os.llm import groq_client

    tree = ast.parse(inspect.getsource(groq_client))
    imported: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            imported.add(node.module.split(".")[0])

    outside = {name for name in imported if name not in sys.stdlib_module_names}
    assert outside <= {"learning_os"}, f"a vendor dependency crept in: {sorted(outside)}"


# --------------------------------------------------------------------------
# The credential: read at call time, carried in one header, never repeated
# --------------------------------------------------------------------------


def test_no_key_raises_before_anything_is_sent(monkeypatch: pytest.MonkeyPatch) -> None:
    """The key is checked FIRST. Reaching the transport without one turns a
    configuration mistake into a network error, and spends a request to learn
    something that was answerable for free."""
    monkeypatch.delenv(GROQ_API_KEY_ENV, raising=False)
    client, transport, _ = _client(_reply())
    with pytest.raises(LLMUnavailable, match=GROQ_API_KEY_ENV):
        client.generate(_contract())
    assert transport.calls == []


def test_groq_reads_its_own_variable_and_not_another_providers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """THE CROSS-WIRING GUARD.

    One shared variable would make the providers mutually exclusive on a machine
    and -- far worse -- would send one vendor's credential to another vendor's
    host the first time somebody switched. A key disclosed to the wrong party
    has no undo that is not rotation.
    """
    monkeypatch.setenv(API_KEY_ENV, "an-anthropic-value")
    monkeypatch.setenv(GEMINI_API_KEY_ENV, "a-google-value")
    monkeypatch.delenv(GROQ_API_KEY_ENV, raising=False)
    client, transport, _ = _client(_reply())
    with pytest.raises(LLMUnavailable, match=GROQ_API_KEY_ENV):
        client.generate(_contract())
    assert transport.calls == []


def test_a_whitespace_only_key_counts_as_absent(monkeypatch: pytest.MonkeyPatch) -> None:
    """A `LEARNING_OS_GROQ_API_KEY` exported as a single space is an unset
    variable that does not look unset. `select.missing_credential` already
    refuses it; an adapter that accepted it would send a request guaranteed to
    come back 401 and then report the outage rather than the typo.

    (Written without the shell assignment spelled out, so the credential grep in
    `learning-os.yml` -- which looks for a NAME followed by an assigned value --
    cannot be tripped by a sentence explaining why a value is not assigned.)"""
    monkeypatch.setenv(GROQ_API_KEY_ENV, "   ")
    client, transport, _ = _client(_reply())
    with pytest.raises(LLMUnavailable, match=GROQ_API_KEY_ENV):
        client.generate(_contract())
    assert transport.calls == []


def test_the_client_holds_no_credential() -> None:
    """Not a constructor default, not an attribute. A key on the instance ends up
    in a repr, a traceback, or a pickled fixture."""
    client = GroqClient()
    assert "key" not in repr(client).lower()
    assert not any("key" in field.name.lower() for field in fields(client))


def test_the_key_travels_in_the_authorization_header_and_nowhere_else() -> None:
    """A credential in a URL is logged by every proxy between here and the
    vendor, and a credential in a body is logged by anything that records
    requests. `frontend/server/groq.ts` puts it in one header; so does this."""
    request = build_http_request(GROQ_URL, build_request(_contract()), KEY)

    assert request.get_header("Authorization") == f"Bearer {KEY}"
    assert KEY not in request.full_url
    sent = request.data
    assert isinstance(sent, bytes)
    assert KEY.encode() not in sent


def test_an_upstream_failure_never_repeats_the_body_that_carried_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """THE TEST THIS ADAPTER MOST NEEDS TO PASS.

    A 401 body from an OpenAI-compatible service routinely quotes the credential
    it just rejected. `LLMUnavailable` text reaches stderr, the behave log, and a
    CI artifact retained for thirty days, so echoing an upstream body is how a
    key ends up in public. Only the status and the vendor's short codes are
    repeated -- both are safe, and both are what a reader actually needs.
    """
    monkeypatch.setenv(GROQ_API_KEY_ENV, KEY)
    leaky = _failure(
        401,
        type_="invalid_request_error",
        code="invalid_api_key",
        message=f"Invalid API Key: {KEY}",
    )
    client, _, _ = _client(leaky)
    with pytest.raises(LLMUnavailable) as caught:
        client.generate(_contract())

    said = str(caught.value)
    assert KEY not in said
    assert "Invalid API Key" not in said
    assert "401" in said
    assert "invalid_api_key" in said


# --------------------------------------------------------------------------
# The request: the endpoint, the prompt, the schema, the ceiling
# --------------------------------------------------------------------------


def test_the_endpoint_is_the_openai_compatible_one_groq_documents() -> None:
    """Read out of `frontend/server/groq.ts`, which reaches this service today.
    A bespoke path invented here would 404 and be blamed on the key."""
    assert GROQ_URL == "https://api.groq.com/openai/v1/chat/completions"


def test_the_request_reuses_the_shared_prompt_and_system_turn() -> None:
    """Three providers building three prompts from one contract is three
    behaviours to keep in step, and they drift on the first edit to any of
    them. Only the transport is genuinely different here."""
    contract = _contract(required_terms=("base case",))
    body = build_request(contract)

    assert body["messages"][0] == {"role": "system", "content": SYSTEM}
    assert body["messages"][1] == {"role": "user", "content": build_prompt(contract)}


def test_the_request_asks_for_the_shared_schema_by_name() -> None:
    """The lesson contract is the product's, not a vendor's. A schema authored
    here would let the shape a learner's screen depends on drift because the
    model behind it changed."""
    body = build_request(_contract())
    fmt = body["response_format"]

    assert fmt["type"] == "json_schema"
    assert fmt["json_schema"]["name"] == SCHEMA_NAME
    assert fmt["json_schema"]["schema"] == RESPONSE_SCHEMA


def test_the_schema_is_not_sent_in_strict_mode() -> None:
    """MEASURED IN THIS REPOSITORY, NOT A PREFERENCE.

    `frontend/server/groq.ts` records an afternoon where every request failed
    `400 invalid_request_error` with `strict: true`: strict structured-output
    mode refuses `minItems`, `minLength`, `pattern` and `maxLength`, and demands
    every property appear in `required`. The shared schema uses two of those
    keywords, so strict mode rejects the SCHEMA before the model writes a word.

    Loosening the schema to fit the flag would be the wrong direction -- those
    bounds are the product's rules -- and nothing is lost, because the vendor was
    never the gate: `parse_blocks` and `validation.validate` both run afterwards.
    """
    keywords = {"minItems", "minLength"}
    used = {
        keyword
        for keyword in keywords
        if keyword in str(RESPONSE_SCHEMA)
    }
    assert used, "the shared schema no longer uses a keyword strict mode refuses"
    assert build_request(_contract())["response_format"]["json_schema"].get("strict") is not True


def test_the_token_ceiling_fits_the_account_rather_than_the_other_adapters() -> None:
    """MEASURED, AND COPYING THE SIBLING'S NUMBER BROKE EVERY REQUEST.

    `frontend/server/groq.ts` carried 16000 over from the Anthropic client and
    the service refused every call with 413 before writing a word: Groq reports
    this account's whole per-MINUTE budget as `x-ratelimit-limit-tokens: 8000`,
    and `max_tokens` is a RESERVATION, so each request was asking to reserve
    twice the entire minute. The other two adapters here ask for 8000, which is
    the whole budget -- so the number is chosen from what a lesson needs.
    """
    assert MAX_TOKENS == 2000
    assert MAX_TOKENS < anthropic_client.MAX_TOKENS
    assert build_request(_contract())["max_tokens"] == MAX_TOKENS


def test_the_request_names_the_model_the_client_was_built_with(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(GROQ_API_KEY_ENV, KEY)
    transport, naps = _Transport(_reply()), _Naps()
    GroqClient(model="a-smaller-model", post=transport, sleep=naps).generate(_contract())

    url, payload, key = transport.calls[0]
    assert url == GROQ_URL
    assert payload["model"] == "a-smaller-model"
    assert key == KEY


# --------------------------------------------------------------------------
# The reply: parsed by the shared rules, refused for the vendor's own reasons
# --------------------------------------------------------------------------


def test_a_usable_reply_becomes_the_blocks_the_emitter_expects(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(GROQ_API_KEY_ENV, KEY)
    client, transport, naps = _client(_reply())

    got = client.generate(_contract())

    assert got.blocks == (("prose", "A base case stops it."),)
    assert got.introduced_concepts == ("base case",)
    assert len(transport.calls) == 1
    assert naps.slept == [], "a first-attempt success must not wait for anything"


def test_the_note_names_the_provider_and_the_model() -> None:
    """Provenance has to survive into the record: `groq:` alone would not
    distinguish two models, and the decision log reads this field."""
    assert parse_blocks(_LESSON).note == f"groq:{MODEL}"


def test_the_note_names_the_model_that_actually_answered(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A note built from the module constant while the client ran a different
    model is a provenance record that is confidently wrong -- worse than none,
    because it cannot be doubted from the outside."""
    monkeypatch.setenv(GROQ_API_KEY_ENV, KEY)
    transport, naps = _Transport(_reply()), _Naps()
    got = GroqClient(model="a-smaller-model", post=transport, sleep=naps).generate(_contract())
    assert got.note == "groq:a-smaller-model"


def test_a_reply_carrying_no_choices_says_so() -> None:
    with pytest.raises(LLMUnavailable, match="no choices"):
        content_of({"choices": []})


def test_a_reply_that_is_not_an_object_says_so() -> None:
    """This crossed a network from a vendor. A shape that changed under us must
    fail with a sentence naming what was missing, never with a TypeError that
    the runtime reads as an engine bug."""
    with pytest.raises(LLMUnavailable, match="no choices"):
        content_of(["not", "an", "object"])


def test_a_choice_that_is_not_an_object_is_named_as_a_shape_problem() -> None:
    """Folded into "no text" it would read as the model having said nothing,
    which sends the reader to the prompt. The dialect moved; say so."""
    with pytest.raises(LLMUnavailable, match="not an object"):
        content_of({"choices": ["a string where an object belongs"]})


def test_a_reply_carrying_no_text_says_so() -> None:
    with pytest.raises(LLMUnavailable, match="no text"):
        content_of({"choices": [{"message": {"role": "assistant"}}]})


def test_whitespace_is_not_text() -> None:
    with pytest.raises(LLMUnavailable, match="no text"):
        content_of(_reply("   \n\t ").body)


def test_a_truncated_reply_is_reported_as_truncation_and_not_as_bad_json() -> None:
    """`finish_reason: length` means the ceiling was hit mid-JSON. Left to the
    parser it arrives as "not JSON", which sends the reader hunting a prompt bug
    when the fix is a higher ceiling or a shorter contract."""
    cut = _reply('{"blocks": [{"kind": "prose", "text": "A base ca', finish="length")
    with pytest.raises(LLMUnavailable, match="truncated"):
        content_of(cut.body)


def test_a_content_filter_is_a_decline_rather_than_an_outage() -> None:
    """The runtime retries outages. A safety decline retried is the same decision
    asked for again, forever, and it will not change."""
    with pytest.raises(LLMUnavailable, match="declined"):
        content_of(_reply("", finish="content_filter").body)


def test_a_decline_outranks_the_empty_text_it_also_produces() -> None:
    """THE ORDERING TEST, and the reason the two checks cannot be swapped.

    A refusal always arrives with empty content. Reading the content first would
    report every decline as "no text" -- an outage -- and the decline branch
    would be unreachable in production rather than merely untested.
    """
    with pytest.raises(LLMUnavailable, match="declined"):
        content_of(_reply("   ", finish="content_filter").body)


def test_a_reply_that_is_not_json_is_refused() -> None:
    with pytest.raises(LLMUnavailable, match="not JSON"):
        parse_blocks("Here is your lesson!")


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        ('{"blocks": [{"kind": "table", "text": "two columns"}]}', "cannot be built"),
        ('{"blocks": [{"kind": "prose", "text": "   "}]}', "no text"),
        ('{"blocks": []}', "no blocks"),
        ('{"blocks": ["a string"]}', "not an object"),
    ],
)
def test_the_parse_rules_are_the_shared_ones_and_not_a_lenient_copy(
    payload: str, expected: str
) -> None:
    """A second, gentler parser is how one provider comes to be allowed a
    half-lesson the others are not -- and the emitter downstream cannot tell the
    difference between a short lesson and a truncated one."""
    with pytest.raises(LLMUnavailable, match=expected):
        parse_blocks(payload)
    with pytest.raises(LLMUnavailable, match=expected):
        anthropic_client.parse_blocks(payload)


def test_content_that_breaks_the_contract_reaches_the_validator_as_violations(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """THE VALIDATION PATH, WHICH THE PARSER DELIBERATELY DOES NOT DO.

    A reply can be perfectly well-formed JSON, parse cleanly, and still have
    ignored the contract -- dropped the required term, introduced four concepts
    under a budget of one. `parse_blocks` must NOT refuse that: an unusable
    generation is a validation result the runtime can repair, not an outage it
    retries. This asserts the two stay separate and that what this client
    returns is what `validate` reads.
    """
    monkeypatch.setenv(GROQ_API_KEY_ENV, KEY)
    contract = _contract(
        required_terms=("base case",),
        simplicity=SimplicityConstraints(max_new_concepts=1),
    )
    off_contract = (
        '{"blocks": [{"kind": "prose", "text": "Something adjacent."}], '
        '"introduced_concepts": ["recursion", "stack", "frames", "unwinding"]}'
    )
    client, _, _ = _client(_reply(off_contract))

    content = client.generate(contract)
    kinds = {violation.kind for violation in validate(contract, content)}

    assert ViolationKind.MISSING_REQUIRED_TERM in kinds
    assert ViolationKind.TOO_MANY_CONCEPTS in kinds


# --------------------------------------------------------------------------
# Trying again, only where a second attempt is a different attempt
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("status", "code"),
    [(429, "rate_limit_exceeded"), (413, "rate_limit_exceeded"), (400, "json_validate_failed"),
     (500, ""), (503, "")],
)
def test_the_failures_a_second_attempt_actually_fixes(status: int, code: str) -> None:
    """MEASURED AGAINST THE LIVE API BY `frontend/server/groq.ts`, NOT GUESSED.

    `json_validate_failed` is a bad roll of the dice -- the same request asked
    again produced a correct lesson. A token budget is fixed by waiting. Both
    are different on the second attempt, which is the whole test for whether to
    make one.
    """
    assert worth_another_try(status, code) is True


@pytest.mark.parametrize(
    ("status", "code"),
    [(403, "rate_limit_exceeded"), (400, "rate_limit_exceeded"), (409, "json_validate_failed")],
)
def test_the_vendors_code_is_read_even_when_the_status_alone_would_not_say_so(
    status: int, code: str
) -> None:
    """WRITTEN BECAUSE A THIRD MUTANT SURVIVED.

    Dropping `rate_limit_exceeded` from the retryable codes changed nothing that
    any test could see: every rate limit in this file arrives as 429 or 413, and
    those statuses are retried on the last line anyway. So the code half of the
    rule was decoration as far as the suite was concerned.

    It is not decoration in front of a shared gateway, which can report an
    exhausted quota as 403 or fold it into a 400. Those are the replies where
    reading the code is the only way to know that waiting is the entire fix --
    and the one place `worth_another_try` earns its name rather than restating
    a status table.

    The opposite precedence is asserted directly above: for 401 and 404 the
    STATUS wins and no code can make them worth another attempt.
    """
    assert worth_another_try(status, code) is True


@pytest.mark.parametrize(
    ("status", "code"),
    [(400, ""), (400, "invalid_request_error"), (403, ""), (422, ""), (409, "")],
)
def test_a_request_this_client_built_wrong_is_not_retried(status: int, code: str) -> None:
    """WRITTEN BECAUSE A SECOND MUTANT SURVIVED.

    Replacing the last line of `worth_another_try` with `return True` left every
    test green: nothing here ever asked about a 4xx that is neither the
    credential, nor the model name, nor the rate limit, nor a bad roll of the
    model's dice -- so "retry absolutely everything" was indistinguishable from
    the rule that is written.

    It is not indistinguishable in production. A 400 the CLIENT caused -- a
    malformed body, a field the dialect stopped accepting -- is byte-identical
    on the second attempt, so retrying spends fifteen seconds and three requests
    out of a shared per-minute budget to arrive at the same error.

    `400 json_validate_failed` is deliberately NOT in this list: that one is the
    MODEL's output failing the schema, which the test above says is worth
    another try. The status is the same and the answer is opposite, which is
    exactly why the code has to be read rather than the status alone.
    """
    assert worth_another_try(status, code) is False


@pytest.mark.parametrize(
    "code", ["", "invalid_api_key", "model_not_found", "rate_limit_exceeded",
             "json_validate_failed"],
)
@pytest.mark.parametrize("status", [401, 404])
def test_a_rejected_credential_is_never_retried_whatever_code_arrives_with_it(
    status: int, code: str
) -> None:
    """WRITTEN BECAUSE A MUTANT SURVIVED, AND THE MUTANT WAS RIGHT ABOUT THE TESTS.

    Deleting the `status in {401, 404}` guard left the whole file green:
    `worth_another_try(401, "invalid_api_key")` still returned False, because
    with no retryable code and a status under 500 the last line reaches the same
    answer. The guard only bites when the STATUS and the CODE disagree -- a 401
    whose body carries `rate_limit_exceeded`, which a shared gateway in front of
    the service can produce -- and nothing here was asking that question.

    Unguarded, that reply is retried twice with a fourteen-second wait between:
    half a minute of hammering a credential that will never work, ending in the
    same error it started with. The status wins over the code for these two, and
    now something says so.
    """
    assert worth_another_try(status, code) is False


@pytest.mark.parametrize(("status", "code"), [(401, "invalid_api_key"), (404, "model_not_found")])
def test_the_failures_a_second_attempt_only_makes_slower(status: int, code: str) -> None:
    """A wrong key and a wrong model name are the same on the second attempt as
    the first. Retrying them turns an instant, clear failure into a slow,
    confusing one -- and against a rate limit, hammering is the one thing
    guaranteed to make it worse."""
    assert worth_another_try(status, code) is False


def test_a_rate_limited_reply_is_tried_again_and_can_succeed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Invariant: every question gets an answer. A learner who asked something
    reasonable and was told "I could not reach the part of me that answers that"
    because a shared minute-budget was briefly spent has been failed by us."""
    monkeypatch.setenv(GROQ_API_KEY_ENV, KEY)
    client, transport, naps = _client(
        _failure(429, code="rate_limit_exceeded"),
        _reply(),
    )

    got = client.generate(_contract())

    assert got.blocks == (("prose", "A base case stops it."),)
    assert len(transport.calls) == 2
    assert naps.slept == [WAIT_BEFORE_RETRY_SECONDS[0]]


def test_the_wait_comes_from_the_service_rather_than_from_a_guess(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """MEASURED: the fixed waits were picked by hand and were wrong twice.

    Groq reports the real figure on every reply -- `x-ratelimit-reset-tokens:
    12.577s` -- and both hand-picked waits expired long before it, so three
    attempts inside five seconds amounted to one attempt spent three times.
    """
    monkeypatch.setenv(GROQ_API_KEY_ENV, KEY)
    client, _, naps = _client(
        _failure(429, code="rate_limit_exceeded", headers={"x-ratelimit-reset-tokens": "12.577s"}),
        _reply(),
    )

    client.generate(_contract())

    assert naps.slept == [pytest.approx(13.077)]


@pytest.mark.parametrize(
    ("headers", "expected"),
    [
        # The figure this service actually sent, and the half-second past it: a
        # wait landing exactly on the reset instant races it, and losing spends
        # the attempt.
        ({"x-ratelimit-reset-tokens": "12.577s"}, 13.077),
        # The minute component is real and is added, not dropped. `20.5` rather
        # than `0.5` is the whole difference between reading `0m20s` and
        # ignoring everything left of the `s`.
        ({"x-ratelimit-reset-tokens": "0m20s"}, 20.5),
        # `retry-after` is bare seconds, and is read when the reset header is
        # absent.
        ({"retry-after": "12"}, 12.0),
        # Capped, in both shapes. A pause longer than this is not a retry, it is
        # a hang in front of a child.
        ({"x-ratelimit-reset-tokens": "1m2.3s"}, 30.0),
        ({"x-ratelimit-reset-tokens": "5m"}, 30.0),
        ({"retry-after": "600"}, 30.0),
        # Unrecognised, absent, empty, or zero. Every one of them falls back to
        # the caller's own wait rather than throwing: a figure we cannot parse
        # must not become a crash on a path that is already failing.
        ({"x-ratelimit-reset-tokens": "2h"}, None),
        ({}, None),
        ({"x-ratelimit-reset-tokens": ""}, None),
        ({"x-ratelimit-reset-tokens": "   "}, None),
        ({"x-ratelimit-reset-tokens": "soon"}, None),
        ({"x-ratelimit-reset-tokens": "0s"}, None),
    ],
)
def test_the_services_own_figure_is_read_in_every_shape_it_arrives_in(
    headers: Mapping[str, str], expected: float | None
) -> None:
    """MEASURED SHAPES, AND TWO OF THESE EXPECTATIONS WERE WRONG WHEN FIRST
    WRITTEN -- 63.3 for `1m2.3s`, which is 62.3 seconds and then capped, and a
    number for `2h`, which this parser deliberately does not understand. The
    code disagreed on the first run and the code was right both times.

    `frontend/server/groq.ts` caps at 30 seconds for a reason that is about a
    child rather than about HTTP: past that it is not a retry, it is a hang, and
    failing honestly so she can ask again is the better answer.
    """
    got = wait_the_service_asks_for(headers)
    if expected is None:
        assert got is None
    else:
        assert got == pytest.approx(expected)


def test_the_reset_header_outranks_retry_after_when_both_arrive() -> None:
    """The token budget is what actually blocks the next lesson, so its own
    reset figure is the truthful one. `retry-after` is the fallback."""
    both = {"x-ratelimit-reset-tokens": "12.577s", "retry-after": "1"}
    assert wait_the_service_asks_for(both) == pytest.approx(13.077)


def test_a_bad_credential_is_refused_at_once_rather_than_hammered(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(GROQ_API_KEY_ENV, KEY)
    client, transport, naps = _client(_failure(401, code="invalid_api_key"))

    with pytest.raises(LLMUnavailable, match="401"):
        client.generate(_contract())

    assert len(transport.calls) == 1
    assert naps.slept == []


def test_a_model_name_the_service_does_not_serve_is_refused_at_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(GROQ_API_KEY_ENV, KEY)
    client, transport, _ = _client(_failure(404, code="model_not_found"))

    with pytest.raises(LLMUnavailable, match="404"):
        client.generate(_contract())

    assert len(transport.calls) == 1


def test_the_attempts_are_bounded_and_the_last_failure_is_the_one_reported(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A retry loop with no ceiling is a hang, and a hang in CI is a twenty-minute
    timeout with no finding in it."""
    monkeypatch.setenv(GROQ_API_KEY_ENV, KEY)
    client, transport, naps = _client(_failure(429, code="rate_limit_exceeded"))

    with pytest.raises(LLMUnavailable, match="429"):
        client.generate(_contract())

    assert len(transport.calls) == len(WAIT_BEFORE_RETRY_SECONDS) + 1
    assert naps.slept == list(WAIT_BEFORE_RETRY_SECONDS)


def test_a_failure_body_that_is_not_json_still_names_the_status(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A gateway between here and the vendor answers HTML. The status is the
    only thing safe to repeat, and it is enough to tell the reader who failed."""
    monkeypatch.setenv(GROQ_API_KEY_ENV, KEY)
    client, _, _ = _client(Reply(status=502, body="<html>bad gateway</html>", headers={}))

    with pytest.raises(LLMUnavailable, match="502") as caught:
        client.generate(_contract())
    assert "html" not in str(caught.value)


# --------------------------------------------------------------------------
# Anything the transport can throw is this layer's vocabulary by the time it
# leaves
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "error",
    [RuntimeError("x"), ValueError("x"), OSError("x"), KeyError("x"), TimeoutError("x")],
)
def test_every_transport_exception_becomes_unavailable(
    monkeypatch: pytest.MonkeyPatch, error: Exception
) -> None:
    """This layer promises "any provider problem is `LLMUnavailable`". Letting
    one transport's exception class escape would make the runtime's retry
    decision depend on which provider happens to be configured."""
    monkeypatch.setenv(GROQ_API_KEY_ENV, KEY)

    def explode(_url: str, _payload: dict[str, Any], _key: str) -> Reply:
        raise error

    with pytest.raises(LLMUnavailable, match="could not be reached"):
        GroqClient(post=explode).generate(_contract())


def test_the_original_error_is_chained_rather_than_swallowed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A wrapped cause that loses the original is how a stack trace stops naming
    the thing that actually broke."""
    monkeypatch.setenv(GROQ_API_KEY_ENV, KEY)
    original = OSError("connection reset by peer")

    def explode(_url: str, _payload: dict[str, Any], _key: str) -> Reply:
        raise original

    with pytest.raises(LLMUnavailable) as caught:
        GroqClient(post=explode).generate(_contract())
    assert caught.value.__cause__ is original


def test_an_unavailable_from_the_transport_is_not_rewrapped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The transport already speaks this vocabulary for the failures it can name.
    Re-wrapping would bury a specific message under a generic one."""
    monkeypatch.setenv(GROQ_API_KEY_ENV, KEY)
    precise = LLMUnavailable("nothing is listening on api.groq.com")

    def explode(_url: str, _payload: dict[str, Any], _key: str) -> Reply:
        raise precise

    with pytest.raises(LLMUnavailable) as caught:
        GroqClient(post=explode).generate(_contract())
    assert caught.value is precise


# --------------------------------------------------------------------------
# THE REAL TRANSPORT, WHICH NOTHING HAD EVER RUN
#
# Every test above injects `post`, which is right for the retry logic and leaves
# `_post` -- the function that actually talks to Groq -- unexecuted. Measured
# before this block: lines 254-257 and 267-276 of `groq_client.py` uncovered,
# which is the whole of the success path and the whole of the HTTPError path.
#
# The distinction those two paths draw is the retry decision itself, and it is
# the reason this file exists: a 429 is an ANSWER that says "later", so it comes
# back as a `Reply`; a refused connection is not an answer, so it raises. Nothing
# proved that `_post` actually draws the line where the docstring says it does.
#
# `urlopen` is the only thing faked. The request is built by the real
# `build_http_request`, the error is a genuine `urllib.error.HTTPError`, and
# `_decode` is the real one -- which is what lets the HTML case below be honest.
# --------------------------------------------------------------------------



@contextmanager
def _answers(status: int, body: bytes, headers: dict[str, str] | None = None) -> Iterator[Any]:
    class _Response:
        def __init__(self) -> None:
            self.status = status
            self.headers = headers or {}

        def read(self) -> bytes:
            return body

    yield _Response()


def test_a_200_comes_back_as_a_reply_with_its_body_and_headers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        urllib.request,
        "urlopen",
        lambda *_a, **_k: _answers(200, b'{"choices":[]}', {"X-RateLimit-Limit-Tokens": "8000"}),
    )

    reply = _post("https://api.groq.com/openai/v1/chat/completions", {"model": "m"}, "k")

    assert reply.status == 200
    assert reply.body == {"choices": []}
    # LOWERCASED, because HTTP header names are case-insensitive and every reader
    # of this dict looks them up in lower case.
    assert reply.headers["x-ratelimit-limit-tokens"] == "8000"


def test_a_429_is_returned_as_an_answer_rather_than_raised(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """THE WHOLE POINT OF THE FUNCTION. urllib raises HTTPError on a 429, and a
    transport that let it propagate would force the retry loop to read a status
    off an exception."""

    def _raise(*_a: object, **_k: object) -> None:
        raise urllib.error.HTTPError(
            "https://api.groq.com/openai/v1/chat/completions",
            429,
            "Too Many Requests",
            {"Retry-After": "12"},  # type: ignore[arg-type]
            _io.BytesIO(b'{"error":{"code":"rate_limit_exceeded"}}'),
        )

    monkeypatch.setattr(urllib.request, "urlopen", _raise)

    reply = _post("https://api.groq.com/openai/v1/chat/completions", {"model": "m"}, "k")

    assert reply.status == 429
    assert reply.headers["retry-after"] == "12"
    assert isinstance(reply.body, dict)


def test_a_gateways_html_error_page_stays_text_instead_of_becoming_a_json_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A JSONDecodeError out of the transport reads as "the model returned bad
    JSON", which is a different failure with a different remedy."""

    def _raise(*_a: object, **_k: object) -> None:
        raise urllib.error.HTTPError(
            "https://api.groq.com/openai/v1/chat/completions",
            502,
            "Bad Gateway",
            {},  # type: ignore[arg-type]
            _io.BytesIO(b"<html>502 Bad Gateway</html>"),
        )

    monkeypatch.setattr(urllib.request, "urlopen", _raise)

    reply = _post("https://api.groq.com/openai/v1/chat/completions", {"model": "m"}, "k")

    assert reply.status == 502
    assert reply.body == "<html>502 Bad Gateway</html>"
