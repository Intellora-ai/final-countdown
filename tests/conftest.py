"""Make coverage follow the child processes this suite spends its time in.

WHY THIS FILE EXISTS.

34 test files here run the code they are testing with `subprocess.run`. That is
deliberate --- a gate is a program, and the honest way to test a program is to
run it and read what it printed. The cost is that coverage.py measures the
process it was started in and nothing else, so every one of those files was
reporting zero.

Measured before this file existed:

    scripts/registry_gate.py     294    294    136      0      0%   83-671

294 statements, all reported unexecuted, while `tests/test_registries.py` ran
that exact file and asserted on its output.

WHY HERE AND NOT IN THE WORKFLOW.

`COVERAGE_PROCESS_START` could be exported in `verify.yml` instead. It is set
here so that a local run and a CI run measure the SAME thing. A variable that
lives only in the workflow makes the number a developer sees quietly different
from the number that gates the merge, and the first time those disagree
somebody trusts the wrong one.

HOW IT WORKS.

`coverage` ships a `.pth` file that runs at interpreter startup and calls
`coverage.process_startup()` when `COVERAGE_PROCESS_START` names a config file.
Each child then writes its own data file, which requires `parallel = true` ---
declared in `tests/coverage-subprocess.cfg` rather than in `pyproject.toml`,
because putting it in `pyproject.toml` was measured as changing nothing.
`pytest-cov` combines the files at the end.

Both halves are required, and this was measured rather than assumed:

    parallel + concurrency, no env var          ->  0 lines measured
    COVERAGE_PROCESS_START, no `parallel`       ->  0 lines measured
    `parallel = true` + COVERAGE_PROCESS_START  ->  7 lines measured

`concurrency = multiprocessing` was dropped from the final configuration
because removing it changed nothing. A setting that does nothing is a setting
the next person has to reason about for no reason.

`pytest-cov` 7.1.0 does not set the variable itself. That was checked by
printing it from inside a run under `--cov`, where it came back `None`.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]

# NOT pyproject.toml, and that was measured rather than assumed. pyproject sets
# `source = ["src"]`, so a child started with it measured `src/` and ignored
# the `scripts/` module it had been launched to run --- 0 lines counted. The
# child needs a config that declares NO source, so it measures whatever it
# executes and the PARENT's `--cov=` decides what the report shows. With that
# file: 270 lines counted.
COVERAGE_CONFIG = Path(__file__).resolve().parent / "coverage-subprocess.cfg"

# OPT-IN, AND THAT IS A CORRECTION RATHER THAN A PREFERENCE.
#
# The first version armed this whenever `--cov` was passed. Measured against
# the exact command the `coverage` gate runs --- `pytest -n auto --dist
# loadfile --cov=src --cov-branch --cov-fail-under=95 -m "not axle"` --- that
# took a gate reporting ~100% of `src/` down to 10.56%, because the combined
# child data pulled files into a report scoped to `src` and `--cov=src` did not
# filter them back out.
#
# A required check is not a place to discover a subtlety. So the existing gate
# keeps its exact behaviour, byte for byte, and subprocess coverage is
# something a NEW measurement opts into by name. Nothing that runs today
# changes; the capability is additive.
ENABLE = "FINAL_COUNTDOWN_SUBPROCESS_COVERAGE"


def pytest_configure(config: pytest.Config) -> None:
    """Arm subprocess coverage when a caller has asked for it by name.

    Two guards, both load-bearing:

    `ENABLE` keeps every existing command --- the `coverage` gate, the fast
    local loop, `make sandbox-fast` --- measuring exactly what it measured
    before this file existed.

    `--cov` keeps the cost off runs that are not measuring anything. Without
    it, every subprocess in an ordinary test run would start a coverage
    session and write a data file for a report nobody asked for.
    """
    if not os.environ.get(ENABLE):
        return

    # `cov_source` is set by pytest-cov when --cov was passed. Asking the
    # plugin rather than re-parsing argv keeps this correct if the flag is
    # supplied through addopts or a config file instead of the command line.
    if not getattr(config.option, "cov_source", None):
        return

    os.environ["COVERAGE_PROCESS_START"] = str(COVERAGE_CONFIG)
