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

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("specs", nargs="+")
    p.add_argument("--min-strength", type=float, default=0.9)
    ns = p.parse_args()

    reports = []
    for spec in ns.specs:
        src = source_for(spec)
        if src is None:
            print(f"❌ {spec}: unresolvable"); sys.exit(1)
        rep = evaluate(spec, str(src), ns.min_strength)
        if rep is None or rep.get("verdict") in {"false", "vacuous"}:
            sys.exit(1)
        reports.append(rep)

    scored = [r for r in reports if "mutants" in r]
    if not scored:
        print("❌ nothing scored"); sys.exit(1)
    survivors = set.intersection(*[set(r["survivors"]) for r in scored])
    total = max(r["mutants"] for r in scored)
    joint = (total - len(survivors)) / total if total else 0.0
    print(f"\nJOINT strength: {joint:.2f} ({total - len(survivors)}/{total} killed by the set)")
    if survivors:
        print(f"survives the whole set: {', '.join(sorted(survivors))}")
    sys.exit(0 if joint >= ns.min_strength else 1)
