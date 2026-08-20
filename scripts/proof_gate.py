#!/usr/bin/env python3
"""LAYER 4 — PROOF GATE. VERIFIED is returned only after AXLE says okay.

`axle verify-proof` exits 0 when okay is false, and prints a plain-text Error
with no JSON when the statement fails to compile. Neither the exit code nor a
grep for '"okay": false' is sufficient, so the JSON is parsed and anything that
is not an explicit okay:true counts as unverified.
"""

import argparse
import json
import shutil

# subprocess is required: AXLE is a CLI. Every call below uses an absolute
# executable resolved via shutil.which, a fixed argument list (never a shell
# string), and paths that come from this repo's specs/ and proofs/ - not from
# user input. shell=False is the default and is never overridden.
import subprocess
import sys
from pathlib import Path
from typing import Any

ENVIRONMENT = "lean-4.33.0"


def verify(
    spec_file: str, proof_file: str, environment: str = ENVIRONMENT, timeout: int = 180
) -> dict[str, Any]:
    if not Path(proof_file).is_file():
        return {"proof": "MISSING", "axle_ms": None, "detail": f"{proof_file} absent"}
    axle = shutil.which("axle")
    if axle is None:
        return {"proof": "UNVERIFIED", "axle_ms": None, "detail": "axle not on PATH"}
    try:
        out = subprocess.run(
            [axle, "verify-proof", "--environment", environment, spec_file, proof_file],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError) as exc:
        return {"proof": "UNVERIFIED", "axle_ms": None, "detail": str(exc)}
    try:
        data = json.loads(out.stdout)
    except ValueError:
        head = (out.stdout or out.stderr).strip().splitlines()
        return {
            "proof": "UNVERIFIED",
            "axle_ms": None,
            "detail": head[0] if head else "no output",
        }
    if data.get("okay") is not True:
        errs = data.get("lean_messages", {}).get("errors", [])
        return {
            "proof": "REJECTED",
            "axle_ms": data.get("timings", {}).get("total_ms"),
            "detail": (errs[0].strip()[:120] if errs else "okay is not true"),
        }
    return {
        "proof": "VERIFIED",
        "axle_ms": data.get("timings", {}).get("total_ms"),
        "detail": "",
    }


def proof_for(spec_file: str) -> str:
    return str(
        Path("proofs") / Path(spec_file).name.replace("_spec.lean", "_proof.lean")
    )


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("specs", nargs="+")
    p.add_argument("--environment", default=ENVIRONMENT)
    ns = p.parse_args()
    bad = False
    for s in ns.specs:
        r = verify(s, proof_for(s), ns.environment)
        ms = f"{r['axle_ms']}ms" if r["axle_ms"] is not None else "-"
        print(f"  {Path(s).name:<26} {r['proof']:<11} {ms:>7}  {r['detail']}")
        if r["proof"] != "VERIFIED":
            bad = True
    sys.exit(1 if bad else 0)
