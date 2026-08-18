#!/usr/bin/env python3
"""Gate: reject specs that are FALSE of the real function, before proving them."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from spec_source import source_for
from spec_strength import holds, load_module
from spec_to_test import parse_lean_spec

if __name__ == "__main__":
    bad = False
    for spec in sys.argv[1:]:
        info = parse_lean_spec(spec)
        src = source_for(spec)
        if info is None or src is None:
            print(f"❌ {spec}: unresolvable"); bad = True; continue
        ok, _ = holds(info, load_module(src.read_text()))
        if ok:
            print(f"✓ {spec}: no counterexample against {src}")
        else:
            print(f"❌ {spec}: COUNTEREXAMPLE — the spec is false of {src}")
            bad = True
    sys.exit(1 if bad else 0)
