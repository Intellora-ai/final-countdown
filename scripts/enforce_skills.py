#!/usr/bin/env python3
"""
SKILL ENFORCEMENT — A STOP HOOK, NOT A PROMPT.

WHY THIS IS A STOP HOOK AND THE OLD ONES ARE NOT ENFORCEMENT
------------------------------------------------------------
The three existing skill hooks are all `UserPromptSubmit`. That event can only
ADD TEXT to the turn. Text is a request. The model reads "you MUST invoke
/rtk", decides it already knows what /rtk would say, and answers anyway --- and
nothing in the system disagrees with it. Every one of those hooks is an
instruction wearing an enforcement costume.

`Stop` is the only event that can say no. It fires when the model tries to END
its turn, and a `{"decision": "block"}` response sends the model back to work
with a reason. So the rule stops being "please invoke these" and becomes "this
turn does not end until these are invoked", which is a different kind of
statement: the first is advice, the second is a gate.

WHAT IT CHECKS
--------------
The transcript is the evidence. Not a flag file, not a counter, not the model's
own claim that it ran something --- the actual `tool_use` records for the Skill
tool in this session's JSONL. A hook that trusts a self-report is enforcing
nothing, because the thing it is guarding against is exactly a model that
believes it complied.

THE INFINITE LOOP THIS AVOIDS
-----------------------------
A Stop hook that blocks unconditionally never lets any turn end, in any
session, forever --- and because it is a user-level hook, recovering means
editing settings.json from outside the tool. That is a foot-gun with the safety
off, so two independent brakes are wired in:

  1. `stop_hook_active` is set by the host when the model was ALREADY resumed
     by a Stop hook. Blocking again in that state is what builds the loop, so
     this returns clean the moment it sees the flag.
  2. A per-session block ledger under the transcript's own directory caps the
     number of blocks. Even if the host ever stopped sending the flag, the
     ledger ends it.

Either brake alone prevents the loop. Both are present because the failure mode
is unrecoverable-without-a-text-editor and the cost of the second is ten lines.

NEVER CRASHES
-------------
A traceback in a Stop hook is the same outage as an infinite block: the turn
cannot complete. Every path is wrapped, and the exit code is 0 on any
unexpected failure. A broken enforcement hook must fail OPEN, because a
watchdog that bites the user is worse than one that misses a violation.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from typing import Any, cast

# The skills the user named, as BARE names.
#
# Plugin skills are invoked as "plugin:skill" (`superpowers:systematic-debugging`)
# and the scanner normalises to the last segment, so `systematic-debugging` is
# what matches. Writing the prefixed form here would never match anything and
# the gate would block forever on a skill that had in fact been invoked.
#
# On cost: the first invocation of each per session pays its preamble; every
# re-invocation after that returns "already loaded above; instructions
# unchanged" at effectively zero tokens. That argument was used to justify
# holding ten, and it was only half right -- the RECURRING cost is near zero,
# but the ONE-OFF cost is ~8 KB per skill and it lands on the first prompt of
# every new session, which is exactly when context is most valuable. FIVE is
# the list now; see the note on REQUIRED below for what was dropped and why.
# CUT FROM TEN TO THREE, 2026-08-24, at the user's explicit instruction.
# RAISED FROM THREE TO FIVE, 2026-08-25, also at the user's explicit
# instruction: /root-sweep and /thiel were added.
#
# A note for whoever reads this next. The gate was raised to five BEFORE
# force-skills.py was updated, and the two lists disagreed. The result was
# the failure the header of that file predicts: turns refused by a gate
# demanding skills nothing had named, twice in one session, with no warning.
# The three lists -- this file, its installed copy, and the reminder -- are
# now identical, and test_installed_copy_matches_this_one keeps two of them
# that way. Nothing keeps the REMINDER in step except reading this.
#
# Removed: mutate, test-driven-development, proptest, adversarial-reviewer,
# chaos-engineer, chaos-engineering, systematic-debugging.
#
# SCOPE is "turn", so each of those was re-invoked on EVERY prompt at roughly
# 8 KB of preamble apiece -- about 80 KB spent before any work began. Measured
# against what they bought: `chaos-engineering` correctly reported it had no
# target at all, because nothing in this repository is deployed, and the rest
# restated process the surviving three already carry. The docstring above makes
# exactly this argument about the original sixteen: a gate expensive enough to
# resent is a gate that gets switched off, and then it enforces nothing.
#
# `caveman` is ONE entry, not two. Plugin skills arrive as "plugin:skill" and
# the reader below normalises with `skill.split(":")[-1]`, so this single
# string is satisfied by `/caveman` and by `/caveman:caveman` alike.
#
# THE RUNNING COPY IS ~/.claude/hooks/enforce_skills.py AND IT MATCHES THIS.
# Both were changed together; this file is the one the tests run against and
# the one a reviewer reads, so a drift between them is a gate nobody can audit.
REQUIRED = (
    "rtk",
    "investigate",
    "caveman",
    # The two built in this repo. They are 450 and 686 lines of method, and a
    # method nothing forces is a method that gets skipped on the turn it was
    # written for -- the same 0-of-8 measurement that made this a Stop hook
    # rather than a prompt.
    #
    # On cost: the FIRST invocation each session pays the preamble. Every
    # re-invocation returns "already loaded above; instructions unchanged" at
    # effectively zero tokens, so the recurring price of a five-skill gate is
    # close to that of a three-skill one. The one-off cost is real and is the
    # trade being made knowingly.
    "thiel",
    "root-sweep",
    # `fullrun` is a RELEASE-time skill and this gate fires on EVERY turn, which
    # is a real mismatch worth stating rather than hiding: it is loaded on turns
    # that will never run a browser. The owner asked for it knowingly. The
    # recurring price is near zero -- a re-invocation returns "already loaded
    # above" -- so the cost is one preamble per session, paid once.
    "fullrun",
)

# "turn"    --- every skill in REQUIRED must be re-invoked for EVERY prompt.
# "session" --- once per session is enough.
#
# `turn` is what was asked for and it is the expensive one. It said "both
# skills" and "~16 KB per prompt" back when REQUIRED held two; the list has
# been two, then sixteen, then ten, then three, and the sentence did not move
# with it. Written without a count now, so it cannot go stale again -- one
# constant to flip if the bill stops being worth it.
SCOPE = "turn"

# How many times one turn may be sent back before the hook gives up and lets it
# end. Brake 2 --- see the module docstring.
MAX_BLOCKS = 2

# How much of the prompt to match a `user` record against. Long enough to be
# unambiguous, short enough to survive the host's ellipsis truncation of
# `lastPrompt` and any trailing whitespace differences.
_PROMPT_MATCH_CHARS = 60


def _read_event() -> dict[str, Any]:
    """
    Parse the hook payload. A malformed payload is not worth an outage.

    Typed `dict[str, Any]` rather than a bare `dict` because pyright runs
    strict here and a bare one makes every `event.get(...)` below Unknown ---
    which the gate reported as a wall of errors in code that was correct. The
    values genuinely ARE heterogeneous (a path, a session id, a bool), so
    `Any` is the honest annotation and each read is narrowed at its use site.
    """
    try:
        parsed = json.loads(sys.stdin.read() or "{}")
    except (ValueError, OSError):
        return {}
    return cast("dict[str, Any]", parsed) if isinstance(parsed, dict) else {}


def _invoked_skills(transcript_path: str) -> tuple[set[str], int] | None:
    """
    Skill names invoked in the current scope, plus the turn boundary index.

    The boundary comes back with the set because the block ledger has to be
    keyed on it. Under `turn` scope a session-keyed ledger would spend its
    whole budget on the first prompt and leave every later prompt ungated ---
    the gate would switch itself off after two blocks and look like it was
    working.

    Returns None when the transcript could not be READ at all, and a set (which
    may be empty) when it was read. Those two are different facts and an
    earlier version of this returned an empty set for both --- which made an
    unreadable transcript indistinguishable from a turn that skipped every
    skill, so a missing file BLOCKED instead of failing open. The docstring
    said "fail open" and the code did the opposite; only the test caught it.

    Scanned line by line rather than parsed whole: a transcript is JSONL and
    can be tens of megabytes by the end of a long session, and a hook that
    loads all of it adds latency to every single turn end.

    Unparseable lines are skipped, not fatal. The transcript is written
    concurrently with this read, so the final line is routinely a partial
    write --- treating that as an error would make the hook fail on a race it
    can simply ignore.
    """
    # WHERE THE CURRENT TURN STARTS --- AND WHY THIS TAKES TWO PASSES.
    #
    # Two boundaries are wrong, and both were tried:
    #
    #   "the last record with role user"
    #       Invoking a skill injects its body back as a `type: "user"` record,
    #       so /investigate's own 8 KB preamble looks like a fresh prompt. The
    #       boundary resets every time the gate is satisfied, so it never is.
    #
    #   "the record where lastPrompt changed value"
    #       This is the one that shipped, and the transcript disproves it. The
    #       host writes `last-prompt` LATE --- after the model's first tool
    #       calls. Measured on real sessions: the user record carrying the
    #       prompt sat at #837 and the `last-prompt` reporting it at #855, and
    #       at #978 / #1002. The Skill calls made immediately, at #844/#849 and
    #       #985/#986, fell BEFORE the boundary and were discarded. The gate
    #       then blocked a turn that had complied first thing --- punishing the
    #       compliant order and rewarding invoking the skills late.
    #
    # The fix is to separate the two facts the `last-prompt` record conflates.
    # It says WHICH prompt is current; it does not say where that prompt began.
    # So: pass one reads the final `lastPrompt` value, and pass two finds the
    # `user` record actually carrying that text. That record is the turn start.
    # Skill-body injections are still excluded, because their content is the
    # skill preamble and not the prompt.
    #
    # The file is read once and only three small lists are kept, because a
    # transcript reaches tens of megabytes and this runs on every turn end.
    users: list[tuple[int, str]] = []
    skills: list[tuple[int, str]] = []
    final_prompt: str | None = None

    try:
        with open(transcript_path, "r", encoding="utf-8", errors="replace") as fh:
            for index, line in enumerate(fh):
                has_skill = '"Skill"' in line
                has_prompt = '"last-prompt"' in line
                has_user = '"user"' in line
                if not (has_skill or has_prompt or has_user):
                    # Cheap substring reject before the expensive parse.
                    continue
                try:
                    rec: Any = json.loads(line)
                except ValueError:
                    continue
                if not isinstance(rec, dict):
                    continue
                record = cast("dict[str, Any]", rec)

                kind = record.get("type")
                if kind == "last-prompt":
                    prompt = record.get("lastPrompt")
                    if isinstance(prompt, str):
                        final_prompt = prompt
                    continue

                if kind == "user":
                    msg: Any = record.get("message") or {}
                    content: Any = cast("dict[str, Any]", msg).get("content") if isinstance(msg, dict) else None
                    if isinstance(content, str):
                        users.append((index, content))

                for block in _content_blocks(record):
                    if block.get("type") != "tool_use":
                        continue
                    if block.get("name") != "Skill":
                        continue
                    args: Any = block.get("input") or {}
                    skill: Any = cast("dict[str, Any]", args).get("skill") if isinstance(args, dict) else None
                    if isinstance(skill, str):
                        # Plugin skills arrive as "plugin:skill"; the bare name
                        # is what REQUIRED is written in.
                        skills.append((index, skill.split(":")[-1].lstrip("/").strip()))
    except OSError:
        # No evidence either way. Fail open --- see the module docstring on why
        # a biting watchdog is the worse failure than one that misses a turn.
        return None

    boundary = 0
    if SCOPE == "turn" and final_prompt:
        # `lastPrompt` is TRUNCATED with an ellipsis for long prompts, so this
        # compares a prefix rather than the whole string. Exact equality looks
        # correct and silently never matches a long prompt --- which would put
        # the boundary at 0 and turn `turn` scope back into `session` scope
        # without any visible failure.
        needle = final_prompt.rstrip("… ").strip()[:_PROMPT_MATCH_CHARS]
        if needle:
            for index, content in users:
                if content.strip().startswith(needle):
                    # LAST match, not first: the same prompt text repeated in a
                    # later turn should move the boundary forward.
                    boundary = index

    found = {name for index, name in skills if index >= boundary}
    return found, boundary


def _content_blocks(rec: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Content blocks of a transcript record, whatever shape the host used.

    The locals are annotated `Any` on purpose. `isinstance(x, dict)` narrows to
    `dict[Unknown, Unknown]`, so every `.get()` after it is Unknown under
    strict pyright and the error propagates outward through the caller. Saying
    `Any` once at the boundary of untrusted JSON is more honest than a cast per
    access, and it stops there --- the RETURN type is concrete.
    """
    message: Any = rec.get("message")
    content: Any = cast("dict[str, Any]", message).get("content") if isinstance(message, dict) else None
    if not isinstance(content, list):
        content = rec.get("content")
    if not isinstance(content, list):
        return []
    blocks: list[dict[str, Any]] = []
    # `block` is Any here; narrowed and cast rather than left to isinstance,
    # which only narrows to dict[Unknown, Unknown] and keeps the error.
    for block in cast("list[Any]", content):
        if isinstance(block, dict):
            blocks.append(cast("dict[str, Any]", block))
    return blocks


