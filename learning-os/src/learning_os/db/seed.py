"""Synthetic learners, generated from a fixed seed.

THE FOUR RULES, AND WHY EACH ONE IS LOAD BEARING
------------------------------------------------
1. FULLY SYNTHETIC. Every row here is generated. No real learner data, ever, in
   a file that gets committed and copied onto laptops.

2. DETERMINISTIC. Same seed, same bytes. Not "same row count" -- the ids, the
   timestamps and the ordering are all derived from the seed, so nothing reads
   the clock or the system entropy pool. A dataset that moves between runs turns
   every test that reads it into a test that fails at random, and failures that
   happen at random get ignored.

3. REALISTIC IN SHAPE. Strong learners, weak learners, one who has done nothing,
   and one with a prerequisite gap. A dataset where everybody is average tests
   nothing: the bottleneck selector would make the same choice for all of them
   and the policy suite would pass against a constant.

4. THE UGLY CASES ARE IN ON PURPOSE. Duplicate submissions, timestamps that
   arrive out of order, and an attempt on a skill the learner never started.
   Each is a real thing that happens -- a retried upload, a queued submission, a
   device with a wrong clock -- and each one breaks a plausible implementation
   that a tidy dataset would never challenge.

WHY THE CURRICULUM COMES FROM THE ENGINE
----------------------------------------
`concepts` and `skills` are loaded from `learning_os.domain.python_recursion.GRAPH`
rather than invented here. Invented ids would let the seeded database and the
decision engine disagree about what exists, and every test that fed seeded data
into the engine would be exercising a curriculum the engine has never seen.

NO CLOCK ANYWHERE
-----------------
`EPOCH` is a fixed instant. `datetime.now()` in a seed generator makes yesterday's
dataset and today's differ, which is rule 2 broken in the least visible way --
the tests still pass, until one of them compares two runs.
"""

from __future__ import annotations

import hashlib
import random
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from learning_os.db.models import (
    Attempt,
    Concept,
    Learner,
    LearningSession,
    Mastery,
    Skill,
)
from learning_os.domain.python_recursion import GRAPH

#: The instant every generated timestamp is measured from. Fixed, in UTC.
EPOCH = datetime(2026, 1, 5, 9, 0, 0, tzinfo=UTC)

#: How many learners the dataset holds. Small enough that a failing test can be
#: read by a human, varied enough that the four shapes below all appear.
LEARNER_COUNT = 12


@dataclass(frozen=True, slots=True)
class Profile:
    """What kind of learner this is. The dataset's variety, made explicit.

    A named profile rather than a random ability score, because "some learners
    strong, some weak, some inactive" is a requirement, and a uniform random
    draw satisfies it only by luck. With profiles, the dataset is guaranteed to
    contain each shape rather than likely to.
    """

    name: str
    #: Probability this learner answers correctly. Drives both the attempt log
    #: and the mastery level derived from it.
    accuracy: float
    #: How many attempts they have made. Zero is a real and important case.
    attempts: int


PROFILES: tuple[Profile, ...] = (
    Profile("strong", accuracy=0.92, attempts=14),
    Profile("solid", accuracy=0.78, attempts=11),
    Profile("developing", accuracy=0.55, attempts=9),
    Profile("struggling", accuracy=0.22, attempts=12),
    # Rule 3's awkward case. A learner with no attempts is the state the engine
    # answers UNEVIDENCED for, and it is precisely the row a generator written
    # as "for each learner, emit attempts" never produces.
    Profile("inactive", accuracy=0.0, attempts=0),
)


def wipe(session: Session) -> None:
    """Empty every table, children first.

    Order matters and is not alphabetical: a delete that violates a foreign key
    fails, and the failure would look like a broken test rather than a wipe
    written in the wrong order.
    """
    for model in (Attempt, Mastery, LearningSession, Skill, Concept, Learner):
        session.query(model).delete()
    session.flush()


def seed(session: Session, *, seed: int) -> None:
    """Fill an empty database with one deterministic dataset."""
    rng = random.Random(seed)

    skills = _load_curriculum(session)
    learners = _make_learners(session, rng, seed=seed)
    _make_attempts_and_mastery(session, rng, learners=learners, skills=skills, seed=seed)
    session.flush()


