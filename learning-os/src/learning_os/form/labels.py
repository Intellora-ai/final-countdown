"""The loss function. Nothing else in this package means anything without it.

WHY THIS FILE COMES FIRST
-------------------------
The engine already measures the CONCEPT: causal depth, component count,
branching, prerequisites. Every one of those is a property of the idea being
explained, and not one of them can tell you whether the explanation landed.

So there was no way to be wrong. Thresholds were hand-set, weights were
unfittable, and a good version was indistinguishable from a bad one. An
instrument with no calibration standard.

A label fixes that, and the labels are already sitting in the transcripts. When
somebody replies "just say it", the previous response was too long -- not
predicted to be, MEASURED to be, by the only judge that counts. When they repeat
their question, the answer failed. When they run the command, it worked.

FEATURES DESCRIBE THE INPUT. LABELS DESCRIBE THE OUTCOME.
---------------------------------------------------------
Three of the terms the old spec tried to COMPUTE are labels wearing a feature's
clothes, and that mistake is what made them uncomputable:

    Confusing   ->  the next turn re-asks              RE_ASK
    Short/Long  ->  the next turn asks for more/less   TOO_SHORT / TOO_LONG
    Useful      ->  the next turn acts on it           ACT

None can be known before the response exists. All are free afterwards. Trying to
predict them from properties of the concept is what produced sixty metrics and
no accuracy.

WHAT THIS DELIBERATELY DOES NOT DO
----------------------------------
No model call, no embedding, no network. `similarity` is content-word overlap
that already lives in `memory.store` -- reused rather than rebuilt, because a
second copy of a text measure drifts from the first and this project has had to
delete exactly that duplication once already.

The cost matters: a labeller expensive enough to need an inference call per turn
cannot be run over a whole corpus, and a labeller that cannot be run over the
whole corpus produces no loss.
"""

from __future__ import annotations

import re
from enum import StrEnum

from learning_os.memory.store import similarity

#: Above this, two consecutive user turns are the same question asked again.
#:
#: Calibrated on the failure at each end rather than picked. Lower and a
#: follow-up on the same topic reads as a repeat, so ordinary conversation
#: scores as failure. Higher and a genuine re-ask survives any rewording, which
#: is exactly how a frustrated person repeats themselves.
SAME_QUESTION = 0.62

#: Below this many characters, a turn is too short for phrase matching to mean
#: anything. "ok" contains no signal about length; it is an acceptance.
TERSE = 24


class Label(StrEnum):
    """What the next turn revealed about the previous response.

    Ordered by what they cost. `RE_ASK` is the expensive one -- the answer did
    not land and the whole exchange is spent again -- which is why the loss
    weights it double.
    """

    #: Asked for less. The response was longer than the moment wanted.
    TOO_LONG = "too_long"
    #: Asked for more. The response was thinner than the moment wanted.
    TOO_SHORT = "too_short"
    #: Asked the same thing again. A CONTENT failure, not a form one.
    RE_ASK = "re_ask"

    #: Said outright that it did not land -- "I did not understand", "still
    #: confused", "that made no sense".
    #:
    #: SEPARATE FROM RE_ASK BECAUSE THE REMEDY IS OPPOSITE TO TOO_LONG.
    #:
    #: This was scored NEUTRAL until somebody asked what happens when a reader
    #: says they did not understand. 163 turns in the corpus, 10.4%, every one
    #: invisible -- the plainest statement of failure in the language, filed as
    #: "carried on with something else".
    #:
    #: It missed because RE_ASK was defined as textual similarity to the
    #: previous turn, copied from the spec. Repeating the question is one way to
    #: signal this. Saying so directly is the other, and it is commoner.
    #:
    #: And the obvious fix is wrong. Measured on what came NEXT after a stated
    #: confusion:
    #:
    #:     next reply SHORTER      n=75   then failed 29.3%
    #:     next reply LONGER/same  n=87   then failed 18.4%
    #:
    #: Cutting is 1.59x worse. TOO_LONG means "too much for what I asked";
    #: this means "too little of it landed". Treating them alike would apply
    #: the wrong remedy to one in ten turns.
    NOT_UNDERSTOOD = "not_understood"
    #: Acknowledged and moved on. Weak positive: nothing was wrong.
    ACCEPT = "accept"
    #: Acted on it -- ran it, shipped it, told it to proceed. Strongest signal
    #: available without instrumenting the user's editor.
    ACT = "act"
    #: Carried on with something else. Says nothing either way, and saying
    #: nothing is a real outcome that must not be forced into one of the above.
    NEUTRAL = "neutral"


_PUNCT = re.compile(r"[^a-z0-9\s']+")


def _normalise(text: str) -> str:
    """Lowercase, punctuation to spaces, whitespace collapsed.

    Collapsing is not cosmetic. Without it "tl;dr" normalises to "tl dr" with a
    double space while the stored phrase keeps a single one, so a phrase that is
    present never matches.
    """
    return " ".join(_PUNCT.sub(" ", text.lower()).split())


def _normalised(phrases: tuple[str, ...]) -> tuple[str, ...]:
    """Put the phrase lists through the SAME normaliser as the input.

    THE BUG THIS FIXES RAN IN BOTH DIRECTIONS.

    Phrases were written the way a person types them -- "tl;dr", "thenfine." --
    and matched against text whose punctuation had already been stripped. So the
    two entries most obviously lifted from real transcripts were the two that
    could never fire.

    Normalising the tables at import means the lists and the input cannot drift
    apart, and a phrase can be written however it is really typed.
    """
    return tuple(_normalise(p) for p in phrases)


