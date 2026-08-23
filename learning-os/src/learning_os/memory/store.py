"""Memory: the event log, what has already been tried, and what to retrieve.

MEMORY IS NOT CHAT HISTORY
--------------------------
Chat history answers "what was said". This has to answer "what has already been
tried on this learner, and did it work" -- because the failure it exists to
prevent is the tutor producing a superficially different version of an
explanation that already failed. Rewording is not a new strategy, and a system
that cannot tell those apart will reword forever while appearing to adapt.

MEMORY IS ACTIONABLE OR IT IS NOT STORED
----------------------------------------
Invariant 4. Every retrieval method here exists because some decision reads it:
`failed_strategies` feeds the fallback engine, `succeeded_with` feeds
representation choice, `attempts_on` feeds the novelty check. Nothing is kept
because it might be interesting later -- an unbounded log that nobody reads is
just cost, and it makes the retrievals that DO matter slower to find.

RETRIEVAL IS SCOPED, NOT WHOLESALE
----------------------------------
The whole history never goes into a decision. It cannot: it grows without limit,
and a decision context that grows without limit stops fitting and starts being
silently truncated somewhere nobody chose. So retrieval takes a skill and
returns what bears on THAT skill.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field
from enum import StrEnum

from learning_os.models.contracts import (
    ActionKind,
    DecisionEvent,
    Event,
    Evidence,
)


class Outcome(StrEnum):
    """How an attempt turned out.

    `PARTIAL` is not decoration. Collapsing it into success loses the case the
    fallback engine most needs -- a strategy that moved the learner but not far
    enough is worth varying, not abandoning, and treating it as failure throws
    away the only approach that has shown any traction.
    """

    SUCCESS = "success"
    PARTIAL = "partial"
    FAILURE = "failure"


@dataclass(frozen=True, slots=True)
class Attempt:
    """One teaching attempt, and what became of it.

    This is the record that makes "we already tried that" answerable. Without
    the representation and the mechanism stored beside the outcome, the system
    knows only that something failed, not what to avoid.
    """

    skill_id: str
    action: ActionKind
    representation: str
    outcome: Outcome
    #: The instructional MECHANISM, not the wording. Two attempts that differ
    #: only in phrasing share this, which is what lets the novelty check see
    #: through a reworded repeat.
    mechanism: str
    evidence_ids: tuple[str, ...] = ()
    example_signature: str = ""


# Words that carry no instructional signal. Kept small and explicit rather than
# pulled from a stopword corpus: the list is auditable, and a surprising novelty
# verdict can be traced to a specific word rather than to a dependency.
_NOISE = frozenset(
    [
    "a", "an", "the", "this", "that", "these", "those", "is", "are", "was", "were", "be",
    "been", "being", "do", "does", "did", "of", "to", "in", "on", "at", "for", "with", "by",
    "from", "as", "it", "its", "and", "or", "but", "if", "then", "so", "we", "you", "your",
    "i", "me", "my", "let", "lets", "us", "here", "there", "now", "just", "also", "very",
    "really", "quite", "about", "into", "over", "under", "again", "more", "most", "some",
    "any", "each", "every", "no", "not", "can", "could", "would", "should", "will", "shall",
    "may", "might", "must", "have", "has", "had",
    ]
)

_WORD = re.compile(r"[a-z0-9']+")


def _content_words(text: str) -> list[str]:
    return [w for w in _WORD.findall(text.lower()) if w not in _NOISE and len(w) > 1]


def similarity(left: str, right: str) -> float:
    """Overlap of content words, 0.0 to 1.0.

    DELIBERATELY NOT AN EMBEDDING.

    An embedding would score this better and would also make the suite need a
    model, which the offline rule forbids and which would make a novelty verdict
    impossible to explain -- "the model said 0.83" is not a reason. This is
    explainable in one sentence and traceable to specific shared words, and the
    thing it must catch is the common case: the same explanation reworded.

    Its weakness is real and worth stating: it cannot see that two texts share a
    mechanism while using different vocabulary. That case is covered by
    `Attempt.mechanism`, which is recorded rather than inferred -- so the weak
    text measure never has to carry the load alone.
    """
    a, b = _content_words(left), _content_words(right)
    if not a or not b:
        return 0.0
    ca, cb = Counter(a), Counter(b)
    shared = sum((ca & cb).values())
    return (2.0 * shared) / (len(a) + len(b))


#: Above this, two texts are treated as the same explanation reworded.
#:
#: Calibrated against the failure on each side. Lower and genuinely different
#: examples on one subject collide -- two recursion explanations share
#: "recursive", "call", "base", "case" whatever they say, so a low bar makes the
#: engine refuse to teach the concept twice. Higher and swapping half a dozen
#: words counts as a new idea, which is the exact loophole this is here to shut.
SAME_EXPLANATION = 0.6


@dataclass(slots=True)
class MemoryStore:
    """The append-only log, plus the indexes that make it answerable.

    Append-only is load-bearing rather than stylistic: `DecisionEvent` records
    the state versions a decision saw, and replaying it means reading the log as
    it was. A log that can be edited afterwards records the present, not the
    past, and the replay is then a re-decision with hindsight.
    """

    events: list[Event] = field(default_factory=list)
    decisions: list[DecisionEvent] = field(default_factory=list)
    evidence: list[Evidence] = field(default_factory=list)
    attempts: list[Attempt] = field(default_factory=list)

    # -- writing ----------------------------------------------------------

    def record_event(self, event: Event) -> None:
        self.events.append(event)

    def record_decision(self, decision: DecisionEvent) -> None:
        self.decisions.append(decision)

    def record_evidence(self, evidence: Evidence) -> None:
        self.evidence.append(evidence)

    def record_attempt(self, attempt: Attempt) -> None:
        self.attempts.append(attempt)

    # -- reading, all of it scoped to a skill -----------------------------

    def attempts_on(self, skill_id: str) -> tuple[Attempt, ...]:
        return tuple(a for a in self.attempts if a.skill_id == skill_id)

    def failed_strategies(self, skill_id: str) -> frozenset[ActionKind]:
        """Actions that have failed here and have never succeeded.

        The "never succeeded" half matters. An action that failed once and
        worked twice is not a failed strategy -- it is a strategy, and banning
        it on a single bad outcome would throw away the approach that mostly
        works for this learner.
        """
        failed = {a.action for a in self.attempts_on(skill_id) if a.outcome is Outcome.FAILURE}
        worked = {
            a.action
            for a in self.attempts_on(skill_id)
            if a.outcome in (Outcome.SUCCESS, Outcome.PARTIAL)
        }
        return frozenset(failed - worked)

    def succeeded_with(self, skill_id: str) -> frozenset[str]:
        """Representations that have worked here.

        Read by the policy layer as a preference, never as a rule. "It worked
        before" is a reason to consider something, not a reason to stop
        considering anything else -- a system that always repeats its last
        success stops adapting the moment it finds one.
        """
        return frozenset(
            a.representation
            for a in self.attempts_on(skill_id)
            if a.outcome is Outcome.SUCCESS
        )

    def representations_tried(self, skill_id: str) -> frozenset[str]:
        return frozenset(a.representation for a in self.attempts_on(skill_id))

    def attempt_count(self, skill_id: str) -> int:
        return len(self.attempts_on(skill_id))

    def evidence_for(self, skill_id: str) -> tuple[Evidence, ...]:
        return tuple(e for e in self.evidence if e.skill_id == skill_id)

    # -- novelty ----------------------------------------------------------

    def is_repeat(
        self,
        skill_id: str,
        *,
        mechanism: str,
        text: str = "",
        example_signature: str = "",
    ) -> bool:
        """Whether this has effectively been tried here before.

        Three checks, because a repeat can hide in three places and any one
        check alone leaves an obvious way through:

          mechanism  -- the same instructional move in different words
          example    -- the same example dressed differently
          text       -- the same wording

        The spec's requirement is that "same idea + different wording" counts
        internally as the same approach. Text similarity alone would miss a
        rewrite; mechanism alone would miss reusing one worn-out example inside
        a genuinely new approach.

        Only FAILED and PARTIAL attempts block. Repeating something that
        SUCCEEDED is often exactly right -- retrieval practice is repetition on
        purpose -- so treating success as a repeat would forbid the one thing
        that is known to work.
        """
        for past in self.attempts_on(skill_id):
            if past.outcome is Outcome.SUCCESS:
                continue
            if mechanism and past.mechanism == mechanism:
                return True
            if example_signature and past.example_signature == example_signature:
                return True
            if (
                text
                and past.example_signature
                and similarity(text, past.example_signature) >= SAME_EXPLANATION
            ):
                return True
        return False

    # -- retrieval --------------------------------------------------------

    def relevant(self, skill_id: str, *, limit: int = 8) -> tuple[Attempt, ...]:
        """The attempts most likely to change the next decision.

        Ordered by how much they constrain it, not by recency. A failure is the
        most decision-changing thing in the log -- it removes an option -- so
        failures come first, then partials, then successes. Recency breaks ties
        within a band.

        `limit` exists because a decision context that grows without bound
        eventually gets truncated by something that did not choose what to drop.
        Choosing here means the thing dropped is the least relevant, rather than
        whatever happened to be last.
        """
        rank = {Outcome.FAILURE: 0, Outcome.PARTIAL: 1, Outcome.SUCCESS: 2}
        scored = sorted(
            enumerate(self.attempts_on(skill_id)),
            key=lambda pair: (rank[pair[1].outcome], -pair[0]),
        )
        return tuple(attempt for _, attempt in scored[:limit])