def _load_curriculum(session: Session) -> list[Skill]:
    """Concepts and skills, copied from the engine's graph."""
    created: list[Skill] = []
    for concept in GRAPH.concepts:
        subject, _, chapter = concept.concept_id.partition(".")
        session.add(
            Concept(
                id=concept.concept_id,
                subject=subject,
                chapter=chapter or concept.concept_id,
                name=concept.name,
            )
        )
        for subskill in concept.subskills:
            row = Skill(
                id=subskill.skill_id,
                concept_id=concept.concept_id,
                name=subskill.skill_id.rpartition(".")[2].replace("_", " "),
            )
            session.add(row)
            created.append(row)
    session.flush()
    return created


def _make_learners(session: Session, rng: random.Random, *, seed: int) -> list[Learner]:
    learners: list[Learner] = []
    for index in range(LEARNER_COUNT):
        profile = PROFILES[index % len(PROFILES)]
        learner = Learner(
            # Derived from the seed, not uuid4. A random id makes two runs of
            # the same seed differ in every primary key, which is rule 2 broken
            # in the most obvious place.
            id=f"L{seed}-{index:03d}-{profile.name}",
            created_at=EPOCH + timedelta(days=index, hours=rng.randrange(0, 6)),
            cohort=f"y{10 + (index % 3)}",
            stream=("science", "commerce", None)[index % 3],
        )
        session.add(learner)
        learners.append(learner)
    session.flush()
    return learners


