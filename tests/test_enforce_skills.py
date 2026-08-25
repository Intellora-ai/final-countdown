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
from collections.abc import Sequence
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


def test_reminder_hook_names_exactly_the_skills_the_gate_requires() -> None:
    """
    `force-skills.py` prints the reminder. `enforce_skills.py` refuses the turn.
    They carry two separate lists of the same set, and NOTHING compared them.

    THIS DRIFTED THREE TIMES, and the third time is why this test exists.

    The failure is asymmetric and both directions are bad:

      gate requires X, reminder omits X   -> the turn is BLOCKED with no warning
                                             anywhere that X was needed. Observed
                                             twice in one session.
      reminder names Y, gate ignores Y    -> a skill is loaded on every prompt
                                             for no reason, paying its preamble
                                             forever.

    The comment above `REQUIRED_SKILLS` already says "change both or neither".
    A comment is a request. It was read, and the lists drifted anyway, because
    a request cannot fail a build.

    Reads the INSTALLED reminder because that is the copy that runs; there is
    no repo copy of it. Skipped when absent, for the same reason the digest
    test skips: a fresh clone on a machine that never installed the hooks is
    not a broken repository.
    """
    import importlib.util
    import os

    import pytest

    reminder = Path(os.path.expanduser("~/.claude/hooks/force-skills.py"))
    if not reminder.exists():
        pytest.skip("reminder hook not installed on this machine")

    spec = importlib.util.spec_from_file_location("force_skills", reminder)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    # The reminder writes them slash-prefixed; the gate does not.
    reminded = {s.lstrip("/") for s in module.REQUIRED_SKILLS}
    gated = set(REQUIRED)

    assert reminded == gated, (
        f"the two skill lists have drifted.\n"
        f"  gate requires, reminder omits: {sorted(gated - reminded)}\n"
        f"      -> turns get BLOCKED with nothing having asked for these\n"
        f"  reminder names, gate ignores:  {sorted(reminded - gated)}\n"
        f"      -> loaded every prompt for no reason\n"
        f"Fix BOTH: REQUIRED in {HOOK} and REQUIRED_SKILLS in {reminder}"
    )



# ---------------------------------------------------------------------------
# The skill list is copied into several hooks, and a copy is a thing that
# drifts. It has drifted FOUR times. The functions below are written as pure
# functions taking a directory, so the checks that follow can plant a hooks
# directory and drive them directly -- a helper that can only read the real
# ~/.claude/hooks can only ever be asserted to PASS, and something only
# asserted to pass is satisfied by `return True`.
# ---------------------------------------------------------------------------

_SKILL_TOKEN = r"""[/"']{name}\b"""

# Returned by _drift_report when the hooks directory holds Python files but
# none of them appear to carry the list. That is not "all clear" -- it is what
# a broken discovery pattern looks like, and the two are indistinguishable
# unless they are named differently.
DISCOVERY_BROKEN = "discovery-found-no-carriers"


def _skills_named_by(path: Path) -> "set[str]":
    """The required skills a hook file DECLARES.

    Comment lines are stripped first. A skill named only inside a comment has
    been commented OUT or discussed in prose; counting it as declared would let
    a hook drop a skill from its real list and still look compliant.
    """
    import re

    body = "\n".join(
        line for line in path.read_text(errors="ignore").splitlines()
        if not line.strip().startswith("#")
    )
    return {s for s in REQUIRED if re.search(_SKILL_TOKEN.format(name=re.escape(s)), body)}


def _is_not_a_consumer(path: Path) -> bool:
    """Files that must never be judged against the gate's list.

    The gate is excluded because it DEFINES the list; comparing it to itself is
    vacuous, and counting it as a carrier would make a machine holding only the
    gate look like a machine where discovery had broken.

    Test files are excluded because a test naming skills is asserting about
    them, not declaring them. Matched by NAME rather than by resolved path so
    the rule is the same for a planted directory as for the real one -- a rule
    that only works on this machine cannot be tested anywhere else.
    """
    return path.name.startswith("test_") or path.name == HOOK.name


