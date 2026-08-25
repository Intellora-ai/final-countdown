"""A real PostgreSQL database, created and dropped per test session.

WHY A REAL DATABASE AND NOT SQLITE
----------------------------------
The point of these tests is that constraints are enforced BY the database, so
that no code path can break them. SQLite does not enforce foreign keys unless
asked, has no `TIMESTAMPTZ`, and treats uniqueness over nullable columns
differently from PostgreSQL. A suite that passed on SQLite would be evidence
about SQLite.

NOTHING HERE IS EVER SWITCHED OFF, AND THAT IS THE DESIGN
---------------------------------------------------------
The obvious shape was written here first: when no database is configured, mark
the tests as not-to-be-run and move on. The repository's own gate refused it,
correctly. A test that has been switched off and a test that passed are
indistinguishable in a summary line, and this repository has already shipped a
suite that collected nothing and reported success.

So a missing `LEARNING_OS_TEST_DATABASE_URL` raises. Which forces the real
question: how does `pytest tests -q` in the learning-os job pass, when that job
has no PostgreSQL?

It does not run these. `tests/db` is a SEPARATE SUITE run by a SEPARATE
workflow, `.github/workflows/integration.yml`, which provides PostgreSQL as a
service container. The learning-os job excludes this directory explicitly. Two
suites, two jobs, each with the dependencies it actually needs -- rather than
one suite that quietly disables half of itself depending on the machine it is
running on.

WHY A SCRATCH DATABASE PER SESSION
----------------------------------
These tests create, drop, and violate constraints on purpose. Pointing them at a
database anybody cares about is how a suite deletes something real. The name
carries the process id and a random suffix so concurrent runs cannot collide.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session

#: Where the server is. A MAINTENANCE database, not the one under test --
#: `CREATE DATABASE` cannot run inside the database it is creating.
ENV_VAR = "LEARNING_OS_TEST_DATABASE_URL"


@pytest.fixture(scope="session")
def maintenance_url() -> str:
    url = os.environ.get(ENV_VAR)
    if not url:
        # A hard failure, deliberately. See the module docstring: the absence of
        # a database must not be able to masquerade as a passing suite.
        raise RuntimeError(
            f"{ENV_VAR} is not set, so there is no PostgreSQL to test against.\n"
            "These tests are run by .github/workflows/integration.yml, which "
            "supplies one as a service container.\n"
            "To run them locally, point the variable at a maintenance database:\n"
            f"  export {ENV_VAR}='postgresql+psycopg://localhost/postgres'\n"
            "  python3 -m pytest tests/db"
        )
    return url


@pytest.fixture(scope="session")
def database_url(maintenance_url: str) -> Iterator[str]:
    """A fresh database, dropped when the session ends."""
    name = f"learning_os_test_{os.getpid()}_{uuid.uuid4().hex[:8]}"

    # AUTOCOMMIT because CREATE DATABASE cannot run inside a transaction block.
    admin = create_engine(maintenance_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as connection:
        connection.execute(text(f'CREATE DATABASE "{name}"'))

    base, _, _ = maintenance_url.rpartition("/")
    yield f"{base}/{name}"

    with admin.connect() as connection:
        # Terminate stragglers first: one leaked connection makes DROP DATABASE
        # hang, and a hanging teardown reads as a broken test rather than as a
        # connection nobody closed.
        connection.execute(
            text(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                "WHERE datname = :name AND pid <> pg_backend_pid()"
            ),
            {"name": name},
        )
        connection.execute(text(f'DROP DATABASE IF EXISTS "{name}"'))
    admin.dispose()


@pytest.fixture(scope="session")
def engine(database_url: str) -> Iterator[Engine]:
    """A migrated database.

    THE SCHEMA COMES FROM THE MIGRATION, NOT FROM `Base.metadata.create_all`.

    `create_all` builds the schema the models describe. The migration builds the
    schema that actually ships. Those are the same thing exactly until someone
    edits a model and forgets the migration -- at which point `create_all` tests
    a database no deployment will ever have, and every test goes green on a
    schema that does not exist anywhere.

    Running the migration here means the whole suite fails if the migration is
    wrong or missing, which is the only arrangement where "migrations apply to
    an empty database" is a fact rather than a hope.
    """
    _migrate(database_url)
    created = create_engine(database_url)
    yield created
    created.dispose()


def _migrate(database_url: str) -> None:
    """`alembic upgrade head` against the scratch database.

    Invoked in-process rather than as a subprocess so a failure raises here with
    a real traceback, instead of arriving as a non-zero exit code and a wall of
    captured output.
    """
    from alembic import command
    from alembic.config import Config

    root = Path(__file__).resolve().parents[2]
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "alembic"))
    # Alembic's env.py reads this variable and refuses to guess a default, so it
    # is set here rather than passed -- the same path a deployment uses.
    os.environ["LEARNING_OS_DATABASE_URL"] = database_url
    command.upgrade(config, "head")


@pytest.fixture()
def session(engine: Engine) -> Iterator[Session]:
    """One transaction per test, rolled back afterwards.

    Rolled back rather than truncated so a test that leaves rows behind cannot
    change what the next test sees. Order-dependent database tests are the
    hardest flake to find, because every one of them passes alone.
    """
    connection = engine.connect()
    transaction = connection.begin()
    opened = Session(bind=connection)
    try:
        yield opened
    finally:
        opened.close()
        transaction.rollback()
        connection.close()
