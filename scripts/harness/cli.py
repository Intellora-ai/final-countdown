#!/usr/bin/env python3
"""The harness command line: `python3 scripts/harness/cli.py <command> ...`.

What Claude or a person records in words goes in here (a hypothesis, a
reproduction, a reason a test changed, an attack's outcome). What happened is
recorded by the hooks. `advance` asks for the next phase and is refused with
the gap when the evidence is not there; `done` asks the verifier, which is the
only thing that can say complete.

State lives in `$HARNESS_ROOT` or `<cwd>/.harness`.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from harness.evidence import Store  # noqa: E402
from harness.gitinfo import head_commit as head_commit_of  # noqa: E402
from harness.memory import remember  # noqa: E402
from harness.state import PHASES, POLICIES, RISKS, Blocked, Task, advance, load, next_phase, save, start  # noqa: E402
from harness.verify import ATTACK_OUTCOMES, Verdict, run  # noqa: E402

ATTACKER_PROMPT = Path(__file__).resolve().parent / "prompts" / "attacker.md"


def root() -> Path:
    named = os.environ.get("HARNESS_ROOT", "").strip()
    return Path(named) if named else Path.cwd() / ".harness"


def now() -> str:
    """Microseconds, the same resolution the hooks write; see `hooks/_common.now`."""
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def head_commit() -> str:
    """Read from `.git` by hand: the harness runs no subprocess anywhere."""
    return head_commit_of(Path.cwd())


def open_task(where: Path) -> Task | None:
    task = load(where)
    return None if task is None or task.phase == "complete" else task


def require_task(where: Path) -> Task:
    task = open_task(where)
    if task is None:
        print("no task is open. Start one with: harness start <type> \"<title>\"")
        raise SystemExit(1)
    return task


def show(verdict: Verdict) -> None:
    print(verdict.status)
    for rule in verdict.rules:
        print(f"  [{'ok' if rule.ok else '--'}] {rule.name}: {rule.detail}")


# --- commands ---------------------------------------------------------------


def cmd_start(args: argparse.Namespace) -> int:
    where = root()
    already = open_task(where)
    if already is not None:
        print(
            f"a task is already open: {already.title!r} ({already.type}, {already.phase}). "
            "Finish it with `harness done` or close it with `harness abandon \"<why>\"`."
        )
        return 1
    task = start(args.type, args.title, now=now(), commit=head_commit(), risk=args.risk, policy=args.policy)
    save(where, task)
    print(f"started {task.type} {task.title!r} at {task.start_commit or '(no commit)'}: phase {task.phase}")
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    where = root()
    task = load(where)
    if task is None:
        if (where / "task.json").exists():
            print(f"no task can be read from {where / 'task.json'} (corrupt); remove it or fix it by hand")
        else:
            print("no task open. Start one with: harness start <type> \"<title>\"")
        return 0
    evidence = Store(where).read()
    counts: dict[str, int] = {}
    for record in evidence:
        counts[str(record.get("kind"))] = counts.get(str(record.get("kind")), 0) + 1
    print(f"{task.type} {task.title!r}: phase {task.phase} (risk {task.risk}, policy {task.policy})")
    print("evidence: " + (", ".join(f"{k}={v}" for k, v in sorted(counts.items())) or "none"))
    target = next_phase(task)
    if target is None:
        print("complete")
    elif target == "complete":
        print("next: complete -- run `harness done` and let the verifier decide")
    else:
        try:
            advance(task, evidence, now=now())
        except Blocked as blocked:
            print(f"next: {target} -- blocked: {blocked.gap}")
        else:
            print(f"next: {target} -- the evidence allows it; run `harness advance`")
    return 0


def _record(kind: str, **fields: str) -> int:
    where = root()
    require_task(where)
    Store(where).append({"at": now(), "kind": kind, **fields})
    print(f"recorded {kind}")
    return 0


def cmd_hypothesis(args: argparse.Namespace) -> int:
    return _record("hypothesis", text=args.text)


def cmd_reproduce(args: argparse.Namespace) -> int:
    return _record("reproduction", how=args.how)


def cmd_reason(args: argparse.Namespace) -> int:
    return _record("reason", text=args.text)


def cmd_attacked(args: argparse.Namespace) -> int:
    return _record("attack", outcome=args.outcome, notes=args.notes)


def cmd_advance(args: argparse.Namespace) -> int:
    where = root()
    task = require_task(where)
    try:
        moved = advance(task, Store(where).read(), now=now())
    except Blocked as blocked:
        print(f"blocked: {blocked.gap}")
        return 1
    save(where, moved)
    print(f"advanced: {task.phase} -> {moved.phase}")
    return 0


def cmd_verify(args: argparse.Namespace) -> int:
    verdict = run(root(), now=now(), commit=False)
    show(verdict)
    return 0 if verdict.status == "PASS" else 1


def cmd_done(args: argparse.Namespace) -> int:
    where = root()
    task = load(where)
    verdict = run(where, now=now(), commit=True)
    show(verdict)
    if verdict.status == "PASS":
        if task is not None:
            _remember_what_was_learned(where, task)
        print("complete")
        return 0
    print("not complete: the gaps above are what the verifier needs")
    return 1


def _remember_what_was_learned(where: Path, task: Task) -> None:
    """Failure memory: every fingerprint this task's test runs carried is filed
    under the last hypothesis and the commit that closed the task."""
    evidence = Store(where).read()
    fingerprints: list[str] = []
    for record in evidence:
        carried = record.get("fingerprints")
        if not isinstance(carried, list):
            continue
        for found in carried:
            if isinstance(found, str) and found not in fingerprints:
                fingerprints.append(found)
    if not fingerprints:
        return
    hypotheses = [str(r.get("text", "")) for r in evidence if r.get("kind") == "hypothesis"]
    remember(
        where, fingerprints,
        root_cause=hypotheses[-1] if hypotheses else task.title,
        fix_commit=head_commit(), title=task.title, now=now(),
    )
    print(f"remembered {len(fingerprints)} fingerprint(s): {', '.join(fingerprints)}")


def cmd_abandon(args: argparse.Namespace) -> int:
    where = root()
    task = require_task(where)
    with (where / "abandoned.jsonl").open("a", encoding="utf-8") as f:
        f.write(json.dumps({**asdict(task), "why": args.why, "at": now()}) + "\n")
    (where / "task.json").unlink()
    print(f"abandoned {task.title!r}: {args.why}")
    return 0


def cmd_attack(args: argparse.Namespace) -> int:
    """The attacker prompt for this task. The diff is named by the command
    that produces it rather than inlined: the harness runs no subprocess, and
    the attacker -- a person or a subagent with a shell -- runs it fresh."""
    where = root()
    task = require_task(where)
    template = ATTACKER_PROMPT.read_text(encoding="utf-8")
    base = task.start_commit or "HEAD"
    diff = (
        f"Run this first and read all of it -- the diff since the task began at {base}:\n\n"
        f"    git diff {base} -- .\n"
    )
    print(template.replace("{TITLE}", task.title).replace("{TYPE}", task.type).replace("{DIFF}", diff))
    return 0


# --- argument parsing ----------------------------------------------------------


def parser() -> argparse.ArgumentParser:
    top = argparse.ArgumentParser(prog="harness", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = top.add_subparsers(dest="command", required=True)

    p = sub.add_parser("start", help="open a task")
    p.add_argument("type", choices=list(PHASES))
    p.add_argument("title")
    p.add_argument("--risk", choices=list(RISKS), default="medium")
    p.add_argument("--policy", choices=list(POLICIES), default="warn")
    p.set_defaults(fn=cmd_start)

    sub.add_parser("status", help="phase, evidence, and what the next phase needs").set_defaults(fn=cmd_status)

    p = sub.add_parser("hypothesis", help="record a hypothesis or finding")
    p.add_argument("text")
    p.set_defaults(fn=cmd_hypothesis)

    p = sub.add_parser("reproduce", help="record how the failure was reproduced")
    p.add_argument("how")
    p.set_defaults(fn=cmd_reproduce)

    p = sub.add_parser("reason", help="record why a test changed after red")
    p.add_argument("text")
    p.set_defaults(fn=cmd_reason)

    sub.add_parser("advance", help="request the next phase").set_defaults(fn=cmd_advance)
    sub.add_parser("attack", help="print the attacker prompt filled with this task's diff").set_defaults(fn=cmd_attack)

    p = sub.add_parser("attacked", help="record the attack review's outcome")
    p.add_argument("outcome", choices=list(ATTACK_OUTCOMES))
    p.add_argument("notes")
    p.set_defaults(fn=cmd_attacked)

    sub.add_parser("verify", help="run the verifier; touch nothing").set_defaults(fn=cmd_verify)
    sub.add_parser("done", help="run the verifier; complete only on PASS").set_defaults(fn=cmd_done)

    p = sub.add_parser("abandon", help="close the task without completing it")
    p.add_argument("why")
    p.set_defaults(fn=cmd_abandon)
    return top


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    fn = args.fn
    result: int = fn(args)
    return result


if __name__ == "__main__":
    raise SystemExit(main())
