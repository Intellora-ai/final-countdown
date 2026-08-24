"""
Tests for the skill-enforcement Stop hook.

WHY THIS FILE IS NOT OPTIONAL
-----------------------------
This hook can hang every session in every repository on this machine. A Stop
hook that blocks unconditionally means no turn can ever end, and because it is
registered in user-level settings, the only way out is editing settings.json
from a different editor. That is the highest-blast-radius script in this repo
by a wide margin, and the thing guarding against it is a pair of brakes whose
correctness is not visible by reading them.

So the brakes are tested directly, and the fail-open behaviour is tested
directly, because the first version of the hook got fail-open WRONG: an
unreadable transcript returned the same empty set as a compliant-but-silent
turn, so a missing file blocked. The docstring claimed the opposite. Only the
test disagreed with the code.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any, cast

HOOK = Path(__file__).resolve().parents[1] / "scripts" / "enforce_skills.py"

# What the hook prints when it blocks. Named so every `result` below has a
# concrete type rather than `dict[Unknown, Unknown]`.
Decision = dict[str, str]

# One ("prompt" | "prompt-record" | "injected" | "skill", value) pair.
Event = tuple[str, str]


def _load_hook_module() -> Any:
    """
    Import the hook to read its REQUIRED tuple.

    The tests drive the hook as a SUBPROCESS --- that is what exercises the
    real entry point --- but they also need to know which skills it wants, and
    hardcoding that list means every change to it silently turns these tests
    into assertions about a stale expectation rather than about the gate.
    Safe to import: the module body defines only constants and functions, and
    everything that acts is behind `if __name__ == "__main__"`.
    """
    import importlib.util

    spec = importlib.util.spec_from_file_location("enforce_skills", HOOK)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


REQUIRED: tuple[str, ...] = _load_hook_module().REQUIRED


def run_hook(**event: object) -> Decision | None:
    """
    Run the hook with an event on stdin. Returns its decision, or None.

    Annotated to the parameter and cast on the way out because pyright runs
    strict here: an untyped `**event` and a bare `dict` return made every
    `result` in every test below partially-unknown, and pyright reported that
    as twenty-one errors in files that were otherwise correct. The types are
    not decoration --- without them the gate cannot see this file at all.
    """
    proc = subprocess.run(
        [sys.executable, str(HOOK)],
        input=json.dumps(event),
        capture_output=True,
        text=True,
        timeout=30,
    )
    # The hook must ALWAYS exit 0. A non-zero exit from a Stop hook is an
    # outage, not a signal, so this is asserted on every single case rather
    # than in a test of its own.
    assert proc.returncode == 0, proc.stderr
    out = proc.stdout.strip()
    if not out:
        return None
    return cast(Decision, json.loads(out))


def transcript(tmp_path: Path, *skills: str, truncated: bool = False) -> str:
    """A minimal JSONL transcript in which `skills` were invoked."""
    path = tmp_path / "transcript.jsonl"
    lines = [
        json.dumps(
            {"message": {"content": [
                {"type": "tool_use", "name": "Skill", "input": {"skill": s}}
            ]}}
        )
        for s in skills
    ]
    text = "".join(line + "\n" for line in lines)
    if truncated:
        # A transcript is written while this hook reads it, so the last line is
        # routinely a partial write. That is a race to ignore, not an error.
        text += '{"message":{"content":[{"type":"tool_use","name":"Sk'
    path.write_text(text, encoding="utf-8")
    return str(path)


def test_blocks_when_no_required_skill_was_invoked(tmp_path: Path):
    result = run_hook(transcript_path=transcript(tmp_path), session_id="a")
    assert result is not None
    assert result["decision"] == "block"
    for s in REQUIRED:
        assert f"/{s}" in result["reason"]


def test_passes_when_every_required_skill_was_invoked(tmp_path: Path):
    path = transcript(tmp_path, *REQUIRED)
    assert run_hook(transcript_path=path, session_id="b") is None


def test_names_only_the_missing_skill(tmp_path: Path):
    """A gate that re-lists satisfied requirements teaches people to skim it."""
    satisfied = [s for s in REQUIRED if s != "investigate"]
    result = run_hook(transcript_path=transcript(tmp_path, *satisfied), session_id="c")
    assert result is not None
    assert "/investigate" in result["reason"]
    for s in satisfied:
        assert f"/{s}" not in result["reason"]


def test_accepts_plugin_prefixed_and_slash_prefixed_names(tmp_path: Path):
    """`pr-review-toolkit:rtk` and `/rtk` are the same skill to a human."""
    path = transcript(tmp_path, "pr-review-toolkit:rtk", "superpowers:systematic-debugging",
                      *[s for s in REQUIRED if s not in ("rtk", "systematic-debugging")])
    assert run_hook(transcript_path=path, session_id="d") is None


def test_stop_hook_active_never_blocks(tmp_path: Path):
    """Brake 1. Blocking while already resumed by a Stop hook IS the loop."""
    result = run_hook(
        transcript_path=transcript(tmp_path),
        session_id="e",
        stop_hook_active=True,
    )
    assert result is None


def test_ledger_caps_repeated_blocks(tmp_path: Path):
    """Brake 2. Independent of brake 1, so either alone ends the loop."""
    path = transcript(tmp_path)
    assert run_hook(transcript_path=path, session_id="f") is not None
    assert run_hook(transcript_path=path, session_id="f") is not None
    # Third attempt gives up rather than holding the session hostage.
    assert run_hook(transcript_path=path, session_id="f") is None


def test_ledger_is_per_session(tmp_path: Path):
    """One session exhausting its blocks must not disarm the next one."""
    path = transcript(tmp_path)
    for _ in range(3):
        run_hook(transcript_path=path, session_id="g")
    assert run_hook(transcript_path=path, session_id="h") is not None


def test_unreadable_transcript_fails_open(tmp_path: Path):
    """
    THE REGRESSION. No evidence of a violation is not evidence of one.

    The first implementation returned an empty set on OSError, which is what a
    fully compliant transcript containing no Skill calls also returns --- so a
    missing file was treated as a violation and blocked.
    """
    missing = str(tmp_path / "does-not-exist.jsonl")
    assert run_hook(transcript_path=missing, session_id="i") is None


def test_truncated_final_line_does_not_crash(tmp_path: Path):
    """The transcript is appended to while this reads it."""
    path = transcript(tmp_path, *REQUIRED, truncated=True)
    assert run_hook(transcript_path=path, session_id="j") is None


def test_malformed_event_fails_open():
    """A broken payload must not become an outage for every turn."""
    proc = subprocess.run(
        [sys.executable, str(HOOK)],
        input="not json at all",
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert proc.returncode == 0
    assert proc.stdout.strip() == ""


def test_missing_transcript_path_fails_open():
    assert run_hook(session_id="k") is None


def turn_transcript(tmp_path: Path, *events: Event) -> str:
    """
    A transcript with real turn boundaries, IN THE ORDER THE HOST WRITES THEM.

    That ordering is the whole point of this helper and it is not obvious.
    A ("prompt", text) event emits TWO records:

        {"type": "user",        "message": {"content": text}}   <- turn starts
        ... whatever the model does ...
        {"type": "last-prompt", "lastPrompt": text}             <- written LATE

    The host writes `last-prompt` AFTER the model's first tool calls. An
    earlier version of this helper wrote it first, which is the order the code
    assumed and NOT the order the host produces --- so the whole turn-scope
    suite was green against a fiction while the real hook blocked compliant
    turns. Use ("prompt-record",) to place the late record explicitly.
    """
    lines: list[str] = []
    for event in events:
        kind = event[0]
        value = event[1] if len(event) > 1 else ""
        if kind == "prompt":
            lines.append(json.dumps({"type": "user", "message": {"role": "user", "content": value}}))
        elif kind == "prompt-record":
            lines.append(json.dumps({"type": "last-prompt", "lastPrompt": value}))
        elif kind == "injected":
            # A skill body coming back as a user record.
            lines.append(json.dumps({"type": "user", "message": {"role": "user", "content": value}}))
        else:
            lines.append(
                json.dumps({"message": {"content": [
                    {"type": "tool_use", "name": "Skill", "input": {"skill": value}}
                ]}})
            )
    path = tmp_path / "turns.jsonl"
    path.write_text("".join(x + "\n" for x in lines), encoding="utf-8")
    return str(path)


def test_skills_invoked_before_the_late_last_prompt_record_still_count(tmp_path: Path):
    """
    THE REGRESSION. The gate blocked turns that had complied FIRST THING.

    The host writes `last-prompt` after the model's opening tool calls.
    Measured on real sessions: user record #837 / last-prompt #855, and #978 /
    #1002, with the Skill calls at #844,#849 and #985,#986 --- i.e. before the
    boundary the old code used, and therefore discarded.

    The result was a gate that punished the compliant order and rewarded
    invoking the skills late, costing one spurious block and one discarded
    response every single turn. A model optimising against it would learn to
    answer first and invoke afterwards, which is the exact opposite of the
    behaviour it exists to produce.
    """
    path = turn_transcript(
        tmp_path,
        ("prompt", "do the thing"),
        *[("skill", s) for s in REQUIRED],
        ("injected", "Base directory for this skill: /Users/x/.claude/skills/rtk"),
        ("prompt-record", "do the thing"),
        ("skill", "some-other-skill"),
    )
    assert run_hook(transcript_path=path, session_id="late") is None


def test_truncated_last_prompt_still_finds_its_turn(tmp_path: Path):
    """
    `lastPrompt` is ellipsis-truncated for long prompts.

    Exact-equality matching looks right and silently never matches a long
    prompt, which puts the boundary at 0 and turns `turn` scope back into
    `session` scope with no visible failure.
    """
    long_prompt = "PLEASE DO THE FOLLOWING VERY LONG THING " + "x" * 300
    path = turn_transcript(
        tmp_path,
        ("prompt", "an earlier prompt entirely"),
        *[("skill", s) for s in REQUIRED],
        ("prompt-record", "an earlier prompt entirely"),
        ("prompt", long_prompt),
        ("prompt-record", long_prompt[:180] + "…"),
    )
    result = run_hook(transcript_path=path, session_id="trunc")
    # The new turn has invoked nothing, so it must block --- proving the
    # boundary actually moved to the long prompt rather than staying at 0.
    assert result is not None
    assert "/rtk" in result["reason"]


def test_credit_does_not_carry_across_turns(tmp_path: Path):
    """
    THE POINT OF `turn` SCOPE.

    Both skills ran for prompt one. Prompt two has run neither, and must be
    blocked --- if satisfying the gate once bought silence for the rest of the
    session, this would be session scope wearing a different name.
    """
    path = turn_transcript(
        tmp_path,
        ("prompt", "first question"),
        *[("skill", s) for s in REQUIRED],
        ("prompt-record", "first question"),
        ("prompt", "second question"), ("prompt-record", "second question"),
        ("prompt-record", "second question"),
    )
    result = run_hook(transcript_path=path, session_id="t1")
    assert result is not None
    for s in REQUIRED:
        assert f"/{s}" in result["reason"]


def test_skills_rerun_in_the_new_turn_satisfy_it(tmp_path: Path):
    path = turn_transcript(
        tmp_path,
        ("prompt", "first question"),
        *[("skill", s) for s in REQUIRED],
        ("prompt", "second question"), ("prompt-record", "second question"),
        *[("skill", s) for s in REQUIRED],
    )
    assert run_hook(transcript_path=path, session_id="t2") is None


def test_repeated_last_prompt_records_are_one_turn(tmp_path: Path):
    """
    The host rewrites `last-prompt` with the SAME text many times inside one
    turn. Treating each write as a new turn would clear the credit the model
    just earned, and the gate could never be satisfied.
    """
    path = turn_transcript(
        tmp_path,
        # ONE user record --- the host writes exactly one per prompt --- and
        # several `last-prompt` rewrites carrying the same text as the turn
        # proceeds. That repetition is what the retry path depended on, and it
        # must not move the boundary or clear credit.
        ("prompt", "one question"),
        *[("skill", s) for s in REQUIRED[:2]],
        ("prompt-record", "one question"),
        *[("skill", s) for s in REQUIRED[2:]],
        ("prompt-record", "one question"),
        ("prompt-record", "one question"),
    )
    assert run_hook(transcript_path=path, session_id="t3") is None


def test_skill_body_injection_does_not_reset_the_turn(tmp_path: Path):
    """
    THE BUG THAT MADE THE `user` RECORD CARRYING THE PROMPT THE BOUNDARY.

    Invoking a skill injects its body back as a `type: "user"` record. A
    boundary built on "last user record" would reset on every skill preamble,
    so the gate would clear the credit it had just been given, forever.
    """
    lines = [json.dumps({"type": "last-prompt", "lastPrompt": "q"})]
    for skill in REQUIRED:
        lines.append(json.dumps({"message": {"content": [
            {"type": "tool_use", "name": "Skill", "input": {"skill": skill}}]}}))
        # The skill body coming back, exactly as the host writes it.
        lines.append(json.dumps({"type": "user", "message": {"role": "user", "content":
            f"Base directory for this skill: /Users/x/.claude/skills/{skill}"}}))
    path = tmp_path / "injected.jsonl"
    path.write_text("".join(x + "\n" for x in lines), encoding="utf-8")
    assert run_hook(transcript_path=str(path), session_id="t4") is None


def test_ledger_budget_is_per_turn_not_per_session(tmp_path: Path):
    """
    A session-keyed ledger would spend its whole budget on turn one and leave
    every later prompt ungated --- the gate switching itself off while still
    looking installed.
    """
    first = turn_transcript(tmp_path, ("prompt", "q1"), ("prompt-record", "q1"))
    for _ in range(3):
        run_hook(transcript_path=first, session_id="t5")
    # Budget for q1 is gone. A NEW prompt must still be gated.
    second = turn_transcript(
        tmp_path,
        ("prompt", "q1"), ("prompt-record", "q1"),
        ("prompt", "q2"), ("prompt-record", "q2"),
    )
    assert run_hook(transcript_path=second, session_id="t5") is not None


def test_installed_copy_matches_this_one():
    """
    The hook has to live in ~/.claude/hooks to run in EVERY repo, not just this
    one --- so there are two copies, and two copies drift. Every test above
    runs against the repo copy, which means a stale installed copy would be
    fully green and completely unenforced.

    Skipped rather than failed when the hook is not installed: a fresh clone on
    a machine that never installed it is not a broken repository.
    """
    import hashlib
    import os
    import pytest

    installed = Path(os.path.expanduser("~/.claude/hooks/enforce_skills.py"))
    if not installed.exists():
        pytest.skip("hook not installed on this machine")

    def digest(p: Path) -> str:
        return hashlib.sha256(p.read_bytes()).hexdigest()

    assert digest(installed) == digest(HOOK), (
        f"{installed} has drifted from {HOOK}. The tests all run against the "
        f"repo copy, so this suite passing says nothing about what actually "
        f"runs. Re-copy: cp '{HOOK}' '{installed}'"
    )


def test_reminder_hook_names_exactly_the_skills_the_gate_requires():
    """
    THE DRIFT THAT ACTUALLY HAPPENED, AND THE ONE NOTHING WATCHED.

    Two files carry the skill list and neither is derived from the other.
    `enforce_skills.py` is the Stop hook and the only one that can REFUSE a
    turn. `~/.claude/hooks/force-skills.py` is the UserPromptSubmit reminder
    that tells the session which skills to invoke.

    On 2026-08-25 they disagreed: the gate had been raised to five while the
    reminder still named three. The session invoked the three it was told
    about, and the gate refused the turn demanding two skills nothing had
    mentioned. It happened twice before anyone noticed. force-skills.py's own
    header states the gap plainly --- "Nothing keeps the REMINDER in step
    except reading this."

    Reading is not a mechanism. This test is.

    A skill the gate requires but the reminder omits is a turn refused with no
    warning. A skill the reminder names but the gate ignores is noise that
    trains the reader to skim the list. Both directions are caught here.

    PARSED WITH `ast`, NEVER IMPORTED. Importing force-skills.py runs it, and
    it WRITES ~/.claude/config.json as a side effect. A test that mutates the
    user's real config in order to read a list is a worse defect than the one
    it guards against.

    Skipped rather than failed when the reminder is not installed: a fresh
    clone on a machine that never installed the hooks is not a broken
    repository. Same rule as test_installed_copy_matches_this_one above.
    """
    import ast
    import os

    import pytest

    reminder = Path(os.path.expanduser("~/.claude/hooks/force-skills.py"))
    if not reminder.exists():
        pytest.skip("reminder hook not installed on this machine")

    tree = ast.parse(reminder.read_text(encoding="utf-8"))
    listed: list[str] | None = None
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id == "REQUIRED_SKILLS":
                listed = [str(ast.literal_eval(e)) for e in cast(ast.List, node.value).elts]

    assert listed is not None, (
        f"{reminder} has no REQUIRED_SKILLS assignment, so the reminder cannot be "
        f"compared against the gate at all. If it was renamed, this test must "
        f"follow it rather than be deleted --- an unreadable list is exactly the "
        f"state that lets the two drift unnoticed."
    )

    def norm(names: list[str]) -> list[str]:
        """`/caveman` and `caveman:caveman` are the same skill to the gate."""
        return sorted(n.lstrip("/").split(":")[-1] for n in names)

    gate = norm(list(_load_hook_module().REQUIRED))
    assert norm(listed) == gate, (
        f"the reminder and the gate disagree, which is the failure that blocked "
        f"two turns.\n"
        f"  reminder ({reminder}): {norm(listed)}\n"
        f"  gate     ({HOOK}): {gate}\n"
        f"Change both or neither."
    )
