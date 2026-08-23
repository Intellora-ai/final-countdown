"""The request axis: what was asked for, not what it is about.

THE FEATURE THE OLD SPEC HAD NONE OF
------------------------------------
Sixty variables, every one describing the CONCEPT. Not one describing the
REQUEST. So the same question about the same idea got the same shape whether
somebody wanted a number or a design, and length failures were unexplainable
because the thing that explains them was not measured.

Two turns from a real session, four apart, same person:

    "EXPLAIN SIMPLFY"        ->  too long
    "write a proper long msg" ->  too short

No static profile produces both. "This user prefers concise" is wrong half the
time by construction. What separates them is not the user and not the topic --
it is what each turn asked for.

WHY THIS IS KEYWORDS AND NOT A MODEL
------------------------------------
A classifier that needs an inference call cannot be run over a whole corpus, and
one that cannot be run over the corpus produces no fitted budgets. This runs on
2000 turns in under a second, offline, and every decision it makes can be traced
to the phrase that caused it. When it is wrong you can see why, which is not
true of a decimal returned by a model.

It is a floor, not a ceiling. When there are enough labelled turns, fit it. The
point of shipping the cheap version is that the fitting data does not exist
until something is labelling turns.

BUDGETS ARE FITTED, NOT DECLARED
--------------------------------
`budget` returns a word count per kind, and those numbers are the one part of
this file that must come from evidence rather than judgement -- they are
measured in `fit_budgets` against turns the user actually complained about.
Hand-set budgets would be twenty more unvalidatable thresholds, which is the
failure this whole package exists to escape.
"""

from __future__ import annotations

import re
from enum import StrEnum

_PUNCT = re.compile(r"[^a-z0-9\s'?]+")
_WORD = re.compile(r"[A-Za-z0-9']+")


class QuestionType(StrEnum):
    """What the turn is asking for. Six kinds, because six is what the
    transcripts distinguish -- more would be unfittable at this corpus size and
    fewer would merge kinds with genuinely different budgets."""

    #: "is it done", "did it work", "what's the status"
    STATUS = "status"
    #: "how many", "how long", "what's the count"
    NUMBER = "number"
    #: "how should we", "what's the best way", "design X"
    DESIGN = "design"
    #: "why is this failing", "it's broken", "fix it"
    DEBUG = "debug"
    #: "X vs Y", "which is better", "difference between"
    COMPARE = "compare"
    #: "how do I", "explain X", "what is X"
    HOWTO = "howto"


#: Checked in this order. Earlier kinds win, and the order encodes which reading
#: is more actionable when a turn is genuinely both -- "is the build fixed" is
#: STATUS before DEBUG, because the answer wanted is yes or no.
_MARKERS: tuple[tuple[QuestionType, tuple[str, ...]], ...] = (
    (QuestionType.STATUS, (
        "status", "is it done", "did it work", "are we", "is it ready",
        "what's left", "whats left", "where are we", "is it green",
        "did it pass", "is it merged", "any update", "done yet",
    )),
    (QuestionType.NUMBER, (
        "how many", "how much", "how long", "what percent", "what's the count",
        "how fast", "how big", "count of",
    )),
    (QuestionType.COMPARE, (
        " vs ", " versus ", "difference between", "which is better",
        "compare", "better than", "instead of",
    )),
    (QuestionType.DEBUG, (
        "why is", "why does", "why did", "not working", "broken", "failing",
        "error", "bug", "crash", "fix it", "what went wrong", "doesn't work",
        "isn't working", "red", "failed",
    )),
    (QuestionType.DESIGN, (
        "how should", "what's the best way", "design", "architect", "approach",
        "should we", "plan for", "structure", "strategy", "what would you",
        "options", "trade-off", "tradeoff",
    )),
    (QuestionType.HOWTO, (
        "how do i", "how to", "explain", "what is", "what are", "teach me",
        "walk me through", "show me", "tell me about", "what does",
    )),
)

#: When nothing matches. HOWTO rather than a seventh "unknown" kind, because a
#: budget must be returned either way and an unknown kind would need its own
#: fitted budget from turns that share nothing but being unmatched.
DEFAULT = QuestionType.HOWTO

# A MEASURED GAP, LEFT OPEN ON PURPOSE.
#
# Yes/no-shaped turns -- "is it mergeable", "did you check the logs" -- read as
# status questions and mostly are not caught: 22 of 1829 turns, 1.2%.
#
# It stays uncaught because a blanket `^(is|are|did|can)\b.*\?` rule would
# also swallow "can u make same practice area on here", which is a REQUEST and
# wants the opposite treatment. Measured over the corpus, such a rule misroutes
# about as many turns as it fixes.
#
# So the gap is recorded rather than patched. Adding a rule that is wrong half
# the time to recover 1.2% is the hand-tuning this package was built to escape,
# and it would be indistinguishable from a fitted rule to the next reader.


def classify(turn: str) -> QuestionType:
    """Which kind of answer this turn is asking for."""
    text = _PUNCT.sub(" ", turn.lower())
    text = f" {' '.join(text.split())} "
    for kind, markers in _MARKERS:
        if any(marker in text for marker in markers):
            return kind
    return DEFAULT


def word_count(text: str) -> int:
    """Words, counted the same way everywhere in this package.

    Named rather than inlined so `length_ratio` and `fit_budgets` cannot come to
    disagree about what a word is -- which would make a fitted budget wrong by a
    constant factor nobody could find.
    """
    return len(_WORD.findall(text))


#: Provisional budgets, in words, superseded by `fit_budgets` on real labels.
#:
#: THESE ARE A PLACEHOLDER AND ARE MARKED AS ONE. They exist so `length_ratio`
#: has something to divide by before a corpus is labelled, and every one of them
#: should be replaced by a measured value. Shipping them as if they were
#: findings would be the exact error this package was built to escape.
PROVISIONAL_BUDGET: dict[QuestionType, int] = {
    QuestionType.STATUS: 120,
    QuestionType.NUMBER: 80,
    QuestionType.COMPARE: 400,
    QuestionType.DEBUG: 500,
    QuestionType.DESIGN: 1200,
    QuestionType.HOWTO: 600,
}


def length_ratio(response: str, turn: str, budget: dict[QuestionType, int] | None = None) -> float:
    """How far the response ran past what this kind of question wanted.

    1.0 is on budget. Above 1.0 is long for the kind of thing being asked, which
    is the only sense in which "too long" is decidable -- a 900-word answer is
    excellent for a design question and a failure for "is it merged".
    """
    table = budget if budget is not None else PROVISIONAL_BUDGET
    allowed = table.get(classify(turn), DEFAULT and table[DEFAULT])
    return word_count(response) / allowed if allowed else 0.0
