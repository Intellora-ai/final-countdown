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

import pytest

REPO = Path(__file__).resolve().parent.parent
MATCHERS = REPO / ".github" / "matchers" / "tools.json"

#: Verbatim tool output. Do not tidy these strings -- their exact shape is the test.
SAMPLES = {
    "pyright": (
        '  /Users/x/final countdown/scripts/local_gates.py:204:5 - error: '
        'Variable "code" is not accessed (reportUnusedVariable)'
    ),
    "gcc-style": (
        'scripts/verify_per_function.sh:12:1: error: '
        'Double quote to prevent globbing [SC2086]'
    ),
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
    pattern = matchers()[owner]["pattern"][0]           # type: ignore[index]
    got = re.compile(str(pattern["regexp"])).match(SAMPLES[owner])  # type: ignore[index]
    assert got is not None, (
        f"{owner}: the regex does not match real output. This matcher would be dead in "
        f"CI while appearing configured.\n  sample: {SAMPLES[owner]}")

    # Every declared capture index must actually capture something.
    for field in ("file", "line", "column", "severity", "message"):
        index = int(pattern[field])                     # type: ignore[index]
        value = got.group(index)
        assert value, f"{owner}: capture group {index} for {field!r} is empty"

    assert got.group(int(pattern["line"])).isdigit()     # type: ignore[index]
    assert got.group(int(pattern["column"])).isdigit()   # type: ignore[index]
    assert got.group(int(pattern["severity"])) in {      # type: ignore[index]
        "error", "warning", "note", "information"}


def test_the_generic_template_regex_would_not_have_worked_for_pyright() -> None:
    """Why the template was not copied, kept as an executable note.

    The obvious generic pattern is `(file):(line):(col)?:? (error|warning): (msg)`.
    pyright prints `file:line:col - error: msg` with a DASH, so the generic pattern
    matches none of its output. Copying it would have shipped a matcher that silently
    matched nothing -- precisely the failure a problem matcher exists to remove.
    """
    generic = re.compile(r"^(.+?):(\d+):(\d+)?:?\s+(error|warning):\s+(.+)$")
    assert generic.match(SAMPLES["pyright"]) is None, (
        "the generic template now matches pyright; if pyright changed its output format, "
        "re-derive the matcher regex from fresh real output rather than assuming")
    assert generic.match(SAMPLES["gcc-style"]) is not None, (
        "the generic template should still match gcc-style output")


def test_every_job_that_registers_a_matcher_registers_it_first() -> None:
    """A matcher registered after the tool ran annotates nothing."""
    yaml = pytest.importorskip("yaml")
    spec = yaml.safe_load(
        (REPO / ".github" / "workflows" / "verify.yml").read_text(encoding="utf-8"))
    registering: list[str] = []
    for name, job in spec["jobs"].items():
        for index, step in enumerate(job.get("steps") or []):
            if "add-matcher" in str(step.get("run", "")):
                registering.append(name)
                assert index == 0, (
                    f"{name}: the matcher is registered at step {index}; a matcher "
                    "registered after the tool has already run annotates nothing")
    assert registering, "no job registers the problem matchers, so the file is inert"
