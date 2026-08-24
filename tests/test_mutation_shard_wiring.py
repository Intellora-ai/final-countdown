"""The mutation matrix and the `--shard` flag must agree, and nothing tied them.

THE DEFECT SHAPE.

`.github/workflows/learning-canvas-frontend.yml` declares the shard count twice,
on lines that never move together:

    matrix:
      shard: [1, 2, 3, 4]
    run: npm run test:mutation -- --shard="$MUTATION_SHARD/4"

Change one and not the other and the run is silently incomplete. Widening the
matrix to 6 while the flag still says `/4` makes shards 5 and 6 re-run stripes
1 and 2 -- duplicated work, no gap, and nothing complains. Widening the FLAG to
6 while the matrix stays at 4 is the dangerous direction: shards 5 and 6 never
exist, shards 1-4 each select a real non-empty stripe, every job is green, and
a THIRD OF THE CATALOGUE NEVER RUNS.

Every existing signal says success in that second case. The empty-shard guard in
`mutation-gate.mjs` only sees a shard that selected nothing. `frontend-verdict`
only sees a shard that failed or was cancelled. So the one gate whose entire
purpose is proving the tests are strong would be reporting on work it never did.

TWO LAYERS, DELIBERATELY.

`shardsAreComplete` (frontend/scripts/mutation-verdict.mjs) catches it at RUN
time, from the shards' own manifests, and catches ways of losing a mutant that
nobody has thought of. This file catches the specific, likely mistake at
PREFLIGHT, before a runner is spent -- and it catches the duplicated-work
direction too, which is invisible to a coverage union because nothing is missing.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, cast

import pytest
import yaml

REPO = Path(__file__).resolve().parent.parent
WORKFLOW = REPO / ".github" / "workflows" / "learning-canvas-frontend.yml"

#: BOTH sharded jobs, because both declare the count twice. `frontend-scenes`
#: has the identical shape -- `shard: [1, 2]` on one line and `--shard="$SHARD/2"`
#: on another -- and a guard that covered only the mutation job would leave the
#: same defect live in the job that is actually on the critical path.
SHARDED_JOBS = ["frontend-mutation", "frontend-scenes"]

#: Only the mutation job proves coverage from manifests; scenes coverage is
#: proved by `projects_invoked` in scripts/gate_integrity.py instead.
MANIFEST_JOB = "frontend-mutation"


def job(name: str) -> dict[str, Any]:
    raw: Any = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
    assert isinstance(raw, dict), f"{WORKFLOW.name} did not parse as a mapping"
    jobs: Any = cast("dict[str, Any]", raw).get("jobs")
    assert isinstance(jobs, dict), "the workflow declares no jobs"
    found: Any = cast("dict[str, Any]", jobs).get(name)
    assert isinstance(found, dict), (
        f"no '{name}' job; every assertion in this file would otherwise pass "
        "against an empty dict"
    )
    return cast("dict[str, Any]", found)


def matrix_shards(name: str) -> list[Any]:
    strategy: Any = job(name).get("strategy")
    assert isinstance(strategy, dict), f"'{name}' has no strategy"
    matrix: Any = cast("dict[str, Any]", strategy).get("matrix")
    assert isinstance(matrix, dict), f"'{name}' has no matrix"
    shards: Any = cast("dict[str, Any]", matrix).get("shard")
    assert isinstance(shards, list), f"'{name}' matrix has no shard list"
    return cast("list[Any]", shards)


def flag_denominators(name: str) -> list[int]:
    steps: Any = job(name).get("steps")
    assert isinstance(steps, list), f"'{name}' has no steps"
    body = "\n".join(
        str(cast("dict[str, Any]", s).get("run", ""))
        for s in cast("list[Any]", steps)
        if isinstance(s, dict)
    )
    # The value is quoted in the workflow (`--shard="$MUTATION_SHARD/4"`), so
    # the character class must not exclude the quote that opens it.
    return [int(n) for n in re.findall(r"--shard=\S*?/(\d+)", body)]


@pytest.mark.parametrize("name", SHARDED_JOBS)
def test_the_wiring_is_present_so_the_rest_is_not_vacuous(name: str) -> None:
    """IF THIS FAILS, NOTHING ELSE IN THIS FILE MEANS ANYTHING."""
    assert matrix_shards(name), f"{name}: the shard matrix is empty"
    assert flag_denominators(name), (
        "no `--shard=i/N` flag found in the job, so the comparison below has "
        "nothing to compare and would pass trivially"
    )


@pytest.mark.parametrize("name", SHARDED_JOBS)
def test_the_matrix_size_equals_the_shard_denominator(name: str) -> None:
    """THE WHOLE POINT. Two numbers, two lines, nothing tying them together.

    If the flag says more shards than the matrix runs, the missing stripes are
    never executed and every check stays green. If it says fewer, runners
    duplicate work no coverage check can see is duplicated.
    """
    shards = matrix_shards(name)
    denominators = flag_denominators(name)
    assert len(set(denominators)) == 1, (
        f"{name} passes conflicting shard counts {denominators}; one of them "
        "is running a stripe nobody asked for"
    )
    assert len(shards) == denominators[0], (
        f"{name}: the matrix runs {len(shards)} shards ({shards}) but the flag says "
        f"/{denominators[0]}. "
        + (
            f"{denominators[0] - len(shards)} stripe(s) would never run, on a "
            "green pipeline."
            if denominators[0] > len(shards)
            else "runners would duplicate stripes."
        )
    )


@pytest.mark.parametrize("name", SHARDED_JOBS)
def test_the_matrix_is_the_contiguous_range_the_stripe_assumes(name: str) -> None:
    """`at % shardCount === shardIndex - 1` assumes shards are exactly 1..n.

    A matrix of `[1, 2, 4]` leaves stripe 3 unrun while every shard present is
    non-empty, so the empty-shard guard stays silent. The stripe maths is what
    makes the numbering load-bearing, not convention.
    """
    shards = matrix_shards(name)
    assert shards == list(range(1, len(shards) + 1)), (
        f"{name}: shard ids {shards} are not the contiguous range 1..{len(shards)}, so "
        "the modulo stripe in mutation-gate.mjs leaves a gap"
    )


def test_the_shard_manifest_is_uploaded_or_the_run_check_sees_nothing() -> None:
    """`shardsAreComplete` reads manifests. No upload, no proof.

    A verdict that reads an empty directory and passes is the vacuous case the
    predicate refuses -- but only if it is actually wired to look.
    """
    steps: Any = job(MANIFEST_JOB).get("steps")
    # Narrowed one hop at a time: an `isinstance` check on an `Any` yields
    # `dict[Unknown, Unknown]`, and reading `.get` off that silently defeats the
    # type checker for everything downstream.
    uploads: list[dict[str, Any]] = []
    for raw in cast("list[Any]", steps):
        if not isinstance(raw, dict):
            continue
        step_ = cast("dict[str, Any]", raw)
        if "upload-artifact" in str(step_.get("uses", "")):
            uploads.append(step_)
    assert uploads, "no shard manifest is uploaded, so the union can never be checked"
    for step in uploads:
        with_: Any = step.get("with")
        assert isinstance(with_, dict), step
        assert cast("dict[str, Any]", with_).get("if-no-files-found") == "error", (
            "a missing manifest is exactly the condition this mechanism exists "
            "to detect; it must not upload nothing quietly"
        )
        assert "always()" in str(step.get("if", "")), (
            "the manifest is written before the gate works, so a crashed shard "
            "must still upload the stripe it owned"
        )