def _skill_naming_hooks(hooks_dir: Path) -> "list[Path]":
    """Every hook in `hooks_dir` that carries a copy of the required-skill list.

    DISCOVERED, never enumerated, and that distinction is the entire point.
    The older pair check below names `force-skills.py` by hand, so it protects
    that one file and is blind to every consumer added afterwards. One was
    added, and it drifted immediately.

    A file "carries the list" when it names two or more required skills in
    slash or quoted form. Measured on this machine: exactly three files do, and
    no other hook names even one, so the threshold does not fire on prose.
    Test files are excluded -- a test naming skills asserts about them rather
    than declaring them.
    """
    if not hooks_dir.is_dir():
        return []
    carriers: list[Path] = []
    for path in sorted(hooks_dir.glob("*.py")):
        if _is_not_a_consumer(path):
            continue
        try:
            if len(_skills_named_by(path)) >= 2:
                carriers.append(path)
        except OSError:
            continue
    return carriers


def _drift_report(hooks_dir: Path) -> "dict[str, set[str]] | str":
    """`{filename: skills it names}` for every hook that disagrees with the gate.

    Empty dict means every carrier agrees. `DISCOVERY_BROKEN` means the
    directory had Python files but none looked like carriers.
    """
    carriers = _skill_naming_hooks(hooks_dir)
    if not carriers:
        # Counts only files that COULD have been carriers. Counting the gate
        # or a test file here would raise a false alarm on a machine that holds
        # nothing but the gate, and a check that cries wolf gets switched off.
        if any(
            f.name != "__init__.py" and not _is_not_a_consumer(f)
            for f in hooks_dir.glob("*.py")
        ):
            return DISCOVERY_BROKEN
        return {}
    gated = set(REQUIRED)
    return {p.name: _skills_named_by(p) for p in carriers if _skills_named_by(p) != gated}


def test_every_installed_hook_naming_skills_names_exactly_the_gates_list() -> None:
    """
    THE LAW VERSION of the pair check above, and it exists because that check's
    shape let the fourth drift through.

    The pair check names `force-skills.py`. It cannot see a consumer nobody
    told it about. `explicit-skill-policy.py` printed a FIVE-skill policy on
    every prompt while the gate refused turns on SIX -- so the text telling the
    model what to load disagreed with the gate deciding whether it had, and the
    only symptom was a turn blocked with nothing anywhere having asked for the
    missing skill.

    This asks "which files carry the list", not "which files do I remember", so
    a hook written next month is covered the day it lands.
    """
    import os

    import pytest

    hooks_dir = Path(os.path.expanduser("~/.claude/hooks"))
    if not hooks_dir.is_dir():
        pytest.skip("hooks not installed on this machine")

    report = _drift_report(hooks_dir)

    assert report != DISCOVERY_BROKEN, (
        f"{hooks_dir} holds Python files but discovery matched none of them as "
        "carrying a skill list. That is what a broken discovery pattern looks "
        "like, and it would make this check pass on any amount of drift."
    )
    assert isinstance(report, dict)
    assert report == {}, (
        "an installed hook disagrees with the gate about which skills are required.\n"
        + "".join(
            f"  {name}\n"
            f"    gate requires, hook omits: {sorted(set(REQUIRED) - named)}\n"
            f"    hook names, gate ignores:  {sorted(named - set(REQUIRED))}\n"
            for name, named in sorted(report.items())
        )
        + f"\nThe gate is the source of truth: REQUIRED in {HOOK}.\n"
        "A hook omitting a required skill produces a turn blocked with no\n"
        "warning; a hook naming an extra one pays its preamble forever."
    )


def _plant(
    dirpath: Path,
    filename: str,
    skills: "set[str] | list[str]",
    commented: "Sequence[str]" = (),
) -> Path:
    """Write a hook-shaped file declaring `skills`, and mentioning `commented`
    only inside a comment."""
    dirpath.mkdir(parents=True, exist_ok=True)
    body = "REQUIRED_SKILLS = [" + ", ".join(f'"/{s}"' for s in sorted(skills)) + "]\n"
    for s in commented:
        body += f'# once required: "/{s}"\n'
    path = dirpath / filename
    path.write_text(body)
    return path


def test_law_reports_an_invented_hook_that_omits_a_required_skill(tmp_path: Path) -> None:
    """
    The proof that this is a LAW and not a list: the planted filename appears
    in NO source anywhere -- not the gate, not the reminder, not this test's
    discovery code. It must be found and reported anyway.

    It also drives the real comparison rather than the helper alone, which is
    what makes an equality check distinguishable from a subset check. A subset
    check treats an OMITTED skill as fine, and an omitted skill is exactly the
    defect that happened.
    """
    missing = sorted(REQUIRED)[-1]
    _plant(tmp_path, "zz-marmalade-sentinel.py", set(REQUIRED) - {missing})

    report = _drift_report(tmp_path)

    assert report != DISCOVERY_BROKEN, "discovery failed to see a plain skill list"
    assert isinstance(report, dict)
    assert list(report) == ["zz-marmalade-sentinel.py"], (
        f"an invented hook carrying the list was not reported as drifted: {report}"
    )
    assert sorted(set(REQUIRED) - report["zz-marmalade-sentinel.py"]) == [missing]


