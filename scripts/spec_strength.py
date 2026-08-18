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

  4. COMPOSITION — which minimal subset of specs jointly kills every mutant that
     any of them kills. Reported so redundant specs can be dropped.

The Lean claim is executed via the same translation `spec_to_test.py` uses, so
the property scored here is the property the proof is about.
"""

import argparse
import ast
import importlib.util
import json
import os
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mutate import generate_mutants  # noqa: E402
from spec_to_test import lean_expr_to_python, parse_lean_spec  # noqa: E402

from hypothesis import HealthCheck, given, settings, strategies as st  # noqa: E402
from hypothesis import errors as hyp_errors  # noqa: E402

INTS = st.integers(min_value=-1000, max_value=1000)
RUN = settings(
    max_examples=120,
    deadline=None,
    database=None,
    suppress_health_check=list(HealthCheck),
)


def load_module(source, name=None):
    name = name or f"_m{uuid.uuid4().hex}"
    spec = importlib.util.spec_from_loader(name, loader=None)
    module = importlib.util.module_from_spec(spec)
    exec(compile(source, name, "exec"), module.__dict__)
    return module


def build_property(info, module):
    """Return (check, reached) — check raises on violation, reached counts hits."""
    func = getattr(module, info["function_name"])
    args = info["args"]
    claim = lean_expr_to_python(info["property"], info["function_name"], args)
    guard = (
        lean_expr_to_python(info["hypothesis"], info["function_name"], args)
        if info["hypothesis"] else None
    )
    # eval is confined on purpose: the input is a Lean claim from this repo's
    # specs/, already parsed by ast.parse (so it must be a single expression),
    # and evaluated with __builtins__ stripped — no import, open, exec or os
    # reachable. The environment holds only the bound variables and the function
    # under test. A spec file cannot use this to run arbitrary code.
    claim_code = compile(ast.parse(claim, mode="eval"), "<claim>", "eval")
    guard_code = compile(ast.parse(guard, mode="eval"), "<guard>", "eval") if guard else None
    stats = {"reached": 0, "total": 0}

    def check(**values):
        env = {"__builtins__": {}}
        env.update(values)
        env[info["function_name"]] = func
        stats["total"] += 1
        if guard_code is not None and not eval(guard_code, env):
            return
        stats["reached"] += 1
        assert eval(claim_code, env), f"spec violated at {env}"

    return check, stats


def holds(info, module):
    """True if the property survives Hypothesis against this module."""
    check, stats = build_property(info, module)
    runner = RUN(given(**{a: INTS for a in info["args"]})(check))
    try:
        runner()
    except AssertionError:
        return False, stats
    except hyp_errors.FailedHealthCheck:
        return True, stats
    except Exception as exc:
        if __debug__ and os.environ.get("SPEC_STRENGTH_DEBUG"):
            print(f"     [harness] {type(exc).__name__}: {exc}", file=sys.stderr)
        return False, stats
    return True, stats


def is_equivalent(original, mutant_src, func_name, arity):
    """True if the mutant computes the same function as the original.

    `a + b` mutated to `b + a` is not a bug — it is the same program. Standard
    mutation testing calls these equivalent mutants and excludes them; counting
    them makes a perfectly good spec look weak.
    """
    import itertools
    try:
        mutant = load_module(mutant_src)
    except Exception:
        return False
    f, g = getattr(original, func_name), getattr(mutant, func_name)
    for values in itertools.product([-7, -1, 0, 1, 3, 11], repeat=arity):
        try:
            a, b = f(*values), g(*values)
        except Exception:
            return False
        if a != b:
            return False
    return True


def evaluate(spec_file, source_file, threshold):
    info = parse_lean_spec(spec_file)
    if info is None:
        print(f"❌ {spec_file}: could not parse the theorem")
        return None
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
    live = []
    for mut in mutants:
        if is_equivalent(original, mut.source, info["function_name"], len(info["args"])):
            print(f"  – skipped:  {mut.name} (equivalent mutant, same function)")
        else:
            live.append(mut)
    mutants = live

    killed, survivors = 0, []
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

    strength = killed / len(mutants) if mutants else 0.0
    report.update(mutants=len(mutants), killed=killed,
                  strength=round(strength, 3), survivors=survivors)

    print(f"\n  spec strength: {strength:.2f}  ({killed}/{len(mutants)} mutants killed)")
    if strength < threshold:
        print(f"❌ {spec_file} is too weak ({strength:.2f} < {threshold:.2f})")
        report["verdict"] = "weak"
    else:
        print(f"✓ {spec_file} is strong enough ({strength:.2f} >= {threshold:.2f})")
        report["verdict"] = "strong"
    return report


def compose(reports):
    """Minimal subset of specs covering every mutant any of them kills."""
    by_spec = {r["spec"]: set(r.get("survivors", [])) for r in reports if "mutants" in r}
    if not by_spec:
        return []
    universe = set().union(*by_spec.values())
    all_names = {r["spec"]: r for r in reports}
    # A spec "covers" the mutants it kills = universe - its survivors.
    remaining = set()
    for spec in by_spec:
        remaining |= (universe - by_spec[spec])
    chosen = []
    while remaining:
        best = max(by_spec, key=lambda s: len((universe - by_spec[s]) & remaining))
        gain = (universe - by_spec[best]) & remaining
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

    reports, failed = [], False
    for pair in ns.pairs:
        spec_file, _, source_file = pair.partition("=")
        print(f"\n── {spec_file}  vs  {source_file} ──")
        rep = evaluate(spec_file, source_file, ns.min_strength)
        if rep is None or rep["verdict"] != "strong":
            failed = True
        if rep:
            reports.append(rep)

    # Joint strength: a mutant is caught if ANY spec in the set rejects it.
    # Individually, commutativity misses `return 0` and identity misses
    # `Add->Sub`; scored as a set they cover both. Gating each spec alone would
    # reject a set that fully constrains the function.
    scored = [r for r in reports if "mutants" in r]
    if scored:
        universe = set()
        for r in scored:
            universe |= set(r["survivors"]) | {f"k{i}" for i in range(r["killed"])}
        all_survivors = set.intersection(*[set(r["survivors"]) for r in scored])
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
