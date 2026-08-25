"""Alembic's entry point.

WHERE THE URL COMES FROM
------------------------
`LEARNING_OS_DATABASE_URL`, and nowhere else. A `sqlalchemy.url` in the
committed `alembic.ini` is the line somebody eventually points at production by
accident, and it is the obvious place for a password to end up in git history.
An unset variable is a loud failure rather than a default that silently
connects to something.

WHY `compare_type` IS ON
------------------------
Without it, autogenerate ignores a column whose TYPE changed -- `TIMESTAMP` to
`TIMESTAMPTZ` among them. Since every timestamp in this schema being
timezone-aware is the one property the review scheduler depends on, a diff that
cannot see that change is a diff that would let it regress in silence.
"""

from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from learning_os.db.models import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

#: What autogenerate compares the database against.
target_metadata = Base.metadata

ENV_VAR = "LEARNING_OS_DATABASE_URL"


def _url() -> str:
    url = os.environ.get(ENV_VAR)
    if not url:
        raise RuntimeError(
            f"{ENV_VAR} is not set. Alembic has no database to migrate.\n"
            "There is deliberately no default: a URL in the committed config is "
            "how a migration gets run against the wrong database.\n"
            "  export LEARNING_OS_DATABASE_URL='postgresql+psycopg://localhost/learning_os'"
        )
    return url


def run_migrations_offline() -> None:
    """Emit SQL without connecting. Used to review a migration before running it."""
    context.configure(
        url=_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    section = config.get_section(config.config_ini_section, {})
    section["sqlalchemy.url"] = _url()

    connectable = engine_from_config(
        section, prefix="sqlalchemy.", poolclass=pool.NullPool
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
