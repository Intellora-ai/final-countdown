#!/usr/bin/env python3
"""GATE INTEGRITY — the guard on the guard.

The audit found one hole with no coverage: delete the `AXLE proofs` step from
axle-verify.yml and the job still runs, still exits 0, still posts
`axle-verify: success`. The ruleset sees a green required check. The gate is
gone and nothing notices.

This asserts the verification system is still intact BEFORE any gate runs:

  1. every declared gate's workflow file exists
  2. every gate's command still appears in that workflow
  3. every script a workflow invokes exists on disk
  4. no `continue-on-error` on a mandatory job
  5. no failure suppression (`|| true`, `|| echo`) on a gate command
  6. every job id required by the ruleset still exists in some workflow
  7. every gate job uploads its evidence

The expected shape lives in ci/gates.toml, which is version controlled. Changing
what a gate does now requires changing the manifest too, and that shows up in
the diff.
"""

from __future__ import annotations

import re
import sys
import tomllib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gate import Gate  # noqa: E402
from typing import Any

MANIFEST = Path("ci/gates.toml")
WORKFLOWS = Path(".github/workflows")
SUPPRESSION = re.compile(r"\|\|\s*(true|echo|:)")


def load_manifest() -> dict[str, Any]:
    return tomllib.loads(MANIFEST.read_text(encoding="utf-8"))


def main() -> None:
    tools = {"python": [sys.executable, "--version"]}
    with Gate("gate-integrity", version="1.0.0", tools=tools) as g:
        if not MANIFEST.is_file():
            g.infrastructure_failure(f"{MANIFEST} missing — cannot verify integrity")
            return

        manifest = load_manifest()
        gates: dict[str, dict[str, Any]] = manifest.get("gates", {})
        g.set_scope(manifest=str(MANIFEST), gates_declared=len(gates),
                    workflows_on_disk=len(list(WORKFLOWS.glob("*.yml"))))

        ok = True
        job_ids_seen: set[str] = set()

        for name, spec in gates.items():
            wf = WORKFLOWS / str(spec["workflow"])
            job = str(spec["job"])
            job_ids_seen.add(job)

            if not wf.is_file():
                ok = False
                g.check(f"{name}: workflow exists", False, str(wf))
                g.fail(what=f"gate '{name}' lost its workflow", where=str(wf),
                       requirement="Every declared gate must have a workflow file.",
                       fix=f"Restore {wf} or remove the gate from {MANIFEST}.")
                continue
            text = wf.read_text(encoding="utf-8")
            g.check(f"{name}: workflow exists", True, str(wf))

            # 2. the gate's command is still present
            must: list[str] = list(spec.get("must_contain", []))
            for cmd in must:
                present = str(cmd) in text
                g.check(f"{name}: command present", present, str(cmd))
                if not present:
                    ok = False
                    g.fail(what=f"gate '{name}' no longer runs its command",
                           where=str(wf), why=f"missing: {cmd}",
                           requirement="A required check must still execute its verifier. "
                                       "Removing the step leaves the check green and the gate gone.",
                           fix=f"Restore `{cmd}` in {wf}, or remove the gate from {MANIFEST} "
                               "and from the ruleset together.")

            # 3. job id still declared
            job_pattern = "".join(["^", " " * 2, re.escape(job), ":"])
            has_job = re.search(job_pattern, text, re.MULTILINE) is not None
            g.check(f"{name}: job '{job}' declared", has_job, str(wf))
            if not has_job:
                ok = False
                g.fail(what=f"job '{job}' renamed or removed", where=str(wf),
                       requirement="The ruleset requires this exact job id as a check context. "
                                   "A rename makes the required check permanently pending.",
                       fix=f"Restore job id `{job}` or update the ruleset and {MANIFEST}.")

            # 4. no continue-on-error
            no_coe = "continue-on-error" not in text
            g.check(f"{name}: no continue-on-error", no_coe, str(wf))
            if not no_coe:
                ok = False
                g.fail(what=f"continue-on-error present in '{name}'", where=str(wf),
                       requirement="A mandatory gate must propagate failure.",
                       fix="Remove continue-on-error.")

            # 5. no failure suppression on the gate command itself
            for line in text.splitlines():
                if SUPPRESSION.search(line) and any(str(c) in line for c in must):
                    ok = False
                    g.check(f"{name}: no suppression", False, line.strip()[:70])
                    g.fail(what=f"failure suppressed in '{name}'", where=str(wf),
                           why=line.strip()[:120],
                           requirement="Never convert a gate failure into success.",
                           fix="Remove `|| true` / `|| echo` from the gate command.")

            # 6. evidence is uploaded
            uploads = "upload-artifact" in text
            g.check(f"{name}: uploads evidence", uploads, str(wf))
            if not uploads:
                ok = False
                g.fail(what=f"gate '{name}' preserves no evidence", where=str(wf),
                       requirement="Reports must survive the run, especially on failure.",
                       fix="Add actions/upload-artifact with `if: always()`.")

        # 7. every script referenced by any workflow exists
        for wf in sorted(WORKFLOWS.glob("*.yml")):
            for script in re.findall(r"scripts/[\w./-]+\.(?:py|sh)", wf.read_text(encoding="utf-8")):
                exists = Path(script).is_file()
                if not exists:
                    ok = False
                    g.check(f"{wf.name}: {script}", False, "missing")
                    g.fail(what=f"workflow calls a script that does not exist",
                           where=f"{wf.name} -> {script}",
                           requirement="Every invoked verifier must exist.",
                           fix=f"Restore {script} or remove the step.")

        ruleset: dict[str, Any] = manifest.get("ruleset", {})
        required: list[str] = list(ruleset.get("required_checks", []))
        for ctx in required:
            known = ctx in job_ids_seen
            g.check(f"ruleset requires '{ctx}' and it exists", known)
            if not known:
                ok = False
                g.fail(what=f"ruleset requires '{ctx}' but no gate declares it",
                       requirement="Required checks must map to real jobs, or merges hang forever.",
                       fix=f"Add the gate to {MANIFEST} or drop '{ctx}' from the ruleset.")

        g.artifact("reports/gate-integrity.json")
        g.passed() if ok else g.failed()


if __name__ == "__main__":
    main()
