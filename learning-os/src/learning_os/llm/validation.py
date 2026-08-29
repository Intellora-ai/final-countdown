"""Checking that the model stayed inside the contract.

WITHOUT THIS FILE THE CONTRACT IS A PROMPT
------------------------------------------
Everything in `contract.py` is a constraint the model was ASKED to respect.
Nothing so far establishes that it did. That gap is where the architecture
actually fails in practice: a model that quietly introduces four concepts under a
budget of one produces output that reads perfectly well, ships, and leaves a
learner holding three things they were never taught. Nobody notices, because the
failure looks exactly like success.

So each check here corresponds to a field there, and a contract field with no
check is a bug in one file or the other.

WHY VIOLATIONS ARE RETURNED, NOT RAISED
---------------------------------------
The caller's next move depends on WHICH constraints broke and how many. A missing
technical term is repairable; content that ignores the target skill entirely is
not, and needs regeneration under a changed strategy. An exception collapses that
into one outcome and forces the decision to be re-derived from a message string.
A list of violations lets the runtime choose.

WHAT IS DELIBERATELY NOT CHECKED HERE
-------------------------------------
Whether the explanation is GOOD. That is not checkable by counting, and a scorer
pretending otherwise would produce a number that looks like a measurement and is
not -- the exact failure `Verifiability` exists to prevent elsewhere. Domain
correctness belongs to the verifier; pedagogical quality belongs to outcome
evidence. This file checks only what can be checked mechanically.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum

from learning_os.llm.client import GeneratedContent
from learning_os.llm.contract import InstructionContract


class ViolationKind(StrEnum):
    """What broke. Named so the runtime can branch on it rather than parse text."""

    EMPTY = "empty"
    MISSING_REQUIRED_TERM = "missing_required_term"
    FORBIDDEN_PHRASE = "forbidden_phrase"
    TOO_MANY_CONCEPTS = "too_many_concepts"
    TOO_MANY_BLOCKS = "too_many_blocks"
    UNKNOWN_BLOCK_KIND = "unknown_block_kind"
    STEP_COUNT_LEAKED = "step_count_leaked"


@dataclass(frozen=True, slots=True)
class Violation:
    kind: ViolationKind
    detail: str

    #: Whether regenerating under the SAME contract could plausibly fix this.
    #: A missing term is a rewrite; content that ignored the skill needs a
    #: different strategy, and retrying it unchanged is the "blindly repeat a
    #: failed strategy" behaviour section 46 forbids.
    repairable: bool = True


#: The canvas's twelve block kinds, from `frontend/src/canvas/spec/spec.ts`.
#:
#: Duplicated across a language boundary, which is a real cost and is why it is
#: checked rather than assumed: an unknown kind fails HERE with a clear message
#: instead of at `validateLesson` in the browser, where the engine is no longer
#: in the stack and the payload is all anyone can see.
BLOCK_KINDS = frozenset(
    {
        "prose",
        "callout",
        "metric",
        "equation",
        "table",
        "chart",
        "flow",
        "simulation",
        # The teaching-shape kinds. See `docs/engineering/teaching-patterns.md`.
        #
        # Absent from this set, they were a LIVE BUG rather than a gap: the
        # canvas accepts them, so a model emitting a correction or a derivation
        # would have had its lesson rejected here with "no renderer" -- a
        # message that is false, and that points the reader at the canvas
        # instead of at this list.
        #
        # None of the three is subject-specific. `misconception` is the error a
        # learner actually makes, in any subject; `reasoning` is an ordered
        # chain where every step names what licenses it, which is a proof in
        # mathematics and a causal chain in geography; `summary` is the
        # progression plus the one sentence worth keeping.
        "misconception",
        "summary",
        "reasoning",
        # `figure` reaches the other ~130 named representations through the
        # registry (`spec/figure.ts`). It was missing from the first version of
        # this set, which made the omission WORSE than the three above: a model
        # emitting the single most general block kind was told "no renderer",
        # which is false and points the reader at the canvas instead of here.
        "figure",
    }
)

#: Text telling the learner where they are in a sequence.
#:
#: The rule is that the learner never sees the number of steps -- a count turns
#: an adaptive path into a fixed-length commitment the engine cannot keep, since
#: the next intervention depends on evidence that does not exist yet. Saying
#: "step 2 of 5" is a promise about a decision not yet made.
_STEP_COUNT = re.compile(r"\b(step|part)\s*\d|\b\d+\s*(of|/)\s*\d", re.IGNORECASE)


def validate(contract: InstructionContract, content: GeneratedContent) -> list[Violation]:
    """Every way this generation failed its contract, in one pass.

    All checks run rather than stopping at the first. A caller deciding between
    repair and regeneration needs the full set: one missing term is a rewrite,
    while a missing term AND an ignored budget AND a leaked step count is a
    generation that went somewhere else entirely.
    """
    out: list[Violation] = []
    text = content.text
    lowered = text.lower()

    if not content.blocks:
        # Not repairable: there is nothing to repair. Returning early because
        # every check below would report the vacuous absence of content as its
        # own violation, burying the one fact that matters.
        return [
            Violation(
                ViolationKind.EMPTY,
                "the model returned no blocks",
                repairable=False,
            )
        ]

    for term in contract.required_terms:
        if term.lower() not in lowered:
            out.append(
                Violation(
                    ViolationKind.MISSING_REQUIRED_TERM,
                    f"required term {term!r} does not appear; simplify the path "
                    f"through the knowledge, never the knowledge itself",
                )
            )

    # MATCH THE TELLS, NOT THE RULES.
    #
    # `forbidden_phrases` holds instructions ("Do not say recursion repeats the
    # function"). Matching those against generated prose fires only when the
    # model quotes the rule back, and never when it commits the error -- exactly
    # backwards, and it passed silently for as long as it existed.
    for phrase in contract.forbidden_tells:
        if phrase.lower() in lowered:
            out.append(
                Violation(
                    ViolationKind.FORBIDDEN_PHRASE,
                    f"forbidden simplification {phrase!r} appears; it would leave "
                    f"the learner holding something untrue",
                    # Not repairable by rewording: the model reached for this
                    # because the contract's strategy led it there, so the same
                    # contract will lead it there again.
                    repairable=False,
                )
            )

    # Counted independently of `introduced_concepts`, which is self-reported and
    # is therefore evidence rather than truth. A model that under-reports is
    # precisely the case worth catching, and asking it how many concepts it
    # introduced is asking the thing being checked to do the checking.
    if len(content.introduced_concepts) > contract.simplicity.max_new_concepts:
        out.append(
            Violation(
                ViolationKind.TOO_MANY_CONCEPTS,
                f"{len(content.introduced_concepts)} concepts introduced, budget is "
                f"{contract.simplicity.max_new_concepts}; the learner has been given "
                f"a choice of which to miss",
            )
        )

    if len(content.blocks) > contract.simplicity.max_blocks:
        out.append(
            Violation(
                ViolationKind.TOO_MANY_BLOCKS,
                f"{len(content.blocks)} blocks, budget is {contract.simplicity.max_blocks}",
            )
        )

    for kind, _ in content.blocks:
        if kind not in BLOCK_KINDS:
            out.append(
                Violation(
                    ViolationKind.UNKNOWN_BLOCK_KIND,
                    f"block kind {kind!r} has no renderer; the canvas schema is "
                    f"strict and would refuse the whole lesson",
                    repairable=False,
                )
            )

    match = _STEP_COUNT.search(text)
    if match is not None:
        out.append(
            Violation(
                ViolationKind.STEP_COUNT_LEAKED,
                f"{match.group(0)!r} tells the learner how many steps remain, "
                f"which is a promise about a decision the engine has not made yet",
            )
        )

    return out


def is_usable(violations: list[Violation]) -> bool:
    """Whether this content may reach a learner.

    ANY violation blocks. There is no severity threshold and no composite score,
    because a score invites shipping the 92%: content missing a technical term is
    not 92% correct, it is teaching something incomplete while looking finished.
    """
    return not violations


def is_repairable(violations: list[Violation]) -> bool:
    """Whether retrying under the SAME contract could fix this.

    False means the contract itself has to change -- a different strategy, a
    different representation. Retrying an unrepairable generation unchanged is
    the blind repeat of a failed strategy that section 46 forbids, and it burns
    the learner's time to arrive back where it started.
    """
    return bool(violations) and all(v.repairable for v in violations)
