"""The instructional contract: what the model is allowed to generate, and inside what.

WHY A CONTRACT RATHER THAN A PROMPT
-----------------------------------
A prompt is a request. A contract is a request plus the means to check whether it
was honoured. The difference is the whole architecture here: the policy layer
decides WHAT to teach and under what constraints, the model decides HOW TO SAY
IT, and something downstream verifies the model stayed inside. Without the third
part the first two are decoration -- a model that ignores `max_new_concepts` and
introduces four is indistinguishable from one that obeyed, and the learner is the
one who finds out.

So every field here exists because a validator reads it. A constraint nothing
checks is a comment.

WHAT THE MODEL IS NOT TOLD
--------------------------
Not the raw learner history. Not the mastery numbers. Not the bottleneck score,
the hypothesis probabilities, or how confident the engine is in its own
diagnosis. Two reasons, and the second is the load-bearing one:

  * Volume. The history grows without bound and would silently crowd out the
    constraints, which is how a contract quietly stops being enforced.

  * Authority. A model given the evidence will re-derive a diagnosis from it,
    and then the diagnosis is the model's rather than the engine's. Section 77
    is explicit: the LLM must not be the final authority on mastery, bottleneck,
    prerequisite truth, or correctness. The cheapest way to guarantee that is
    not to hand it the inputs for the decision it must not make.

WHAT MAY NEVER APPEAR IN THIS FILE
----------------------------------
Colour. Font size. Spacing. Position -- `x`, `y`, `width`, `height`, `top`,
`left`. Alignment. Radius. Those are Laws 2 and 3, and a schema field carrying
one is a bug to be deleted rather than a convenience to be used. The rule
generalises beyond style: the contract may not state anything the renderer can
derive. Ordering by importance and representation choice are the same category
as position -- if the canvas can compute it, the engine stating it IS the engine
positioning.

Also never: free text about the learner as a person. `weak_subskills` holds ids.
An id cannot say "the student is lazy"; a string can, and eventually will.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from learning_os.models.contracts import ActionKind, SkillId


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", strict=True)


class Strategy(StrEnum):
    """How to teach, as a mechanism rather than a wording.

    These are the categories the fallback engine chooses BETWEEN. That is the
    point of naming them: section 45 requires a failed intervention to change the
    instructional mechanism rather than paraphrase, and "changed the mechanism"
    is only checkable if mechanisms have names.

    Not a mandatory sequence. The policy layer picks based on the diagnosis and
    what has already failed for this learner.
    """

    WORKED_EXAMPLE = "worked_example"
    BROKEN_EXAMPLE_REPAIR = "broken_example_repair"
    TRANSFER_CHALLENGE = "transfer_challenge"
    CONTRAST = "contrast"
    DECOMPOSITION = "decomposition"
    ANALOGY = "analogy"
    GUIDED_REASONING = "guided_reasoning"
    PREREQUISITE_REPAIR = "prerequisite_repair"
    MISCONCEPTION_REPAIR = "misconception_repair"
    NEW_CONTEXT = "new_context"


class DiagnosisKind(StrEnum):
    """Why the learner is stuck, as the engine currently believes.

    Passed to the model so the explanation addresses the actual gap, and
    deliberately WITHOUT the probability behind it. A model told "prerequisite
    gap, 0.62" will hedge in prose the learner then has to interpret. The
    engine's uncertainty is the engine's business; the teaching is either
    appropriate or it is not.
    """

    TERM_GAP = "term_gap"
    CONCEPT_GAP = "concept_gap"
    PREREQUISITE_GAP = "prerequisite_gap"
    MISCONCEPTION = "misconception"
    CAUSAL_REASONING_FAILURE = "causal_reasoning_failure"
    PROCEDURAL_FAILURE = "procedural_failure"
    REPRESENTATION_FAILURE = "representation_failure"
    LANGUAGE_FAILURE = "language_failure"
    COGNITIVE_OVERLOAD = "cognitive_overload"
    TRANSFER_FAILURE = "transfer_failure"


class SimplicityConstraints(_Frozen):
    """The atomicity budget, section 50.

    Defaults are all 1, which is the rule rather than a suggestion: one new
    concept, one new idea, one primary example, one cognitive target. A teaching
    unit that introduces three things has not taught one thing well, it has
    given the learner a choice of which to miss.

    These are budgets a validator counts against, not adjectives. "Keep it
    simple" cannot fail a check; `max_new_concepts=1` can.
    """

    max_new_concepts: int = Field(ge=1, le=3, default=1)
    max_new_ideas: int = Field(ge=1, le=3, default=1)
    max_primary_examples: int = Field(ge=1, le=3, default=1)
    max_cognitive_targets: int = Field(ge=1, le=3, default=1)

    #: Upper bound on blocks in the generated lesson. The canvas caps at 24; this
    #: is far lower because the constraint here is the LEARNER's attention, not
    #: the renderer's capacity. Twelve blocks that render beautifully are still
    #: twelve blocks.
    max_blocks: int = Field(ge=1, le=8, default=4)


class InstructionContract(_Frozen):
    """One instruction to the model, and everything it is bound by.

    Constructed by the policy layer, never by the model, and frozen so a
    generation step cannot relax its own constraints between being handed the
    contract and being checked against it.
    """

    target_skill: SkillId
    #: The question the lesson answers. Becomes the lesson title, so it is the
    #: one piece of learner-facing text the engine authors rather than the model.
    #: Deliberate: the model may phrase the explanation, but what is being
    #: explained is a decision, not a phrasing.
    question: str = Field(min_length=1, max_length=200)

    diagnosis: DiagnosisKind
    strategy: Strategy
    action: ActionKind

    #: Ids only, never prose. See the module docstring.
    known_prerequisites: tuple[SkillId, ...] = ()
    weak_subskills: tuple[SkillId, ...] = ()

    #: Representations that have already worked for THIS learner on THIS skill.
    #:
    #: A preference the model may honour, never an instruction. `MemoryStore`
    #: documents itself as "read by the policy layer as a preference, never as a
    #: rule", and until this field existed the policy read it as a boolean and
    #: discarded the value -- so `REPRESENTATION_WORKED_BEFORE` announced a
    #: preference with nowhere to go, and the memory module's docstring was
    #: false about its only consumer.
    #:
    #: NOT a styling field. Which FORM an explanation takes -- a call-stack
    #: diagram versus prose -- is an instructional decision grounded in this
    #: learner's evidence. Law 3 bans colour, size and spacing; it does not ban
    #: saying what has taught this person before.
    preferred_representations: tuple[str, ...] = ()

    simplicity: SimplicityConstraints = SimplicityConstraints()

    #: Terms the generated content MUST contain, verbatim. This is section 9 in
    #: force: simplify the PATH through the knowledge, never the knowledge. When
    #: a learner is struggling the tempting move is to drop the technical term
    #: for something friendlier, and the result is a learner who has to unlearn
    #: it later. Checked by the validator, so "must" is literal.
    required_terms: tuple[str, ...] = ()

    #: Substrings that must NOT appear. Populated from the concept's
    #: `forbidden_simplifications` -- the specific false things it is tempting to
    #: say about THIS concept, not a generic banned-words list.
    forbidden_phrases: tuple[str, ...] = ()

    #: What the learner must do for this intervention to count as having worked.
    #: Fixed HERE, before generation, which is invariant 2: deciding what counts
    #: as success after seeing the response is how every intervention ends up
    #: looking successful.
    success_evidence_required: str = Field(min_length=1, max_length=400)

    @model_validator(mode="after")
    def _required_and_forbidden_do_not_overlap(self) -> Self:
        """A term cannot be both mandatory and prohibited.

        Not hypothetical: `forbidden_simplifications` are phrased using the
        concept's own vocabulary, so "must contain 'base case'" and "must not
        contain 'the base case is optional'" are easy to author into direct
        conflict. Caught here rather than at validation time, because an
        unsatisfiable contract is a policy bug and should fail where the policy
        is written -- not look like a model failure later.
        """
        for term in self.required_terms:
            lowered = term.lower()
            for phrase in self.forbidden_phrases:
                if lowered == phrase.lower():
                    raise ValueError(
                        f"term {term!r} is both required and forbidden; "
                        "no output can satisfy this contract"
                    )
        return self

    @model_validator(mode="after")
    def _a_weak_skill_is_not_also_known(self) -> Self:
        """The same skill cannot be a solid prerequisite and a weak subskill.

        It would make the contract say "build on this" and "this is broken" about
        one thing, and the model would reasonably do either.
        """
        overlap = set(self.known_prerequisites) & set(self.weak_subskills)
        if overlap:
            raise ValueError(
                f"{sorted(overlap)} listed as both known prerequisites and weak "
                "subskills; the contract contradicts itself"
            )
        return self
