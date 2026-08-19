#!/usr/bin/env python3
"""
SPEC ENFORCEMENT v4 — MUTATION-BASED STRENGTH.

    Never measure a spec by whether it is true.
    Measure it by whether a realistic bug would make it false.

`f(a, b) == f(a, b)` is true, syntactically valid, mentions the function, and
survives every mutant. Syntax checks pass it; mutation scoring gives it 0.00.

Four measurements, cheapest first, each able to reject on its own:

  1. COUNTEREXAMPLE FIRST — is the spec false about the real function?
     Hypothesis tries to break it before any proof is attempted. A false spec
     is rejected here rather than after an expensive failed proof.

  2. VACUITY — is the precondition reachable? A spec guarded by an assume()
     that almost nothing satisfies is never exercised, so it constrains nothing.

  3. STRENGTH — of N single-point mutants, how many does the spec reject?
     killed / total. Below the threshold the spec is too weak to be worth proving.

     Mutants nothing could tell apart from the original are excluded from
     `total`. That exclusion is decided by evaluating both on a FINITE WITNESS
     SET, so what it establishes is OBSERVATIONAL EQUIVALENCE UNDER THAT WITNESS
     SET — never SEMANTIC EQUIVALENCE. The two are not the same claim: agreement
     on N witnesses implies nothing about witness N+1, and a real behavioural
     change that happens to agree on all of them would leave the denominator and
     push the score UP when it should push it DOWN. It cannot be strengthened
     into equivalence — that question is undecidable (Rice's theorem) and the
     integer domain is infinite, so exhaustion is unavailable.

     The witnesses are DERIVED, not stumbled on: six independent strategies,
     unioned, each carrying the label of the strategy that produced it, so a
     mutant that IS distinguished names the strategy that caught it. See the
     block above `observationally_equivalent_under_witness_set` for the full
     argument, the six strategies, and the numbers printed.

     A denominator of zero is a hard FAIL, never a vacuous 100%.

  4. COMPOSITION — which minimal subset of specs jointly kills every mutant that
     any of them kills. Reported so redundant specs can be dropped.

The Lean claim is executed via the same translation `spec_to_test.py` uses, so
the property scored here is the property the proof is about.
"""

import argparse
import ast
import functools
import hashlib
import importlib.util
import itertools
import json
import math
import os
import sys
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, NamedTuple, cast
from collections.abc import Callable
from types import ModuleType

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mutate import Mutant, generate_mutants  # noqa: E402
from safe_eval import compile_claim  # noqa: E402
from spec_to_test import (  # noqa: E402
    Expr, SpecParseError, expr_to_python, parse_lean_spec,
)

from hypothesis import HealthCheck, given, settings, strategies as st  # noqa: E402
from hypothesis import errors as hyp_errors  # noqa: E402

INTS = st.integers(min_value=-1000, max_value=1000)
RUN = settings(
    max_examples=120,
    deadline=None,
    database=None,
    suppress_health_check=list(HealthCheck),  # pyright: ignore[reportArgumentType]
)


class SpecViolation(AssertionError):
    """Raised when a property fails. A plain `assert` disappears under -O,
    which would silently turn every spec check into a no-op."""


