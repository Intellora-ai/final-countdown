#!/usr/bin/env python3
"""LAYER 5 — MUTATION GATE. AST-only mutants, undistinguishable ones excluded.

Replaces the earlier mutmut wrapper. Two reasons: mutmut scores the TEST suite,
while this scores the SPEC, and string-level mutation rewrites strings and
comments, producing broken rather than subtly-wrong programs that any spec
kills for free.

WHAT "EXCLUDED" MEANS HERE, EXACTLY
-----------------------------------
`a + b` -> `b + a` is the same function; no spec can kill it, and counting it
caps every honest score. So mutants that no witness could tell apart from the
original are dropped from the denominator.

The decision is made by running both on a FINITE WITNESS SET. That establishes
OBSERVATIONAL EQUIVALENCE UNDER THAT WITNESS SET. It does NOT establish SEMANTIC
EQUIVALENCE, and the two claims differ in the direction that matters:

  * observationally equivalent under a witness set = no distinguishing input was
    FOUND, among a stated number of derived witnesses, at a stated seed;
  * semantically equivalent = no distinguishing input EXISTS.

The gap is a false-green path. A mutant that really does change behaviour, but
happens to agree with the original on every witness, leaves the denominator —
and the spec's score goes UP when the evidence says it should go DOWN. Nothing
here closes that gap; the witness set is DERIVED rather than sampled so that a
wrong exclusion is likelier to be caught, and its size and composition are
printed so the claim is measurable rather than asserted.

WHY MORE RANDOM EXAMPLES WERE NOT THE FIX
-----------------------------------------
The case this gate used to miss, against `return a + b`:

    if a * a == 99980001:   # true only at a == ±9999
        return 0

9999 is a literal in neither file — only 99980001 is. A band around every
literal misses it, the boundaries miss it, and neither 256 seeded tuples nor 300
Hypothesis examples over an unbounded integer domain land on one point. Raising
those counts does not help: the target has measure zero. The witness had to be
DERIVED, by solving the mutant's own predicate — isqrt(99980001) == 9999 and
9999**2 == 99980001, so 9999 is emitted with provenance `predicate:isqrt` and
the mutant stays in the denominator where it belongs.

WHY IT STILL CANNOT BE STRENGTHENED
-----------------------------------
Deciding whether two arbitrary Python functions compute the same function is
undecidable (Rice's theorem; the mutant need not even terminate). Exhaustive
checking is unavailable too — Python integers are unbounded, so the domain is
infinite. A real proof would need a symbolic decision procedure over the source,
which this repository does not have. See
`spec_strength.observationally_equivalent_under_witness_set` for the six
strategies: literals, solved predicates, branch conditions, a deterministic
adversarial set, seeded random tuples, then a Hypothesis search that must fail
to find a distinguishing input before any exclusion is allowed.

WHAT STILL GETS THROUGH — measured, not hypothetical
----------------------------------------------------
Solving covers the predicate FORMS the solver enumerates (equality and
inequality bands, exact squares, exact divisors, offsets, moduli). A guard
outside those forms — a hash, a loop, an opaque call — is still only sampled,
and a difference at one computed point behind such a guard would still be
wrongly excluded. The label says "under a witness set" for exactly that reason.

ZERO DENOMINATOR IS A HARD FAIL
-------------------------------
If every mutant is excluded there is nothing left to kill, so the gate measured
nothing. That is reported as FAIL regardless of --min-score: a spec that killed
nothing scored nothing. The excluded count is printed next to the score always,
so an inflated-looking score can never hide the exclusions that produced it.
"""
import argparse, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from mutate import Mutant, generate_mutants
from spec_source import source_for
from spec_strength import (DISTINGUISHER_EXAMPLES,
                           OBSERVATIONALLY_EQUIVALENT_UNDER_WITNESS_SET,
                           SAMPLE_SEED, SampleVerdict, describe_witness_set,
                           holds, load_module,
                           observationally_equivalent_under_witness_set)
from spec_to_test import SpecParseError, parse_lean_spec
from typing import Any

