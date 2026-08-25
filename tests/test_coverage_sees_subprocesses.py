"""COVERAGE MUST SEE CODE THAT RUNS IN A CHILD PROCESS.

WHY THIS EXISTS.

Measured on 2026-08-25, running the real suite with `--cov=scripts`:

    scripts/registry_gate.py     294    294    136      0      0%   83-671

294 statements, none measured. That file is not untested. `tests/
test_registries.py:27` names it as `GATE` and runs it, and that file's own
docstring says every defect class the gate claims to catch is exercised. It is
UNMEASURED, because the test invokes it with `subprocess.run`, and coverage
does not follow a child process unless it is explicitly told to.

34 test files in this repository invoke the code under test as a subprocess.
So the coverage number is not merely low --- it is WRONG, in a direction that
looks exactly like low coverage and that no amount of extra testing can fix.
The 45.80% measured across `scripts/` is an artefact of the measurement.

WHAT THE FIX IS, MEASURED RATHER THAN GUESSED.

Three candidate configurations were run against an identical tiny project whose
only interesting code executes in a child process:

    parallel + concurrency, no env var          ->  0 lines measured
    COVERAGE_PROCESS_START, no `parallel`       ->  0 lines measured
    `parallel = true` + COVERAGE_PROCESS_START  ->  7 lines measured

So BOTH halves are required, and `concurrency = multiprocessing` is not: it was
dropped and the measurement still worked. It is therefore not added, because a
setting that changes nothing is a setting someone later has to reason about.

`pytest-cov` 7.1.0 does NOT set `COVERAGE_PROCESS_START` by itself --- asserted
directly, by printing it from inside a test run under `--cov`, where it was
`None`. `tests/conftest.py` sets it, but only when a caller opts in by name.

THE OPT-IN IS A CORRECTION, NOT CAUTION. Arming it for every `--cov` run was
tried first and measured against the exact command the `coverage` gate runs: it
took that gate from 100.00% of `src/` to 0.05%, because combined child data
pulled 6,831 statements into a report scoped to `src`. A required check is not
the place to discover a subtlety, so nothing that runs today changes and the
capability is additive.

WHY THE FIRST TEST BELOW IS THE REAL ONE.

It does not build a toy. It runs THIS repository's own configuration over a
real test file that drives a real gate through a subprocess, and asks whether
the repository measured it. Before the fix it reports zero. A toy can only
prove that coverage.py has the feature; this proves that we switched it on.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
PY = sys.executable

# Chosen because it is the worst real case measured: 294 statements, every one
# of them reported unexecuted, while `tests/test_registries.py` runs the file
# and asserts on what it prints.
SUBPROCESS_DRIVEN_TEST = REPO / "tests" / "test_registries.py"
SUBPROCESS_DRIVEN_MODULE = "scripts/registry_gate.py"


def _executed_lines(tmp_path: Path, *, inherit_hook: bool) -> int:
    """Run one real test file under this repo's coverage config.

    Returns how many lines of `scripts/registry_gate.py` were counted. That
    module runs only inside a child process, so the answer is zero unless the
    repository is configured to follow one.
    """
    report = tmp_path / "cov.json"
    env = dict(os.environ)
    # Always start from a known state. An inherited value would make the
    # control below a copy of the test above rather than a control.
    env.pop("COVERAGE_PROCESS_START", None)
    env.pop("COVERAGE_PROCESS_CONFIG", None)
    env.pop("FINAL_COUNTDOWN_SUBPROCESS_COVERAGE", None)
    if inherit_hook:
        env["FINAL_COUNTDOWN_SUBPROCESS_COVERAGE"] = "1"

    # THE INNER RUN GETS ITS OWN DATA FILE, AND THIS LINE IS NOT HOUSEKEEPING.
    #
    # Without it the inner `pytest --cov=scripts` writes `.coverage` into the
    # repository root, and when this test runs as part of the whole suite the
    # OUTER run combines that data. Measured: the `coverage` gate --- which asks
    # for 95% of `src/` --- went from 100.00% to 0.05% over 6,831 statements it
    # never asked to see, and the cause looked like a coverage-configuration
    # bug rather than a test writing where it should not.
    #
    # A test that changes the number another gate reports is not a test, it is
    # a defect with a green tick.
    env["COVERAGE_FILE"] = str(tmp_path / "inner.coverage")

    run = subprocess.run(
        [
            PY, "-m", "pytest", str(SUBPROCESS_DRIVEN_TEST),
            "--cov=scripts",
            f"--cov-report=json:{report}",
            "--cov-fail-under=0",
            "-q", "-p", "no:cacheprovider",
        ],
        cwd=REPO, env=env, capture_output=True, text=True, timeout=900,
    )
    assert report.is_file(), (
        "the inner pytest run produced no coverage report, so this measures "
        f"nothing.\nstdout:\n{run.stdout[-3000:]}\nstderr:\n{run.stderr[-2000:]}"
    )

    files = json.loads(report.read_text(encoding="utf-8"))["files"]
    key = next((k for k in files if k.replace("\\", "/").endswith(SUBPROCESS_DRIVEN_MODULE)), None)
    assert key is not None, (
        f"{SUBPROCESS_DRIVEN_MODULE} is absent from the report entirely. "
        "Either --cov=scripts stopped covering it, or the file moved."
    )
    return len(files[key]["executed_lines"])


def test_this_repository_measures_a_module_that_only_runs_in_a_child() -> None:
    """THE REAL ONE. It fails against the configuration that shipped.

    `scripts/registry_gate.py` is exercised by `tests/test_registries.py`
    through `subprocess.run`. Before this existed it returned 0 --- a gate with
    294 statements reported as entirely untested while its own tests passed.
    With the hook armed it reports 89%.
    """
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        counted = _executed_lines(Path(d), inherit_hook=True)
    assert counted > 0, (
        f"{SUBPROCESS_DRIVEN_MODULE} executed in a child process and this "
        "repository counted none of it. Coverage is measuring the parent only, "
        "so every number it reports about subprocess-driven code is wrong. "
        "Check that tests/conftest.py arms COVERAGE_PROCESS_START when "
        "FINAL_COUNTDOWN_SUBPROCESS_COVERAGE is set, and that "
        "tests/coverage-subprocess.cfg still declares `parallel = true`."
    )


def test_the_measurement_still_depends_on_the_hook() -> None:
    """THE PAIR, and the only reason the test above means anything.

    Same repository, same test file, same command --- the hook switched off. If
    this ever starts counting lines, the measurement has stopped depending on
    the thing being measured, and the test above can no longer fail.

    Without this, a change that made every file report as fully covered would
    leave the test above green and nobody would learn anything.
    """
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        counted = _executed_lines(Path(d), inherit_hook=False)
    assert counted == 0, (
        f"{SUBPROCESS_DRIVEN_MODULE} reported {counted} executed lines with "
        "subprocess coverage disabled. The companion test above is therefore "
        "unable to fail and proves nothing."
    )
