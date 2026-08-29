"""Where learner state lives, behind a port.

WHY A PORT AND NOT DIRECT SQL IN THE ROUTES
-------------------------------------------
Phase 4's tests must pass with no database running; Phase 5 replaces the store
with PostgreSQL. Without a seam those are contradictory requirements, and the
usual resolution -- write the routes against SQL and mock the driver in tests --
is the one this repository already rejects: a suite over mocks tests the mocks.

So the routes depend on `Learners`, an interface with two implementations. The
in-memory one below is real, not a mock: it enforces the same idempotency rule
and returns the same errors. Phase 5's adapter satisfies the same tests.

STORAGE IS NOT DECISION LOGIC
-----------------------------
The design rule for Phase 4 is that the API reimplements no decision logic. This
module holds none: mastery is folded by `learning_os.mastery.estimate.update`,
which is imported and called, never reproduced. What lives here is the record of
what happened -- which learner, which attempts, in which order.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol

from learning_os.mastery.estimate import Belief
from learning_os.models.contracts import Evidence


@dataclass(frozen=True, slots=True)
class LearnerRecord:
    learner_id: str
    created_at: datetime
    cohort: str
    stream: str | None


@dataclass(frozen=True, slots=True)
class AttemptRecord:
    attempt_id: str
    learner_id: str
    skill_id: str
    correct: bool
    recorded_at: datetime
    #: True when this record was returned for a repeat of an earlier request
    #: carrying the same idempotency key, rather than newly created.
    replayed: bool


class UnknownLearner(LookupError):
    """Raised rather than returning `None`, so a caller cannot ignore it.

    A `None` learner threaded into the mastery fold produces an empty report --
    a 200 describing a learner that does not exist, which is worse than a 404
    because the caller stops looking for the bug.
    """


class Learners(Protocol):
    """The storage port. Phase 5 implements this over PostgreSQL."""

    def create(self, *, cohort: str, stream: str | None) -> LearnerRecord: ...

    def get(self, learner_id: str) -> LearnerRecord | None: ...

    def record(
        self,
        learner_id: str,
        *,
        idempotency_key: str,
        evidence: Evidence,
        correct: bool,
    ) -> AttemptRecord:
        """Fold one observation in, exactly once per idempotency key.

        Raises `UnknownLearner` when the learner does not exist. Returns a
        record with `replayed=True` when this key has been seen before, and the
        stored state must be untouched in that case.
        """
        ...

    def beliefs(self, learner_id: str) -> Mapping[str, Belief]: ...


@dataclass
class _LearnerState:
    record: LearnerRecord
    beliefs: dict[str, Belief] = field(default_factory=dict)
    #: idempotency key -> the attempt it produced. The key is scoped per learner
    #: on purpose: two learners retrying with a client-generated key like
    #: "attempt-1" must not collide, and a global key space makes that collision
    #: look like a successful replay.
    seen: dict[str, AttemptRecord] = field(default_factory=dict)


class InMemoryLearners:
    """The Phase 4 adapter. Real behaviour, no database.

    Not thread safe, and deliberately not made so. A dictionary guarded by a
    lock would imply this is fit to serve concurrent traffic; it is fit to serve
    tests and a single-process demo, and Phase 5 replaces it with a database
    whose concurrency guarantees are the database's.
    """

    def __init__(
        self,
        *,
        now: Callable[[], datetime] | None = None,
        new_id: Callable[[], str] | None = None,
    ) -> None:
        self._now: Callable[[], datetime] = now or _utc_now
        self._new_id: Callable[[], str] = new_id or _uuid4
        self._learners: dict[str, _LearnerState] = {}

    def create(self, *, cohort: str, stream: str | None) -> LearnerRecord:
        record = LearnerRecord(
            learner_id=self._new_id(),
            created_at=self._now(),
            cohort=cohort,
            stream=stream,
        )
        self._learners[record.learner_id] = _LearnerState(record=record)
        return record

    def get(self, learner_id: str) -> LearnerRecord | None:
        state = self._learners.get(learner_id)
        return None if state is None else state.record

    def record(
        self,
        learner_id: str,
        *,
        idempotency_key: str,
        evidence: Evidence,
        correct: bool,
    ) -> AttemptRecord:
        state = self._learners.get(learner_id)
        if state is None:
            raise UnknownLearner(learner_id)

        # THE REPLAY CHECK COMES BEFORE THE FOLD, AND THAT ORDER IS THE WHOLE
        # GUARANTEE. Folding first and de-duplicating the RESPONSE afterwards
        # returns a correct-looking body over a doubled estimate, which is the
        # failure mode idempotency exists to prevent and the one a status-code
        # test cannot see.
        previous = state.seen.get(idempotency_key)
        if previous is not None:
            return AttemptRecord(
                attempt_id=previous.attempt_id,
                learner_id=previous.learner_id,
                skill_id=previous.skill_id,
                correct=previous.correct,
                recorded_at=previous.recorded_at,
                replayed=True,
            )

        prior = state.beliefs.get(evidence.skill_id)
        state.beliefs[evidence.skill_id] = _fold(prior, evidence, now=self._now)

        attempt = AttemptRecord(
            attempt_id=self._new_id(),
            learner_id=learner_id,
            skill_id=evidence.skill_id,
            correct=correct,
            recorded_at=self._now(),
            replayed=False,
        )
        state.seen[idempotency_key] = attempt
        return attempt

    def beliefs(self, learner_id: str) -> Mapping[str, Belief]:
        state = self._learners.get(learner_id)
        if state is None:
            raise UnknownLearner(learner_id)
        return dict(state.beliefs)


def _fold(
    prior: Belief | None, evidence: Evidence, *, now: Callable[[], datetime]
) -> Belief:
    """Delegate to the engine. The arithmetic is not reproduced here.

    Imported rather than reimplemented because a second implementation of the
    mastery update is a second thing to keep correct, and the two would disagree
    the first time the engine's learning rate changed.
    """
    from learning_os.mastery.estimate import update
    from learning_os.models.contracts import SkillEstimate

    if prior is None:
        prior = Belief(
            estimate=SkillEstimate(
                skill_id=evidence.skill_id,
                estimate=0.0,
                confidence=0.0,
                evidence_count=0,
                evidence_diversity=0,
            )
        )
    return update(prior, evidence, now=now)


def _utc_now() -> datetime:
    from datetime import UTC

    return datetime.now(UTC)


def _uuid4() -> str:
    return str(uuid.uuid4())