def score(spec_files: list[str], threshold: float = 0.9) -> dict[str, Any]:
    """Raises SpecParseError if ANY spec fails to parse.

    The previous `[(s, i) for s, i in infos if i]` dropped unparsable specs and
    scored whatever was left. Two ways that lies:

      * `src` comes from `spec_files[0]` but `name`/`arity` came from the first
        spec that PARSED. Lose spec 0 and the gate scores spec 1's property
        against spec 0's source file — a different claim than anyone wrote.
      * the printed score describes a set the caller never asked for, and
        nothing in the output says which specs were dropped.

    A spec that could not be read has not been scored, so the set has not been
    scored. Fail, do not shrink.
    """
    if not spec_files:
        raise SystemExit("no spec files given — this gate would score nothing")
    infos = [(s, parse_lean_spec(s)) for s in spec_files]
    src = source_for(spec_files[0])
    if src is None:
        raise SystemExit(f"no src/ file for {spec_files[0]}")
    source = Path(src).read_text()
    name, arity = infos[0][1]["function_name"], len(infos[0][1]["args"])
    # Fail fast on a source that cannot be imported or does not define the
    # function. Left to run, EVERY mutant would fail to load too, every failure
    # counts as killed, and a broken file would score 100%.
    original = load_module(source)
    if not hasattr(original, name):
        raise SystemExit(f"{src} does not define {name}()")

    excluded: list[tuple[str, SampleVerdict]] = []
    live: list[Mutant] = []
    # Every mutant that IS distinguished records the strategy whose witness did
    # it. Without that, "the witnesses are derived" is a claim about the code
    # rather than an observation about this run.
    distinguished: list[tuple[str, SampleVerdict]] = []
    # Qualified with the source path for the same reason spec_strength is:
    # an operator label alone is not unique across files. This gate scores
    # one source at a time so it could not collide, but two tools printing
    # the same mutant under two different names is its own trap.
    for m in generate_mutants(source, qualifier=str(src)):
        verdict = observationally_equivalent_under_witness_set(
            source, m.source, name, arity)
        if verdict.indistinguishable:
            excluded.append((m.name, verdict))
        else:
            live.append(m)
            distinguished.append((m.name, verdict))

    killed = 0
    survivors: list[str] = []
    for m in live:
        try:
            mod = load_module(m.source)
            alive = any(holds(i, mod)[0] for _, i in infos) and all(
                holds(i, mod)[0] for _, i in infos)
        except Exception:
            alive = False
        if alive:
            survivors.append(m.name)
        else:
            killed += 1
    total = len(live)
    s = killed / total if total else 0.0
    # 0/0 is not 100%. Failed here rather than left to the threshold, which
    # would let --min-score 0 pass a run that scored nothing at all.
    fail_reason = None if total else (
        f"zero denominator: {len(excluded) + total} mutants generated, "
        f"{len(excluded)} excluded as "
        f"{OBSERVATIONALLY_EQUIVALENT_UNDER_WITNESS_SET}, 0 scored")
    verdict = "FAIL" if fail_reason else ("PASS" if s >= threshold else "FAIL")
    # The SMALLEST witness set any mutant was judged on, with the breakdown from
    # that same mutant. Reporting the smallest is the conservative direction: it
    # is the weakest search this run relied on, and a summary that quoted the
    # largest would overstate the evidence behind the weakest exclusion.
    every = [v for _, v in excluded + distinguished if v.witness_set_size]
    weakest = min(every, key=lambda v: v.witness_set_size, default=None)
    points = min((v.points_tested for _, v in excluded), default=0)
    witness_size = weakest.witness_set_size if weakest else 0
    counts: tuple[tuple[str, int], ...] = weakest.strategy_counts if weakest else ()
    return {"mutation_score": round(s, 3), "mutants_killed": killed,
            "mutants": total,
            "observationally_equivalent": len(excluded),
            # Kept alongside the precise name so scripts/run_gate.py's
            # stdout scraper and any reader of the old key keep working.
            "indistinguishable_on_sample": len(excluded),
            "excluded_names": [n for n, _ in excluded],
            "witness_set_size": witness_size,
            "witness_strategies": [f"{k}:{n}" for k, n in counts],
            "distinguished_by": {n: v.witness_provenance
                                 for n, v in distinguished},
            "sample_points": points, "sample_seed": SAMPLE_SEED,
            "hypothesis_examples": DISTINGUISHER_EXAMPLES,
            # DEPRECATED MISNOMER. The count is right; the word "equivalent"
            # unqualified is the exact claim this module exists to stop making.
            # Retained only because scripts/honest_report.py reads this key and
            # is not owned here. Read "observationally_equivalent" instead.
            "equivalent_excluded": len(excluded),
            "survivors": survivors, "verdict": verdict,
            "fail_reason": fail_reason,
            "excluded_detail": [(n, describe_witness_set(v))
                                for n, v in excluded]}

if __name__ == "__main__":
    p = argparse.ArgumentParser(); p.add_argument("specs", nargs="+")
    p.add_argument("--min-score", type=float, default=0.9); ns = p.parse_args()
    try:
        r = score(ns.specs, ns.min_score)
    except SpecParseError as exc:
        print(f"❌ unparsable spec — the set was NOT scored: {exc}")
        sys.exit(1)
    print(f"  mutation discrimination: {r['mutants_killed']}/{r['mutants']} "
          f"({r['mutation_score']:.0%})")
    # Printed on every run, passing or failing: the score is uninterpretable
    # without the size of the denominator that was removed to produce it.
    # The wording keeps "indistinguishable on sample: N" verbatim because
    # scripts/run_gate.py scrapes exactly that phrase into the gate's evidence
    # and is not owned here; a renamed line would silently empty that field.
    budget = (f"{r['sample_points']} points each + {r['hypothesis_examples']} "
              f"hypothesis examples, " if r["observationally_equivalent"] else "")
    print(f"  observationally equivalent under witness set "
          f"(indistinguishable on sample: {r['observationally_equivalent']} "
          f"excluded) ({budget}seed {r['sample_seed']})")
    print(f"  smallest witness set: {r['witness_set_size']} derived values "
          f"[{', '.join(r['witness_strategies']) or 'none'}] — this is NOT "
          f"proven semantic equivalence: no distinguishing input was FOUND, "
          f"which is not a proof that none EXISTS")
    if r["excluded_names"]:
        print(f"  excluded: {', '.join(r['excluded_names'])} — no witness told "
              f"them apart, NOT proven equivalent")
    # The strategy that caught each surviving-in-the-denominator mutant. This is
    # the evidence that the witnesses are derived rather than stumbled on.
    for mutant_name, strategy in r["distinguished_by"].items():
        print(f"  distinguished: {mutant_name} by strategy {strategy}")
    if r["fail_reason"]:
        print(f"  ZERO DENOMINATOR — {r['fail_reason']}.")
        print(f"  A spec that killed nothing scored nothing: hard FAIL, "
              f"independent of --min-score.")
    if r["survivors"]:
        print(f"  survivors: {', '.join(r['survivors'])}")
    sys.exit(0 if r["verdict"] == "PASS" else 1)
