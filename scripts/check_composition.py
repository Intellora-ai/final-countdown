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
from spec_source import source_for
from spec_strength import evaluate
from spec_to_test import SpecParseError
from typing import Any

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("specs", nargs="+")
    p.add_argument("--min-strength", type=float, default=0.9)
    ns = p.parse_args()

    reports: list[dict[str, Any]] = []
    for spec in ns.specs:
        src = source_for(spec)
        if src is None:
            print(f"❌ {spec}: unresolvable"); sys.exit(1)
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
        print("❌ nothing scored"); sys.exit(1)
    survivor_sets: list[set[str]] = [set(r["survivors"]) for r in scored]
    survivors: set[str] = survivor_sets[0].copy()
    for extra in survivor_sets[1:]:
        survivors &= extra
    total = max(r["mutants"] for r in scored)
    joint = (total - len(survivors)) / total if total else 0.0
    print(f"\nJOINT strength: {joint:.2f} ({total - len(survivors)}/{total} killed by the set)")
    if survivors:
        print(f"survives the whole set: {', '.join(sorted(survivors))}")
    sys.exit(0 if joint >= ns.min_strength else 1)
