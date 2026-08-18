#!/usr/bin/env python3
"""FINALIZER — one machine-readable summary of a whole run.

Reads every reports/*.json produced by the gates and writes
reports/gate-manifest.json plus a $GITHUB_STEP_SUMMARY table.

THE FINALIZER NEVER TURNS FAILURE INTO SUCCESS.
It only aggregates. Three rules make that concrete:

  1. Any gate whose status is not PASS or NOT_APPLICABLE makes overall FAIL.
  2. A gate declared mandatory in ci/gates.toml that produced NO report at all
     is recorded as UNKNOWN and fails the run. A missing report is the exact
     signature of a gate that was deleted, skipped or crashed before writing —
     treating absence as success is how a verification system lies.
  3. A report only counts as evidence for THIS run. Reading `status` alone made
     any PASS-shaped file on disk satisfy verification: yesterday's report, a
     report from another workflow, or one written by hand. Every report must
     carry this run's commit, run id and workflow, a schema major version this
     finalizer understands, and a `gate` field matching its own filename.
     Anything else is UNKNOWN and blocks, exactly like a missing report.

Rule 3 is deliberately fail-closed on ABSENCE as well as mismatch. A report that
omits its identity cannot be shown to belong to this run, and "cannot be shown"
is not "verified" — otherwise forging evidence would only require leaving the
identity fields out.

Local runs work because the gate library writes the string "local" for each
identity field when the GitHub environment variables are unset, and this reads
the same defaults. Validation is never skipped: a report claiming a real commit
while the environment says "local" is a mismatch and is rejected.
"""

from __future__ import annotations

import json
import os
import sys
import tomllib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, cast

REPORTS = Path("reports")
MANIFEST = Path("ci/gates.toml")
MERGEABLE = {"PASS", "NOT_APPLICABLE"}
ICONS = {"PASS": "\u2705", "FAIL": "\u274c"}

# The schema this finalizer knows how to read. A different MAJOR means the
# fields below may not mean what they say, so the report is not evidence.
SCHEMA_MAJOR = "1"

# Which report field must equal which environment variable for the report to
# belong to this run. run_attempt is here because a re-run of a failed job keeps
# the same GITHUB_RUN_ID: without it, attempt 1's PASS would satisfy attempt 2.
RUN_IDENTITY = {"commit": "GITHUB_SHA",
                "run_id": "GITHUB_RUN_ID",
                "run_attempt": "GITHUB_RUN_ATTEMPT",
                "workflow": "GITHUB_WORKFLOW"}

# Absent means unverifiable, and unverifiable is not verified.
REQUIRED_FIELDS = ("schema_version", "gate", "status", *RUN_IDENTITY)


def run_identity() -> dict[str, str]:
    """The identity every report must carry. 'local' when run outside CI."""
    return {field: os.environ.get(var, "local") for field, var in RUN_IDENTITY.items()}


def rejection(stem: str, data: Any, identity: dict[str, str]
              ) -> dict[str, Any] | None:
    """Why this report is not admissible evidence for this run, or None."""
    def no(reason: str, expected: Any = None, found: Any = None) -> dict[str, Any]:
        return {"gate": stem, "reason": reason, "expected": expected, "found": found}

    if not isinstance(data, dict):
        return no("report is not a JSON object", "object", type(data).__name__)
    # json.loads returns Any; bind the narrowed value to a declared type so the
    # field reads below are checked rather than silently unknown.
    report: dict[str, Any] = cast("dict[str, Any]", data)

    version = report.get("schema_version")
    if not isinstance(version, str) or version.split(".")[0] != SCHEMA_MAJOR:
        return no("schema_version is missing or not a major version this "
                  "finalizer understands", f"{SCHEMA_MAJOR}.x", version)

    missing = [f for f in REQUIRED_FIELDS if f not in report]
    if missing:
        return no("report omits identity fields, so it cannot be shown to "
                  "belong to this run", REQUIRED_FIELDS, f"missing {missing}")

    if report["gate"] != stem:
        return no("report claims a different gate than its filename",
                  stem, report["gate"])

    for field in RUN_IDENTITY:
        expected, found = identity[field], report[field]
        if str(found) != str(expected):
            return no(f"{field} belongs to another run", expected, found)
    return None


def load_reports(identity: dict[str, str]
                 ) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
    """Admissible reports keyed by filename stem, plus the rejected ones.

    Keying by stem rather than by the report's own `gate` field matters: a file
    that names a different gate used to silently overwrite that gate's entry,
    so one forged file could stand in for another gate's evidence.
    """
    out: dict[str, dict[str, Any]] = {}
    rejected: list[dict[str, Any]] = []
    for p in sorted(REPORTS.glob("*.json")):
        if p.name == "gate-manifest.json":
            continue
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            out[p.stem] = {"gate": p.stem, "status": "UNKNOWN",
                           "failures": [{"what": f"{p} is unreadable or corrupt"}]}
            continue
        bad = rejection(p.stem, data, identity)
        if bad is not None:
            rejected.append(bad)
            continue
        out[p.stem] = data
    return out, rejected


def expected_gates() -> list[str]:
    if not MANIFEST.is_file():
        return []
    m = tomllib.loads(MANIFEST.read_text(encoding="utf-8"))
    return [name for name, spec in m.get("gates", {}).items() if spec.get("mandatory")]


def main() -> int:
    identity = run_identity()
    found, rejected = load_reports(identity)
    expected = expected_gates()
    rejected_by = {str(r["gate"]): r for r in rejected}

    gates: dict[str, dict[str, Any]] = {}
    for name in sorted(set(expected) | set(found) | set(rejected_by)):
        bad = rejected_by.get(name)
        if bad is not None:
            # Evidence from another run, or evidence that cannot prove which run
            # it came from. Either way it does not verify this commit.
            gates[name] = {
                "status": "UNKNOWN", "duration_ms": None, "evidence": None,
                "note": (f"report rejected — {bad['reason']} "
                         f"(expected {bad['expected']!r}, found {bad['found']!r})"),
            }
            continue
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
        "commit": identity["commit"],
        "workflow": identity["workflow"],
        "run_id": identity["run_id"],
        "repository": os.environ.get("GITHUB_REPOSITORY", "local"),
        "ref": os.environ.get("GITHUB_REF", "local"),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "run_identity": identity,
        "gates_expected": expected,
        "gates_reported": sorted(found),
        "gates_missing": sorted(set(expected) - set(found)),
        "gates_rejected": sorted(rejected_by),
        "rejected": rejected,
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
    print(f"  run identity: commit={identity['commit']} run_id={identity['run_id']} "
          f"workflow={identity['workflow']}")
    if rejected:
        lines += ["", f"**Evidence rejected: {', '.join(sorted(rejected_by))}**", ""]
        print(f"  REJECTED EVIDENCE ({len(rejected)}): not from this run")
        for bad in rejected:
            print(f"    {bad['gate']}: {bad['reason']} "
                  f"(expected {bad['expected']!r}, found {bad['found']!r})")
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
