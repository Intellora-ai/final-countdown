#!/usr/bin/env python3
"""AXLE PROOF GATE — completeness first, then verification.

Replaces the shell loop, which had three defects that this owns instead.

1. ZERO SPECS PASSED. `for spec in specs/*_spec.lean` with nullglob ran zero
   times, left fail=0, printed "All proofs verified" and exited 0. Measured:
   an empty specs/ produced a green required check. Deleting the directory was
   indistinguishable from proving everything in it.

2. THE SET WAS CHECKED IN ONE DIRECTION. It walked specs and demanded a
   matching proof, so a proof whose spec had been deleted was invisible.
   Measured: proofs/add_proof.lean with no specs/ exited 0. Deleting a spec
   silently removed a function from verification.

3. RESULT SEMANTICS WERE SHARED WITH NOBODY. A `python3 -c` one-liner with
   `2>/dev/null` collapsed "the proof is wrong" and "AXLE could not run" into
   one FAIL, which is the distinction the six result types exist to preserve.

So the gate now proves a set property before it proves any proof:

    SPEC_SET == PROOF_SET  and  |SPEC_SET| > 0

Verifying every member of a set says nothing about the set being the right one.
A gate that reports PASS must have compared its scope against the repository,
not merely against itself.

MEASURED AXLE SEMANTICS (axiom-axle against lean-4.33.0, observed, not assumed):

    exit 0, JSON, "okay": true    the proof discharges the spec
    exit 0, JSON, "okay": false   it does not
    exit 1, plain text "Error:"   the input does not compile

`okay` is the only authoritative field: on a mismatched pair AXLE returned
"okay": false with BOTH failed_declarations and lean_messages.errors empty, so
a classifier keying on those would have reported a pass. The exit code is not
authoritative either — it is 0 for both true and false.

Anything else — binary absent, timeout, output that is neither JSON nor a
compile error — is INFRASTRUCTURE_FAILURE, not FAIL. "Could not verify" is not
"verified", and calling an outage a proof failure sends people to debug the
wrong thing.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, cast

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gate import INFRASTRUCTURE_FAILURE, Gate  # noqa: E402

SPECS = Path("specs")
PROOFS = Path("proofs")
SPEC_SUFFIX = "_spec.lean"
PROOF_SUFFIX = "_proof.lean"

# Per-call ceiling. Measured: `axle verify-proof` against an environment that
# does not exist did not return within 120s. Unbounded, that becomes a job
# timeout with no classification attached; bounded, it is a named
# INFRASTRUCTURE_FAILURE with the evidence to prove which pair hung.
CALL_TIMEOUT = int(os.environ.get("AXLE_TIMEOUT", "120"))

VERIFIED = "VERIFIED"
REJECTED = "REJECTED"
UNAVAILABLE = "UNAVAILABLE"


def names(directory: Path, suffix: str) -> dict[str, Path]:
    """Identity -> file, for every file in `directory` ending in `suffix`."""
    if not directory.is_dir():
        return {}
    return {p.name[: -len(suffix)]: p for p in sorted(directory.glob(f"*{suffix}"))}


def classify(result: subprocess.CompletedProcess[str]) -> tuple[str, str]:
    """One authoritative reading of an AXLE invocation: (state, detail)."""
    text = (result.stdout or "") + (result.stderr or "")
    try:
        parsed: object = json.loads(result.stdout)
    except ValueError:
        # No JSON. AXLE reports a non-compiling input this way, and that is a
        # real defect in the repository, not an outage.
        if "Error:" in text and "compile" in text:
            return REJECTED, text.strip().splitlines()[0][:200]
        return UNAVAILABLE, f"exit={result.returncode}: {text.strip()[:200]}"
    if not isinstance(parsed, dict):
        return UNAVAILABLE, "AXLE returned JSON that is not an object"
    payload = cast("dict[str, Any]", parsed)

    # `okay` is the ONLY authoritative field. Measured on a mismatched pair:
    # okay=false with failed_declarations == [] and lean_messages.errors == [],
    # so anything read below is for the human, never for the verdict.
    if payload.get("okay") is True:
        return VERIFIED, ""
    messages = payload.get("lean_messages")
    errors: list[Any] = []
    if isinstance(messages, dict):
        raw = cast("dict[str, Any]", messages).get("errors")
        if isinstance(raw, list):
            errors = cast("list[Any]", raw)
    raw_failed = payload.get("failed_declarations")
    failed: list[Any] = (
        cast("list[Any]", raw_failed) if isinstance(raw_failed, list) else []
    )
    reasons: list[Any] = errors or failed
    detail = "; ".join(str(e)[:120] for e in reasons) or "AXLE reported okay=false"
    return REJECTED, detail[:300]


def verify(environment: str, spec: Path, proof: Path) -> tuple[str, str]:
    # `axle` is resolved here rather than passed in, so the safe subprocess
    # pattern (shell=False, literal argv, argv[0] from shutil.which, timeout)
    # is provable from this function alone. security_gate.py re-derives that
    # pattern from the AST every run; taking the path as a parameter would
    # have meant weakening the checker to fit the code.
    axle = shutil.which("axle")
    if axle is None:
        return UNAVAILABLE, "axle is not on PATH"
    try:
        result = subprocess.run(
            [axle, "verify-proof", "--environment", environment, str(spec), str(proof)],
            capture_output=True,
            text=True,
            timeout=CALL_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        return UNAVAILABLE, f"no response within {CALL_TIMEOUT}s"
    except OSError as exc:
        return UNAVAILABLE, f"could not execute axle: {exc}"
    return classify(result)


def main() -> None:
    environment = os.environ.get("AXLE_ENV", "lean-4.33.0")
    with Gate(
        "axle-verify", version="2.0.0", tools={"axle": ["axle", "--version"]}
    ) as g:
        if shutil.which("axle") is None:
            g.infrastructure_failure("axle is not on PATH")
            return

        specs = names(SPECS, SPEC_SUFFIX)
        proofs = names(PROOFS, PROOF_SUFFIX)
        g.set_scope(
            environment=environment,
            specs_found=len(specs),
            proofs_found=len(proofs),
            spec_dir=str(SPECS),
            proof_dir=str(PROOFS),
            call_timeout_s=CALL_TIMEOUT,
        )

        # ---- completeness, before any proof is checked --------------------
        complete = True

        non_empty = g.check(
            "spec set is non-empty", bool(specs), f"{len(specs)} spec(s)"
        )
        if not non_empty:
            complete = False
            g.fail(
                what="there are no specs to verify",
                where=f"{SPECS}/*{SPEC_SUFFIX}",
                why="the loop would run zero times and report success",
                requirement="A gate that verified nothing must not report PASS.",
                fix=f"Restore the spec files under {SPECS}/, or remove this "
                "gate from ci/gates.toml and the ruleset together.",
            )

        missing = sorted(set(specs) - set(proofs))
        orphans = sorted(set(proofs) - set(specs))

        g.check(
            "every spec has a proof", not missing, ", ".join(missing) or "all matched"
        )
        if missing:
            complete = False
            for name in missing:
                g.fail(
                    what=f"'{name}' has a spec but no proof",
                    where=f"{PROOFS}/{name}{PROOF_SUFFIX}",
                    requirement="Every spec must be discharged by a proof.",
                    fix=f"Write {PROOFS}/{name}{PROOF_SUFFIX}.",
                )

        g.check(
            "every proof has a spec", not orphans, ", ".join(orphans) or "all matched"
        )
        if orphans:
            complete = False
            for name in orphans:
                g.fail(
                    what=f"'{name}' has a proof but no spec",
                    where=f"{SPECS}/{name}{SPEC_SUFFIX}",
                    why="a deleted spec leaves its proof behind, so the "
                    "function it constrained is no longer verified while "
                    "the gate stays green",
                    requirement="The proof set and the spec set must be equal.",
                    fix=f"Restore {SPECS}/{name}{SPEC_SUFFIX}, or delete "
                    f"{PROOFS}/{name}{PROOF_SUFFIX} too.",
                )

        if not complete:
            # Verifying the members of a set that is already known to be the
            # wrong set cannot establish anything. Stop here and say so.
            g.failed()
            g.artifact("reports/axle-verify.json")
            return

        # ---- every pair, one authoritative classification each ------------
        rejected: list[str] = []
        unavailable: list[str] = []
        for name, spec in specs.items():
            state, detail = verify(environment, spec, proofs[name])
            g.check(
                f"{name}: proof discharges spec", state == VERIFIED, detail or state
            )
            if state == VERIFIED:
                print(f"✓ {name}: verified")
                continue
            if state == REJECTED:
                rejected.append(name)
                print(f"❌ {name}: AXLE rejected the proof")
                g.fail(
                    what=f"{name}: the proof does not discharge the spec",
                    where=f"{spec} + {proofs[name]}",
                    why=detail,
                    requirement="AXLE must return okay=true for every pair.",
                    fix="Fix the proof, or weaken the spec to something "
                    "the proof actually establishes.",
                )
            else:
                unavailable.append(name)
                print(f"⚠ {name}: AXLE could not run")
                g.fail(
                    what=f"{name}: AXLE could not be consulted",
                    where=f"{spec} + {proofs[name]}",
                    why=detail,
                    requirement="An unverifiable proof must not merge.",
                    fix="Check the AXLE service and the environment name; "
                    "do not bypass the gate.",
                )

        g.set_scope(
            pairs_checked=len(specs),
            rejected=len(rejected),
            unavailable=len(unavailable),
        )
        g.artifact("reports/axle-verify.json")

        if rejected:
            # A definite rejection is the more actionable claim, so it wins the
            # headline even when the service also faltered on another pair.
            # Both block; the counts above keep the outage visible.
            g.failed()
        elif unavailable:
            g.result = INFRASTRUCTURE_FAILURE
        else:
            print(f"✓ All {len(specs)} proofs verified")
            g.passed()


if __name__ == "__main__":
    main()
