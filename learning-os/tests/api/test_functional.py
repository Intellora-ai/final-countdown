"""P7-T1 — the API as a caller sees it: status codes, errors, pagination.

HOW THIS DIFFERS FROM tests/http/test_routes.py
------------------------------------------------
`tests/http` asks whether each route returns the shape its own schema declares.
That is a question about the contract.

This file asks the questions a CALLER asks, which the contract does not answer:
what does a mistake look like, is the error shape the same for every kind of
mistake, does a wrong method say so rather than 404, and does pagination behave
like a window rather than a suggestion. A caller writes error handling once and
expects it to work everywhere; that expectation is only true if it is tested.

NO DATABASE, NO NETWORK
-----------------------
The app runs in-process over ASGI. `tests/conftest.py` already refuses sockets
for the whole suite, so a route that quietly grew a network call fails here.
"""

from __future__ import annotations

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
    response = client.post("/learners", json={"cohort": "y11"})
    assert response.status_code == 201, response.text
    return str(response.json()["learner_id"])


# ---------------------------------------------------------------------------
# The error envelope -- one shape, or a caller cannot handle errors generically
# ---------------------------------------------------------------------------


def test_a_validation_error_and_a_not_found_share_one_envelope(
    client: TestClient,
) -> None:
    """Every error carries `detail`, whatever kind of error it is.

    A caller writes one error handler. If a 422 returns `{"detail": [...]}` and
    a 404 returns `{"message": "..."}`, that handler is wrong half the time and
    the half it is wrong about is the half nobody tested.
    """
    missing = client.get("/learners/00000000-0000-4000-8000-000000000000")
    invalid = client.get("/concepts?limit=0")

    assert missing.status_code == 404
    assert invalid.status_code == 422
    for response in (missing, invalid):
        assert "detail" in response.json(), response.text
        assert response.headers["content-type"].startswith("application/json")


def test_a_validation_error_names_the_field_that_was_wrong(
    client: TestClient,
) -> None:
    """"Invalid request" is not an error message a caller can act on.

    The field and the reason are what turn a 422 into a fix. This is the
    difference between an API somebody can integrate against and one they have
    to guess at.
    """
    response = client.post("/learners", json={"cohort": ""})
    assert response.status_code == 422

    detail: list[dict[str, Any]] = response.json()["detail"]
    assert any("cohort" in map(str, item.get("loc", [])) for item in detail), detail


def test_an_unknown_route_is_404_and_not_a_crash(client: TestClient) -> None:
    response = client.get("/no-such-route")
    assert response.status_code == 404


def test_the_wrong_method_says_so_rather_than_404(client: TestClient) -> None:
    """405, not 404. They mean different things to a caller.

    404 says "this does not exist, stop asking". 405 says "this exists, you used
    the wrong verb". Collapsing them sends an integrator looking for a typo in a
    path that was correct.
    """
    assert client.delete("/concepts").status_code == 405


