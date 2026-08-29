"""
Tests for the reply-style Stop hook.

WHY THESE ASSERT THE BANNER AND NOT THE EXIT CODE
-------------------------------------------------
This hook always exits 0, blocking or not, because a Stop hook that exits
non-zero is an outage. So the exit code carries no information and a test that
checked it would pass against a hook that does nothing --- including against a
hook FILE THAT DOES NOT EXIST, which is exactly the trap recorded in CLAUDE.md
where eleven tests asserted `exit == 2` and passed against a missing file.

The evidence is the refusal itself: JSON on stdout carrying BANNER. A missing
file writes a traceback to stderr and nothing to stdout, so it cannot satisfy
these.

WHY EVERY CHECK IS TESTED IN A PAIR
-----------------------------------
A check asserted only to BLOCK is satisfied by `return block`. A check asserted
only to PASS is satisfied by `return allow`. Both are vacuous. Every rule below
therefore has an input that must be refused and a neighbouring input that must
be allowed, and the two differ by the one thing the rule is about.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any, cast

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
HOOK = REPO_ROOT / "skills" / "writing-accessible-replies" / "hooks" / "reply_style_gate.py"

# The refusal's own words. Asserted by every blocking test so that "it blocked"
# cannot be satisfied by a crash, an empty output, or an unrelated error.
BANNER = "REPLY STYLE GATE"

PROMPT = "please fix the parser and report back"

GOOD_REPORT = """
Fixed the missing guard.

**Completed**
Added a null check at parse.ts:88. Added a regression test. 46 tests passed.

**Problems**
The same shape also sits in hydrate.ts. I did not fix it.

**Next step**
Fix hydrate.ts the same way.

**Status**
In progress.
"""


def _rec_user(text: str) -> dict[str, Any]:
    return {"type": "user", "message": {"role": "user", "content": text}}


def _rec_last_prompt(text: str) -> dict[str, Any]:
    return {"type": "last-prompt", "lastPrompt": text}


CAVEMAN_REPORT_WITH_HEADINGS = """
## Completed
Add guard to loader. Change two file.

## Problems
What me fix? Loader broke. Me? no idea why.

## Next step
Run test. Maybe.

