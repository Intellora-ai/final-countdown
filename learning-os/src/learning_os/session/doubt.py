"""Answering a doubt the lesson itself cannot answer, without losing the lesson.

WHY THIS EXISTS WHEN THE CANVAS ALREADY RESOLVES DOUBTS
-------------------------------------------------------
It does, and deliberately badly on purpose. `frontend/src/canvas/teach/doubt.ts`
answers only from material the author already wrote -- a block, a caption, two
rows of a table, found and re-presented. Its own docstring states the boundary:
a resolver that cannot write a sentence about the subject matter cannot write a
wrong one. So when a doubt names something the lesson does not name, it returns
`null`.

That refusal is correct and it is a dead end. The learner has just admitted
confusion and been told, in effect, that their question is not one this page
answers. Nothing catches them.

This module is the catch. It is NOT a second resolver: it never runs when the
canvas can answer. It runs only after a refusal, and it can answer because the
engine has what the canvas lacks -- a knowledge graph to map the doubt onto, a
policy to choose how to teach it, and a validator that fails fabrication rather
than rendering it.

THE THING THAT MUST NOT BREAK
-----------------------------
The learner was somewhere. Answering must not cost them that place.

Holding position is a TYPE here rather than a discipline: `Doubt` carries
`resume_at`, and `Resolution` carries it back out unchanged, so the caller cannot
resolve a doubt without being handed the way back. A field that must survive a
round trip is safer than a rule that says do not drop it -- the rule is followed
until the day somebody adds an early return.

WHAT IS NEVER DONE HERE
-----------------------
No step counts, no "you have three left", no progress. A doubt is not a detour
through a fixed-length plan, and the learner is never told how many parts remain
-- the next intervention depends on evidence that does not exist yet, so any
count is a promise about a decision nobody has made. The validator enforces this
on generated text; this module simply never produces such a field.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from learning_os.domain.knowledge import KnowledgeGraph
from learning_os.llm.client import LLMClient
from learning_os.llm.contract import (
    MAX_LESSON_QUESTION,
    DiagnosisKind,
    InstructionContract,
    SourceRef,
    Strategy,
)
from learning_os.mastery.estimate import Belief
from learning_os.memory.store import MemoryStore
from learning_os.models.contracts import ActionKind
from learning_os.policy.select import Decision
from learning_os.runtime.loop import Turn, TurnStatus, generate_validated, teach_once


class DoubtOutcome(StrEnum):
    """What became of the learner's question.

    `UNMAPPABLE` is a first-class outcome, not an error. A doubt the engine
    cannot tie to anything it knows is a doubt it must not answer -- and saying
    so plainly is better teaching than a fluent paragraph about something
    adjacent. The canvas already learned this; the engine does not get to
    unlearn it just because it has a language model.
    """

    ANSWERED = "answered"
    #: The doubt named nothing in the knowledge graph. Refused on purpose.
    UNMAPPABLE = "unmappable"
    #: Mapped, but generation could not honour the contract.
    GENERATION_FAILED = "generation_failed"
    #: The model was unreachable. Distinct from failing, because it is retryable.
    UNAVAILABLE = "unavailable"


@dataclass(frozen=True, slots=True)
class Doubt:
    """What the learner asked, and where they were when they asked it.

    `resume_at` is required, not optional. Making it optional would let a caller
    construct a doubt with nowhere to go back to, and the failure would surface
    as a learner losing their place -- long after the construction that caused
    it.
    """

    text: str
    #: The block the learner was looking at. Opaque to this module: it is the
    #: canvas's id, carried and handed back, never parsed.
    resume_at: str
    #: The lesson's target skill, used to prefer a nearby answer over a distant
    #: one when the doubt could plausibly mean either.
    lesson_skill: str = ""


@dataclass(frozen=True, slots=True)
class Resolution:
    """The answer, and the way back.

    `resume_at` is echoed rather than left to the caller's memory. The caller
    already had it, and requiring them to keep it is exactly how a round trip
    loses state -- the value is in the return type so no discipline is needed.
    """

    outcome: DoubtOutcome
    resume_at: str
    turn: Turn | None = None
    #: Present only for UNMAPPABLE. Plain, and about the ENGINE rather than the
    #: learner: "this is not something I can answer here" and never "your
    #: question is unclear".
    refusal: str = ""

    @property
    def answered(self) -> bool:
        return self.outcome is DoubtOutcome.ANSWERED


#: Words too common to identify anything. Overlap on these is coincidence, and a
#: coincidence is what produces a confident answer about the wrong thing -- the
#: failure the canvas resolver names explicitly when it refuses "what does mean
#: mean" against a lesson containing "Mean particle speed".
_NOISE = frozenset(
    {
        "a", "an", "the", "is", "are", "was", "were", "be", "do", "does", "did",
        "of", "to", "in", "on", "at", "for", "with", "by", "from", "as", "it",
        "and", "or", "but", "if", "then", "so", "we", "you", "your", "i", "me",
        "my", "what", "why", "how", "when", "where", "which", "who", "this",
        "that", "these", "those", "can", "could", "would", "should", "will",
        "mean", "means", "meaning", "about", "understand", "get", "know",
    }
)

#: How much of what the LEARNER said has to land on one subskill.
#:
#: MEASURED AGAINST THE DOUBT, NOT AGAINST THE SKILL. THE FIRST VERSION HAD IT
#: THE OTHER WAY AND REFUSED EVERYTHING.
#:
#: Scoring `overlap / len(skill_vocabulary)` asks the learner to recite the
#: skill's name: they type three or four words, a skill name carries five to
#: seven, so half is unreachable for any real question. Every doubt was refused
#: and the tests said so on the first run.
#:
#: The question worth asking is the other one -- of the words the learner chose,
#: how many named this skill. "How do I trace the calls" is two content words and
#: both of them are this skill's; that is a strong match however long the skill's
#: own name happens to be.
MATCH_STRENGTH = 0.5

#: Absolute overlap required regardless of ratio.
#:
#: Without it a one-word doubt scores 1.0 against anything sharing that word, and
#: the ratio measure alone would make short questions MORE confident rather than
#: less. Two words is the difference between naming something and colliding with
#: it -- the canvas resolver's rule, in its words: enough of its words that the
#: match is not a coincidence.
MIN_OVERLAP = 2


def _words(text: str) -> set[str]:
    cleaned = "".join(c if c.isalnum() or c.isspace() else " " for c in text.lower())
    return {w for w in cleaned.split() if w not in _NOISE and len(w) > 2}


def map_to_skill(graph: KnowledgeGraph, doubt: Doubt) -> str | None:
    """Which subskill the learner is actually asking about, or None.

    None is the common case and the safe one. Matching on the SUBSKILL's own
    vocabulary -- its id and its name -- rather than on lesson prose, because
    prose contains the whole subject and would match nearly anything.

    Ties break toward the skill the lesson is already teaching. A doubt raised
    during a lesson about base cases is more likely about base cases than about
    a similarly-worded skill three concepts away, and preferring the near answer
    is both more often right and less confusing when it is wrong.
    """
    asked = _words(doubt.text)
    if not asked:
        return None

    best: tuple[float, str] | None = None
    for concept in graph.concepts:
        for sub in concept.subskills:
            # THE LEAF, NOT THE WHOLE ID. THE ID PADDED THE VOCABULARY.
            #
            # A skill id is `python.recursion.identify_base_case`. The leading
            # segments are how the SUBJECT is filed; no learner types them.
            # Matching on the full id put `python` and `recursion` into every
            # subskill's vocabulary, which inflated the denominator and made
            # the threshold unreachable -- every doubt was refused.
            #
            # I then added an explicit `- prefix` subtraction on top of this,
            # and mutation testing showed it killed zero tests. It removes
            # nothing for any of the eight subskills, because taking the leaf
            # had already excluded the prefix. Two fixes for one bug, and the
            # dead one made the live one look less load-bearing than it is.
            leaf = sub.skill_id.rsplit(".", 1)[-1].replace("_", " ")
            vocab = _words(f"{leaf} {sub.name}")
            if not vocab:
                continue
            hit = asked & vocab
            if len(hit) < MIN_OVERLAP:
                continue
            score = len(hit) / len(asked)
            if score < MATCH_STRENGTH:
                continue
            # Nudge, not override: enough to break a tie, never enough to beat a
            # materially better match elsewhere.
            if sub.skill_id == doubt.lesson_skill:
                score += 0.01
            if best is None or score > best[0]:
                best = (score, sub.skill_id)
    return None if best is None else best[1]


def _grounded(
    client: LLMClient,
    doubt: Doubt,
    search: Callable[[str], tuple[SourceRef, ...]] | None,
    *,
    now: Callable[[], datetime],
) -> Resolution | None:
    """A sourced answer to an unmappable doubt, or None when the refusal stands.

    NOT A SECOND GENERATOR. The content comes from `generate_validated` -- the
    same function `teach_once` answers through -- under a real contract whose
    `sources` field arms the citation rules: the lesson must name one of the
    retrieved URLs and may name no other. What is different here is only the
    AUTHOR of the contract, and `Decision(reasons=())` says so honestly: this
    was not a policy decision, and there are no policy reasons to record.

    Nothing is written to memory. The learner asked about something outside the
    graph; there is no mechanism to burn and no skill to record against.

    `UNAVAILABLE` propagates -- "I could not reach the part of me that writes
    explanations" is true and the learner should hear it -- but a model that
    cannot satisfy the citation rules falls back to None, because the standing
    refusal ("I would rather not guess") is still true and is a better sentence
    than any status report.
    """
    if search is None:
        return None
    try:
        sources = search(doubt.text)
    except Exception:
        sources = ()
    if not sources:
        return None

    contract = InstructionContract(
        # A real id under a reserved prefix no curriculum uses: `graph.concepts`
        # ids are filed under their subject (`python.recursion.*`), so `web.*`
        # cannot collide with a skill a learner is actually studying.
        target_skill="web.grounded_answer",
        question=_shortened(doubt.text),
        # The one honest diagnosis available: the learner lacks the concept and
        # said so by asking. Nothing here inspected their history.
        diagnosis=DiagnosisKind.CONCEPT_GAP,
        strategy=Strategy.GUIDED_REASONING,
        action=ActionKind.TEACH_BY_EXAMPLE,
        sources=sources,
        success_evidence_required=(
            "the learner can restate the answer and name the source it came from"
        ),
    )
    turn = generate_validated(client, Decision(contract=contract, reasons=()), now=now)

    if turn.status is TurnStatus.TAUGHT:
        return Resolution(
            outcome=DoubtOutcome.ANSWERED, resume_at=doubt.resume_at, turn=turn
        )
    if turn.status is TurnStatus.UNAVAILABLE:
        return Resolution(
            outcome=DoubtOutcome.UNAVAILABLE, resume_at=doubt.resume_at, turn=turn
        )
    return None


def _shortened(text: str) -> str:
    """The doubt, short enough for the contract, and never silently cut.

    ``contract.MAX_LESSON_QUESTION`` is a validator, so a longer question is
    rejected rather than trimmed, and every caller has to shorten first. This
    line used to be a bare ``[:200]``, which is the exact defect the constant's
    own docstring describes: a long question was "silently cut to 199 ... and
    echoed back to the learner as a question they had not asked". Raising the
    cap does not help -- the validator is the real ceiling -- so the cut stays
    and stops being silent.

    TWO CHANGES, BOTH VISIBLE TO THE LEARNER. It breaks on a word rather than
    mid-word, so what is shown is a real phrase; and it ends in an ellipsis, so
    the learner can SEE that this is the front of their question rather than the
    whole of it. Their words are never added to, only stopped early and marked.

    Short questions -- which is nearly all of them -- come back untouched.
    """
    said = text.strip()
    if len(said) <= MAX_LESSON_QUESTION:
        return said
    # One character of the budget belongs to the ellipsis that marks the cut.
    room = MAX_LESSON_QUESTION - 1
    cut = said[:room]
    # Back up to the last whole word, unless there is no space to back up to.
    spaced = cut.rsplit(" ", 1)[0]
    kept = spaced if spaced else cut
    return f"{kept.rstrip()}\u2026"


def resolve(
    graph: KnowledgeGraph,
    memory: MemoryStore,
    client: LLMClient,
    doubt: Doubt,
    *,
    now: Callable[[], datetime],
    belief: Belief | None = None,
    search: Callable[[str], tuple[SourceRef, ...]] | None = None,
) -> Resolution:
    """Answer a doubt, or say plainly that it cannot be answered here.

    Runs the ordinary teaching machinery rather than a special doubt path. A
    doubt is a request to teach one thing, and giving it its own generator would
    mean two places where content is produced and only one of them validated --
    which is how the unvalidated one eventually ships.

    So the answer inherits everything: the contract, the atomicity budget, the
    forbidden simplifications, the validator, the memory of what has already
    failed for this learner. A doubt raised twice does not get the same
    explanation twice, and that falls out of `memory` rather than being
    special-cased here.
    """
    skill_id = map_to_skill(graph, doubt)
    if skill_id is None:
        # ONE CHANCE TO BECOME A GROUNDED ANSWER BEFORE THE REFUSAL STANDS.
        #
        # The refusal below was never the principle -- "never guess" is. A
        # question outside the curriculum answered ONLY from retrieved sources,
        # citing them, through the same `generate_validated` every lesson goes
        # through, is not a guess. No search configured, engine unreachable,
        # nothing retrieved, or the model unable to satisfy the citation rules:
        # the refusal stands, in exactly the words it has always used.
        grounded = _grounded(client, doubt, search, now=now)
        if grounded is not None:
            return grounded
        return Resolution(
            outcome=DoubtOutcome.UNMAPPABLE,
            resume_at=doubt.resume_at,
            # About the engine, not the learner. "Your question is unclear" is
            # both unhelpful and slightly insulting to somebody who has just
            # admitted they are lost.
            refusal="That is not something this lesson covers, so I would rather "
            "not guess at it.",
        )

    turn = teach_once(
        graph,
        memory,
        client,
        _DoubtBottleneck(skill_id),
        # CONCEPT_GAP rather than a diagnosis derived from the doubt's wording.
        #
        # Inferring a diagnosis from how a question is phrased is the LLM
        # deciding what is wrong with the learner, which section 77 puts outside
        # its authority. The engine knows only that this skill was asked about;
        # a real diagnosis needs evidence, and asking a question is not evidence
        # of which KIND of gap it is.
        DiagnosisKind.CONCEPT_GAP,
        question=_shortened(doubt.text),
        now=now,
        belief=belief,
    )

    if turn.status is TurnStatus.TAUGHT:
        outcome = DoubtOutcome.ANSWERED
    elif turn.status is TurnStatus.UNAVAILABLE:
        outcome = DoubtOutcome.UNAVAILABLE
    else:
        outcome = DoubtOutcome.GENERATION_FAILED

    return Resolution(outcome=outcome, resume_at=doubt.resume_at, turn=turn)


@dataclass(frozen=True, slots=True)
class _DoubtBottleneck:
    """A `BottleneckLike` for a skill the learner asked about directly.

    `needs_diagnostic=False` on purpose. The learner has just told the engine
    what they are stuck on; answering with a question would be section 28's
    friction failure at its most obvious -- spending the attention that teaching
    needed, to learn something they already said.

    `confidence` is high for the same reason: self-report is weak evidence of
    MASTERY and strong evidence of what somebody wants explained. Those are
    different claims, and conflating them is what makes systems either ignore
    learners or believe them too much.
    """

    skill_id: str
    confidence: float = 0.9
    needs_diagnostic: bool = False
