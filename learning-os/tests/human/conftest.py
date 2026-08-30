"""THE HUMAN LAYER — what a person does, in the order they do it.

WHAT THIS SUITE IS FOR, AND WHY THE OTHER SUITES DO NOT COVER IT
----------------------------------------------------------------
`tests/http` asks whether each route returns the shape its own schema declares.
`tests/api` asks what a caller's mistakes look like. `tests/contract` asks
whether one named consumer still gets what it reads. Schemathesis asks whether
any generated input can break a published promise.

Every one of those questions is about ONE call. None of them asks whether a
person can sign up, answer a question, be told what to do next, and have the
retry their phone sent not count twice -- and a suite of route tests can be
entirely green while that sequence is broken, because each call is correct in
isolation and the ORDER is what carries the meaning.

So the scenarios live in `features/*.feature`, written as behaviour, and are
bound to real calls by pytest-bdd. The binding is the point: a step with no
definition is an ERROR, so a scenario cannot quietly do less than it says.

STATE IS PASSED BY FIXTURE, NOT BY A SHARED OBJECT
--------------------------------------------------
Gherkin steps cannot hand values to each other, so something has to carry the
learner id and the last response between them. pytest-bdd's `target_fixture` is
that something: a step returns a value, and the steps after it receive it by
name. The alternative -- one mutable object threaded through every step -- was
written first and thrown away, because it makes every step's signature identical
and therefore silent about what that step actually reads.

Retry keys are literal strings in the step definitions rather than generated,
for the same reason. `attempt-1` sent twice is a retry and `attempt-2` is a new
attempt; that distinction IS the scenario, so it is written down instead of
hidden behind a counter.

OFFLINE, AND WITH NO API KEY
----------------------------
Inherited, not re-declared. `tests/conftest.py` is this directory's parent and
its autouse `_no_network` fixture refuses sockets for every test underneath it,
including these. The app runs in-process over ASGI and the lesson route uses the
deterministic `FakeLLMClient`, so there is nothing for a key to unlock.

That is a property, not a convenience. A suite that needs a real model is a
suite that gets switched off the first time a key expires, and the scenarios
that stop running are precisely the ones asserting the engine does not fabricate
what it teaches.
"""

from __future__ import annotations

import json
import os
import pathlib
from collections.abc import Generator, Iterator

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from pytest_bdd import given, parsers, then

from learning_os.domain.python_recursion import GRAPH
from learning_os.http.app import build_app
from learning_os.http.repository import InMemoryLearners

# Skill ids are spelled out in the feature files rather than aliased to a
# constant here. They are the real ids from the shipped graph, and keeping them
# visible is what makes the scenarios readable to someone who is not going to
# open this file. Nothing has to enforce that they stay real: an id the graph
# stops serving turns its scenario red on the spot, because the route answers
# 404 where the scenario expects a recorded attempt.


@pytest.fixture()
def client() -> Iterator[TestClient]:
    """A fresh app and a fresh learner store per scenario.

    Per scenario, not per session. `InMemoryLearners` is mutable, and sharing
    one would make "that skill shows 1 piece of evidence" depend on which
    scenarios ran before this one -- order dependence that turns a red suite
    into a bisect.
    """
    with TestClient(build_app(graph=GRAPH, learners=InMemoryLearners())) as started:
        yield started


# ---------------------------------------------------------------------------
# Steps shared by more than one feature. Feature-specific steps live beside the
# scenario that uses them, so this stays the small common set rather than the
# place every step drifts into.
# ---------------------------------------------------------------------------


@given("the Learning OS is running")
def _the_learning_os_is_running(client: TestClient) -> None:
    """The app answers before anything else is attempted.

    Not decoration. If `/health` is wrong then every other failure in this suite
    is a symptom of it, and a scenario that never checked would report the
    symptom instead of the cause.
    """
    reply = client.get("/health")
    assert reply.status_code == 200, reply.text
    assert reply.json()["status"] == "ok", reply.text


@given("I have signed up", target_fixture="learner")
def _i_have_signed_up(client: TestClient) -> str:
    reply = client.post("/learners", json={"cohort": "y11", "stream": "python"})
    assert reply.status_code == 201, reply.text
    return str(reply.json()["learner_id"])


# A step defined in a test module is visible only to that module's scenarios, so
# the three refusals below live here because three different features assert
# them. One definition means one answer to "what does a refusal look like" --
# which is the property a caller writing a single error handler depends on, and
# the thing three copies would quietly stop agreeing about.


