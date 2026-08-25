"""Request and response shapes for the HTTP surface.

WHY THESE ARE SEPARATE FROM THE ENGINE'S OWN MODELS
---------------------------------------------------
`learning_os.models.contracts` describes what the ENGINE believes. This module
describes what the API PROMISES. They overlap today and must not be welded
together, for one reason: the engine's models are free to change shape as the
engine learns, and every such change would otherwise be a silent breaking change
to every caller. `SkillEstimate` carries `evidence_ids` -- provenance the engine
needs and no caller should depend on. Publishing it would make it a promise.

So this is a boundary, and boundaries cost a mapping function. That cost is the
point.

`extra="forbid"` EVERYWHERE, AND IT IS LOAD BEARING
---------------------------------------------------
The Phase 4 failure condition is "a route that returns a shape its schema does
not describe". A model that ignores unknown fields cannot detect that: the test
round-trips a response through its model, and with `extra="ignore"` a surplus
field is dropped in silence and the assertion passes. Forbidding it makes the
round-trip fail in both directions -- missing field and surplus field alike.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class _Strict(BaseModel):
    """Frozen and closed.

    Frozen because a response object handed to a route handler that then mutates
    it is a shape divergence the schema cannot describe. Closed because of the
    round-trip argument in the module docstring.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")


class ErrorDetail(_Strict):
    """The shape of every error this API raises deliberately.

    WHY THIS EXISTS, AND WHAT IT COST TO LEARN.

    FastAPI reserves 422 for its own request-validation failures and publishes a
    fixed schema for it: `{"detail": [ValidationError, ...]}` -- an ARRAY. Domain
    refusals raised as `HTTPException(422, detail="no subskill 'x'")` produce
    `{"detail": "a string"}` under that same status code.

    Both look fine. Both carry `detail`. And the second one violates the schema
    the API publishes for 422, which means any consumer generating a client from
    the document gets a type error on a response the server considers normal.

    Schemathesis found it on the first run, from generated input:

        "no subskill '000...' in knowledge 'python_recursion_v1'"
        is not of type "array"

    Every hand-written test in tests/http and tests/api passed straight through
    it, because they asserted the status code and the PRESENCE of `detail`,
    never its type. That is the difference a generator makes.

    So deliberate refusals now use their own status codes with this model
    declared, and 422 is left to FastAPI alone.
    """

    detail: str


#: How the service describes its own database.
#:
#: Three values rather than a bool, because "no database is configured" and "a
#: database is configured and unreachable" demand opposite responses from an
#: operator, and a bool collapses them into one alarm.
DatabaseStatus = Literal["up", "down", "not_configured"]


class Health(_Strict):
    status: Literal["ok", "degraded"]
    database: DatabaseStatus
    knowledge_version: str


class ConceptSummary(_Strict):
    """A concept as a caller sees it.

    Deliberately NOT the engine's `Concept`. That model carries
    `forbidden_simplifications` and full misconception records -- teaching
    material, not catalogue material. A caller listing concepts wants to know
    what exists and how big it is.
    """

    concept_id: str
    name: str
    definition: str
    subskill_count: int = Field(ge=1)
    prerequisites: tuple[str, ...] = ()


class ConceptPage(_Strict):
    """A window over the catalogue, plus the size of the whole.

    `total` counts the COLLECTION, not the page. Returning the page length is
    the pagination bug that leaves a caller unable to tell there is more, and it
    passes every test that only ever reads one page.
    """

    items: tuple[ConceptSummary, ...]
    total: int = Field(ge=0)
    limit: int = Field(ge=1)
    offset: int = Field(ge=0)


class LearnerCreate(_Strict):
    cohort: str = Field(min_length=1, max_length=64)
    stream: str | None = Field(default=None, max_length=64)


class LearnerCreated(_Strict):
    learner_id: str
    created_at: datetime
    cohort: str
    stream: str | None = None


