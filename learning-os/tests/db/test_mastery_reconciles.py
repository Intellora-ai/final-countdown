"""I14 — a stored mastery level must equal the level its attempt log implies.

WHAT DRIFT ACTUALLY COSTS
-------------------------
Mastery decides what gets taught next. A stored level that no longer matches the
evidence is a tutor confidently teaching the wrong thing, and nothing in the
product can notice: the level looks like a normal number, the attempt log looks
like a normal log, and only comparing them reveals that one of them is lying.

That comparison is cheap and nobody ever runs it, which is why it is a test.

THE INVARIANT, STATED PRECISELY
-------------------------------
Not "every attempted skill has a mastery row". The seeded dataset deliberately
contains attempts on skills with no mastery row -- a real state, and the one
that breaks a recompute written as a join over `mastery`.

So the invariant is two separate claims, and they are asserted separately:

  1. For every mastery row that EXISTS, its level equals the recomputed level.
  2. Skills with attempts and no mastery row are an ENUMERABLE set, not a
     silent zero. A recompute that reported 0.0 for them would be inventing
     evidence of failure for a learner who was never assessed.

Collapsing those two into one assertion is how the second becomes invisible.
"""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy.orm import Session

from learning_os.db import seed as seeding
from learning_os.db.models import Attempt, Mastery

SEED = 20260825

#: The seed stores levels rounded to four places, so the comparison is to four
#: places. An exact float equality here would fail on the rounding rather than
#: on drift, and the fix somebody would reach for is loosening the tolerance
#: until it passes -- which eventually hides real drift.
PLACES = 4


def _recomputed(session: Session) -> dict[tuple[str, str], float]:
    """Mastery as the attempt log implies it, per (learner, skill).

    Deliberately recomputed HERE rather than by calling the seed's own helper.
    A test that reuses the implementation it is checking proves the
    implementation agrees with itself.
    """
    outcomes: dict[tuple[str, str], list[bool]] = defaultdict(list)
    for attempt in session.query(Attempt).all():
        outcomes[(attempt.learner_id, attempt.skill_id)].append(attempt.correct)
    return {
        key: sum(1 for correct in values if correct) / len(values)
        for key, values in outcomes.items()
    }


def test_every_stored_mastery_level_matches_its_attempt_log(session: Session) -> None:
    """Claim 1. This is I14."""
    seeding.seed(session, seed=SEED)

    implied = _recomputed(session)
    stored = session.query(Mastery).all()
    assert stored, "no mastery rows to reconcile"

    drifted: list[str] = []
    for row in stored:
        key = (row.learner_id, row.skill_id)
        if key not in implied:
            drifted.append(f"{key}: stored {row.level}, but the log has no attempts")
            continue
        if round(row.level, PLACES) != round(implied[key], PLACES):
            drifted.append(
                f"{key}: stored {row.level}, log implies {implied[key]:.4f}"
            )

    assert drifted == [], "mastery has drifted from the attempt log:\n" + "\n".join(
        drifted
    )


def test_the_reconciliation_covers_more_than_a_handful_of_rows(
    session: Session,
) -> None:
    """Non-vacuity. A reconciliation over two rows proves almost nothing.

    Without this, a seed that produced one mastery row would satisfy the test
    above perfectly and the suite would report the invariant as enforced across
    "the whole seeded dataset".
    """
    seeding.seed(session, seed=SEED)
    assert session.query(Mastery).count() >= 10


def test_a_skill_with_attempts_and_no_mastery_row_is_enumerable(
    session: Session,
) -> None:
    """Claim 2, and the reason claim 1 is scoped to rows that exist.

    These are real: a learner attempted something the model never opened a
    belief for. Reporting them as 0.0 would invent evidence of failure for
    somebody who was never assessed, and reporting nothing at all would hide a
    gap in the model.
    """
    seeding.seed(session, seed=SEED)

    attempted = {
        (row.learner_id, row.skill_id) for row in session.query(Attempt).all()
    }
    scored = {(row.learner_id, row.skill_id) for row in session.query(Mastery).all()}

    unscored = attempted - scored
    assert unscored, (
        "every attempted skill has a mastery row, so the ugly case the seed is "
        "required to contain is missing"
    )


def test_drift_is_detected_when_a_stored_level_is_altered(session: Session) -> None:
    """The PAIR, and the only thing proving the reconciliation can fail.

    Without it, `_recomputed` returning the stored values -- or the comparison
    being a no-op -- passes every test above. The alteration is small on
    purpose: 0.5 is a plausible level, not an obviously corrupt one.
    """
    seeding.seed(session, seed=SEED)

    row = session.query(Mastery).order_by(Mastery.learner_id, Mastery.skill_id).first()
    assert row is not None
    implied = _recomputed(session)[(row.learner_id, row.skill_id)]
    # Move it somewhere legal but wrong. A value outside [0, 1] would be caught
    # by the range CHECK instead, which is a different test.
    row.level = 0.5 if round(implied, PLACES) != 0.5 else 0.25
    session.flush()

    stored = {
        (r.learner_id, r.skill_id): r.level for r in session.query(Mastery).all()
    }
    recomputed = _recomputed(session)
    mismatches = [
        key
        for key, level in stored.items()
        if key in recomputed and round(level, PLACES) != round(recomputed[key], PLACES)
    ]
    assert mismatches, "altering a stored level was not detected as drift"
