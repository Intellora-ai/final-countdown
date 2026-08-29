"""P6-T8 — a failed multi-step write leaves no partial data.

THE FAILURE THIS PREVENTS
-------------------------
Recording an attempt is two writes: the attempt row, and the mastery row it
moves. If the first lands and the second does not, the learner's log says they
answered and their mastery says they never did. Nothing is corrupt in a way any
single query reveals -- both tables are individually valid -- and the
reconciliation in `test_mastery_reconciles.py` is the only thing that would ever
notice, months later.

Partial state is worse than a failed write, because a failed write is retried
and a partial one is trusted.

WHY A SAVEPOINT AND NOT A NEW SESSION
-------------------------------------
The `session` fixture already wraps every test in a transaction it rolls back.
Testing rollback inside that needs a nested transaction -- `begin_nested`, which
PostgreSQL implements as a SAVEPOINT -- so the inner failure can be rolled back
without destroying the outer one the fixture is relying on.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from learning_os.db.models import Attempt, Concept, Learner, Mastery, Skill

AT = datetime(2026, 6, 1, 9, 0, tzinfo=UTC)


def _fixtures(session: Session) -> tuple[Learner, Skill]:
    concept = Concept(id="hist.raj", subject="hist", chapter="raj", name="The Raj")
    skill = Skill(id="hist.raj.timeline", concept_id=concept.id, name="timeline")
    learner = Learner(id="L-tx", created_at=AT, cohort="y11", stream=None)
    session.add_all([concept, skill, learner])
    session.flush()
    return learner, skill


def test_a_failed_second_write_leaves_the_first_one_absent(session: Session) -> None:
    """The whole invariant, in one test.

    The attempt is legal. The mastery row is not -- `next_review_at` before
    `last_review_at` violates the CHECK. Both are written inside one nested
    transaction, so the legal one must vanish with the illegal one.
    """
    learner, skill = _fixtures(session)

    with pytest.raises(IntegrityError), session.begin_nested():
        session.add(
            Attempt(
                id="A-partial",
                learner_id=learner.id,
                skill_id=skill.id,
                at=AT,
                correct=True,
                difficulty=0.5,
                idempotency_key="partial",
            )
        )
        session.add(
            Mastery(
                learner_id=learner.id,
                skill_id=skill.id,
                level=0.5,
                last_review_at=AT,
                # Illegal: refused by ck_mastery_review_order.
                next_review_at=datetime(2020, 1, 1, tzinfo=UTC),
            )
        )

    assert session.query(Attempt).filter_by(id="A-partial").count() == 0, (
        "the attempt survived a transaction that failed; the learner's log now "
        "records an answer their mastery has no record of"
    )
    assert session.query(Mastery).count() == 0


def test_both_writes_land_when_both_are_legal(session: Session) -> None:
    """The PAIR. Without it, a transaction that rolled back unconditionally --
    or a database that wrote nothing at all -- passes the test above."""
    learner, skill = _fixtures(session)

    with session.begin_nested():
        session.add(
            Attempt(
                id="A-ok",
                learner_id=learner.id,
                skill_id=skill.id,
                at=AT,
                correct=True,
                difficulty=0.5,
                idempotency_key="ok",
            )
        )
        session.add(
            Mastery(
                learner_id=learner.id,
                skill_id=skill.id,
                level=1.0,
                last_review_at=AT,
                next_review_at=AT,
            )
        )

    assert session.query(Attempt).filter_by(id="A-ok").count() == 1
    assert session.query(Mastery).count() == 1


def test_a_rolled_back_write_does_not_consume_the_idempotency_key(
    session: Session,
) -> None:
    """A rollback must release the key, or a retry can never succeed.

    This is the case that turns a transient failure into a permanent one: the
    first attempt fails partway, the client retries with the same key, and a
    key held by the rolled-back row refuses the retry forever. The learner's
    answer is lost and every retry looks like a successful replay.
    """
    learner, skill = _fixtures(session)

    with pytest.raises(IntegrityError), session.begin_nested():
        session.add(
            Attempt(
                id="A-first",
                learner_id=learner.id,
                skill_id=skill.id,
                at=AT,
                correct=True,
                difficulty=0.5,
                idempotency_key="retryable",
            )
        )
        session.add(
            Mastery(
                learner_id=learner.id,
                skill_id=skill.id,
                level=2.0,  # illegal: outside [0, 1]
                last_review_at=AT,
                next_review_at=AT,
            )
        )

    # The retry, same key, and it must be accepted.
    with session.begin_nested():
        session.add(
            Attempt(
                id="A-retry",
                learner_id=learner.id,
                skill_id=skill.id,
                at=AT,
                correct=True,
                difficulty=0.5,
                idempotency_key="retryable",
            )
        )

    assert session.query(Attempt).filter_by(idempotency_key="retryable").count() == 1


def test_a_failure_inside_a_nested_transaction_does_not_destroy_earlier_work(
    session: Session,
) -> None:
    """Rollback is scoped, not total.

    A write that succeeded before the failing block must survive it. Without
    this, "roll everything back on any error" passes every test above while
    discarding work that was already committed to the caller.
    """
    learner, skill = _fixtures(session)

    with session.begin_nested():
        session.add(
            Attempt(
                id="A-earlier",
                learner_id=learner.id,
                skill_id=skill.id,
                at=AT,
                correct=True,
                difficulty=0.5,
                idempotency_key="earlier",
            )
        )

    with pytest.raises(IntegrityError), session.begin_nested():
        session.add(
            Attempt(
                id="A-doomed",
                learner_id=learner.id,
                skill_id=skill.id,
                at=AT,
                correct=True,
                difficulty=0.5,
                idempotency_key="earlier",  # duplicate, refused
            )
        )

    assert session.query(Attempt).filter_by(id="A-earlier").count() == 1
    assert session.query(Attempt).filter_by(id="A-doomed").count() == 0
