#!/usr/bin/env python3
"""LAYER 3 — TRUTH GATE. Refute before proving: counterexample, then vacuity."""
import argparse, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from spec_source import source_for
from spec_strength import build_property, holds, load_module, RUN, INTS
from spec_to_test import parse_lean_spec
from hypothesis import given

VACUITY_FLOOR = 0.01

def assess(spec_file):
    info = parse_lean_spec(spec_file); src = source_for(spec_file)
    if info is None or src is None:
        return {"spec": spec_file, "truth": "UNKNOWN", "vacuity": "UNKNOWN",
                "counterexamples": 0, "reason": "unresolvable"}
    ok, stats = holds(info, load_module(Path(src).read_text()))
    if not ok:
        return {"spec": spec_file, "truth": "FAIL", "vacuity": "NOT_REACHED",
                "counterexamples": 1, "reason": f"false of {src}"}
    rate = stats["reached"] / stats["total"] if stats["total"] else 0.0
    vac = "PASS" if (not info["hypothesis"] or rate >= VACUITY_FLOOR) else "FAIL"
    return {"spec": spec_file, "truth": "PASS", "vacuity": vac,
            "counterexamples": 0, "precondition_reach": round(rate, 3)}

if __name__ == "__main__":
    p = argparse.ArgumentParser(); p.add_argument("specs", nargs="+"); ns = p.parse_args()
    bad = False
    for s in ns.specs:
        r = assess(s)
        print(f"  {Path(s).name:<26} truth={r['truth']:<5} vacuity={r['vacuity']:<10} "
              f"counterexamples={r['counterexamples']}")
        if r["truth"] != "PASS" or r["vacuity"] != "PASS":
            bad = True
    sys.exit(1 if bad else 0)