## Status
Done. Or not.
"""


def _rec_other(kind: str, text: str) -> dict[str, Any]:
    """A transcript record that is NOT an assistant message but does carry
    text-shaped content. Real transcripts contain many of these."""
    return {
        "type": kind,
        "message": {"role": kind, "content": [{"type": "text", "text": text}]},
    }


def _rec_tool_use(name: str) -> dict[str, Any]:
    return {
        "type": "assistant",
        "message": {
            "role": "assistant",
            "content": [{"type": "tool_use", "name": name, "input": {}}],
        },
    }


def _rec_text(text: str) -> dict[str, Any]:
    return {
        "type": "assistant",
        "message": {"role": "assistant", "content": [{"type": "text", "text": text}]},
    }


def _transcript(tmp_path: Path, records: list[dict[str, Any]]) -> Path:
    path = tmp_path / "transcript.jsonl"
    with open(path, "w", encoding="utf-8") as fh:
        for record in records:
            fh.write(json.dumps(record) + "\n")
    return path


def _turn(reply: str, *, tool: str | None = "Edit", prompt: str = PROMPT) -> list[dict[str, Any]]:
    """One complete turn: the prompt, an optional tool call, then the reply."""
    records: list[dict[str, Any]] = [_rec_user(prompt), _rec_last_prompt(prompt)]
    if tool is not None:
        records.append(_rec_tool_use(tool))
    records.append(_rec_text(reply))
    return records


def _run(payload: dict[str, Any] | str) -> subprocess.CompletedProcess[str]:
    body = payload if isinstance(payload, str) else json.dumps(payload)
    return subprocess.run(
        [sys.executable, str(HOOK)],
        input=body,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )


def _decision(result: subprocess.CompletedProcess[str]) -> dict[str, Any] | None:
    """The refusal, or None when the hook allowed the turn to end."""
    out = result.stdout.strip()
    if not out:
        return None
    try:
        parsed: Any = json.loads(out)
    except ValueError:
        return None
    # `isinstance(x, dict)` narrows only to `dict[Unknown, Unknown]`, so the
    # return type stays partially unknown under strict pyright without this.
    return cast("dict[str, Any]", parsed) if isinstance(parsed, dict) else None


def _assert_blocked(result: subprocess.CompletedProcess[str]) -> str:
    decision = _decision(result)
    assert decision is not None, f"expected a refusal, got stdout={result.stdout!r} stderr={result.stderr!r}"
    assert decision.get("decision") == "block"
    reason = decision.get("reason", "")
    assert BANNER in reason, f"refusal did not carry its own banner: {reason!r}"
    return reason


def _assert_allowed(result: subprocess.CompletedProcess[str]) -> None:
    assert _decision(result) is None, f"expected the turn to be allowed, got {result.stdout!r}"


def _payload(transcript: Path, **extra: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "transcript_path": str(transcript),
        "session_id": "session-under-test",
        "stop_hook_active": False,
    }
    body.update(extra)
    return body


# ---------------------------------------------------------------------------
# Non-vacuity. A suite that collected nothing looks identical to a suite that
# looked hard and found nothing, so the harness itself is asserted first.
# ---------------------------------------------------------------------------


def test_hook_file_exists() -> None:
    assert HOOK.is_file(), f"the hook under test does not exist at {HOOK}"


def test_hook_exits_zero_on_empty_input() -> None:
    """Always exit 0. A Stop hook that exits non-zero is an outage."""
    result = _run("")
    assert result.returncode == 0


# ---------------------------------------------------------------------------
# CHECK A --- a sentence may not begin with "Me". This is a LAW about
# grammatical position, not a list of caveman verbs, so it is proved against a
# verb that exists in no dictionary.
# ---------------------------------------------------------------------------


def test_blocks_sentence_beginning_with_me(tmp_path: Path) -> None:
    reply = GOOD_REPORT + "\nMe did NOT fix it.\n"
    result = _run(_payload(_transcript(tmp_path, _turn(reply))))
    reason = _assert_blocked(result)
    assert "Me did" in reason, "the refusal must quote the text it objected to"


def test_allows_me_as_an_object(tmp_path: Path) -> None:
    """PAIR of the test above. Same word, different grammatical position."""
    reply = GOOD_REPORT + "\nAsk me if you want the other copy fixed too.\n"
    _assert_allowed(_run(_payload(_transcript(tmp_path, _turn(reply)))))


def test_blocks_invented_verb_after_me(tmp_path: Path) -> None:
    """
    The check must be a LAW, not a LIST.

    A list of known caveman verbs fails SILENTLY on the first verb nobody
    thought of. `frobnicate` appears in no framework and no word list, so a
    gate that catches it is judging sentence shape rather than vocabulary.
    """
    reply = GOOD_REPORT + "\nMe frobnicated the parser.\n"
    _assert_blocked(_run(_payload(_transcript(tmp_path, _turn(reply)))))


def test_allows_me_inside_a_fenced_code_block(tmp_path: Path) -> None:
    """
    Code is quoted material, not prose, and the rule must not be able to reach
    into it. This is structural: fenced blocks are removed before the rule
    runs. An exemption clause would not scope --- it would suppress code
    blocks generally instead of exempting them.
    """
    reply = GOOD_REPORT + "\n```\nMe did NOT fix it.\n```\n"
    _assert_allowed(_run(_payload(_transcript(tmp_path, _turn(reply)))))


def test_allows_me_inside_inline_code(tmp_path: Path) -> None:
    reply = GOOD_REPORT + "\nThe old string was `Me did NOT fix it.` in the fixture.\n"
    _assert_allowed(_run(_payload(_transcript(tmp_path, _turn(reply)))))


# ---------------------------------------------------------------------------
# CHECK B --- the four required headings. Each one is tested by its own
# absence, so a gate that only ever checks the first heading is caught.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("missing", ["Completed", "Problems", "Next step", "Status"])
def test_blocks_report_missing_one_heading(tmp_path: Path, missing: str) -> None:
    reply = "\n".join(
        line for line in GOOD_REPORT.splitlines() if missing.lower() not in line.lower()
    )
    result = _run(_payload(_transcript(tmp_path, _turn(reply))))
    reason = _assert_blocked(result)
    assert missing in reason, f"the refusal must name the missing heading, got {reason!r}"


def test_allows_report_with_all_four_headings(tmp_path: Path) -> None:
    """PAIR of the four tests above."""
    _assert_allowed(_run(_payload(_transcript(tmp_path, _turn(GOOD_REPORT)))))


def test_headings_are_matched_case_insensitively(tmp_path: Path) -> None:
    reply = GOOD_REPORT.replace("Completed", "COMPLETED").replace("Status", "status")
    _assert_allowed(_run(_payload(_transcript(tmp_path, _turn(reply)))))


# ---------------------------------------------------------------------------
# The predicate. A gate that fires on every turn cries wolf and gets
# uninstalled, and then it enforces nothing at all.
# ---------------------------------------------------------------------------


def test_allows_a_chat_turn_that_changed_no_files(tmp_path: Path) -> None:
    reply = "Me did not touch anything. No headings here at all."
    _assert_allowed(_run(_payload(_transcript(tmp_path, _turn(reply, tool=None)))))


def test_blocks_the_same_text_when_a_file_was_edited(tmp_path: Path) -> None:
    """PAIR of the test above. Only the Edit call differs."""
    reply = "Me did not touch anything. No headings here at all."
    _assert_blocked(_run(_payload(_transcript(tmp_path, _turn(reply, tool="Edit")))))


@pytest.mark.parametrize("tool", ["Edit", "Write", "NotebookEdit"])
def test_every_editing_tool_arms_the_gate(tmp_path: Path, tool: str) -> None:
    reply = "no headings, and Me wrote this badly."
    _assert_blocked(_run(_payload(_transcript(tmp_path, _turn(reply, tool=tool)))))


def test_read_only_tools_do_not_arm_the_gate(tmp_path: Path) -> None:
    """PAIR of the test above. Reading is not building."""
    reply = "no headings, and Me wrote this badly."
    _assert_allowed(_run(_payload(_transcript(tmp_path, _turn(reply, tool="Read")))))


# ---------------------------------------------------------------------------
# Turn boundary. Only this turn's closing message is judged.
# ---------------------------------------------------------------------------


def test_only_the_final_message_of_the_turn_is_judged(tmp_path: Path) -> None:
    records = [
        _rec_user(PROMPT),
        _rec_last_prompt(PROMPT),
        _rec_tool_use("Edit"),
        _rec_text("Me looking at it now."),
        _rec_text(GOOD_REPORT),
    ]
    _assert_allowed(_run(_payload(_transcript(tmp_path, records))))


def test_a_previous_turns_violation_is_not_judged(tmp_path: Path) -> None:
    old = "first prompt"
    records = [
        _rec_user(old),
        _rec_tool_use("Edit"),
        _rec_text("Me broke everything and wrote no headings."),
        _rec_user(PROMPT),
        _rec_last_prompt(PROMPT),
        _rec_tool_use("Edit"),
        _rec_text(GOOD_REPORT),
    ]
    _assert_allowed(_run(_payload(_transcript(tmp_path, records))))


# ---------------------------------------------------------------------------
# Fails open, always. A Stop hook that blocks by mistake cannot be escaped from
# inside the tool --- recovering means editing settings.json from another
# editor. Every one of these must let the turn end.
# ---------------------------------------------------------------------------


def test_stop_hook_active_allows(tmp_path: Path) -> None:
    """Brake 1. The host sets this when a Stop hook already resumed the model."""
    payload = _payload(_transcript(tmp_path, _turn("Me wrote nothing good.")), stop_hook_active=True)
    _assert_allowed(_run(payload))


def test_malformed_stdin_allows() -> None:
    _assert_allowed(_run("{not json at all"))


def test_empty_stdin_allows() -> None:
    _assert_allowed(_run(""))


def test_missing_transcript_path_allows() -> None:
    _assert_allowed(_run({"session_id": "x", "stop_hook_active": False}))


def test_nonexistent_transcript_allows(tmp_path: Path) -> None:
    _assert_allowed(_run(_payload(tmp_path / "does-not-exist.jsonl")))


def test_unreadable_transcript_allows(tmp_path: Path) -> None:
    """A directory where a file is expected. Reading it raises, and that is not
    evidence of a violation."""
    directory = tmp_path / "a-directory"
    directory.mkdir()
    _assert_allowed(_run(_payload(directory)))


def test_partial_final_line_allows(tmp_path: Path) -> None:
    """The transcript is written while this reads it, so the last line is
    routinely half-written. That is a race to ignore, not an error."""
    path = tmp_path / "transcript.jsonl"
    with open(path, "w", encoding="utf-8") as fh:
        for record in _turn(GOOD_REPORT):
            fh.write(json.dumps(record) + "\n")
        fh.write('{"type": "assist')
    _assert_allowed(_run(_payload(path)))


# ---------------------------------------------------------------------------
# Brake 2. The ledger caps how many times one turn may be sent back.
# ---------------------------------------------------------------------------


def test_stops_blocking_the_same_turn_after_the_cap(tmp_path: Path) -> None:
    transcript = _transcript(tmp_path, _turn("Me wrote nothing good."))
    _assert_blocked(_run(_payload(transcript)))
    _assert_blocked(_run(_payload(transcript)))
    _assert_allowed(_run(_payload(transcript)))


def test_a_new_turn_gets_a_fresh_budget(tmp_path: Path) -> None:
    """PAIR of the test above. The cap must not switch the gate off for good."""
    bad = "Me wrote nothing good."
    first = _transcript(tmp_path, _turn(bad, prompt="first prompt"))
    _assert_blocked(_run(_payload(first)))
    _assert_blocked(_run(_payload(first)))
    _assert_allowed(_run(_payload(first)))

    second = tmp_path / "second.jsonl"
    with open(second, "w", encoding="utf-8") as fh:
        for record in _turn(bad, prompt="a completely different second prompt"):
            fh.write(json.dumps(record) + "\n")
    _assert_blocked(_run(_payload(second)))


# ---------------------------------------------------------------------------
# The refusal has to teach, not just refuse.
# ---------------------------------------------------------------------------


def test_refusal_names_both_failures_when_both_are_present(tmp_path: Path) -> None:
    reply = "Me did the thing."
    reason = _assert_blocked(_run(_payload(_transcript(tmp_path, _turn(reply)))))
    assert "Me did" in reason
    for heading in ("Completed", "Problems", "Next step", "Status"):
        assert heading in reason


def test_refusal_does_not_leak_private_details(tmp_path: Path) -> None:
    """
    Hook output reaches transcripts, logs and shared artifacts. The RULES
    belong there. The owner's personal reasons for them do not, and this
    asserts their absence rather than trusting that nobody added them.
    """
    reason = _assert_blocked(_run(_payload(_transcript(tmp_path, _turn("Me did it.")))))
    lowered = reason.lower()
    for forbidden in ("adhd", "autism", "autistic", "12 years", "diagnos", "disabilit"):
        assert forbidden not in lowered, f"the refusal leaked {forbidden!r}"


# ---------------------------------------------------------------------------
# ADDED ON MUTATION EVIDENCE.
#
# The first mutation run killed 11 of 14. Three survived, and a surviving
# mutant is the only thing that licenses adding to this file. Each test below
# names the mutant that proved it was missing, so a later reader can tell a
# justified addition from a decorative one.
# ---------------------------------------------------------------------------


def test_blocks_me_starting_a_line_after_a_heading(tmp_path: Path) -> None:
    """
    Kills M04 --- "only catch Me after terminal punctuation, not after a
    newline".

    That mutant survived because every earlier sample happened to have a full
    stop in front of it, so the newline branch of the rule was never the thing
    doing the work. A heading line ends with no punctuation at all, which is
    exactly where a report starts a section and drops into fragments.
    """
    reply = GOOD_REPORT.replace("**Problems**\n", "**Problems**\nMe broke the parser.\n")
    reason = _assert_blocked(_run(_payload(_transcript(tmp_path, _turn(reply)))))
    assert "Me broke" in reason


def test_blocks_lowercase_me_as_a_subject(tmp_path: Path) -> None:
    """
    Kills M12 --- "make the sentence law case-sensitive".

    Every earlier sample capitalised it. A rule that only catches the
    capitalised form is half a rule, and the lowercase form is if anything the
    more likely one under a terseness instruction.
    """
    reply = GOOD_REPORT + "\nme did not get to the second copy.\n"
    reason = _assert_blocked(_run(_payload(_transcript(tmp_path, _turn(reply)))))
    assert "me did" in reason


def test_allows_lowercase_me_as_an_object(tmp_path: Path) -> None:
    """PAIR of the test above, so the lowercase rule is about position too."""
    reply = GOOD_REPORT + "\nTell me which copy you want fixed first.\n"
    _assert_allowed(_run(_payload(_transcript(tmp_path, _turn(reply)))))


def test_a_previous_turns_edit_does_not_arm_this_turn(tmp_path: Path) -> None:
    """
    Kills M10 --- "ignore the turn boundary and judge the whole session".

    The earlier boundary test could not see that mutant: its good text was the
    last message either way, so the verdict was identical whether the boundary
    was honoured or not. This one puts the EDIT before the boundary and the bad
    text after it. Honour the boundary and this turn changed no files, so there
    is nothing to grade. Ignore it and a stale edit from a previous turn drags
    an innocent chat turn into the gate.
    """
    records = [
        _rec_user("an earlier prompt"),
        _rec_tool_use("Edit"),
        _rec_text(GOOD_REPORT),
        _rec_user(PROMPT),
        _rec_last_prompt(PROMPT),
        _rec_text("Me answering a question, no files touched, no headings."),
    ]
    _assert_allowed(_run(_payload(_transcript(tmp_path, records))))
