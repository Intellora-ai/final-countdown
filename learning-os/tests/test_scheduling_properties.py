"""P9-T5 — review scheduling, over generated dates, orderings and time zones.

WHY SCHEDULING IS WHERE PROPERTY TESTS PAY
------------------------------------------
Example tests for a scheduler check the dates somebody thought of, and the dates
that break a scheduler are the ones nobody thought of: the instant a delay
elapses exactly, a learner in a zone thirteen hours ahead, a clock that went
backwards, a review recorded during a daylight-saving transition.

Each of those is one line of arithmetic away from a card arriving a day early or
a day late, forever, for one group of learners. Nothing in the product notices,
because every individual value looks reasonable.

WHAT IS ASSERTED, AND WHY EACH IS A PROPERTY AND NOT AN EXAMPLE
---------------------------------------------------------------
Every property below holds for ALL inputs of its kind, which is what makes it
worth generating rather than enumerating:

  - due-ness is monotonic in time: once due, always due
  - due-ness depends on the INSTANT, not on the zone it is written in
  - nothing is due before the shortest delay has elapsed
  - the answer never changes when both sides move by the same amount

The last one is the one that catches a scheduler comparing wall-clock fields
instead of instants, and it cannot be written as an example at all.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone

from hypothesis import assume, given
from hypothesis import strategies as st

from learning_os.mastery.estimate import RETENTION_SCHEDULE, is_due_for_retrieval
from learning_os.models.contracts import SkillEstimate

#: A wide but sane range of instants. Generated in UTC and re-expressed in other
#: zones by the tests that care, so a zone bug cannot hide behind a naive value.
instants = st.datetimes(
    min_value=datetime(2020, 1, 1),
    max_value=datetime(2040, 1, 1),
).map(lambda value: value.replace(tzinfo=UTC))

#: Offsets across the real range, including the half-hour and three-quarter-hour
#: ones that whole-hour arithmetic gets wrong: India is +05:30 and Nepal +05:45.
offsets = st.sampled_from(
    [
        timezone(timedelta(hours=0)),
        timezone(timedelta(hours=5, minutes=30)),
        timezone(timedelta(hours=5, minutes=45)),
        timezone(timedelta(hours=-8)),
        timezone(timedelta(hours=13)),
        timezone(timedelta(hours=-11)),
    ]
)

#: Non-negative gaps. `days` rather than seconds so the generator spends its
#: budget on the scale the schedule actually works at.
gaps = st.timedeltas(min_value=timedelta(0), max_value=timedelta(days=400))


def _estimate(last_updated: datetime) -> SkillEstimate:
    """A valid estimate. `evidence_ids` is REQUIRED and was missing at first.

    `SkillEstimate` refuses `evidence_count=3` with no `evidence_ids`:

        Value error, ...: evidence_count=3 but no evidence_ids

    That is the engine's invariant 3 -- every state update references the
    evidence that caused it -- and it was right to refuse. An estimate that has
    moved without naming what moved it is unexplainable by construction, which
    is the property the whole model exists to prevent. The helper was wrong, not
    the model.
    """
    return SkillEstimate(
        skill_id="python.recursion.identify_base_case",
        estimate=0.5,
        confidence=0.5,
        evidence_count=3,
        evidence_diversity=2,
        evidence_ids=("ev-1", "ev-2", "ev-3"),
        last_updated=last_updated,
    )


@given(last_updated=instants, gap=gaps)
def test_once_due_always_due(last_updated: datetime, gap: timedelta) -> None:
    """Due-ness is monotonic in time.

    A skill that needed reviewing an hour ago still needs reviewing now. A
    scheduler that used a WINDOW rather than a threshold -- "due between 1 and 2
    days" -- silently stops surfacing anything a learner left alone for a week,
    and the learner never sees it again.
    """
    estimate = _estimate(last_updated)
    now = last_updated + gap
    assume(is_due_for_retrieval(estimate, now=now))

    later = now + timedelta(days=1)
    assert is_due_for_retrieval(estimate, now=later)


@given(last_updated=instants, gap=gaps, zone=offsets)
def test_due_ness_depends_on_the_instant_not_the_zone(
    last_updated: datetime, gap: timedelta, zone: timezone
) -> None:
    """The same moment, written in two zones, must give the same answer.

    This is the property that catches a comparison done on wall-clock fields
    rather than on instants. It cannot be written as an example, because any
    single pair of values might agree by coincidence.
    """
    estimate = _estimate(last_updated)
    now_utc = last_updated + gap

    assert is_due_for_retrieval(estimate, now=now_utc) == is_due_for_retrieval(
        estimate, now=now_utc.astimezone(zone)
    )


@given(last_updated=instants, zone=offsets)
def test_the_stored_instant_may_be_written_in_any_zone(
    last_updated: datetime, zone: timezone
) -> None:
    """The other side of the same property: the STORED value's zone is irrelevant.

    A learner whose last review was recorded by a device in Kathmandu and read
    by a server in UTC must get the same schedule as one recorded in UTC.
    """
    in_utc = _estimate(last_updated)
    in_zone = _estimate(last_updated.astimezone(zone))
    now = last_updated + timedelta(days=90)

    assert is_due_for_retrieval(in_utc, now=now) == is_due_for_retrieval(
        in_zone, now=now
    )


@given(last_updated=instants, gap=gaps, shift=gaps)
def test_shifting_both_sides_equally_changes_nothing(
    last_updated: datetime, gap: timedelta, shift: timedelta
) -> None:
    """Only the ELAPSED time matters, never the absolute date.

    Move the review and the present by the same amount and the answer must not
    move. A scheduler that special-cased a calendar boundary -- month end, year
    end, a leap day -- fails here and passes every example written against a
    date somebody picked.
    """
    before = is_due_for_retrieval(_estimate(last_updated), now=last_updated + gap)
    after = is_due_for_retrieval(
        _estimate(last_updated + shift), now=last_updated + shift + gap
    )
    assert before == after


@given(last_updated=instants)
def test_nothing_is_due_before_the_shortest_delay_has_elapsed(
    last_updated: datetime,
) -> None:
    """The pairing property, and the reason the others are not vacuous.

    Every test above is satisfied by `is_due_for_retrieval` returning True for
    everything. This one is not: immediately after a review, nothing is due.
    Section 64's rule -- immediate post-teaching performance is not evidence of
    durable learning -- is exactly this, and without this assertion the module
    could return a constant and pass the whole file.
    """
    shortest = min(
        delay for delay in RETENTION_SCHEDULE if delay > timedelta(0)
    )
    estimate = _estimate(last_updated)

    assert not is_due_for_retrieval(estimate, now=last_updated)
    assert not is_due_for_retrieval(
        estimate, now=last_updated + shortest - timedelta(seconds=1)
    )
    # And the boundary itself IS due -- `>=`, not `>`. An off-by-one here delays
    # every review in the system by one tick, which no example test would catch
    # because the tick is invisible at any realistic scale.
    assert is_due_for_retrieval(estimate, now=last_updated + shortest)


@given(last_updated=instants, gap=gaps)
def test_a_clock_that_went_backwards_never_reports_due(
    last_updated: datetime, gap: timedelta
) -> None:
    """`now` before `last_updated` is a real state, not an impossible one.

    Clocks are corrected by NTP, devices are set by hand, and a queued
    submission arrives stamped earlier than the row it updates. Negative elapsed
    time must mean "not due", never wrap into a large positive.
    """
    assume(gap > timedelta(0))
    estimate = _estimate(last_updated)

    assert not is_due_for_retrieval(estimate, now=last_updated - gap)
