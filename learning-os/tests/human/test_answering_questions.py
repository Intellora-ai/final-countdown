"""Steps for `features/answering_questions.feature`.

RETRY KEYS ARE LITERAL, AND THAT IS THE POINT
---------------------------------------------
`attempt-1` sent twice is the dropped-connection scenario. `attempt-2` is a
genuine second go. That difference is the whole subject of this feature, so the
keys are written into the steps rather than produced by a counter -- a generated
key would make "the same answer again" and "again later" identical code with
different names, which is exactly the confusion the API's required
`Idempotency-Key` exists to prevent.
"""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient
from httpx import Response
from pytest_bdd import parsers, scenarios, then, when

scenarios("features/answering_questions.feature")

#: How the learner was working when they answered. Any non-empty string is
#: accepted by the API; a fixed one keeps `evidence_diversity` out of scenarios
#: that are not about it.
REPRESENTATION = "code"


def _answer(client: TestClient, learner: str, skill: str, key: str) -> Response:
    """One answer, submitted the way a client must submit it.

    `Idempotency-Key` is a required header rather than an optional one, so there
    is no version of this helper that omits it by accident -- the scenario that
    omits it does so on purpose, below.
    """
    reply: Response = client.post(
        f"/learners/{learner}/attempts",
        json={"skill_id": skill, "correct": True, "representation": REPRESENTATION},
        headers={"Idempotency-Key": key},
    )
    return reply


def _evidence_count(client: TestClient, learner: str, skill: str) -> int:
    reply = client.get(f"/learners/{learner}/mastery")
    assert reply.status_code == 200, reply.text
    skills: list[dict[str, Any]] = reply.json()["skills"]
    for entry in skills:
        if entry["skill_id"] == skill:
            return int(entry["evidence_count"])
    raise AssertionError(f"{skill!r} is not in my progress: {skills!r}")


# ---------------------------------------------------------------------------
# When
# ---------------------------------------------------------------------------


@when(parsers.parse('I answer "{skill}" correctly'), target_fixture="reply")
def _i_answer_correctly(client: TestClient, learner: str, skill: str) -> Response:
    return _answer(client, learner, skill, "attempt-1")


@when(
    parsers.parse('I answer "{skill}" correctly again later'),
    target_fixture="reply",
)
def _i_answer_correctly_again_later(
    client: TestClient, learner: str, skill: str
) -> Response:
    return _answer(client, learner, skill, "attempt-2")


@when(
    "the connection drops and my client sends the same answer again",
    target_fixture="reply",
)
def _the_connection_drops_and_the_client_retries(
    client: TestClient, learner: str, reply: Response
) -> Response:
    """The retry a phone sends, not a retry anybody planned.

    The skill comes from the reply to the first attempt rather than from the
    step text, because a retry that changed the skill would not be a retry.
    """
    return _answer(client, learner, str(reply.json()["skill_id"]), "attempt-1")


@when(
    parsers.parse('I answer "{skill}" without a retry key'),
    target_fixture="reply",
)
def _i_answer_without_a_retry_key(
    client: TestClient, learner: str, skill: str
) -> Response:
    reply: Response = client.post(
        f"/learners/{learner}/attempts",
        json={"skill_id": skill, "correct": True, "representation": REPRESENTATION},
    )
    return reply


@when(
    parsers.parse('I answer "{skill}" correctly {count:d} times'),
    target_fixture="reply",
)
def _i_answer_correctly_n_times(
    client: TestClient, learner: str, skill: str, count: int
) -> Response:
    replies = [_answer(client, learner, skill, f"attempt-{n}") for n in range(count)]
    for one in replies:
        assert one.status_code == 201, one.text
    return replies[-1]


# ---------------------------------------------------------------------------
# Then
# ---------------------------------------------------------------------------


@then("the answer is recorded as new")
def _the_answer_is_recorded_as_new(reply: Response) -> None:
    assert reply.status_code == 201, reply.text
    assert reply.json()["replayed"] is False, reply.text


@then("the second attempt is reported as a replay")
def _the_second_attempt_is_reported_as_a_replay(reply: Response) -> None:
    """200 and `replayed`, not 201.

    A retry answered with 201 tells a client it created a second record, which
    is the thing it retried in order to avoid.
    """
    assert reply.status_code == 200, reply.text
    assert reply.json()["replayed"] is True, reply.text


@then(parsers.parse('my progress lists "{skill}"'))
def _my_progress_lists(client: TestClient, learner: str, skill: str) -> None:
    assert _evidence_count(client, learner, skill) >= 1


@then(parsers.parse("that skill shows {count:d} piece of evidence"))
@then(parsers.parse("that skill shows {count:d} pieces of evidence"))
@then(parsers.parse("that skill still shows {count:d} piece of evidence"))
def _that_skill_shows_n_pieces_of_evidence(
    client: TestClient, learner: str, reply: Response, count: int
) -> None:
    skill = str(reply.json()["skill_id"])
    actual = _evidence_count(client, learner, skill)
    assert actual == count, f"{skill} shows {actual} pieces of evidence, not {count}"


@then(parsers.parse('my progress does not say I have mastered "{skill}"'))
def _my_progress_does_not_say_i_have_mastered(
    client: TestClient, learner: str, skill: str
) -> None:
    """THE HONESTY PROPERTY, asserted where a learner would read it.

    The engine has an internal reason for every state it reports. This scenario
    does not care which one: it cares that the word a person acts on -- "you
    have mastered this" -- is not produced by a handful of right answers.
    """
    reply = client.get(f"/learners/{learner}/mastery")
    assert reply.status_code == 200, reply.text
    skills: list[dict[str, Any]] = reply.json()["skills"]
    states = [entry["state"] for entry in skills if entry["skill_id"] == skill]
    assert states, f"{skill!r} is not in my progress at all: {skills!r}"
    assert states[0] != "mastered", (
        f"{skill} was reported as mastered on this much evidence: {skills!r}"
    )
