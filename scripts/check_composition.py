#!/usr/bin/env python3
"""Gate: the spec SET must jointly reach the strength floor.

Scored as a set on purpose. add's commutativity misses `return 0`; its identity
spec misses `Add->Sub`. Each scores 0.50 and would be rejected alone, yet
together they kill every mutant. Gating per-spec throws away correct sets.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from collections.abc import Callable
from typing import Any

from spec_source import source_for
from spec_strength import evaluate
from spec_to_test import SpecParseError


def joint_score(
    scored: list[dict[str, Any]],
    source_of: Callable[[str], object] = source_for,
) -> tuple[float, set[str], int, list[tuple[str, float, int, int, int]]]:
    """(joint, survivors, total, per-source rows) for a set of scored specs.

    A module-level function rather than inline in __main__ so the arithmetic can
    be tested against synthetic reports. Scoring it end-to-end means running the
    real evaluator against the real AXLE service for every spec, which takes
    twenty minutes -- long enough that the arithmetic went untested, which is
    how it stayed wrong.

    INTERSECT WITHIN A SOURCE, UNION ACROSS SOURCES.

    This was one intersection over every spec passed in, and a mutant name was
    its bare operator label. Both halves were wrong together, and each hid the
    other.

    `spec-strength` hands this gate ten specs spanning FOUR source files.
    Intersecting across them asks "which mutant survived every spec of every
    function", which is not a question about anything: add.py's mutants and
    subtract.py's mutants are different mutants of different code. With bare
    labels they collided by accident, so add's kill of "return constant 0"
    cancelled subtract's survivor of an unrelated mutant sharing that string.
    Qualifying the names removed the accident and left the structure exposed:
    survivor sets from different sources are then DISJOINT, so the intersection
    is always empty and the score is always exactly 1.00.

    Measured, two specs from two sources, both individually below threshold and
    neither source's set complete:

        ❌ specs/add_spec.lean is too weak (0.50 < 0.90)
        ❌ specs/subself_spec.lean is too weak (0.33 < 0.90)
        JOINT strength: 1.00 (3/3 killed by the set)     exit 0

    A required check that could not fail. Not "unlikely to" -- could not, for
    any input naming two or more sources.

    Set-scoring is kept exactly as the module docstring describes, because the
    reason for it is real: add's commutativity spec misses `return 0` and its
    identity spec misses `Add->Sub`, each scores 0.50, and together they kill
    everything. That argument is about specs of ONE function. So the
    intersection happens within a source -- leaving `spec-composition`
    unchanged, since it is only ever handed one source's specs -- and the
    sources combine by summing mutants and unioning what survived its own set.
    A survivor of its own function's spec set is a survivor of the whole set; it
    cannot be cancelled by a different function.

    The denominator changed with it: `max(mutants)` across unrelated sources was
    never the size of anything, and is now the sum of each source's own mutant
    count.
    """
    by_source: dict[str, list[dict[str, Any]]] = {}
    for rep in scored:
        by_source.setdefault(str(source_of(str(rep["spec"]))), []).append(rep)

    survivors: set[str] = set()
    total = 0
    rows: list[tuple[str, float, int, int, int]] = []
    for src_name in sorted(by_source):
        group = by_source[src_name]
        group_survivors: set[str] = set(group[0]["survivors"])
        for rep in group[1:]:
            group_survivors &= set(rep["survivors"])
        # One universe per source, so the denominator is that source's mutant
        # count, and the counts within a group agree by construction.
        group_total = int(max(r["mutants"] for r in group))
        survivors |= group_survivors
        total += group_total
        killed = group_total - len(group_survivors)
        rows.append(
            (
                src_name,
                killed / group_total if group_total else 0.0,
                killed,
                group_total,
                len(group),
            )
        )

    joint = (total - len(survivors)) / total if total else 0.0
    return joint, survivors, total, rows


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("specs", nargs="+")
    p.add_argument("--min-strength", type=float, default=0.9)
    ns = p.parse_args()

    reports: list[dict[str, Any]] = []
    for spec in ns.specs:
        src = source_for(spec)
        if src is None:
            print(f"❌ {spec}: unresolvable")
            sys.exit(1)
        # Fail closed. `evaluate` raises rather than returning None, so an
        # unparsable spec cannot be mistaken for one with nothing to report.
        try:
            rep = evaluate(spec, str(src), ns.min_strength)
        except SpecParseError as exc:
            print(f"❌ {spec}: unparsable — the set was NOT scored: {exc}")
            sys.exit(1)
        if rep.get("verdict") in {"false", "vacuous"}:
            sys.exit(1)
        reports.append(rep)

    scored: list[dict[str, Any]] = [r for r in reports if "mutants" in r]
    if not scored:
        print("❌ nothing scored")
        sys.exit(1)
    joint, survivors, total, rows = joint_score(scored)
    if len(rows) > 1:
        for src_name, group_joint, killed, group_total, n_specs in rows:
            print(
                f"  {src_name}: {group_joint:.2f} "
                f"({killed}/{group_total} killed by {n_specs} spec(s))"
            )
    print(
        f"\nJOINT strength: {joint:.2f} ({total - len(survivors)}/{total} killed by the set)"
    )
    if survivors:
        print(f"survives the whole set: {', '.join(sorted(survivors))}")
    sys.exit(0 if joint >= ns.min_strength else 1)
