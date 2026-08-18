#!/usr/bin/env python3
"""LAYER 8 — HONEST REPORT. Ten dimensions, no collapsing.

    PASS = semantically grounded + non-vacuous + actually verified
           + meaningfully discriminates + (ideally) sufficient

LAYER 10 — DO NOT OVERCLAIM.  TRUE != USEFUL != SUFFICIENT != VERIFIED.
Each dimension is printed separately and never merged into one word. Overall is
PASS only when sufficiency is established too; otherwise it is
PASS_WITH_LIMITATIONS, and what is unknown is named.
"""
import argparse, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import contract_strength, proof_gate, truth_gate
from composition import analyse
from mutation_gate import score
from semantic_anchor import anchor_for, strength as anchor_strength
from spec_source import source_for

def report(spec_files, threshold=0.9):
    src = source_for(spec_files[0])
    anchor = anchor_for(src) if src else None

    truths = [truth_gate.assess(s) for s in spec_files]
    truth = "PASS" if all(t["truth"] == "PASS" for t in truths) else "FAIL"
    vacuity = "PASS" if all(t["vacuity"] == "PASS" for t in truths) else "FAIL"

    proofs = [proof_gate.verify(s, proof_gate.proof_for(s)) for s in spec_files]
    proof = "VERIFIED" if all(p["proof"] == "VERIFIED" for p in proofs) else "UNVERIFIED"

    mut = score(spec_files, threshold)
    comp = analyse(spec_files, threshold)
    suff = contract_strength.assess(spec_files)

    boundary = sum(1 for t in truths if t.get("precondition_reach") is not None)
    runtime = "PASS" if truth == "PASS" else "FAIL"

    blocking_ok = (truth == "PASS" and vacuity == "PASS" and proof == "VERIFIED"
                   and mut["verdict"] == "PASS")
    if not blocking_ok:
        overall = "FAIL"
    elif suff["sufficiency"].startswith("ESTABLISHED"):
        overall = "PASS"
    else:
        overall = "PASS_WITH_LIMITATIONS"

    print(f"\n{'═' * 62}\n  {src}   ({len(spec_files)} specs)\n{'═' * 62}")
    print(f"  Truth:                    {truth}")
    print(f"  Vacuity:                  {vacuity}")
    print(f"  Semantic anchor:          {anchor_strength(anchor)}")
    print(f"  Formal proof:             {proof}"
          f"  ({', '.join(str(p['axle_ms']) + 'ms' for p in proofs if p['axle_ms'])})")
    print(f"  Runtime property test:    {runtime}")
    print(f"  Mutation discrimination:  {mut['mutants_killed']}/{mut['mutants']}")
    print(f"  Equivalent mutants:       {mut['equivalent_excluded']} excluded")
    print(f"  Boundary coverage:        {boundary}/{len(spec_files)} specs probed")
    print(f"  Joint strength:           {comp['joint_strength']:.2f}"
          f"   individual {[f'{v:.2f}' for v in comp['individual_strengths']]}")
    print(f"  Contract sufficiency:     {suff['sufficiency']}")
    print(f"  Overall:                  {overall}")
    if overall == "PASS_WITH_LIMITATIONS":
        print(f"\n  NOT CLAIMED: the contract does not pin down the behaviour.")
        print(f"  {suff['reason']}")
        for w in suff.get("witnesses", []):
            print(f"    - {w}")
        print("  The proofs are valid. The specs are true. They are not sufficient.")
    return overall

if __name__ == "__main__":
    p = argparse.ArgumentParser(); p.add_argument("specs", nargs="+")
    p.add_argument("--min-strength", type=float, default=0.9)
    p.add_argument("--require-sufficiency", action="store_true")
    ns = p.parse_args()
    o = report(ns.specs, ns.min_strength)
    bad = o == "FAIL" or (ns.require_sufficiency and o != "PASS")
    sys.exit(1 if bad else 0)
