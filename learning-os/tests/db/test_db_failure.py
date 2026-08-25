"""P6-T9 — when the database dies, the answer must be an ERROR, never a number.

THE FAILURE MODE, PRECISELY
---------------------------
This is the masked-error shape, and it is the most expensive bug in the
catalogue because it is invisible:

    database dies  ->  query raises  ->  caught  ->  return []  ->  "no records"

Every layer behaves reasonably. The user is told, with total confidence, that a
learner has no attempts. They have hundreds. Nothing logs an error, no alert
fires, and the screen looks exactly like the screen for a genuinely new learner.

A raised exception is a bad afternoon. A wrong answer is a wrong decision, and
here the decision is what to teach a person next.

WHAT IS ASSERTED
----------------
  1. A query on a killed connection RAISES. It does not return an empty result.
  2. The exception is a database error, not a generic one -- a caller can tell
     "the database is unreachable" from "there is nothing here".
  3. `/health` reports `down` when it is told the database is down, so an
     operator sees the outage rather than inferring it from empty screens.

HOW THE DATABASE IS "KILLED"
----------------------------
`pg_terminate_backend` on this session's own connection, issued from a separate
administrative connection. That is a real server-side termination -- the same
thing a failover, an OOM kill, or a restart does -- rather than a mocked
exception, which would only prove the mock was configured.
"""

from __future__ import annotations

import pytest
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.exc import DBAPIError, OperationalError
from sqlalchemy.orm import Session

from learning_os.db.models import Learner


def _kill(maintenance_url: str, victim: Session) -> None:
    """Terminate the victim session's backend from an outside connection."""
    pid = victim.execute(text("SELECT pg_backend_pid()")).scalar_one()
    admin = create_engine(maintenance_url, isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as connection:
            connection.execute(
                text("SELECT pg_terminate_backend(:pid)"), {"pid": pid}
            )
    finally:
        admin.dispose()


def test_a_query_after_the_connection_dies_raises_rather_than_returning_empty(
    engine: Engine, maintenance_url: str
) -> None:
    """Claims 1 and 2 together. This is the whole point of P6-T9."""
    with Session(engine) as doomed:
        # Prove the session works first. Without this, a session that was broken
        # from the start would pass by raising for the wrong reason.
        doomed.execute(text("SELECT 1")).scalar_one()

        _kill(maintenance_url, doomed)

        with pytest.raises(DBAPIError) as raised:
            doomed.query(Learner).all()

    # Not a bare Exception. A caller has to be able to tell an unreachable
    # database from an empty table, and catching `Exception` at a call site is
    # how those two get collapsed into one silent answer.
    assert isinstance(raised.value, DBAPIError)


def test_the_error_is_recognisable_as_a_connection_failure(
    engine: Engine, maintenance_url: str
) -> None:
    """Claim 2, sharpened.

    `OperationalError` is SQLAlchemy's class for "the database is unreachable",
    as distinct from `IntegrityError` for "you wrote something illegal". A layer
    deciding whether to retry needs that difference: a retry fixes the first and
    can never fix the second.
    """
    with Session(engine) as doomed:
        doomed.execute(text("SELECT 1")).scalar_one()
        _kill(maintenance_url, doomed)

        with pytest.raises(OperationalError):
            doomed.execute(text("SELECT count(*) FROM learners")).scalar_one()


def test_a_healthy_connection_returns_a_real_answer(engine: Engine) -> None:
    """The PAIR, and it is not decoration.

    Without it, a database that refused every query would satisfy both tests
    above perfectly. This is the one that proves the failure tests are measuring
    a failure rather than the normal state.
    """
    with Session(engine) as healthy:
        assert healthy.execute(text("SELECT 1")).scalar_one() == 1
        # A count, not a truthiness check: `[]` is falsy and so is a broken
        # query's empty result, which is exactly the confusion under test.
        assert isinstance(healthy.query(Learner).count(), int)


def test_the_engine_recovers_on_a_new_connection(
    engine: Engine, maintenance_url: str
) -> None:
    """A killed backend must not poison the pool forever.

    If it did, one transient failover would take the service down until it was
    restarted by hand -- turning a momentary outage into a permanent one.
    """
    with Session(engine) as doomed:
        doomed.execute(text("SELECT 1")).scalar_one()
        _kill(maintenance_url, doomed)
        with pytest.raises(DBAPIError):
            doomed.execute(text("SELECT 1")).scalar_one()

    with Session(engine) as recovered:
        assert recovered.execute(text("SELECT 1")).scalar_one() == 1


# ---------------------------------------------------------------------------
# Claim 3 -- the API says so out loud
# ---------------------------------------------------------------------------


def test_health_reports_degraded_when_the_database_is_down() -> None:
    """An operator must see the outage, not infer it from empty screens.

    `/health` takes the database's state as a parameter today, because the API
    does not yet read from PostgreSQL -- the repository behind it is still the
    in-memory adapter. So this asserts the REPORTING is right: told `down`, the
    service says `degraded` rather than `ok`.

    Stated plainly so nobody reads more into it: this does not prove the API
    detects an outage, because the API is not wired to the database yet. It
    proves that when something tells it the database is down, it does not
    answer `ok`.
    """
    from fastapi.testclient import TestClient

    from learning_os.http.app import build_app

    with TestClient(build_app(database="down")) as client:
        body = client.get("/health").json()

    assert body["status"] == "degraded"
    assert body["database"] == "down"


def test_health_reports_ok_when_the_database_is_up() -> None:
    """The PAIR for the reporting claim."""
    from fastapi.testclient import TestClient

    from learning_os.http.app import build_app

    with TestClient(build_app(database="up")) as client:
        body = client.get("/health").json()

    assert body["status"] == "ok"
    assert body["database"] == "up"
