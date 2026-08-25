#!/usr/bin/env python3
"""PLAIN-FIRST GATE — refuse an explanation that cannot be used on first reading.

THE RULE
--------
A learner cannot hang a name on nothing. The plain idea comes first, in words
they already have, and only then does the term arrive.

WHY A WORD LIST IS NOT ENOUGH
-----------------------------
There are two ways to break the rule, and only one of them involves jargon.

  TECHNICAL FIRST   "A fraction is a part of a whole."
                    The term lands before anything it could attach to.

  CLEVER FIRST      "It is not a division sum waiting to happen.
                    It is a count of parts you already made."
                    Every word is ordinary. It still fails, because the reader
                    must DECODE it before they can act on it.

Both sentences above are real. They were written in a session on 2026-08-25 by
an assistant that had, in the same reply, finished writing the rule against
writing that way. That is the whole argument for a gate rather than a guideline:
the author was not careless and did not disagree — knowing the rule simply does
not prevent breaking it, because clever writing feels like good writing from the
inside.

The user's rewrite of the same idea passes: "It tells you how many parts you
have out of the total parts." Same meaning, and the learner can act on it — they
can go and count.

WHAT IS DETECTED, AND WHAT IS NOT
---------------------------------
This gate detects SHAPES, not opinions:

  TECHNICAL_TERM       a word the learner has not been taught yet
  METAPHOR_DEFINITION  a figure of speech doing the defining
  ABSTRACT_NOUN        a thing named where an action would be clearer
  TOO_LONG             more than the reader can hold at once

It does NOT judge whether the explanation is correct, kind or well-aimed. A
human still has to read it. What this removes is the class of failure that
survives review because every individual word looked fine.

FAILS OPEN ON NOTHING
---------------------
Unlike a lint rule, a refusal here costs a regeneration, not a person's time.
So it refuses on suspicion and lets the author override by rewriting — never by
adding an exemption. There is no exemption mechanism, deliberately.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass

# --------------------------------------------------------------------------- #
# The vocabulary of the gate                                                    #
# --------------------------------------------------------------------------- #

#: A figure of speech standing in for a definition. The reader has to unpack the
#: image before they can use it, which costs exactly what a technical term costs.
METAPHOR_MARKERS = (
    "waiting to",
    "is like a",
    "is like an",
    "think of it as",
    "think of it like",
    "at its core",
    "is essentially",
    "in a sense",
    "kind of like",
    "sort of like",
    "you can imagine",
)

#: Container nouns that swallow a verb. "A count of parts" names a thing where
#: "how many parts" would have told the reader what to do.
CONTAINER_NOUNS = (
    "count",
    "set",
    "collection",
    "way",
    "form",
    "process",
    "matter",
    "means",
    "measure",
    "degree",
    "notion",
    "concept",
    "aspect",
    "act",
    "state",
    "kind",
    "type",
    "sort",
    "manner",
    "question",
)

#: Endings that turn a verb into a noun. "Multiplication is the repetition of
#: addition" is three actions wearing three nouns, and none of them can be done.
NOMINAL_SUFFIXES = ("tion", "sion", "ment", "ness", "ity", "ance", "ence")

#: A plain idea longer than this is not plain — working memory holds about four
#: things, and a reader who has to re-read has already lost the thread.
MAX_WORDS = 25
MAX_SENTENCES = 2


@dataclass(frozen=True)
class Violation:
    """A refusal that can be acted on.

    `evidence` quotes the offending text, because a gate that reports a count
    tells the author that something is wrong and not what. `fix` states the
    move, because a refusal with no next step is a complaint.
    """

    code: str
    evidence: str
    fix: str


def codes_of(violations: list[Violation]) -> list[str]:
    return [v.code for v in violations]


# --------------------------------------------------------------------------- #
# Checks                                                                        #
# --------------------------------------------------------------------------- #


def _words(text: str) -> list[str]:
    return re.findall(r"[A-Za-z][A-Za-z'-]*", text)


def _find_untaught(text: str, untaught) -> list[str]:
    """Terms the learner has not met yet.

    Matched on the STEM, so "equations" is caught by "equation". A gate that
    only matched exact forms would pass every plural in the language.
    """
    found = []
    lowered = [w.lower() for w in _words(text)]
    for term in untaught:
        t = term.lower()
        if any(w == t or w.startswith(t) for w in lowered):
            found.append(term)
    return found


def _find_metaphor(text: str) -> str | None:
    low = text.lower()
    for marker in METAPHOR_MARKERS:
        if marker in low:
            return marker
    return None


def _find_abstract(text: str) -> str | None:
    """A named thing where an action belongs.

    Two shapes. `a <container> of` catches "a count of parts". The suffix scan
    catches "multiplication", "repetition", "measurement" — verbs that were
    nouned, which is the commonest way an explanation stops being usable.
    """
    match = re.search(
        r"\b(?:a|an|the)\s+(" + "|".join(CONTAINER_NOUNS) + r")\s+of\b",
        text,
        re.IGNORECASE,
    )
    if match:
        return match.group(0)

    for word in _words(text):
        low = word.lower()
        if len(low) > 6 and low.endswith(NOMINAL_SUFFIXES):
            return word
    return None


def _too_long(text: str) -> str | None:
    words = _words(text)
    sentences = [s for s in re.split(r"[.!?]+", text) if s.strip()]
    if len(words) > MAX_WORDS:
        return f"{len(words)} words (max {MAX_WORDS})"
    if len(sentences) > MAX_SENTENCES:
        return f"{len(sentences)} sentences (max {MAX_SENTENCES})"
    return None


def check_plain_block(text: str, untaught=()) -> list[Violation]:
    """Refuse a plain block that the learner could not act on immediately."""
    violations: list[Violation] = []

    for term in _find_untaught(text, untaught):
        violations.append(
            Violation(
                code="TECHNICAL_TERM",
                evidence=term,
                fix=f"say the idea without '{term}', then name it afterwards",
            )
        )

    marker = _find_metaphor(text)
    if marker:
        violations.append(
            Violation(
                code="METAPHOR_DEFINITION",
                evidence=marker,
                fix="say the thing directly; an image has to be decoded first",
            )
        )

    abstract = _find_abstract(text)
    if abstract:
        violations.append(
            Violation(
                code="ABSTRACT_NOUN",
                evidence=abstract,
                fix=f"turn '{abstract}' back into something the learner does",
            )
        )

    length = _too_long(text)
    if length:
        violations.append(
            Violation(
                code="TOO_LONG",
                evidence=length,
                fix="cut it to one idea the reader can hold",
            )
        )

    return violations


def check_heading(text: str, untaught=()) -> list[Violation]:
    """Refuse a heading that names the term.

    This is the cause no prompt change can reach. The generator can obey the
    rule perfectly and the page still breaks it, because the heading is rendered
    from the curriculum node name and arrives before the first block.
    """
    return [
        Violation(
            code="TECHNICAL_TERM",
            evidence=term,
            fix=f"ask the question '{term}' answers; keep the name in navigation",
        )
        for term in _find_untaught(text, untaught)
    ]


# --------------------------------------------------------------------------- #
# CLI — so this is a gate and not a library nobody calls                        #
# --------------------------------------------------------------------------- #


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--text", help="the plain block to check")
    parser.add_argument("--heading", help="the lesson heading to check")
    parser.add_argument(
        "--untaught",
        default="",
        help="comma-separated terms this learner has not been taught yet",
    )
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    args = parser.parse_args(argv)

    untaught = [t.strip() for t in args.untaught.split(",") if t.strip()]
    found: list[Violation] = []
    if args.heading:
        found += check_heading(args.heading, untaught=untaught)
    if args.text:
        found += check_plain_block(args.text, untaught=untaught)

    if args.json:
        print(json.dumps([v.__dict__ for v in found], indent=2))
    else:
        for v in found:
            print(f"REFUSED  {v.code}  {v.evidence!r}\n         fix: {v.fix}")
        if not found:
            print("PLAIN-FIRST  ok")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
