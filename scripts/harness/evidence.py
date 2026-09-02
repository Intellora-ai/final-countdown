"""The evidence store and the test oracle.

EVIDENCE IS WHAT HAPPENED, NOT WHAT WAS SAID. Records come from hooks that saw
a command run or a file change, and from the CLI when a person or Claude writes
a hypothesis, a reproduction or a reason down in words. The verifier reads only
this file.

THE ORACLE PARSES; IT NEVER RUNS. It turns the text a test runner printed into
numbers. Text it cannot read is no evidence -- `None` -- and the verifier treats
`None` as unknown, never as a pass. That is the whole reason it is narrow.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

EVIDENCE_FILE = "evidence.jsonl"


class Store:
    """Append-only JSON lines. A torn final line is skipped on read."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.path = root / EVIDENCE_FILE

    def append(self, record: dict[str, Any]) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    def read(self) -> list[dict[str, Any]]:
        try:
            text = self.path.read_text(encoding="utf-8")
        except OSError:
            return []
        out: list[dict[str, Any]] = []
        for line in text.splitlines():
            if not line.strip():
                continue
            try:
                parsed = json.loads(line)
            except ValueError:
                continue
            if isinstance(parsed, dict):
                out.append(parsed)
        return out


# --- which file is a test, which is the product ------------------------------

_TEST_DIRS = {"tests", "test", "e2e", "features", "__tests__"}
_PRODUCTION_DIRS = {"src", "server", "scripts"}
_TEST_NAMES = (
    re.compile(r"^test_.*\.py$"),
    re.compile(r".*_test\.py$"),
    re.compile(r"^conftest\.py$"),
    re.compile(r".*\.test\.[a-z]+$"),
    re.compile(r".*\.spec\.[a-z]+$"),
)


def classify_path(path: str) -> str:
    """`test`, `production` or `other`, by where the file sits and what it is called."""
    parts = [p for p in path.replace("\\", "/").split("/") if p]
    if not parts:
        return "other"
    name = parts[-1]
    if any(p in _TEST_DIRS for p in parts[:-1]) or any(rx.match(name) for rx in _TEST_NAMES):
        return "test"
    if any(p in _PRODUCTION_DIRS for p in parts[:-1]):
        return "production"
    return "other"


# --- which command is a test run, which is verification ---------------------

_SEGMENT_SPLIT = re.compile(r"\s*(?:&&|\|\||;|\|)\s*")


def _executables(command: str) -> list[list[str]]:
    """The token list of every segment, with `cd x`, env assignments and
    interpreter wrappers stripped, so the first token is the program."""
    out: list[list[str]] = []
    for segment in _SEGMENT_SPLIT.split(command):
        tokens = segment.split()
        while tokens and (tokens[0] == "cd" or "=" in tokens[0] or tokens[0] in {"timeout", "env", "sudo"}):
            if tokens[0] == "cd" or tokens[0] == "timeout":
                tokens = tokens[2:]
            else:
                tokens = tokens[1:]
        if tokens:
            tokens[0] = tokens[0].rsplit("/", 1)[-1]
            out.append(tokens)
    return out


def _runner_of(tokens: list[str]) -> str | None:
    head = tokens[0]
    rest = tokens[1:]
    if head == "pytest":
        return "pytest"
    if head.startswith("python") and rest[:2] == ["-m", "pytest"]:
        return "pytest"
    if head == "vitest":
        return "vitest"
    if head == "playwright" and rest[:1] == ["test"]:
        return "playwright"
    if head == "npx" and rest:
        return _runner_of(rest)
    if head == "npm":
        if rest[:1] == ["test"]:
            return "vitest"
        if rest[:1] == ["run"] and len(rest) > 1:
            script = rest[1]
            if script.startswith("test:laws") or script in {"test:e2e", "test:browserstack", "test:saucelabs"}:
                return "playwright"
            if script.startswith("test"):
                return "vitest"
    return None


def looks_like_test_command(command: str) -> str | None:
    """The runner a command invokes, or None: only the program position counts,
    so `cat pytest.ini` and `echo pytest` are not test runs."""
    for tokens in _executables(command):
        runner = _runner_of(tokens)
        if runner is not None:
            return runner
    return None


_VERIFIERS = {"ruff", "pyright", "mypy", "tsc", "eslint", "pytest", "vitest", "playwright", "bandit"}
_NPM_VERIFY_SCRIPTS = re.compile(r"^(typecheck|lint|test).*")


def looks_like_verification(command: str) -> bool:
    for tokens in _executables(command):
        head, rest = tokens[0], tokens[1:]
        if head in _VERIFIERS:
            return True
        if head.startswith("python") and rest[:1] == ["-m"] and len(rest) > 1 and rest[1] in _VERIFIERS:
            return True
        if head == "npx" and rest and rest[0] in _VERIFIERS:
            return True
        if head == "npm" and (rest[:1] == ["test"] or (rest[:1] == ["run"] and len(rest) > 1 and _NPM_VERIFY_SCRIPTS.match(rest[1]))):
            return True
    return False


# --- the oracle: numbers from what a runner printed ------------------------

_PYTEST_COUNT = re.compile(r"\b(\d+) (passed|failed|errors?|skipped|xfailed|xpassed|deselected|warnings?)\b")
_PYTEST_TAIL = re.compile(r"\bin [\d.]+s\b")
_VITEST_TESTS = re.compile(r"^\s*Tests\s+(.+?)\s*\((\d+)\)\s*$")
_VITEST_COUNT = re.compile(r"(\d+) (failed|passed|skipped|todo)")
_PLAYWRIGHT_LINE = re.compile(r"^\s*(\d+) (passed|failed|flaky|skipped|did not run)\b")


def parse_test_output(runner: str, text: str) -> dict[str, Any] | None:
    """`{runner, passed, failed, errors}` from a runner's own summary, or None
    when no summary is there to read."""
    lines = text.splitlines()
    if runner == "pytest":
        for line in reversed(lines):
            if _PYTEST_TAIL.search(line) and _PYTEST_COUNT.search(line):
                counts = {"passed": 0, "failed": 0, "errors": 0}
                for number, what in _PYTEST_COUNT.findall(line):
                    if what == "passed":
                        counts["passed"] = int(number)
                    elif what == "failed":
                        counts["failed"] = int(number)
                    elif what.startswith("error"):
                        counts["errors"] = int(number)
                return {"runner": runner, **counts}
        return None
    if runner == "vitest":
        for line in reversed(lines):
            found = _VITEST_TESTS.match(line)
            if found:
                counts = {"passed": 0, "failed": 0, "errors": 0}
                for number, what in _VITEST_COUNT.findall(found.group(1)):
                    if what in ("passed", "failed"):
                        counts[what] = int(number)
                return {"runner": runner, **counts}
        return None
    if runner == "playwright":
        counts = {"passed": 0, "failed": 0, "errors": 0}
        seen = False
        for line in lines:
            found = _PLAYWRIGHT_LINE.match(line)
            if not found:
                continue
            number, what = int(found.group(1)), found.group(2)
            if what == "passed":
                counts["passed"] = number
                seen = True
            elif what == "failed":
                counts["failed"] = number
                seen = True
        return {"runner": runner, **counts} if seen else None
    return None
