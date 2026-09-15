from pathlib import Path

ROOT = Path('.')


def replace_once(path: str, old: str, new: str) -> None:
    p = ROOT / path
    s = p.read_text()
    if old not in s:
        if new in s:
            return
        raise SystemExit(f'{path}: anchor not found: {old[:100]!r}')
    p.write_text(s.replace(old, new, 1))


# state.py: make dataclass defaults and transitions statically typed.
replace_once('scripts/harness/state.py', 'TASK_FILE = "task.json"\n\n\nclass Blocked', 'TASK_FILE = "task.json"\n\n\ndef _empty_history() -> list[dict[str, str]]:\n    return []\n\n\nclass Blocked')
replace_once('scripts/harness/state.py', '    history: list[dict[str, str]] = field(default_factory=list)\n', '    history: list[dict[str, str]] = field(default_factory=_empty_history)\n')
replace_once('scripts/harness/state.py', '''def _moved(task: Task, target: str, now: str, *, because: str) -> Task:\n    return Task(\n        **{\n            **asdict(task),\n            "phase": target,\n            "history": [*task.history, {"at": now, "from": task.phase, "to": target, "because": because}],\n        }\n    )\n''', '''def _moved(task: Task, target: str, now: str, *, because: str) -> Task:\n    return Task(\n        type=task.type,\n        title=task.title,\n        phase=target,\n        risk=task.risk,\n        policy=task.policy,\n        started_at=task.started_at,\n        start_commit=task.start_commit,\n        history=[*task.history, {"at": now, "from": task.phase, "to": target, "because": because}],\n    )\n''')

# cli.py: narrow the JSON-loaded fingerprint list for strict pyright.
replace_once('scripts/harness/cli.py', 'from pathlib import Path\n', 'from pathlib import Path\nfrom typing import Any, cast\n')
replace_once('scripts/harness/cli.py', '        for found in carried:\n', '        for found in cast(list[Any], carried):\n')

# Test fixtures: avoid reconstructing dataclasses through an untyped __dict__.
replace_once('tests/test_harness_cli.py', '        for record in (\n', '        records: list[dict[str, Any]] = [\n')
replace_once('tests/test_harness_cli.py', '        ):\n            store.append(record)\n', '        ]\n        for record in records:\n            store.append(record)\n')

replace_once('tests/test_harness_hooks.py', 'from typing import Any\n', 'from typing import Any, cast\n')
replace_once('tests/test_harness_hooks.py', '    return Store(project / ".harness").read()\n', '    return cast(list[dict[str, Any]], Store(project / ".harness").read())\n')
replace_once('tests/test_harness_hooks.py', 'from pathlib import Path\n', 'from pathlib import Path\nfrom dataclasses import replace\n')
replace_once('tests/test_harness_hooks.py', '    placed = Task(**{**task.__dict__, "phase": phase})\n', '    placed = replace(task, phase=phase)\n')

replace_once('tests/test_harness_state.py', 'from pathlib import Path\n', 'from pathlib import Path\nfrom dataclasses import replace\n')
replace_once('tests/test_harness_state.py', '    return Task(**{**task.__dict__, "phase": phase})\n', '    return replace(task, phase=phase)\n')

replace_once('tests/test_harness_verify.py', 'from pathlib import Path\n', 'from pathlib import Path\nfrom dataclasses import replace\n')
replace_once('tests/test_harness_verify.py', '    return Task(**{**made.__dict__, "phase": phase})\n', '    return replace(made, phase=phase)\n')

print('pyright repair applied')
