"""The HTTP surface, tested as a caller sees it -- no database, no network.

WHAT THIS FILE IS AIMED AT
--------------------------
Phase 4's stated failure is precise: *a route that returns a shape its schema
does not describe*. So the oracle here is not "the status code was 200". It is:

    the response body, fed back through the response model the route DECLARES,
    must parse -- and those models forbid unknown fields.

That distinction matters. A test asserting `resp.status_code == 200` passes for
a route returning `{}`, and a test asserting `"learner_id" in body` passes for a
route that also returns six fields nobody designed. Round-tripping through the
declared model with `extra="forbid"` is the only check that fails in BOTH
directions: a missing field and a surplus one.

WHY THE OPENAPI DOCUMENT IS ASSERTED SEPARATELY
-----------------------------------------------
Round-tripping proves the body matches the model. It does NOT prove the model
reached the OpenAPI document, and the document is what Phase 7's Schemathesis
run and Phase 8's Pact contracts are generated from. A route declared with no
`response_model` still returns a perfectly good body and publishes a schema of
`{}` -- every generated test would then pass against any response at all. So
the document is checked on its own: every route, every 2xx, must name a schema.

NO DATABASE ON PURPOSE
----------------------
`tests/conftest.py` already refuses sockets for the whole suite, so a route that
quietly grew a network call fails here rather than in Phase 5. The learner store
is an in-memory adapter behind the same port Phase 5 will implement in Postgres;
these tests pin the PORT's behaviour, which is why they keep working once the
adapter changes underneath them.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from learning_os.domain.python_recursion import GRAPH
from learning_os.http.app import build_app
from learning_os.http.models import (
    AttemptRecorded,
    ConceptPage,
    Health,
    LearnerCreated,
    LessonEmitted,
    MasteryReport,
    NextAction,
)
from learning_os.http.repository import InMemoryLearners

#: Every route, with the model its 2xx response must round-trip through.
#:
#: A list rather than a decorator on each test, because the point of the
#: contract sweep below is that it is exhaustive: a ninth endpoint added without
#: a row here fails `test_every_declared_route_is_covered_by_this_file`, which
#: is what stops the sweep silently shrinking as the API grows.
ROUTES: tuple[tuple[str, str], ...] = (
    ("GET", "/health"),
    ("GET", "/concepts"),
    ("POST", "/learners"),
    ("GET", "/learners/{learner_id}"),
    ("GET", "/learners/{learner_id}/mastery"),
    ("POST", "/learners/{learner_id}/attempts"),
    ("GET", "/learners/{learner_id}/next"),
    ("POST", "/lessons"),
)

#: A skill id the shipped graph really defines. Hard-coded rather than derived,
#: because a test that asks the graph for "any skill" cannot fail when the graph
#: loses the skill the API depends on.
KNOWN_SKILL = "python.recursion.identify_base_case"


@pytest.fixture()
def client() -> Iterator[TestClient]:
    app = build_app(graph=GRAPH, learners=InMemoryLearners())
    with TestClient(app) as started:
        yield started


def _new_learner(client: TestClient) -> str:
    response = client.post("/learners", json={"cohort": "y11", "stream": "science"})
    assert response.status_code == 201, response.text
    return str(LearnerCreated.model_validate(response.json()).learner_id)


# ---------------------------------------------------------------------------
# The contract itself
# ---------------------------------------------------------------------------


def test_every_declared_route_is_covered_by_this_file() -> None:
    """The sweep is exhaustive, and stays exhaustive when a route is added.

    Without this, adding a ninth endpoint costs nothing and buys no coverage --
    the schema sweep below would keep reporting eight green routes forever.
    """
    app = build_app(graph=GRAPH, learners=InMemoryLearners())
    # `getattr` rather than `route.path`, because `app.routes` is typed as
    # `list[BaseRoute]` and only the routed subclasses carry `path`/`methods`.
    # Reading them straight off fails mypy --strict, and the honest fix is to
    # ask, not to cast the whole list into a shape it does not have.
    declared: set[tuple[str, str]] = set()
    for route in app.routes:
        path = getattr(route, "path", None)
        methods = getattr(route, "methods", None)
        if path is None or methods is None:
            continue
        for method in methods:
            if method not in {"HEAD", "OPTIONS"}:
                declared.add((str(method), str(path)))
    documented = {(method, path) for method, path in ROUTES}
    # `/openapi.json` is the only framework route left mounted, because the app
    # turns `/docs` and `/redoc` off. One exclusion, named, rather than a list
    # that has to grow every time FastAPI adds a built-in page.
    undocumented = {(m, p) for m, p in declared if p != "/openapi.json"} - documented
    assert undocumented == set(), (
        f"routes exist that this test file does not cover: {sorted(undocumented)}. "
        "Add them to ROUTES and give each one a body test."
    )


def test_every_route_publishes_a_response_schema(client: TestClient) -> None:
    """A 2xx with no schema makes every generated test vacuous.

    Schemathesis (Phase 7) and Pact (Phase 8) both read this document. A route
    whose success response is described as `{}` accepts any body at all, so the
    generated suites would go green against a route returning nothing.
    """
    document: dict[str, Any] = client.get("/openapi.json").json()
    missing: list[str] = []
    for method, path in ROUTES:
        operation = document["paths"][path][method.lower()]
        for status, response in operation["responses"].items():
            if not status.startswith("2"):
                continue
            schema = response.get("content", {}).get("application/json", {}).get("schema")
            if not schema:
                missing.append(f"{method} {path} -> {status}")
    assert missing == [], f"2xx responses with no JSON schema: {missing}"


# ---------------------------------------------------------------------------
# One test per endpoint, asserting the real value, not merely its presence
# ---------------------------------------------------------------------------


def test_health_reports_no_database_when_none_is_configured(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200, response.text
    health = Health.model_validate(response.json())
    assert health.status == "ok"
    # The honest answer for Phase 4. Reporting "up" with no database wired would
    # make the Phase 5 cut-over invisible, and reporting "down" would make a
    # correctly-configured service look broken.
    assert health.database == "not_configured"
    assert health.knowledge_version == GRAPH.version


def test_concepts_returns_the_shipped_graph_not_an_empty_page(
    client: TestClient,
) -> None:
    response = client.get("/concepts")
    assert response.status_code == 200, response.text
    page = ConceptPage.model_validate(response.json())
    assert page.total == len(GRAPH.concepts)
    assert page.total > 0, "an empty catalogue would satisfy every other assertion here"
    assert [item.concept_id for item in page.items] == [
        concept.concept_id for concept in GRAPH.concepts
    ]


def test_concepts_pagination_is_a_window_not_a_suggestion(client: TestClient) -> None:
    first = ConceptPage.model_validate(client.get("/concepts?limit=1&offset=0").json())
    second = ConceptPage.model_validate(client.get("/concepts?limit=1&offset=1").json())
    assert len(first.items) == 1
    assert len(second.items) == 1
    assert first.items[0].concept_id != second.items[0].concept_id
    # `total` counts the collection, not the page. Returning the page length is
    # the classic pagination bug: the caller can never tell there is more.
    assert first.total == len(GRAPH.concepts)


def test_concepts_rejects_a_negative_offset(client: TestClient) -> None:
    assert client.get("/concepts?offset=-1").status_code == 422


def test_concepts_beyond_the_end_is_empty_and_not_an_error(client: TestClient) -> None:
    page = ConceptPage.model_validate(client.get("/concepts?offset=9999").json())
    assert page.items == ()
    assert page.total == len(GRAPH.concepts)


def test_creating_a_learner_returns_an_id_that_can_be_fetched(
    client: TestClient,
) -> None:
    learner_id = _new_learner(client)
    fetched = client.get(f"/learners/{learner_id}")
    assert fetched.status_code == 200, fetched.text
    assert LearnerCreated.model_validate(fetched.json()).learner_id == learner_id


def test_two_learners_do_not_share_an_id(client: TestClient) -> None:
    assert _new_learner(client) != _new_learner(client)


def test_unknown_learner_is_404_and_says_so(client: TestClient) -> None:
    response = client.get("/learners/00000000-0000-4000-8000-000000000000")
    assert response.status_code == 404
    assert "learner" in response.json()["detail"].lower()


def test_mastery_of_a_new_learner_is_empty_rather_than_invented(
    client: TestClient,
) -> None:
    learner_id = _new_learner(client)
    report = MasteryReport.model_validate(
        client.get(f"/learners/{learner_id}/mastery").json()
    )
    assert report.learner_id == learner_id
    assert report.skills == (), "a learner with no attempts has no evidence to report"


def test_an_attempt_moves_the_mastery_estimate(client: TestClient) -> None:
    """The whole point of recording an attempt. Without this the route is a
    write-only sink and every other test here still passes."""
    learner_id = _new_learner(client)
    posted = client.post(
        f"/learners/{learner_id}/attempts",
        json={
            "skill_id": KNOWN_SKILL,
            "correct": True,
            "representation": "code",
            "context_novelty": 0.7,
        },
        headers={"Idempotency-Key": "k-move-1"},
    )
    assert posted.status_code == 201, posted.text

    report = MasteryReport.model_validate(
        client.get(f"/learners/{learner_id}/mastery").json()
    )
    assert len(report.skills) == 1
    skill = report.skills[0]
    assert skill.skill_id == KNOWN_SKILL
    assert skill.evidence_count == 1
    assert skill.estimate > 0.0, "a correct attempt must raise the estimate off zero"


def test_the_same_idempotency_key_records_one_attempt_and_repeats_the_answer(
    client: TestClient,
) -> None:
    """Idempotency means one EFFECT and one ANSWER, and both halves are load
    bearing.

    A route that returns the cached body but writes a second row is the bug that
    double-charges people; a route that writes once but returns a different body
    the second time makes a retrying client believe its first call was lost.
    """
    learner_id = _new_learner(client)
    body = {
        "skill_id": KNOWN_SKILL,
        "correct": True,
        "representation": "code",
        "context_novelty": 0.7,
    }
    headers = {"Idempotency-Key": "k-repeat"}

    first = client.post(f"/learners/{learner_id}/attempts", json=body, headers=headers)
    second = client.post(f"/learners/{learner_id}/attempts", json=body, headers=headers)

    assert first.status_code == 201, first.text
    assert second.status_code == 200, "a replay is not a fresh creation"

    one = AttemptRecorded.model_validate(first.json())
    two = AttemptRecorded.model_validate(second.json())
    assert one.attempt_id == two.attempt_id
    assert one.replayed is False
    assert two.replayed is True

    report = MasteryReport.model_validate(
        client.get(f"/learners/{learner_id}/mastery").json()
    )
    assert report.skills[0].evidence_count == 1, "the second POST created a second row"


def test_a_different_idempotency_key_is_a_different_attempt(
    client: TestClient,
) -> None:
    """The pairing test. Without it, `return cached` satisfies the test above."""
    learner_id = _new_learner(client)
    body = {
        "skill_id": KNOWN_SKILL,
        "correct": True,
        "representation": "code",
        "context_novelty": 0.7,
    }
    first = client.post(
        f"/learners/{learner_id}/attempts", json=body, headers={"Idempotency-Key": "a"}
    )
    second = client.post(
        f"/learners/{learner_id}/attempts", json=body, headers={"Idempotency-Key": "b"}
    )
    assert (
        AttemptRecorded.model_validate(first.json()).attempt_id
        != AttemptRecorded.model_validate(second.json()).attempt_id
    )
    report = MasteryReport.model_validate(
        client.get(f"/learners/{learner_id}/mastery").json()
    )
    assert report.skills[0].evidence_count == 2


def test_an_attempt_without_an_idempotency_key_is_refused(client: TestClient) -> None:
    """Optional idempotency is no idempotency: the retry that matters is the one
    the client did not plan."""
    learner_id = _new_learner(client)
    response = client.post(
        f"/learners/{learner_id}/attempts",
        json={
            "skill_id": KNOWN_SKILL,
            "correct": True,
            "representation": "code",
            "context_novelty": 0.7,
        },
    )
    assert response.status_code == 422


def test_an_attempt_on_an_unknown_skill_is_refused_not_recorded(
    client: TestClient,
) -> None:
    """404, and this assertion USED TO SAY 422.

    It was changed on measured evidence, which is the only thing that licenses
    changing an assertion. Schemathesis produced two findings against the 422:

        JsonSchemaError: "no subskill '000...'" is not of type "array"
            Validated against the response schema for status code 422.

        RejectedPositiveData: API rejected schema-compliant request

    Both are the Phase 4 failure condition -- "a route that returns a shape its
    schema does not describe". FastAPI publishes 422 as
    `{"detail": [ValidationError]}`, an ARRAY; the route was returning a string
    under that code. And the request was schema-compliant, because the document
    says `skill_id` is any string of 1..120 characters, so blaming the caller
    was wrong twice over.

    404 is true and expressible: the skill does not exist, no edit to the
    request makes it exist, and a schema cannot enumerate which ids are real.
    """
    learner_id = _new_learner(client)
    response = client.post(
        f"/learners/{learner_id}/attempts",
        json={
            "skill_id": "python.recursion.no_such_skill",
            "correct": True,
            "representation": "code",
            "context_novelty": 0.7,
        },
        headers={"Idempotency-Key": "k-unknown"},
    )
    assert response.status_code == 404
    # The detail is a STRING, and that is now what the document declares for
    # 404. Asserting the type is the check that would have caught the original
    # bug and did not exist.
    assert isinstance(response.json()["detail"], str)
    report = MasteryReport.model_validate(
        client.get(f"/learners/{learner_id}/mastery").json()
    )
    assert report.skills == (), "a refused attempt must leave no trace"


def test_an_attempt_for_an_unknown_learner_is_404(client: TestClient) -> None:
    response = client.post(
        "/learners/00000000-0000-4000-8000-000000000000/attempts",
        json={
            "skill_id": KNOWN_SKILL,
            "correct": True,
            "representation": "code",
            "context_novelty": 0.7,
        },
        headers={"Idempotency-Key": "k-ghost"},
    )
    assert response.status_code == 404


def test_next_for_an_unevidenced_learner_asks_for_a_diagnostic(
    client: TestClient,
) -> None:
    """A learner the engine knows nothing about must be diagnosed, not taught.

    This is the engine's own rule (`NoBottleneck.UNEVIDENCED` -> `DIAGNOSE`).
    Asserting it here proves the route is wired to the real policy rather than
    returning a plausible constant.
    """
    learner_id = _new_learner(client)
    response = client.get(f"/learners/{learner_id}/next")
    assert response.status_code == 200, response.text
    decision = NextAction.model_validate(response.json())
    assert decision.action == "diagnose"
    assert decision.skill_id is None
    assert decision.reason == "unevidenced"


#: Six observations of the same skill, each a different (representation,
#: novel-context) pair. Diversity is what the engine counts, so repeating one
#: form six times would never move it -- which is the property `Belief` exists
#: to hold and the reason this list is varied rather than long.
_EVIDENCE: tuple[tuple[bool, str, float], ...] = (
    (False, "code", 0.1),
    (False, "prose", 0.6),
    (True, "code", 0.9),
    (True, "diagram", 0.8),
    (True, "prose", 0.4),
    (True, "code", 0.95),
)


def _feed(client: TestClient, learner_id: str, count: int) -> None:
    for index, (correct, representation, novelty) in enumerate(_EVIDENCE[:count]):
        posted = client.post(
            f"/learners/{learner_id}/attempts",
            json={
                "skill_id": KNOWN_SKILL,
                "correct": correct,
                "representation": representation,
                "context_novelty": novelty,
            },
            headers={"Idempotency-Key": f"k-feed-{index}"},
        )
        assert posted.status_code == 201, posted.text


def test_next_names_the_skill_but_still_diagnoses_on_thin_evidence(
    client: TestClient,
) -> None:
    """Three observations is a target without a diagnosis, and that is not the
    same state as "no evidence at all".

    Both answer `diagnose`, which is why the interesting assertion is
    `skill_id`: the engine has found something to aim at and is saying it needs
    a better look first. A caller that branched on the action alone could not
    tell those apart, so the API publishes the skill and the reason too.
    """
    learner_id = _new_learner(client)
    _feed(client, learner_id, 3)
    decision = NextAction.model_validate(
        client.get(f"/learners/{learner_id}/next").json()
    )
    assert decision.skill_id == KNOWN_SKILL
    assert decision.action == "diagnose"
    assert decision.reason.startswith("diagnostic_needed")


def test_next_teaches_once_the_evidence_is_varied_enough(client: TestClient) -> None:
    """The pairing test. Without it, a route hard-coded to `diagnose` passes
    every other `/next` test in this file.

    The threshold is measured, not assumed: a fourth DISTINCT kind of evidence
    is what flips `needs_diagnostic` off, and the route then reports the
    engine's teaching action instead. Pinning it here means a change to that
    threshold shows up as a failing test rather than as a tutor that quietly
    stops teaching.
    """
    learner_id = _new_learner(client)
    _feed(client, learner_id, 4)
    decision = NextAction.model_validate(
        client.get(f"/learners/{learner_id}/next").json()
    )
    assert decision.skill_id == KNOWN_SKILL
    assert decision.action == "teach_by_example"
    assert decision.reason.startswith("evidence_already_sufficient")
    assert decision.reason != "unevidenced"


def test_next_for_an_unknown_learner_is_404(client: TestClient) -> None:
    assert (
        client.get("/learners/00000000-0000-4000-8000-000000000000/next").status_code
        == 404
    )


def test_lessons_emits_a_lesson_for_a_known_skill(client: TestClient) -> None:
    response = client.post(
        "/lessons",
        json={"skill_id": KNOWN_SKILL, "question": "Why does recursion need a base case?"},
    )
    assert response.status_code == 201, response.text
    lesson = LessonEmitted.model_validate(response.json())
    assert lesson.target_skill == KNOWN_SKILL
    assert lesson.blocks, "a lesson with no blocks is not a lesson"


def test_lessons_refuses_a_skill_the_graph_does_not_define(client: TestClient) -> None:
    """404 for the same measured reason as the attempts route above.

    Same two Schemathesis findings, same fix. Recorded in both places rather
    than cross-referenced, because a reader arriving at either test needs to
    know the assertion was changed and why.
    """
    response = client.post(
        "/lessons",
        json={"skill_id": "python.recursion.not_real", "question": "Anything?"},
    )
    assert response.status_code == 404
    assert isinstance(response.json()["detail"], str)


def test_lessons_refuses_an_empty_question(client: TestClient) -> None:
    response = client.post("/lessons", json={"skill_id": KNOWN_SKILL, "question": "   "})
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# The API restates two things the engine owns. These fail when they drift.
# ---------------------------------------------------------------------------


def test_next_action_kind_matches_the_engine() -> None:
    """`NextActionKind` restates `ActionKind`, so it must restate all of it.

    The alternative was importing the enum, which would make every action the
    engine ever adds an automatic API promise. Restating it keeps that a
    decision -- and this test is what stops "a decision" becoming "nobody
    noticed".
    """
    from typing import get_args

    from learning_os.http.models import NextActionKind
    from learning_os.models.contracts import ActionKind

    assert set(get_args(NextActionKind)) == {member.value for member in ActionKind}


def test_absence_actions_match_the_runtime() -> None:
    """`app._ABSENCE_ACTION` duplicates `runtime.loop._ACTION_FOR_ABSENCE`.

    Duplicated because the runtime's copy is private. A duplicate nobody checks
    is how two layers come to disagree about what "mastered" means, so the
    duplication is allowed and the disagreement is not.
    """
    from learning_os.http.app import _ABSENCE_ACTION
    from learning_os.runtime.loop import _ACTION_FOR_ABSENCE

    assert {reason: action for reason, action in _ABSENCE_ACTION.items()} == {
        reason: action.value for reason, action in _ACTION_FOR_ABSENCE.items()
    }
