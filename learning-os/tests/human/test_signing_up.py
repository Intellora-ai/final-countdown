"""Steps for `features/signing_up.feature`.

Every When below is one real HTTP call against the app running in-process. There
is no mock and no stub: the feature file says what a person does, and these
functions are the only place that says what "doing it" means in HTTP terms --
which is why no status code appears in the feature file.
"""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient
from httpx import Response
from pytest_bdd import parsers, scenarios, then, when

scenarios("features/signing_up.feature")


# ---------------------------------------------------------------------------
# When
# ---------------------------------------------------------------------------


@when(
    parsers.parse('I sign up for the "{cohort}" cohort on the "{stream}" stream'),
    target_fixture="reply",
)
def _sign_up(client: TestClient, cohort: str, stream: str) -> Response:
    reply: Response = client.post("/learners", json={"cohort": cohort, "stream": stream})
    return reply


@when(
    parsers.parse('I sign up for the "{cohort}" cohort with no stream'),
    target_fixture="reply",
)
def _sign_up_without_a_stream(client: TestClient, cohort: str) -> Response:
    reply: Response = client.post("/learners", json={"cohort": cohort})
    return reply


@when("I sign up with an empty cohort", target_fixture="reply")
def _sign_up_with_an_empty_cohort(client: TestClient) -> Response:
    reply: Response = client.post("/learners", json={"cohort": ""})
    return reply


@when("I ask what I should do next", target_fixture="reply")
def _ask_what_to_do_next(client: TestClient, learner: str) -> Response:
    reply: Response = client.get(f"/learners/{learner}/next")
    return reply


@when(
    parsers.parse('I ask for the progress of learner "{learner_id}"'),
    target_fixture="reply",
)
def _ask_for_the_progress_of(client: TestClient, learner_id: str) -> Response:
    reply: Response = client.get(f"/learners/{learner_id}/mastery")
    return reply


# ---------------------------------------------------------------------------
# Then
# ---------------------------------------------------------------------------


@then("I am given a learner id")
def _i_am_given_a_learner_id(reply: Response) -> None:
    assert reply.status_code == 201, reply.text
    body: dict[str, Any] = reply.json()
    assert body["learner_id"], "signing up returned no learner id"


@then("looking myself up returns the cohort and stream I signed up with")
def _looking_myself_up_returns_what_i_gave(client: TestClient, reply: Response) -> None:
    """The half a create-only test never reaches.

    A route can answer 201 with a well-formed id and store nothing at all.
    Reading the record back through a DIFFERENT route is what proves the person
    exists afterwards, rather than only during the request that made them.
    """
    signed_up: dict[str, Any] = reply.json()
    stored_reply = client.get(f"/learners/{signed_up['learner_id']}")
    assert stored_reply.status_code == 200, stored_reply.text
    stored: dict[str, Any] = stored_reply.json()
    assert stored["cohort"] == signed_up["cohort"]
    assert stored["stream"] == signed_up["stream"]


@then("my stream is empty")
def _my_stream_is_empty(reply: Response) -> None:
    assert reply.json()["stream"] is None, reply.text


# "I am refused as a bad request" and "the refusal names the ... field" are
# defined in conftest.py, because three features assert them.


@then(parsers.parse('I am told to "{action}"'))
def _i_am_told_to(reply: Response, action: str) -> None:
    assert reply.status_code == 200, reply.text
    assert reply.json()["action"] == action, reply.text


@then("no skill is named, because nothing is known about me yet")
def _no_skill_is_named(reply: Response) -> None:
    assert reply.json()["skill_id"] is None, reply.text


@then("I am told that learner does not exist")
def _i_am_told_that_learner_does_not_exist(reply: Response) -> None:
    assert reply.status_code == 404, reply.text
    assert "detail" in reply.json(), reply.text
