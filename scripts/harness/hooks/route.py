#!/usr/bin/env python3
"""UserPromptSubmit: classify the ask, open a task if none is open, and
suggest -- never force -- the skill that fits.

The classifier is keyword-based and deliberately dumb. Its job is to give
the work a state and hand Claude the current phase; Claude may override the
suggested skill with a stated reason. Small talk and slash commands open
nothing. What was suggested is itself recorded as evidence.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from harness.evidence import Store  # noqa: E402
from harness.hooks._common import context, guarded, head_commit, now, project_dir, read_event, root  # noqa: E402
from harness.state import Blocked, Task, advance, load, next_phase, save, start  # noqa: E402

#: In order of precedence. A prompt that says "fix" is a bug even if it also
#: says "add", because the failure is what the person is looking at.
_CLASSES: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("bug", re.compile(r"\b(fix|bug|crash(es|ed|ing)?|broken|breaks?|fails?|failing|failed|error|regression|not working|doesn'?t work|isn'?t working)\b")),
    ("investigation", re.compile(r"\b(why|investigate|find out|what is causing|what'?s causing|root cause|diagnose|explain why)\b")),
    ("refactor", re.compile(r"\b(refactor|clean ?up|rename|split|extract|simplify|tidy)\b")),
    ("spike", re.compile(r"\b(can we|is it possible|could we|prototype|spike|proof of concept|feasib\w*)\b")),
    ("config", re.compile(r"\b(config(uration)?|setting|flag|env(ironment)? var(iable)?|toggle)\b")),
    ("feature", re.compile(r"\b(add|build|implement|create|new|feature|support|introduce)\b")),
)

SUGGESTED: dict[str, str] = {
    "bug": "systematic-debugging",
    "feature": "brainstorming, then test-driven-development",
    "refactor": "test-driven-development and verification-before-completion",
    "investigation": "none forced; verification-before-completion when you report",
    "spike": "none forced; verification-before-completion when you report",
    "config": "verification-before-completion",
}


def classify(prompt: str) -> str | None:
    text = prompt.strip().lower()
    if not text or text.startswith("/") or len(text) < 8:
        return None
    for name, pattern in _CLASSES:
        if pattern.search(text):
            return name
    return None


def _describe(task: Task, where: Path) -> str:
    evidence = Store(where).read()
    target = next_phase(task)
    if target is None:
        next_line = "the task is complete"
    elif target == "complete":
        next_line = "next: complete -- run `python3 scripts/harness/cli.py done` and let the verifier decide"
    else:
        try:
            advance(task, evidence, now=now())
        except Blocked as blocked:
            next_line = f"next: {target} -- blocked until: {blocked.gap}"
        else:
            next_line = f"next: {target} -- the evidence allows it; run `python3 scripts/harness/cli.py advance`"
    return (
        f"harness: task {task.title!r} ({task.type}, risk {task.risk}) is in phase {task.phase}. "
        f"{next_line}. Suggested skill: {SUGGESTED[task.type]}. "
        "You may override the skill with a stated reason; you cannot skip the evidence."
    )


def main() -> None:
    event = read_event()
    if event is None:
        return
    prompt = event.get("prompt")
    if not isinstance(prompt, str):
        return
    where = root(event)
    store = Store(where)
    task = load(where)
    if task is not None and task.phase == "complete":
        task = None

    kind = classify(prompt)
    if task is not None:
        store.append({"at": now(), "kind": "route", "prompt_class": kind, "opened": False, "task": task.title})
        context("UserPromptSubmit", _describe(task, where))
        return
    if kind is None:
        return

    title = " ".join(prompt.split())[:80]
    task = start(kind, title, now=now(), commit=head_commit(project_dir(event)))
    save(where, task)
    store.append({"at": now(), "kind": "route", "prompt_class": kind, "opened": True, "task": title})
    context(
        "UserPromptSubmit",
        f"harness: opened {kind} task {title!r} in phase {task.phase}. Suggested skill: {SUGGESTED[kind]}. "
        "Record what you learn as you go (python3 scripts/harness/cli.py hypothesis|reproduce|reason \"...\"), "
        "advance with `python3 scripts/harness/cli.py advance`, and finish with `... done`; the verifier, "
        "not you, decides when it is complete. If this is not really a "
        f"{kind}, close it: `python3 scripts/harness/cli.py abandon \"why\"`.",
    )


if __name__ == "__main__":
    guarded(main)
