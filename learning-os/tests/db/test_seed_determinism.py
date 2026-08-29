"""P5-T7: two seed runs must produce byte-identical data.

WHY THIS IS THE FIRST DATABASE TEST WRITTEN
-------------------------------------------
Every later test in Phase 6 reads the seeded dataset and asserts something about
it. If the seed moves between runs, all of those become tests that fail at
random, and a suite that fails at random gets its failures ignored -- which is
strictly worse than not having it.

So determinism is not a nicety here, it is the precondition for everything else,
and it is asserted before anything is asserted about the contents.

WHAT "DETERMINISTIC" HAS TO MEAN
--------------------------------
Not "the same number of rows". Not "roughly the same shape". The same BYTES:
same ids, same timestamps, same ordering of everything that carries an order. A
checksum over every column of every table is the only assertion that fails when
one field of one row drifts, and a per-table row count is the assertion that
passes while it does.
"""

from __future__ import annotations

from itertools import pairwise

from sqlalchemy.orm import Session

from learning_os.db import seed as seeding
from learning_os.db.models import Attempt, Concept, Learner, Mastery, Skill

#: The seed the committed dataset is generated from. Fixed, and named here so a
#: test that wants a DIFFERENT dataset has to say so rather than drift silently.
SEED = 20260825


def test_two_runs_of_the_same_seed_are_byte_identical(session: Session) -> None:
    """The whole contract, in one assertion.

    A checksum rather than a row count. `count(*)` is equal for two datasets
    that differ in every value they contain, which is exactly the failure this
    test exists to catch.
    """
    seeding.seed(session, seed=SEED)
    first = seeding.checksum(session)

    seeding.wipe(session)
    seeding.seed(session, seed=SEED)
    second = seeding.checksum(session)

    assert first == second


def test_a_different_seed_produces_a_different_dataset(session: Session) -> None:
    """The pairing test, and it is not optional.

    Without it, a `seed()` that ignores its argument entirely -- or one that
    inserts nothing at all -- satisfies the determinism test perfectly. Two
    empty datasets are also byte-identical.
    """
    seeding.seed(session, seed=SEED)
    first = seeding.checksum(session)

    seeding.wipe(session)
    seeding.seed(session, seed=SEED + 1)
    second = seeding.checksum(session)

    assert first != second


def test_the_seeded_dataset_is_not_empty(session: Session) -> None:
    """Non-vacuity, asserted rather than assumed.

    A suite that seeded nothing and a suite that seeded correctly both report
    "2 passed" on the two tests above. This is the one that tells them apart.
    """
    seeding.seed(session, seed=SEED)

    assert session.query(Learner).count() > 0
    assert session.query(Concept).count() > 0
    assert session.query(Skill).count() > 0
    assert session.query(Attempt).count() > 0
    assert session.query(Mastery).count() > 0


def test_the_dataset_contains_learners_of_genuinely_different_ability(
    session: Session,
) -> None:
    """Rule 3 of the seed contract: realistic in shape.

    "Some learners strong, some weak, some inactive, some with gaps." A dataset
    where everybody is average tests nothing -- the bottleneck selector would
    make the same choice for every learner and the policy tests would all pass
    against a constant.
    """
    seeding.seed(session, seed=SEED)

    levels = [row.level for row in session.query(Mastery).all()]
    assert levels, "no mastery rows at all"
    assert min(levels) < 0.3, "no genuinely weak learner in the dataset"
    assert max(levels) > 0.7, "no genuinely strong learner in the dataset"


def test_the_dataset_contains_an_inactive_learner(session: Session) -> None:
    """Also rule 3. An inactive learner is the case that breaks "what next?"

    A learner with no attempts at all is the state the engine answers
    UNEVIDENCED for, and it is the one a seed generator that loops over learners
    emitting attempts will never produce.
    """
    seeding.seed(session, seed=SEED)

    with_attempts = {row.learner_id for row in session.query(Attempt).all()}
    everyone = {row.id for row in session.query(Learner).all()}
    assert everyone - with_attempts, "every learner has attempts; none is inactive"


def test_the_dataset_contains_out_of_order_timestamps(session: Session) -> None:
    """Rule 4: the ugly cases are included ON PURPOSE.

    Real attempt logs arrive out of order -- a queued submission, a retried
    upload, a device with a wrong clock. Code that assumes monotonic arrival
    works perfectly until it does not, and a tidy dataset never finds out.
    """
    seeding.seed(session, seed=SEED)

    rows = session.query(Attempt).order_by(Attempt.id).all()
    times = [row.at for row in rows]
    assert any(
        later < earlier for earlier, later in pairwise(times)
    ), "every attempt arrives in timestamp order; the ugly case is missing"


def test_the_dataset_contains_an_attempt_on_an_unstarted_skill(
    session: Session,
) -> None:
    """Rule 4 again: "an attempt on a concept the learner never started".

    This is the row that breaks a mastery recompute written as a left join over
    started skills, and it is the reason Phase 6's reconciliation test is worth
    running at all.
    """
    seeding.seed(session, seed=SEED)

    started = {
        (row.learner_id, row.skill_id) for row in session.query(Mastery).all()
    }
    attempted = {
        (row.learner_id, row.skill_id) for row in session.query(Attempt).all()
    }
    assert attempted - started, "every attempted skill has a mastery row"


def test_wipe_actually_empties_every_table(session: Session) -> None:
    """`wipe` is used by the determinism test, so it is load bearing.

    A `wipe` that missed one table would leave the second seed run inserting
    into a partially-populated database, and the determinism test would fail for
    a reason that has nothing to do with the generator.
    """
    seeding.seed(session, seed=SEED)
    seeding.wipe(session)

    for model in (Attempt, Mastery, Skill, Concept, Learner):
        assert session.query(model).count() == 0, f"{model.__name__} survived wipe"
