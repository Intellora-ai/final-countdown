"""P6-T3 and P6-T4 — the constraints the database enforces, in pairs.

Every test here has a partner. A foreign key asserted only to REJECT is
satisfied by a table that rejects every insert, and a range check asserted only
to ACCEPT is satisfied by no check at all. Neither half is evidence alone.

The point of putting these rules in the database rather than in Python is that a
migration script, a maintenance query, a second service, or a fixture loader
cannot go around them. So they are tested by trying to go around them: raw
inserts, not the application's own write path.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from learning_os.db.models import Attempt, Concept, Learner, Mastery, Skill

AT = datetime(2026, 3, 1, 10, 0, tzinfo=UTC)


def _fixtures(session: Session) -> tuple[Learner, Skill]:
    concept = Concept(
        id="physics.gas", subject="physics", chapter="gas", name="Gas pressure"
    )
    skill = Skill(id="physics.gas.pressure", concept_id=concept.id, name="pressure")
    learner = Learner(id="L-con", created_at=AT, cohort="y12", stream="science")
    session.add_all([concept, skill, learner])
    session.flush()
    return learner, skill


# ---------------------------------------------------------------------------
# P6-T3 -- foreign keys
# ---------------------------------------------------------------------------


def test_an_attempt_cannot_reference_a_learner_that_does_not_exist(
    session: Session,
) -> None:
    _, skill = _fixtures(session)
    session.add(
        Attempt(
            id="A-ghost",
            learner_id="L-does-not-exist",
            skill_id=skill.id,
            at=AT,
            correct=True,
            difficulty=0.5,
            idempotency_key="k",
        )
    )
    with pytest.raises(IntegrityError) as raised:
        session.flush()
    assert "learner_id" in str(raised.value)


def test_an_attempt_cannot_reference_a_skill_that_does_not_exist(
    session: Session,
) -> None:
    learner, _ = _fixtures(session)
    session.add(
        Attempt(
            id="A-ghost-skill",
            learner_id=learner.id,
            skill_id="physics.gas.no_such_skill",
            at=AT,
            correct=True,
            difficulty=0.5,
            idempotency_key="k",
        )
    )
    with pytest.raises(IntegrityError) as raised:
        session.flush()
    assert "skill_id" in str(raised.value)


def test_an_attempt_referencing_real_rows_is_accepted(session: Session) -> None:
    """The PAIR for both foreign-key tests above."""
    learner, skill = _fixtures(session)
    session.add(
        Attempt(
            id="A-real",
            learner_id=learner.id,
            skill_id=skill.id,
            at=AT,
            correct=True,
            difficulty=0.5,
            idempotency_key="k",
        )
    )
    session.flush()
    assert session.query(Attempt).filter_by(id="A-real").one().learner_id == learner.id


def test_a_skill_cannot_reference_a_concept_that_does_not_exist(
    session: Session,
) -> None:
    session.add(Skill(id="nope.skill", concept_id="nope.concept", name="x"))
    with pytest.raises(IntegrityError):
        session.flush()


def test_a_concept_with_skills_cannot_be_deleted(session: Session) -> None:
    """`ondelete=RESTRICT`, asserted rather than trusted.

    A concept deleted out from under its skills would leave every attempt
    pointing at a skill whose subject no longer exists. RESTRICT makes that
    impossible; CASCADE would make it silent and catastrophic.
    """
    _, skill = _fixtures(session)
    # The raise is around `execute`, not `flush`. RESTRICT is checked by the
    # server the moment the DELETE runs, so the error arrives here -- unlike an
    # ORM insert, which is buffered until flush. Wrapping the wrong call made
    # this test fail against a database that was behaving correctly.
    with pytest.raises(IntegrityError) as raised:
        session.execute(
            text("DELETE FROM concepts WHERE id = :cid"), {"cid": skill.concept_id}
        )
    assert "skills_concept_id_fkey" in str(raised.value)


def test_deleting_a_learner_removes_their_attempts(session: Session) -> None:
    """`ondelete=CASCADE` on the learner side, and this one IS wanted.

    An attempt is a fact about a learner. When the learner is erased -- a
    deletion request, a test fixture -- an orphaned attempt row is personal data
    nobody can account for. The asymmetry with concepts above is deliberate:
    concepts are shared curriculum, attempts belong to one person.
    """
    learner, skill = _fixtures(session)
    session.add(
        Attempt(
            id="A-cascade",
            learner_id=learner.id,
            skill_id=skill.id,
            at=AT,
            correct=True,
            difficulty=0.5,
            idempotency_key="k",
        )
    )
    session.flush()

    session.execute(text("DELETE FROM learners WHERE id = :lid"), {"lid": learner.id})
    session.flush()
    assert session.query(Attempt).filter_by(id="A-cascade").count() == 0


# ---------------------------------------------------------------------------
# P6-T4 -- next_review_at is never earlier than last_review_at
# ---------------------------------------------------------------------------


def test_a_review_scheduled_before_the_last_one_is_refused(session: Session) -> None:
    """"Review this before you last reviewed it" is a contradiction, not data.

    No scheduler can act on it. Left to application code the rule holds until
    the first backfill script; as a CHECK it cannot be written at all.
    """
    learner, skill = _fixtures(session)
    session.add(
        Mastery(
            learner_id=learner.id,
            skill_id=skill.id,
            level=0.5,
            last_review_at=AT,
            next_review_at=AT - timedelta(seconds=1),
        )
    )
    with pytest.raises(IntegrityError) as raised:
        session.flush()
    assert "ck_mastery_review_order" in str(raised.value)


def test_a_review_scheduled_after_the_last_one_is_accepted(session: Session) -> None:
    learner, skill = _fixtures(session)
    session.add(
        Mastery(
            learner_id=learner.id,
            skill_id=skill.id,
            level=0.5,
            last_review_at=AT,
            next_review_at=AT + timedelta(days=3),
        )
    )
    session.flush()
    assert session.query(Mastery).count() == 1


def test_a_review_scheduled_at_the_same_instant_is_accepted(session: Session) -> None:
    """The BOUNDARY, and it is the case a `>` instead of `>=` gets wrong.

    Equal timestamps mean "due now", which is a real and common state -- a card
    reviewed and immediately rescheduled for immediate repetition. A strict
    inequality would refuse it, and the failure would look like a database
    problem rather than an off-by-one in a constraint.
    """
    learner, skill = _fixtures(session)
    session.add(
        Mastery(
            learner_id=learner.id,
            skill_id=skill.id,
            level=0.5,
            last_review_at=AT,
            next_review_at=AT,
        )
    )
    session.flush()
    assert session.query(Mastery).count() == 1


def test_every_seeded_mastery_row_satisfies_the_review_order(session: Session) -> None:
    """P6-T4 over the whole dataset, not one hand-built row.

    A constraint holds by construction; the point of checking the seeded data is
    that the GENERATOR obeys it too. A seed that violated it would fail at
    insert time, so this is really asserting the dataset is present and the rule
    is live over all of it at once.
    """
    from learning_os.db import seed as seeding

    seeding.seed(session, seed=20260825)
    rows = session.query(Mastery).all()
    assert rows, "no mastery rows to check"
    assert all(row.next_review_at >= row.last_review_at for row in rows)


# ---------------------------------------------------------------------------
# Range checks
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("level", [-0.01, 1.01])
def test_a_mastery_level_outside_zero_to_one_is_refused(
    session: Session, level: float
) -> None:
    learner, skill = _fixtures(session)
    session.add(
        Mastery(
            learner_id=learner.id,
            skill_id=skill.id,
            level=level,
            last_review_at=AT,
            next_review_at=AT,
        )
    )
    with pytest.raises(IntegrityError) as raised:
        session.flush()
    assert "ck_mastery_level_range" in str(raised.value)


@pytest.mark.parametrize("level", [0.0, 0.5, 1.0])
def test_a_mastery_level_inside_zero_to_one_is_accepted(
    session: Session, level: float
) -> None:
    """The PAIR, including both boundaries.

    0.0 and 1.0 are the values a `>` / `<` instead of `>=` / `<=` would wrongly
    refuse, and they are the two most meaningful levels in the range: knows
    nothing, knows it completely.
    """
    learner, skill = _fixtures(session)
    session.add(
        Mastery(
            learner_id=learner.id,
            skill_id=skill.id,
            level=level,
            last_review_at=AT,
            next_review_at=AT,
        )
    )
    session.flush()
    assert session.query(Mastery).one().level == level


@pytest.mark.parametrize("difficulty", [-0.5, 1.5])
def test_an_attempt_difficulty_outside_zero_to_one_is_refused(
    session: Session, difficulty: float
) -> None:
    learner, skill = _fixtures(session)
    session.add(
        Attempt(
            id="A-diff",
            learner_id=learner.id,
            skill_id=skill.id,
            at=AT,
            correct=True,
            difficulty=difficulty,
            idempotency_key="k",
        )
    )
    with pytest.raises(IntegrityError) as raised:
        session.flush()
    assert "ck_attempts_difficulty_range" in str(raised.value)
