#!/usr/bin/env python3
"""Gate: reject specs that are FALSE of the real function, before proving them."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from spec_source import source_for
from spec_strength import holds, load_module
from spec_to_test import SpecParseError, parse_lean_spec

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
        # Fail closed: no parse means no search was performed, which is not
        # the same as "no counterexample found".
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
        ok, _ = holds(info, load_module(src.read_text()))
        if ok:
            print(f"✓ {spec}: no counterexample against {src}")
        else:
            print(f"❌ {spec}: COUNTEREXAMPLE — the spec is false of {src}")
            bad = True
    sys.exit(1 if bad else 0)
