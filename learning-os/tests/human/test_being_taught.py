"""Steps for `features/being_taught.feature`.

The lesson route builds its lesson from `FakeLLMClient` -- the same client
`api/cli.py` uses to produce the committed fixture. So these scenarios need no
key and reach no provider, and the lesson they assert on is the lesson the
engine would emit rather than one a stub was told to return.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi.testclient import TestClient
from httpx import Response
from pytest_bdd import parsers, scenarios, then, when

scenarios("features/being_taught.feature")


# ---------------------------------------------------------------------------
# When
# ---------------------------------------------------------------------------


@when("I browse the concepts", target_fixture="reply")
def _i_browse_the_concepts(client: TestClient) -> Response:
    reply: Response = client.get("/concepts")
    return reply


@when(
    parsers.parse('I browse the concepts for the "{subject}" subject'),
    target_fixture="reply",
)
def _i_browse_the_concepts_for_a_subject(client: TestClient, subject: str) -> Response:
    reply: Response = client.get("/concepts", params={"subject": subject})
    return reply


@when(
    parsers.parse("I browse the concepts starting from position {offset:d}"),
    target_fixture="reply",
)
def _i_browse_the_concepts_from(client: TestClient, offset: int) -> Response:
    reply: Response = client.get("/concepts", params={"offset": offset})
    return reply


@when(
    parsers.parse('I ask for a lesson on "{skill}" because "{question}"'),
    target_fixture="reply",
)
def _i_ask_for_a_lesson(client: TestClient, skill: str, question: str) -> Response:
    reply: Response = client.post("/lessons", json={"skill_id": skill, "question": question})
    return reply


# ---------------------------------------------------------------------------
# Then
# ---------------------------------------------------------------------------


@then("I am shown at least one concept")
def _i_am_shown_at_least_one_concept(reply: Response) -> None:
    assert reply.status_code == 200, reply.text
    assert reply.json()["items"], "the catalogue is empty, so there is nothing to learn"


@then("every concept tells me how many subskills it has")
def _every_concept_tells_me_how_many_subskills(reply: Response) -> None:
    """A concept with no subskills is a heading, not something to learn.

    The count is what lets a person judge whether a concept is worth starting,
    so a page that omits it has shown them a list they cannot choose from.
    """
    items: list[dict[str, Any]] = reply.json()["items"]
    for concept in items:
        assert concept["subskill_count"] >= 1, concept


@then(parsers.parse('every concept I am shown belongs to "{subject}"'))
def _every_concept_belongs_to(reply: Response, subject: str) -> None:
    assert reply.status_code == 200, reply.text
    items: list[dict[str, Any]] = reply.json()["items"]
    assert items, f"filtering by {subject!r} hid everything"
    for concept in items:
        assert str(concept["concept_id"]).startswith(f"{subject}."), concept


@then("I am shown no concepts")
def _i_am_shown_no_concepts(reply: Response) -> None:
    assert reply.status_code == 200, reply.text
    assert reply.json()["items"] == [], reply.text


@then("I am still told the real total")
def _i_am_still_told_the_real_total(reply: Response) -> None:
    """The end of a list, not a fault.

    `total` counts the whole collection rather than the page, which is what
    lets a caller that has run off the end tell "there are none" from "there
    are more, further back".
    """
    assert reply.json()["total"] >= 1, reply.text


@then("I am given a lesson")
def _i_am_given_a_lesson(reply: Response) -> None:
    assert reply.status_code == 201, reply.text
    assert reply.json()["lesson_id"], reply.text


@then("the lesson repeats back the question I asked")
def _the_lesson_repeats_back_the_question(reply: Response) -> None:
    """A lesson that has lost the question is a lesson about something else.

    Compared against the body that was actually sent, read back off the request
    on this response. Asserting only that the field is non-empty would pass for
    a route that answers every question with the same one -- which is precisely
    the failure a learner could not detect from the inside.
    """
    asked: dict[str, Any] = json.loads(reply.request.content)
    assert reply.json()["question"] == asked["question"], reply.text


@then("the lesson has something in it to read")
def _the_lesson_has_something_to_read(reply: Response) -> None:
    blocks: list[Any] = reply.json()["blocks"]
    assert blocks, "the lesson came back with no blocks, so there is nothing to teach"
