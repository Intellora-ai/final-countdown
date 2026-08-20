#!/usr/bin/env python3
"""Gate: reject specs whose precondition is (almost) never satisfiable."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from spec_source import source_for
from spec_strength import build_property, load_module, RUN, INTS, SpecViolation
from spec_to_test import SpecParseError, parse_lean_spec
from hypothesis import given

FLOOR = 0.01

if __name__ == "__main__":
    if not sys.argv[1:]:
        # A loop over nothing exits 0, so this gate would report success having
        # examined no spec at all. Same class as an empty scan uploading a
        # valid-but-blank report: the set has to be non-empty before any
        # statement about its members means anything.
        print(
            "❌ no spec files given — this gate would have checked nothing",
            file=sys.stderr,
        )
        sys.exit(1)
    bad = False
    for spec in sys.argv[1:]:
        # Fail closed. An unparsable spec is not a spec this gate skipped —
        # it is a spec this gate could not check, which is a failure.
        try:
            info = parse_lean_spec(spec)
        except SpecParseError as exc:
            print(f"❌ {spec}: unparsable — {exc}")
            bad = True
            continue
        src = source_for(spec)
        if src is None:
            print(f"❌ {spec}: unresolvable")
            bad = True
            continue
        if not info["hypothesis"]:
            print(f"✓ {spec}: no precondition to be vacuous about")
            continue
        check, stats = build_property(info, load_module(src.read_text()))
        # A property failure here is expected and irrelevant: this gate only
        # measures how often the PRECONDITION held, which `check` records
        # before evaluating the claim. Narrow so real errors still surface.
        try:
            RUN(given(**{a: INTS for a in info["args"]})(check))()
        except SpecViolation:
            pass
        rate = stats["reached"] / stats["total"] if stats["total"] else 0.0
        if rate < FLOOR:
            print(f"❌ {spec}: vacuous — precondition holds for {rate:.2%} of inputs")
            bad = True
        else:
            print(f"✓ {spec}: precondition reachable ({rate:.0%})")
    sys.exit(1 if bad else 0)
