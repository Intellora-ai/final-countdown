"""What shape a response should take, from two levers that were measured.

WHAT WAS MEASURED, AND ON WHAT
------------------------------
1829 labelled exchanges across 27 transcripts. Not a hand-set threshold in the
file; every number below traces to a run over that corpus, and the ones that
could not be fitted say so rather than carrying a plausible default.

LEVER 1 -- LENGTH, AND ONLY WHERE IT ACTUALLY BITES
---------------------------------------------------
Pooled, a complained-about response is 301 words against 147 for a quiet one --
2.05x. But pooling hides that the effect is not uniform:

    howto     1.94x   (n=774)   length is the problem
    compare   1.46x   (n=171)
    debug     1.17x   (n=216)
    status    0.98x   (n=340)   length is NOT the problem

For a status question the complained-about responses are 42 words and the quiet
ones are 43. Shortening them cannot help, because they are already short. A
budget applied there would be a rule with no effect, which is worse than no rule
because it looks like a fix.

So budgets are carried with the separation quality that produced them, and are
only applied where that quality clears a floor. `MIN_SEPARATION` is the honesty
gate: below it the answer is "length is not the lever here", not a number.

LEVER 2 -- WHERE THE ANSWER SITS, AND ONLY FOR SOME QUESTIONS
--------------------------------------------------------------
Somebody asking "is it merged" wants the word yes. Everything before it reads as
padding however short it is -- which is why the length measure came out flat on
status, and why the two levers are kept separate rather than summed.

The obvious next move was to apply it everywhere. Tested, and REJECTED:

    howto     2.21x   n=774    leading helps -- the strongest effect measured
    status    1.72x   n=342    leading helps
    compare   0.98x   n=171    no effect
    debug     0.41x   n=216    leading HURTS: 53.7% against 22.1%

Shipping it as a universal rule would have made debug answers 2.4x worse. A
verdict word is an ANSWER to "is it merged" and a RESTATEMENT of "why is it
failing" -- the same opening does opposite work depending on the question.

The mechanism for debug is NOT established. Splitting its first sentences into
cause-first versus restatement-first left n=6 and n=8, which decides nothing. So
debug is EXCLUDED on the evidence that the rule correlates with harm there, not
on a story about why. `compare` is excluded for having no measured effect --
a rule that does nothing still costs the reader something.

WHY THIS RETURNS A DECISION AND NOT A SCORE
-------------------------------------------
A scalar on [0,1] would have to be thresholded by somebody later, and that
threshold would be unvalidatable -- the failure this package exists to escape.
`Shape` carries the moves to make and the evidence for each, so a wrong output
can be traced to the measurement that caused it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

from learning_os.form.request import QuestionType, classify, word_count

#: Youden's J below which a fitted budget is not trustworthy enough to apply.
#:
#: J is (share of complained-about responses above the threshold) minus (share of
#: quiet ones above it). At 0 the threshold separates nothing. The floor is set
#: at 0.20 because that is where `status` (0.12) falls out and `debug` (0.20)
#: just survives -- and `status` falling out is the correct answer, confirmed
#: independently by its 0.98x length ratio.
MIN_SEPARATION = 0.20

#: Fitted on 1829 labelled exchanges. Words, per question kind.
#:
#: `number` and `design` are ABSENT rather than estimated: 11 and 17 samples are
#: not enough to fit anything, and a plausible-looking default would be
#: indistinguishable from a measured one to every future reader. The gap is the
#: finding.
FITTED_BUDGET: dict[QuestionType, int] = {
    QuestionType.HOWTO: 280,
    QuestionType.COMPARE: 340,
    QuestionType.DEBUG: 340,
    QuestionType.STATUS: 480,
}

#: Separation quality for each fitted budget, carried so `MIN_SEPARATION` can be
#: applied at use time rather than baked in. Keeping it visible is what lets a
#: later corpus re-fit these and see which ones improved.
SEPARATION: dict[QuestionType, float] = {
    QuestionType.HOWTO: 0.22,
    QuestionType.COMPARE: 0.28,
    QuestionType.DEBUG: 0.20,
    QuestionType.STATUS: 0.12,
}


#: Where leading with the answer was MEASURED to help, with the effect size and
#: sample behind each. Absence is a finding, not an oversight:
#:
#:   debug     0.41x, n=216 -- leading HURTS. Excluded on evidence.
#:   compare   0.98x, n=171 -- no effect. A rule that does nothing still costs.
#:   number    n=11         -- unfittable.
#:   design    n=17         -- unfittable.
LEADS_WITH_ANSWER: dict[QuestionType, tuple[float, int]] = {
    QuestionType.HOWTO: (2.21, 774),
    QuestionType.STATUS: (1.72, 342),
}


class Move(StrEnum):
    """A change to how the response is written. Not a score -- an instruction."""

    #: Put the verdict in the first sentence. Measured 1.97x on status.
    LEAD_WITH_THE_ANSWER = "lead_with_the_answer"
    #: The draft is past the budget fitted for this kind of question.
    CUT_TO_BUDGET = "cut_to_budget"
    #: The user has already asked for less in this conversation.
    THEY_ASKED_FOR_LESS = "they_asked_for_less"
    #: The user has already asked for more in this conversation.
    THEY_ASKED_FOR_MORE = "they_asked_for_more"


@dataclass(frozen=True, slots=True)
class Shape:
    """The moves to make, and why -- never a bare number.

    `reasons` is not decoration. A move with no traceable measurement behind it
    is a hand-set rule wearing evidence's clothes, and telling the two apart
    afterwards is the whole point of fitting anything.
    """

    question_type: QuestionType
    budget: int | None
    moves: tuple[Move, ...] = ()
    reasons: tuple[str, ...] = field(default_factory=tuple)

    @property
    def budget_is_trustworthy(self) -> bool:
        """Whether length is actually the lever for this kind of question."""
        return self.budget is not None


def budget_for(kind: QuestionType) -> int | None:
    """The fitted budget, or None when length is not the lever.

    None has two distinct causes and both are honest answers: not enough samples
    to fit (`number`, `design`), or fitted and found not to separate (`status`).
    Returning a number in either case would be inventing one.
    """
    if kind not in FITTED_BUDGET:
        return None
    if SEPARATION.get(kind, 0.0) < MIN_SEPARATION:
        return None
    return FITTED_BUDGET[kind]


def shape_for(
    turn: str,
    draft: str = "",
    *,
    asked_for_less: int = 0,
    asked_for_more: int = 0,
) -> Shape:
    """What to change about a draft, given what was asked.

    `draft` is optional so the budget can be known BEFORE writing. That ordering
    matters: a budget consulted after the fact only ever produces cuts, and
    cutting a finished answer is how a coherent response becomes a truncated one.

    `asked_for_less` / `asked_for_more` are running counts from this
    conversation's own labels -- the closed loop. They override the fitted
    budget because a person who has just said "just say it" has given evidence
    about this moment that no corpus median can outweigh.
    """
    kind = classify(turn)
    budget = budget_for(kind)
    moves: list[Move] = []
    reasons: list[str] = []

    if kind in LEADS_WITH_ANSWER:
        moves.append(Move.LEAD_WITH_THE_ANSWER)
        effect, n = LEADS_WITH_ANSWER[kind]
        reasons.append(
            f"{kind.value} answers that bury the verdict draw {effect:.2f}x more "
            f"too-long than ones that lead with it (n={n})"
        )

    if budget is not None and draft and word_count(draft) > budget:
        moves.append(Move.CUT_TO_BUDGET)
        reasons.append(
            f"{word_count(draft)} words against a fitted budget of {budget} "
            f"for {kind.value} (separation {SEPARATION[kind]:.2f}, n=1829)"
        )
    elif budget is None:
        reasons.append(
            f"no trustworthy budget for {kind.value}: "
            + (
                "fitted and found not to separate -- length is not the lever here"
                if kind in FITTED_BUDGET
                else "too few labelled samples to fit one"
            )
        )

    # The closed loop. Stated evidence from this conversation outranks the
    # corpus, which is the difference between correcting and predicting.
    if asked_for_less > asked_for_more:
        moves.append(Move.THEY_ASKED_FOR_LESS)
        reasons.append(f"they have asked for less {asked_for_less}x in this conversation")
    elif asked_for_more > asked_for_less:
        moves.append(Move.THEY_ASKED_FOR_MORE)
        reasons.append(f"they have asked for more {asked_for_more}x in this conversation")

    return Shape(
        question_type=kind,
        budget=budget,
        moves=tuple(moves),
        reasons=tuple(reasons),
    )
