"""Tests for the Gemini provider.

WHY THIS EXISTS AND WHY IT IS NOT AN SDK WRAPPER
------------------------------------------------
`LLMClient` is a Protocol with one method, so a second provider is a new file
rather than a change to an existing one. Nothing that calls `generate()` needs
to know which model answered.

It speaks REST over `urllib` rather than through `google-genai`, and that is a
constraint rather than a preference: `tests/test_supply_chain.py` rejects any
install that is not hash-locked, and CI installs only the locked base set. An
optional SDK would either fail that gate or go untested. The REST surface needs
no package at all.

THE TRANSPORT IS INJECTED
-------------------------
`GeminiClient(post=...)` takes the function that performs the request. The
default one uses `urllib`. Every test below drives a stub instead, so the suite
never opens a socket -- which `tests/conftest.py` blocks anyway, and a test that
depends on being allowed to do the thing the harness forbids is a test that
passes for the wrong reason.
"""

from __future__ import annotations

import json

import pytest

from learning_os.llm.client import GeneratedContent, LLMUnavailable
from learning_os.llm.contract import (
    ActionKind,
    DiagnosisKind,
    InstructionContract,
    Strategy,
)
from learning_os.llm.gemini_client import (
    GEMINI_API_KEY_ENV,
    GeminiClient,
    build_request,
)

SKILL = "python.recursion.identify_base_case"


def _contract(**over: object) -> InstructionContract:
    base: dict[str, object] = {
        "target_skill": SKILL,
        "question": "Why does this recursion never stop?",
        "diagnosis": DiagnosisKind.CONCEPT_GAP,
        "strategy": Strategy.WORKED_EXAMPLE,
        "action": ActionKind.TEACH_BY_EXAMPLE,
        "success_evidence_required": "names the base case",
    }
    base.update(over)
    return InstructionContract(**base)  # type: ignore[arg-type]


def _ok_body(text: str = '{"blocks":[{"kind":"prose","text":"A base case stops it."}]}') -> dict:
    return {"candidates": [{"content": {"parts": [{"text": text}]}, "finishReason": "STOP"}]}


# --- CONTRACT: it is a drop-in for the fake -------------------------------

def test_it_satisfies_the_same_protocol_as_the_fake() -> None:
    """A provider that does not fit the seam is a provider nobody can use."""
    from learning_os.llm.client import FakeLLMClient

    assert hasattr(GeminiClient(), "generate")
    assert GeminiClient().generate.__annotations__ == FakeLLMClient().generate.__annotations__


# --- INTEGRATION: the request carries the contract ------------------------

def test_the_request_carries_the_system_prompt_and_the_built_prompt() -> None:
    """The prompt builder is SHARED with the Anthropic path, deliberately.

    Two providers building two prompts from one contract is two behaviours to
    keep in step, and they would drift on the first change to either.
    """
    from learning_os.llm.anthropic_client import SYSTEM, build_prompt

    body = build_request(_contract(required_terms=("base case",)))

    assert body["systemInstruction"]["parts"][0]["text"] == SYSTEM
    assert body["contents"][0]["parts"][0]["text"] == build_prompt(
        _contract(required_terms=("base case",))
    )
    assert body["contents"][0]["role"] == "user"


def test_the_request_asks_for_json_matching_the_shared_schema() -> None:
    """Free-form prose would make `parse_blocks` the only thing standing
    between a chatty model and the renderer."""
    from learning_os.llm.anthropic_client import RESPONSE_SCHEMA

    cfg = build_request(_contract())["generationConfig"]
    assert cfg["responseMimeType"] == "application/json"
    assert cfg["responseSchema"] == RESPONSE_SCHEMA


# --- UNIT: the failure vocabulary is the SAME as the other provider -------

def test_a_missing_key_names_the_variable_and_the_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv(GEMINI_API_KEY_ENV, raising=False)
    with pytest.raises(LLMUnavailable) as caught:
        GeminiClient().generate(_contract())
    assert GEMINI_API_KEY_ENV in str(caught.value)
    assert "FakeLLMClient" in str(caught.value)


