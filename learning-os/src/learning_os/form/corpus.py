"""Turning transcripts into labelled examples.

WHY THIS IS SEPARATE FROM THE LABELLER
--------------------------------------
`labels.py` decides what a reply means. This decides what a turn IS, which is a
parsing problem with its own failure modes: a "user" entry that is really a tool
result, an assistant turn that is only a tool call and shows the user nothing, a
hook injecting text nobody typed.

Mixing the two would make a labelling bug and a parsing bug look identical, and
the parsing bugs are the ones that quietly inflate a corpus with turns that were
never said.

WHAT COUNTS AS A TURN, AND WHY THE EXCLUSIONS MATTER
----------------------------------------------------
Only what a person typed and what they were shown in response.

Excluded, each for a reason that would otherwise corrupt the labels:

  * tool results carried on `user` entries -- the harness attributes them to the
    user role, so counting them makes a `<tool_use_result>` payload look like
    somebody asking a question;
  * hook and system-reminder text, injected per turn and identical every time,
    which would dominate any frequency count;
  * assistant entries with no visible text, which are tool calls -- treating one
    as a response measures the length of something the user never saw.

An unfiltered corpus is not a larger sample. It is a different measurement.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

from learning_os.form.labels import Label, label_turn

#: Markers of text the harness injected rather than the user typing it.
_INJECTED = (
    "<system-reminder>",
    "<tool_use_error>",
    "UserPromptSubmit hook",
    "SessionStart hook",
    "Caveat: The messages below were generated",
    "<command-name>",
    "<local-command-stdout>",
    "This session is being continued from a previous conversation",
)


@dataclass(frozen=True, slots=True)
class Exchange:
    """One user turn, the response before it, and what the turn revealed.

    `response` is what the user was REACTING to -- the assistant text that
    preceded this turn. Pairing a label with the response that came after it is
    an off-by-one that reverses the meaning of every example, so the two are
    carried in one object rather than in parallel lists.
    """

    session: str
    index: int
    user_text: str
    response: str
    previous_user_text: str | None
    label: Label

    @property
    def response_words(self) -> int:
        from learning_os.form.request import word_count

        return word_count(self.response)


def _visible_text(entry: dict[str, object]) -> str | None:
    """The text a human wrote or read, or None if this entry is neither."""
    message = entry.get("message")
    if not isinstance(message, dict):
        return None

    content = message.get("content")
    if isinstance(content, str):
        return content or None

    if not isinstance(content, list):
        return None

    parts = [
        block.get("text", "")
        for block in content
        if isinstance(block, dict) and block.get("type") == "text"
    ]
    joined = "".join(parts).strip()
    return joined or None


def read_session(path: Path) -> list[Exchange]:
    """Every labelled exchange in one transcript, in order."""
    exchanges: list[Exchange] = []
    last_response = ""
    previous_user: str | None = None
    index = 0

    with path.open(encoding="utf-8", errors="replace") as handle:
        for line in handle:
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                # A truncated final line from a session still being written.
                # Skipped rather than raised: unlike a learner's journal, a
                # partial transcript is a normal state of a live log.
                continue

            kind = entry.get("type")
            text = _visible_text(entry)
            if not text:
                continue

            if kind == "assistant":
                last_response = text
                continue

            if kind != "user":
                continue
            if any(marker in text for marker in _INJECTED):
                continue

            index += 1
            exchanges.append(
                Exchange(
                    session=path.stem,
                    index=index,
                    user_text=text,
                    response=last_response,
                    previous_user_text=previous_user,
                    label=label_turn(text, previous_user),
                )
            )
            previous_user = text
            last_response = ""

    return exchanges


def read_corpus(directory: Path) -> Iterator[Exchange]:
    """Every labelled exchange across every transcript.

    Sorted by filename so two runs over the same directory produce the same
    order -- a fitted budget that moves because the filesystem returned files
    differently is not reproducible, and a number nobody can reproduce is not
    evidence.
    """
    for path in sorted(directory.glob("*.jsonl")):
        yield from read_session(path)
