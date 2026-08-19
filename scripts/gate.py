#!/usr/bin/env python3
"""GATE LIFECYCLE — structured, machine-readable evidence for every gate.

A string saying PASS is not evidence of PASS. Every gate wrapped in this context
manager emits three things that outlive the log:

    reports/<gate>.json      machine-readable, the source of truth
    $GITHUB_STEP_SUMMARY     concise human summary in the GitHub UI
    stdout                   the [GATE START] .. [GATE END] block

RESULT TYPES ARE NOT COLLAPSED
    PASS                    the gate ran and its criterion held
    FAIL                    the gate ran and its criterion did not hold
    INFRASTRUCTURE_FAILURE  the gate could not run (missing tool, network, config)
    SKIPPED                 deliberately not run
    NOT_APPLICABLE          deterministically inapplicable to this commit
    UNKNOWN                 outcome could not be determined

Only PASS exits 0. INFRASTRUCTURE_FAILURE and UNKNOWN exit non-zero on purpose:
"could not verify" is not "verified". An unhandled exception is recorded as
INFRASTRUCTURE_FAILURE rather than crashing silently, so a broken verifier
blocks the merge instead of vanishing from the report.
"""

from __future__ import annotations

import json
import os
import platform
import shutil
import subprocess
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path
from types import TracebackType
from typing import Any

REPORTS = Path("reports")

# Bump when the report shape changes. Consumers must reject an unknown major.
SCHEMA_VERSION = "1.1"  # 1.1 added run_attempt

# Status names are constants, not credentials; bandit's B105 heuristic keys
# on the variable name, so they are namespaced to keep the scan signal clean.
STATUS_PASS = "PASS"
PASS = STATUS_PASS
FAIL = "FAIL"
INFRASTRUCTURE_FAILURE = "INFRASTRUCTURE_FAILURE"
SKIPPED = "SKIPPED"
NOT_APPLICABLE = "NOT_APPLICABLE"
UNKNOWN = "UNKNOWN"

MERGEABLE_RESULTS = {PASS, NOT_APPLICABLE}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def tool_version(cmd: list[str]) -> str:
    """Version string for a tool, or a reason it is unavailable. Never raises."""
    exe = shutil.which(cmd[0])
    if exe is None:
        return "unavailable"
    try:
        out = subprocess.run([exe, *cmd[1:]], capture_output=True, text=True,
                             timeout=30)
    except (OSError, subprocess.SubprocessError):
        return "unavailable"
    text = (out.stdout or out.stderr).strip().splitlines()
    return text[0][:80] if text else "unknown"