def _ledger_path(transcript_path: str, session_id: str) -> str:
    """
    Block-count file, kept beside the transcript so it dies with it.

    The fallback is `tempfile.gettempdir()` and NOT a literal "/tmp". Bandit
    flags the literal as B108 (hardcoded_tmp_directory), and it is right to:
    "/tmp" ignores TMPDIR, does not exist on Windows, and on a shared host is a
    world-writable path another user can pre-create. `gettempdir()` honours the
    environment and is the same one line.

    This is not a cosmetic lint fix. The literal added a new medium-severity
    bandit finding, which failed the security gate inside the SARIF-suppression
    harness, which failed the `coverage` job and cascaded into `bandit` --- two
    red required checks from one hardcoded string.
    """
    directory = os.path.dirname(transcript_path) or tempfile.gettempdir()
    safe = "".join(c for c in session_id if c.isalnum() or c in "-_") or "unknown"
    return os.path.join(directory, f".skill-enforce-{safe}")


def _blocks_so_far(path: str) -> int:
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return int(fh.read().strip() or "0")
    except (OSError, ValueError):
        return 0


def _record_block(path: str, count: int) -> None:
    try:
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(str(count))
    except OSError:
        # Losing the ledger only costs us brake 2. `stop_hook_active` is
        # still standing, so this is not worth failing the turn over.
        pass


