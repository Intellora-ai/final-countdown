"""Tests for the Ollama provider — the local one.

WHY THIS PROVIDER IS DIFFERENT FROM THE OTHER TWO
--------------------------------------------------
No API key, no rate limit, no bill, no network. The model runs on the machine
that runs the engine, so the failure modes are different in kind: the credential
errors that dominate a hosted client are replaced by "the server is not running"
and "the model is not pulled".

WHY THE RESPONSE SHAPE HERE IS TRUSTWORTHY
------------------------------------------
It was measured, not remembered. A real call to a real server on this machine
returned:

    keys          created_at, done, done_reason, eval_count, message, model, ...
    message keys  content, role
    done_reason   "stop"
    content       '{"blocks": [{"kind": "...", "text": "..."}]}'

Ollama 0.32.15, HTTP 200, 3.6s. Structured output via `format` works, so the
content is JSON rather than prose that has to be scraped.

THE TRANSPORT IS STILL INJECTED
-------------------------------
Even though the server is local, `tests/conftest.py` blocks `socket.connect` for
every test, and localhost is still a socket. A test that needs the harness to
permit what it forbids is a test that passes for the wrong reason.
"""

from __future__ import annotations

import io as _io
import json
import urllib.error
import urllib.request
from contextlib import contextmanager
from typing import Any

import pytest

from learning_os.llm.client import GeneratedContent, LLMUnavailable
from learning_os.llm.contract import (
    DiagnosisKind,
    InstructionContract,
    Strategy,
)
from learning_os.llm.ollama_client import (
    DEFAULT_HOST,
    OLLAMA_HOST_ENV,
    OllamaClient,
    _post,
    build_request,
)
from learning_os.models.contracts import ActionKind

SKILL = "python.recursion.identify_base_case"


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


_OK_TEXT = '{"blocks":[{"kind":"prose","text":"A base case stops it."}]}'


def _ok(text: str = _OK_TEXT) -> dict[str, Any]:
    """The shape a real server returned. Fields it also sends are omitted on
    purpose -- depending on them would couple these tests to telemetry."""
    return {"model": "qwen3:8b", "message": {"role": "assistant", "content": text},
            "done": True, "done_reason": "stop"}


# --- CONTRACT -------------------------------------------------------------

def test_it_satisfies_the_same_protocol_as_the_fake() -> None:
    from learning_os.llm.client import FakeLLMClient

    assert OllamaClient().generate.__annotations__ == FakeLLMClient().generate.__annotations__


def test_it_needs_no_credential_at_all() -> None:
    """The whole point of the local provider. Constructing and calling it must
    not consult any key variable."""
    got = OllamaClient(post=lambda _url, _payload: _ok()).generate(_contract())
    assert got.blocks == (("prose", "A base case stops it."),)


# --- INTEGRATION: the request carries the contract -------------------------

def test_the_request_reuses_the_shared_prompt_and_system() -> None:
    from learning_os.llm.anthropic_client import SYSTEM, build_prompt

    body = build_request(_contract(required_terms=("base case",)), model="qwen3:8b")
    assert body["messages"][0]["role"] == "system"
    assert body["messages"][0]["content"] == SYSTEM
    assert body["messages"][1]["role"] == "user"
    assert body["messages"][1]["content"] == build_prompt(
        _contract(required_terms=("base case",))
    )


def test_the_request_asks_for_the_shared_schema_and_no_streaming() -> None:
    """`stream: false` is required, not stylistic: a streamed reply arrives as
    many JSON objects and `json.loads` on the whole body fails."""
    from learning_os.llm.anthropic_client import RESPONSE_SCHEMA

    body = build_request(_contract(), model="qwen3:8b")
    assert body["stream"] is False
    assert body["format"] == RESPONSE_SCHEMA
    assert body["model"] == "qwen3:8b"


# --- UNIT: failure vocabulary ---------------------------------------------

def test_a_truncated_reply_is_reported_as_truncated_not_as_bad_json() -> None:
    """done_reason 'length' means the model hit the token ceiling mid-JSON.

    Letting that fall through to the JSON parser reports 'the model returned
    something that is not JSON', which sends the reader looking for a prompt
    bug instead of raising the limit.
    """
    body = _ok('{"blocks":[{"kind":"prose","text":"half a sen')
    body["done_reason"] = "length"
    with pytest.raises(LLMUnavailable, match=r"truncated|length"):
        OllamaClient(post=lambda _url, _payload: body).generate(_contract())


def test_a_server_that_is_not_running_says_so_and_says_how_to_start_it() -> None:
    def refused(_url: str, _payload: dict[str, Any]) -> dict[str, Any]:
        raise ConnectionRefusedError("Connection refused")

    with pytest.raises(LLMUnavailable) as caught:
        OllamaClient(post=refused).generate(_contract())
    assert "ollama serve" in str(caught.value)


def test_a_missing_model_names_the_pull_command() -> None:
    """Ollama answers 404 for a model that was never pulled. 'not found' alone
    sends the reader to the wrong place; the fix is one command."""
    def missing(_url: str, _payload: dict[str, Any]) -> dict[str, Any]:
        raise LLMUnavailable('model "qwen3:8b" not found, try pulling it first')

    with pytest.raises(LLMUnavailable, match="ollama pull"):
        OllamaClient(post=missing).generate(_contract())


def test_empty_content_is_reported_as_no_text() -> None:
    with pytest.raises(LLMUnavailable, match="no text"):
        OllamaClient(post=lambda _url, _payload: _ok("   ")).generate(_contract())


# --- BOUNDARY --------------------------------------------------------------

