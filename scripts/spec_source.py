#!/usr/bin/env python3
"""Resolve a spec file to the Python source it constrains.

Filename arithmetic (`${spec/specs/src}`) breaks as soon as one function has two
specs: `specs/addid_spec.lean` maps to `src/addid.py`, which does not exist. The
spec already names its subject in the `def` line, so read it from there.
"""
import re
import sys
from pathlib import Path


def source_for(spec_file):
    text = Path(spec_file).read_text(encoding="utf-8")
    # Anchored to line start: an unanchored \bdef matches prose in a comment
    # ("the def is the contract's subject" -> src/is.py).
    m = re.search(r'^def\s+(\w+)', text, re.MULTILINE)
    if not m:
        return None
    candidate = Path("src") / f"{m.group(1)}.py"
    return candidate if candidate.is_file() else None


if __name__ == "__main__":
    for spec in sys.argv[1:]:
        src = source_for(spec)
        if src is None:
            print(f"❌ {spec}: no `def` naming a file under src/", file=sys.stderr)
            sys.exit(1)
        print(f"{spec}={src}")
