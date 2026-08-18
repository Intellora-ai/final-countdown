#!/usr/bin/env python3
"""FINALIZER — one machine-readable summary of a whole run.

Reads every reports/*.json produced by the gates and writes
reports/gate-manifest.json plus a $GITHUB_STEP_SUMMARY table.

THE FINALIZER NEVER TURNS FAILURE INTO SUCCESS.
It only aggregates. Two rules make that concrete:

  1. Any gate whose status is not PASS or NOT_APPLICABLE makes overall FAIL.
  2. A gate declared mandatory in ci/gates.toml that produced NO report at all
     is recorded as UNKNOWN and fails the run. A missing report is the exact
     signature of a gate that was deleted, skipped or crashed before writing —
     treating absence as success is how a verification system lies.
"""

from __future__ import annotations

import json
import os
import sys
import tomllib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPORTS = Path("reports")
MANIFEST = Path("ci/gates.toml")
MERGEABLE = {"PASS", "NOT_APPLICABLE"}
ICONS = {"PASS": "\u2705", "FAIL": "\u274c"}


def load_reports() -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for p in sorted(REPORTS.glob("*.json")):
        if p.name == "gate-manifest.json":
            continue
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            out[p.stem] = {"gate": p.stem, "status": "UNKNOWN",
                           "failures": [{"what": f"{p} is unreadable or corrupt"}]}
            continue
        out[data.get("gate", p.stem)] = data
    return out


def expected_gates() -> list[str]:
    if not MANIFEST.is_file():
        return []
    m = tomllib.loads(MANIFEST.read_text(encoding="utf-8"))
    return [name for name, spec in m.get("gates", {}).items() if spec.get("mandatory")]


def main() -> int:
    found = load_reports()
    expected = expected_gates()

    gates: dict[str, dict[str, Any]] = {}
    for name in sorted(set(expected) | set(found)):
        r = found.get(name)
        if r is None:
            # Absence is never success. A mandatory gate with no report did not run.
            gates[name] = {
                "status": "UNKNOWN", "duration_ms": None, "evidence": None,
                "note": "no report produced — gate did not run, or crashed before writing",
            }
            continue
        gates[name] = {
            "status": r.get("status", "UNKNOWN"),
            "duration_ms": r.get("duration_ms"),
            "checks_passed": r.get("checks_passed"),
            "checks_failed": r.get("checks_failed"),
            "scope": r.get("scope", {}),
            "failures": r.get("failures", []),
            "evidence": f"reports/{name}.json",
        }

    blocking = [n for n, g in gates.items() if g["status"] not in MERGEABLE]
    overall = "PASS" if not blocking else "FAIL"

    durations = [g["duration_ms"] for g in gates.values() if g.get("duration_ms")]
    manifest = {
        "overall": overall,
        "mergeable": overall == "PASS",
        "commit": os.environ.get("GITHUB_SHA", "local"),
        "workflow": os.environ.get("GITHUB_WORKFLOW", "local"),
        "run_id": os.environ.get("GITHUB_RUN_ID", "local"),
        "repository": os.environ.get("GITHUB_REPOSITORY", "local"),
        "ref": os.environ.get("GITHUB_REF", "local"),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "gates_expected": expected,
        "gates_reported": sorted(found),
        "gates_missing": sorted(set(expected) - set(found)),
        "blocking": blocking,
        "total_gate_ms": sum(durations),
        "slowest_gate_ms": max(durations) if durations else 0,
        "gates": gates,
    }

    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "gate-manifest.json").write_text(json.dumps(manifest, indent=2),
                                                encoding="utf-8")

    icon = "✅" if overall == "PASS" else "❌"
    lines = [f"## {icon} Gate manifest — {overall}", "",
             f"commit `{str(manifest['commit'])[:12]}` · run `{manifest['run_id']}`", "",
             "| Gate | Result | Duration | Evidence |", "|---|---|---|---|"]
    print(f"\n{'=' * 72}\n[GATE MANIFEST] overall={overall}  mergeable={manifest['mergeable']}\n{'=' * 72}")
    for name, g in gates.items():
        mark = ICONS.get(str(g["status"]), "⚠️")
        dur = f"{g['duration_ms']} ms" if g.get("duration_ms") else "—"
        ev = f"`{g['evidence']}`" if g.get("evidence") else "**none**"
        lines.append(f"| {name} | {mark} {g['status']} | {dur} | {ev} |")
        print(f"  {g['status']:<22} {name:<24} {dur}")
    if blocking:
        lines += ["", f"**Blocking: {', '.join(blocking)}**", ""]
        print(f"\n  BLOCKING: {', '.join(blocking)}")
        for name in blocking:
            for f in gates[name].get("failures", [])[:3]:
                lines.append(f"- `{name}` — {f.get('what', '')}")
                print(f"    {name}: {f.get('what', '')}")
            if gates[name].get("note"):
                lines.append(f"- `{name}` — {gates[name]['note']}")
                print(f"    {name}: {gates[name]['note']}")

    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        try:
            with open(summary, "a", encoding="utf-8") as fh:
                fh.write("\n".join(lines) + "\n")
        except OSError:
            pass

    print(f"\n  evidence: reports/gate-manifest.json")
    return 0 if overall == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