def _make_attempts_and_mastery(
    session: Session,
    rng: random.Random,
    *,
    learners: list[Learner],
    skills: list[Skill],
    seed: int,
) -> None:
    # MASTERY IS COMPUTED LAST, FROM THE FINAL ATTEMPT SET.
    #
    # It used to be computed per learner inside this loop, with `_add_ugly_rows`
    # appending duplicate submissions afterwards. That made the seeded data
    # satisfy I14 -- "a stored level equals the level its log implies" -- ONLY
    # BY LUCK: the duplicates happened to be two correct answers on a skill the
    # learner was already at 1.0 on, so the average did not move.
    #
    # Measured, before the fix: 0 drifted rows. Which is exactly what a latent
    # bug looks like from the outside. Change the duplicate to an incorrect
    # answer, or move it to any skill scored below 1.0, and the seed would have
    # started emitting data that violated the invariant Phase 6 exists to prove.
    #
    # Deriving mastery from the complete log makes the invariant hold by
    # construction rather than by coincidence.
    outcomes: dict[tuple[str, str], list[bool]] = {}

    counter = 0
    for index, learner in enumerate(learners):
        profile = PROFILES[index % len(PROFILES)]
        if profile.attempts == 0:
            continue

        # Rule 3: a prerequisite gap. Some learners never touch the tail of the
        # curriculum, so "knows the later skill, not the earlier one" is a state
        # the dataset actually contains.
        reachable = skills if index % 4 else skills[: max(1, len(skills) // 2)]

        for step in range(profile.attempts):
            skill = reachable[rng.randrange(len(reachable))]
            correct = rng.random() < profile.accuracy

            # Rule 4: timestamps out of order. Every third attempt lands BEFORE
            # the one before it, the way a queued submission or a wrong device
            # clock really arrives.
            drift = -timedelta(hours=5) if step % 3 == 2 else timedelta(0)
            at = EPOCH + timedelta(days=index, hours=step) + drift

            counter += 1
            session.add(
                Attempt(
                    id=f"A{seed}-{counter:05d}",
                    learner_id=learner.id,
                    skill_id=skill.id,
                    at=at,
                    correct=correct,
                    difficulty=round(0.2 + 0.6 * rng.random(), 3),
                    idempotency_key=f"seed-{learner.id}-{step}",
                )
            )
            outcomes.setdefault((learner.id, skill.id), []).append(correct)

    # Ugly rows FIRST, then mastery over everything. See the note above.
    _add_ugly_rows(
        session,
        learners=learners,
        skills=skills,
        seed=seed,
        counter=counter,
        outcomes=outcomes,
    )

    for index, learner in enumerate(learners):
        touched = {
            skill_id: values
            for (learner_id, skill_id), values in outcomes.items()
            if learner_id == learner.id
        }
        if touched:
            _make_mastery(session, learner=learner, touched=touched, index=index)


def _make_mastery(
    session: Session, *, learner: Learner, touched: dict[str, list[bool]], index: int
) -> None:
    for offset, (skill_id, outcomes) in enumerate(sorted(touched.items())):
        # Rule 4: an attempt on a skill with no mastery row. Every fifth
        # learner's first skill is left unstarted, so a recompute written as a
        # join over `mastery` silently drops real attempts -- which is exactly
        # what Phase 6's reconciliation test is looking for.
        if index % 5 == 0 and offset == 0:
            continue

        level = sum(1 for outcome in outcomes if outcome) / len(outcomes)
        last = EPOCH + timedelta(days=index, hours=offset)
        session.add(
            Mastery(
                learner_id=learner.id,
                skill_id=skill_id,
                level=round(level, 4),
                last_review_at=last,
                # Weak knowledge comes back sooner. Never before `last`, which
                # the CHECK constraint also refuses.
                next_review_at=last + timedelta(days=1 + int(9 * level)),
            )
        )


def _add_ugly_rows(
    session: Session,
    *,
    learners: list[Learner],
    skills: list[Skill],
    seed: int,
    counter: int,
    outcomes: dict[tuple[str, str], list[bool]],
) -> None:
    """Rule 4's remaining case: a duplicate submission.

    The same learner, the same skill, the same instant, a DIFFERENT idempotency
    key -- which is what a genuine double-submit from a retried request looks
    like once the client has generated a fresh key for the retry. The unique
    constraint does not stop this and should not: it is two real observations
    arriving, and the mastery recompute has to cope with both.
    """
    learner = learners[1]
    skill = skills[0]
    at = EPOCH + timedelta(days=1, hours=2)
    # One correct and one INCORRECT. Two correct answers on a skill already at
    # 1.0 move no average, which is how the ordering bug above stayed invisible.
    # A mixed pair moves the level for any prior state, so mastery computed
    # before these rows can no longer coincidentally agree with the log.
    for suffix, correct in (("dup-a", True), ("dup-b", False)):
        counter += 1
        session.add(
            Attempt(
                id=f"A{seed}-{counter:05d}",
                learner_id=learner.id,
                skill_id=skill.id,
                at=at,
                correct=correct,
                difficulty=0.5,
                idempotency_key=f"seed-{learner.id}-{suffix}",
            )
        )
        outcomes.setdefault((learner.id, skill.id), []).append(correct)


def checksum(session: Session) -> str:
    """A hash over every column of every row.

    A row COUNT is equal for two datasets that differ in every value they hold,
    so it cannot detect drift. This can. Ordering is explicit for the same
    reason: PostgreSQL makes no promise about the order of an unordered select,
    so an unordered digest would differ between two identical datasets and
    report drift that is not drift.
    """
    digest = hashlib.sha256()

    # A DISTINCT NAME PER LOOP, NOT `row` FIVE TIMES.
    #
    # Reusing one name binds it to the first model's type, and every later
    # attribute access is then an error against the wrong class. mypy --strict
    # reported nineteen of them. The names also make the digest readable: it is
    # obvious which table each line belongs to.
    for concept in session.execute(select(Concept).order_by(Concept.id)).scalars():
        digest.update(
            f"C|{concept.id}|{concept.subject}|{concept.chapter}|{concept.name}\n".encode()
        )

    for skill in session.execute(select(Skill).order_by(Skill.id)).scalars():
        digest.update(f"S|{skill.id}|{skill.concept_id}|{skill.name}\n".encode())

    for learner in session.execute(select(Learner).order_by(Learner.id)).scalars():
        digest.update(
            f"L|{learner.id}|{learner.created_at.isoformat()}"
            f"|{learner.cohort}|{learner.stream}\n".encode()
        )

    for attempt in session.execute(select(Attempt).order_by(Attempt.id)).scalars():
        digest.update(
            f"A|{attempt.id}|{attempt.learner_id}|{attempt.skill_id}"
            f"|{attempt.at.isoformat()}|{attempt.correct}|{attempt.difficulty}"
            f"|{attempt.idempotency_key}\n".encode()
        )

    for mastery in session.execute(
        select(Mastery).order_by(Mastery.learner_id, Mastery.skill_id)
    ).scalars():
        digest.update(
            f"M|{mastery.learner_id}|{mastery.skill_id}|{mastery.level}"
            f"|{mastery.last_review_at.isoformat()}"
            f"|{mastery.next_review_at.isoformat()}\n".encode()
        )

    return digest.hexdigest()
