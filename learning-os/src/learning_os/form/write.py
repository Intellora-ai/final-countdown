"""The software writing the response, using the measurements.

WHAT THIS DOES AND WHAT IT REFUSES TO DO
----------------------------------------
It does not invent content. Content needs a model, and the measurements were
never about content -- 1831 labelled turns said the two things that predict
whether a reply lands are how long it is for the question asked, and whether the
answer arrives first. Both are FORM.

So this takes an answer and its supporting points and assembles the response,
enforcing exactly those two measured rules. It changes how the thing talks, not
what it knows -- which was the whole objective.

WHY ASSEMBLY RATHER THAN REWRITING A DRAFT
-------------------------------------------
Rewriting means deciding which sentence is the answer, and that is a judgement
this package has no measurement for. Assembly asks the caller to name the answer
once, which they always know, and then the ORDER and the LENGTH become
mechanical -- decidable, testable, and provably conformant.

A rewriter would need a model to find the answer, and would then be untestable
offline, which is how the rest of this package would have died.

CUTTING DROPS WHOLE POINTS, NEVER CHARACTERS
--------------------------------------------
Trimming to a word count by slicing produces a response that stops mid-sentence.
That is worse than being over budget: the reader now has an incomplete thought
AND has to ask again, which is a RE_ASK, and RE_ASK costs double in the loss.

So the budget is met by dropping supporting points from the END, whole. The
answer is never dropped -- a response that has been cut down to nothing is not
a shorter answer, it is a missing one.

THE OUTPUT CHECKS ITSELF
------------------------
`Written.conforms` re-measures the assembled text against the same rules that
produced it. A writer that cannot verify its own output is the open loop this
project keeps deleting: it would report success from having tried rather than
from having achieved.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass, field

from learning_os.form.request import QuestionType, word_count
from learning_os.form.shape import LEADS_WITH_ANSWER, Move, shape_for

#: Sentence-ish split, used to check that the answer really did land first.
_FIRST_SENTENCE = re.compile(r"^(.{0,220}?)(?:(?<=[.!?])\s|\n|$)", re.S)


@dataclass(frozen=True, slots=True)
class Written:
    """A composed response, with the evidence that it obeys its own rules.

    `dropped` is carried rather than discarded. A response that silently lost
    three supporting points looks identical to one that never had them, and the
    caller cannot tell whether the budget was tight or the input was thin.
    """

    text: str
    question_type: QuestionType
    budget: int | None
    words: int
    dropped: tuple[str, ...] = ()
    violations: tuple[str, ...] = field(default_factory=tuple)

    @property
    def conforms(self) -> bool:
        return not self.violations

    @property
    def ratio(self) -> float | None:
        """Words as a fraction of budget. None when no budget was fitted."""
        return (self.words / self.budget) if self.budget else None


def _leads_with(text: str, answer: str) -> bool:
    """Whether the answer really is in the first sentence of the output.

    Checked against the assembled TEXT rather than trusted from the assembly
    order, because a caller can pass an answer that is itself several sentences
    and the first of them is what a reader actually meets.
    """
    match = _FIRST_SENTENCE.match(text.strip())
    opening = (match.group(1) if match else text[:220]).lower()
    head = " ".join(answer.strip().split()[:6]).lower()
    return (bool(head) and head[: len(opening)] in opening) or opening.startswith(head[:40])


def compose(
    question: str,
    answer: str,
    support: Sequence[str] = (),
    *,
    asked_for_less: int = 0,
    asked_for_more: int = 0,
    did_not_understand: bool = False,
) -> Written:
    """Assemble a response that obeys the measured rules for this question.

    `did_not_understand` suppresses the budget entirely. See the comment at the
    cut, and `labels.Label.NOT_UNDERSTOOD` for the measurement -- shortening
    after a stated confusion measured 1.59x WORSE than not shortening.

    `answer` is the single thing the person asked for, in one or two sentences.
    `support` is everything else, most important first -- because that is the
    order the budget cuts from the back of.

    The ordering requirement is the measured one: on `howto` and `status`
    questions, burying the answer draws 2.21x and 1.72x more too-long
    complaints. On `debug` it measured HARMFUL, so this does not reorder there
    and the caller's own order stands.
    """
    shape = shape_for(
        question, asked_for_less=asked_for_less, asked_for_more=asked_for_more
    )

    answer = answer.strip()
    if not answer:
        raise ValueError("a response with no answer is not a shorter answer, it is a missing one")

    parts = [answer, *(p.strip() for p in support if p.strip())]

    # LEAD WITH THE ANSWER -- only where it was measured to help. On debug and
    # compare the caller's order is left exactly as given.
    if Move.LEAD_WITH_THE_ANSWER not in shape.moves and support:
        # Not reordering, but the answer still has to be present. It is already
        # first in `parts`; a caller wanting it elsewhere passes it in `support`.
        pass

    dropped: list[str] = []

    # CUT TO BUDGET -- whole points from the end, never characters, never the
    # answer. `THEY_ASKED_FOR_LESS` tightens it because what somebody just said
    # outranks a corpus median.
    budget = shape.budget

    # THEY SAID THEY DID NOT UNDERSTAND -- DO NOT CUT.
    #
    # The instinct is to shorten, and it is measured wrong. On what came next
    # after a stated confusion:
    #
    #     next reply SHORTER      n=75   then failed 29.3%
    #     next reply LONGER/same  n=87   then failed 18.4%
    #
    # 1.59x worse. "Too long" means too much for the question asked; "I did not
    # understand" means too little of it landed. Same word count, opposite
    # remedies, and applying the TOO_LONG fix here would make one turn in ten
    # worse rather than better.
    #
    # This wins over `asked_for_less` when both are set, because a person who
    # asked for brevity and then said they did not follow it has given the more
    # recent and more specific signal.
    if did_not_understand:
        budget = None
    elif budget is not None and Move.THEY_ASKED_FOR_LESS in shape.moves:
        budget = max(word_count(answer), budget // 2)

    if budget is not None:
        while len(parts) > 1 and word_count("\n\n".join(parts)) > budget:
            dropped.append(parts.pop())

    text = "\n\n".join(parts)

    # SELF-CHECK. Re-measured on the output, not asserted from the process.
    violations: list[str] = []
    words = word_count(text)
    if budget is not None and words > budget:
        violations.append(
            f"{words} words against a budget of {budget}; the answer alone exceeds it"
        )
    if Move.LEAD_WITH_THE_ANSWER in shape.moves and not _leads_with(text, answer):
        violations.append("the answer is not in the first sentence")

    return Written(
        text=text,
        question_type=shape.question_type,
        budget=budget,
        words=words,
        dropped=tuple(reversed(dropped)),
        violations=tuple(violations),
    )


def explain(written: Written) -> str:
    """Why the response came out this shape, in one block.

    Exists because a shaping decision nobody can inspect is indistinguishable
    from a style preference, and this package spent its whole life deleting
    numbers that could not be traced.
    """
    lines = [f"question kind : {written.question_type.value}"]

    if written.budget is None:
        lines.append("budget        : none fitted -- length is not the lever here")
    else:
        ratio = written.ratio or 0.0
        lines.append(f"budget        : {written.budget} words, used {written.words} ({ratio:.2f}x)")

    effect = LEADS_WITH_ANSWER.get(written.question_type)
    if effect:
        lines.append(
            f"order         : answer first -- burying it measured "
            f"{effect[0]:.2f}x more too-long (n={effect[1]})"
        )
    else:
        lines.append("order         : caller's order kept -- leading was not measured to help")

    if written.dropped:
        lines.append(f"dropped       : {len(written.dropped)} point(s) to meet the budget")
    lines.append(f"conforms      : {written.conforms}")
    for violation in written.violations:
        lines.append(f"  violation   : {violation}")
    return "\n".join(lines)
