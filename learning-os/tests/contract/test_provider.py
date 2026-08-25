"""P8-T4 — the real API is replayed against every contract the canvas recorded.

WHY THIS DIRECTORY IS `contract/` AND NOT `pact/`
-------------------------------------------------
The plan names it `tests/pact/`. It cannot be called that.

`tests/pact/__init__.py` is needed, because without it this directory's
`conftest.py` and the suite-wide `tests/conftest.py` both resolve to a module
called `conftest` and mypy refuses the duplicate. But adding it makes this
directory a package named `pact` -- which SHADOWS the installed pact library the
moment `tests/` is on the path:

    ModuleNotFoundError: No module named 'pact.verifier'

The import worked in a plain interpreter and failed under pytest, which is
exactly the shape of a name collision. Renaming the directory removes the
collision instead of working around it, and `contract/` is the more accurate
name anyway: the file verifies a CONTRACT, and Pact is the tool it happens to
use.

WHAT THIS CATCHES THAT NOTHING ELSE DOES
----------------------------------------
Schemathesis asks whether the API obeys its own schema. That question stays
green through the most expensive kind of breaking change: remove a field the
canvas depends on, update the OpenAPI document in the same commit, and every
response still validates against the schema it now has.

Pact asks a different question -- does the provider still give THIS consumer
what it recorded needing -- and it is the only check here that fails when the
provider and its document change together.

HOW IT RUNS, AND WHY THERE IS NO WAIT LOOP
-------------------------------------------
The listening socket is bound HERE, before uvicorn is handed it. That is not a
detail: the obvious version starts the server in a thread and then polls until
it comes up, which is a race dressed as a wait, and it comes back on a busier
machine. A socket that is already bound and listening accepts connections into
its backlog immediately, so the verifier can connect the instant the fixture
returns. There is no timing to get wrong.

The loopback connection this requires is permitted by this directory's
`conftest.py` and by nothing else in the suite; see that file for what was
narrowed and why.

PROVIDER STATES ARE REAL SETUP, NOT DECORATION
----------------------------------------------
Each `given(...)` in the contract names a state the provider must be in. The
handlers below actually put it there -- creating a learner with the id the
contract uses, and folding real evidence through the real estimator so a mastery
report is non-empty. A state handler that did nothing would make the contract
pass against an API returning empty collections for everything, which is the
shape this whole phase exists to prevent.
"""

from __future__ import annotations

import json
import socket
import threading
from collections.abc import Callable, Iterator
from datetime import UTC, datetime
from pathlib import Path

import pytest
import uvicorn

# `pact.verifier`, not `pact`. The package re-exports `Verifier` lazily at
# runtime, so `from pact import Verifier` works and mypy --strict reports
# `Module "pact" has no attribute "Verifier"`. pact-python ships py.typed,
# so the type checker is reading real annotations and is right about what the
# package statically declares. Importing from where the class is defined
# satisfies both.
from pact.verifier import Verifier

from learning_os.domain.python_recursion import GRAPH
from learning_os.http.app import build_app
from learning_os.http.repository import InMemoryLearners
from learning_os.models.contracts import Evidence, EvidenceStrength

REPO_ROOT = Path(__file__).resolve().parents[3]
CONTRACT = REPO_ROOT / "pacts" / "learning-canvas-learning-os.json"

#: The learner id the recorded contract uses. Fixed, so the state handlers can
#: create exactly the learner the replayed requests ask for.
LEARNER_ID = "L-contract"

KNOWN_SKILL = "python.recursion.identify_base_case"

#: How many interactions the consumer suite records. Checked rather than
#: trusted: a verifier handed fewer contracts verifies fewer things and still
#: exits 0.
EXPECTED_INTERACTIONS = 6


class _FixedClockLearners(InMemoryLearners):
    """An in-memory store with a fixed clock.

    Fixed so two runs produce identical `last_updated` values. The contract
    matches that field by type rather than value, but a moving clock in a
    provider is one more reason a verification could differ between runs, and
    verification results that differ between runs stop being read.
    """

    def __init__(self) -> None:
        super().__init__(now=lambda: datetime(2026, 8, 25, 9, 0, tzinfo=UTC))


@pytest.fixture(scope="module")
def learners() -> _FixedClockLearners:
    return _FixedClockLearners()


@pytest.fixture(scope="module")
def provider_url(learners: _FixedClockLearners) -> Iterator[str]:
    """A running provider, with no start-up race to lose.

    The socket is bound and listening before the serving thread exists. Port 0
    asks the OS for one nobody holds -- a hard-coded port fails whenever
    anything else on the machine happens to have it, and that failure reads as a
    broken test rather than as a collision.
    """
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(("127.0.0.1", 0))
    listener.listen()
    port = int(listener.getsockname()[1])

    app = build_app(graph=GRAPH, learners=learners)
    server = uvicorn.Server(uvicorn.Config(app, log_level="warning"))

    thread = threading.Thread(target=server.run, kwargs={"sockets": [listener]})
    thread.daemon = True
    thread.start()

    yield f"http://127.0.0.1:{port}"

    server.should_exit = True
    thread.join(timeout=30)
    listener.close()


