#!/usr/bin/env python3
"""LAYER 9 — no eval() anywhere in the claim path.

A claim is a closed arithmetic/comparison expression over bound variables and
the function under test. That is a small enough language to interpret directly,
so eval() and its stripped-__builtins__ escape-hatch arguments are unnecessary.
Unknown node types raise instead of degrading to Python's evaluator.
"""

import ast
import operator

_BIN = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
        ast.FloorDiv: operator.floordiv, ast.Mod: operator.mod,
        ast.BitXor: operator.xor, ast.BitOr: operator.or_, ast.BitAnd: operator.and_}
_CMP = {ast.Eq: operator.eq, ast.NotEq: operator.ne, ast.Lt: operator.lt,
        ast.LtE: operator.le, ast.Gt: operator.gt, ast.GtE: operator.ge}
_UNARY = {ast.USub: operator.neg, ast.UAdd: operator.pos, ast.Not: operator.not_}

ALLOWED_CALLS = {"min", "max", "abs"}


class UnsupportedClaim(Exception):
    pass


def evaluate(node, env):
    if isinstance(node, ast.Expression):
        return evaluate(node.body, env)
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Name):
        if node.id not in env:
            raise UnsupportedClaim(f"unbound name {node.id!r}")
        return env[node.id]
    if isinstance(node, ast.UnaryOp):
        return _UNARY[type(node.op)](evaluate(node.operand, env))
    if isinstance(node, ast.BinOp):
        op = _BIN.get(type(node.op))
        if op is None:
            raise UnsupportedClaim(f"operator {type(node.op).__name__}")
        return op(evaluate(node.left, env), evaluate(node.right, env))
    if isinstance(node, ast.BoolOp):
        vals = [evaluate(v, env) for v in node.values]
        return all(vals) if isinstance(node.op, ast.And) else any(vals)
    if isinstance(node, ast.Compare):
        left = evaluate(node.left, env)
        for op, right_node in zip(node.ops, node.comparators):
            right = evaluate(right_node, env)
            fn = _CMP.get(type(op))
            if fn is None:
                raise UnsupportedClaim(f"comparison {type(op).__name__}")
            if not fn(left, right):
                return False
            left = right
        return True
    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name):
            raise UnsupportedClaim("only simple function calls are allowed")
        name = node.func.id
        target = env.get(name)
        if target is None or (name not in ALLOWED_CALLS and not callable(target)):
            raise UnsupportedClaim(f"call to {name!r}")
        return target(*[evaluate(a, env) for a in node.args])
    raise UnsupportedClaim(type(node).__name__)


def compile_claim(text):
    tree = ast.parse(text, mode="eval")
    return lambda env: evaluate(tree, env)
