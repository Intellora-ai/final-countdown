"""P6-T7 — migrations apply forward and roll back, on a real database.

WHY A ROLLBACK TEST IS NOT OPTIONAL
-----------------------------------
A `downgrade()` nobody runs is a `downgrade()` that does not work. It is written
once, from memory, at the moment the upgrade is written -- and the first time
anybody needs it, it is during an incident, on a database that matters, under
time pressure. That is the worst possible moment to discover it drops a column
whose trigger still references it.

So every migration in this repository is applied forward and rolled back on a
real PostgreSQL, in a scratch database that is created and destroyed here.

WHY THIS FILE MAKES ITS OWN DATABASE
------------------------------------
The `engine` fixture hands out a database that is already migrated to head, and
these tests need to watch it get there. Using that fixture would mean testing an
upgrade that had already happened.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text

ROOT = Path(__file__).resolve().parents[2]


def _config(database_url: str) -> Config:
    config = Config(str(ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(ROOT / "alembic"))
    os.environ["LEARNING_OS_DATABASE_URL"] = database_url
    return config


@pytest.fixture()
def blank_database(maintenance_url: str) -> Iterator[str]:
    """An EMPTY database, with no migrations applied."""
    name = f"learning_os_mig_{os.getpid()}_{uuid.uuid4().hex[:8]}"
    admin = create_engine(maintenance_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as connection:
        connection.execute(text(f'CREATE DATABASE "{name}"'))

    base, _, _ = maintenance_url.rpartition("/")
    yield f"{base}/{name}"

    with admin.connect() as connection:
        connection.execute(
            text(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                "WHERE datname = :name AND pid <> pg_backend_pid()"
            ),
            {"name": name},
        )
        connection.execute(text(f'DROP DATABASE IF EXISTS "{name}"'))
    admin.dispose()


def _tables(database_url: str) -> set[str]:
    engine = create_engine(database_url)
    try:
        with engine.connect() as connection:
            rows = connection.execute(
                text(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema = 'public'"
                )
            ).scalars()
            return set(rows)
    finally:
        engine.dispose()


def _triggers(database_url: str) -> set[str]:
    engine = create_engine(database_url)
    try:
        with engine.connect() as connection:
            rows = connection.execute(
                text("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal")
            ).scalars()
            return set(rows)
    finally:
        engine.dispose()


def test_there_is_more_than_one_migration_to_test(blank_database: str) -> None:
    """Non-vacuity.

    A rollback suite over a single migration proves very little, and one over
    zero migrations proves nothing while looking identical in a summary line.
    """
    scripts = ScriptDirectory.from_config(_config(blank_database))
    revisions = list(scripts.walk_revisions())
    assert len(revisions) >= 2, f"only {len(revisions)} migration(s) found"


def test_migrations_apply_to_an_empty_database(blank_database: str) -> None:
    assert _tables(blank_database) == set(), "the fixture database was not empty"

    command.upgrade(_config(blank_database), "head")

    tables = _tables(blank_database)
    for expected in ("learners", "concepts", "skills", "attempts", "mastery", "sessions"):
        assert expected in tables, f"{expected} was not created"


def test_the_trigger_exists_after_upgrade(blank_database: str) -> None:
    """The trigger is part of the schema, so it is part of what a migration
    must produce. A migration that created the column and skipped the trigger
    would pass the table check above and leave the rule unenforced."""
    command.upgrade(_config(blank_database), "head")
    assert "trg_refuse_attempt_in_closed_session" in _triggers(blank_database)


def test_every_migration_rolls_back_to_base(blank_database: str) -> None:
    """Forward to head, then all the way back to nothing.

    `base` rather than one step down, because a downgrade chain is only as good
    as its weakest link and stopping early would not exercise the earlier ones.
    """
    config = _config(blank_database)
    command.upgrade(config, "head")
    assert "attempts" in _tables(blank_database)

    command.downgrade(config, "base")

    remaining = _tables(blank_database) - {"alembic_version"}
    assert remaining == set(), f"tables survived the rollback: {sorted(remaining)}"


def test_the_trigger_and_its_function_do_not_survive_the_rollback(
    blank_database: str,
) -> None:
    """A dangling trigger after a downgrade is the exact failure this file is
    written to catch.

    The trigger references a column the downgrade drops. Dropped in the wrong
    order, the downgrade either errors or leaves a function behind that the next
    upgrade then redefines -- and nobody notices until a rule silently applies
    twice.
    """
    config = _config(blank_database)
    command.upgrade(config, "head")
    command.downgrade(config, "base")

    assert "trg_refuse_attempt_in_closed_session" not in _triggers(blank_database)

    engine = create_engine(blank_database)
    try:
        with engine.connect() as connection:
            found = connection.execute(
                text(
                    "SELECT proname FROM pg_proc "
                    "WHERE proname = 'refuse_attempt_in_closed_session'"
                )
            ).scalar_one_or_none()
        assert found is None, "the trigger function survived the rollback"
    finally:
        engine.dispose()


def test_upgrade_after_a_full_rollback_works(blank_database: str) -> None:
    """The cycle, which is what an incident actually looks like.

    Roll back to escape a bad deploy, fix, roll forward again. A downgrade that
    leaves the database in a state the upgrade cannot re-enter is worse than no
    downgrade, because it is discovered only after it has been used.
    """
    config = _config(blank_database)
    command.upgrade(config, "head")
    command.downgrade(config, "base")
    command.upgrade(config, "head")

    assert "attempts" in _tables(blank_database)
    assert "trg_refuse_attempt_in_closed_session" in _triggers(blank_database)
