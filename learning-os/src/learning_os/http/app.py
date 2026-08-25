"""The HTTP surface. Thin wrappers over the engine, and nothing else.

THE DESIGN RULE, STATED SO IT CAN BE CHECKED
--------------------------------------------
No decision logic lives in this file. Every route resolves its inputs, calls an
existing `learning_os` function, and maps the result onto a response model. If a
teaching rule needs to change it changes in the engine, and this file does not
move.

That rule is worth more than it looks. The engine's whole claim is that a
decision can be replayed and shown to have been wrong. A route handler that
adjusted a threshold "just for the API" would produce decisions the engine
cannot reproduce, and the audit trail would be describing a decision nobody
made.

WHY `build_app` IS A FUNCTION AND NOT A MODULE-LEVEL `app`
----------------------------------------------------------
A module-level singleton binds the store at import time, which means the tests
and the server cannot hold different ones, and the Phase 5 cut-over from memory
to PostgreSQL becomes an edit to this file rather than an argument. Uvicorn is
given a factory instead.
"""

from __future__ import annotations

from typing import Annotated, Any, cast

from fastapi import (
    Depends,
    FastAPI,
    Header,
    HTTPException,
    Query,
    Request,
    Response,
    status,
)

from learning_os.api.emit import EmitError, emit
from learning_os.diagnosis.bottleneck import NoBottleneck, select_bottleneck
from learning_os.domain.knowledge import KnowledgeGraph
from learning_os.domain.python_recursion import GRAPH
from learning_os.http.models import (
    AttemptCreate,
    AttemptRecorded,
    ConceptPage,
    ConceptSummary,
    DatabaseStatus,
    Health,
    LearnerCreate,
    LearnerCreated,
    LessonEmitted,
    LessonRequest,
    MasteryReport,
    NextAction,
    NextActionKind,
    SkillMastery,
)
from learning_os.http.repository import InMemoryLearners, Learners, UnknownLearner
from learning_os.llm.client import FakeLLMClient
from learning_os.llm.contract import DiagnosisKind, InstructionContract, Strategy
from learning_os.mastery.estimate import Belief
from learning_os.memory.store import MemoryStore
from learning_os.models.contracts import (
    ActionKind,
    Evidence,
    EvidenceStrength,
    LearnerState,
)
from learning_os.policy.select import select_action

#: How a bare `correct` maps onto the engine's continuous performance axis.
#:
#: Stated once, here, because it is the API's decision and not the engine's. The
#: engine accepts any value in [0, 1]; the API refuses to let a caller invent
#: partial credit, because a caller sending 0.73 is asserting a marking scheme
#: that does not exist. When one does exist, this is the single line that moves.
_PERFORMANCE = {True: 1.0, False: 0.0}

#: The strength recorded for an attempt arriving over HTTP.
#:
#: `INDEPENDENT_APPLICATION` rather than the stronger
#: `INDEPENDENT_NOVEL_TRANSFER`, because the API cannot know the task was novel
#: -- `context_novelty` is what the caller asserts about that, and it is carried
#: separately. Claiming the strongest kind by default would let every caller
#: inflate confidence for free, which is the exact failure the mastery module's
#: diversity rule exists to prevent.
_STRENGTH = EvidenceStrength.INDEPENDENT_APPLICATION


def _get_graph(request: Request) -> KnowledgeGraph:
    return cast(KnowledgeGraph, request.app.state.graph)


def _get_learners(request: Request) -> Learners:
    return cast(Learners, request.app.state.learners)


# MODULE LEVEL, AND THAT IS NOT A STYLE CHOICE.
#
# This file uses `from __future__ import annotations`, so every annotation is a
# STRING at runtime and FastAPI resolves it with `get_type_hints` against this
# module's globals. Defined inside `build_app` these aliases were invisible to
# that lookup, and FastAPI's fallback for an unresolvable annotation is not an
# error -- it decides the parameter is a QUERY field. `GET /concepts` answered
# `422 {"loc": ["query", "graph"], "msg": "Field required"}`, which reads like a
# caller mistake and was entirely ours.
GraphDep = Annotated[KnowledgeGraph, Depends(_get_graph)]
LearnersDep = Annotated[Learners, Depends(_get_learners)]


