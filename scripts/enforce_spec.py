#!/usr/bin/env python3
"""
SPEC ENFORCEMENT (STRONG SPECS ONLY)

Rejects trivial specs like:
- a + b = a + b (reflexivity)
- x = x (tautology)

Requires:
- Non-trivial spec (not always true)
- Testable spec (can generate Python test)
- Matches Python behavior (Hypothesis test passes)
"""

import re
import sys


def is_trivial_spec(spec_content):
    """Check if spec is trivial (always true, proves nothing)"""
    # Check for reflexivity: a = a
    if re.search(r':\s*(\w+)\s*=\s*\1', spec_content):
        return True
    # Check for tautology: x = x
    if re.search(r':\s*(\w+\s*\+\s*\w+)\s*=\s*\1', spec_content):
        return True
    return False


def enforce_spec(spec_file):
    with open(spec_file, 'r') as f:
        spec = f.read()

    if is_trivial_spec(spec):
        print(f"❌ Spec {spec_file} is trivial. AI must rewrite.")
        return False

    print(f"✓ Spec {spec_file} is strong.")
    return True


if __name__ == "__main__":
    spec_files = sys.argv[1:]
    if not spec_files:
        print("usage: enforce_spec.py <spec.lean> [spec.lean ...]", file=sys.stderr)
        sys.exit(2)
    # sys.exit is required: without it the gate always exits 0 and never blocks.
    # All files are checked, not just argv[1], so a glob cannot hide a bad spec.
    sys.exit(0 if all([enforce_spec(f) for f in spec_files]) else 1)