def test_a_safety_refusal_is_not_reported_as_an_outage(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A refusal must not enter the retry path, or it loops forever."""
    monkeypatch.setenv(GEMINI_API_KEY_ENV, "not-a-real-key")
    body = {"candidates": [{"content": {"parts": []}, "finishReason": "SAFETY"}]}
    with pytest.raises(LLMUnavailable, match="declined"):
        GeminiClient(post=lambda url, payload: body).generate(_contract())


def test_no_candidates_is_reported_as_no_lesson(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(GEMINI_API_KEY_ENV, "not-a-real-key")
    with pytest.raises(LLMUnavailable, match="no text"):
        GeminiClient(post=lambda url, payload: {"candidates": []}).generate(_contract())


def test_empty_text_is_reported_as_no_text(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(GEMINI_API_KEY_ENV, "not-a-real-key")
    with pytest.raises(LLMUnavailable, match="no text"):
        GeminiClient(post=lambda url, payload: _ok_body("   ")).generate(_contract())


# --- BOUNDARY: malformed everything ---------------------------------------

@pytest.mark.parametrize(
    "body",
    [
        {},
        {"candidates": None},
        {"candidates": [{}]},
        {"candidates": [{"content": {}}]},
        {"candidates": [{"content": {"parts": None}}]},
        {"candidates": [{"content": {"parts": [{}]}}]},
    ],
    ids=["empty", "null-candidates", "no-content", "no-parts", "null-parts", "part-no-text"],
)
def test_a_malformed_response_never_escapes_as_a_raw_exception(
    monkeypatch: pytest.MonkeyPatch, body: dict
) -> None:
    """Every shape the provider can return must arrive as LLMUnavailable.

    A `KeyError` or `TypeError` reaching the runtime would be read as a bug in
    the engine rather than a bad response, and routed nowhere.
    """
    monkeypatch.setenv(GEMINI_API_KEY_ENV, "not-a-real-key")
    with pytest.raises(LLMUnavailable):
        GeminiClient(post=lambda url, payload: body).generate(_contract())


# --- FAILURE: the transport dies ------------------------------------------

def test_a_transport_failure_becomes_unavailable_not_the_raw_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(GEMINI_API_KEY_ENV, "not-a-real-key")

    def boom(url: str, payload: dict) -> dict:
        raise OSError("connection reset by peer")

    with pytest.raises(LLMUnavailable, match="could not be reached"):
        GeminiClient(post=boom).generate(_contract())


# --- PROPERTY: the invariant across every exception type ------------------

@pytest.mark.parametrize(
    "error",
    [
        ValueError("bad"), TypeError("bad"), KeyError("bad"), OSError("bad"),
        RuntimeError("bad"), AttributeError("bad"), IndexError("bad"),
        UnicodeDecodeError("utf-8", b"", 0, 1, "bad"), MemoryError(),
        json.JSONDecodeError("bad", "", 0), TimeoutError("bad"), ConnectionError("bad"),
    ],
)
def test_every_transport_exception_becomes_llm_unavailable(
    monkeypatch: pytest.MonkeyPatch, error: Exception
) -> None:
    """THE INVARIANT: one failure vocabulary, whatever went wrong underneath.

    `runtime/loop.py` distinguishes "could not reach the model" from "the model
    returned something unusable" and routes them differently. Any third
    exception type escaping here removes that distinction from the caller.
    Twelve exception types, one required outcome.
    """
    monkeypatch.setenv(GEMINI_API_KEY_ENV, "not-a-real-key")

    def boom(url: str, payload: dict) -> dict:
        raise error

    with pytest.raises(LLMUnavailable):
        GeminiClient(post=boom).generate(_contract())


# --- ORACLE: a good response produces the same value as the other path ----

def test_a_well_formed_response_parses_to_the_expected_blocks(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The oracle is `parse_blocks`, shared with the Anthropic client -- not
    'whatever this code returned the day it was written'."""
    monkeypatch.setenv(GEMINI_API_KEY_ENV, "not-a-real-key")
    got = GeminiClient(post=lambda url, payload: _ok_body()).generate(_contract())
    assert isinstance(got, GeneratedContent)
    assert got.blocks == (("prose", "A base case stops it."),)


def test_the_key_is_never_placed_in_the_returned_value(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A credential that reaches a lesson block reaches a learner's screen."""
    monkeypatch.setenv(GEMINI_API_KEY_ENV, "super-secret-key-value")
    got = GeminiClient(post=lambda url, payload: _ok_body()).generate(_contract())
    assert "super-secret-key-value" not in repr(got)
