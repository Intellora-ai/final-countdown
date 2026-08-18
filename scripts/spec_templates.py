#!/usr/bin/env python3
"""
SPEC TEMPLATES: Generate Lean specs for common patterns.

Every generated spec carries a Lean `def` mirroring the Python function, then a
theorem about that def. Without the def, Lean has no such identifier and AXLE
rejects the statement before it ever reaches the proof:

    error: Function expected at `add` ... The identifier `add` is unknown

The def is also what makes the spec genuinely about your function rather than
about the `+` operator, so `enforce_spec.py` can check it for real.

Usage:
  python3 scripts/spec_templates.py commutativity add  --body "a + b"
  python3 scripts/spec_templates.py bounds       clamp --body "max lo (min hi x)" \
      --args "lo hi x : Int" --hyp "lo <= hi"
"""

import argparse
import sys

TEMPLATES = {
    'commutativity': {
        'args': 'a b : Int',
        'statement': '{func} a b = {func} b a',
    },
    'associativity': {
        'args': 'a b c : Int',
        'statement': '{func} ({func} a b) c = {func} a ({func} b c)',
    },
    'identity': {
        'args': 'x : Int',
        'statement': '{func} {v0} {unit} = {v0}',
    },
    'self_inverse': {
        'args': 'a b : Int',
        'statement': '{func} {v0} {v0} = 0',
    },
    'bounds': {
        'args': 'lo hi x : Int',
        'statement': 'lo ≤ {func} lo hi x ∧ {func} lo hi x ≤ hi',
    },
    'monotonicity': {
        'args': 'x y : Int',
        'statement': '{v0} ≤ {v1} → {func} {v0} ≤ {func} {v1}',
    },
}


def generate_spec(template_name: str, func_name: str, body: str,
                  args: str | None = None, hyp: str | None = None,
                  unit: str = '0') -> str | None:
    if template_name not in TEMPLATES:
        print(f"❌ Unknown template: {template_name}", file=sys.stderr)
        print(f"Available: {', '.join(TEMPLATES)}", file=sys.stderr)
        return None

    tpl = TEMPLATES[template_name]
    def_args = args or tpl['args']
    binders = def_args.split(':')[0].split()
    vs = {f'v{i}': n for i, n in enumerate(binders)}
    vs['unit'] = unit
    statement = tpl['statement'].format(func=func_name, **vs)
    hypothesis = f" (h : {hyp})" if hyp else ""

    return (
        f"-- Lean model of src/{func_name}.py — the def is the contract's subject.\n"
        f"def {func_name} ({def_args}) : Int := {body}\n\n"
        f"theorem {func_name}_spec ({def_args}){hypothesis} :\n"
        f"    {statement} := by sorry\n"
    )


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("template", choices=sorted(TEMPLATES))
    p.add_argument("func")
    p.add_argument("--body", required=True, help="Lean expression the Python computes")
    p.add_argument("--args", help="override the binder list, e.g. 'lo hi x : Int'")
    p.add_argument("--unit", default="0", help="identity element")
    p.add_argument("--hyp", help="precondition, e.g. 'lo <= hi'")
    ns = p.parse_args()

    spec = generate_spec(ns.template, ns.func, ns.body, ns.args, ns.hyp, ns.unit)
    if not spec:
        sys.exit(1)
    print(spec)
