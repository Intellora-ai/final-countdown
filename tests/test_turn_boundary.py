"""
The turn boundary in the skill-enforcement Stop hook, tested against the
prompt shapes that REAL transcripts actually contain.

WHY A SEPARATE FILE
-------------------
`test_enforce_skills.py` covers the gate's decisions. This file covers one
thing underneath them: finding where the current turn STARTS. That lookup is
what makes `SCOPE = "turn"` mean anything, and when it fails the hook silently
degrades to session scope --- it still runs, still reports, and quietly checks
a different question than the one it claims to.

MEASURED, ON THIS MACHINE, BEFORE ANY FIX
-----------------------------------------
Across the six largest real transcripts in this project's own directory ---
3,206 prompts --- the shipped lookup finds the turn start for 2,168 of them.
The other **1,038 (32.4%)** fall back to `boundary = 0`, which means "the whole
session is this turn".

Causes, counted:

  320  the host TRUNCATED the prompt with an ellipsis
  277  the prompt is absent from every user record (compaction)
  139  the prompt is present but NOT at the start of the record, because hook
       output and system reminders are prepended to it
  158  whitespace: the host flattens newlines and tabs to spaces, the stored
       record keeps them
   32  the prompt is stored as a list of text blocks, not a string

HOW EACH TEST DETECTS THE BOUNDARY WITHOUT REACHING INSIDE
----------------------------------------------------------
Every required skill is invoked BEFORE the prompt and none after. A correct
boundary therefore sees an empty turn and must BLOCK. A broken boundary sees
the whole session, finds every skill, and wrongly lets the turn end.

So `BLOCK` means the boundary was found, and passing means it was not. Each
case is paired with the same transcript where the skills come AFTER the
prompt, which must pass --- otherwise "always block" would satisfy the file.
"""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from typing import Any, cast

HOOK = Path(__file__).resolve().parents[1] / "scripts" / "enforce_skills.py"

Decision = dict[str, str]


def _load_hook_module() -> Any:
    spec = importlib.util.spec_from_file_location("enforce_skills_boundary", HOOK)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


REQUIRED: tuple[str, ...] = _load_hook_module().REQUIRED


