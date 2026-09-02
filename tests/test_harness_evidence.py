"""The evidence store and the test oracle.

The oracle turns "I ran the tests" into numbers, from the exact summaries the
runners in this repository print. Both directions: real summaries parse to the
right counts, and text that is not a summary yields NO evidence -- never a pass.

Spec: docs/superpowers/specs/2026-09-02-engineering-harness-design.md
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

from harness.evidence import (  # noqa: E402
    Store,
    classify_path,
    looks_like_test_command,
    looks_like_verification,
    parse_test_output,
)


class TestTheOracleReadsWhatTheRunnersActuallyPrint:
    @pytest.mark.parametrize(
        ("text", "want"),
        [
            ("=========== 3 passed, 2 failed, 1 error in 0.12s ===========", (3, 2, 1)),
            ("12 passed in 1.41s", (12, 0, 0)),
            ("1 failed in 0.03s", (0, 1, 0)),
            ("2 failed, 52 passed, 3 skipped, 1 warning in 5.00s", (52, 2, 0)),
            ("4 passed, 2 errors in 0.5s", (4, 0, 2)),
        ],
    )
    def test_pytest_summaries(self, text: str, want: tuple[int, int, int]) -> None:
        got = parse_test_output("pytest", "...lots of output...\n" + text + "\n")
        assert got is not None
        assert (got["passed"], got["failed"], got["errors"]) == want

    @pytest.mark.parametrize(
        ("text", "want"),
        [
            (" Test Files  1 failed | 2 passed (3)\n      Tests  30 failed | 31 passed (61)", (31, 30, 0)),
            (" Test Files  5 passed (5)\n      Tests  124 passed (124)", (124, 0, 0)),
            ("      Tests  6 failed | 52 passed (58)", (52, 6, 0)),
        ],
    )
    def test_vitest_summaries(self, text: str, want: tuple[int, int, int]) -> None:
        got = parse_test_output("vitest", text)
        assert got is not None
        assert (got["passed"], got["failed"], got["errors"]) == want

    @pytest.mark.parametrize(
        ("text", "want"),
        [
            ("  1 failed\n    [a-person-on-safari] › law-b.spec.ts:67:3 › …\n  12 passed (2.6m)", (12, 1, 0)),
            ("  15 passed (2.8m)", (15, 0, 0)),
            ("  2 flaky\n  8 passed (1.0m)", (8, 0, 0)),
        ],
    )
    def test_playwright_summaries(self, text: str, want: tuple[int, int, int]) -> None:
        got = parse_test_output("playwright", text)
        assert got is not None
        assert (got["passed"], got["failed"], got["errors"]) == want

    def test_text_that_is_not_a_summary_is_no_evidence(self) -> None:
        assert parse_test_output("pytest", "collecting ... hello world") is None
        assert parse_test_output("vitest", "") is None
        assert parse_test_output("playwright", "Error: browserType.launch: Executable doesn't exist") is None

    def test_a_crash_before_the_summary_is_no_evidence(self) -> None:
        assert parse_test_output("pytest", "Traceback (most recent call last):\n  ImportError: x") is None


class TestWhichCommandsAreTestRunsAndWhichAreVerification:
    @pytest.mark.parametrize(
        ("command", "runner"),
        [
            ("pytest tests/test_x.py -q", "pytest"),
            ("cd learning-os && .venv/bin/python -m pytest -q", "pytest"),
            ("cd frontend && npx vitest run src/canvas", "vitest"),
            ("npm test -- --run", "vitest"),
            ("npx playwright test --config=playwright.reallife.config.ts", "playwright"),
            ("npm run test:laws", "playwright"),
        ],
    )
    def test_test_runners_are_recognised(self, command: str, runner: str) -> None:
        assert looks_like_test_command(command) == runner

    @pytest.mark.parametrize("command", ["git status", "ls -la", "cat pytest.ini", "echo 'pytest is great'"])
    def test_other_commands_are_not(self, command: str) -> None:
        assert looks_like_test_command(command) is None

    @pytest.mark.parametrize(
        "command",
        [
            "ruff check scripts tests", ".venv/bin/pyright scripts", "npx tsc --noEmit -p tsconfig.json",
            "npm run typecheck", "npm run lint", "mypy --strict src", "python3 -m mypy src",
            "learning-os/.venv/bin/mypy --strict src", "bandit -r src",
        ],
    )
    def test_static_verification_commands_are_recognised(self, command: str) -> None:
        assert looks_like_verification(command) is True

    @pytest.mark.parametrize(
        "command",
        ["git push origin codex", "grep -rn lint README.md", "npm run dev", "pytest -q", "npx vitest run"],
    )
    def test_test_runs_and_other_commands_are_not_static_verification(self, command: str) -> None:
        """A test run is evidence of behaviour and is judged by the GREEN rule;
        verification here means the static half: types and lint."""
        assert looks_like_verification(command) is False


class TestPathsAreClassifiedTheWayTheRepositoryIsLaidOut:
    @pytest.mark.parametrize(
        "path",
        [
            "tests/test_harness_state.py", "learning-os/tests/test_ask.py", "frontend/src/canvas/CanvasRoute.test.tsx",
            "frontend/tests/integration/law-h.spec.ts", "frontend/e2e/scenes.spec.ts", "features/steps/tutor_steps.py",
            "frontend/server/memory/m4-consistency.test.ts", "tests/conftest.py", "learning-os/tests/failure_envelope.py",
            "src/foo_test.py",
        ],
    )
    def test_tests(self, path: str) -> None:
        assert classify_path(path) == "test"

    @pytest.mark.parametrize(
        "path",
        [
            "src/add.py", "frontend/src/canvas/CanvasRoute.tsx", "frontend/server/handler.ts",
            "learning-os/src/learning_os/api/ask.py", "scripts/harness/state.py",
        ],
    )
    def test_production(self, path: str) -> None:
        assert classify_path(path) == "production"

    @pytest.mark.parametrize("path", ["README.md", "docs/superpowers/plans/x.md", ".gitignore", "ci/gates.toml"])
    def test_other(self, path: str) -> None:
        assert classify_path(path) == "other"

    def test_an_absolute_path_inside_the_repo_is_classified_by_its_relative_part(self) -> None:
        assert classify_path("/Users/x/repo/frontend/src/a.test.ts") == "test"
        assert classify_path("/Users/x/repo/src/a.py") == "production"


class TestTheStoreIsAppendOnlyAndSurvivesATornLine:
    def test_round_trip_in_order(self, tmp_path: Path) -> None:
        store = Store(tmp_path)
        store.append({"at": "t1", "kind": "hypothesis", "text": "a"})
        store.append({"at": "t2", "kind": "reason", "text": "b"})
        assert [r["kind"] for r in store.read()] == ["hypothesis", "reason"]

    def test_an_empty_or_missing_file_reads_as_nothing(self, tmp_path: Path) -> None:
        assert Store(tmp_path).read() == []

    def test_a_torn_last_line_is_skipped_not_fatal(self, tmp_path: Path) -> None:
        store = Store(tmp_path)
        store.append({"at": "t1", "kind": "hypothesis", "text": "a"})
        with (tmp_path / "evidence.jsonl").open("a", encoding="utf-8") as f:
            f.write('{"at": "t2", "kind": "rea')
        assert [r["kind"] for r in store.read()] == ["hypothesis"]

    def test_records_are_one_json_object_per_line(self, tmp_path: Path) -> None:
        Store(tmp_path).append({"at": "t1", "kind": "verdict", "status": "PASS"})
        lines = (tmp_path / "evidence.jsonl").read_text(encoding="utf-8").splitlines()
        assert len(lines) == 1 and json.loads(lines[0])["status"] == "PASS"
