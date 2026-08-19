#!/usr/bin/env python3
"""Preflight: is the AXLE service reachable?

AXLE is a client for a hosted Lean service. Every proof gate depends on that
host, so an outage looks identical to a broken proof unless it is checked
separately. This distinguishes "your proof is wrong" from "the server is down"
in the CI log, and exits non-zero either way: an unverifiable proof must not
merge.
"""

import shutil
import subprocess
import sys
import time

URL = "https://axle.axiommath.ai"


def check(timeout: int = 60) -> int:
    axle = shutil.which("axle")
    if axle is None:
        print("UNREACHABLE: axle is not on PATH")
        return 1
    start = time.monotonic()
    try:
        out = subprocess.run([axle, "environments"], capture_output=True,
                             text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        print(f"UNREACHABLE: {URL} did not respond within {timeout}s")
        return 1
    elapsed = (time.monotonic() - start) * 1000
    if out.returncode != 0 or "lean-" not in out.stdout:
        print(f"UNREACHABLE: {URL} returned no Lean environments")
        print((out.stderr or out.stdout)[:300])
        return 1
    envs = [ln.strip().strip('",') for ln in out.stdout.splitlines()
            if '"name"' in ln]
    print(f"REACHABLE: {URL}  {elapsed:.0f}ms  {len(envs)} Lean environments")
    return 0


if __name__ == "__main__":
    sys.exit(check())