def test_a_malformed_json_body_is_refused_cleanly(client: TestClient) -> None:
    response = client.post(
        "/learners",
        content=b"{not json at all",
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422
    assert "detail" in response.json()


def test_a_body_of_the_wrong_type_is_refused(client: TestClient) -> None:
    """A JSON array where an object belongs. Valid JSON, wrong shape."""
    response = client.post("/learners", json=["y11"])
    assert response.status_code == 422


def test_an_unknown_field_in_the_body_is_refused(client: TestClient) -> None:
    """`extra="forbid"` reaches the REQUEST models too, not only responses.

    Accepting an unknown field means silently ignoring it, and a caller who
    misspells `cohort` as `cohorts` gets a 201 and a learner with the wrong
    cohort. Refusing it turns a silent data error into a visible one.
    """
    response = client.post("/learners", json={"cohort": "y11", "cohortt": "typo"})
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Pagination and filtering
# ---------------------------------------------------------------------------


def test_total_counts_the_collection_not_the_page(client: TestClient) -> None:
    page = client.get("/concepts?limit=1").json()
    assert len(page["items"]) == 1
    assert page["total"] == len(GRAPH.concepts)
    assert page["total"] > 1, "the fixture graph is too small to prove anything"


def test_the_window_echoes_back_what_was_asked_for(client: TestClient) -> None:
    """`limit` and `offset` come back in the response.

    A caller paginating without them has to remember what it asked for, and the
    first time a server clamps a limit the caller's arithmetic is silently
    wrong.
    """
    page = client.get("/concepts?limit=1&offset=1").json()
    assert page["limit"] == 1
    assert page["offset"] == 1


@pytest.mark.parametrize("query", ["limit=0", "limit=201", "offset=-1", "limit=abc"])
def test_a_bad_window_is_refused_rather_than_clamped(
    client: TestClient, query: str
) -> None:
    """Refused, not silently corrected.

    A server that clamps `limit=0` to 1 answers a question nobody asked and the
    caller never learns their request was wrong. Every one of these is a caller
    bug, and each should surface as one.
    """
    assert client.get(f"/concepts?{query}").status_code == 422


def test_a_filter_that_matches_nothing_is_an_empty_page_not_an_error(
    client: TestClient,
) -> None:
    """Empty is a legitimate answer to a well-formed question."""
    page = client.get("/concepts?subject=nosuchsubject").json()
    assert page["items"] == []
    assert page["total"] == 0


def test_a_filter_that_matches_narrows_the_total(client: TestClient) -> None:
    """The PAIR. Without it, a filter that matched nothing ever would pass."""
    subject = GRAPH.concepts[0].concept_id.split(".")[0]
    page = client.get(f"/concepts?subject={subject}").json()
    assert page["total"] > 0
    assert all(item["concept_id"].startswith(f"{subject}.") for item in page["items"])


# ---------------------------------------------------------------------------
# Status codes that carry meaning
# ---------------------------------------------------------------------------


def test_creating_a_learner_is_201_not_200(client: TestClient) -> None:
    """201 means something was created. 200 means a response was produced.

    A caller distinguishing "created" from "already existed" needs the
    difference, and the idempotency tests depend on it.
    """
    assert client.post("/learners", json={"cohort": "y11"}).status_code == 201


def test_reading_a_learner_is_200(client: TestClient) -> None:
    learner_id = _learner(client)
    assert client.get(f"/learners/{learner_id}").status_code == 200


def test_recording_an_attempt_for_an_unknown_learner_is_404_not_422(
    client: TestClient,
) -> None:
    """The body is valid; the learner is not. That is a 404, not a 422.

    A 422 tells the caller to fix their request. Nothing is wrong with the
    request -- the learner does not exist, and no amount of editing the body
    changes that.
    """
    response = client.post(
        "/learners/00000000-0000-4000-8000-000000000000/attempts",
        json={
            "skill_id": KNOWN_SKILL,
            "correct": True,
            "representation": "code",
            "context_novelty": 0.5,
        },
        headers={"Idempotency-Key": "ghost"},
    )
    assert response.status_code == 404


def test_no_route_returns_a_5xx_for_a_caller_mistake(client: TestClient) -> None:
    """A caller mistake is never the server's fault.

    Every request below is wrong in some way. A 5xx for any of them is a bug in
    the API, and it is the class of bug Schemathesis is about to look for at
    scale -- this is the hand-written floor under that.
    """
    attempts = [
        client.get("/concepts?limit=-5"),
        client.get("/learners/%20"),
        client.post("/learners", json={}),
        client.post("/lessons", json={"skill_id": "", "question": ""}),
        client.post("/learners", content=b"\x00\x01\x02"),
    ]
    offenders = [r for r in attempts if r.status_code >= 500]
    assert offenders == [], [
        (r.request.method, str(r.request.url), r.status_code) for r in offenders
    ]
