"""attempts.session_id, and the trigger that refuses a closed session

Revision ID: 0002_session_link
Revises: 0001_initial
Create Date: 2026-08-25

WHY A TRIGGER AND NOT A CHECK CONSTRAINT
----------------------------------------
A `CHECK` sees only the row being written. "The session this attempt belongs to
is not closed" depends on another table. PostgreSQL accepts a subquery inside a
CHECK in some forms and then does not re-evaluate it when the OTHER table
changes -- which is worse than no constraint, because it looks enforced.

A trigger sees both rows and runs on every write, including writes that never go
near the application.

BEFORE INSERT **OR UPDATE**, AND THE `OR UPDATE` IS NOT DECORATION
------------------------------------------------------------------
A trigger on INSERT alone is defeated in two statements: write the attempt
against an open session, then UPDATE it to point at the closed one. Same end
state, no refusal. `test_moving_an_attempt_into_a_closed_session_is_refused`
fails without it.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_session_link"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


#: Named so the tests can assert on the message rather than on "an error".
#:
#: A test satisfied by any database error passes when the trigger has been
#: dropped and something unrelated broke, which is the failure mode this
#: repository has already shipped once with `exit == 2`.
_MESSAGE = "attempt % belongs to closed session %"


def upgrade() -> None:
    op.add_column(
        "attempts",
        sa.Column("session_id", sa.String(length=64), nullable=True),
    )
    op.create_foreign_key(
        "fk_attempts_session",
        "attempts",
        "sessions",
        ["session_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    # An index because the trigger and every "what happened in this sitting"
    # query filter on it. Without one, both do a sequential scan of every
    # attempt ever recorded.
    op.create_index("ix_attempts_session_id", "attempts", ["session_id"])

    op.execute(
        """
        CREATE OR REPLACE FUNCTION refuse_attempt_in_closed_session()
        RETURNS TRIGGER AS $$
        DECLARE
            shut TIMESTAMPTZ;
        BEGIN
            -- A NULL session is an attempt outside any sitting, which is
            -- legitimate: an API caller, a backfill, a practice widget. Only a
            -- named session is checked.
            IF NEW.session_id IS NULL THEN
                RETURN NEW;
            END IF;

            SELECT closed_at INTO shut FROM sessions WHERE id = NEW.session_id;

            IF shut IS NOT NULL THEN
                RAISE EXCEPTION
                    'attempt % belongs to closed session % (closed at %)',
                    NEW.id, NEW.session_id, shut
                    USING ERRCODE = 'check_violation';
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_refuse_attempt_in_closed_session
        BEFORE INSERT OR UPDATE ON attempts
        FOR EACH ROW EXECUTE FUNCTION refuse_attempt_in_closed_session();
        """
    )


def downgrade() -> None:
    # Dropped in the reverse order they were created. The trigger goes before
    # the function it calls, and the column goes last -- P6-T7 rolls this
    # migration back on a real database, so a downgrade that leaves a dangling
    # trigger is a failing test rather than a surprise later.
    op.execute("DROP TRIGGER IF EXISTS trg_refuse_attempt_in_closed_session ON attempts")
    op.execute("DROP FUNCTION IF EXISTS refuse_attempt_in_closed_session()")
    op.drop_index("ix_attempts_session_id", table_name="attempts")
    op.drop_constraint("fk_attempts_session", "attempts", type_="foreignkey")
    op.drop_column("attempts", "session_id")
