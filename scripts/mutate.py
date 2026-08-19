#!/usr/bin/env python3
"""
MUTATION OPERATORS — realistic bugs, generated from the AST.

String replacement cannot do this job. `original.replace('+', '-')` also rewrites
`+` inside strings, comments and augmented assignment, and
`replace('return', 'return 0  #')` comments out the real expression rather than
mutating it. Both produce mutants that are broken rather than subtly wrong, and
a spec kills those trivially — which inflates the strength score.

Each operator here models a bug a person actually writes.
"""

import ast
import copy
from dataclasses import dataclass


@dataclass
class Mutant:
    name: str
    source: str


_BINOP_SWAPS: dict[type[ast.operator], type[ast.operator]] = {
    ast.Add: ast.Sub, ast.Sub: ast.Add,
    ast.Mult: ast.FloorDiv, ast.FloorDiv: ast.Mult,
}
_CMP_SWAPS: dict[type[ast.cmpop], type[ast.cmpop]] = {
    ast.GtE: ast.Gt, ast.LtE: ast.Lt,
    ast.Gt: ast.GtE, ast.Lt: ast.LtE,
    ast.Eq: ast.NotEq, ast.NotEq: ast.Eq,
}


class _Mutator(ast.NodeTransformer):
    """Applies exactly one mutation, selected by index."""

    def __init__(self, target: int) -> None:
        self.target = target
        self.seen = 0
        self.applied = None

    def _fire(self, label: str) -> bool:
        hit = self.seen == self.target
        self.seen += 1
        if hit:
            self.applied = label
        return hit

    def visit_BinOp(self, node: ast.BinOp) -> ast.AST:
        self.generic_visit(node)
        swap = _BINOP_SWAPS.get(type(node.op))
        if swap and self._fire(f"binop {type(node.op).__name__}->{swap.__name__}"):
            node.op = swap()
        return node

    def visit_Compare(self, node: ast.Compare) -> ast.AST:
        self.generic_visit(node)
        for i, op in enumerate(node.ops):
            swap = _CMP_SWAPS.get(type(op))
            if swap and self._fire(f"compare {type(op).__name__}->{swap.__name__}"):
                node.ops[i] = swap()
        return node

    def visit_Constant(self, node: ast.Constant) -> ast.AST:
        if isinstance(node.value, int) and not isinstance(node.value, bool):
            if self._fire(f"constant {node.value}->{node.value + 1}"):
                return ast.Constant(value=node.value + 1)
        return node

    def visit_Return(self, node: ast.Return) -> ast.AST:
        self.generic_visit(node)
        # Swap operands: a - b  ->  b - a. Invisible to a commutative spec,
        # fatal to a correct one — exactly the bug worth detecting.
        if isinstance(node.value, ast.BinOp) and self._fire("swap operands"):
            node.value.left, node.value.right = node.value.right, node.value.left
            return node
        if node.value is not None and self._fire("return constant 0"):
            return ast.Return(value=ast.Constant(value=0))
        return node


def generate_mutants(source: str, qualifier: str = "") -> list[Mutant]:
    """Every single-point mutant of `source`, in AST order.

    `qualifier` names the file the source came from, and it is what makes a
    mutant name mean something across files.

    THE DEFECT IT CLOSES, MEASURED. A mutant used to be named by its operator
    alone -- "return constant 0", "swap operands", "binop Sub->Add". Those
    strings are not unique across functions: `src/add.py` and `src/subtract.py`
    both have a "return constant 0". `scripts/check_composition.py` scores a
    SET of specs by intersecting their survivor sets, and the `spec-strength`
    gate hands it ten specs spanning four different source files. So add's kill
    of "return constant 0" cancelled subtract's survivor of a completely
    different mutant that happened to share a label, and the intersection
    shrank toward empty as more unrelated specs were added -- the score went UP
    as coverage went DOWN.

    Measured on the real repository, before this:

        ❌ specs/subself_spec.lean is too weak (0.33 < 0.90)
        ❌ specs/subtract_spec.lean is too weak (0.67 < 0.90)
           ... 6 of 10 specs below threshold
        JOINT strength: 1.00 (3/3 killed by the set)
        exit 0

    A required check printing six failures and reporting a perfect score.

    Set-scoring itself is deliberate and stays -- check_composition.py explains
    why gating each spec separately throws away correct sets. Only the names
    change, so specs of the SAME source still intersect exactly as before.
    """
    tree = ast.parse(source)
    total = _Mutator(-1)
    total.visit(copy.deepcopy(tree))
    count = total.seen

    mutants: list[Mutant] = []
    for i in range(count):
        m = _Mutator(i)
        mutated = m.visit(copy.deepcopy(tree))
        if m.applied is None:
            continue
        ast.fix_missing_locations(mutated)
        try:
            code = ast.unparse(mutated)
        except (ValueError, RecursionError, AttributeError):
            # An un-unparseable tree is not a usable mutant; skip it. Narrowed
            # so a genuine bug in an operator surfaces instead of vanishing.
            continue
        if code.strip() == ast.unparse(ast.parse(source)).strip():
            continue  # no observable change; not a mutant
        name = f"{qualifier}::{m.applied}" if qualifier else m.applied
        mutants.append(Mutant(name=name, source=code))
    return mutants


if __name__ == "__main__":
    import sys
    with open(sys.argv[1]) as f:
        src = f.read()
    for i, mut in enumerate(generate_mutants(src), 1):
        print(f"--- mutant {i}: {mut.name} ---")
        print(mut.source)