def load_module(source: str, name: str | None = None) -> ModuleType:
    """Import mutated source through the normal file-backed import machinery.

    Running a mutant means executing it — that is the measurement. Doing it via
    a real loader instead of the exec() builtin keeps standard module
    semantics (__file__, tracebacks) and leaves no bare exec in the codebase.
    """
    name = name or f"_m{uuid.uuid4().hex}"
    tmp = Path(tempfile.gettempdir()) / f"{name}.py"
    tmp.write_text(source, encoding="utf-8")
    try:
        spec = importlib.util.spec_from_file_location(name, tmp)
        if spec is None or spec.loader is None:
            raise ImportError(f"cannot load mutant module {name}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        tmp.unlink(missing_ok=True)


def build_property(info: dict[str, Any], module: ModuleType
                   ) -> tuple[Callable[..., None], dict[str, int]]:
    """Return (check, reached) — check raises on violation, reached counts hits."""
    func = getattr(module, info["function_name"])
    # Rendered from the parsed tree, not re-derived from text. The Lean strings
    # in the record are for humans; scoring anything but the tree that was
    # actually parsed is how a misparse turns into a false green.
    claim = expr_to_python(info["property_ast"])
    hypothesis_ast: Expr | None = info["hypothesis_ast"]
    guard = expr_to_python(hypothesis_ast) if hypothesis_ast is not None else None
    # No eval(): safe_eval interprets the claim's AST directly (Layer 9).
    claim_code = compile_claim(claim)
    guard_code = compile_claim(guard) if guard else None
    stats = {"reached": 0, "total": 0}

    def check(**values: int) -> None:
        env: dict[str, Any] = dict(values)
        env["min"] = min
        env["max"] = max
        env["abs"] = abs
        env[info["function_name"]] = func
        stats["total"] += 1
        if guard_code is not None and not guard_code(env):
            return
        stats["reached"] += 1
        if not claim_code(env):
            raise SpecViolation(f"spec violated at {env}")

    return check, stats


def holds(info: dict[str, Any], module: ModuleType) -> tuple[bool, dict[str, int]]:
    """True if the property survives Hypothesis against this module."""
    check, stats = build_property(info, module)
    runner = RUN(given(**{a: INTS for a in info["args"]})(check))
    try:
        runner()
    except SpecViolation:
        return False, stats
    except hyp_errors.FailedHealthCheck:
        return True, stats
    except Exception as exc:
        if __debug__ and os.environ.get("SPEC_STRENGTH_DEBUG"):
            print(f"     [harness] {type(exc).__name__}: {exc}", file=sys.stderr)
        return False, stats
    return True, stats


# ══════════════════════════════════════════════════════════════════════════════
# OBSERVATIONAL EQUIVALENCE UNDER A WITNESS SET — *not* semantic equivalence.
#
# WHAT IS ESTABLISHED
#   For one finite, named, reproducible SET OF WITNESSES, the original and the
#   mutant produced the same observation (same value of the same type, or the
#   same exception type and message). Nothing more.
#
# WHAT IS *NOT* ESTABLISHED
#   That they compute the same function. Agreement on N witnesses says nothing
#   about witness N+1. The old label was "equivalent mutant", which claimed
#   exactly the thing the check cannot show.
#
# WHY IT MATTERS — the false-green
#   An excluded mutant leaves the denominator. If a mutant is a REAL behavioural
#   change that happens to agree on every witness, excluding it makes the spec's
#   score go UP when it should go DOWN.
#
# WHY MORE RANDOM EXAMPLES DO NOT FIX IT
#   The residual case is a difference at a single COMPUTED point:
#
#       if a * a == 99980001:   # true only at a == ±9999
#           return 0
#
#   9999 appears nowhere in either source; only 99980001 does. A band around
#   every literal misses it, boundaries miss it, and 256 seeded tuples plus 300
#   Hypothesis examples over an unbounded integer domain will not land on one
#   point. The probability of stumbling on it does not improve usefully with
#   more draws — it has to be DERIVED. So the witness set is built by SOLVING
#   the predicates in both sources, not by sampling harder.
#
# WHY IT STILL CANNOT BE STRENGTHENED TO SEMANTIC EQUIVALENCE
#   Deciding whether two arbitrary Python functions compute the same function is
#   undecidable (Rice's theorem; the mutant need not terminate). Exhaustion is
#   unavailable too: Python ints are unbounded. Solving covers the predicate
#   FORMS enumerated below and nothing else — a predicate outside those forms
#   (a hash, a loop, a call) is still only sampled. The honest move is a smaller
#   claim plus a derived search, and the size of that search is printed.
#
# THE SIX STRATEGIES, unioned, each able to contribute on its own:
#   1. literal      every integer constant in either source, plus n-1, n, n+1
#   2. predicate:*  solve `LHS <op> RHS` for the variable when one side is a
#                   constant — isqrt, divisor, offset, modulus, factor
#   3. branch       every `if`/`while`/ternary test, made true AND false
#   4. adversarial  0, ±1..±3, powers of 2 and 10 to 10^12, ±2^31, ±2^63
#   5. random       the seeded blake2b chain (ranges, not points)
#   6. hypothesis   the last net, and the only one that is a search
#
# Every witness carries the label of the strategy that DERIVED it, resolved
# most-specific-first, so a distinguished mutant can name which strategy caught
# it. That is how the derivation is demonstrated rather than asserted.
# ══════════════════════════════════════════════════════════════════════════════

OBSERVATIONALLY_EQUIVALENT_UNDER_WITNESS_SET = (
    "OBSERVATIONALLY_EQUIVALENT_UNDER_WITNESS_SET")

# Fixed so a run is reproducible: same seed -> same witness set -> same verdicts.
SAMPLE_SEED = 20260819

# ── provenance ────────────────────────────────────────────────────────────────
# A label per strategy. Ordered MOST SPECIFIC FIRST: when two strategies derive
# the same integer, the more specific derivation is the one reported, because
# "adversarial happened to include 10000" and "the divisor rule solved a*3 ==
# 30000 for a" are different claims about why the witness set works.
PROV_ISQRT = "predicate:isqrt"
PROV_DIVISOR = "predicate:divisor"
PROV_MODULUS = "predicate:modulus"
PROV_OFFSET = "predicate:offset"
PROV_FACTOR = "predicate:factor"
PROV_COMPARE = "predicate:compare"
PROV_BRANCH = "branch"
PROV_LITERAL = "literal"
PROV_ADVERSARIAL = "adversarial"
PROV_RANDOM = "random"
PROV_HYPOTHESIS = "hypothesis"

PROVENANCE_ORDER: tuple[str, ...] = (
    PROV_ISQRT, PROV_DIVISOR, PROV_MODULUS, PROV_OFFSET, PROV_FACTOR,
    PROV_COMPARE, PROV_BRANCH, PROV_LITERAL, PROV_ADVERSARIAL,
    PROV_RANDOM, PROV_HYPOTHESIS,
)
_PROVENANCE_RANK: dict[str, int] = {p: i for i, p in enumerate(PROVENANCE_ORDER)}


def provenance_rank(label: str) -> int:
    """Lower is more specific. Unknown labels sort last rather than crashing."""
    return _PROVENANCE_RANK.get(label, len(PROVENANCE_ORDER))


class Witness(NamedTuple):
    """One integer and the strategy that derived it."""

    value: int
    provenance: str


# Boundaries and magnitudes a six-point sample around zero never reaches. These
# seed the FULL CARTESIAN grid, which is the only leg that can pair two large
# values in one point (`if a > 500 and b > 500`). Kept small on purpose: the
# grid is |values|**arity, so everything else rides the axis sweep instead.
BOUNDARY_VALUES: tuple[int, ...] = (
    0, 1, -1, 2, -2, 3, -3, 10, -10, 1000, -1000,
    10**6, -10**6, 10**12, -10**12,
)
# Companions for the axis sweep: one derived witness is pinned into one
# argument position while the others take these. Deliberately tiny — the sweep
# is |witnesses| * arity * |companions|**(arity-1), and a derived witness needs
# to be PRESENT in a coordinate, not paired with every other value.
AXIS_COMPANIONS: tuple[int, ...] = (0, 1, -1, 1000, -1000)
RANDOM_MAGNITUDES: tuple[int, ...] = (8, 1000, 10**6, 10**12)
RANDOM_SAMPLE_TUPLES = 256
DISTINGUISHER_EXAMPLES = 300
# Predicate solving recurses through nested BinOps ((a+1)*(a+1) == k). Bounded
# so a pathological expression cannot turn witness generation into the gate's
# own denial of service.
MAX_SOLVE_DEPTH = 6


@dataclass(frozen=True)
class SampleVerdict:
    """The measured result of one indistinguishability search.

    `indistinguishable` True means: no distinguishing input was FOUND among
    `witness_set_size` derived witnesses expanded to `points_tested` points,
    plus `hypothesis_examples` searched examples. It does not mean none exists.

    `witness_provenance` is the strategy that produced the witness which DID
    distinguish, and is None when nothing distinguished.
    """

    indistinguishable: bool
    points_tested: int
    seed: int
    hypothesis_examples: int
    distinguishing_input: tuple[int, ...] | None
    note: str
    witness_set_size: int = 0
    witness_provenance: str | None = None
    strategy_counts: tuple[tuple[str, int], ...] = ()


def _parse(source: str) -> ast.Module:
    """Parse, or return an empty module. A mutant that will not parse cannot
    contribute witnesses, and must not take the whole generator down with it."""
    try:
        return ast.parse(source)
    except SyntaxError:
        return ast.Module(body=[], type_ignores=[])


def _int_constants(source: str) -> set[int]:
    """Every integer literal in `source`. Bugs cluster at the magic numbers.

    `-100000` is TWO nodes — UnaryOp(USub, Constant(100000)) — so a walk that
    only reads Constant records +100000 and bands the wrong side of zero. The
    negated form is recorded too; the positive one is kept as well, since a
    sign flip is itself a bug worth a witness.
    """
    found: set[int] = set()
    for node in ast.walk(_parse(source)):
        if isinstance(node, ast.Constant):
            value = node.value
            if isinstance(value, int) and not isinstance(value, bool):
                found.add(value)
        elif isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
            negated = _const_int(node)
            if negated is not None:
                found.add(negated)
    return found


def _const_int(node: ast.expr) -> int | None:
    """The integer this node denotes, or None.

    `-100000` is not a Constant — it is UnaryOp(USub, Constant(100000)). Reading
    only Constant would make every negative threshold invisible to the solver.
    """
    if isinstance(node, ast.Constant):
        value = node.value
        if isinstance(value, int) and not isinstance(value, bool):
            return value
        return None
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        inner = _const_int(node.operand)
        return None if inner is None else -inner
    return None


# ── STRATEGY 2: predicate solving ─────────────────────────────────────────────
def solve_for_variable(expr: ast.expr, k: int, label: str,
                       depth: int = 0) -> list[Witness]:
    """Values of the variable in `expr` that make `expr` land on `k`.

    Each rule is an arithmetic inverse, so the witness is DERIVED rather than
    stumbled on. `label` is the strategy credited; the FIRST specific rule to
    fire owns the credit all the way down the recursion, which is what makes
    `a * a == 99980001` report `predicate:isqrt` rather than the generic
    comparison rule that finishes the job at the leaf.

    Rules, both orientations, walking nested BinOps:
      x            -> k-1, k, k+1        (== <= < >= > all want the band)
      x*x, x**2    -> ±isqrt(k), ±1      ONLY when isqrt(k)**2 == k
      x*c          -> k//c               only when k % c == 0
      x+c          -> k-c
      x-c          -> k+c ;  c-x -> c-k
      x%c          -> k, k+c, k+2c
      x*y          -> ±1, ±k             (each factor divides k)
    """
    out: list[Witness] = []
    if depth > MAX_SOLVE_DEPTH:
        return out
    if isinstance(expr, ast.Name):
        # The leaf. Every comparison operator (==, <=, <, >=, >) is discriminated
        # by the same three values, so one band serves all five.
        out.extend(Witness(v, label) for v in (k - 1, k, k + 1))
        return out
    if isinstance(expr, ast.UnaryOp) and isinstance(expr.op, ast.USub):
        return solve_for_variable(expr.operand, -k, label, depth + 1)
    if not isinstance(expr, ast.BinOp):
        return out

    left, right, op = expr.left, expr.right, expr.op
    left_k, right_k = _const_int(left), _const_int(right)

    def credit(rule: str) -> str:
        """Keep the outermost specific rule's label; only the generic one yields."""
        return rule if label == PROV_COMPARE else label

    # x*x == k / x**2 == k. The guard is the whole point: without
    # `isqrt(k)**2 == k` this rule invents a witness for `a*a == 99980002`,
    # which no integer satisfies, and a bogus witness is a false distinction.
    is_square = (isinstance(op, ast.Mult) and left_k is None and right_k is None
                 and ast.dump(left) == ast.dump(right))
    is_power_two = isinstance(op, ast.Pow) and right_k == 2
    if (is_square or is_power_two) and k >= 0:
        root = math.isqrt(k)
        if root * root == k:
            for r in (root, -root):
                out.extend(solve_for_variable(left, r, credit(PROV_ISQRT),
                                              depth + 1))

    if isinstance(op, ast.Mult):
        # `k % c == 0` is the whole guard: without it `a * 3 == 30001` would
        # emit 10000, which does not satisfy the predicate — a witness that
        # cannot fire is a lie in the provenance report.
        if right_k not in (None, 0) and k % right_k == 0:
            out.extend(solve_for_variable(left, k // right_k,
                                          credit(PROV_DIVISOR), depth + 1))
        if left_k not in (None, 0) and k % left_k == 0:
            out.extend(solve_for_variable(right, k // left_k,
                                          credit(PROV_DIVISOR), depth + 1))
        if left_k is None and right_k is None and not is_square:
            # x*y == k: nothing pins one variable, but every factor of k divides
            # it, and the axis sweep pairs these with a companion 1 / -1.
            out.extend(Witness(v, credit(PROV_FACTOR))
                       for v in (1, -1, k, -k))
    elif isinstance(op, ast.Add):
        if right_k is not None:
            out.extend(solve_for_variable(left, k - right_k,
                                          credit(PROV_OFFSET), depth + 1))
        if left_k is not None:
            out.extend(solve_for_variable(right, k - left_k,
                                          credit(PROV_OFFSET), depth + 1))
    elif isinstance(op, ast.Sub):
        if right_k is not None:
            out.extend(solve_for_variable(left, k + right_k,
                                          credit(PROV_OFFSET), depth + 1))
        if left_k is not None:
            out.extend(solve_for_variable(right, left_k - k,
                                          credit(PROV_OFFSET), depth + 1))
    elif isinstance(op, ast.Mod) and right_k not in (None, 0):
        for residue in (k, k + right_k, k + 2 * right_k):
            out.extend(solve_for_variable(left, residue,
                                          credit(PROV_MODULUS), depth + 1))
    return out


def _solve_comparison(node: ast.Compare, label: str) -> list[Witness]:
    """Solve every constant-bearing side of one (possibly chained) comparison.

    Both orientations are tried: `a * a == 99980001` and `99980001 == a * a`
    are the same predicate and must yield the same witnesses.
    """
    out: list[Witness] = []
    operands: list[ast.expr] = [node.left, *node.comparators]
    for i in range(len(node.ops)):
        lhs, rhs = operands[i], operands[i + 1]
        for expr, other in ((lhs, rhs), (rhs, lhs)):
            k = _const_int(other)
            if k is None or _const_int(expr) is not None:
                continue
            out.extend(solve_for_variable(expr, k, label))
    return out


def predicate_witnesses(source: str) -> list[Witness]:
    """STRATEGY 2 — solve every comparison in `source` for its variable."""
    out: list[Witness] = []
    for node in ast.walk(_parse(source)):
        if isinstance(node, ast.Compare):
            out.extend(_solve_comparison(node, PROV_COMPARE))
    return out


# ── STRATEGY 1: literals ──────────────────────────────────────────────────────
def literal_witnesses(source: str) -> list[Witness]:
    """STRATEGY 1 — every integer literal, plus n-1 and n+1.

    The mutant's source is scanned as well as the original, on purpose: an AST
    mutant that only misbehaves at some constant carries that constant in its
    own text.
    """
    out: list[Witness] = []
    for c in sorted(_int_constants(source)):
        out.extend(Witness(v, PROV_LITERAL) for v in (c - 1, c, c + 1))
    return out


# ── STRATEGY 3: branch conditions ─────────────────────────────────────────────
def branch_witnesses(source: str) -> list[Witness]:
    """STRATEGY 3 — every branch test, made true AND false.

    Deliberately overlapping with strategy 2: this walks only the tests of
    `if` / `while` / ternary nodes, where strategy 2 walks every comparison
    anywhere. Because provenance resolves most-specific-first, whatever this
    leg contributes UNIQUELY is visible in the printed strategy counts — a
    second net whose redundancy is measured rather than assumed.
    """
    out: list[Witness] = []
    for node in ast.walk(_parse(source)):
        if not isinstance(node, ast.If | ast.While | ast.IfExp):
            continue
        test = node.test
        for sub in ast.walk(test):
            if isinstance(sub, ast.Compare):
                out.extend(_solve_comparison(sub, PROV_BRANCH))
        # `if x:` is a predicate with no comparison. 0 falsifies it, 1 and -1
        # satisfy it, which is the true/false pair the other rules give.
        if isinstance(test, ast.Name):
            out.extend(Witness(v, PROV_BRANCH) for v in (0, 1, -1))
    return out


# ── STRATEGY 4: deterministic adversarial set ─────────────────────────────────
@functools.lru_cache(maxsize=1)
def adversarial_witnesses() -> tuple[Witness, ...]:
    """STRATEGY 4 — magnitudes and boundaries no source has to mention.

    Powers of two and ten to 10^12 catch the off-by-a-magnitude bug; ±2^31 and
    ±2^63 catch code that assumes a machine word even though Python ints do not.
    """
    values: list[int] = [0, 1, -1, 2, -2, 3, -3]
    power = 1
    while power <= 10**12:
        values.extend((power, -power))
        power *= 2
    power = 1
    while power <= 10**12:
        values.extend((power, -power))
        power *= 10
    values.extend((2**31, -(2**31), 2**63, -(2**63)))
    seen: set[int] = set()
    out: list[Witness] = []
    for v in values:
        if v not in seen:
            seen.add(v)
            out.append(Witness(v, PROV_ADVERSARIAL))
    return tuple(out)


# ── STRATEGY 5: seeded random ─────────────────────────────────────────────────
def seeded_stream(seed: int, count: int) -> list[int]:
    """`count` reproducible pseudo-random integers derived from `seed`.

    A hash chain rather than the `random` module. The requirement is
    reproducibility — same seed, same witnesses, same verdicts, in any process —
    and blake2b gives that by construction. It also avoids adding a B311
    (pseudo-random generator) finding that scripts/security_gate.py has no
    adjudication for; that gate fails on any finding it cannot verify, and a
    sampling helper is not the place to spend an exception.
    """
    return [int.from_bytes(
        hashlib.blake2b(f"{seed}:{i}".encode("utf-8"), digest_size=8).digest(),
        "big") for i in range(count)]


# ── the union ─────────────────────────────────────────────────────────────────
@functools.lru_cache(maxsize=None)
def witness_set(original_source: str, mutant_source: str) -> tuple[Witness, ...]:
    """Every strategy's witnesses, unioned, deduplicated, most-specific label wins.

    ORDER IS PART OF THE CONTRACT. Derived witnesses come first, so when a
    mutant is distinguished the reported strategy is the one that actually
    earned it rather than whichever leg happened to run first.
    """
    groups: list[list[Witness]] = [
        predicate_witnesses(mutant_source),
        predicate_witnesses(original_source),
        branch_witnesses(mutant_source),
        branch_witnesses(original_source),
        literal_witnesses(mutant_source),
        literal_witnesses(original_source),
        list(adversarial_witnesses()),
    ]
    best: dict[int, str] = {}
    order: list[int] = []
    for group in groups:
        for w in group:
            if w.value not in best:
                best[w.value] = w.provenance
                order.append(w.value)
            elif provenance_rank(w.provenance) < provenance_rank(best[w.value]):
                best[w.value] = w.provenance
    return tuple(Witness(v, best[v]) for v in order)


def strategy_counts(witnesses: tuple[Witness, ...]) -> tuple[tuple[str, int], ...]:
    """How many distinct values each strategy contributed, most specific first."""
    tally: dict[str, int] = {}
    for w in witnesses:
        tally[w.provenance] = tally.get(w.provenance, 0) + 1
    return tuple((label, tally[label]) for label in PROVENANCE_ORDER
                 if label in tally)


def grid_values(original_source: str, mutant_source: str) -> tuple[int, ...]:
    """The small set that gets a FULL cartesian product.

    Boundaries plus a band around every literal in either source. Kept to the
    values that must be able to appear in two argument positions AT ONCE — a
    mutant guarded by `a > 500 and b > 500` is invisible to any per-argument
    sweep. Everything else rides the axis sweep, because |values|**arity is the
    one cost in here that grows without bound.
    """
    pool: set[int] = set(BOUNDARY_VALUES)
    for c in _int_constants(original_source) | _int_constants(mutant_source):
        pool.update((c - 1, c, c + 1))
    return tuple(sorted(pool))


def witness_points(witnesses: tuple[Witness, ...], grid: tuple[int, ...],
                   arity: int) -> list[tuple[tuple[int, ...], str]]:
    """(point, provenance) in the order they are tried.

    Three legs:
      GRID  full cartesian product of `grid` — the only leg that pairs two
            large values, and identical to what this module tested before.
      AXIS  every derived witness pinned into every argument position, with the
            other positions taking AXIS_COMPANIONS. This is what reaches a
            single computed point such as a == 9999.
      RANDOM the seeded blake2b tuples, which reach the ordinary values in
            between — where a mutant wrong over a RANGE rather than at a POINT
            lives. Attributed to `random`, because the random leg is what
            placed the point even when the value came from the pool.
    """
    provenance: dict[int, str] = {w.value: w.provenance for w in witnesses}

    def label(point: tuple[int, ...]) -> str:
        return min((provenance.get(v, PROV_RANDOM) for v in point),
                   key=provenance_rank)

    points: list[tuple[tuple[int, ...], str]] = [
        (p, label(p)) for p in itertools.product(grid, repeat=arity)]

    in_grid = set(grid)
    for w in witnesses:
        if w.value in in_grid:
            continue  # the grid already paired it with every companion
        for position in range(arity):
            for rest in itertools.product(AXIS_COMPANIONS, repeat=arity - 1):
                point = rest[:position] + (w.value,) + rest[position:]
                points.append((point, label(point)))

    values = tuple(w.value for w in witnesses) or grid
    draws = seeded_stream(SAMPLE_SEED, RANDOM_SAMPLE_TUPLES * arity * 3)
    cursor = 0
    for _ in range(RANDOM_SAMPLE_TUPLES):
        drawn: list[int] = []
        for _ in range(arity):
            pick, index, offset = draws[cursor], draws[cursor + 1], draws[cursor + 2]
            cursor += 3
            if pick % 2 == 0:
                drawn.append(values[index % len(values)])
            else:
                magnitude = RANDOM_MAGNITUDES[index % len(RANDOM_MAGNITUDES)]
                drawn.append(offset % (2 * magnitude + 1) - magnitude)
        points.append((tuple(drawn), PROV_RANDOM))
    return points


def observe(fn: Callable[..., object], point: tuple[int, ...]
            ) -> tuple[str, str, object]:
    """Everything observable at one point: kind, type name, value-or-message.

    A raise is an observation, not a failure to observe — the pre-change check
    abandoned the comparison on any exception, so a mutant that changed only the
    error behaviour was never compared at all.

    Two details each close an inflation path. The type name is compared as well
    as the value, because `0` and `0.0` are equal and are not the same result.
    The exception MESSAGE is compared as well as its class, because a mutated
    integer inside an error string is a real change and would otherwise be
    excluded from the denominator for free.
    """
    try:
        out = fn(*point)
    except Exception as exc:
        return ("raise", type(exc).__name__, str(exc))
    return ("value", type(out).__name__, out)


class _Distinguished(Exception):
    """Carries the input at which the two functions were seen to differ."""


SEARCH = settings(
    max_examples=DISTINGUISHER_EXAMPLES,
    deadline=None,
    database=None,
    derandomize=True,  # same seed, same search: the determinism claim is testable
    suppress_health_check=list(HealthCheck),  # pyright: ignore[reportArgumentType]
)


def search_for_distinguishing_input(
    f: Callable[..., object], g: Callable[..., object],
    values: tuple[int, ...], arity: int,
) -> tuple[bool, tuple[int, ...] | None]:
    """Ask Hypothesis to break the equivalence claim before it is made.

    Returns (searched_ok, distinguishing_input). `searched_ok` False means the
    search itself failed, which is treated as "do not exclude" — the conservative
    direction, because a skipped search must never buy an exclusion.
    """
    names = [f"x{i}" for i in range(arity)]
    ints = st.one_of(st.integers(), st.sampled_from(values))
    found: list[tuple[int, ...]] = []

    def probe(**kwargs: int) -> None:
        point = tuple(kwargs[n] for n in names)
        if observe(f, point) != observe(g, point):
            found.append(point)
            raise _Distinguished(point)

    runner = SEARCH(given(**{n: ints for n in names})(probe))
    try:
        runner()
    except _Distinguished:
        pass
    except Exception:
        return (bool(found), found[-1] if found else None)
    return (True, found[-1] if found else None)


@functools.lru_cache(maxsize=None)
def observationally_equivalent_under_witness_set(
        original_source: str, mutant_source: str,
        func_name: str, arity: int) -> SampleVerdict:
    """Did any derived witness tell the mutant apart from the original?

    `a + b` mutated to `b + a` is not a bug, and no spec can kill it; counting it
    caps every honest score. So mutants no witness distinguishes are excluded
    from the denominator — but the exclusion is reported for what it is, an
    absence of evidence over a named witness set, never as semantic equivalence.
    """
    try:
        original = load_module(original_source)
        mutant = load_module(mutant_source)
    except Exception:
        return SampleVerdict(False, 0, SAMPLE_SEED, 0, None,
                             "mutant or original failed to load")
    if not hasattr(original, func_name) or not hasattr(mutant, func_name):
        return SampleVerdict(False, 0, SAMPLE_SEED, 0, None,
                             f"{func_name} missing from the mutant")
    f = cast("Callable[..., object]", getattr(original, func_name))
    g = cast("Callable[..., object]", getattr(mutant, func_name))

    witnesses = witness_set(original_source, mutant_source)
    grid = grid_values(original_source, mutant_source)
    counts = strategy_counts(witnesses)
    size = len(witnesses)

    tested = 0
    for point, provenance in witness_points(witnesses, grid, arity):
        tested += 1
        if observe(f, point) != observe(g, point):
            return SampleVerdict(False, tested, SAMPLE_SEED, 0, point,
                                 f"distinguished by a {provenance} witness",
                                 size, provenance, counts)

    searched_ok, witness = search_for_distinguishing_input(
        f, g, tuple(w.value for w in witnesses), arity)
    if witness is not None:
        return SampleVerdict(False, tested, SAMPLE_SEED, DISTINGUISHER_EXAMPLES,
                             witness, "distinguished by hypothesis",
                             size, PROV_HYPOTHESIS, counts)
    if not searched_ok:
        return SampleVerdict(False, tested, SAMPLE_SEED, 0, None,
                             "hypothesis search failed; not excluded",
                             size, None, counts)
    return SampleVerdict(True, tested, SAMPLE_SEED, DISTINGUISHER_EXAMPLES, None,
                         OBSERVATIONALLY_EQUIVALENT_UNDER_WITNESS_SET,
                         size, None, counts)


def describe_witness_set(verdict: SampleVerdict) -> str:
    """One line naming the size of the search and what it did NOT establish."""
    breakdown = ", ".join(f"{label} {n}" for label, n in verdict.strategy_counts)
    return (f"witness set {verdict.witness_set_size} values "
            f"[{breakdown or 'none'}] -> {verdict.points_tested} points each "
            f"+ {verdict.hypothesis_examples} hypothesis examples, "
            f"seed {verdict.seed}")


def evaluate(spec_file: str, source_file: str, threshold: float
             ) -> dict[str, Any]:
    """Score one spec. Raises SpecParseError if the spec cannot be parsed —
    an unparsed spec has been verified by nothing and must never be skipped."""
    info = parse_lean_spec(spec_file)
    source = Path(source_file).read_text()
    original = load_module(source)

    report = {"spec": spec_file, "function": info["function_name"]}

    # 1. counterexample first
    ok, stats = holds(info, original)
    if not ok:
        print(f"❌ {spec_file}: counterexample found — the spec is FALSE of {source_file}")
        report["verdict"] = "false"
        return report
    print(f"  ✓ no counterexample against the real function")

    # 2. vacuity
    rate = stats["reached"] / stats["total"] if stats["total"] else 0.0
    report["precondition_reach"] = round(rate, 3)
    if info["hypothesis"] and rate < 0.01:
        print(f"❌ {spec_file}: vacuous — precondition satisfied by {rate:.1%} of inputs")
        report["verdict"] = "vacuous"
        return report
    print(f"  ✓ precondition reachable ({rate:.0%} of inputs)")

    # 3. strength
    mutants = generate_mutants(source, qualifier=source_file)
    live: list[Mutant] = []
    excluded: list[tuple[str, SampleVerdict]] = []
    for mut in mutants:
        verdict = observationally_equivalent_under_witness_set(
            source, mut.source, info["function_name"], len(info["args"]))
        if verdict.indistinguishable:
            excluded.append((mut.name, verdict))
            print(f"  – excluded: {mut.name} "
                  f"({OBSERVATIONALLY_EQUIVALENT_UNDER_WITNESS_SET}: no "
                  f"difference on {describe_witness_set(verdict)}) — "
                  f"NOT proven semantically equivalent")
        else:
            live.append(mut)
            # Which strategy earned the exclusion's absence. Printed because a
            # derivation nobody can see is indistinguishable from a guess.
            print(f"  · distinguished: {mut.name} at "
                  f"{verdict.distinguishing_input} by strategy "
                  f"{verdict.witness_provenance}")
    mutants = live
    report.update(observationally_equivalent=len(excluded),
                  indistinguishable_on_sample=len(excluded),
                  witness_set_size=min((v.witness_set_size for _, v in excluded),
                                       default=0),
                  sample_points=min((v.points_tested for _, v in excluded),
                                    default=0),
                  sample_seed=SAMPLE_SEED,
                  hypothesis_examples=DISTINGUISHER_EXAMPLES,
                  excluded_names=[n for n, _ in excluded])

    # A denominator of zero is not a perfect score, it is a measurement that did
    # not happen. Left as killed/total it would be 0/0; left to the threshold it
    # would pass at --min-strength 0. Named and failed here instead.
    if not mutants:
        report.update(mutants=0, killed=0, strength=0.0, survivors=[],
                      verdict="zero-denominator")
        print(f"\n  spec strength: 0.00  (0/0 — nothing left to kill)")
        print(f"❌ {spec_file}: ZERO DENOMINATOR — {len(generate_mutants(source, qualifier=source_file))} "
              f"mutants generated, {len(excluded)} excluded as "
              f"{OBSERVATIONALLY_EQUIVALENT_UNDER_WITNESS_SET}, 0 scored. A spec "
              f"that killed "
              f"nothing scored nothing: hard FAIL, not a vacuous 100%.")
        return report

    killed = 0
    survivors: list[str] = []
    for mut in mutants:
        try:
            mutant_mod = load_module(mut.source)
            alive, _ = holds(info, mutant_mod)
        except Exception:
            alive = False  # mutant cannot even run: the spec's contract rejects it
        if alive:
            survivors.append(mut.name)
            print(f"  ✗ survived: {mut.name}")
        else:
            killed += 1
            print(f"  ✓ killed:   {mut.name}")

    strength = killed / len(mutants)
    report.update(mutants=len(mutants), killed=killed,
                  strength=round(strength, 3), survivors=survivors)

    print(f"\n  spec strength: {strength:.2f}  ({killed}/{len(mutants)} mutants "
          f"killed, {len(excluded)} excluded as "
          f"{OBSERVATIONALLY_EQUIVALENT_UNDER_WITNESS_SET} at seed {SAMPLE_SEED} "
          f"— NOT proven semantically equivalent)")
    if strength < threshold:
        print(f"❌ {spec_file} is too weak ({strength:.2f} < {threshold:.2f})")
        report["verdict"] = "weak"
    else:
        print(f"✓ {spec_file} is strong enough ({strength:.2f} >= {threshold:.2f})")
        report["verdict"] = "strong"
    return report


def compose(reports: list[dict[str, Any]]) -> list[str]:
    """Minimal subset of specs covering every mutant any of them kills."""
    by_spec: dict[str, set[str]] = {
        r["spec"]: set(r.get("survivors", [])) for r in reports if "mutants" in r
    }
    if not by_spec:
        return []
    universe: set[str] = set()
    for survivors in by_spec.values():
        universe |= survivors
    all_names = {r["spec"]: r for r in reports}
    # A spec "covers" the mutants it kills = universe - its survivors.
    remaining: set[str] = set()
    for spec in by_spec:
        remaining |= (universe - by_spec[spec])
    chosen: list[str] = []
    while remaining:
        best = max(by_spec, key=lambda s: len((universe - by_spec[s]) & remaining))
        gain: set[str] = (universe - by_spec[best]) & remaining
        if not gain:
            break
        chosen.append(best)
        remaining -= gain
        del by_spec[best]
    return chosen or list(all_names)[:1]


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("pairs", nargs="+", help="spec.lean=src/file.py, repeatable")
    p.add_argument("--min-strength", type=float, default=0.9)
    p.add_argument("--json", help="write the report here")
    ns = p.parse_args()

    reports: list[dict[str, Any]] = []
    failed = False
    for pair in ns.pairs:
        spec_file, _, source_file = pair.partition("=")
        print(f"\n── {spec_file}  vs  {source_file} ──")
        # Fail closed: a spec that will not parse is a gate failure, not a
        # spec that quietly drops out of the set being scored.
        try:
            rep = evaluate(spec_file, source_file, ns.min_strength)
        except SpecParseError as exc:
            print(f"❌ {spec_file}: unparsable — {exc}")
            sys.exit(1)
        if rep["verdict"] != "strong":
            failed = True
        reports.append(rep)

    # Joint strength: a mutant is caught if ANY spec in the set rejects it.
    # Individually, commutativity misses `return 0` and identity misses
    # `Add->Sub`; scored as a set they cover both. Gating each spec alone would
    # reject a set that fully constrains the function.
    scored = [r for r in reports if "mutants" in r]
    if scored:
        universe: set[str] = set()
        for r in scored:
            universe |= set(r["survivors"]) | {f"k{i}" for i in range(r["killed"])}
        survivor_sets: list[set[str]] = [set(r["survivors"]) for r in scored]
        all_survivors: set[str] = survivor_sets[0].copy()
        for extra in survivor_sets[1:]:
            all_survivors &= extra
        total = max(r["mutants"] for r in scored)
        joint = (total - len(all_survivors)) / total if total else 0.0
        print(f"\n  JOINT strength over {len(scored)} specs: {joint:.2f} "
              f"({total - len(all_survivors)}/{total} mutants killed by the set)")
        if all_survivors:
            print(f"  survives the whole set: {', '.join(sorted(all_survivors))}")
        print(f"  minimal covering set: {', '.join(compose(reports))}")
        failed = joint < ns.min_strength
    if ns.json:
        Path(ns.json).write_text(json.dumps(reports, indent=2))

    print("\nSPEC STRENGTH\n──────────────")
    for r in reports:
        if "strength" in r:
            print(f"{r['spec']}: {r['strength']:.0%} mutants killed "
                  f"({r['killed']}/{r['mutants']}), verdict {r['verdict']}")
    sys.exit(1 if failed else 0)