def _seed_learner(learners: _FixedClockLearners) -> None:
    """Put the store in a known state: exactly one learner, with no evidence.

    IT RESETS RATHER THAN SKIPPING, AND THAT WAS A REAL BUG.

    The first version returned early when the learner already existed. The store
    is module-scoped and shared across interactions, so "a learner with recorded
    evidence exists" ran first, and by the time "a learner with NO evidence
    exists" ran the learner had three attempts on it. Verification failed with:

        $.skill_id -> Expected 'python.recursion.identify_base_case' (String)
                      to be equal to null (Null)

    which is the provider correctly reporting a bottleneck for a learner the
    state handler had failed to reset. A state handler that produces "the named
    state, unless a previous one already ran" is not a state handler.

    Reaching into the adapter's private state is acceptable here and ONLY here.
    The alternative is a production seam whose entire purpose is letting a test
    choose primary keys, and a seam that exists for tests is a seam production
    can misuse.
    """
    learners._learners.clear()

    record = learners.create(cohort="y11", stream="science")
    state = learners._learners.pop(record.learner_id)
    object.__setattr__(state.record, "learner_id", LEARNER_ID)
    learners._learners[LEARNER_ID] = state


def _make_state_handlers(
    learners: _FixedClockLearners,
) -> dict[str, Callable[..., None]]:
    def service_running() -> None:
        """/health answers without any stored state, so there is nothing to set
        up. Present rather than omitted: an unhandled state name is a silent
        pass in some verifiers, and an empty function that is REACHED is
        different from a state nobody implemented."""

    def curriculum_has_concepts() -> None:
        # Asserted rather than assumed. A graph that lost its concepts would
        # otherwise produce an empty page and fail the contract with a less
        # obvious message.
        assert GRAPH.concepts, "the knowledge graph has no concepts"

    def learner_with_evidence() -> None:
        _seed_learner(learners)
        # Real evidence, folded by the real estimator. A hand-written mastery
        # row would let the contract pass while the mapping from evidence to a
        # published `state` was broken -- and `state` is the field the canvas
        # branches on.
        for index, representation in enumerate(("code", "prose", "diagram")):
            learners.record(
                LEARNER_ID,
                idempotency_key=f"pact-{index}",
                evidence=Evidence(
                    evidence_id=f"pact-{index}",
                    event_id=f"pact-{index}",
                    skill_id=KNOWN_SKILL,
                    strength=EvidenceStrength.INDEPENDENT_APPLICATION,
                    observed_performance=1.0,
                    task_difficulty=0.5,
                    task_reliability=1.0,
                    independence=1.0,
                    context_novelty=0.6,
                    response_time_ms=1000,
                    representation=representation,
                    attempt_number=1,
                ),
                correct=True,
            )

    def learner_without_evidence() -> None:
        _seed_learner(learners)

    def skill_exists() -> None:
        assert GRAPH.subskill(KNOWN_SKILL) is not None, (
            f"the contract depends on {KNOWN_SKILL}, which the graph no longer "
            "defines"
        )

    def skill_does_not_exist() -> None:
        assert GRAPH.subskill("python.recursion.not_real") is None

    return {
        "the service is running": service_running,
        "the curriculum has concepts": curriculum_has_concepts,
        "a learner with recorded evidence exists": learner_with_evidence,
        "a learner with no evidence exists": learner_without_evidence,
        f"the skill {KNOWN_SKILL} exists": skill_exists,
        "the skill python.recursion.not_real does not exist": skill_does_not_exist,
    }


# ---------------------------------------------------------------------------
# The verification itself
# ---------------------------------------------------------------------------


def test_the_contract_exists_and_records_every_interaction() -> None:
    """Non-vacuity, checked before anything is verified.

    A verifier pointed at a missing or empty contract reports success, because
    it verified everything it was given. That is the `Total: 0 tests` failure
    wearing a different costume.
    """
    assert CONTRACT.is_file(), (
        f"{CONTRACT} does not exist. Generate it with:\n"
        "  cd frontend && npx vitest run src/api/client.pact.test.ts"
    )

    interactions = json.loads(CONTRACT.read_text(encoding="utf-8"))["interactions"]
    assert len(interactions) >= EXPECTED_INTERACTIONS, (
        f"the contract records only {len(interactions)} interactions; the "
        f"consumer suite records {EXPECTED_INTERACTIONS}."
    )


def test_the_provider_honours_every_recorded_interaction(
    provider_url: str, learners: _FixedClockLearners
) -> None:
    """P8-T4. Every interaction the canvas recorded, replayed against the API."""
    verifier = (
        # `host` must match the URL's host exactly. Verifier defaults to
        # "localhost" and raises `ValueError: Host mismatch: 127.0.0.1 !=
        # localhost" otherwise -- the two are the same machine and not the same
        # string, and the verifier is right to refuse rather than guess.
        Verifier("learning-os", host="127.0.0.1")
        .add_transport(url=provider_url)
        .add_source(CONTRACT)
        .state_handler(_make_state_handlers(learners))
        # Without this a verifier handed no interactions exits 0. The check
        # above covers a missing file; this covers a file that exists and is
        # empty.
        .set_error_on_empty_pact()
    )
    verifier.verify()


def test_the_narrowed_network_guard_still_refuses_a_non_loopback_address() -> None:
    """The guard must still REFUSE, or it has been switched off with extra steps.

    `tests/contract/conftest.py` permits loopback so the provider above can be
    reached at all. A guard asserted only to ALLOW is a guard nobody has
    checked, and this directory would then be the one place in the suite where a
    test could quietly reach the internet.
    """
    with pytest.raises(AssertionError, match="not loopback"):
        socket.create_connection(("example.test", 80))
