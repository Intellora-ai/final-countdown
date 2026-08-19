#!/usr/bin/env python3
"""FINALIZER — the completeness proof for one verification run.

    python3 scripts/aggregate_gates.py --evidence-root evidence

Reads every gate's report, proves the evidence set is exactly the set
ci/gates.toml declares, and writes reports/gate-manifest.json.

WHY THIS RUNS WHERE IT RUNS.
It used to read ./reports and summarise whatever happened to be there. In CI
that was only ever its own workflow's files, because separate workflows are
separate runs with separate filesystems — so the manifest described a second,
duplicate execution of the gates and proved nothing about the ten checks the
ruleset actually required. Every gate is now a job in verify.yml and this job
`needs:` all of them, so `download-artifact` collects the evidence the required
checks really produced, in the same run.

THE INVARIANT

    EXPECTED == OBSERVED == VALID == AGGREGATED

Equality in both directions. Subset is not enough in either:

    missing     a mandatory gate produced no report. The job may well be green
                — a step conditioned away, an upload that failed, a crash after
                exit 0 — and this is the only place that shows.
    unexpected  a report for a gate nobody declared. It verifies nothing, and
                it must not be able to stand in for a gate that is expected.
    duplicate   two reports claiming one gate id. Two authoritative answers is
                an ambiguity, so it blocks rather than picking a winner. That
                is the shape a re-run leaves behind.
    stale       a report from another run, commit, attempt or workflow.

THE FINALIZER NEVER TURNS FAILURE INTO SUCCESS. It only aggregates, and every
uncertainty it meets resolves to UNKNOWN, which is not mergeable.

Absence is fail-closed as hard as mismatch. A report that omits its identity
cannot be shown to belong to this run, and "cannot be shown" is not "verified"
— otherwise forging evidence would only require leaving the fields out.

Local runs work because scripts/gate.py writes "local" for each identity field
when the GitHub variables are unset, and this reads the same defaults.
Validation is never skipped: a report claiming a real commit while the
environment says "local" is a mismatch and is rejected.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tomllib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, cast

sys.path.insert(0, str(Path(__file__).resolve().parent))
import blocker_report  # noqa: E402 - path must be set before this import

REPORTS = Path("reports")
MANIFEST = Path("ci/gates.toml")
MANIFEST_NAME = "gate-manifest.json"
MERGEABLE = {"PASS", "NOT_APPLICABLE"}
ICONS = {"PASS": "✅", "FAIL": "❌"}

# The schema major this finalizer knows how to read. A different MAJOR means
# the fields below may not mean what they say, so the report is not evidence.
SCHEMA_MAJOR = "1"

# Fallback only for a repository with no manifest; ci/gates.toml [schema] is
# the real declaration and is what CI reads.
DEFAULT_IDENTITY = {"commit": "GITHUB_SHA", "run_id": "GITHUB_RUN_ID",
                    "run_attempt": "GITHUB_RUN_ATTEMPT",
                    "workflow": "GITHUB_WORKFLOW"}


def load_manifest() -> dict[str, Any]:
    if not MANIFEST.is_file():
        return {}
    return tomllib.loads(MANIFEST.read_text(encoding="utf-8"))


def topology(manifest: dict[str, Any]) -> tuple[list[str], dict[str, str]]:
    """(gates that must produce a report, field -> env var for run identity).

    The finalizer is itself a mandatory gate, but it cannot have produced a
    report before it runs — its evidence IS the manifest it is writing. Any
    gate whose declared role is `finalizer` is therefore excluded from the set
    it expects to find, and only from that set.
    """
    gates: dict[str, dict[str, Any]] = manifest.get("gates", {})
    # `finalizer` cannot have reported before it runs. `scanner` runs in
    # another workflow and publishes to code scanning rather than to reports/,
    # so its artifact is not in this run's evidence tree; the ruleset enforces
    # it directly instead. Both are excluded from the expected-report set and
    # from nothing else.
    # Roles that legitimately produce no reports/*.json in THIS run:
    #   finalizer      has not reported when it runs — its evidence is the
    #                  manifest it is writing
    #   scanner        CodeQL analysis, another workflow, publishes to code
    #                  scanning
    #   code-scanning  the results check, posted by GitHub's app, not a job
    # Every other mandatory gate must be present, and absence still blocks.
    excluded = {"finalizer", "scanner", "code-scanning"}
    expected = [name for name, spec in gates.items()
                if spec.get("mandatory") and spec.get("role") not in excluded]
    schema: dict[str, Any] = manifest.get("schema", {})
    declared = schema.get("run_identity")
    identity = cast("dict[str, str]", declared) if isinstance(declared, dict) \
        else DEFAULT_IDENTITY
    return sorted(expected), identity


def run_identity(fields: dict[str, str]) -> dict[str, str]:
    """The identity every report must carry. 'local' when run outside CI."""
    return {field: os.environ.get(var, "local") for field, var in fields.items()}


def rejection(stem: str, data: Any, identity: dict[str, str]
              ) -> dict[str, Any] | None:
    """Why this report is not admissible evidence for this run, or None."""
    def no(reason: str, expected: Any = None, found: Any = None) -> dict[str, Any]:
        return {"gate": stem, "reason": reason, "expected": expected, "found": found}

    if not isinstance(data, dict):
        return no("report is not a JSON object", "object", type(data).__name__)
    report = cast("dict[str, Any]", data)

    version = report.get("schema_version")
    if not isinstance(version, str) or version.split(".")[0] != SCHEMA_MAJOR:
        return no("schema_version is missing or not a major version this "
                  "finalizer understands", f"{SCHEMA_MAJOR}.x", version)

    required = ("schema_version", "gate", "status", *identity)
    missing = [f for f in required if f not in report]
    if missing:
        return no("report omits identity fields, so it cannot be shown to "
                  "belong to this run", required, f"missing {missing}")

    if report["gate"] != stem:
        return no("report claims a different gate than its filename",
                  stem, report["gate"])

    for field in identity:
        want, found = identity[field], report[field]
        if str(found) != str(want):
            return no(f"{field} belongs to another run", want, found)
    return None


def discover(root: Path) -> list[Path]:
    """Every candidate report under `root`, at any depth.

    download-artifact drops each artifact into its own directory, so the
    finalizer sees evidence/reports-<gate>/<gate>.json. Searching recursively
    means one code path reads a local ./reports and a CI evidence tree.
    """
    if not root.is_dir():
        return []
    return sorted(p for p in root.rglob("*.json") if p.name != MANIFEST_NAME)


def load_reports(root: Path, identity: dict[str, str]) -> tuple[
        dict[str, dict[str, Any]], list[dict[str, Any]], dict[str, list[str]]]:
    """(admissible reports, rejected ones, gate -> every path claiming it).

    Keyed by filename stem, never by the report's own `gate` field: keying by
    the field let one forged file silently overwrite another gate's entry. The
    third value is what makes duplicates visible instead of letting whichever
    file was read last win.
    """
    out: dict[str, dict[str, Any]] = {}
    rejected: list[dict[str, Any]] = []
    seen: dict[str, list[str]] = {}
    for p in discover(root):
        seen.setdefault(p.stem, []).append(str(p))
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
        out[p.stem] = cast("dict[str, Any]", data)
    return out, rejected, seen


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--evidence-root", default=str(REPORTS),
                    help="directory searched recursively for gate reports")
    ns = ap.parse_args()
    root = Path(ns.evidence_root)

    expected, identity_fields = topology(load_manifest())
    identity = run_identity(identity_fields)
    found, rejected, seen = load_reports(root, identity)

    rejected_by = {str(r["gate"]): r for r in rejected}
    duplicates = {g: paths for g, paths in seen.items() if len(paths) > 1}
    unexpected = sorted((set(found) | set(rejected_by)) - set(expected))

    gates: dict[str, dict[str, Any]] = {}
    for name in sorted(set(expected) | set(found) | set(rejected_by)):
        entry: dict[str, Any] = {"status": "UNKNOWN", "duration_ms": None,
                                 "evidence": None}
        if name in duplicates:
            # Two authoritative answers for one gate is not redundancy. Refuse
            # to choose; a re-run that left both attempts behind lands here.
            entry["note"] = (f"{len(duplicates[name])} conflicting reports claim "
                             f"this gate: {', '.join(duplicates[name])}")
            gates[name] = entry
            continue
        if name in unexpected:
            entry["note"] = ("evidence for a gate ci/gates.toml does not "
                             "declare; it verifies nothing and cannot stand in "
                             "for a gate that is expected")
            gates[name] = entry
            continue
        bad = rejected_by.get(name)
        if bad is not None:
            entry["note"] = (f"report rejected — {bad['reason']} "
                             f"(expected {bad['expected']!r}, found {bad['found']!r})")
            gates[name] = entry
            continue
        r = found.get(name)
        if r is None:
            # Absence is never success. The job may well be green: a step
            # conditioned away, an upload that failed, an exit 0 after a crash.
            entry["note"] = ("no report produced — the gate did not run, "
                             "crashed before writing, or its artifact never "
                             "arrived")
            gates[name] = entry
            continue
        gates[name] = {
            "status": r.get("status", "UNKNOWN"),
            "duration_ms": r.get("duration_ms"),
            "checks_passed": r.get("checks_passed"),
            "checks_failed": r.get("checks_failed"),
            "scope": r.get("scope", {}),
            "failures": r.get("failures", []),
            "evidence": seen[name][0],
        }

    blocking = [n for n, g in gates.items() if g["status"] not in MERGEABLE]
    overall = "PASS" if not blocking else "FAIL"

    durations = [g["duration_ms"] for g in gates.values() if g.get("duration_ms")]
    out = {
        "overall": overall,
        "mergeable": overall == "PASS",
        "evidence_root": str(root),
        "repository": os.environ.get("GITHUB_REPOSITORY", "local"),
        "ref": os.environ.get("GITHUB_REF", "local"),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "run_identity": identity,
        "gates_expected": expected,
        "gates_reported": sorted(found),
        "gates_missing": sorted(set(expected) - set(found)),
        "gates_rejected": sorted(rejected_by),
        "gates_unexpected": unexpected,
        "gates_duplicated": sorted(duplicates),
        "duplicates": duplicates,
        "rejected": rejected,
        "blocking": blocking,
        "total_gate_ms": sum(durations),
        "slowest_gate_ms": max(durations) if durations else 0,
        "gates": gates,
    }

    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / MANIFEST_NAME).write_text(json.dumps(out, indent=2),
                                         encoding="utf-8")

    icon = "✅" if overall == "PASS" else "❌"
    lines = [f"## {icon} Gate manifest — {overall}", "",
             f"commit `{str(identity.get('commit', 'local'))[:12]}` · "
             f"run `{identity.get('run_id', 'local')}` · "
             f"attempt `{identity.get('run_attempt', 'local')}`", "",
             "| Gate | Result | Duration | Evidence |", "|---|---|---|---|"]
    print(f"\n{'=' * 72}\n[GATE MANIFEST] overall={overall}  "
          f"mergeable={out['mergeable']}\n{'=' * 72}")
    print("  run identity: " + "  ".join(f"{k}={v}" for k, v in identity.items()))
    print(f"  evidence root: {root}  ({len(discover(root))} report file(s))")
    print(f"  expected {len(expected)} gate(s), admissible reports {len(found)}")
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

    print(f"\n  evidence: reports/{MANIFEST_NAME}")

    # The blockers-first view, printed last so it is what a reader lands on
    # when the log opens at the end. It renders `out`, which is already
    # decided and already written to disk above -- it computes no status and
    # cannot change `overall`. A crash in rendering must not turn a FAIL into
    # a PASS, so it is caught and reported rather than allowed to propagate:
    # the return below is the verdict either way.
    try:
        blocker_report.emit(out, MERGEABLE)
    except Exception as exc:  # noqa: BLE001 - rendering must never decide
        print(f"\n  [blocker report unavailable: {exc!r}] "
              f"the verdict above stands; see reports/{MANIFEST_NAME}")

    return 0 if overall == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
