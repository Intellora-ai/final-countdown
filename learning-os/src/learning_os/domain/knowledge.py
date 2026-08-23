"""The canonical knowledge model, and the graph over it.

WHY THIS EXISTS AT ALL
----------------------
Without it the LLM redefines the subject from scratch on every call. Ask twice
what a base case is and you get two definitions that are each individually fine
and quietly inconsistent with one another, and a learner told both has been
taught that the terms are vague. Worse, nothing can then be checked: a
"misconception" is only detectable if the correct model was written down first.

So the subject is DATA, authored once and reviewed, and the LLM generates inside
it rather than deciding it. Invariant 6 -- the LLM cannot mutate the canonical
knowledge model -- is not enforced by asking nicely; the models here are frozen
and the LLM layer is never handed a writable reference.

WHAT IS DELIBERATELY NOT HERE
-----------------------------
No representation is chosen here, no difficulty ordering is baked in, and no
teaching sequence is stored. Those are policy decisions that depend on the
learner, and freezing them into the subject is how a system ends up teaching
every learner the same path while claiming to adapt.
"""

from __future__ import annotations

from collections import deque
from enum import StrEnum
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from learning_os.models.contracts import MisconceptionId, SkillId, Verifiability


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", strict=True)


class CognitiveOperation(StrEnum):
    """What a learner is being asked to DO, which is not the same as the topic.

    The distinction matters because "knows recursion" is not one skill. A
    learner can trace a recursive call faithfully and be unable to write one;
    they can write one and be unable to say why it terminates. Those are
    different subskills with different evidence, and collapsing them into a
    single mastery number is what makes a tutor confidently teach the wrong
    thing.
    """

    RECOGNISE = "recognise"
    RECALL = "recall"
    EXPLAIN = "explain"
    PREDICT = "predict"
    APPLY = "apply"
    DEBUG = "debug"
    CONSTRUCT = "construct"
    TRANSFER = "transfer"


class Misconception(_Frozen):
    """A specific wrong model, named so it can be detected and repaired.

    Not "the learner is confused". A misconception worth storing is one that
    predicts a particular wrong answer, because that is what makes it
    identifiable from evidence rather than guessed at.
    """

    misconception_id: MisconceptionId
    statement: str = Field(min_length=1, max_length=400)

    #: What a learner holding this belief will actually do. This is the
    #: detection signal -- without it the entry is a label, not a diagnosis.
    predicts_error: str = Field(min_length=1, max_length=400)
    repaired_by: tuple[str, ...] = ()


class Subskill(_Frozen):
    """The smallest unit that can be taught and evidenced on its own.

    `criticality` is how much the rest of the concept depends on this one. The
    bottleneck engine reads it so that a weak-but-peripheral subskill does not
    outrank a slightly-less-weak one that everything else is built on.
    """

    skill_id: SkillId
    name: str = Field(min_length=1, max_length=200)
    operation: CognitiveOperation
    criticality: float = Field(ge=0.0, le=1.0, default=0.5)
    prerequisites: tuple[SkillId, ...] = ()
    misconceptions: tuple[MisconceptionId, ...] = ()

    #: How far a claim about this subskill can be machine-checked. Carried per
    #: SUBSKILL, not per subject: within one Python concept, "writes a correct
    #: base case" is verifiable by execution while "explains why it terminates"
    #: is not. A single per-domain flag would force the second to borrow the
    #: first's confidence.
    #:
    #: THE DEFAULT IS THE CONSERVATIVE ONE, AND IT WAS THE OTHER WAY ROUND.
    #:
    #: This defaulted to VERIFIABLE, which meant a subskill claimed
    #: machine-checkability by saying nothing at all. That is exactly backwards
    #: for a field whose only job is to stop a claim borrowing confidence it did
    #: not earn: the failure mode of a permissive default is silent and the
    #: failure mode of a strict one is a visible under-claim that somebody
    #: corrects.
    #:
    #: It also produced two wrong entries immediately. `identify_base_case` and
    #: `missing_return_is_none` are RECOGNISE skills -- the learner picks from
    #: options -- and no amount of executing anything settles whether they
    #: picked correctly. Both were marked VERIFIABLE purely by omission.
    #:
    #: So asserting a subskill IS checkable is now a deliberate act, and the
    #: cost of forgetting is uncertainty rather than a fabricated pass.
    verifiability: Verifiability = Verifiability.HUMAN_REVIEW_REQUIRED