@pytest.mark.parametrize(
    "body",
    [
        {},
        {"message": None},
        {"message": {}},
        {"message": {"content": None}},
        {"message": {"content": 42}},
        {"message": []},
    ],
    ids=["empty", "null-message", "no-content", "null-content", "int-content", "list-message"],
)
def test_a_malformed_response_never_escapes_as_a_raw_exception(body: dict[str, Any]) -> None:
    with pytest.raises(LLMUnavailable):
        OllamaClient(post=lambda _url, _payload: body).generate(_contract())


# --- PROPERTY: one failure vocabulary, whatever went wrong ------------------

@pytest.mark.parametrize(
    "error",
    [
        ValueError("x"), TypeError("x"), KeyError("x"), OSError("x"), RuntimeError("x"),
        AttributeError("x"), IndexError("x"), MemoryError(), TimeoutError("x"),
        json.JSONDecodeError("x", "", 0), ConnectionError("x"), BrokenPipeError("x"),
    ],
)
def test_every_transport_exception_becomes_llm_unavailable(error: Exception) -> None:
    """THE INVARIANT. `runtime/loop.py` routes 'unreachable' differently from
    'unusable', and a third exception type removes that choice from the caller."""
    def boom(_url: str, _payload: dict[str, Any]) -> dict[str, Any]:
        raise error

    with pytest.raises(LLMUnavailable):
        OllamaClient(post=boom).generate(_contract())


# --- CONFIG ----------------------------------------------------------------

def test_the_host_defaults_to_localhost_and_is_overridable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[str] = []

    def spy(url: str, _payload: dict[str, Any]) -> dict[str, Any]:
        seen.append(url)
        return _ok()

    monkeypatch.delenv(OLLAMA_HOST_ENV, raising=False)
    OllamaClient(post=spy).generate(_contract())
    assert seen[0].startswith(DEFAULT_HOST)

    monkeypatch.setenv(OLLAMA_HOST_ENV, "http://192.168.1.50:11434")
    OllamaClient(post=spy).generate(_contract())
    assert seen[1].startswith("http://192.168.1.50:11434")


# --- ORACLE ----------------------------------------------------------------

def test_a_well_formed_response_parses_via_the_shared_parser() -> None:
    """The oracle is `parse_blocks`, shared with both other providers."""
    got = OllamaClient(post=lambda _url, _payload: _ok()).generate(_contract())
    assert isinstance(got, GeneratedContent)
    assert got.blocks == (("prose", "A base case stops it."),)


# --------------------------------------------------------------------------
# THE REAL TRANSPORT, WHICH NOTHING HAD EVER RUN
#
# Every test above injects `post`, which is right for the client's own logic and
# leaves `_post` -- the function that actually talks to Ollama -- unexecuted.
# Measured before this block: `ollama_client.py` at 74%, the lowest file in the
# package, and the whole of `_post` was the hole.
#
# WHAT IS FAKED IS `urlopen` AND NOTHING ELSE. The request is built by the real
# `_post`, the errors are genuine `urllib.error.HTTPError` objects, and the
# translation from an HTTP status to a sentence a person can act on is the real
# code. `tests/conftest.py` blocks `socket.connect` for every test in this suite,
# so a real local server is not available to test against and would not be
# honest here either: the failures below are the ones a running Ollama does not
# produce.
# --------------------------------------------------------------------------



@contextmanager
def _answers(body: bytes):
    class _Response:
        def read(self) -> bytes:
            return body

    yield _Response()


def _http_error(code: int, body: bytes) -> urllib.error.HTTPError:
    """A genuine HTTPError, built the way urllib builds one."""
    return urllib.error.HTTPError(
        "http://127.0.0.1:11434/api/chat", code, "", {}, _io.BytesIO(body)
    )


def test_a_json_object_comes_back_as_a_dict(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        urllib.request, "urlopen", lambda *_a, **_k: _answers(b'{"message":{"content":"hi"}}')
    )
    assert _post("http://127.0.0.1:11434/api/chat", {"model": "m"}) == {
        "message": {"content": "hi"}
    }


def test_a_404_names_the_command_that_fixes_it(monkeypatch: pytest.MonkeyPatch) -> None:
    """The one failure a first-time reader actually hits: the server is running
    and the model was never pulled. A generic "the server answered 404" sends
    them to check the port, which is fine."""

    def _raise(*_a: object, **_k: object) -> None:
        raise _http_error(404, b'{"error":"model \'qwen\' not found"}')

    monkeypatch.setattr(urllib.request, "urlopen", _raise)

    with pytest.raises(LLMUnavailable) as caught:
        _post("http://127.0.0.1:11434/api/chat", {"model": "qwen"})

    assert "ollama pull" in str(caught.value)


def test_any_other_status_carries_the_code_and_the_body(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A 500 is not a missing model, so it must not offer `ollama pull` as the
    remedy -- that is the wrong instruction confidently given."""

    def _raise(*_a: object, **_k: object) -> None:
        raise _http_error(500, b"the runner crashed")

    monkeypatch.setattr(urllib.request, "urlopen", _raise)

    with pytest.raises(LLMUnavailable) as caught:
        _post("http://127.0.0.1:11434/api/chat", {"model": "m"})

    said = str(caught.value)
    assert "500" in said
    assert "the runner crashed" in said
    assert "ollama pull" not in said


def test_a_body_that_is_not_an_object_is_refused_rather_than_indexed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A proxy or a captive portal answers 200 with something else entirely.
    Indexing it would raise a TypeError the runtime reads as an engine bug."""
    monkeypatch.setattr(
        urllib.request, "urlopen", lambda *_a, **_k: _answers(b'["not", "a", "map"]')
    )

    with pytest.raises(LLMUnavailable) as caught:
        _post("http://127.0.0.1:11434/api/chat", {"model": "m"})

    assert "not an object" in str(caught.value)
