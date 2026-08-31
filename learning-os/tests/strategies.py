"""Hypothesis strategies for learning-os.

Each strategy models the VALID INPUT SPACE of a contract, not merely its types.
The difference matters here more than usual: `Evidence` and `SkillEstimate` are
pydantic models with validators, so a strategy that satisfies the annotations
and violates a validator produces an exception inside the generator rather than
a test failure — and the report blames Hypothesis for a constraint the domain
imposed.

WHERE THE CONSTRAINTS COME FROM
-------------------------------
Every bound below was read off `models/contracts.py`, not guessed:

  SkillId               `^[a-z0-9]+(\\.[a-z0-9_]+)+$`, max 120 — dotted, always
                        at least two segments, so `"algebra"` is INVALID
  the unit floats       `ge=0.0, le=1.0` on observed_performance,
                        task_difficulty, task_reliability, independence,
                        hint_factor, context_novelty
  evidence_id/event_id  1..64 characters
  representation        1..64 characters
  attempt_number        `ge=1` — there is no attempt zero
  response_time_ms      `ge=0`

  SkillEstimate._updates_cite_evidence
                        a non-zero `evidence_count` REQUIRES non-empty
                        `evidence_ids`, and so does any `state` other than
                        "unknown". This is invariant 3 — every state update
                        references the evidence that caused it — and it is the
                        constraint a type-driven strategy gets wrong first.

WHY `representation` IS DRAWN FROM A SMALL SET
----------------------------------------------
`update` keys diversity on `(representation, context_novelty >= 0.5)`. Drawn
from unconstrained text, two observations would essentially never collide, and
the property that repetition does NOT raise diversity would pass without ever
exercising a repeat. A small alphabet makes collisions common, which is exactly
where the interesting behaviour is.
"""

from __future__ import annotations

from datetime import UTC, datetime

from hypothesis import strategies as st

from learning_os.mastery.estimate import Belief
from learning_os.models.contracts import Evidence, EvidenceStrength, SkillEstimate

# -- Atomic strategies -------------------------------------------------------

#: A value on the closed unit interval, which is what every weighting factor in
#: the estimator is. `allow_nan=False` because a NaN would propagate silently
#: through the arithmetic and make every comparison false rather than raising.
#
# THE ENDPOINTS ARE DRAWN DELIBERATELY OFTEN, and that is not decoration.
# `evidence_weight` multiplies FIVE unit factors, so its maximum is reached only
# when all five sit at their extreme at once. Under a plain uniform draw that
# conjunction essentially never happens, and a mutant that deleted the clamp in
# `update` survived a hundred examples because of it — the generator never built
# an observation strong enough to make the clamp matter. Weighting the endpoints
# is what lets a five-way corner be found at all.
unit_floats = st.one_of(
    st.just(0.0),
    st.just(1.0),
    st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False),
)

#: Dotted, at least two segments, lowercase. Built from parts rather than
#: filtered against the pattern: filtering `st.text()` for this regex would
#: discard essentially every draw.
skill_ids = st.builds(
    lambda head, tail: f"{head}.{'.'.join(tail)}",
    st.from_regex(r"[a-z0-9]{1,12}", fullmatch=True),
    st.lists(st.from_regex(r"[a-z0-9_]{1,12}", fullmatch=True), min_size=1, max_size=3),
)

#: Identifiers only need to be non-empty and short; nothing reads their shape.
short_ids = st.text(min_size=1, max_size=64)

#: Deliberately few, so repeats happen — see the module docstring.
representations = st.sampled_from(["code", "prose", "diagram", "table", "spoken"])

evidence_strengths = st.sampled_from(list(EvidenceStrength))

instants = st.datetimes(
    min_value=datetime(2020, 1, 1),
    max_value=datetime(2040, 1, 1),
).map(lambda value: value.replace(tzinfo=UTC))


# -- Domain strategies -------------------------------------------------------


@st.composite
def evidences(draw: st.DrawFn, *, skill_id: str | None = None) -> Evidence:
    """One observation of a learner doing something.

    `skill_id` is injectable because several properties fold a SEQUENCE of
    evidence into one belief, and evidence for a different skill in that
    sequence would be a different question from the one being asked.
    """
    return Evidence(
        evidence_id=draw(short_ids),
        event_id=draw(short_ids),
        skill_id=skill_id if skill_id is not None else draw(skill_ids),
        strength=draw(evidence_strengths),
        observed_performance=draw(unit_floats),
        task_difficulty=draw(unit_floats),
        task_reliability=draw(unit_floats),
        independence=draw(unit_floats),
        hint_factor=draw(unit_floats),
        context_novelty=draw(unit_floats),
        response_time_ms=draw(st.integers(min_value=0, max_value=600_000)),
        representation=draw(representations),
        attempt_number=draw(st.integers(min_value=1, max_value=10)),
        error_type=draw(st.one_of(st.none(), st.text(min_size=1, max_size=64))),
    )


@st.composite
def skill_estimates(draw: st.DrawFn, *, skill_id: str | None = None) -> SkillEstimate:
    """A stored belief about one skill, satisfying invariant 3.

    `evidence_count` and `evidence_ids` ARE DRAWN TOGETHER, not independently.
    The validator refuses a positive count with no ids, so drawing them apart
    would raise inside the generator on most draws. Count zero is kept
    reachable, because "no evidence yet" is a real and important state — it is
    the one `state_of` must report as UNKNOWN.
    """
    ids = draw(st.lists(short_ids, min_size=0, max_size=16))
    count = 0 if not ids else draw(st.integers(min_value=1, max_value=200))
    return SkillEstimate(
        skill_id=skill_id if skill_id is not None else draw(skill_ids),
        estimate=draw(unit_floats),
        confidence=draw(unit_floats),
        evidence_count=count,
        #: Diversity can never exceed the number of observations that produced
        #: it: a kind of evidence has to be observed to be counted.
        evidence_diversity=draw(st.integers(min_value=0, max_value=max(count, 0))),
        evidence_ids=tuple(ids),
        last_updated=draw(instants),
        state="unknown",
    )


@st.composite
def beliefs(draw: st.DrawFn, *, skill_id: str | None = None) -> Belief:
    """An estimate plus the context set the estimator keeps beside it.

    `seen_contexts` is drawn independently of `evidence_diversity` on purpose.
    They agree in anything `update` produced, and a prior arriving from storage
    is not guaranteed to — so a property that only holds when they agree is a
    property that does not hold.
    """
    return Belief(
        estimate=draw(skill_estimates(skill_id=skill_id)),
        seen_contexts=frozenset(
            draw(
                st.lists(
                    st.tuples(representations, st.booleans()),
                    min_size=0,
                    max_size=6,
                )
            )
        ),
    )