class ForbiddenSimplification(_Frozen):
    """A rule the model must not break, and the strings that show it did.

    THIS USED TO BE A BARE STRING, AND THE CHECK WAS VACUOUS.

    `forbidden_simplifications` held instruction sentences -- "Do not say
    recursion 'repeats' the function" -- and the validator tested them with a
    substring match against the generated prose. That fires only if the model
    quotes the rule back at itself, and never when it commits the error the rule
    forbids. Measured, on the exact case:

        prose commits the error  ->  0 violations
        prose quotes the rule    ->  1 violation

    Exactly backwards. The field was doing two jobs with one string: telling the
    MODEL what not to do, and telling the VALIDATOR what to look for. Those need
    different text, and collapsing them meant the second job was never done.

    `tells` is `min_length=1` on purpose. A rule nobody can detect is a rule
    nobody enforces, and the schema should refuse to represent one -- otherwise
    the next author writes a rule, sees it accepted, and reasonably assumes it
    is being checked.
    """

    #: What the model is told. Full sentence, imperative, reaches the prompt.
    rule: str = Field(min_length=1, max_length=400)

    #: What the validator hunts for in generated prose. Short, lowercase,
    #: distinctive substrings that only appear when the rule has been broken.
    #: Not regexes: a domain author should not have to escape anything to make
    #: a teaching rule enforceable.
    tells: tuple[str, ...] = Field(min_length=1)

    @model_validator(mode="after")
    def _tells_are_short_enough_to_match(self) -> Self:
        """A tell as long as the rule is the old bug wearing a new field name.

        The failure mode this catches is somebody pasting the rule into `tells`
        to satisfy the schema. That restores the vacuous check and every test
        would still pass, because the shape is right and only the content is
        useless.
        """
        for tell in self.tells:
            if not tell.strip():
                raise ValueError("a blank tell matches everything; give a real substring")
            if len(tell) > 60:
                raise ValueError(
                    f"tell {tell!r} is {len(tell)} chars -- that is a sentence, not a "
                    f"marker. A tell must be short enough to appear verbatim in prose "
                    f"that breaks the rule."
                )
        return self


class Concept(_Frozen):
    """One teachable idea, decomposed.

    `forbidden_simplifications` is the field that keeps the system honest under
    pressure. When a learner is struggling the tempting move is to soften the
    definition until it is easy, and the result is a learner who has been taught
    something false and will have to unlearn it. Simplify the PATH through the
    knowledge; never the knowledge.
    """

    concept_id: str = Field(pattern=r"^[a-z0-9]+(\.[a-z0-9_]+)+$", max_length=120)
    name: str = Field(min_length=1, max_length=200)
    definition: str = Field(min_length=1, max_length=2000)

    core_ideas: tuple[str, ...] = ()
    prerequisites: tuple[str, ...] = ()
    subskills: tuple[Subskill, ...] = Field(min_length=1)
    misconceptions: tuple[Misconception, ...] = ()

    technical_terms: tuple[str, ...] = ()
    allowed_simplifications: tuple[str, ...] = ()
    forbidden_simplifications: tuple[ForbiddenSimplification, ...] = ()

    @model_validator(mode="after")
    def _subskills_belong_to_this_concept(self) -> Self:
        """A subskill filed under the wrong concept breaks every lookup.

        The bottleneck engine walks from a concept to its subskills and back;
        an id that does not share the concept's prefix silently detaches from
        that walk and can never be selected.
        """
        for sub in self.subskills:
            if not sub.skill_id.startswith(f"{self.concept_id}."):
                raise ValueError(
                    f"subskill '{sub.skill_id}' is filed under concept "
                    f"'{self.concept_id}' but does not belong to it"
                )
        return self

    @model_validator(mode="after")
    def _named_misconceptions_are_defined(self) -> Self:
        """A subskill may only cite a misconception this concept defines.

        Otherwise the id is a dangling reference: the engine can attach it to a
        learner and then find nothing to repair, which reads as a repaired
        misconception rather than a missing one.
        """
        defined = {m.misconception_id for m in self.misconceptions}
        for sub in self.subskills:
            for cited in sub.misconceptions:
                if cited not in defined:
                    raise ValueError(
                        f"subskill '{sub.skill_id}' cites misconception '{cited}', "
                        f"which this concept does not define"
                    )
        return self


