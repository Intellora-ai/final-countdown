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
     `total`. That exclusion is decided by evaluating both at a FINITE set of
     sampled inputs, so what it establishes is OBSERVATIONAL INDISTINGUISHABILITY
     ON THAT SAMPLE — never SEMANTIC EQUIVALENCE. The two are not the same claim:
     agreement at N points implies nothing at point N+1, and a real behavioural
     change that happens to agree everywhere sampled would leave the denominator
     and push the score UP when it should push it DOWN. It cannot be strengthened
     into equivalence — that question is undecidable (Rice's theorem) and the
     integer domain is infinite, so exhaustion is unavailable. The mitigation is
     a wider search plus an honest label; see the block above
     `indistinguishable_on_sample` for the full argument and the numbers printed.

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
import os
import sys
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast
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
# OBSERVATIONAL INDISTINGUISHABILITY ON A FINITE SAMPLE — *not* equivalence.
#
# WHAT IS ESTABLISHED
#   For a specific finite set of input tuples, the original and the mutant
#   produced the same observation (same value of the same type, or the same
#   exception type). Nothing more.
#
# WHAT IS *NOT* ESTABLISHED
#   That they compute the same function. Two programs agreeing at N points say
#   nothing about point N+1. The label used to be "equivalent mutant", which
#   claimed exactly the thing the check cannot show.
#
# WHY IT MATTERS — the false-green
#   An excluded mutant leaves the denominator. If a mutant is a REAL behavioural
#   change that happens to agree at every sampled point, excluding it makes the
#   spec's score go UP when it should go DOWN. Every widening below exists to
#   make that failure detectable, not to make the claim true.
#
# WHY IT CANNOT BE STRENGTHENED TO SEMANTIC EQUIVALENCE
#   Deciding whether two arbitrary Python functions compute the same function is
#   undecidable (Rice's theorem; the halting problem is a special case — the
#   mutant may not even terminate). Exhaustion is not available either: Python
#   ints are unbounded, so the input domain is infinite. A proof would need a
#   symbolic decision procedure over the source, which this repository does not
#   have and which does not exist in general. So the honest move is not a better
#   check — it is a smaller claim, plus a wider search that makes a wrong
#   exclusion likelier to be caught. What is printed is the search's size.
# ══════════════════════════════════════════════════════════════════════════════

INDISTINGUISHABLE_ON_SAMPLE = "INDISTINGUISHABLE_ON_SAMPLE"

# Fixed so a run is reproducible: same seed -> same sample -> same verdicts.
SAMPLE_SEED = 20260819
# Boundaries and magnitudes a six-point sample around zero never reaches.
BOUNDARY_VALUES: tuple[int, ...] = (
    0, 1, -1, 2, -2, 3, -3, 10, -10, 1000, -1000,
    10**6, -10**6, 10**12, -10**12,
)
RANDOM_MAGNITUDES: tuple[int, ...] = (8, 1000, 10**6, 10**12)
RANDOM_SAMPLE_TUPLES = 256
DISTINGUISHER_EXAMPLES = 300


@dataclass(frozen=True)
class SampleVerdict:
    """The measured result of one indistinguishability search.

    `indistinguishable` True means: no distinguishing input was FOUND in
    `points_tested` deterministic points plus `hypothesis_examples` searched
    examples. It does not mean none exists.
    """

    indistinguishable: bool
    points_tested: int
    seed: int
    hypothesis_examples: int
    distinguishing_input: tuple[int, ...] | None
    note: str


def _int_constants(source: str) -> set[int]:
    """Every integer literal in `source`. Bugs cluster at the magic numbers."""
    found: set[int] = set()
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return found
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant):
            value = node.value
            if isinstance(value, int) and not isinstance(value, bool):
                found.add(value)
    return found


def sample_values(original_source: str, mutant_source: str) -> tuple[int, ...]:
    """The per-argument value pool: boundaries plus a band around every literal.

    The mutant's source is scanned too, on purpose. An AST mutant that only
    misbehaves at some constant carries that constant in its own text, so
    reading it is what turns `if x == 997: return 0` from invisible into a
    guaranteed hit.
    """
    pool: set[int] = set(BOUNDARY_VALUES)
    for c in _int_constants(original_source) | _int_constants(mutant_source):
        pool.update((c - 1, c, c + 1))
    return tuple(sorted(pool))


