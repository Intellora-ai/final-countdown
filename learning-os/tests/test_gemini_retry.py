"""The Gemini client's retry, reachable without the SDK, a key, or a socket.

MEASURED BEFORE IT WAS WRITTEN, on CI run 33596448923 (real-tutor, Gemini):
"the whole class asks at once" and "Ada refreshes and asks again" both came
back `unavailable` while every single-ask scenario answered. A burst met the
requests-per-minute ceiling, the service answered 429 with its own
`retryDelay`, and `_send` folded that into a bare LLMUnavailable on the first
attempt. This file is the retry that answer deserved, proven in both
directions: what is retried, what is not, and how long the wait is.
"""

from __future__ import annotations

import pytest

from learning_os.llm.client import GeneratedContent, LLMUnavailable
from learning_os.llm.gemini_client import (
    Unreachable,
    _status_of,
    _wait_named_in,
    generate_with_retries,
)

ANSWER = GeneratedContent(blocks=(("prose", "a base case stops it"),), note="gemini:test")


class _SdkError(Exception):
    """The shape the google-genai SDK's APIError presents: a `code` and a message."""

    def __init__(self, code: int, message: str) -> None:
        super().__init__(message)
        self.code = code


def _refused_then_answers(refusals: list[Unreachable]) -> tuple[list[int], object]:
    calls: list[int] = []

    def send() -> GeneratedContent:
        calls.append(1)
        if refusals:
            raise refusals.pop(0)
        return ANSWER

    return calls, send


def test_a_rate_limit_is_retried_after_the_wait_the_service_named() -> None:
    slept: list[float] = []
    calls, send = _refused_then_answers(
        [Unreachable("429 RESOURCE_EXHAUSTED", status=429, asked_to_wait=19.5)]
    )
    answer = generate_with_retries(send, sleep=slept.append)  # type: ignore[arg-type]
    assert answer is ANSWER
    assert len(calls) == 2, "the second attempt never happened"
    assert slept == [19.5], "the wait was not the one the service asked for"


def test_a_rate_limit_with_no_named_wait_uses_the_fixed_schedule() -> None:
    slept: list[float] = []
    calls, send = _refused_then_answers(
        [Unreachable("429", status=429), Unreachable("429", status=429)]
    )
    answer = generate_with_retries(send, sleep=slept.append, waits=(0.8, 14.0))  # type: ignore[arg-type]
    assert answer is ANSWER
    assert len(calls) == 3
    assert slept == [0.8, 14.0]


def test_a_bad_key_is_not_retried() -> None:
    """401 on the second attempt is identical to 401 on the first."""
    slept: list[float] = []
    calls, send = _refused_then_answers([Unreachable("401 API_KEY_INVALID", status=401)])
    with pytest.raises(LLMUnavailable):
        generate_with_retries(send, sleep=slept.append)  # type: ignore[arg-type]
    assert len(calls) == 1
    assert slept == []


def test_an_error_with_no_status_is_not_retried() -> None:
    """A vendor error of unknown shape is not a reason to spend more calls."""
    calls, send = _refused_then_answers([Unreachable("something odd")])
    with pytest.raises(LLMUnavailable):
        generate_with_retries(send, sleep=lambda _s: None)  # type: ignore[arg-type]
    assert len(calls) == 1


def test_a_ceiling_that_never_lifts_stops_after_the_schedule() -> None:
    slept: list[float] = []
    calls, send = _refused_then_answers(
        [Unreachable("429", status=429, asked_to_wait=2.0)] * 5
    )
    with pytest.raises(LLMUnavailable):
        generate_with_retries(send, sleep=slept.append, waits=(1.0, 1.0))  # type: ignore[arg-type]
    assert len(calls) == 3, "more attempts were spent than the schedule allows"
    assert slept == [2.0, 2.0]


def test_the_status_and_the_wait_are_read_from_the_sdk_error_without_the_sdk() -> None:
    error = _SdkError(
        429,
        "429 RESOURCE_EXHAUSTED. {'error': {'code': 429, 'status': 'RESOURCE_EXHAUSTED', "
        "'details': [{'@type': 'type.googleapis.com/google.rpc.RetryInfo', "
        "'retryDelay': '19s'}]}}",
    )
    assert _status_of(error) == 429
    assert _wait_named_in(error) == 19.5, "the service's own figure, plus the half-second margin"

    assert _status_of(ValueError("no code here")) is None
    assert _wait_named_in(ValueError("no delay here")) is None


def test_a_named_wait_is_capped_so_a_retry_never_becomes_a_hang() -> None:
    error = _SdkError(429, "retryDelay: '600s'")
    assert _wait_named_in(error) == 30.0