class KnowledgeGraph(_Frozen):
    """The concepts, and the dependency structure over their subskills.

    Versioned, because a decision made under one version of the subject cannot
    be replayed against another and pretend to be the same decision. Every
    `DecisionEvent` records `knowledge_version` for exactly this reason.
    """

    version: str = Field(min_length=1, max_length=64)
    concepts: tuple[Concept, ...] = Field(min_length=1)

    @model_validator(mode="after")
    def _no_prerequisite_cycles(self) -> Self:
        """A cycle makes "teach the prerequisite first" non-terminating.

        This is checked at construction rather than discovered at runtime,
        because the failure mode is not an exception -- it is a tutor that
        recurses forever looking for something to teach first, or a bottleneck
        selector that never settles.
        """
        edges = self._prerequisite_edges()
        cycle = _find_cycle(edges)
        if cycle is not None:
            raise ValueError(
                "prerequisite cycle: " + " -> ".join(cycle) + ". "
                "There is no order in which these can be taught."
            )
        return self

    @model_validator(mode="after")
    def _prerequisites_exist(self) -> Self:
        known = {s.skill_id for c in self.concepts for s in c.subskills}
        for concept in self.concepts:
            for sub in concept.subskills:
                for pre in sub.prerequisites:
                    if pre not in known:
                        raise ValueError(
                            f"subskill '{sub.skill_id}' requires '{pre}', "
                            "which no concept defines"
                        )
        return self

    def _prerequisite_edges(self) -> dict[str, tuple[str, ...]]:
        return {
            sub.skill_id: sub.prerequisites
            for concept in self.concepts
            for sub in concept.subskills
        }

    def subskill(self, skill_id: str) -> Subskill | None:
        for concept in self.concepts:
            for sub in concept.subskills:
                if sub.skill_id == skill_id:
                    return sub
        return None

    def concept_of(self, skill_id: str) -> Concept | None:
        for concept in self.concepts:
            if any(s.skill_id == skill_id for s in concept.subskills):
                return concept
        return None

    def misconception(self, misconception_id: str) -> Misconception | None:
        for concept in self.concepts:
            for m in concept.misconceptions:
                if m.misconception_id == misconception_id:
                    return m
        return None

    def prerequisites_of(self, skill_id: str) -> tuple[str, ...]:
        """Every subskill this one rests on, transitively, nearest first.

        Nearest-first matters: when a learner is blocked, the thing to check is
        the immediate prerequisite, not the deepest one. Returning them in
        dependency order means the bottleneck engine can stop at the first weak
        link instead of walking to the bottom of the graph every time.
        """
        edges = self._prerequisite_edges()
        seen: set[str] = set()
        order: list[str] = []
        queue = deque(edges.get(skill_id, ()))
        while queue:
            current = queue.popleft()
            if current in seen:
                continue
            seen.add(current)
            order.append(current)
            queue.extend(edges.get(current, ()))
        return tuple(order)

    def teachable_order(self) -> tuple[str, ...]:
        """A topological order: nothing appears before something it needs.

        Not a curriculum. It is the constraint a curriculum has to satisfy --
        the policy layer decides what to teach and when, and this only says
        which orderings are even coherent.
        """
        edges = self._prerequisite_edges()
        remaining = dict(edges)
        placed: list[str] = []
        placed_set: set[str] = set()
        while remaining:
            ready = sorted(
                skill for skill, pres in remaining.items()
                if all(p in placed_set for p in pres)
            )
            if not ready:
                # Unreachable: the cycle validator runs at construction. Kept
                # because a silent infinite loop here would be far worse than a
                # loud failure if that validator is ever weakened.
                raise ValueError("prerequisite cycle reached teachable_order()")
            for skill in ready:
                placed.append(skill)
                placed_set.add(skill)
                del remaining[skill]
        return tuple(placed)


def _find_cycle(edges: dict[str, tuple[str, ...]]) -> list[str] | None:
    """Depth-first with an on-stack marker, so a diamond is not a cycle.

    The naive "have I seen this node" check reports a false cycle whenever two
    paths reconverge, which is extremely common in a prerequisite graph -- two
    subskills legitimately sharing one foundation. Only a node currently ON the
    stack indicates a genuine loop.
    """
    WHITE, GREY, BLACK = 0, 1, 2
    colour: dict[str, int] = dict.fromkeys(edges, WHITE)
    stack_path: list[str] = []

    def visit(node: str) -> list[str] | None:
        colour[node] = GREY
        stack_path.append(node)
        for nxt in edges.get(node, ()):
            if nxt not in colour:
                continue
            if colour[nxt] == GREY:
                return [*stack_path[stack_path.index(nxt) :], nxt]
            if colour[nxt] == WHITE:
                found = visit(nxt)
                if found is not None:
                    return found
        stack_path.pop()
        colour[node] = BLACK
        return None

    for node in edges:
        if colour[node] == WHITE:
            found = visit(node)
            if found is not None:
                return found
    return None