def main() -> int:
    event = _read_event()

    # BRAKE 1. The host sets this when the model is running BECAUSE a Stop hook
    # already sent it back. Blocking here is the loop.
    if event.get("stop_hook_active"):
        return 0

    transcript_path = event.get("transcript_path") or ""
    if not transcript_path:
        return 0

    scanned = _invoked_skills(transcript_path)
    if scanned is None:
        # Unreadable transcript. No evidence of a violation is not evidence of
        # one, and this hook must never block on a guess.
        return 0

    invoked, boundary = scanned
    missing = [s for s in REQUIRED if s not in invoked]
    if not missing:
        return 0

    # BRAKE 2. Keyed on the turn, not the session --- see `_invoked_skills`.
    ledger = _ledger_path(
        transcript_path, f"{event.get('session_id') or ''}-{boundary}"
    )
    count = _blocks_so_far(ledger)
    if count >= MAX_BLOCKS:
        return 0
    _record_block(ledger, count + 1)

    names = ", ".join("/" + s for s in missing)
    # The scope word is not cosmetic. Under `turn` scope the honest complaint
    # is "not yet THIS TURN" --- a model told "not this session" when it can
    # see the skill in its own history reasonably concludes the gate is broken
    # and looks for a way around it rather than doing the one thing asked.
    when = "for this prompt" if SCOPE == "turn" else "in this session"
    print(
        json.dumps(
            {
                "decision": "block",
                "reason": (
                    f"Required skills not yet invoked {when}: {names}. "
                    "Invoke each one with the Skill tool now, then continue. "
                    "Having invoked it on an earlier prompt does not count. "
                    "This is checked against the transcript's Skill tool_use "
                    "records, so saying you ran them does not satisfy it."
                ),
            }
        )
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001 - a Stop hook must fail open.
        print(f"enforce_skills: non-fatal error: {exc}", file=sys.stderr)
        sys.exit(0)
