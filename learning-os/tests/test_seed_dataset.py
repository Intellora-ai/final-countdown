"""Handing a class a practice set, on whatever machine they happen to sit at.

WHAT THIS FILE IS FOR, AND WHAT IT IS EXPLICITLY NOT
---------------------------------------------------
`tests/db/` tests the things only PostgreSQL can answer -- that the SHIPPED
schema, built by the real migration, refuses bad data. Its own conftest argues
at length that SQLite is not a substitute for that, and it is right. Nothing
here disputes it and nothing here replaces it.

This file asks a different question, and one no gated suite was asking at all:
IS THE DATASET THE SAME EVERYWHERE. That question is about the generator, not
about the server underneath it. `seed()` reads no clock, no entropy pool and no
environment; every id, every timestamp and every outcome is derived from one
integer. So "the lab machine and the laptop show the same practice set" is
decidable without a database server, and it is the property a teacher actually
depends on.

`tests/db` runs only in `.github/workflows/integration.yml`, behind a service
container. The gate that runs on every push excludes it -- which left
`learning_os.db.seed` at zero percent: 96 statements and 34 branches that no
required check executed, in the code that decides what twelve children see.

WHY A REAL DATABASE ENGINE AT ALL, RATHER THAN A FAKE SESSION
-------------------------------------------------------------
A stub session that recorded `add()` calls would prove the generator called
`add()`, which is a fact about the test. A real engine makes the CHECK
constraints run: a seed that emitted a difficulty of 1.4, or a review scheduled
before the review it follows, fails here rather than in production. That is the
seed being checked against the schema's own rules, which is the whole reason
those rules are declared in the schema.

NO SOCKET IS OPENED. `conftest.py` blocks `socket.connect` for every test in
this suite, and an in-memory SQLite database never reaches one.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import timedelta
from itertools import pairwise

import pytest
from sqlalchemy import Engine, create_engine, event, select
from sqlalchemy.engine.interfaces import DBAPIConnection
from sqlalchemy.orm import Session
from sqlalchemy.pool import ConnectionPoolEntry

from learning_os.db.models import (
    Attempt,
    Base,
    Concept,
    Learner,
    Mastery,
    Skill,
)
from learning_os.db.seed import (
    EPOCH,
    LEARNER_COUNT,
    PROFILES,
    checksum,
    seed,
    wipe,
)
from learning_os.domain.python_recursion import GRAPH

#: The number a run is asked to seed from. Any integer would do; the point of
#: every test below is that the SAME integer produces the SAME bytes, so the
#: value carries no meaning and is written once rather than repeated.
SEED = 20260901


def _fresh_engine() -> Engine:
    """One empty database, with foreign keys actually enforced.

    SQLite ignores foreign keys unless asked per connection, and a suite that
    forgot the pragma would report "the schema accepts an orphan attempt" as a
    pass. Asked for explicitly, so the omission cannot be silent.
    """
    engine = create_engine("sqlite+pysqlite:///:memory:")

    @event.listens_for(engine, "connect")
    def _enforce_foreign_keys(
        dbapi_connection: DBAPIConnection, _record: ConnectionPoolEntry
    ) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    return engine


@pytest.fixture()
def session() -> Iterator[Session]:
    """One machine, freshly installed, with nothing on it yet."""
    engine = _fresh_engine()
    with Session(engine) as opened:
        yield opened
    engine.dispose()


@pytest.fixture()
def second_machine() -> Iterator[Session]:
    """A DIFFERENT machine. Separate engine, separate storage, separate
    connection pool -- so "the same" below cannot be true merely because two
    names point at one database."""
    engine = _fresh_engine()
    with Session(engine) as opened:
        yield opened
    engine.dispose()


def _seeded(session: Session, *, using: int = SEED) -> Session:
    seed(session, seed=using)
    session.commit()
    return session


# --------------------------------------------------------------------------
# The same practice set, on every machine it is installed on
# --------------------------------------------------------------------------


def test_two_machines_seeded_from_one_number_hold_identical_data(
    session: Session, second_machine: Session
) -> None:
    """THE PROPERTY THE WHOLE FILE EXISTS FOR.

    A teacher sets up the lab machine on Monday and their own laptop on Friday.
    If the two datasets differ, every conversation about "the third question"
    is about a different question, and every test written against one of them
    fails on the other for a reason nobody can see.

    A row COUNT would pass here while every value differed, which is why the
    comparison is a digest over every column of every row.
    """
    _seeded(session)
    _seeded(second_machine)

    assert checksum(session) == checksum(second_machine)


def test_the_digest_notices_a_single_changed_answer(session: Session) -> None:
    """Proves the comparison above is not vacuous.

    If the digest were insensitive to content -- a count, a length, a hash of
    the table names -- the test above would pass against two unrelated
    datasets. One child answering one question differently has to move it.
    """
    _seeded(session)
    before = checksum(session)

    one = session.execute(select(Attempt).order_by(Attempt.id)).scalars().first()
    assert one is not None
    one.correct = not one.correct
    session.flush()

    assert checksum(session) != before


def test_two_different_numbers_give_two_different_classes(
    session: Session, second_machine: Session
) -> None:
    """A second school installing this must not be handed the first school's
    dataset. Otherwise the seed is decoration: one class wearing many names."""
    _seeded(session, using=SEED)
    _seeded(second_machine, using=SEED + 1)

    assert checksum(session) != checksum(second_machine)

    theirs = {row.id for row in session.execute(select(Learner)).scalars()}
    others = {row.id for row in second_machine.execute(select(Learner)).scalars()}
    assert theirs & others == set(), "two schools were handed colliding learner ids"


def test_nothing_in_the_dataset_was_read_off_the_clock(session: Session) -> None:
    """`datetime.now()` in a generator is determinism broken in the least
    visible way: the suite still passes, until the day one run is compared with
    another. Every instant here is measured from a fixed epoch, so the whole
    dataset lands inside a window a wall clock could not.

    The lower bound is not `EPOCH` itself: every third attempt lands five hours
    BEFORE the one before it, on purpose.
    """
    earliest = (EPOCH - timedelta(hours=6)).replace(tzinfo=None)
    latest = (EPOCH + timedelta(days=LEARNER_COUNT + 40)).replace(tzinfo=None)

    _seeded(session)

    stamps = [row.created_at for row in session.execute(select(Learner)).scalars()]
    stamps += [row.at for row in session.execute(select(Attempt)).scalars()]
    for row in session.execute(select(Mastery)).scalars():
        stamps += [row.last_review_at, row.next_review_at]

    assert stamps, "the dataset carried no timestamps at all"
    for stamp in stamps:
        assert earliest <= stamp.replace(tzinfo=None) <= latest


# --------------------------------------------------------------------------
# Reinstalling on a machine that already has a class on it
# --------------------------------------------------------------------------


def test_wiping_and_reseeding_a_used_machine_restores_the_same_class(
    session: Session,
) -> None:
    """The shared classroom machine, re-imaged between terms.

    A reseed that appended instead of replacing would double every learner and
    leave the engine estimating mastery from two copies of one history.
    """
    _seeded(session)
    original = checksum(session)

    wipe(session)
    session.commit()
    _seeded(session)

    assert checksum(session) == original
    assert session.query(Learner).count() == LEARNER_COUNT


def test_a_wipe_leaves_nothing_behind_in_any_table(session: Session) -> None:
    """Children first, or the delete violates a foreign key and the failure
    reads as a broken test rather than as a wipe written in the wrong order."""
    _seeded(session)

    wipe(session)
    session.commit()

    for model in (Attempt, Mastery, Skill, Concept, Learner):
        assert session.query(model).count() == 0, f"{model.__tablename__} survived the wipe"


def test_wiping_a_machine_nobody_has_used_yet_is_not_an_error(
    session: Session,
) -> None:
    """The first install. A setup script that calls `wipe` before `seed` must
    not fail on the one machine where there is nothing to wipe."""
    wipe(session)
    session.commit()

    _seeded(session)
    assert session.query(Learner).count() == LEARNER_COUNT


# --------------------------------------------------------------------------
# The class contains the children a tidy dataset would never contain
# --------------------------------------------------------------------------


def test_the_class_contains_a_child_who_has_never_answered_anything(
    session: Session,
) -> None:
    """The state the engine answers UNEVIDENCED for, and precisely the row a
    generator written as "for each learner, emit attempts" never produces.

    Without them, every test of "what do we do when we know nothing" runs
    against a learner we know something about.
    """
    _seeded(session)

    silent = [
        learner
        for learner in session.execute(select(Learner)).scalars()
        if session.query(Attempt).filter_by(learner_id=learner.id).count() == 0
    ]

    assert silent, "every learner had answered something; the empty case is untested"
    for learner in silent:
        assert session.query(Mastery).filter_by(learner_id=learner.id).count() == 0, (
            "a learner with no attempts was given a mastery level anyway"
        )


def test_the_class_contains_children_doing_well_and_children_who_are_not(
    session: Session,
) -> None:
    """A dataset where everybody is average tests nothing: the bottleneck
    selector makes the same choice for all of them and the policy suite passes
    against a constant."""
    _seeded(session)

    levels = [row.level for row in session.execute(select(Mastery)).scalars()]

    assert levels, "nobody in the class had a mastery level"
    assert min(levels) < 0.4, "nobody in the class was struggling"
    assert max(levels) > 0.8, "nobody in the class was doing well"


def test_a_child_whose_device_clock_is_wrong_is_in_the_data(
    session: Session,
) -> None:
    """A queued submission, or a tablet whose clock drifted, arrives with a
    timestamp EARLIER than the answer before it.

    A recompute that assumes the log is sorted quietly produces the wrong
    answer for this child and the right one for everybody else, which is the
    hardest kind of bug to see.
    """
    _seeded(session)

    per_learner: dict[str, list[Attempt]] = {}
    for row in session.execute(select(Attempt).order_by(Attempt.id)).scalars():
        per_learner.setdefault(row.learner_id, []).append(row)

    backwards = any(
        later.at < earlier.at
        for attempts in per_learner.values()
        for earlier, later in pairwise(attempts)
    )
    assert backwards, "every log was in order; out-of-order arrival is untested"


def test_a_child_who_pressed_submit_twice_is_in_the_data(session: Session) -> None:
    """The retried upload. Same learner, same skill, same instant, a DIFFERENT
    idempotency key -- which is what a genuine double-submit looks like once the
    client has generated a fresh key for the retry.

    The unique constraint does not stop it and must not: these are two real
    observations arriving, and the mastery recompute has to cope with both.
    """
    _seeded(session)

    seen: dict[tuple[str, str, object], set[str]] = {}
    for row in session.execute(select(Attempt)).scalars():
        seen.setdefault((row.learner_id, row.skill_id, row.at), set()).add(
            row.idempotency_key
        )

    doubled = [keys for keys in seen.values() if len(keys) > 1]
    assert doubled, "nobody in the class ever double-submitted"


def test_a_child_has_practised_something_the_mastery_table_never_recorded(
    session: Session,
) -> None:
    """The quietest awkward case, and the one a report gets wrong.

    A summary written as a join over `mastery` silently drops the attempts of
    any learner-and-skill pair with no row -- so the child who practised the
    hardest skill appears never to have touched it.
    """
    _seeded(session)

    attempted = {
        (row.learner_id, row.skill_id)
        for row in session.execute(select(Attempt)).scalars()
    }
    scored = {
        (row.learner_id, row.skill_id)
        for row in session.execute(select(Mastery)).scalars()
    }

    assert attempted - scored, "every attempted skill had a mastery row; the gap is untested"


def test_some_children_have_never_reached_the_end_of_the_curriculum(
    session: Session,
) -> None:
    """A prerequisite gap is a real shape: knowing a later skill and not the
    earlier one is exactly the state the bottleneck engine exists to find. A
    dataset where everyone has touched everything cannot contain it."""
    _seeded(session)

    all_skills = {row.id for row in session.execute(select(Skill)).scalars()}
    per_learner: dict[str, set[str]] = {}
    for row in session.execute(select(Attempt)).scalars():
        per_learner.setdefault(row.learner_id, set()).add(row.skill_id)

    partial = [
        learner_id for learner_id, touched in per_learner.items() if touched < all_skills
    ]
    assert partial, "every active learner had touched every skill in the curriculum"


# --------------------------------------------------------------------------
# The dataset and the engine have to be talking about the same curriculum
# --------------------------------------------------------------------------


def test_the_curriculum_in_the_database_is_the_one_the_engine_teaches(
    session: Session,
) -> None:
    """Invented ids would let the seeded database and the decision engine
    disagree about what exists, and every test that fed seeded data into the
    engine would be exercising a curriculum the engine has never seen."""
    _seeded(session)

    stored_concepts = {row.id for row in session.execute(select(Concept)).scalars()}
    stored_skills = {row.id for row in session.execute(select(Skill)).scalars()}

    assert stored_concepts == {concept.concept_id for concept in GRAPH.concepts}
    assert stored_skills == {
        sub.skill_id for concept in GRAPH.concepts for sub in concept.subskills
    }


def test_every_recorded_answer_points_at_a_skill_that_exists(
    session: Session,
) -> None:
    """An attempt on a skill nothing defines is a row the engine cannot
    interpret, and a foreign key that let it in was never enforced."""
    _seeded(session)

    known = {row.id for row in session.execute(select(Skill)).scalars()}
    for row in session.execute(select(Attempt)).scalars():
        assert row.skill_id in known


def test_a_concept_is_filed_under_its_subject_and_its_chapter(
    session: Session,
) -> None:
    """`python.recursion` is subject `python`, chapter `recursion`. A concept
    filed under its whole id would make every by-subject listing show exactly
    one subject per concept, which is a listing that answers nothing."""
    _seeded(session)

    for row in session.execute(select(Concept)).scalars():
        assert row.subject == row.id.partition(".")[0]
        assert row.chapter, "a concept was filed under a blank chapter"
        assert row.chapter in row.id


# --------------------------------------------------------------------------
# The stored level has to be the level the log implies
# --------------------------------------------------------------------------


def test_a_stored_mastery_level_equals_what_that_childs_answers_imply(
    session: Session,
) -> None:
    """THE INVARIANT THIS GENERATOR'S ORDERING WAS REWRITTEN FOR.

    A stored level that disagrees with the log is a number the engine acts on
    and nobody can reproduce -- it looks like a measurement and is a stale
    cache. Counted including the double-submitted answers, which are two real
    observations and not one.
    """
    _seeded(session)

    observed: dict[tuple[str, str], list[bool]] = {}
    for row in session.execute(select(Attempt)).scalars():
        observed.setdefault((row.learner_id, row.skill_id), []).append(bool(row.correct))

    checked = 0
    # NAMED APART FROM THE `Attempt` LOOP ABOVE, and not for tidiness. Both
    # loops bound `row`, so mypy fixed its type at the first binding and then
    # read `Mastery.level` as an attribute `Attempt` does not have -- three
    # errors on working code, because the name was reused and the types differ.
    for mastery in session.execute(select(Mastery)).scalars():
        outcomes = observed.get((mastery.learner_id, mastery.skill_id))
        assert outcomes, "a mastery level rested on no answers at all"
        implied = sum(1 for outcome in outcomes if outcome) / len(outcomes)
        assert mastery.level == pytest.approx(implied, abs=5e-5), (
            f"{mastery.learner_id} on {mastery.skill_id}: "
            f"stored {mastery.level}, log implies {implied}"
        )
        checked += 1

    assert checked > 0, "no mastery row was checked, so this proves nothing"


def test_weaker_knowledge_is_scheduled_to_come_back_sooner(
    session: Session,
) -> None:
    """Spacing that ignores how well the child knows it is not spacing. If a
    level of 0.1 and a level of 1.0 came back on the same day, the schedule
    would be a calendar rather than a decision."""
    _seeded(session)

    gaps = [
        (row.level, (row.next_review_at - row.last_review_at).total_seconds())
        for row in session.execute(select(Mastery)).scalars()
    ]
    weakest = min(gaps, key=lambda pair: pair[0])
    strongest = max(gaps, key=lambda pair: pair[0])

    assert weakest[1] < strongest[1], "a struggling child waits as long as a fluent one"


def test_nothing_the_seed_writes_is_a_value_the_schema_forbids(
    session: Session,
) -> None:
    """The seed runs against a database whose CHECK constraints are live, so a
    generator emitting a difficulty of 1.4, or a review scheduled before the
    review it follows, fails here rather than in front of a class.

    Asserted as well as executed, because a constraint that quietly stopped
    being enforced would make the execution prove nothing.
    """
    _seeded(session)

    for attempt in session.execute(select(Attempt)).scalars():
        assert 0.0 <= attempt.difficulty <= 1.0
    for mastery in session.execute(select(Mastery)).scalars():
        assert 0.0 <= mastery.level <= 1.0
        assert mastery.next_review_at >= mastery.last_review_at


def test_the_class_is_the_size_the_generator_promises(session: Session) -> None:
    """Small enough that a failing test can be read by a human, varied enough
    that every profile appears. Both halves are the point, so both are checked."""
    _seeded(session)

    assert session.query(Learner).count() == LEARNER_COUNT
    assert len(PROFILES) <= LEARNER_COUNT, "the class is too small to contain every shape"

    shapes = {
        learner.id.rsplit("-", 1)[-1]
        for learner in session.execute(select(Learner)).scalars()
    }
    assert shapes == {profile.name for profile in PROFILES}


def test_children_are_spread_across_cohorts_rather_than_all_in_one(
    session: Session,
) -> None:
    """A dataset with one cohort cannot exercise any query that groups by it,
    and a per-cohort report would look correct against it forever."""
    _seeded(session)

    learners = list(session.execute(select(Learner)).scalars())

    assert len({learner.cohort for learner in learners}) > 1
    assert None in {learner.stream for learner in learners}, (
        "no learner had an unset stream; the nullable case is untested"
    )