class SkillMastery(_Strict):
    """One skill's estimate, without the engine's internal provenance.

    `evidence_ids` is not published. It is a list of internal identifiers whose
    format the engine changes freely, and a caller that started keying off it
    would turn an internal detail into a compatibility obligation.
    """

    skill_id: str
    estimate: Annotated[float, Field(ge=0.0, le=1.0)]
    confidence: Annotated[float, Field(ge=0.0, le=1.0)]
    evidence_count: int = Field(ge=0)
    evidence_diversity: int = Field(ge=0)
    state: Literal["unknown", "developing", "competent", "mastered"]
    last_updated: datetime


class MasteryReport(_Strict):
    learner_id: str
    skills: tuple[SkillMastery, ...] = ()


class AttemptCreate(_Strict):
    """What a caller reports about one observation.

    `correct` is a bool and `observed_performance` is not exposed. The engine
    takes a float, but a caller that can send 0.73 is a caller inventing partial
    credit the marking scheme never defined. The mapping from bool to float is
    the API's decision and is stated in one place, in `app.py`.
    """

    skill_id: str = Field(min_length=1, max_length=120)
    correct: bool
    representation: str = Field(min_length=1, max_length=64)
    context_novelty: Annotated[float, Field(ge=0.0, le=1.0)] = 0.0
    response_time_ms: int = Field(default=0, ge=0)


class AttemptRecorded(_Strict):
    attempt_id: str
    learner_id: str
    skill_id: str
    correct: bool
    recorded_at: datetime
    #: True when this response is a replay of an earlier identical request.
    #:
    #: Published rather than hidden, because a client that retried needs to be
    #: able to tell "my write landed" from "my write landed twice", and a
    #: response that is byte-identical either way cannot tell it.
    replayed: bool


#: What the engine decided to do next, flattened for a caller.
#:
#: These are exactly the members of `learning_os.models.contracts.ActionKind`,
#: and `test_next_action_kind_matches_the_engine` fails if the engine grows a
#: sixth. Restating them rather than importing the enum is deliberate: the
#: import would make every engine action an automatic API promise, and the
#: point of this boundary is that adding one is a decision somebody makes.
NextActionKind = Literal[
    "teach_by_example",
    "repair_broken_example",
    "transfer_challenge",
    "diagnose",
    "do_nothing",
]


class NextAction(_Strict):
    learner_id: str
    action: NextActionKind
    #: `None` exactly when there is no skill to act on, which is the
    #: `NoBottleneck` case. A caller can branch on this alone.
    skill_id: str | None = None
    reason: str


class LessonRequest(_Strict):
    skill_id: str = Field(min_length=1, max_length=120)

    #: `pattern=r"\S"` -- at least one non-whitespace character.
    #:
    #: A PATTERN RATHER THAN A VALIDATOR, AND THE DIFFERENCE IS THE SCHEMA.
    #:
    #: This was first a `field_validator` raising "question must not be blank".
    #: Functionally identical, and Schemathesis rejected it at 1500 examples:
    #:
    #:     RejectedPositiveData: API rejected schema-compliant request
    #:     curl -d '{"skill_id": "\r", "question": "\r"}' .../lessons
    #:     [422] {"msg": "Value error, question must not be blank"}
    #:
    #: The check was right and the SCHEMA was lying. `minLength: 1` promises
    #: that any one-character string is acceptable, so "\r" is a request the
    #: published contract invites a caller to make -- and then the API refuses
    #: it. A validator enforces a rule the document does not state; a pattern
    #: puts the same rule INTO the document, where a generated client and a
    #: human reading it both see it.
    #:
    #: JSON Schema `pattern` is unanchored, so `\S` reads as "contains a
    #: non-whitespace character", which is exactly the rule.
    question: str = Field(min_length=1, max_length=200, pattern=r"\S")


class LessonEmitted(_Strict):
    """The `LessonInput` payload the canvas already accepts.

    `blocks` and `relations` are opaque here on purpose. Their schema is owned
    by `frontend/src/canvas/spec/validate.ts` and pinned by the committed
    fixture; restating it in Python would be a second description of one format,
    and two descriptions of one format drift.
    """

    lesson_id: str
    target_skill: str
    question: str
    blocks: tuple[dict[str, object], ...]
    relations: tuple[dict[str, str], ...] = ()
    subject: str | None = None
