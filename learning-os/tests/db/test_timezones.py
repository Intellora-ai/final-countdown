"""P6-T6 — every timestamp is `TIMESTAMPTZ`, and reads back as the same instant.

WHY THIS IS NOT PEDANTRY
------------------------
`next_review_at` decides when a learner sees a card again. A naive timestamp is
a number with no meaning until somebody guesses a zone, and the guess is made
separately by every reader. Written in one zone and compared in another, a card
arrives a day early or a day late -- silently, forever, for the learners in that
zone only. Nothing in the product can notice, because every individual value
looks reasonable.

WHAT IS ACTUALLY ASSERTED
-------------------------
Two different things, and they fail for different reasons:

  1. The COLUMN TYPE is `timestamp with time zone`, read from the catalogue.
     This catches a new column declared without `timezone=True`.
  2. An instant written in one zone reads back EQUAL to the same instant
     expressed in another. This catches the column being right and the value
     still being wrong.

The first without the second passes on a correctly-typed column holding garbage.
The second without the first passes today and breaks the first time somebody
adds a column.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from learning_os.db.models import Attempt, Concept, Learner, Mastery, Skill

#: Kolkata is +05:30. A half-hour offset is deliberate: a bug that drops the
#: offset entirely, and a bug that rounds to whole hours, both survive a test
#: written against a zone like UTC+1.
KOLKATA = timezone(timedelta(hours=5, minutes=30))

#: The same instant, two ways of writing it.
AS_UTC = datetime(2026, 5, 1, 6, 30, tzinfo=UTC)
AS_KOLKATA = datetime(2026, 5, 1, 12, 0, tzinfo=KOLKATA)


def test_the_two_representations_really_are_one_instant() -> None:
    """A guard on the test's own premise.

    If these two were not equal in Python, every assertion below would be
    comparing the wrong things and would still pass or fail for reasons that had
    nothing to do with the database.
    """
    assert AS_UTC == AS_KOLKATA


def _fixtures(session: Session) -> tuple[Learner, Skill]:
    concept = Concept(id="chem.mole", subject="chem", chapter="mole", name="The mole")
    skill = Skill(id="chem.mole.convert", concept_id=concept.id, name="convert")
    learner = Learner(id="L-tz", created_at=AS_UTC, cohort="y12", stream="science")
    session.add_all([concept, skill, learner])
    session.flush()
    return learner, skill


def test_every_timestamp_column_is_timestamptz(session: Session) -> None:
    """Claim 1, read from PostgreSQL's own catalogue.

    Enumerated from the catalogue rather than from a hand-written list, so a new
    timestamp column added without `timezone=True` fails here on the day it is
    added rather than whenever somebody remembers to extend a list.
    """
    rows = session.execute(
        text(
            "SELECT table_name, column_name, data_type "
            "FROM information_schema.columns "
            "WHERE table_schema = 'public' AND data_type LIKE 'timestamp%' "
            "ORDER BY table_name, column_name"
        )
    ).all()

    assert rows, "no timestamp columns found at all, which cannot be right"

    naive = [
        f"{table}.{column} is {kind}"
        for table, column, kind in rows
        if kind != "timestamp with time zone"
    ]
    assert naive == [], "naive timestamp columns found:\n" + "\n".join(naive)


def test_an_instant_written_in_another_zone_reads_back_equal(
    session: Session,
) -> None:
    """Claim 2. Written as +05:30, compared against the same instant in UTC."""
    learner, skill = _fixtures(session)
    session.add(
        Attempt(
            id="A-tz",
            learner_id=learner.id,
            skill_id=skill.id,
            at=AS_KOLKATA,
            correct=True,
            difficulty=0.5,
            idempotency_key="tz",
        )
    )
    session.flush()
    session.expire_all()

    stored = session.query(Attempt).filter_by(id="A-tz").one().at
    assert stored == AS_UTC
    assert stored.utcoffset() is not None, "the value came back without a zone"


def test_two_writes_of_one_instant_in_different_zones_compare_equal(
    session: Session,
) -> None:
    """The strongest form: the DATABASE must agree they are the same moment.

    A column storing the wall-clock digits and dropping the offset would keep
    both values, and they would differ by five and a half hours. Comparing them
    in SQL rather than in Python is what makes this a statement about the
    database.
    """
    learner, skill = _fixtures(session)
    session.add_all(
        [
            Attempt(
                id="A-utc",
                learner_id=learner.id,
                skill_id=skill.id,
                at=AS_UTC,
                correct=True,
                difficulty=0.5,
                idempotency_key="utc",
            ),
            Attempt(
                id="A-ist",
                learner_id=learner.id,
                skill_id=skill.id,
                at=AS_KOLKATA,
                correct=True,
                difficulty=0.5,
                idempotency_key="ist",
            ),
        ]
    )
    session.flush()

    same = session.execute(
        text(
            "SELECT (SELECT at FROM attempts WHERE id = 'A-utc') "
            "     = (SELECT at FROM attempts WHERE id = 'A-ist')"
        )
    ).scalar_one()
    assert same is True


def test_a_different_instant_does_not_compare_equal(session: Session) -> None:
    """The PAIR. Without it, a column that collapsed every value to a constant
    would satisfy the test above."""
    learner, skill = _fixtures(session)
    session.add_all(
        [
            Attempt(
                id="A-one",
                learner_id=learner.id,
                skill_id=skill.id,
                at=AS_UTC,
                correct=True,
                difficulty=0.5,
                idempotency_key="one",
            ),
            Attempt(
                id="A-two",
                learner_id=learner.id,
                skill_id=skill.id,
                at=AS_UTC + timedelta(seconds=1),
                correct=True,
                difficulty=0.5,
                idempotency_key="two",
            ),
        ]
    )
    session.flush()

    same = session.execute(
        text(
            "SELECT (SELECT at FROM attempts WHERE id = 'A-one') "
            "     = (SELECT at FROM attempts WHERE id = 'A-two')"
        )
    ).scalar_one()
    assert same is False


def test_review_scheduling_survives_a_zone_change(session: Session) -> None:
    """The rule this whole file exists for, applied where it bites.

    `next_review_at` written in Kolkata time must still be exactly one day after
    `last_review_at` written in UTC. A dropped offset makes the gap read as
    eighteen and a half hours, and the card arrives early for everyone in that
    zone.
    """
    learner, skill = _fixtures(session)
    session.add(
        Mastery(
            learner_id=learner.id,
            skill_id=skill.id,
            level=0.4,
            last_review_at=AS_UTC,
            next_review_at=AS_KOLKATA + timedelta(days=1),
        )
    )
    session.flush()

    gap = session.execute(
        text("SELECT next_review_at - last_review_at FROM mastery")
    ).scalar_one()
    assert gap == timedelta(days=1)
