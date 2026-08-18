#!/usr/bin/env python3
"""LAYER 6 — CONTRACT STRENGTH (sufficiency).

Mutation strength asks: do the specs catch a bug in THIS implementation?
Sufficiency asks a harder question: could a MEANINGFULLY DIFFERENT function
satisfy every spec you wrote?

If yes, the specs do not pin down the behaviour — they describe a family that
happens to contain your function. `add` proven commutative and zero-identity is
still not pinned down: integer XOR is commutative, has 0 as identity, and is
associative, yet 2 xor 3 = 1 while 2 + 3 = 5.

A surviving alternative is not a proof that the code is wrong. It is proof that
the CONTRACT is incomplete. Reported as NOT_ESTABLISHED, never as a failure of
the implementation.
"""

import argparse
import operator
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from spec_source import source_for
from spec_strength import holds, load_module
from spec_to_test import parse_lean_spec

# Alternatives are plausible whole functions, not mutations. Each must be
# behaviourally distinct from the original to count as a witness.
ALTERNATIVES_2 = {
    "constant zero":  lambda a, b: 0,
    "first argument": lambda a, b: a,
    "second argument": lambda a, b: b,
    "bitwise xor":    operator.xor,
    "bitwise or":     operator.or_,
    "multiplication": operator.mul,
    "subtraction":    operator.sub,
    "minimum":        min,
    "maximum":        max,
    "sum of squares": lambda a, b: a * a + b * b,
}
ALTERNATIVES_3 = {
    "constant zero":   lambda lo, hi, x: 0,
    "always lo":       lambda lo, hi, x: lo,
    "always hi":       lambda lo, hi, x: hi,
    "identity on x":   lambda lo, hi, x: x,
    "min(hi, x)":      lambda lo, hi, x: min(hi, x),
    "max(lo, x)":      lambda lo, hi, x: max(lo, x),
    "midpoint":        lambda lo, hi, x: (lo + hi) // 2,
    "reversed clamp":  lambda lo, hi, x: min(lo, max(hi, x)),
}
PROBES_2 = [(0, 0), (1, 0), (2, 3), (-4, 7), (5, 5), (11, -2)]
PROBES_3 = [(0, 10, 5), (0, 10, -3), (0, 10, 50), (-5, 5, 0), (2, 2, 9)]


def distinct(original, alt, probes):
    """True if the alternative differs observably from the original."""
    for values in probes:
        try:
            a = original(*values)
        except Exception:
            a = "raise"
        try:
            b = alt(*values)
        except Exception:
            b = "raise"
        if a != b:
            return True
    return False


def assess(spec_files):
    infos = [(s, parse_lean_spec(s)) for s in spec_files]
    infos = [(s, i) for s, i in infos if i]
    if not infos:
        return {"sufficiency": "UNKNOWN", "reason": "no parsable specs"}

    src = source_for(spec_files[0])
    original_mod = load_module(Path(src).read_text())
    func_name = infos[0][1]["function_name"]
    original = getattr(original_mod, func_name)
    arity = len(infos[0][1]["args"])
    table = ALTERNATIVES_2 if arity == 2 else ALTERNATIVES_3
    probes = PROBES_2 if arity == 2 else PROBES_3

    survivors = []
    for label, fn in table.items():
        if not distinct(original, fn, probes):
            continue  # same function; not a witness
        stand_in = type(sys)("alt")
        setattr(stand_in, func_name, fn)
        if all(holds(info, stand_in)[0] for _, info in infos):
            survivors.append(label)

    if survivors:
        return {
            "sufficiency": "NOT_ESTABLISHED",
            "reason": f"a different implementation satisfies every spec: {survivors[0]}",
            "witnesses": survivors,
            "specs": [s for s, _ in infos],
        }
    return {
        "sufficiency": "ESTABLISHED_OVER_TESTED_ALTERNATIVES",
        "reason": f"none of {len(table)} candidate implementations satisfied all specs",
        "witnesses": [],
        "specs": [s for s, _ in infos],
    }


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("specs", nargs="+")
    p.add_argument("--strict", action="store_true",
                   help="exit non-zero when sufficiency is not established")
    ns = p.parse_args()

    r = assess(ns.specs)
    print(f"  contract sufficiency: {r['sufficiency']}")
    print(f"  reason: {r['reason']}")
    for w in r.get("witnesses", []):
        print(f"    witness: {w} satisfies every spec yet computes something else")
    # Default exit 0: an incomplete contract is information, not a broken build.
    sys.exit(1 if (ns.strict and r["sufficiency"] == "NOT_ESTABLISHED") else 0)