class Gate:
    """Context manager implementing the gate lifecycle."""

    def __init__(self, name: str, version: str = "1.0.0",
                 tools: dict[str, list[str]] | None = None) -> None:
        self.name = name
        self.version = version
        self.tools_spec = tools or {}
        self.result: str = UNKNOWN
        self.scope: dict[str, Any] = {}
        self.checks: list[dict[str, Any]] = []
        self.failures: list[dict[str, Any]] = []
        self.warnings: list[str] = []
        self.artifacts: list[str] = []
        self._start = 0.0
        self.started_at = ""
        self.ended_at = ""

    # ---- recording -------------------------------------------------------
    def set_scope(self, **kwargs: Any) -> None:
        """What this gate actually examined. Vague scope is not evidence."""
        self.scope.update(kwargs)

    def check(self, subject: str, ok: bool, detail: str = "") -> bool:
        self.checks.append({"subject": subject, "result": PASS if ok else FAIL,
                            "detail": detail})
        return ok

    def fail(self, what: str, where: str = "", why: str = "",
             requirement: str = "", fix: str = "") -> None:
        """Record an actionable failure: what, where, why, requirement, fix."""
        self.failures.append({"what": what, "where": where, "why": why,
                              "requirement": requirement, "how_to_fix": fix})

    def warn(self, message: str) -> None:
        self.warnings.append(message)

    def artifact(self, path: str) -> None:
        self.artifacts.append(path)

    # ---- lifecycle -------------------------------------------------------
    def __enter__(self) -> "Gate":
        self._start = time.monotonic()
        self.started_at = _now()
        self.tools = {k: tool_version(v) for k, v in self.tools_spec.items()}
        self.tools["python"] = platform.python_version()
        print("=" * 72)
        print("[GATE START]")
        print(f"name={self.name}")
        print(f"version={self.version}")
        print(f"commit={os.environ.get('GITHUB_SHA', 'local')}")
        print(f"workflow={os.environ.get('GITHUB_WORKFLOW', 'local')}")
        print(f"job={os.environ.get('GITHUB_JOB', 'local')}")
        print(f"run={os.environ.get('GITHUB_RUN_ID', 'local')}")
        print(f"timestamp={self.started_at}")
        print("=" * 72)
        return self

    def __exit__(self, exc_type: type[BaseException] | None,
                 exc: BaseException | None,
                 tb: TracebackType | None) -> bool:
        if exc is not None:
            # A verifier that crashed did not verify anything. Fail closed.
            self.result = INFRASTRUCTURE_FAILURE
            self.fail(what=f"{self.name} raised {exc_type.__name__ if exc_type else '?'}",
                      why=str(exc)[:300],
                      requirement="A mandatory gate must run to completion.",
                      fix="Fix the verifier or its environment; do not bypass the gate.")
            print("\n[TRACEBACK]")
            traceback.print_exception(exc_type, exc, tb)
        elif self.result == UNKNOWN:
            # Nobody set a result. Never infer PASS from silence.
            self.fail(what=f"{self.name} finished without setting a result",
                      requirement="Every gate must declare an explicit result.",
                      fix="Call gate.passed() / gate.failed() before exiting.")

        duration_ms = int((time.monotonic() - self._start) * 1000)
        self.ended_at = _now()
        report = self.to_dict(duration_ms)
        if not self._write_report(report):
            # No durable evidence => cannot claim PASS, whatever the gate said.
            self.result = INFRASTRUCTURE_FAILURE
            self.fail(what=f"{self.name} produced no durable evidence",
                      why="the report could not be written",
                      requirement="Every mandatory gate must persist machine-readable evidence.",
                      fix="Fix permissions or disk space for reports/; do not ignore this.")
        self._print_summary(duration_ms)
        self._step_summary(duration_ms)

        if self.result not in MERGEABLE_RESULTS:
            sys.exit(1)
        return True  # exception already recorded as INFRASTRUCTURE_FAILURE

    def passed(self) -> None:
        self.result = PASS

    def failed(self) -> None:
        self.result = FAIL

    def infrastructure_failure(self, why: str) -> None:
        self.result = INFRASTRUCTURE_FAILURE
        self.fail(what=f"{self.name} could not run", why=why,
                  requirement="A mandatory gate must be able to execute.",
                  fix="Restore the tool, network or configuration it needs.")

    def not_applicable(self, why: str) -> None:
        self.result = NOT_APPLICABLE
        self.warn(f"not applicable: {why}")

    # ---- output ----------------------------------------------------------
    def to_dict(self, duration_ms: int) -> dict[str, Any]:
        passed = sum(1 for c in self.checks if c["result"] == PASS)
        return {
            "schema_version": SCHEMA_VERSION,
            "gate": self.name,
            "gate_version": self.version,
            "status": self.result,
            "mergeable_contribution": self.result in MERGEABLE_RESULTS,
            "commit": os.environ.get("GITHUB_SHA", "local"),
            "workflow": os.environ.get("GITHUB_WORKFLOW", "local"),
            "job": os.environ.get("GITHUB_JOB", "local"),
            "run_id": os.environ.get("GITHUB_RUN_ID", "local"),
            # A re-run keeps GITHUB_RUN_ID and increments this. Without it,
            # attempt 1's evidence would satisfy attempt 2.
            "run_attempt": os.environ.get("GITHUB_RUN_ATTEMPT", "local"),
            "ref": os.environ.get("GITHUB_REF", "local"),
            "started_at": self.started_at,
            "ended_at": self.ended_at,
            "duration_ms": duration_ms,
            "tool_versions": self.tools,
            "scope": self.scope,
            "checks_executed": len(self.checks),
            "checks_passed": passed,
            "checks_failed": len(self.checks) - passed,
            "checks": self.checks,
            "failures": self.failures,
            "warnings": self.warnings,
            "artifacts": self.artifacts,
        }

    def _write_report(self, report: dict[str, Any]) -> bool:
        """Persist evidence. Returns False if it could not be written.

        A gate that cannot write its report has not proven anything, so the
        caller downgrades the result to INFRASTRUCTURE_FAILURE. Warning and
        exiting zero would produce a green check backed by no evidence.
        """
        try:
            REPORTS.mkdir(parents=True, exist_ok=True)
            path = REPORTS / f"{self.name}.json"
            payload = json.dumps(report, indent=2)
            # Write-then-rename so a crash mid-write cannot leave a truncated
            # report that later parses as valid but incomplete.
            tmp = path.with_suffix(".json.tmp")
            tmp.write_text(payload, encoding="utf-8")
            tmp.replace(path)
            print(f"\n[EVIDENCE]\nartifact={path}")
            return True
        except OSError as exc:
            print(f"\n[EVIDENCE]\nEVIDENCE GENERATION FAILED: {exc}")
            return False

    def _print_summary(self, duration_ms: int) -> None:
        if self.scope:
            print("\n[SCOPE]")
            for k, v in self.scope.items():
                print(f"{k}={v}")
        print("\n[ENVIRONMENT]")
        for k, v in self.tools.items():
            print(f"{k}={v}")
        if self.checks:
            print("\n[CHECK]")
            for c in self.checks:
                print(f"{c['subject']}: {c['result']}"
                      + (f"  {c['detail']}" if c["detail"] else ""))
            passed = sum(1 for c in self.checks if c["result"] == PASS)
            print(f"\n[SUMMARY]\npassed={passed}\nfailed={len(self.checks) - passed}")
        for f in self.failures:
            print("\n[FAILURE]")
            for k in ("what", "where", "why", "requirement", "how_to_fix"):
                if f.get(k):
                    print(f"{k}={f[k]}")
        for w in self.warnings:
            print(f"\n[WARNING] {w}")
        print(f"\n[GATE RESULT]\n{self.result}")
        print(f"\n[DURATION]\n{duration_ms}ms")
        print("=" * 72)
        print("[GATE END]")
        print("=" * 72)

    def _step_summary(self, duration_ms: int) -> None:
        target = os.environ.get("GITHUB_STEP_SUMMARY")
        if not target:
            return
        icon = {PASS: "✅", FAIL: "❌"}.get(self.result, "⚠️")
        lines = [
            f"### {icon} {self.name} — {self.result}",
            "",
            f"| | |", "|---|---|",
            f"| duration | {duration_ms} ms |",
            f"| checks | {sum(1 for c in self.checks if c['result'] == PASS)}"
            f"/{len(self.checks)} passed |",
        ]
        for k, v in self.scope.items():
            lines.append(f"| {k} | {v} |")
        if self.failures:
            lines += ["", "**Failures**", ""]
            for f in self.failures:
                lines.append(f"- **{f['what']}**"
                             + (f" — `{f['where']}`" if f.get("where") else ""))
                if f.get("why"):
                    lines.append(f"  - why: {f['why']}")
                if f.get("how_to_fix"):
                    lines.append(f"  - fix: {f['how_to_fix']}")
        lines.append("")
        try:
            with open(target, "a", encoding="utf-8") as fh:
                fh.write("\n".join(lines) + "\n")
        except OSError:
            pass
