#!/usr/bin/env python3
"""LAYER 2 — CANDIDATE SPECS. Proposals, never facts.

Everything emitted here is UNVALIDATED. A generated property is a hypothesis
about intent; it becomes a spec only after Layer 3 fails to refute it. Marking
confidence at birth is what stops "the generator produced it" from being
mistaken for "it is true".
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from typing import Any

from semantic_anchor import anchor_for

BY_ARITY = {
    2: ["commutativity", "associativity", "identity", "self_inverse"],
    3: ["bounds", "monotonicity"],
}


def candidates(source_file: str) -> list[dict[str, Any]]:
    a = anchor_for(source_file)
    if a is None:
        return []
    arity = len(a["type_hints"]["args"])
    named = {c["name"].lower() for c in a["contract"]}
    out: list[dict[str, Any]] = []
    for tpl in BY_ARITY.get(arity, []):
        # A docstring clause naming the property raises confidence from
        # "guessed from arity" to "the author wrote it down" — still unvalidated.
        supported = any(tpl.startswith(n[:5]) or n.startswith(tpl[:5]) for n in named)
        out.append(
            {
                "template": tpl,
                "function": a["function"],
                "confidence": "medium" if supported else "low",
                "anchored_by": "docstring contract" if supported else "arity only",
                "validated": False,
            }
        )
    return out


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("sources", nargs="+")
    p.add_argument("--json", action="store_true")
    ns = p.parse_args()
    allc: list[dict[str, Any]] = []
    for s in ns.sources:
        c = candidates(s)
        allc += c
        if not ns.json:
            print(f"── {s}  ({len(c)} CANDIDATES — unvalidated)")
            for x in c:
                print(
                    f"   {x['template']:<16} confidence={x['confidence']:<7} "
                    f"anchored_by={x['anchored_by']:<19} validated={x['validated']}"
                )
    if ns.json:
        print(json.dumps(allc, indent=2))
