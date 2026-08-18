#!/usr/bin/env python3
"""
PROOF TEMPLATES: Auto-generate Lean proofs for common patterns.

Pairs with spec_templates.py. For these five shapes the proof is mechanical, so
no model sits in the path — the tactic script is determined by the pattern and
the Mathlib lemma.

Three things this has to get right, each learned from a failure:

  1. Emit the same `def` the spec emits. AXLE checks the candidate against the
     formal statement; a proof without the def does not typecheck.
  2. Statements must match spec_templates.py exactly. An `identity` proof of
     `f x = x` against a spec of `f x 0 = x` is a different theorem, and AXLE
     rejects the pair.
  3. Multi-lemma templates need every placeholder supplied. `bounds` needs a low
     and a high lemma; passing one raised KeyError: 'mathlib_lemma_low'.

Usage:
  python3 scripts/proof_templates.py commutativity multiply --body "a * b"
  python3 scripts/proof_templates.py bounds clamp --body "max lo (min hi x)" --hyp "lo ≤ hi"
"""

import argparse
import sys

PROOF_TEMPLATES = {
    'commutativity': {
        'args': 'a b : Int',
        'statement': '{func} a b = {func} b a',
        'tactics': '  unfold {func}\n  exact {lemma} a b',
    },
    'associativity': {
        'args': 'a b c : Int',
        'statement': '{func} ({func} a b) c = {func} a ({func} b c)',
        'tactics': '  unfold {func}\n  exact {lemma} a b c',
    },
    'identity': {
        'args': 'x : Int',
        'statement': '{func} {v0} {unit} = {v0}',
        'tactics': '  unfold {func}\n  exact {lemma} {v0}',
    },
    'self_inverse': {
        'args': 'a b : Int',
        'statement': '{func} {v0} {v0} = 0',
        'tactics': '  unfold {func}\n  exact {lemma} {v0}',
    },
    'bounds': {
        'args': 'lo hi x : Int',
        'statement': 'lo ≤ {func} lo hi x ∧ {func} lo hi x ≤ hi',
        'tactics': ('  unfold {func}\n  constructor\n'
                    '  · exact {lemma_low}\n  · exact {lemma_high}'),
    },
    'monotonicity': {
        'args': 'x y : Int',
        'statement': '{v0} ≤ {v1} → {func} {v0} ≤ {func} {v1}',
        'tactics': '  intro h\n  unfold {func}\n  exact {lemma} h',
    },
}

# Per-pattern lemma slots. `sorry` is never emitted silently — an unknown
# function is reported so the gap is visible rather than shipped as a proof.
LEMMAS = {
    'commutativity': {'multiply': 'mul_comm', 'add': 'add_comm'},
    'associativity': {'multiply': 'mul_assoc', 'add': 'add_assoc'},
    'identity': {'add': 'add_zero', 'subtract': 'sub_zero', 'multiply': 'mul_one'},
    'self_inverse': {'subtract': 'sub_self'},
    'bounds': {'clamp': {'lemma_low': 'le_max_left lo (min hi x)',
                         'lemma_high': 'max_le h (min_le_left hi x)'}},
    'monotonicity': {},
}


def generate_proof(template_name: str, func_name: str, body: str,
                   args: str | None = None, hyp: str | None = None,
                   unit: str = '0') -> str | None:
    if template_name not in PROOF_TEMPLATES:
        print(f"❌ Unknown template: {template_name}", file=sys.stderr)
        print(f"Available: {', '.join(PROOF_TEMPLATES)}", file=sys.stderr)
        return None

    tpl = PROOF_TEMPLATES[template_name]
    slots = LEMMAS.get(template_name, {}).get(func_name)
    if slots is None:
        print(f"❌ No Mathlib lemma registered for {template_name}/{func_name}.",
              file=sys.stderr)
        print("   Add one to LEMMAS rather than emitting `sorry` — a `sorry` proof",
              file=sys.stderr)
        print("   passes nothing and hides the gap.", file=sys.stderr)
        return None
    if isinstance(slots, str):
        slots = {'lemma': slots}

    def_args = args or tpl['args']
    binders = def_args.split(':')[0].split()
    vs = {f'v{i}': n for i, n in enumerate(binders)}
    vs['unit'] = unit
    hypothesis = f" (h : {hyp})" if hyp else ""
    statement = tpl['statement'].format(func=func_name, **vs)
    tactics = tpl['tactics'].format(func=func_name, **slots, **vs)

    return (
        f"def {func_name} ({def_args}) : Int := {body}\n\n"
        f"theorem {func_name}_spec ({def_args}){hypothesis} :\n"
        f"    {statement} := by\n{tactics}\n"
    )


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("template", choices=sorted(PROOF_TEMPLATES))
    p.add_argument("func")
    p.add_argument("--body", required=True)
    p.add_argument("--args")
    p.add_argument("--unit", default="0", help="identity element")
    p.add_argument("--hyp")
    ns = p.parse_args()

    proof = generate_proof(ns.template, ns.func, ns.body, ns.args, ns.hyp, ns.unit)
    if not proof:
        sys.exit(1)
    print(proof)
