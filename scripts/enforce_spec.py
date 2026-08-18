#!/usr/bin/env python3
"""
SPEC ENFORCEMENT v2 (HARD MODE)

Blocks:
1. Trivial specs (a = a, x + y = x + y)
2. Specs that don't mention function name
3. Vacuous specs (True, ∀ x, x = x)
4. Specs shorter than N tokens
5. Specs that are always true (tautologies)
"""

import re
import sys


def is_trivial(spec_content):
    """Check for reflexivity: a = a"""
    if re.search(r':\s*(\w+)\s*=\s*\1', spec_content):
        return True
    if re.search(r':\s*(\w+\s*\+\s*\w+)\s*=\s*\1', spec_content):
        return True
    return False


def theorem_body(spec_content):
    """The statement between the binders and `:=` — the part that makes a claim.

    Checking the whole file is useless: the theorem is named `<func>_spec`, so
    the function name is always present and the check can never fail.
    """
    match = re.search(r'theorem\s+\w+[^:]*?:\s*(.+?):=', spec_content, re.DOTALL)
    return match.group(1) if match else spec_content


def mentions_function(spec_content, function_name):
    """The CLAIM must be about the function, not merely the theorem's name."""
    return function_name in theorem_body(spec_content)


def models_function(spec_content, function_name):
    """A `def <func>` must exist, or the claim is about operators, not your code.

    Without it Lean rejects the statement outright:
      error: Function expected at `add` ... The identifier `add` is unknown
    """
    return re.search(rf'\bdef\s+{re.escape(function_name)}\b', spec_content) is not None


def is_vacuous(spec_content):
    """Check for vacuous specs (True, ∀ x, x = x)"""
    if re.search(r':\s*True\s*:=', spec_content):
        return True
    if re.search(r':\s*∀\s*\w+,\s*\w+\s*=\s*\w+', spec_content):
        return True
    return False


def min_tokens(spec_content, min_count=10):
    """Check if spec has at least N tokens"""
    tokens = spec_content.split()
    if len(tokens) < min_count:
        return False
    return True


def is_tautology(spec_content):
    """Check for obvious tautologies"""
    if re.search(r':\s*∀\s*\w+,\s*\w+\s*≤\s*\w+\s*→\s*\w+\s*≤\s*\w+', spec_content):
        return True
    return False


def enforce_spec(spec_file):
    function_name = spec_file.split('/')[-1].replace('_spec.lean', '')

    with open(spec_file, 'r') as f:
        spec = f.read()

    checks = [
        ("Not trivial", not is_trivial(theorem_body(spec))),
        ("Mentions function in the claim", mentions_function(spec, function_name)),
        ("Models the function (def present)", models_function(spec, function_name)),
        ("Not vacuous", not is_vacuous(spec)),
        ("Has enough tokens", min_tokens(spec, min_count=10)),
        ("Not tautology", not is_tautology(spec)),
    ]

    all_pass = True
    for check_name, passed in checks:
        if not passed:
            print(f"❌ Spec {spec_file} failed: {check_name}")
            all_pass = False

    if all_pass:
        print(f"✓ Spec {spec_file} passed all checks.")

    return all_pass


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: enforce_spec.py <spec_file> [spec_file2 ...]")
        sys.exit(1)

    all_pass = True
    for spec_file in sys.argv[1:]:
        if not enforce_spec(spec_file):
            all_pass = False

    sys.exit(0 if all_pass else 1)
