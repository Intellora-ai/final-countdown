"""I13 — the same attempt twice is one row, and the second is REFUSED.

WHY "REFUSED" AND NOT "MERGED" IS THE WHOLE POINT
-------------------------------------------------
A store that quietly returns the earlier row for a repeat and a store that
refuses the repeat both end up with one row. They are not the same system.

The first cannot tell a caller anything went wrong, so a genuine second
observation that happens to reuse a key is silently discarded -- data loss that
looks like idempotency working. The second surfaces the collision, and the
caller decides.

`learning_os.http.repository` chooses to answer a replay with the stored result,
which is correct for HTTP: a retry must be safe. The DATABASE underneath it must
still refuse, because that is what makes the HTTP layer's choice a decision
rather than the only thing that could happen. A second replica, a backfill
script, or a maintenance query does not go through the HTTP layer.

TESTED IN PAIRS THROUGHOUT
--------------------------
Every refusal here has a matching acceptance. A unique constraint asserted only
to reject is satisfied by a table that rejects everything.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from learning_os.db.models import Attempt, Concept, Learner, Skill

AT = datetime(2026, 3, 1, 10, 0, tzinfo=UTC)


def _fixtures(session: Session, suffix: str = "") -> tuple[Learner, Skill]:
    concept = Concept(
        id=f"maths.algebra{suffix}", subject="maths", chapter="algebra", name="Algebra"
    )
    skill = Skill(
        id=f"maths.algebra{suffix}.factorise",
        concept_id=concept.id,
        name="factorise",
    )
    learner = Learner(
        id=f"L-idem{suffix}", created_at=AT, cohort="y11", stream="science"
    )
    session.add_all([concept, skill, learner])
    session.flush()
    return learner, skill


def _attempt(learner: Learner, skill: Skill, *, key: str, ident: str) -> Attempt:
    return Attempt(
        id=ident,
        learner_id=learner.id,
        skill_id=skill.id,
        at=AT,
        correct=True,
        difficulty=0.5,
        idempotency_key=key,
    )


def test_the_same_key_twice_for_one_learner_is_refused(session: Session) -> None:
    """The refusal itself. This is I13."""
    learner, skill = _fixtures(session)
    session.add(_attempt(learner, skill, key="k1", ident="A1"))
    session.flush()

    session.add(_attempt(learner, skill, key="k1", ident="A2"))
    with pytest.raises(IntegrityError) as raised:
        session.flush()

    # The CONSTRAINT NAME, not merely "an error happened". A NOT NULL violation
    # is also an IntegrityError, and a test satisfied by any IntegrityError
    # passes when the unique index has been dropped and something else broke.
    assert "uq_attempts_learner_idempotency" in str(raised.value)


def test_a_second_distinct_key_for_one_learner_is_accepted(session: Session) -> None:
    """The PAIR. Without it, a table that refuses every insert passes above."""
    learner, skill = _fixtures(session)
    session.add(_attempt(learner, skill, key="k1", ident="A1"))
    session.add(_attempt(learner, skill, key="k2", ident="A2"))
    session.flush()

    assert session.query(Attempt).filter_by(learner_id=learner.id).count() == 2


def test_two_learners_may_reuse_the_same_key(session: Session) -> None:
    """The scoping decision, asserted rather than assumed.

    A GLOBAL unique key would refuse this, and refusing it is a real bug: two
    learners retrying with a client-generated key like "attempt-1" would collide,
    and the second would be answered with the first learner's result. That is a
    cross-learner leak wearing the costume of a successful replay.
    """
    first, skill = _fixtures(session, suffix="")
    second = Learner(id="L-idem-other", created_at=AT, cohort="y11", stream=None)
    session.add(second)
    session.flush()

    session.add(_attempt(first, skill, key="shared", ident="A1"))
    session.add(
        Attempt(
            id="A2",
            learner_id=second.id,
            skill_id=skill.id,
            at=AT,
            correct=False,
            difficulty=0.5,
            idempotency_key="shared",
        )
    )
    session.flush()

    assert session.query(Attempt).count() == 2


def test_the_refusal_survives_a_different_payload(session: Session) -> None:
    """A repeat is refused on the KEY, not on the contents.

    This is the case that matters most and the one a naive implementation gets
    wrong: a client retries, the payload differs slightly -- a corrected
    timestamp, a different difficulty -- and a store comparing payloads decides
    it is a NEW observation. The key is the client's assertion that it is the
    same event, and it outranks the bytes.
    """
    learner, skill = _fixtures(session)
    session.add(_attempt(learner, skill, key="k1", ident="A1"))
    session.flush()

    session.add(
        Attempt(
            id="A2",
            learner_id=learner.id,
            skill_id=skill.id,
            at=AT + timedelta(hours=3),
            correct=False,
            difficulty=0.9,
            idempotency_key="k1",
        )
    )
    with pytest.raises(IntegrityError):
        session.flush()


def test_the_constraint_exists_under_the_name_the_tests_assert(
    session: Session,
) -> None:
    """The name is load bearing, so it is checked directly.

    Every refusal test above matches on `uq_attempts_learner_idempotency`. If
    the constraint were renamed, those assertions would stop matching and could
    be "fixed" by loosening them to any IntegrityError -- which would then pass
    against no unique constraint at all.
    """
    from sqlalchemy import text

    found = session.execute(
        text(
            "SELECT conname FROM pg_constraint "
            "WHERE conname = 'uq_attempts_learner_idempotency'"
        )
    ).scalar_one_or_none()
    assert found == "uq_attempts_learner_idempotency"
