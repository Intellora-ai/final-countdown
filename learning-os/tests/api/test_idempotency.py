"""P7-T2 — idempotency over HTTP: the same POST twice, one effect, one answer.

WHY THIS EXISTS SEPARATELY FROM THE DATABASE TEST
-------------------------------------------------
`tests/db/test_idempotency.py` proves the DATABASE refuses a duplicate key. This
proves the HTTP layer does the right thing WITH that refusal, and those are
different questions with different right answers.

The database must refuse, because a second replica or a maintenance query must
not be able to double-write. The API must NOT surface that refusal as an error,
because a retry is the correct behaviour for a client that lost a response --
answering it with a 409 would train callers to treat a successful write as a
failure and retry harder.

So: the database says no, and the API says "you already did that, here is what
happened". Both halves are needed and neither is sufficient.

THE TWO THINGS A RETRY MUST GET RIGHT
-------------------------------------
One EFFECT and one ANSWER.

A route that returns the cached body but writes a second row is the bug that
double-charges people. A route that writes once but returns a different body the
second time makes a retrying client believe its first call was lost. Both are
tested, because passing one and failing the other is invisible from outside.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any, cast

import pytest
from fastapi.testclient import TestClient
from httpx import Response

from learning_os.domain.python_recursion import GRAPH
from learning_os.http.app import build_app
from learning_os.http.repository import InMemoryLearners

KNOWN_SKILL = "python.recursion.identify_base_case"

BODY: dict[str, Any] = {
    "skill_id": KNOWN_SKILL,
    "correct": True,
    "representation": "code",
    "context_novelty": 0.6,
}


@pytest.fixture()
def client() -> Iterator[TestClient]:
    with TestClient(build_app(graph=GRAPH, learners=InMemoryLearners())) as started:
        yield started


@pytest.fixture()
def learner_id(client: TestClient) -> str:
    return str(client.post("/learners", json={"cohort": "y11"}).json()["learner_id"])


def _post(
    client: TestClient,
    learner_id: str,
    key: str,
    body: dict[str, Any] | None = None,
) -> Response:
    # `cast` because starlette's TestClient is typed as returning Any, and
    # mypy --strict refuses to narrow that on its own. The alternative was to
    # drop the annotation, which would silently untype every caller.
    return cast(
        Response,
        client.post(
            f"/learners/{learner_id}/attempts",
            json=BODY if body is None else body,
            headers={"Idempotency-Key": key},
        ),
    )


def _evidence_count(client: TestClient, learner_id: str) -> int:
    skills = client.get(f"/learners/{learner_id}/mastery").json()["skills"]
    return sum(skill["evidence_count"] for skill in skills)


def test_a_retry_creates_no_second_effect(client: TestClient, learner_id: str) -> None:
    """One EFFECT. The mastery estimate must move once, not twice."""
    _post(client, learner_id, "retry-1")
    _post(client, learner_id, "retry-1")

    assert _evidence_count(client, learner_id) == 1


def test_a_retry_returns_the_same_answer(client: TestClient, learner_id: str) -> None:
    """One ANSWER. The attempt id must be the first one, not a new one."""
    first = _post(client, learner_id, "retry-2")
    second = _post(client, learner_id, "retry-2")

    assert first.json()["attempt_id"] == second.json()["attempt_id"]
    assert first.json()["recorded_at"] == second.json()["recorded_at"]


def test_the_retry_is_200_and_the_original_is_201(
    client: TestClient, learner_id: str
) -> None:
    """The status code is how a caller tells the two apart.

    Both bodies are the same, deliberately. Without the status difference a
    client that retried has no way to know whether its first call landed, which
    is the exact question it retried to answer.
    """
    assert _post(client, learner_id, "retry-3").status_code == 201
    assert _post(client, learner_id, "retry-3").status_code == 200


def test_the_replayed_flag_marks_the_repeat(
    client: TestClient, learner_id: str
) -> None:
    first = _post(client, learner_id, "retry-4")
    second = _post(client, learner_id, "retry-4")

    assert first.json()["replayed"] is False
    assert second.json()["replayed"] is True


def test_ten_retries_still_produce_one_effect(
    client: TestClient, learner_id: str
) -> None:
    """The real shape of a retry storm.

    A client with an aggressive retry policy and a flaky connection does not
    send two requests, it sends ten. An implementation that de-duplicates
    against only the immediately previous request passes the two-request test
    and fails this one.
    """
    ids = {_post(client, learner_id, "storm").json()["attempt_id"] for _ in range(10)}

    assert len(ids) == 1
    assert _evidence_count(client, learner_id) == 1


def test_a_different_key_is_a_different_attempt(
    client: TestClient, learner_id: str
) -> None:
    """The PAIR. Without it, a route that ignored the body entirely and always
    returned the first attempt would satisfy every test above."""
    first = _post(client, learner_id, "key-a")
    second = _post(client, learner_id, "key-b")

    assert first.json()["attempt_id"] != second.json()["attempt_id"]
    assert _evidence_count(client, learner_id) == 2


def test_a_changed_body_under_the_same_key_still_replays(
    client: TestClient, learner_id: str
) -> None:
    """The key is the client's assertion that this is the same event.

    A retry whose payload differs slightly -- a corrected timestamp, a different
    novelty estimate -- is still the same event. An implementation comparing
    payloads decides it is a NEW observation and records it twice, which is the
    double-write the key exists to prevent.
    """
    first = _post(client, learner_id, "same-key")
    changed = dict(BODY, correct=False, context_novelty=0.1)
    second = _post(client, learner_id, "same-key", changed)

    assert second.status_code == 200
    assert second.json()["attempt_id"] == first.json()["attempt_id"]
    # The FIRST observation is what was kept. The second payload is discarded,
    # which is what "same event" means.
    assert second.json()["correct"] is True
    assert _evidence_count(client, learner_id) == 1


def test_two_learners_may_use_the_same_key(client: TestClient) -> None:
    """Keys are scoped per learner, and the HTTP layer must agree with the
    database about that.

    A globally-scoped key would answer the second learner with the FIRST
    learner's attempt -- a cross-learner data leak that looks exactly like a
    successful replay.
    """
    first = str(client.post("/learners", json={"cohort": "y11"}).json()["learner_id"])
    second = str(client.post("/learners", json={"cohort": "y12"}).json()["learner_id"])

    one = _post(client, first, "shared")
    two = _post(client, second, "shared")

    assert one.status_code == 201
    assert two.status_code == 201, "the second learner's write was treated as a replay"
    assert one.json()["attempt_id"] != two.json()["attempt_id"]
    assert two.json()["learner_id"] == second


def test_a_missing_key_is_refused(client: TestClient, learner_id: str) -> None:
    """Optional idempotency is no idempotency.

    The retry that causes the damage is the one the client did not plan, and a
    client that did not plan it did not send a key.
    """
    response = client.post(f"/learners/{learner_id}/attempts", json=BODY)
    assert response.status_code == 422


def test_an_empty_key_is_refused(client: TestClient, learner_id: str) -> None:
    """A header that is present and blank is not a key.

    This is what a client sends when its key generator returns an empty string,
    and treating it as valid makes every such request collide with every other.
    """
    response = client.post(
        f"/learners/{learner_id}/attempts", json=BODY, headers={"Idempotency-Key": ""}
    )
    assert response.status_code == 422
