#!/usr/bin/env python3
"""LAYER 5 — MUTATION GATE. AST-only mutants, equivalents excluded.

Replaces the earlier mutmut wrapper. Two reasons: mutmut scores the TEST suite,
while this scores the SPEC, and string-level mutation rewrites strings and
comments, producing broken rather than subtly-wrong programs that any spec
kills for free.

Equivalent mutants are excluded from the denominator. `a + b` -> `b + a` is the
same function; no spec can kill it, and counting it caps every honest score.
"""
import argparse, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from mutate import generate_mutants
from spec_source import source_for
from spec_strength import holds, is_equivalent, load_module
from spec_to_test import parse_lean_spec

def score(spec_files, threshold=0.9):
    infos = [(s, parse_lean_spec(s)) for s in spec_files]
    infos = [(s, i) for s, i in infos if i]
    if not infos:
        return {"mutation_score": 0.0, "mutants_killed": 0, "mutants": 0,
                "equivalent_excluded": 0, "survivors": [], "verdict": "UNKNOWN"}
    src = source_for(spec_files[0])
    source = Path(src).read_text()
    original = load_module(source)
    name, arity = infos[0][1]["function_name"], len(infos[0][1]["args"])

    equivalent, live = 0, []
    for m in generate_mutants(source):
        if is_equivalent(original, m.source, name, arity):
            equivalent += 1
        else:
            live.append(m)

    killed, survivors = 0, []
    for m in live:
        try:
            mod = load_module(m.source)
            alive = any(holds(i, mod)[0] for _, i in infos) and all(
                holds(i, mod)[0] for _, i in infos)
        except Exception:
            alive = False
        if alive:
            survivors.append(m.name)
        else:
            killed += 1
    total = len(live)
    s = killed / total if total else 0.0
    return {"mutation_score": round(s, 3), "mutants_killed": killed, "mutants": total,
            "equivalent_excluded": equivalent, "survivors": survivors,
            "verdict": "PASS" if s >= threshold else "FAIL"}

if __name__ == "__main__":
    p = argparse.ArgumentParser(); p.add_argument("specs", nargs="+")
    p.add_argument("--min-score", type=float, default=0.9); ns = p.parse_args()
    r = score(ns.specs, ns.min_score)
    print(f"  mutation discrimination: {r['mutants_killed']}/{r['mutants']} "
          f"({r['mutation_score']:.0%})")
    print(f"  equivalent mutants: {r['equivalent_excluded']} excluded")
    if r["survivors"]:
        print(f"  survivors: {', '.join(r['survivors'])}")
    sys.exit(0 if r["verdict"] == "PASS" else 1)
