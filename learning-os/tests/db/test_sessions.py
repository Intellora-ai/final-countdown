"""P6-T5 — a closed session refuses new attempts.

WHY THIS CANNOT BE A CHECK CONSTRAINT
-------------------------------------
A `CHECK` sees only the row being written. This rule depends on another table:
whether the referenced session has a `closed_at`. PostgreSQL will accept a
subquery inside a CHECK in some forms and then not re-evaluate it when the OTHER
table changes, which is worse than no constraint -- it looks enforced and is not.

So it is a trigger. A trigger runs on every insert and update of `attempts`, sees
both rows, and cannot be gone around by a maintenance query the way application
code can.

WHY THE RULE MATTERS
--------------------
A session is a sitting. Once it is closed, the report of that sitting has been
computed -- how long, how many, what was learned. An attempt arriving afterwards
changes the answer to a question somebody has already been told the answer to.
Silently accepting it means two readers of the same session see different totals
depending on when they looked.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from learning_os.db.models import Attempt, Concept, Learner, LearningSession, Skill

OPENED = datetime(2026, 4, 1, 9, 0, tzinfo=UTC)


def _fixtures(session: Session) -> tuple[Learner, Skill]:
    concept = Concept(id="bio.cell", subject="bio", chapter="cell", name="The cell")
    skill = Skill(id="bio.cell.membrane", concept_id=concept.id, name="membrane")
    learner = Learner(id="L-sess", created_at=OPENED, cohort="y11", stream="science")
    session.add_all([concept, skill, learner])
    session.flush()
    return learner, skill


def _sitting(
    learner: Learner, skill: Skill, *, ident: str, closed: bool
) -> LearningSession:
    return LearningSession(
        id=ident,
        learner_id=learner.id,
        opened_at=OPENED,
        closed_at=OPENED + timedelta(hours=1) if closed else None,
        objective="practise membranes",
        skill_id=skill.id,
    )


def _attempt(
    learner: Learner, skill: Skill, *, ident: str, session_id: str | None
) -> Attempt:
    return Attempt(
        id=ident,
        learner_id=learner.id,
        skill_id=skill.id,
        at=OPENED + timedelta(minutes=30),
        correct=True,
        difficulty=0.5,
        idempotency_key=f"key-{ident}",
        session_id=session_id,
    )


def test_an_attempt_in_a_closed_session_is_refused(session: Session) -> None:
    """The rule itself. This is P6-T5."""
    learner, skill = _fixtures(session)
    session.add(_sitting(learner, skill, ident="S-closed", closed=True))
    session.flush()

    session.add(_attempt(learner, skill, ident="A-late", session_id="S-closed"))
    with pytest.raises(DBAPIError) as raised:
        session.flush()

    # The trigger's own message, not merely "an error happened". A foreign-key
    # violation is also a DBAPIError, and a test satisfied by any DBAPIError
    # passes when the trigger has been dropped and something else broke.
    assert "closed session" in str(raised.value).lower()


def test_an_attempt_in_an_open_session_is_accepted(session: Session) -> None:
    """The PAIR. Without it, a trigger that refuses EVERY attempt passes above."""
    learner, skill = _fixtures(session)
    session.add(_sitting(learner, skill, ident="S-open", closed=False))
    session.flush()

    session.add(_attempt(learner, skill, ident="A-live", session_id="S-open"))
    session.flush()

    assert session.query(Attempt).filter_by(id="A-live").one().session_id == "S-open"


def test_an_attempt_with_no_session_is_accepted(session: Session) -> None:
    """`session_id` is nullable, and that is a decision worth pinning.

    An attempt can arrive outside any sitting -- an API caller recording a
    result, a backfill, a practice widget. A trigger that refused a NULL session
    would force every such caller to invent one, and an invented session looks
    like a real sitting in every report that counts them.
    """
    learner, skill = _fixtures(session)
    session.add(_attempt(learner, skill, ident="A-loose", session_id=None))
    session.flush()

    assert session.query(Attempt).filter_by(id="A-loose").one().session_id is None


def test_closing_a_session_stops_attempts_that_were_previously_allowed(
    session: Session,
) -> None:
    """The rule is about the session's state NOW, not at insert time.

    This is the case a trigger written as "was it open when the session row was
    created" gets wrong. The same attempt shape is accepted before the close and
    refused after it, which is the whole behaviour.
    """
    learner, skill = _fixtures(session)
    session.add(_sitting(learner, skill, ident="S-both", closed=False))
    session.flush()

    session.add(_attempt(learner, skill, ident="A-before", session_id="S-both"))
    session.flush()

    sitting = session.query(LearningSession).filter_by(id="S-both").one()
    sitting.closed_at = OPENED + timedelta(hours=2)
    session.flush()

    session.add(_attempt(learner, skill, ident="A-after", session_id="S-both"))
    with pytest.raises(DBAPIError):
        session.flush()


def test_moving_an_attempt_into_a_closed_session_is_refused(session: Session) -> None:
    """UPDATE, not just INSERT.

    A trigger declared `BEFORE INSERT` only is trivially defeated: write the row
    against an open session, then update it to point at the closed one. Same
    end state, no refusal.
    """
    learner, skill = _fixtures(session)
    session.add(_sitting(learner, skill, ident="S-open2", closed=False))
    session.add(_sitting(learner, skill, ident="S-shut", closed=True))
    session.flush()

    session.add(_attempt(learner, skill, ident="A-move", session_id="S-open2"))
    session.flush()

    moved = session.query(Attempt).filter_by(id="A-move").one()
    moved.session_id = "S-shut"
    with pytest.raises(DBAPIError) as raised:
        session.flush()
    assert "closed session" in str(raised.value).lower()


def test_a_session_cannot_close_before_it_opened(session: Session) -> None:
    """The CHECK that CAN be expressed on one row, so it is one."""
    from sqlalchemy.exc import IntegrityError

    learner, skill = _fixtures(session)
    session.add(
        LearningSession(
            id="S-backwards",
            learner_id=learner.id,
            opened_at=OPENED,
            closed_at=OPENED - timedelta(seconds=1),
            objective="impossible",
            skill_id=skill.id,
        )
    )
    with pytest.raises(IntegrityError) as raised:
        session.flush()
    assert "ck_sessions_close_after_open" in str(raised.value)


def test_a_session_closing_at_the_instant_it_opened_is_accepted(
    session: Session,
) -> None:
    """The boundary. A zero-length sitting is real -- opened and abandoned."""
    learner, skill = _fixtures(session)
    session.add(
        LearningSession(
            id="S-instant",
            learner_id=learner.id,
            opened_at=OPENED,
            closed_at=OPENED,
            objective="opened and abandoned",
            skill_id=skill.id,
        )
    )
    session.flush()
    assert session.query(LearningSession).filter_by(id="S-instant").count() == 1