def seeded_stream(seed: int, count: int) -> list[int]:
    """`count` reproducible pseudo-random integers derived from `seed`.

    A hash chain rather than the `random` module. The requirement is
    reproducibility — same seed, same sample, same verdicts, in any process — and
    blake2b gives that by construction. It also avoids adding a B311
    (pseudo-random generator) finding that scripts/security_gate.py has no
    adjudication for; that gate fails on any finding it cannot verify, and a
    sampling helper is not the place to spend an exception.
    """
    return [int.from_bytes(
        hashlib.blake2b(f"{seed}:{i}".encode("utf-8"), digest_size=8).digest(),
        "big") for i in range(count)]


def sample_points(values: tuple[int, ...], arity: int) -> list[tuple[int, ...]]:
    """Full grid over `values`, then seeded pseudo-random tuples.

    The grid pins the boundaries and the literal bands; the random tail reaches
    the ordinary values in between, which is where a mutant that is wrong over a
    RANGE rather than at a POINT lives. Deterministic in the seed, so the count
    printed by the gate is a number anyone can reproduce.
    """
    points: list[tuple[int, ...]] = list(itertools.product(values, repeat=arity))
    draws = seeded_stream(SAMPLE_SEED, RANDOM_SAMPLE_TUPLES * arity * 3)
    cursor = 0
    for _ in range(RANDOM_SAMPLE_TUPLES):
        point: list[int] = []
        for _ in range(arity):
            pick, index, offset = draws[cursor], draws[cursor + 1], draws[cursor + 2]
            cursor += 3
            if pick % 2 == 0:
                point.append(values[index % len(values)])
            else:
                magnitude = RANDOM_MAGNITUDES[index % len(RANDOM_MAGNITUDES)]
                point.append(offset % (2 * magnitude + 1) - magnitude)
        points.append(tuple(point))
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
    """Ask Hypothesis to break the indistinguishability claim before it is made.

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
def indistinguishable_on_sample(original_source: str, mutant_source: str,
                                func_name: str, arity: int) -> SampleVerdict:
    """Did any sampled input tell the mutant apart from the original?

    `a + b` mutated to `b + a` is not a bug, and no spec can kill it; counting it
    caps every honest score. So mutants nothing could distinguish are excluded
    from the denominator — but the exclusion is reported for what it is, an
    absence of evidence over a stated number of points, never as equivalence.
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

    values = sample_values(original_source, mutant_source)
    tested = 0
    for point in sample_points(values, arity):
        tested += 1
        if observe(f, point) != observe(g, point):
            return SampleVerdict(False, tested, SAMPLE_SEED, 0, point,
                                 "distinguished by the deterministic sample")

    searched_ok, witness = search_for_distinguishing_input(f, g, values, arity)
    if witness is not None:
        return SampleVerdict(False, tested, SAMPLE_SEED, DISTINGUISHER_EXAMPLES,
                             witness, "distinguished by hypothesis")
    if not searched_ok:
        return SampleVerdict(False, tested, SAMPLE_SEED, 0, None,
                             "hypothesis search failed; not excluded")
    return SampleVerdict(True, tested, SAMPLE_SEED, DISTINGUISHER_EXAMPLES, None,
                         INDISTINGUISHABLE_ON_SAMPLE)


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
    mutants = generate_mutants(source)
    live: list[Mutant] = []
    excluded: list[tuple[str, SampleVerdict]] = []
    for mut in mutants:
        verdict = indistinguishable_on_sample(
            source, mut.source, info["function_name"], len(info["args"]))
        if verdict.indistinguishable:
            excluded.append((mut.name, verdict))
            print(f"  – excluded: {mut.name} ({INDISTINGUISHABLE_ON_SAMPLE}: no "
                  f"difference at {verdict.points_tested} sampled points + "
                  f"{verdict.hypothesis_examples} hypothesis examples, "
                  f"seed {verdict.seed}) — not proven equivalent")
        else:
            live.append(mut)
    mutants = live
    report.update(indistinguishable_on_sample=len(excluded),
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
        print(f"❌ {spec_file}: ZERO DENOMINATOR — {len(generate_mutants(source))} "
              f"mutants generated, {len(excluded)} excluded as "
              f"{INDISTINGUISHABLE_ON_SAMPLE}, 0 scored. A spec that killed "
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
          f"killed, {len(excluded)} excluded as {INDISTINGUISHABLE_ON_SAMPLE} "
          f"at seed {SAMPLE_SEED})")
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
