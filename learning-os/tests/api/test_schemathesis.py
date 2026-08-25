"""P7-T5 — generated requests against every route: no 5xx, every response valid.

WHAT THIS ADDS THAT HAND-WRITTEN TESTS CANNOT
---------------------------------------------
Every other test in this directory checks an input somebody thought of. That is
the whole limitation: the inputs that break an API are, by definition, the ones
nobody thought of.

Schemathesis reads `learning-os/openapi.json` and generates requests from it --
boundary values, wrong types, missing fields, absurd strings, unexpected
combinations -- then checks two things about every single response:

  1. It is not a 5xx. A caller mistake is never the server's fault, and an
     unhandled exception is the server admitting it did not consider an input.
  2. It matches the schema the document declares for that status code. A route
     returning a shape its own contract does not describe is the exact Phase 4
     failure condition, now checked against inputs nobody chose.

NOTHING HERE CARRIES A DESELECTION MARKER, AND THAT WAS NOT THE FIRST DRAFT
---------------------------------------------------------------------------
This was first written with a custom pytest marker naming it as expensive, and
the law gate refused it, correctly. Any non-structural marker is a handle for
`-m "not <name>"`: the test stops running, the suite still reports green, and
the fuzzing that was the entire point of the phase silently stops.

The cost is bounded by `max_examples` instead, which reduces how much is
generated without ever reducing it to nothing.

WHY IN-PROCESS AND NOT AGAINST A RUNNING SERVER
-----------------------------------------------
The app is driven directly over ASGI. No port, no server process, no network --
which matters because `tests/conftest.py` refuses sockets for the whole suite. A
test needing a live server could not run here at all, and the version that
"fixed" that by allowing sockets would have quietly removed the offline
guarantee from every other test in the repository.

WHY THE SCHEMA COMES FROM THE COMMITTED FILE
---------------------------------------------
Not from `app.openapi()`. Generating from the live app means the generator and
the application agree by construction, so a drifted committed document -- the
one Phase 8's Pact contracts and any external consumer actually read -- would
never be exercised. `scripts/openapi_drift.py` keeps the two equal; this reads
the artefact, so that gate has something to be about.

WHAT THIS SUITE CANNOT SEE, MEASURED RATHER THAN ASSUMED
---------------------------------------------------------
Two deliberate breaks were introduced to find out. The results are not
symmetrical and the difference matters:

  BREAK 1 -- `/concepts` reports the PAGE length as the collection `total`,
  a real and common pagination bug.
      schemathesis: 10 passed. It did NOT notice.
      hand-written: 3 failures.

  BREAK 2 -- `/health` returns `knowledge_version` as an int where the schema
  declares a string.
      schemathesis: FAILED on GET /health.
      Reverting made it green again.

Break 1 is schema-compliant. `total: 1` is a perfectly valid integer, and
nothing in an OpenAPI document can say "this integer must count the whole
collection". Schemathesis checks SHAPE and STATUS; it cannot check MEANING.

So this file is not a replacement for `test_functional.py`, and neither is a
replacement for this. The generator finds inputs nobody thought of; the
hand-written tests encode what the numbers are supposed to mean. Deleting
either one loses a whole class of bug, and break 1 is the proof.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import schemathesis
from hypothesis import HealthCheck, settings

from learning_os.http.app import build_app, openapi_document

#: The committed contract. See the module docstring for why this rather than
#: the live app's generated document.
SCHEMA_PATH = Path(__file__).resolve().parents[2] / "openapi.json"

app = build_app()

# LOADED FROM THE FILE, THEN POINTED AT THE APP.
#
# `from_asgi(path, app)` would do both in one call and is the obvious spelling,
# but it reads the schema OUT OF the running app -- which makes the generator
# and the application agree by construction and leaves the committed document
# untested. `from_path` takes no `app` argument (it is a file loader), so the
# transport is attached afterwards.
#
# The result is what this phase actually needs: cases generated from the
# artefact external consumers read, executed against the code that has to
# honour it. A gap between those two is precisely what should fail here.
schema = schemathesis.openapi.from_path(SCHEMA_PATH)
schema.app = app


#: How many cases to generate per operation.
#:
#: 30 on a pull request, 500 on the nightly schedule. The DEFAULT is the fast
#: one on purpose: an unset variable must produce the cheap run, so a developer
#: running the suite locally and a pull request behave the same way without
#: anybody having to remember an export. `.github/workflows/nightly.yml` is the
#: only place the larger number is set.
#:
#: One suite, one number. A separate nightly suite would be a second thing to
#: keep in step, and the one that is never read is the one that rots.
MAX_EXAMPLES = int(os.environ.get("SCHEMATHESIS_MAX_EXAMPLES", "30"))


@schema.parametrize()
@settings(
    max_examples=MAX_EXAMPLES,
    deadline=None,
    # The app is built once at import and reused across examples, which
    # Hypothesis would otherwise flag.
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow],
)
def test_no_generated_request_produces_a_5xx_or_an_invalid_response(case) -> None:  # type: ignore[no-untyped-def]
    """The two claims in the module docstring, both enforced by one call.

    `call_and_validate` runs the generated request against the ASGI app and
    applies every check schemathesis has -- server-error detection among them,
    and response-schema conformance. A bare `case.call()` would exercise the API
    and assert nothing, which is the shape of a fuzzing suite that has never
    failed because it cannot.
    """
    case.call_and_validate()


def test_the_schema_under_test_covers_every_route() -> None:
    """Non-vacuity, and it is not optional here.

    A schema that loaded but produced no operations makes the generated suite
    silently empty: zero requests, zero failures, a green line. That is
    indistinguishable from a thorough pass in a summary, and it is the failure
    this repository has already shipped once with `Total: 0 tests`.
    """
    expected = {
        "/health",
        "/concepts",
        "/learners",
        "/learners/{learner_id}",
        "/learners/{learner_id}/mastery",
        "/learners/{learner_id}/attempts",
        "/learners/{learner_id}/next",
        "/lessons",
    }
    covered = set(schema)
    missing = expected - covered
    assert missing == set(), f"schemathesis loaded no operations for: {sorted(missing)}"


def test_the_committed_schema_is_what_the_code_produces() -> None:
    """The generator is only as good as the document it reads.

    `scripts/openapi_drift.py` is the gate for this and runs in CI. Asserting it
    here too means a stale document fails the fuzzing suite rather than quietly
    making it test an API that no longer exists.
    """
    committed = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    assert committed == openapi_document(), (
        "learning-os/openapi.json is stale, so these generated cases are being "
        "built from an API that no longer exists.\n"
        "Regenerate with: python3 scripts/openapi_drift.py --write"
    )
