#!/usr/bin/env python3
"""
REPLY STYLE GATE --- a Stop hook, because text is a request and only a hook can
refuse.

WHY THIS EXISTS, MEASURED
-------------------------
Six fresh agents were given the same terseness pressure that ships in this
environment and asked to write. Three explained a technical idea and all three
wrote clear, full sentences. Three wrote a completion report and ALL THREE
collapsed into fragments --- "What me fix", "Me did NOT fix it", "WHAT DONE" ---
and NONE of the three used the four required headings.

The decisive part: those agents had the written rules loaded. A probe confirmed
it by quoting the project's own communication section back verbatim. So the
prose is not the missing piece. The rules were present, read, and dropped at
exactly the moment they matter most --- the message that reports finished work.

That is why this is a hook and not another paragraph. `Stop` is the only event
that can say no. It fires when the model tries to END its turn, and
`{"decision": "block"}` sends it back to work.

WHAT IT JUDGES, AND WHAT IT DELIBERATELY DOES NOT
-------------------------------------------------
Only turns that CHANGED FILES. If no Edit, Write or NotebookEdit ran, there is
no completion report to grade and the turn ends untouched. A gate that fires on
every message cries wolf, and a gate that cries wolf gets uninstalled --- at
which point it enforces nothing at all. The narrow predicate is what buys the
right to be strict inside it.

TWO CHECKS, AND WHY EACH TAKES THE SHAPE IT DOES
------------------------------------------------
The two measured failures are different KINDS of failure, so they get different
kinds of check.

  1. FRAGMENTS is a discipline failure --- the model knows better and drops it
     under pressure. It gets a prohibition, expressed as a LAW about sentence
     shape rather than a LIST of caveman words. "A sentence may not begin with
     'Me'" catches `Me frobnicated`, a verb in no dictionary, which a word list
     never would. A list fails SILENTLY on the first spelling nobody imagined.

  2. MISSING HEADINGS is an omission from something already being produced. The
     right form for that is structural: four REQUIRED slots, named in the
     refusal so the fix is mechanical rather than a matter of taste.

Code is quoted material, not prose, so fenced and inline code are REMOVED
before the sentence law runs. That is structural on purpose. An exemption
clause ("this does not apply inside code") does not scope --- it suppresses
code blocks generally instead of exempting them.

IT FAILS OPEN, ALWAYS
---------------------
Malformed input, a missing transcript, an unreadable one, a half-written final
line, or any unexpected fault all let the turn end. A Stop hook that blocks by
mistake cannot be escaped from inside the tool: recovering means editing
settings.json from another editor. Two independent brakes stand behind that ---
the host's `stop_hook_active` flag, and a per-turn block ledger. Either alone
is sufficient.

IT CARRIES THE RULES, NEVER THE REASONS
---------------------------------------
Hook output reaches transcripts, logs and shared artifacts. The rules belong
there. The owner's private reasons for them do not, and a test asserts their
absence rather than trusting that nobody added them later.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import tempfile
from typing import Any, cast

# The refusal's own words. Tests assert THIS rather than an exit code, because
# this hook always exits 0 and a missing file exits non-zero with empty stdout
# --- so an exit-code assertion would pass against a hook that does not exist.
BANNER = "REPLY STYLE GATE"

# The four headings a completion report must carry.
REQUIRED_HEADINGS: tuple[str, ...] = ("Completed", "Problems", "Next step", "Status")

# Only these arm the gate. Reading is not building.
EDITING_TOOLS = frozenset({"Edit", "Write", "NotebookEdit"})

# How many times one turn may be sent back before the gate gives up. Brake 2.
MAX_BLOCKS = 2

# `lastPrompt` is truncated with an ellipsis, so the turn boundary is matched on
# a prefix. Exact equality looks right and silently never matches a long prompt.
_PROMPT_MATCH_CHARS = 60

# A sentence may not begin with "Me". Anchored at the start of the text, after
# terminal punctuation, or after a newline with any amount of list or heading
# punctuation in between. `[Mm]e` and not `[Mm][Ee]`: "ME" is an acronym, "Me"
# and "me" at a sentence start are the caveman subject this is hunting.
_ME_AS_SUBJECT = re.compile(
    r"(?:\A|[.!?]\s+|\n)[ \t>*#\-\d.)\]\[]*(?P<hit>[Mm]e\b\s+\S+)"
)

_INLINE_CODE = re.compile(r"`[^`\n]*`")


def _read_event() -> dict[str, Any]:
    """The hook payload. A malformed payload is not worth an outage, so it
    RETURNS an empty mapping rather than letting the error escape."""
    try:
        parsed: Any = json.loads(sys.stdin.read() or "{}")
    except (ValueError, OSError):
        return {}
    return cast("dict[str, Any]", parsed) if isinstance(parsed, dict) else {}


def _content_blocks(record: dict[str, Any]) -> list[dict[str, Any]]:
    """Content blocks of a transcript record, whatever shape the host used."""
    message: Any = record.get("message")
    content: Any = (
        cast("dict[str, Any]", message).get("content") if isinstance(message, dict) else None
    )
    if not isinstance(content, list):
        content = record.get("content")
    if not isinstance(content, list):
        return []
    blocks: list[dict[str, Any]] = []
    for block in cast("list[Any]", content):
        if isinstance(block, dict):
            blocks.append(cast("dict[str, Any]", block))
    return blocks


def _scan(transcript_path: str) -> tuple[bool, str, int, str] | None:
    """
    Read the transcript once and return what this turn did.

    Returns `(edited, final_text, boundary, prompt)`, or None when the file
    could not be READ AT ALL. Those are different facts: an unreadable
    transcript is no evidence, while a readable one with no edits is real
    evidence that there is nothing to grade. Collapsing them would make a
    missing file BLOCK instead of failing open.

    The turn boundary takes two passes for a reason learned from real
    transcripts in this repository: the host writes the `last-prompt` record
    LATE, after the model's first tool calls, so treating that record's own
    position as the boundary discards work done promptly and punishes the
    compliant order. Pass one reads the final `lastPrompt` value; pass two
    finds the `user` record actually carrying that text.

    Scanned line by line, not parsed whole: a transcript reaches tens of
    megabytes by the end of a long session and this runs on every turn end.
    """
    users: list[tuple[int, str]] = []
    tools: list[tuple[int, str]] = []
    texts: list[tuple[int, str]] = []
    final_prompt: str | None = None

    try:
        with open(transcript_path, "r", encoding="utf-8", errors="replace") as handle:
            for index, line in enumerate(handle):
                try:
                    raw: Any = json.loads(line)
                except ValueError:
                    # The transcript is written while this reads it, so the
                    # final line is routinely a partial write. That is a race
                    # to skip, not an error to fail on.
                    continue
                if not isinstance(raw, dict):
                    continue
                record = cast("dict[str, Any]", raw)

                kind = record.get("type")
                if kind == "last-prompt":
                    prompt: Any = record.get("lastPrompt")
                    if isinstance(prompt, str):
                        final_prompt = prompt
                    continue

                if kind == "user":
                    message: Any = record.get("message") or {}
                    content: Any = (
                        cast("dict[str, Any]", message).get("content")
                        if isinstance(message, dict)
                        else None
                    )
                    # Invoking a skill injects its body back as a `user`
                    # record whose content is a LIST of blocks. Only a plain
                    # string is a real prompt.
                    if isinstance(content, str):
                        users.append((index, content))
                    continue

                for block in _content_blocks(record):
                    block_type = block.get("type")
                    if block_type == "tool_use":
                        name: Any = block.get("name")
                        if isinstance(name, str):
                            tools.append((index, name))
                    elif block_type == "text":
                        body: Any = block.get("text")
                        if isinstance(body, str):
                            texts.append((index, body))
    except OSError:
        return None

    boundary = 0
    matched_prompt = ""
    if final_prompt:
        needle = final_prompt.rstrip("… ").strip()[:_PROMPT_MATCH_CHARS]
        if needle:
            for index, content in users:
                if content.strip().startswith(needle):
                    # LAST match, not first: the same text repeated in a later
                    # turn must move the boundary forward.
                    boundary = index
                    matched_prompt = needle

    edited = any(index >= boundary and name in EDITING_TOOLS for index, name in tools)
    final_text = ""
    for index, body in texts:
        if index >= boundary:
            final_text = body
    return edited, final_text, boundary, matched_prompt


def _prose_only(text: str) -> str:
    """
    The text with code removed.

    Structural, not an exemption clause. The sentence law simply cannot reach
    code, because code is gone before the law runs.
    """
    kept: list[str] = []
    inside_fence = False
    for line in text.splitlines():
        stripped = line.lstrip()
        if stripped.startswith("```") or stripped.startswith("~~~"):
            inside_fence = not inside_fence
            continue
        if inside_fence:
            continue
        kept.append(_INLINE_CODE.sub(" ", line))
    return "\n".join(kept)


def _caveman_hits(prose: str) -> list[str]:
    """Every sentence that begins with "Me", quoted with its next word so the
    refusal can point at the actual text rather than describe it."""
    seen: list[str] = []
    for match in _ME_AS_SUBJECT.finditer(prose):
        hit = " ".join(match.group("hit").split())
        if hit not in seen:
            seen.append(hit)
    return seen


def _missing_headings(prose: str) -> list[str]:
    lowered = prose.lower()
    return [name for name in REQUIRED_HEADINGS if name.lower() not in lowered]


def _ledger_path(transcript_path: str, session_id: str, boundary: int, prompt: str) -> str:
    """
    Block-count file, kept beside the transcript so it dies with it.

    Keyed on the PROMPT as well as the turn index. Keying on the index alone
    was wrong and a test caught it: two different turns can both start at
    index 0, so the first turn's exhausted budget would silently switch the
    gate off for the second one.

    `tempfile.gettempdir()` and not a literal "/tmp": the literal ignores
    TMPDIR, does not exist on Windows, and on a shared host is a
    world-writable path another user can pre-create.
    """
    directory = os.path.dirname(transcript_path) or tempfile.gettempdir()
    digest = hashlib.sha256(prompt.encode("utf-8", errors="replace")).hexdigest()[:12]
    safe = "".join(c for c in session_id if c.isalnum() or c in "-_") or "unknown"
    return os.path.join(directory, f".reply-style-{safe}-{boundary}-{digest}")


def _blocks_so_far(path: str) -> int:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return int(handle.read().strip() or "0")
    except (OSError, ValueError):
        return 0


def _record_block(path: str, count: int) -> bool:
    """True when the count was persisted. Losing the ledger only costs brake 2;
    `stop_hook_active` is still standing, so it is not worth failing the turn
    over --- but the caller is TOLD, rather than the failure vanishing."""
    try:
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(str(count))
    except OSError:
        return False
    return True


def _reason(hits: list[str], missing: list[str]) -> str:
    lines = [
        f"{BANNER} — this turn changed files, so the closing message has to be "
        "readable. Fix these, then end the turn.",
    ]
    if hits:
        quoted = ", ".join(f'"{hit}"' for hit in hits)
        lines.append(
            f"Dropped into fragments: {quoted}. A sentence cannot begin with "
            '"Me". Write a full sentence with a real subject — "I added the '
            'guard", not "Me add guard".'
        )
    if missing:
        lines.append(
            "Missing required headings: "
            + ", ".join(missing)
            + ". A finished piece of work ends with all four: "
            + ", ".join(REQUIRED_HEADINGS)
            + "."
        )
    lines.append(
        "Write full, simple sentences. Fragments are harder to read, not "
        "easier, so a terseness instruction does not override this."
    )
    return " ".join(lines)


def main() -> int:
    event = _read_event()

    # BRAKE 1. The host sets this when the model is already running BECAUSE a
    # Stop hook sent it back. Blocking again here is how a loop is built.
    if event.get("stop_hook_active"):
        return 0

    transcript_path = event.get("transcript_path") or ""
    if not isinstance(transcript_path, str) or not transcript_path:
        return 0

    scanned = _scan(transcript_path)
    if scanned is None:
        # No evidence of a violation is not evidence of one.
        return 0

    edited, final_text, boundary, prompt = scanned
    if not edited:
        return 0

    prose = _prose_only(final_text)
    hits = _caveman_hits(prose)
    missing = _missing_headings(prose)
    if not hits and not missing:
        return 0

    # BRAKE 2.
    session_id = event.get("session_id")
    ledger = _ledger_path(
        transcript_path,
        session_id if isinstance(session_id, str) else "",
        boundary,
        prompt,
    )
    count = _blocks_so_far(ledger)
    if count >= MAX_BLOCKS:
        return 0
    _record_block(ledger, count + 1)

    print(json.dumps({"decision": "block", "reason": _reason(hits, missing)}))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as exc:
        # A Stop hook that exits non-zero is an outage for every session on
        # this machine, so an unexpected fault still ends the turn cleanly.
        # This RE-RAISES as SystemExit rather than falling through: the
        # failure changes control flow and the cause is chained, not lost.
        print(f"reply_style_gate: non-fatal error: {exc}", file=sys.stderr)
        raise SystemExit(0) from exc
