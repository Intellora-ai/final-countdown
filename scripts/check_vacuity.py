#!/usr/bin/env python3
"""Gate: reject specs whose precondition is (almost) never satisfiable."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from spec_source import source_for
from spec_strength import build_property, load_module, RUN, INTS
from spec_to_test import parse_lean_spec
from hypothesis import given

FLOOR = 0.01

if __name__ == "__main__":
    bad = False
    for spec in sys.argv[1:]:
        info = parse_lean_spec(spec)
        src = source_for(spec)
        if info is None or src is None:
            print(f"❌ {spec}: unresolvable"); bad = True; continue
        if not info["hypothesis"]:
            print(f"✓ {spec}: no precondition to be vacuous about"); continue
        check, stats = build_property(info, load_module(src.read_text()))
        try:
            RUN(given(**{a: INTS for a in info["args"]})(check))()
        except Exception:
            pass
        rate = stats["reached"] / stats["total"] if stats["total"] else 0.0
        if rate < FLOOR:
            print(f"❌ {spec}: vacuous — precondition holds for {rate:.2%} of inputs")
            bad = True
        else:
            print(f"✓ {spec}: precondition reachable ({rate:.0%})")
    sys.exit(1 if bad else 0)
