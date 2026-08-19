#!/usr/bin/env python3
"""LAYER 5 — MUTATION GATE. AST-only mutants, indistinguishable ones excluded.

Replaces the earlier mutmut wrapper. Two reasons: mutmut scores the TEST suite,
while this scores the SPEC, and string-level mutation rewrites strings and
comments, producing broken rather than subtly-wrong programs that any spec
kills for free.

WHAT "EXCLUDED" MEANS HERE, EXACTLY
-----------------------------------
`a + b` -> `b + a` is the same function; no spec can kill it, and counting it
caps every honest score. So mutants that could not be told apart from the
original are dropped from the denominator.

The decision is made by running both at a FINITE set of sampled inputs. That
establishes OBSERVATIONAL INDISTINGUISHABILITY ON THAT SAMPLE. It does NOT
establish SEMANTIC EQUIVALENCE, and the two claims differ in the direction that
matters:

  * indistinguishable on a sample = no distinguishing input was FOUND, in a
    stated number of points, at a stated seed;
  * semantically equivalent = no distinguishing input EXISTS.

The gap is a false-green path. A mutant that really does change behaviour, but
happens to agree with the original at every sampled point, leaves the
denominator — and the spec's score goes UP when the evidence says it should go
DOWN. Nothing here closes that gap; the sampling is widened so that a wrong
exclusion is likelier to be caught, and the size of the search is printed so the
claim is measurable rather than asserted.

WHY IT CANNOT BE STRENGTHENED
-----------------------------
Deciding whether two arbitrary Python functions compute the same function is
undecidable (Rice's theorem; the mutant need not even terminate). Exhaustive
checking is unavailable too — Python integers are unbounded, so the domain is
infinite. A real proof would need a symbolic decision procedure over the source,
which this repository does not have. The honest response is a smaller claim and
a bigger search, not a stronger word. See `spec_strength.indistinguishable_on_
sample` for the sampling: boundary values, a band around every integer literal
in either source, seeded random tuples, then a Hypothesis search that must fail
to find a distinguishing input before any exclusion is allowed.

WHAT STILL GETS THROUGH — measured, not hypothetical
----------------------------------------------------
The residual is a mutant whose difference is at a value that appears nowhere in
either source and that the random and Hypothesis legs do not land on. Concretely,
against `return a + b`:

    if a * a == 99980001:   # true only at a == 9999
        return 0

is still wrongly called indistinguishable: 9999 is not a literal in either file,
so no band covers it, and neither the seeded tuples nor 300 Hypothesis examples
hit that single point. A mutant whose difference is at a WRITTEN constant, at a
boundary, or over any range wider than a few values is caught; a mutant whose
difference is at one COMPUTED point is not. That is the shape of what a sample
can and cannot do, and it is why the label is not "equivalent".

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
from spec_strength import (DISTINGUISHER_EXAMPLES, INDISTINGUISHABLE_ON_SAMPLE,
                           SAMPLE_SEED, SampleVerdict, holds,
                           indistinguishable_on_sample, load_module)
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
    for m in generate_mutants(source):
        verdict = indistinguishable_on_sample(source, m.source, name, arity)
        if verdict.indistinguishable:
            excluded.append((m.name, verdict))
        else:
            live.append(m)

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
        f"{len(excluded)} excluded as {INDISTINGUISHABLE_ON_SAMPLE}, 0 scored")
    verdict = "FAIL" if fail_reason else ("PASS" if s >= threshold else "FAIL")
    points = min((v.points_tested for _, v in excluded), default=0)
    return {"mutation_score": round(s, 3), "mutants_killed": killed,
            "mutants": total,
            "indistinguishable_on_sample": len(excluded),
            "excluded_names": [n for n, _ in excluded],
            "sample_points": points, "sample_seed": SAMPLE_SEED,
            "hypothesis_examples": DISTINGUISHER_EXAMPLES,
            # DEPRECATED MISNOMER. The count is right; the word "equivalent"
            # is the exact claim this module exists to stop making. Retained
            # only because scripts/honest_report.py reads this key and is not
            # owned here. Read "indistinguishable_on_sample" instead.
            "equivalent_excluded": len(excluded),
            "survivors": survivors, "verdict": verdict,
            "fail_reason": fail_reason}

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
    budget = (f"{r['sample_points']} points each + {r['hypothesis_examples']} "
              f"hypothesis examples, " if r["indistinguishable_on_sample"] else "")
    print(f"  indistinguishable on sample: {r['indistinguishable_on_sample']} "
          f"excluded ({budget}seed {r['sample_seed']})")
    if r["excluded_names"]:
        print(f"  excluded: {', '.join(r['excluded_names'])} — indistinguishable "
              f"at those points, NOT proven equivalent")
    if r["fail_reason"]:
        print(f"  ZERO DENOMINATOR — {r['fail_reason']}.")
        print(f"  A spec that killed nothing scored nothing: hard FAIL, "
              f"independent of --min-score.")
    if r["survivors"]:
        print(f"  survivors: {', '.join(r['survivors'])}")
    sys.exit(0 if r["verdict"] == "PASS" else 1)