#: Phrases that ask for less. Drawn from real transcripts rather than imagined:
#: every one of these appears in this project's own history.
_ASKS_FOR_LESS = _normalised((
    "just say", "just tell me", "simplify", "simplfy", "tl;dr", "tldr",
    "shorter", "too long", "be brief", "in short", "summarise", "summarize",
    "cut it", "less words", "one line", "briefly", "keep it short",
))

#: Phrases that ask for more.
_ASKS_FOR_MORE = _normalised((
    "more detail", "elaborate", "expand", "in depth", "in-depth",
    "write everything", "proper long", "long msg", "long message",
    "explain fully", "full detail", "tell me everything", "go deeper",
    "more info", "not enough",
))

#: Said outright that it did not land. Matched before similarity, because
#: "I still do not understand X" is both a restatement and a plain statement,
#: and the plain reading is the one with a measured remedy.
_NOT_UNDERSTOOD = _normalised((
    "did not understand", "didnt understand", "did nt understand",
    "dont understand", "do not understand", "don t understand",
    "dont get it", "do not get it", "not getting it",
    "still confused", "im confused", "i am confused", "confused",
    "makes no sense", "made no sense", "no sense",
    "not clear", "unclear", "lost me", "went over my head",
))

#: Turns that close a topic without judging the response.
_ACCEPTS = frozenset(_normalised((
    "ok", "okay", "k", "fine", "thenfine.", "then fine", "got it", "noted",
    "sure", "right", "yes", "yeah", "yep", "understood", "makes sense",
    "thanks", "thank you", "ty", "cool", "nice", "good",
)))

#: Imperatives that mean the user took the proposal and ran with it. The
#: strongest positive obtainable from text alone -- they are not praising the
#: response, they are spending their own time on it.
_ACTS = _normalised((
    "merge", "ship it", "do it", "go ahead", "proceed", "run it", "deploy",
    "push it", "commit it", "yes do", "make it", "build it", "continue",
    "approved", "lgtm", "send it", "apply it",
))

def label_turn(next_turn: str, previous_user_turn: str | None = None) -> Label:
    """What the next user turn says about the response before it.

    ORDER IS THE DESIGN. Explicit length complaints are checked before
    similarity, because "explain simply" is BOTH a re-ask and a length
    complaint, and the length reading is the actionable one -- the content was
    understood well enough to be judged too long.

    `RE_ASK` is checked before `ACT` and `ACCEPT` for the opposite reason:
    a repeat that happens to contain "do it" is still a repeat.
    """
    text = _normalise(next_turn)
    if not text:
        return Label.NEUTRAL

    if any(phrase in text for phrase in _ASKS_FOR_LESS):
        return Label.TOO_LONG
    if any(phrase in text for phrase in _ASKS_FOR_MORE):
        return Label.TOO_SHORT

    if any(phrase in text for phrase in _NOT_UNDERSTOOD):
        return Label.NOT_UNDERSTOOD

    if previous_user_turn and similarity(next_turn, previous_user_turn) >= SAME_QUESTION:
        return Label.RE_ASK

    # Acceptance is an EXACT match against a short list, never a substring.
    # "ok" as a substring appears inside "okay but that broke everything",
    # which is not an acceptance and would be scored as one.
    if text in _ACCEPTS:
        return Label.ACCEPT

    if len(text) < TERSE and any(text.startswith(verb) for verb in _ACTS):
        return Label.ACT
    if any(text.startswith(verb) for verb in _ACTS):
        return Label.ACT

    return Label.NEUTRAL


#: What each label costs, from the spec's loss:
#:
#:     loss = 1(TOO_LONG) + 1(TOO_SHORT) + 2(RE_ASK) - 1(ACT)
#:
#: `RE_ASK` is double because a form miss wastes part of a turn and a content
#: miss wastes the whole exchange -- the user pays for the question twice.
#: `ACT` is negative because it is the only evidence that the response did work
#: rather than merely avoiding complaint, and a loss that can only be reduced by
#: silence is minimised by saying nothing.
COST: dict[Label, float] = {
    Label.TOO_LONG: 1.0,
    Label.TOO_SHORT: 1.0,
    Label.RE_ASK: 2.0,
    # Same cost as RE_ASK: both mean the content failed and the exchange is
    # spent again. The DIFFERENCE between them is the remedy, not the price.
    Label.NOT_UNDERSTOOD: 2.0,
    Label.ACT: -1.0,
    Label.ACCEPT: 0.0,
    Label.NEUTRAL: 0.0,
}


def loss(labels: list[Label]) -> float:
    """Total cost of a run of responses. Lower is better; negative is good.

    A single number that a fitted model can be scored against -- which is the
    entire thing the sixty-metric version was missing. It does not say a
    response was good. It says what it cost.
    """
    return sum(COST[label] for label in labels)


def failure_rate(labels: list[Label]) -> float:
    """Share of responses that missed, by the user's own reaction.

    `ACCEPT` and `NEUTRAL` are not failures and not successes. Counting them
    either way is how a metric ends up reporting whatever the conversation's
    chattiness happens to be.
    """
    if not labels:
        return 0.0
    missed = sum(
        1
        for x in labels
        if x in (Label.TOO_LONG, Label.TOO_SHORT, Label.RE_ASK, Label.NOT_UNDERSTOOD)
    )
    return missed / len(labels)
