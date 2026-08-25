"""The database schema, as typed SQLAlchemy models.

WHY THE DATABASE HOLDS THE RULES AND NOT ONLY PYTHON
----------------------------------------------------
A rule enforced in Python is a rule the next code path can break: a migration
script, a maintenance query, a second service, a fixture loader. A rule enforced
by a constraint cannot be broken by any of them. So the invariants Phase 6 tests
are declared here as constraints rather than checked in application code.

TWO DEVIATIONS FROM THE PLAN'S TABLE LIST, BOTH DELIBERATE
-----------------------------------------------------------
The plan lists `attempts(learner_id, concept_id, ...)` and
`mastery(learner_id, concept_id, ...)`.

1. THEY KEY ON `skill_id`, NOT `concept_id`. The engine estimates mastery per
   SUBSKILL -- `SkillEstimate.skill_id` is `python.recursion.identify_base_case`,
   while the concept is `python.recursion`. Storing concept-level rows would
   make Phase 6's reconciliation test unable to compare anything to the engine:
   there would be no stored value at the granularity the engine produces. A
   `skills` table is added for the same reason, so the foreign key points at
   something real.

2. `idempotency_key` IS UNIQUE PER LEARNER, NOT GLOBALLY. The plan says
   UNIQUE. Globally unique means two learners retrying with a client-generated
   key like "attempt-1" collide, and the second one is silently answered with
   the first learner's result -- a cross-learner data leak wearing the costume
   of a successful replay. `learning_os.http.repository` already scopes the key
   per learner and says so; this matches it.

EVERY TIMESTAMP IS `TIMESTAMPTZ`
--------------------------------
Non-negotiable, and the reason is review scheduling. A naive timestamp is a
number with no meaning until somebody guesses a zone, and the guess is made
separately by every reader. `next_review_at` computed in one zone and compared
in another is how a learner gets shown a card a day early or a day late,
silently, forever.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

#: `timezone=True` is what makes PostgreSQL use `TIMESTAMPTZ` rather than
#: `TIMESTAMP`. Declared once and reused so a new column cannot quietly get the
#: naive variant by being written slightly differently.
TimestampTz = DateTime(timezone=True)


class Base(DeclarativeBase):
    pass


class Learner(Base):
    __tablename__ = "learners"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(TimestampTz, nullable=False)
    #: `cohort`, not `class`. The plan calls this column `class`, which is a
    #: Python keyword and a reserved word in SQL -- every reference would need
    #: quoting or renaming, and the attribute could not be spelled at all. The
    #: HTTP surface shipped in Phase 4 already calls it `cohort`.
    cohort: Mapped[str] = mapped_column(String(64), nullable=False)
    stream: Mapped[str | None] = mapped_column(String(64), nullable=True)

    attempts: Mapped[list[Attempt]] = relationship(back_populates="learner")


class Concept(Base):
    __tablename__ = "concepts"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    subject: Mapped[str] = mapped_column(String(64), nullable=False)
    chapter: Mapped[str] = mapped_column(String(120), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)

    skills: Mapped[list[Skill]] = relationship(back_populates="concept")


class Skill(Base):
    """A subskill of a concept. The granularity the engine actually estimates.

    Not in the plan's table list. Added because `attempts.skill_id` and
    `mastery.skill_id` need something to point at, and a foreign key to a table
    that does not exist is a constraint that cannot be declared.
    """

    __tablename__ = "skills"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    concept_id: Mapped[str] = mapped_column(
        ForeignKey("concepts.id", ondelete="RESTRICT"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)

    concept: Mapped[Concept] = relationship(back_populates="skills")


class Attempt(Base):
    __tablename__ = "attempts"
    __table_args__ = (
        # THE IDEMPOTENCY GUARANTEE, ENFORCED BY THE DATABASE.
        #
        # In `learning_os.http.repository` this is a dictionary lookup, which
        # holds for one process and stops holding the moment a second replica
        # exists. A unique index holds across every process, every replica, and
        # every future code path that inserts a row without asking.
        UniqueConstraint(
            "learner_id", "idempotency_key", name="uq_attempts_learner_idempotency"
        ),
        CheckConstraint(
            "difficulty >= 0.0 AND difficulty <= 1.0",
            name="ck_attempts_difficulty_range",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    learner_id: Mapped[str] = mapped_column(
        ForeignKey("learners.id", ondelete="CASCADE"), nullable=False
    )
    skill_id: Mapped[str] = mapped_column(
        ForeignKey("skills.id", ondelete="RESTRICT"), nullable=False
    )
    at: Mapped[datetime] = mapped_column(TimestampTz, nullable=False)
    correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    difficulty: Mapped[float] = mapped_column(Float, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)

    learner: Mapped[Learner] = relationship(back_populates="attempts")


class Mastery(Base):
    __tablename__ = "mastery"
    __table_args__ = (
        # `next_review_at` BEFORE `last_review_at` IS A CONTRADICTION, NOT DATA.
        #
        # It means "review this before you last reviewed it", which no scheduler
        # can act on. Left to application code this holds until the first
        # backfill script; as a constraint it cannot be written at all.
        CheckConstraint(
            "next_review_at >= last_review_at", name="ck_mastery_review_order"
        ),
        CheckConstraint("level >= 0.0 AND level <= 1.0", name="ck_mastery_level_range"),
    )

    learner_id: Mapped[str] = mapped_column(
        ForeignKey("learners.id", ondelete="CASCADE"), primary_key=True
    )
    skill_id: Mapped[str] = mapped_column(
        ForeignKey("skills.id", ondelete="RESTRICT"), primary_key=True
    )
    level: Mapped[float] = mapped_column(Float, nullable=False)
    last_review_at: Mapped[datetime] = mapped_column(TimestampTz, nullable=False)
    next_review_at: Mapped[datetime] = mapped_column(TimestampTz, nullable=False)


class LearningSession(Base):
    """A sitting. Named `LearningSession` because `Session` is SQLAlchemy's.

    The table is still `sessions`, as the plan names it. The class is renamed
    because `from sqlalchemy.orm import Session` is in nearly every file that
    touches this module, and two different `Session` types in one namespace is a
    bug waiting for a tired reader.
    """

    __tablename__ = "sessions"
    __table_args__ = (
        CheckConstraint(
            "closed_at IS NULL OR closed_at >= opened_at",
            name="ck_sessions_close_after_open",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    learner_id: Mapped[str] = mapped_column(
        ForeignKey("learners.id", ondelete="CASCADE"), nullable=False
    )
    opened_at: Mapped[datetime] = mapped_column(TimestampTz, nullable=False)
    #: NULL means open. A sentinel far-future timestamp would make "is this
    #: session open" a comparison against a magic number that every reader has
    #: to know.
    closed_at: Mapped[datetime | None] = mapped_column(TimestampTz, nullable=True)
    objective: Mapped[str] = mapped_column(String(400), nullable=False)
    skill_id: Mapped[str | None] = mapped_column(
        ForeignKey("skills.id", ondelete="RESTRICT"), nullable=True
    )
