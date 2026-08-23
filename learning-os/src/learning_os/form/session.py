"""One conversation, remembered — so turn 40 is shaped by turns 1 through 39.

THE GAP THIS CLOSES
-------------------
`compose` takes `asked_for_less`, `asked_for_more` and `did_not_understand` as
parameters, and NOTHING computed them. Every function in this package was
per-call: it could shape one reply perfectly and had no idea a reply had ever
been sent before.

So the closed loop was not closed. A person could say "shorter" three times and
the fourth reply would be built to the corpus median, because the three
complaints existed only in the transcript and never reached the writer.

WHAT IT DOES NOT CLAIM
----------------------
It does not detect hallucination. The labels here measure whether a reply
LANDED -- too long, not understood, asked again -- and none of them can tell a
true statement from a false one. A confident wrong answer that the reader
accepts is scored ACCEPT, correctly by this instrument and wrongly by any
standard that matters.

Saying so plainly because the request that produced this file asked for long
sessions "without hallucinations", and half of that is out of reach. Detecting a
false claim needs a verifier for the domain, which is what `verifiers/` is for
and why the engine has one for Python. Form has no equivalent and should not
pretend to.

WHY THE SIGNALS DECAY
---------------------
A complaint from thirty turns ago is not evidence about this turn. Without decay
one early "shorter" pins every later reply to half budget, including the design
question where no budget was fitted at all -- and the person then has to fight
their own past instruction.

`HALF_LIFE` is set from the session structure rather than picked: sessions in
the corpus run 20 to 200 turns, and a signal that survives a quarter of a
typical session is long enough to be respected and short enough to be escapable.
It is a hypothesis, marked as one, and it is the kind that a later corpus can
settle by measuring how long a stated preference actually persists.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from learning_os.form.labels import Label, label_turn, loss
from learning_os.form.write import Written, compose

#: Turns after which a signal counts half. See the module docstring -- a
#: hypothesis from session length, not a measurement.
HALF_LIFE = 8.0

#: Below this weight a signal is dropped entirely rather than carried as noise.
FORGOTTEN = 0.15


@dataclass(frozen=True, slots=True)
class Turn:
    """One exchange, and what the next turn revealed about it.

    `label` is None until the person replies. That is not a placeholder -- a
    turn whose outcome is unknown is genuinely different from one that went
    fine, and collapsing them would count every unanswered reply as a success.
    """

    question: str
    response: str
    label: Label | None = None


@dataclass(slots=True)
class Session:
    """A conversation that remembers what already went wrong in it.

    THE SIGNALS ARE DERIVED, NEVER SET BY A CALLER.

    `asked_for_less` used to be a number the caller passed in, which meant it
    was whatever the caller believed rather than what the person said. Here it
    is computed from labels harvested off their actual replies, so it cannot
    drift from the transcript.
    """

    turns: list[Turn] = field(default_factory=list)

    def hear(self, user_turn: str) -> Label:
        """Record what the person said, and label the reply it was reacting to.

        Returns the label so a caller can act on it immediately -- the whole
        point of a closed loop is that the correction happens on the NEXT turn,
        not in a report afterwards.
        """
        previous = self.turns[-1].question if self.turns else None
        label = label_turn(user_turn, previous)
        if self.turns:
            self.turns[-1] = Turn(
                question=self.turns[-1].question,
                response=self.turns[-1].response,
                label=label,
            )
        return label

    def _weight(self, label: Label) -> float:
        """How much a past signal still counts, by how long ago it was.

        Walks backwards so the most recent occurrence dominates. Exponential
        rather than a fixed window because a window has a cliff -- a complaint
        nine turns ago counting zero while one eight turns ago counts fully is
        an artefact nobody can justify to the person on the other side.
        """
        total = 0.0
        for age, turn in enumerate(reversed(self.turns)):
            if turn.label is not label:
                continue
            weight = 0.5 ** (age / HALF_LIFE)
            if weight < FORGOTTEN:
                break
            total += weight
        return total

    @property
    def asked_for_less(self) -> int:
        return round(self._weight(Label.TOO_LONG))

    @property
    def asked_for_more(self) -> int:
        return round(self._weight(Label.TOO_SHORT))

    @property
    def just_said_they_did_not_understand(self) -> bool:
        """ONLY the immediately previous turn counts.

        Deliberately not decayed. "I did not understand" is about the reply that
        just arrived, and carrying it forward would suppress the budget for the
        rest of the conversation on the strength of one moment -- turning a
        correction into a permanent setting.
        """
        return bool(self.turns) and self.turns[-1].label is Label.NOT_UNDERSTOOD

    @property
    def loss(self) -> float:
        """What this conversation has cost so far. Lower is better."""
        return loss([t.label for t in self.turns if t.label is not None])

    @property
    def failure_rate(self) -> float:
        judged = [t.label for t in self.turns if t.label is not None]
        if not judged:
            return 0.0
        bad = (Label.TOO_LONG, Label.TOO_SHORT, Label.RE_ASK, Label.NOT_UNDERSTOOD)
        return sum(1 for x in judged if x in bad) / len(judged)

    def reply(self, question: str, answer: str, support: list[str] | None = None) -> Written:
        """Compose the next reply, shaped by everything that has happened.

        This is the join the package was missing. `compose` knew how to obey the
        signals and had no way to learn them; `Session` harvests them and has no
        opinion about shape. Neither is useful alone.
        """
        written = compose(
            question,
            answer,
            support or [],
            asked_for_less=self.asked_for_less,
            asked_for_more=self.asked_for_more,
            did_not_understand=self.just_said_they_did_not_understand,
        )
        self.turns.append(Turn(question=question, response=written.text))
        return written