@then("I am refused as a bad request")
def _i_am_refused_as_a_bad_request(reply: Response) -> None:
    assert reply.status_code == 422, reply.text
    assert "detail" in reply.json(), reply.text


@then(parsers.parse('the refusal names the "{field}" field'))
def _the_refusal_names_the_field(reply: Response, field: str) -> None:
    """"Invalid request" is not an error a person can act on.

    The field name is what turns a rejection into a fix, so this asserts the
    name is present rather than merely that something was refused.
    """
    detail = reply.json()["detail"]
    assert field in str(detail), f"{field!r} is not named in {detail!r}"


@then("I am told that skill does not exist")
def _i_am_told_that_skill_does_not_exist(reply: Response) -> None:
    """404, not 422.

    The request is well formed -- `skill_id` is a string of the right length --
    so calling the CALLER malformed would be false, and no edit to the request
    can make a missing skill exist.
    """
    assert reply.status_code == 404, reply.text
    assert "detail" in reply.json(), reply.text


# ---------------------------------------------------------------------------
# SCENARIO EXECUTION LEDGER — the same mechanism as the property ledger next
# door, counting the thing that matters for THIS suite.
# ---------------------------------------------------------------------------
#
# `scripts/property_gate.py` enforces a floor on how many tests a suite actually
# EXECUTED. The learning-os ledger counts tests Hypothesis wrapped. This one
# counts scenarios pytest-bdd bound, because that is what would silently go
# missing here: delete a `.feature` file, or let a `scenarios()` call stop
# matching after an upgrade, and this suite reports a smaller green number with
# nothing red anywhere.
#
# COLLECTED IS NOT EXECUTED. The count comes from the CALL phase, so a scenario
# that errored during setup never ran a step and is not counted.
#
# `__scenario__` is set by pytest-bdd on every function it binds to a scenario.
# It is a structural fact rather than a label somebody maintains, which is the
# same reason the property ledger counts `is_hypothesis_test`. And it is
# deliberately NOT a pytest marker: a marker is a deselection handle, so
# `-m "not human"` would switch every scenario off while the suite stayed green,
# which is the exact failure this ledger exists to detect.

#: `.property-ledger/`, NOT `reports/`, for the reason recorded in
#: `tests/conftest.py`: `scripts/aggregate_gates.py` reads every `reports/*.json`
#: as one gate's VERDICT, and this file is a gate's INPUT.
_LEDGER = (
    pathlib.Path(__file__).resolve().parents[3]
    / ".property-ledger"
    / "property-execution-human.json"
)

#: The failure artifact `learning-os.yml` uploads. Separate from the ledger
#: because it is for a person reading a red run rather than for the gate: it
#: names which scenario failed, which a count never can.
_REPORT = pathlib.Path(__file__).resolve().parents[2] / "reports" / "human-scenarios.json"

_executed_scenarios: dict[str, str] = {}


def pytest_runtest_logreport(report: pytest.TestReport) -> None:
    if report.when != "call":
        return
    if report.outcome not in {"passed", "failed"}:
        return
    if report.__dict__.get("_is_bdd_scenario", False):
        _executed_scenarios[report.nodeid] = report.outcome


@pytest.hookimpl(wrapper=True)
def pytest_runtest_makereport(
    item: pytest.Item,
) -> Generator[None, pytest.TestReport, pytest.TestReport]:
    """Tag the report with whether pytest-bdd bound this test to a scenario.

    Written into `__dict__` rather than as an attribute for the two reasons the
    property ledger records: mypy --strict refuses an undeclared field on
    `TestReport`, and under xdist this hook runs in the worker while the
    counting hook runs in the controller -- `report.__dict__` is the one thing
    that survives that crossing.
    """
    report = yield
    function = getattr(item, "function", None)
    report.__dict__["_is_bdd_scenario"] = hasattr(function, "__scenario__")
    return report


def pytest_sessionfinish(session: pytest.Session) -> None:
    if os.environ.get("PYTEST_XDIST_WORKER"):
        # A worker. The controller sees every worker's forwarded reports and
        # writes the complete ledger; writing here would double-count.
        return

    payload = {
        "executed": len(_executed_scenarios),
        "collected": session.testscollected,
        "scenarios": dict(sorted(_executed_scenarios.items())),
    }
    for target in (_LEDGER, _REPORT):
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
