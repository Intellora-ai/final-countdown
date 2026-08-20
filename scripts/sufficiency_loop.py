#!/usr/bin/env python3
"""SUFFICIENCY LOOP — witness -> semantic anchor -> derived spec.

A witness is an alternative implementation satisfying every spec you wrote while
computing something else. Killing it with any property that happens to exclude it
would be circular: the spec would exist only to defeat the witness, and would
encode nothing about intent.

So the witness is taken to the SEMANTIC ANCHOR instead:

    witness found
         |
    find an input where witness != original
         |
    does an authoritative assertion cover that input?
      /                                    \\
    YES: the anchor refutes the witness     NO: the anchor is silent
         |                                       |
    derive the spec from the ANCHOR's fact   report UNKNOWN - a human must
    (it was always intended, merely unstated)  say what the behaviour should be

SCOPED STATES - "ESTABLISHED" never means "fully specified":
  ESTABLISHED      no witness survived WITHIN THE DECLARED SEARCH SCOPE
  NOT_ESTABLISHED  a valid alternative implementation survived
  UNKNOWN          scope could not be searched, or the anchor cannot decide
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from collections.abc import Callable, Sequence
from typing import Any

from contract_strength import (
    ALTERNATIVES_2,
    ALTERNATIVES_3,
    PROBES_2,
    PROBES_3,
    distinct,
)
from safe_eval import UnsupportedClaim, compile_claim
from semantic_anchor import anchor_for
from spec_source import source_for
from spec_strength import holds, load_module
from spec_to_test import SpecParseError, parse_lean_spec

SCOPE = {
    "domain": "integers [-1000, 1000]",
    "examples_per_property": 120,
    "probe_points": None,  # filled per arity
    "witness_table": None,
}


def divergence(
    original: Callable[..., int],
    alt: Callable[..., int],
    probes: Sequence[tuple[int, ...]],
) -> dict[str, Any] | None:
    """First probe point where the two implementations disagree."""
    for values in probes:
        try:
            a, b = original(*values), alt(*values)
        except (ValueError, TypeError, ZeroDivisionError, ArithmeticError):
            # An input one side rejects is not evidence of divergence in value.
            # Narrowed so an unexpected fault surfaces instead of being skipped.
            continue
        if a != b:
            return {"inputs": values, "original": a, "witness": b}
    return None


def anchor_verdict(
    anchor: dict[str, Any], func_name: str, div: dict[str, Any]
) -> str | None:
    """Does an authoritative assertion settle this divergence?

    Only the anchor's own assertions are consulted. Nothing is invented here.
    """
    if not anchor or not anchor["tests"]:
        return None
    for assertion in anchor["tests"]:
        try:
            claim = compile_claim(assertion)
        except (SyntaxError, ValueError):
            continue
        # Evaluate the assertion against each implementation's actual function.
        try:
            ok_original = claim(
                {func_name: anchor["_original"], "min": min, "max": max, "abs": abs}
            )
            ok_witness = claim(
                {func_name: anchor["_witness"], "min": min, "max": max, "abs": abs}
            )
        except (UnsupportedClaim, TypeError, ValueError, ArithmeticError):
            # The assertion references something outside the claim language, or
            # the implementation rejects it; either way it cannot settle intent.
            continue
        if ok_original and not ok_witness:
            return assertion
    return None


def run(spec_files: list[str], verbose: bool = True) -> dict[str, Any]:
    """Raises SpecParseError if ANY spec fails to parse — see contract_strength.assess."""
    if not spec_files:
        return {
            "sufficiency": "UNKNOWN",
            "reason": "no spec files given",
            "scope": SCOPE,
        }
    infos = [(s, parse_lean_spec(s)) for s in spec_files]

    src = source_for(spec_files[0])
    if src is None:
        return {
            "sufficiency": "UNKNOWN",
            "reason": f"no src/ file for {spec_files[0]}",
            "scope": SCOPE,
        }
    original_mod = load_module(Path(src).read_text())
    func_name = infos[0][1]["function_name"]
    original = getattr(original_mod, func_name)
    arity = len(infos[0][1]["args"])
    table = ALTERNATIVES_2 if arity == 2 else ALTERNATIVES_3
    probes = PROBES_2 if arity == 2 else PROBES_3

    anchor = anchor_for(str(src))
    scope = dict(SCOPE, probe_points=len(probes), witness_table=len(table))

    tested = 0
    survivors: list[tuple[str, Callable[..., int]]] = []
    for label, fn in table.items():
        if not distinct(original, fn, probes):
            continue
        tested += 1
        stand_in = type(sys)("alt")
        setattr(stand_in, func_name, fn)
        if all(holds(i, stand_in)[0] for _, i in infos):
            survivors.append((label, fn))

    if not survivors:
        return {
            "sufficiency": "ESTABLISHED",
            "scope": scope,
            "witnesses_tested": tested,
            "witnesses_excluded": tested,
            "reason": f"no witness survived within scope ({tested} tested)",
            "derivations": [],
        }

    derivations: list[dict[str, Any]] = []
    for label, fn in survivors:
        div = divergence(original, fn, probes)
        if div is None:
            continue
        if anchor is None:
            continue
        anchor["_original"], anchor["_witness"] = original, fn
        refuting = anchor_verdict(anchor, func_name, div)
        derivations.append(
            {
                "witness": label,
                "diverges_at": div,
                "anchor_refutes": refuting,
                "derived_from_anchor": (
                    f"{func_name}{div['inputs']} = {div['original']}"
                    if refuting
                    else None
                ),
            }
        )

    decided = [d for d in derivations if d["anchor_refutes"]]
    state = "NOT_ESTABLISHED" if decided else "UNKNOWN"
    return {
        "sufficiency": state,
        "scope": scope,
        "witnesses_tested": tested,
        "witnesses_excluded": tested - len(survivors),
        "reason": (
            f"{len(survivors)} witness(es) survived; "
            + (
                "the anchor refutes them, so a spec is derivable"
                if decided
                else "the anchor is silent — intent must be stated by a human"
            )
        ),
        "derivations": derivations,
    }


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("specs", nargs="+")
    ns = p.parse_args()
    try:
        r = run(ns.specs)
    except SpecParseError as exc:
        print(f"❌ unparsable spec — the loop did NOT run: {exc}")
        sys.exit(1)
    sc = r["scope"]
    print(
        f"  Sufficiency:      {r['sufficiency']}"
        + (
            f" (within scope: {sc['domain']})"
            if r["sufficiency"] == "ESTABLISHED"
            else ""
        )
    )
    print(
        f"  Scope:            {sc['domain']}, {sc['witness_table']} candidate implementations"
    )
    print(f"  Search depth:     {sc['examples_per_property']} examples per property")
    print(f"  Witnesses tested: {r['witnesses_tested']}")
    print(f"  Witnesses excluded: {r['witnesses_excluded']}")
    print(f"  {r['reason']}")
    for d in r["derivations"]:
        print(f"\n  witness: {d['witness']}")
        i = d["diverges_at"]
        print(
            f"    diverges at {i['inputs']}: original={i['original']}  witness={i['witness']}"
        )
        if d["anchor_refutes"]:
            print(f"    anchor refutes it:  {d['anchor_refutes']}")
            print(f"    DERIVED FROM ANCHOR (not invented): {d['derived_from_anchor']}")
        else:
            print("    anchor is SILENT here — do not invent a spec; state the intent")
    print("\n  NOTE: ESTABLISHED means no witness survived the declared scope.")
    print("        It does NOT mean the function is fully specified.")