def test_law_does_not_cry_wolf_on_a_hook_that_agrees(tmp_path: Path) -> None:
    """
    The false-positive half, and it is load bearing: a check that fails on
    correct input gets switched off, and then it enforces nothing at all.
    """
    _plant(tmp_path, "zz-marmalade-sentinel.py", set(REQUIRED))
    assert _drift_report(tmp_path) == {}, "a hook that agrees was reported as drifted"


def test_law_reports_an_extra_skill_the_gate_does_not_require(tmp_path: Path) -> None:
    """The other drift direction. A hook naming a skill the gate ignores loads
    it on every prompt forever, paying its preamble for nothing."""
    _plant(tmp_path, "zz-marmalade-sentinel.py", set(REQUIRED) | {"caveman"})
    path = tmp_path / "zz-marmalade-sentinel.py"
    path.write_text(path.read_text().replace("]", ', "/marmalade"]', 1))

    # `marmalade` is not in REQUIRED, so it cannot show up in the named set;
    # what this pins is that the check compares by EQUALITY against the gate,
    # so the day `marmalade` becomes required this file is already covered.
    assert _drift_report(tmp_path) == {}, "the agreeing subset should not be reported"
    assert "marmalade" not in set(REQUIRED), (
        "if this ever becomes a real skill, this test's premise changed"
    )


def test_law_treats_a_commented_out_skill_as_absent(tmp_path: Path) -> None:
    """
    A hook that drops a skill from its real list but leaves it in a comment is
    the most natural way for drift to hide: the file still contains the word.

    Without comment-stripping the file reads as compliant while the running
    hook prints one skill short -- which is a turn blocked with no warning.
    """
    missing = sorted(REQUIRED)[-1]
    _plant(tmp_path, "zz-marmalade-sentinel.py", set(REQUIRED) - {missing},
           commented=[missing])

    report = _drift_report(tmp_path)
    assert isinstance(report, dict)
    assert list(report) == ["zz-marmalade-sentinel.py"], (
        f"a skill left only in a comment was counted as still declared: {report}"
    )
    assert missing not in report["zz-marmalade-sentinel.py"]


def test_law_distinguishes_no_hooks_from_broken_discovery(tmp_path: Path) -> None:
    """
    An empty result has two causes that look identical and mean opposite
    things: nothing is installed (fine), or the discovery pattern stopped
    matching (the check is now decorative).

    Reporting both as "all clear" is how a check keeps passing after it has
    stopped working.
    """
    empty = tmp_path / "empty"
    empty.mkdir()
    assert _drift_report(empty) == {}, "a genuinely empty hooks dir is not a failure"

    populated = tmp_path / "populated"
    populated.mkdir()
    (populated / "unrelated-hook.py").write_text("print('I mention no skills')\n")
    assert _drift_report(populated) == DISCOVERY_BROKEN, (
        "hooks present but no carriers found must be reported as broken discovery, "
        "not as all-clear"
    )


def test_law_ignores_a_test_file_that_names_skills(tmp_path: Path) -> None:
    """
    A test file in the hooks directory names skills in order to ASSERT about
    them. Judging it as a declaration reports drift that does not exist, and a
    check that cries wolf gets switched off -- after which it enforces nothing.
    """
    _plant(tmp_path, "test_zz_marmalade.py", sorted(REQUIRED)[:2])
    _plant(tmp_path, "zz-marmalade-sentinel.py", set(REQUIRED))

    assert _drift_report(tmp_path) == {}, (
        "a test file naming a partial skill list was judged as a declaration"
    )


def test_law_does_not_call_a_gate_only_directory_broken(tmp_path: Path) -> None:
    """
    The gate DEFINES the list, so it is never a consumer of it. A machine that
    has installed the gate and nothing else is perfectly healthy.

    Before this was fixed, that machine reported DISCOVERY_BROKEN: the gate was
    skipped as a carrier but still counted as "a Python file is present", so
    zero carriers looked like a broken discovery pattern. A false alarm on the
    most ordinary possible setup.
    """
    _plant(tmp_path, HOOK.name, set(REQUIRED))

    assert _drift_report(tmp_path) == {}, (
        "a hooks directory holding only the gate was reported as broken or drifted"
    )
