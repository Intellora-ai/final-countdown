"""The problem matchers must match what the tools actually print.

A matcher whose regex matches nothing is worse than no matcher: CI looks like it has
readable errors, and every annotation still says "Process completed with exit code 1".
It fails silently and forever, because nothing checks a regex that never fires.

So the regexes are pinned here against real captured output. The pyright sample is a
verbatim line from run 32380682052, the run whose sixteen type errors were the first of
four consecutive red CI runs on 2026-08-20.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, cast

import pytest

REPO = Path(__file__).resolve().parent.parent
MATCHERS = REPO / ".github" / "matchers" / "tools.json"

#: Verbatim tool output. Do not tidy these strings -- their exact shape is the test.
#: Single-pattern matchers pin one line; the loop matcher (eslint-stylish) pins
#: one line PER PATTERN, in pattern order, because that is how the runner feeds it.
SAMPLES: dict[str, str | list[str]] = {
    "pyright": (
        '  /Users/x/final countdown/scripts/local_gates.py:204:5 - error: '
        'Variable "code" is not accessed (reportUnusedVariable)'
    ),
    "gcc-style": (
        'scripts/verify_per_function.sh:12:1: error: '
        'Double quote to prevent globbing [SC2086]'
    ),
    # Verbatim from the learning-os Types step, run 33543240439 (2026-09-01):
    # the strict-mypy failure the red ruff step had been hiding. mypy prints NO
    # column by default, which is exactly why gcc-style never fired on it.
    "mypy": (
        'tests/test_ollama_client.py:249: error: '
        'Function is missing a return type annotation  [no-untyped-def]'
    ),
    # Verbatim from the coverage gate, run on 87c2686c (2026-09-02): the failing
    # frame pytest prints last, which is the one line that carries file+line.
    "pytest-tail": 'tests/test_problem_matchers.py:44: AssertionError',
    # eslint stylish output: a file line, then indented findings under it.
    "eslint-stylish": [
        'src/canvas/CanvasRoute.tsx',
        "  12:5  error  'draft' is assigned a value but never used  no-unused-vars",
    ],
}


def matchers() -> dict[str, dict[str, object]]:
    spec = json.loads(MATCHERS.read_text(encoding="utf-8"))
    return {m["owner"]: m for m in spec["problemMatcher"]}


def test_the_matcher_file_is_valid_json_with_the_expected_owners() -> None:
    owners = matchers()
    assert set(owners) == set(SAMPLES), (
        f"matcher owners {sorted(owners)} do not match the tools with pinned samples "
        f"{sorted(SAMPLES)}; an owner with no sample is a regex nobody exercises")


@pytest.mark.parametrize("owner", sorted(SAMPLES))
def test_each_regex_matches_real_output_and_extracts_every_field(owner: str) -> None:
    """Each pattern is fed its own sample line, and only the fields a pattern
    DECLARES are demanded of it: mypy prints no column and pytest's failing
    frame prints no severity -- demanding absent fields would force every
    matcher to lie about its tool's real output, which is the exact failure
    this file exists to prevent."""
    patterns = cast("list[dict[str, Any]]", matchers()[owner]["pattern"])
    sample = SAMPLES[owner]
    lines: list[str] = sample if isinstance(sample, list) else [sample]
    assert len(lines) == len(patterns), (
        f"{owner}: {len(patterns)} pattern(s) need {len(patterns)} sample line(s), "
        f"one per pattern in order; got {len(lines)}")

    for pattern, line in zip(patterns, lines):
        got = re.compile(str(pattern["regexp"])).match(line)
        assert got is not None, (
            f"{owner}: the regex does not match real output. This matcher would be "
            f"dead in CI while appearing configured.\n  sample: {line}")

        for field in ("file", "line", "column", "severity", "message", "code"):
            if field not in pattern:
                continue
            index = int(pattern[field])
            value = got.group(index)
            assert value, f"{owner}: capture group {index} for {field!r} is empty"

        if "line" in pattern:
            assert got.group(int(pattern["line"])).isdigit()
        if "column" in pattern:
            assert got.group(int(pattern["column"])).isdigit()
        if "severity" in pattern:
            assert got.group(int(pattern["severity"])) in {
                "error", "warning", "note", "information"}


def test_the_generic_template_regex_would_not_have_worked_for_pyright() -> None:
    """Why the template was not copied, kept as an executable note.

    The obvious generic pattern is `(file):(line):(col)?:? (error|warning): (msg)`.
    pyright prints `file:line:col - error: msg` with a DASH, so the generic pattern
    matches none of its output. Copying it would have shipped a matcher that silently
    matched nothing -- precisely the failure a problem matcher exists to remove.
    """
    generic = re.compile(r"^(.+?):(\d+):(\d+)?:?\s+(error|warning):\s+(.+)$")
    pyright_line, gcc_line = SAMPLES["pyright"], SAMPLES["gcc-style"]
    assert isinstance(pyright_line, str) and isinstance(gcc_line, str)
    assert generic.match(pyright_line) is None, (
        "the generic template now matches pyright; if pyright changed its output format, "
        "re-derive the matcher regex from fresh real output rather than assuming")
    assert generic.match(gcc_line) is not None, (
        "the generic template should still match gcc-style output")


def test_the_matcher_is_registered_after_checkout_and_before_the_tool() -> None:
    """Two failure modes, one on each side. This test previously enforced one of them.

    Registered too LATE -- after the tool has run -- and it annotates nothing.
    Registered too EARLY -- before actions/checkout -- and the file it names does not
    exist yet.

    The first version of this test asserted `index == 0`, which is the too-early case,
    and CI proved it on run 32393030673:

        Could not find a part of the path
        '/home/runner/work/final-countdown/final-countdown/.github/matchers/tools.json'

    pyright then produced no reports/, its upload failed with if-no-files-found: error,
    and `full` and `merge-evidence` went red behind it. Four red checks, one cause, and
    a passing test that had pinned the cause in place.

    The correct invariant is positional but relative: after checkout, before the tool.
    """
    yaml = pytest.importorskip("yaml")
    spec = yaml.safe_load(
        (REPO / ".github" / "workflows" / "verify.yml").read_text(encoding="utf-8"))

    registering: list[str] = []
    jobs = cast("dict[str, dict[str, Any]]", spec["jobs"])
    for name, job in jobs.items():
        steps = cast("list[dict[str, Any]]", job.get("steps") or [])
        matcher_at = [i for i, s in enumerate(steps) if "add-matcher" in str(s.get("run", ""))]
        if not matcher_at:
            continue
        registering.append(name)
        index = matcher_at[0]

        checkout_at = [i for i, s in enumerate(steps)
                       if "actions/checkout" in str(s.get("uses", ""))]
        assert checkout_at, f"{name}: registers a matcher but never checks out the repository"
        assert index > checkout_at[0], (
            f"{name}: the matcher is registered at step {index}, before checkout at step "
            f"{checkout_at[0]}. The matcher file lives in the repository and does not "
            "exist on disk yet -- GitHub fails with 'Could not find a part of the path'")

        tool_at = [i for i, s in enumerate(steps) if "run_gate.py" in str(s.get("run", ""))]
        if tool_at:
            assert index < tool_at[0], (
                f"{name}: the matcher is registered at step {index}, after the tool runs "
                f"at step {tool_at[0]}. It would annotate nothing")

    assert registering, "no job registers the problem matchers, so the file is inert"