def build_app(
    *,
    graph: KnowledgeGraph | None = None,
    learners: Learners | None = None,
    database: DatabaseStatus = "not_configured",
) -> FastAPI:
    resolved_graph = graph if graph is not None else GRAPH
    resolved_learners = learners if learners is not None else InMemoryLearners()

    app = FastAPI(
        title="learning-os",
        version=resolved_graph.version,
        summary="An HTTP surface over the Learning OS decision engine.",
        # `/openapi.json` STAYS. It is the contract: the drift gate compares it
        # to the committed file, Phase 7's Schemathesis run generates from it,
        # and Phase 8's Pact contracts are checked against it.
        #
        # `/docs` and `/redoc` GO. They are a rendering of that same contract,
        # and three routes exist to serve a human a web page the JSON already
        # describes. Turning them off keeps the served surface equal to the
        # designed surface, which is what makes
        # `test_every_declared_route_is_covered_by_this_file` a real check
        # rather than a list of framework exceptions that grows on upgrade.
        docs_url=None,
        redoc_url=None,
    )
    app.state.graph = resolved_graph
    app.state.learners = resolved_learners
    app.state.database = database

    @app.get("/health", response_model=Health)
    def health(request: Request) -> Health:
        database_status = cast(DatabaseStatus, request.app.state.database)
        return Health(
            # "ok" while no database is configured, because nothing is broken:
            # Phase 4 genuinely has no database. Reporting "degraded" here would
            # train an operator to ignore the field before it ever means
            # anything.
            status="ok" if database_status in {"up", "not_configured"} else "degraded",
            database=database_status,
            knowledge_version=cast(KnowledgeGraph, request.app.state.graph).version,
        )

    @app.get("/concepts", response_model=ConceptPage)
    def concepts(
        graph: GraphDep,
        limit: Annotated[int, Query(ge=1, le=200)] = 50,
        offset: Annotated[int, Query(ge=0)] = 0,
        subject: Annotated[str | None, Query(max_length=64)] = None,
    ) -> ConceptPage:
        selected = [
            concept
            for concept in graph.concepts
            if subject is None or concept.concept_id.startswith(f"{subject}.")
        ]
        window = selected[offset : offset + limit]
        return ConceptPage(
            items=tuple(
                ConceptSummary(
                    concept_id=concept.concept_id,
                    name=concept.name,
                    definition=concept.definition,
                    subskill_count=len(concept.subskills),
                    prerequisites=tuple(concept.prerequisites),
                )
                for concept in window
            ),
            # The whole collection, not the page. See ConceptPage's docstring.
            total=len(selected),
            limit=limit,
            offset=offset,
        )

    @app.post(
        "/learners", response_model=LearnerCreated, status_code=status.HTTP_201_CREATED
    )
    def create_learner(body: LearnerCreate, learners: LearnersDep) -> LearnerCreated:
        record = learners.create(cohort=body.cohort, stream=body.stream)
        return LearnerCreated(
            learner_id=record.learner_id,
            created_at=record.created_at,
            cohort=record.cohort,
            stream=record.stream,
        )

    @app.get("/learners/{learner_id}", response_model=LearnerCreated)
    def get_learner(learner_id: str, learners: LearnersDep) -> LearnerCreated:
        record = learners.get(learner_id)
        if record is None:
            raise HTTPException(status_code=404, detail=f"no learner {learner_id!r}")
        return LearnerCreated(
            learner_id=record.learner_id,
            created_at=record.created_at,
            cohort=record.cohort,
            stream=record.stream,
        )

    @app.get("/learners/{learner_id}/mastery", response_model=MasteryReport)
    def mastery(learner_id: str, learners: LearnersDep) -> MasteryReport:
        try:
            beliefs = learners.beliefs(learner_id)
        except UnknownLearner:
            raise HTTPException(
                status_code=404, detail=f"no learner {learner_id!r}"
            ) from None
        return MasteryReport(
            learner_id=learner_id,
            skills=tuple(
                _to_mastery(belief)
                # Sorted so two identical states serialise identically. An
                # insertion-ordered response makes a caller's diff noisy for a
                # reason that has nothing to do with the learner.
                for _, belief in sorted(beliefs.items())
            ),
        )

    @app.post(
        "/learners/{learner_id}/attempts",
        response_model=AttemptRecorded,
        status_code=status.HTTP_201_CREATED,
    )
    def record_attempt(
        learner_id: str,
        body: AttemptCreate,
        learners: LearnersDep,
        graph: GraphDep,
        response: Response,
        # REQUIRED, not optional. An optional idempotency key is no idempotency
        # at all: the retry that causes the damage is the one the client never
        # planned, and a client that did not plan it did not send a key.
        idempotency_key: Annotated[
            str, Header(alias="Idempotency-Key", min_length=1, max_length=128)
        ],
    ) -> AttemptRecorded:
        if graph.subskill(body.skill_id) is None:
            raise HTTPException(
                status_code=422,
                detail=f"no subskill {body.skill_id!r} in knowledge {graph.version!r}",
            )
        evidence = Evidence(
            evidence_id=f"http:{idempotency_key}",
            event_id=f"http:{idempotency_key}",
            skill_id=body.skill_id,
            strength=_STRENGTH,
            observed_performance=_PERFORMANCE[body.correct],
            task_difficulty=0.5,
            task_reliability=1.0,
            independence=1.0,
            context_novelty=body.context_novelty,
            response_time_ms=body.response_time_ms,
            representation=body.representation,
            attempt_number=1,
        )
        try:
            record = learners.record(
                learner_id,
                idempotency_key=idempotency_key,
                evidence=evidence,
                correct=body.correct,
            )
        except UnknownLearner:
            raise HTTPException(
                status_code=404, detail=f"no learner {learner_id!r}"
            ) from None

        # 200 on a replay, 201 only when something was created. A replay
        # answering 201 tells a retrying client it made a second row.
        if record.replayed:
            response.status_code = status.HTTP_200_OK
        return AttemptRecorded(
            attempt_id=record.attempt_id,
            learner_id=record.learner_id,
            skill_id=record.skill_id,
            correct=record.correct,
            recorded_at=record.recorded_at,
            replayed=record.replayed,
        )

    @app.get("/learners/{learner_id}/next", response_model=NextAction)
    def next_action(
        learner_id: str,
        learners: LearnersDep,
        graph: GraphDep,
        target: Annotated[str | None, Query(max_length=120)] = None,
    ) -> NextAction:
        try:
            beliefs = dict(learners.beliefs(learner_id))
        except UnknownLearner:
            raise HTTPException(
                status_code=404, detail=f"no learner {learner_id!r}"
            ) from None

        target_skill = target if target is not None else _default_target(graph, beliefs)
        learner_state = LearnerState(
            learner_id=learner_id,
            version=len(beliefs),
            skills={skill: belief.estimate for skill, belief in beliefs.items()},
        )
        memory = MemoryStore()

        bottleneck = select_bottleneck(graph, learner_state, memory, target_skill)
        if isinstance(bottleneck, NoBottleneck):
            return NextAction(
                learner_id=learner_id,
                action=_ABSENCE_ACTION[bottleneck],
                skill_id=None,
                reason=bottleneck.value,
            )

        decision = select_action(
            graph,
            memory,
            bottleneck,
            DiagnosisKind.CONCEPT_GAP,
            question=f"What should {learner_id} learn next?",
        )
        return NextAction(
            learner_id=learner_id,
            # No cast. mypy --strict reports one here as redundant, which is
            # itself the proof that `NextActionKind` and `ActionKind` currently
            # agree: if the engine grew a sixth action this line would stop
            # type-checking, before `test_next_action_kind_matches_the_engine`
            # even ran.
            action=decision.contract.action.value,
            skill_id=bottleneck.skill_id,
            reason=",".join(reason.value for reason in decision.reasons),
        )

    @app.post(
        "/lessons", response_model=LessonEmitted, status_code=status.HTTP_201_CREATED
    )
    def lessons(body: LessonRequest, graph: GraphDep) -> LessonEmitted:
        if graph.subskill(body.skill_id) is None:
            raise HTTPException(
                status_code=422,
                detail=f"no subskill {body.skill_id!r} in knowledge {graph.version!r}",
            )
        if not body.question.strip():
            raise HTTPException(status_code=422, detail="question must not be blank")

        contract = InstructionContract(
            target_skill=body.skill_id,
            question=body.question,
            diagnosis=DiagnosisKind.CONCEPT_GAP,
            strategy=Strategy.WORKED_EXAMPLE,
            action=ActionKind.TEACH_BY_EXAMPLE,
            success_evidence_required="learner applies the idea unaided",
        )
        try:
            # The same two calls `api/cli.py` makes to build the committed
            # fixture. Deliberately identical: if this route and that fixture
            # ever produce different shapes, one of them is wrong and the
            # fixture check says so.
            lesson = emit(contract, FakeLLMClient().generate(contract))
        except EmitError as error:
            raise HTTPException(status_code=422, detail=str(error)) from None

        return LessonEmitted(
            lesson_id=lesson.id,
            target_skill=body.skill_id,
            question=lesson.question,
            blocks=tuple(lesson.blocks),
            relations=tuple(lesson.relations),
            subject=lesson.subject,
        )

    return app


