#!/usr/bin/env python3
"""LAYER 7 — COMPOSITION. Smallest complementary set, scored jointly."""
import argparse, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from mutation_gate import score
from typing import Any

def analyse(spec_files: list[str], threshold: float = 0.9) -> dict[str, Any]:
    individual = {s: score([s], threshold) for s in spec_files}
    joint = score(spec_files, threshold)
    # Greedy cover: keep adding the spec that kills the most still-alive mutants.
    remaining: set[str] = set(joint["survivors"])
    universe: set[str] = set()
    for r in individual.values():
        universe |= set(r["survivors"])
    need = universe - remaining
    chosen: list[str] = []
    pool: dict[str, dict[str, Any]] = dict(individual)
    while need and pool:
        best = max(pool, key=lambda s: len(need - set(pool[s]["survivors"])))
        gain = need - set(pool[best]["survivors"])
        if not gain:
            break
        chosen.append(best); need -= gain; pool.pop(best)
    return {"joint_strength": joint["mutation_score"],
            "individual_strengths": [individual[s]["mutation_score"] for s in spec_files],
            "minimal_set": chosen or spec_files[:1], "joint": joint,
            "individual": individual}

if __name__ == "__main__":
    p = argparse.ArgumentParser(); p.add_argument("specs", nargs="+")
    p.add_argument("--min-strength", type=float, default=0.9); ns = p.parse_args()
    r = analyse(ns.specs, ns.min_strength)
    for s, v in zip(ns.specs, r["individual_strengths"]):
        print(f"  individual  {Path(s).name:<26} {v:.2f}")
    print(f"  JOINT       {r['joint_strength']:.2f}  "
          f"({r['joint']['mutants_killed']}/{r['joint']['mutants']} killed by the set)")
    print(f"  minimal complementary set: {', '.join(Path(x).name for x in r['minimal_set'])}")
    sys.exit(0 if r["joint_strength"] >= ns.min_strength else 1)
