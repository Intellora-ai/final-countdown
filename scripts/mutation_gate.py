#!/usr/bin/env python3
"""Fail the build unless the mutation score meets the threshold.

`mutmut run` exits non-zero when mutants survive, so the workflow tolerates its
exit code and this script owns the pass/fail decision instead.
"""

import json
import subprocess
import sys


def mutation_score() -> tuple[float, dict[str, int]]:
    raw = subprocess.run(
        ["mutmut", "results", "--all", "--json"],
        capture_output=True,
        text=True,
        check=False,
    ).stdout

    counts = {"killed": 0, "survived": 0, "timeout": 0, "suspicious": 0}
    try:
        for entry in json.loads(raw or "[]"):
            status = str(entry.get("status", "")).lower()
            if status in counts:
                counts[status] += 1
    except (ValueError, TypeError):
        print("mutation_gate: could not parse `mutmut results --json`", file=sys.stderr)
        print(raw[:500], file=sys.stderr)
        sys.exit(1)

    # Timeouts count as killed: the mutant changed behaviour enough to hang.
    killed = counts["killed"] + counts["timeout"]
    total = killed + counts["survived"] + counts["suspicious"]
    if total == 0:
        print("mutation_gate: no mutants generated — refusing to pass vacuously", file=sys.stderr)
        sys.exit(1)
    return 100.0 * killed / total, counts


if __name__ == "__main__":
    threshold = float(sys.argv[1]) if len(sys.argv) > 1 else 95.0
    score, counts = mutation_score()
    print(f"mutation score: {score:.1f}%  (threshold {threshold:.0f}%)  {counts}")
    if score < threshold:
        print(f"❌ mutation score {score:.1f}% is below {threshold:.0f}%")
        sys.exit(1)
    print("✓ mutation score meets threshold")
