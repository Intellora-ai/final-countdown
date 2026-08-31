#!/usr/bin/env python3
"""
UserPromptSubmit hook: restate the accessibility rules on every prompt.

WHY A HOOK AND NOT ONLY A FILE. The rules also live in the project's
instructions file and in the skill next to this one. Text in a file is a
request, and a long session drifts away from it once the file scrolls out of
context. This event fires on EVERY prompt, so the rules arrive every turn
however much has been compacted away.

WHY IT REPEATS THE RULES INSTEAD OF LINKING THEM. A rule you have to go and
find is a rule that gets skipped. The banner also lets a session tell "the
rules arrived" apart from "the hook silently did nothing".

WHY IT NAMES THE CONFLICT. Terseness plugins inject "drop articles, fragments
are fine" on this same event. Two directives, same turn, opposite advice.
Without an explicit precedence line the conflict is settled by whichever text
was read last. Fragments are harder to read, so this one wins and says so.

WHAT IT DELIBERATELY DOES NOT CARRY. Any private reason a reader might have for
needing these rules. Hook output reaches transcripts, logs and shared
artifacts; the RULES belong there and a person's private details do not.

IT PAIRS WITH A GATE THAT CAN REFUSE. This hook only ASKS. Measured: with these
rules loaded, three of three agents still wrote their completion report in
fragments and none used the four headings. `reply_style_gate.py` is the Stop
hook that refuses, and it is the half with teeth.

FAILS OPEN, ALWAYS. A UserPromptSubmit hook that exits non-zero breaks prompt
submission for every session on this machine. Malformed input, empty input and
any unexpected fault all still exit 0 and still print the rules, because the
rules do not depend on the payload.
"""

import sys

RULES = """ACCESSIBILITY & COMMUNICATION RULES (permanent)

A standing accessibility requirement, not a style preference. These override
any terseness or "caveman" directive: full simple sentences beat fragments,
which are harder to read.

HOW TO WRITE
- Simple, direct, precise language. Plain words instead of jargon.
- Short sentences. Short paragraphs. Clear headings. Flat bullet lists.
- One concept at a time. Numbered steps when the order matters.
- Explain every technical word the first time it is used, in the same breath.
- Answer first, details after. Bold the one thing that matters most.
- Keep facts, actions, warnings and decisions separate.
- State what is happening now, what happens next, what is finished.
- State what is blocked and why.
- Use a concrete example when an idea is hard.

NEVER
- "Obviously", "simply", "as you know", "just do", "this is trivial".
- Unexplained jargon, vague hand-waving, one idea repeated in different words,
  or ten unrelated decisions dropped at once.
- Never patronising. Simplify the explanation, never the technical quality.
- Never soften bad news. Keep every number and every failure exact.

EVERY SENTENCE HAS A REAL SUBJECT
"I did not fix it", never "Me did NOT fix it". "What I changed", never
"What me fix". "Me" as an object is correct and stays: "tell me which one".

TASK SHAPE
Objective, then smallest actions, then one group at a time. Show the result.
Name any error in plain words. State the next action. Mark each item not
started / in progress / blocked / complete. End a substantial task with all
four headings: Completed / Problems / Next step / Status.

PRIVACY
Any private reason a reader has for needing these rules stays private. It must
never appear in a repo file, commit message, pull request, issue, CI log,
generated report, or any shared artifact.
"""


def _drain_stdin() -> str:
    """Consume the payload. An unreadable pipe yields an empty payload, which
    this RETURNS as a value rather than hiding as an error. The rules do not
    depend on the payload, so there is nothing lost by an empty one."""
    try:
        return sys.stdin.read()
    except OSError:
        return ""


def main() -> int:
    _drain_stdin()
    sys.stdout.write(RULES)
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as exc:
        # Breaking prompt submission is a far worse outcome than a turn without
        # the banner. This RE-RAISES as a clean SystemExit rather than falling
        # through, so the failure changes control flow and the cause is chained.
        print(f"inject_style_rules: non-fatal error: {exc}", file=sys.stderr)
        raise SystemExit(0) from exc