def _run(transcript_path: str, session_id: str) -> Decision | None:
    proc = subprocess.run(
        [sys.executable, str(HOOK)],
        input=json.dumps(
            {
                "transcript_path": transcript_path,
                "session_id": session_id,
                "stop_hook_active": False,
            }
        ),
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    # Always 0. A non-zero exit from a Stop hook is an outage, not a signal.
    assert proc.returncode == 0, proc.stderr
    out = proc.stdout.strip()
    if not out:
        return None
    return cast(Decision, json.loads(out))


def _skill(name: str) -> dict[str, Any]:
    return {
        "message": {
            "content": [{"type": "tool_use", "name": "Skill", "input": {"skill": name}}]
        }
    }


def _user_str(text: str) -> dict[str, Any]:
    return {"type": "user", "message": {"role": "user", "content": text}}


def _user_blocks(text: str) -> dict[str, Any]:
    """A prompt stored as a list of text blocks. Real transcripts contain these."""
    return {
        "type": "user",
        "message": {"role": "user", "content": [{"type": "text", "text": text}]},
    }


def _last_prompt(text: str) -> dict[str, Any]:
    return {"type": "last-prompt", "lastPrompt": text}


def _write(tmp_path: Path, records: list[dict[str, Any]], name: str) -> str:
    path = tmp_path / name
    with open(path, "w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record) + "\n")
    return str(path)


def _before(user_record: dict[str, Any], last_prompt: str) -> list[dict[str, Any]]:
    """Every skill in an EARLIER turn. A correct boundary must block."""
    return (
        [_skill(name) for name in REQUIRED]
        + [user_record, _last_prompt(last_prompt)]
    )


def _after(user_record: dict[str, Any], last_prompt: str) -> list[dict[str, Any]]:
    """Every skill in THIS turn. Must always pass, in every shape."""
    return (
        [user_record, _last_prompt(last_prompt)]
        + [_skill(name) for name in REQUIRED]
    )


def _assert_boundary_found(tmp_path: Path, user_record: dict[str, Any],
                           last_prompt: str, label: str) -> None:
    blocked = _run(_write(tmp_path, _before(user_record, last_prompt), f"{label}-b.jsonl"),
                   f"{label}-before")
    assert blocked is not None, (
        f"[{label}] the boundary was NOT found: skills from an earlier turn were "
        "counted as this turn's, so turn scope silently became session scope"
    )
    assert blocked["decision"] == "block"


def _assert_same_turn_passes(tmp_path: Path, user_record: dict[str, Any],
                             last_prompt: str, label: str) -> None:
    """The PAIR. Without this, 'always block' would satisfy every test above."""
    allowed = _run(_write(tmp_path, _after(user_record, last_prompt), f"{label}-a.jsonl"),
                   f"{label}-after")
    assert allowed is None, f"[{label}] skills invoked in THIS turn were not counted"


# ---------------------------------------------------------------------------
# The shape that already works. If this ever breaks, the fix broke something.
# ---------------------------------------------------------------------------

PLAIN = "please look at the parser and tell me what is wrong with it"


def test_plain_single_line_prompt_finds_the_boundary(tmp_path: Path) -> None:
    _assert_boundary_found(tmp_path, _user_str(PLAIN), PLAIN, "plain")


def test_plain_single_line_prompt_counts_this_turn(tmp_path: Path) -> None:
    _assert_same_turn_passes(tmp_path, _user_str(PLAIN), PLAIN, "plain")


# ---------------------------------------------------------------------------
# CAUSE 1 --- whitespace. The host flattens newlines to spaces; the record
# keeps them. Measured cause of 158 failures.
# ---------------------------------------------------------------------------

MULTILINE = "please look at the parser\nand tell me what is wrong\twith it today"
FLATTENED = "please look at the parser and tell me what is wrong with it today"


def test_multiline_prompt_finds_the_boundary(tmp_path: Path) -> None:
    _assert_boundary_found(tmp_path, _user_str(MULTILINE), FLATTENED, "multiline")


def test_multiline_prompt_counts_this_turn(tmp_path: Path) -> None:
    _assert_same_turn_passes(tmp_path, _user_str(MULTILINE), FLATTENED, "multiline")


# ---------------------------------------------------------------------------
# CAUSE 2 --- the host truncates a long prompt with an ellipsis, so a needle
# containing that ellipsis can never match. Measured cause of 320 failures.
# ---------------------------------------------------------------------------

LONG = (
    "please look at the parser and tell me what is wrong with it, then fix "
    "every other copy of the same mistake and write a test for each one"
)
TRUNCATED = "please look at the parser and tell me what is wrong wi… fix every other copy"


def test_truncated_prompt_finds_the_boundary(tmp_path: Path) -> None:
    _assert_boundary_found(tmp_path, _user_str(LONG), TRUNCATED, "truncated")


def test_truncated_prompt_counts_this_turn(tmp_path: Path) -> None:
    _assert_same_turn_passes(tmp_path, _user_str(LONG), TRUNCATED, "truncated")


# ---------------------------------------------------------------------------
# CAUSE 3 --- hook output and system reminders are prepended to the prompt, so
# it is not the first thing in the record. Measured cause of 139 failures.
# ---------------------------------------------------------------------------

PREPENDED = (
    "<system-reminder>a reminder the host injected</system-reminder>\n"
    "UserPromptSubmit hook success: some banner text\n\n" + PLAIN
)


def test_prompt_behind_injected_text_finds_the_boundary(tmp_path: Path) -> None:
    _assert_boundary_found(tmp_path, _user_str(PREPENDED), PLAIN, "prepended")


def test_prompt_behind_injected_text_counts_this_turn(tmp_path: Path) -> None:
    _assert_same_turn_passes(tmp_path, _user_str(PREPENDED), PLAIN, "prepended")


# ---------------------------------------------------------------------------
# CAUSE 4 --- the prompt is stored as a list of text blocks, not a string.
# Measured cause of 32 failures.
# ---------------------------------------------------------------------------


def test_block_shaped_prompt_finds_the_boundary(tmp_path: Path) -> None:
    _assert_boundary_found(tmp_path, _user_blocks(PLAIN), PLAIN, "blocks")


def test_block_shaped_prompt_counts_this_turn(tmp_path: Path) -> None:
    _assert_same_turn_passes(tmp_path, _user_blocks(PLAIN), PLAIN, "blocks")


# ---------------------------------------------------------------------------
# A very short prompt. Real ones are often two characters, and a substring
# search on two characters would collide with almost any record, so these must
# match a whole record exactly rather than appearing somewhere inside one.
# ---------------------------------------------------------------------------


def test_very_short_prompt_finds_the_boundary(tmp_path: Path) -> None:
    _assert_boundary_found(tmp_path, _user_str("hi"), "hi", "short")


def test_very_short_prompt_counts_this_turn(tmp_path: Path) -> None:
    _assert_same_turn_passes(tmp_path, _user_str("hi"), "hi", "short")


def test_short_prompt_does_not_match_a_record_that_merely_contains_it(
    tmp_path: Path,
) -> None:
    """
    The PAIR that stops the short-prompt rule from being too loose.

    "hi" appears inside "this is a much longer message". If a two-character
    needle were allowed to match anywhere, that record would be mistaken for
    the prompt and the boundary would land in the wrong place.
    """
    records = [
        _user_str("this is a much longer message that merely contains hi inside it"),
        _skill(REQUIRED[0]) if REQUIRED else _skill("rtk"),
        _user_str("hi"),
        _last_prompt("hi"),
    ]
    result = _run(_write(tmp_path, records, "short-collide.jsonl"), "short-collide")
    assert result is not None, (
        "the boundary landed on a record that merely contained the prompt, so a "
        "skill from before the real prompt was counted as this turn's"
    )
