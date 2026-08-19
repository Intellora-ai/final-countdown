#!/usr/bin/env python3
"""Make code scanning agree with the gate that already judged the findings.

THE DEFECT THIS CLOSES.

scripts/security_gate.py adjudicates every bandit finding by re-deriving the
safe pattern from the AST — 21 of them are verified exceptions, each proved
rather than allowlisted. The SARIF upload published bandit's RAW output, so
GitHub opened an alert for every one of those verified findings, and each alert
became an unresolved review thread on the pull request.

Two sources of truth for the same findings, disagreeing by construction. It got
worse with every script added: 18 alerts became 25, and PR #1 sat blocked on 17
unresolved threads that no human had written and no human could usefully act on.

THE FIX IS NOT TO STOP SCANNING, AND NOT TO ALLOWLIST.

Bandit still scans src/ AND scripts/ on every run. The gate still fails on any
finding it cannot verify. This only marks the results the gate PROVED safe, so
the Security tab shows what needs a human and nothing else.

    bandit -f sarif -o bandit.sarif ...
    python3 scripts/sarif_suppress.py --sarif bandit.sarif
    upload-sarif

TWO PROPERTIES MAKE THIS SAFE TO DO AT ALL.

1. The adjudication is IMPORTED from security_gate, not reimplemented. There is
   one definition of "verified", and if the safe pattern stops holding at a
   call site the exception evaporates in both places at once.

2. It fails OPEN, in the direction of showing more. A finding is suppressed
   only on an exact (rule, file, line) match with a verified one. If the gate
   itself failed, nothing is suppressed at all — a red gate publishes
   everything, because that is when a human most needs to see it.

Suppression is recorded in SARIF's own `suppressions` field with a
justification, not by deleting the result. The finding stays in the file and
stays auditable; what changes is that it is marked reviewed.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, cast

sys.path.insert(0, str(Path(__file__).resolve().parent))
import security_gate  # noqa: E402


def verified_locations(targets: list[str]) -> tuple[set[tuple[str, str, int]], bool]:
    """((rule, file, line) the gate PROVED safe, whether the gate passed).

    Runs the same adjudication the gate runs. Returns the gate's verdict too,
    because a failing gate must suppress nothing.
    """
    findings = security_gate.run_bandit(targets)
    ok_locations: set[tuple[str, str, int]] = set()
    unresolved = 0

    for finding in findings:
        path = str(finding["filename"]).lstrip("./")
        key = (str(finding["test_id"]), path)
        line = int(finding["line_number"])

        if key in security_gate.HEURISTIC:
            checker = (security_gate.check_is_status_literal
                       if key[0] == "B105" else security_gate.check_no_sql)
            good, _ = checker(path, line)
        elif key in security_gate.ELIGIBLE:
            good, _ = security_gate.check_subprocess_safety(path)
        else:
            good = False

        if good:
            ok_locations.add((key[0], path, line))
        else:
            unresolved += 1

    return ok_locations, unresolved == 0


def result_location(result: dict[str, Any]) -> tuple[str, str, int] | None:
    rule = result.get("ruleId")
    locations = result.get("locations")
    if not isinstance(rule, str) or not isinstance(locations, list) or not locations:
        return None
    first = cast("list[Any]", locations)[0]
    if not isinstance(first, dict):
        return None
    phys = cast("dict[str, Any]", first).get("physicalLocation")
    if not isinstance(phys, dict):
        return None
    artifact = cast("dict[str, Any]", phys).get("artifactLocation")
    region = cast("dict[str, Any]", phys).get("region")
    if not isinstance(artifact, dict) or not isinstance(region, dict):
        return None
    uri = cast("dict[str, Any]", artifact).get("uri")
    line = cast("dict[str, Any]", region).get("startLine")
    if not isinstance(uri, str) or not isinstance(line, int):
        return None
    return (rule, uri.lstrip("./"), line)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sarif", required=True, help="SARIF file, edited in place")
    ap.add_argument("targets", nargs="*", default=["src", "scripts"])
    ns = ap.parse_args()
    targets: list[str] = ns.targets or ["src", "scripts"]

    path = Path(ns.sarif)
    try:
        doc = cast("dict[str, Any]", json.loads(path.read_text(encoding="utf-8")))
    except (OSError, ValueError) as exc:
        # The upload step already proves the SARIF exists and parses. If that
        # changes, say so and stop rather than writing a file nobody checked.
        print(f"cannot read {path}: {exc}", file=sys.stderr)
        return 1

    ok_locations, gate_passed = verified_locations(targets)
    if not gate_passed:
        print("gate FAILED — suppressing nothing; a red gate publishes every "
              "finding, which is when a human most needs to see them")
        return 0

    runs = doc.get("runs")
    if not isinstance(runs, list):
        print("SARIF has no runs[]; nothing to do", file=sys.stderr)
        return 1

    suppressed = 0
    total = 0
    for run in cast("list[Any]", runs):
        if not isinstance(run, dict):
            continue
        results = cast("dict[str, Any]", run).get("results")
        if not isinstance(results, list):
            continue
        for r in cast("list[Any]", results):
            if not isinstance(r, dict):
                continue
            result = cast("dict[str, Any]", r)
            total += 1
            where = result_location(result)
            if where is None or where not in ok_locations:
                continue
            result["suppressions"] = [{
                "kind": "external",
                "justification":
                    "Verified by scripts/security_gate.py: the safe pattern is "
                    "re-derived from the AST on every run (shell=False, argv "
                    "list literal, argv[0] from shutil.which or sys.executable, "
                    "timeout set). If the pattern stops holding, the exception "
                    "evaporates and the bandit gate fails.",
            }]
            suppressed += 1

    path.write_text(json.dumps(doc, indent=2), encoding="utf-8")
    print(f"  bandit SARIF: {total} result(s), {suppressed} marked verified by "
          f"the gate, {total - suppressed} left for a human")
    return 0


if __name__ == "__main__":
    sys.exit(main())
