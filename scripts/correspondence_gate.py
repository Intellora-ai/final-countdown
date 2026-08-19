#!/usr/bin/env python3
"""CORRESPONDENCE GATE — the theorem must be about the Python that is here now.

Three failure modes, three checks. Each one alone leaves a hole.

  COMPLETENESS   every src/*.py function has a correspondence pair, and every
                 pair maps to a source. Without this a function is added, no
                 pair is generated, and it silently escapes the proof system
                 while the gate stays green.

  FRESHNESS      regenerate from the current source and compare bytes with what
                 is committed. This is the check that makes editing Python
                 break CI. The committed pair is SELF-CONSISTENT — its AST and
                 its recorded CPython outputs agree with each other — so AXLE
                 would happily verify a pair describing last week's source.
                 Only a comparison against the source detects that.

  KERNEL         AXLE checks the committed pair, so the correspondence and the
                 property are discharged by the Lean kernel, not by this file.

WHAT EACH CHECK CATCHES, MEASURED:

  edit add.py to `a - b`, do not regenerate  -> FRESHNESS fails
  edit add.py to `a - b`, regenerate         -> KERNEL fails: the property
                                                `f [a,b] = f [b,a]` is false of
                                                subtraction
  edit add.py to `a * b`, regenerate         -> KERNEL fails: commutativity
                                                still holds, but the identity
                                                law `f [a,0] = some a` does not
  edit add.py to `b + a`, regenerate         -> ACCEPTED, correctly: it is the
                                                same function
  add an unsupported construct               -> pysem.Unsupported, hard failure,
                                                no claim is produced

This gate does not itself decide whether the mathematics is true. It decides
whether the mathematics is ABOUT the program in this working tree.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, cast

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gen_correspondence as gen  # noqa: E402
import pysem  # noqa: E402
from gate import Gate, INFRASTRUCTURE_FAILURE  # noqa: E402

SRC = Path("src")
SPECS = Path("semantics/specs")
PROOFS = Path("semantics/proofs")
ENVIRONMENT = "lean-4.33.0"
CALL_TIMEOUT = 180


def sources() -> dict[str, Path]:
    """Every Python module that must be covered. `src/<n>.py` defines `<n>`."""
    return {p.stem: p for p in sorted(SRC.glob("*.py"))
            if not p.name.startswith("_")}


def committed(name: str) -> tuple[Path, Path]:
    return (SPECS / f"{name}_semantics_spec.lean",
            PROOFS / f"{name}_semantics_proof.lean")


# Lean's foundational axioms. Anything else in a proof's dependency set is
# either an incomplete proof (`sorryAx`) or an assumption this project added —
# and an assumption that simply asserts the result is not a proof of it.
FOUNDATIONAL = {"propext", "Classical.choice", "Quot.sound"}
AXIOM_LINE = re.compile(r"depends on axioms: \[([^\]]*)\]")


def reported_axioms(infos: list[Any]) -> set[str]:
    found: set[str] = set()
    for line in infos:
        m = AXIOM_LINE.search(str(line))
        if m:
            found |= {a.strip() for a in m.group(1).split(",") if a.strip()}
    return found


def verify_with_axle(spec: Path, proof: Path) -> tuple[bool, str]:
    """(kernel accepted, detail). Distinguishes rejection from unavailability.

    Also enforces the axiom audit: the proof file ends with `#print axioms`, so
    an incomplete proof reports `sorryAx` and a bespoke assumption reports its
    own name. Either makes this return False.
    """
    axle = shutil.which("axle")
    if axle is None:
        return False, "UNAVAILABLE: axle is not on PATH"
    try:
        out = subprocess.run(
            [axle, "verify-proof", "--environment", ENVIRONMENT,
             str(spec), str(proof)],
            capture_output=True, text=True, timeout=CALL_TIMEOUT)
    except subprocess.TimeoutExpired:
        return False, f"UNAVAILABLE: no response within {CALL_TIMEOUT}s"
    except OSError as exc:
        return False, f"UNAVAILABLE: {exc}"
    try:
        parsed: object = json.loads(out.stdout)
    except ValueError:
        text = (out.stdout + out.stderr).strip()
        if "Error:" in text and "compile" in text:
            return False, text.splitlines()[0][:200]
        return False, f"UNAVAILABLE: exit={out.returncode}: {text[:160]}"
    if not isinstance(parsed, dict):
        return False, "UNAVAILABLE: AXLE returned JSON that is not an object"
    payload = cast("dict[str, Any]", parsed)
    messages_obj = payload.get("lean_messages")
    if payload.get("okay") is True:
        infos: list[Any] = []
        if isinstance(messages_obj, dict):
            raw_i = cast("dict[str, Any]", messages_obj).get("infos")
            if isinstance(raw_i, list):
                infos = cast("list[Any]", raw_i)
        axioms = reported_axioms(infos)
        if not axioms:
            return False, ("no axiom report — the proof file must end with "
                           "`#print axioms`, or the audit is not running")
        extra = axioms - FOUNDATIONAL
        if extra:
            return False, (f"proof depends on non-foundational axioms: "
                           f"{', '.join(sorted(extra))}")
        return True, f"axioms: {', '.join(sorted(axioms))}"
    messages = messages_obj
    errors: list[Any] = []
    if isinstance(messages, dict):
        raw = cast("dict[str, Any]", messages).get("errors")
        if isinstance(raw, list):
            errors = cast("list[Any]", raw)
    return False, "; ".join(str(e)[:160] for e in errors) or "okay=false"


def main() -> None:
    with Gate("correspondence", version="1.0.0",
              tools={"axle": ["axle", "--version"]}) as g:
        src_map = sources()
        spec_names = {p.name[: -len("_semantics_spec.lean")]
                      for p in sorted(SPECS.glob("*_semantics_spec.lean"))}
        g.set_scope(sources=len(src_map), pairs=len(spec_names),
                    spec_dir=str(SPECS), proof_dir=str(PROOFS),
                    environment=ENVIRONMENT,
                    ground_truth_points=gen.GROUND_TRUTH_POINTS)

        # ---- COMPLETENESS -------------------------------------------------
        missing = sorted(set(src_map) - spec_names)
        orphans = sorted(spec_names - set(src_map))
        g.check("every source has a correspondence pair", not missing,
                ", ".join(missing) or "all covered")
        for name in missing:
            g.fail(what=f"src/{name}.py has no correspondence pair",
                   where=str(SPECS / f"{name}_semantics_spec.lean"),
                   why="the function is in the repository and no theorem is "
                       "about it, so it is outside the proof system entirely",
                   requirement="Every supported source must be covered.",
                   fix=f"python3 scripts/gen_correspondence.py --function {name}")
        g.check("every correspondence pair has a source", not orphans,
                ", ".join(orphans) or "all matched")
        for name in orphans:
            g.fail(what=f"'{name}' has a correspondence pair but no source",
                   where=str(SRC / f"{name}.py"),
                   why="a theorem about a program that is not here",
                   requirement="The pair set and the source set must be equal.",
                   fix=f"Restore src/{name}.py or delete its pair.")
        if not src_map:
            g.fail(what="there are no sources to correspond to",
                   requirement="A gate that verified nothing must not PASS.",
                   fix="Restore src/*.py.")

        if missing or orphans or not src_map:
            g.failed()
            g.artifact("reports/correspondence.json")
            return

        # ---- FRESHNESS + KERNEL -------------------------------------------
        stale: list[str] = []
        rejected: list[str] = []
        unavailable: list[str] = []

        with tempfile.TemporaryDirectory() as tmp:
            for name, path in src_map.items():
                try:
                    e = pysem.emit(path, name)
                    e.ground_truth = pysem.observe(path, name, e.params)
                    fresh_spec, fresh_proof = gen.render(e)
                except pysem.Unsupported as exc:
                    g.check(f"{name}: inside the supported subset", False, str(exc))
                    g.fail(what=f"src/{name}.py is outside the supported subset",
                           where=str(path), why=str(exc),
                           requirement="Unsupported Python gets no formal claim.",
                           fix="Rewrite within the subset, or state plainly that "
                               "this function is not formally covered.")
                    rejected.append(name)
                    continue

                spec_path, proof_path = committed(name)
                on_disk_spec = spec_path.read_text(encoding="utf-8") \
                    if spec_path.is_file() else ""
                on_disk_proof = proof_path.read_text(encoding="utf-8") \
                    if proof_path.is_file() else ""
                fresh = (on_disk_spec == fresh_spec
                         and on_disk_proof == fresh_proof)
                g.check(f"{name}: pair matches current source", fresh,
                        f"sha256 {e.source_sha256[:12]}")
                if not fresh:
                    stale.append(name)
                    diff = Path(tmp) / f"{name}_expected_spec.lean"
                    diff.write_text(fresh_spec, encoding="utf-8")
                    g.fail(what=f"{name}: the committed proof describes different "
                                "Python than src/",
                           where=str(spec_path),
                           why="the pair is self-consistent, so AXLE would verify "
                               "it happily; only comparing against the source "
                               "shows that it is about an older program",
                           requirement="A theorem may only be claimed of the "
                                       "program actually in the tree.",
                           fix=f"python3 scripts/gen_correspondence.py "
                               f"--function {name}, then review the diff.")
                    continue

                ok, detail = verify_with_axle(spec_path, proof_path)
                g.check(f"{name}: kernel accepts correspondence + property", ok,
                        detail or "okay")
                if ok:
                    print(f"✓ {name}: correspondence and property kernel-checked")
                elif detail.startswith("UNAVAILABLE"):
                    unavailable.append(name)
                    print(f"⚠ {name}: {detail}")
                    g.fail(what=f"{name}: AXLE could not be consulted",
                           where=f"{spec_path} + {proof_path}", why=detail,
                           requirement="An unverifiable proof must not merge.",
                           fix="Check the AXLE service; do not bypass the gate.")
                else:
                    rejected.append(name)
                    print(f"❌ {name}: kernel rejected")
                    g.fail(what=f"{name}: the kernel rejected the file",
                           where=f"{spec_path} + {proof_path}", why=detail,
                           requirement="The correspondence and the property must "
                                       "both hold of this program.",
                           fix="Either the property is false of the new code, or "
                               "the recorded CPython outputs no longer match. "
                               "Read the Lean error; do not weaken the theorem "
                               "to make it pass.")

        g.set_scope(stale=len(stale), rejected=len(rejected),
                    unavailable=len(unavailable))
        g.artifact("reports/correspondence.json")
        if stale or rejected:
            g.failed()
        elif unavailable:
            g.result = INFRASTRUCTURE_FAILURE
        else:
            print(f"✓ {len(src_map)} function(s): the theorems are about the "
                  "Python in this tree")
            g.passed()


if __name__ == "__main__":
    main()