#: `NoBottleneck` -> what the caller should do. Mirrors
#: `learning_os.runtime.loop._ACTION_FOR_ABSENCE` rather than inventing a second
#: opinion; the mapping is duplicated because that one is private, and
#: `test_absence_actions_match_the_runtime` fails if the two ever disagree.
_ABSENCE_ACTION: dict[NoBottleneck, NextActionKind] = {
    NoBottleneck.MASTERED: "do_nothing",
    NoBottleneck.UNEVIDENCED: "diagnose",
    NoBottleneck.UNKNOWN_TARGET: "do_nothing",
}


def openapi_document() -> dict[str, Any]:
    """The OpenAPI document, as plain data.

    THIS EXISTS SO THE DRIFT GATE DOES NOT NEED FASTAPI'S TYPES.

    `scripts/openapi_drift.py` is checked by the ROOT pyright configuration,
    whose virtualenv installs `requirements.lock` -- which has no fastapi, and
    should not. Calling `build_app().openapi()` from there left pyright with an
    unresolvable return type, so `build_app` was `-> Unknown`, `.openapi()` was
    an unknown member, and the argument to `render` was unknown: three strict
    errors that were entirely a configuration gap.

    Adding fastapi to the root lock to satisfy a type checker would expand the
    root trusted computing base for a package no root job ever imports. Putting
    the boundary here instead costs one function: on this side of it fastapi is
    installed and `mypy --strict` checks the call, and what crosses is a
    `dict[str, Any]` that needs no framework to describe.
    """
    return build_app().openapi()


def _default_target(graph: KnowledgeGraph, beliefs: dict[str, Belief]) -> str:
    """Which skill `/next` asks about when the caller does not say.

    The learner's WEAKEST evidenced skill, because that is what a bottleneck
    engine is for. With no evidence at all there is nothing to be weakest, so
    the first teachable subskill is used and the engine answers UNEVIDENCED --
    which is the honest answer, and the one that routes the caller to a
    diagnostic instead of to a guess.
    """
    if beliefs:
        return min(beliefs.items(), key=lambda item: item[1].estimate.estimate)[0]
    return graph.concepts[0].subskills[0].skill_id


def _to_mastery(belief: Belief) -> SkillMastery:
    estimate = belief.estimate
    return SkillMastery(
        skill_id=estimate.skill_id,
        estimate=estimate.estimate,
        confidence=estimate.confidence,
        evidence_count=estimate.evidence_count,
        evidence_diversity=estimate.evidence_diversity,
        state=estimate.state,
        last_updated=estimate.last_updated,
    )
