#!/usr/bin/env python3
"""GATE INTEGRITY — the guard on the guard.

Asserts the verification system still matches ci/gates.toml BEFORE any result
from it is worth reading. Deleting a gate's step leaves the job green, the
required check green, and the gate gone; nothing else in the system notices.

WHY THIS PARSES YAML INSTEAD OF SEARCHING TEXT.
The previous version asked whether a workflow file CONTAINED the gate's
command. Containment is not execution. All of these contain it and none of
them run it:

    - run: python3 scripts/axle_gate.py
      if: false                        # never runs, job still green
    - run: echo python3 scripts/axle_gate.py
    - run: python3 scripts/axle_gate.py || true

So the structure is parsed, the gate's step is located as an object, and the
properties that decide whether it executes — and whether its failure survives
— are checked on that object. A conditioned-away step is now the same finding
as a deleted one, because it has the same consequence.

Checks, per mandatory gate:

  1. the workflow parses, and declares the job id the ruleset requires
  2. the job carries no `if:` unless ci/gates.toml declares one for it
  3. the job carries no continue-on-error
  4. a step actually invokes the gate's command
  5. that step carries no `if:` — a conditioned gate is a deleted gate
  6. that step carries no continue-on-error, and does not suppress failure
  7. the job uploads the gate's declared artifact, with `if: always()` and
     `if-no-files-found: error`, so evidence that never appears is loud

And across the repository:

  8. every scripts/… path any workflow invokes exists
  9. the manifest's required_checks equals its own mandatory gate set
 10. no doc tells anyone to run a verifier that no longer exists

Check 9 is self-consistency only. Proving the manifest matches the LIVE GitHub
ruleset needs an API call with admin access: scripts/check_ruleset.py.
"""

from __future__ import annotations

import re
import sys
import tomllib
from pathlib import Path
from typing import Any, cast

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gate import Gate  # noqa: E402

MANIFEST = Path("ci/gates.toml")
WORKFLOWS = Path(".github/workflows")
SUPPRESSION = re.compile(r"\|\|\s*(true|echo|:)")
DOCS = (Path("README.md"), Path("evidence.md"))


def steps_of(job: dict[str, Any]) -> list[dict[str, Any]]:
    raw = job.get("steps")
    if not isinstance(raw, list):
        return []
    steps = cast("list[Any]", raw)
    return [cast("dict[str, Any]", s) for s in steps if isinstance(s, dict)]


# Programs that may legitimately launch a gate. Anything else in command
# position is not an invocation — `echo python3 scripts/axle_gate.py` contains
# the command and runs nothing, which is the exact "containment is not
# execution" failure this checker exists to catch. An allowlist rather than a
# denylist of printers, because an unknown launcher must fail closed.
LAUNCHERS = {"python", "python3", "bash", "sh", "pytest", "pyright", "bandit",
             "coverage", "mutmut", "npm", "npx"}


def executes(run: str, token: str) -> bool:
    """Does `run` actually EXECUTE something containing `token`?

    Splits the script into command segments and requires the segment holding
    the token to begin with the token itself or with a known launcher.
    Comment lines are skipped: a comment naming a script is documentation, not
    an invocation, and treating it as one would let a comment satisfy a gate.
    """
    for line in run.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if token not in line:
            continue
        for sep in ("&&", "||", ";", "|"):
            line = line.replace(sep, "\n")
        for segment in line.split("\n"):
            if token not in segment:
                continue
            words = segment.strip().split()
            if not words:
                continue
            head = words[0]
            # `VAR=x cmd ...` — step past leading environment assignments.
            i = 0
            while i < len(words) and "=" in words[i] and not words[i].startswith("-"):
                i += 1
            head = words[i] if i < len(words) else head
            if head == token or token in head or head in LAUNCHERS:
                return True
    return False


def step_text(step: dict[str, Any]) -> str:
    """What a step EXECUTES: its `run` script and the action it `uses`.

    `with:` is deliberately excluded. It holds parameters, not commands, and
    including it made an artifact named `reports-pyright` look like an
    invocation of `pyright` — so the upload step was mistaken for the gate step
    and its legitimate `if: always()` was reported as a conditioned-away gate.
    """
    return f"{step.get('run', '')}\n{step.get('uses', '')}"


def main() -> None:
    with Gate("preflight", version="2.0.0") as g:
        if not MANIFEST.is_file():
            g.infrastructure_failure(f"{MANIFEST} missing — cannot verify integrity")
            return

        manifest = tomllib.loads(MANIFEST.read_text(encoding="utf-8"))
        gates: dict[str, dict[str, Any]] = manifest.get("gates", {})
        mandatory = {n: s for n, s in gates.items() if s.get("mandatory")}
        g.set_scope(manifest=str(MANIFEST), gates_declared=len(gates),
                    mandatory=len(mandatory),
                    workflows_on_disk=len(list(WORKFLOWS.glob("*.yml"))))

        ok = True
        parsed: dict[str, dict[str, Any]] = {}

        for name, spec in mandatory.items():
            wf = WORKFLOWS / str(spec["workflow"])
            job_id = str(spec["job"])

            if not wf.is_file():
                ok = False
                g.check(f"{name}: workflow exists", False, str(wf))
                g.fail(what=f"gate '{name}' lost its workflow", where=str(wf),
                       requirement="Every declared gate must have a workflow file.",
                       fix=f"Restore {wf} or remove the gate from {MANIFEST} "
                           "and the ruleset together.")
                continue

            # A code-scanning results check has no job: GitHub's app posts it
            # after the analysis workflow publishes. Assert the workflow that
            # produces those results exists; its jobs and steps are checked by
            # the scanner gates that name them.
            if str(spec.get("role", "")) == "code-scanning":
                g.check(f"{name}: producing workflow exists", True, str(wf))
                continue

            if str(wf) not in parsed:
                try:
                    loaded = yaml.safe_load(wf.read_text(encoding="utf-8"))
                except yaml.YAMLError as exc:
                    ok = False
                    g.check(f"{wf.name}: parses", False, str(exc)[:80])
                    g.fail(what=f"{wf.name} is not valid YAML", where=str(wf),
                           why=str(exc)[:200],
                           requirement="A workflow that does not parse runs no gates.",
                           fix="Fix the YAML syntax.")
                    continue
                parsed[str(wf)] = cast("dict[str, Any]", loaded or {})
            doc = parsed[str(wf)]

            jobs = doc.get("jobs")
            jobs_map = cast("dict[str, Any]", jobs) if isinstance(jobs, dict) else {}
            job_obj = jobs_map.get(job_id)
            has_job = isinstance(job_obj, dict)
            g.check(f"{name}: job '{job_id}' declared", has_job, str(wf))
            if not has_job:
                ok = False
                g.fail(what=f"job '{job_id}' renamed or removed", where=str(wf),
                       requirement="The ruleset requires this exact job id as a "
                                   "check context. A rename makes the required "
                                   "check permanently pending, not failing.",
                       fix=f"Restore job id `{job_id}` or update the ruleset "
                           f"and {MANIFEST} together.")
                continue
            job = cast("dict[str, Any]", job_obj)

            # 2. job-level condition, only where the manifest declares one
            allowed_if = spec.get("job_if")
            job_if = job.get("if")
            if_ok = (job_if is None) or (str(job_if).strip() == str(allowed_if).strip())
            g.check(f"{name}: job condition", if_ok,
                    f"if: {job_if}" if job_if else "unconditional")
            if not if_ok:
                ok = False
                g.fail(what=f"job '{job_id}' runs conditionally", where=str(wf),
                       why=f"if: {job_if}",
                       requirement="A mandatory job must run every time, unless "
                                   f"{MANIFEST} declares the condition.",
                       fix=f"Remove the condition, or declare job_if in {MANIFEST}.")

            # 3. job-level continue-on-error
            if job.get("continue-on-error"):
                ok = False
                g.check(f"{name}: job propagates failure", False, "continue-on-error")
                g.fail(what=f"continue-on-error on job '{job_id}'", where=str(wf),
                       requirement="A mandatory gate must propagate failure.",
                       fix="Remove continue-on-error.")

            steps = steps_of(job)

            # 4-6. the step that actually invokes the gate
            for token in [str(c) for c in spec.get("must_contain", [])]:
                # `uses:` is an action reference — the token IS what runs.
                # `run:` needs the stronger test: present is not executed.
                carriers = [s for s in steps
                            if token in str(s.get("uses", ""))
                            or executes(str(s.get("run", "")), token)]
                g.check(f"{name}: invokes {token}", bool(carriers),
                        f"{len(carriers)} step(s)")
                if not carriers:
                    ok = False
                    g.fail(what=f"gate '{name}' no longer invokes its command",
                           where=str(wf), why=f"no step runs: {token}",
                           requirement="A required check must still execute its "
                                       "verifier. Removing the step leaves the "
                                       "check green and the gate gone.",
                           fix=f"Restore `{token}` in {wf}, or remove the gate "
                               f"from {MANIFEST} and the ruleset together.")
                    continue
                for step in carriers:
                    label = str(step.get("name", token))[:40]
                    if step.get("if") is not None:
                        ok = False
                        g.check(f"{name}: step unconditional", False,
                                f"{label}: if: {step['if']}")
                        g.fail(what=f"gate step in '{name}' runs conditionally",
                               where=f"{wf} -> {label}", why=f"if: {step['if']}",
                               requirement="A conditioned gate step is a deleted "
                                           "gate: the job still exits 0 and the "
                                           "required check still goes green.",
                               fix="Remove the `if:` from the gate step.")
                    if step.get("continue-on-error"):
                        ok = False
                        g.check(f"{name}: step propagates failure", False, label)
                        g.fail(what=f"continue-on-error on a gate step in '{name}'",
                               where=f"{wf} -> {label}",
                               requirement="Never convert a gate failure into success.",
                               fix="Remove continue-on-error.")
                    run = str(step.get("run", ""))
                    for line in run.splitlines():
                        if token in line and SUPPRESSION.search(line):
                            ok = False
                            g.check(f"{name}: no suppression", False, line.strip()[:70])
                            g.fail(what=f"failure suppressed in '{name}'",
                                   where=f"{wf} -> {label}", why=line.strip()[:120],
                                   requirement="Never convert a gate failure into "
                                               "success.",
                                   fix="Remove `|| true` / `|| echo` from the "
                                       "gate command.")

            # 7. evidence must be uploaded, and its absence must be loud.
            # A scanner is exempt from THIS check only: CodeQL's result is a
            # code-scanning analysis, not a file in reports/. Its job, its
            # invocation, its conditions and its failure propagation are all
            # still checked above, and the ruleset's code_scanning rule is what
            # reads the result.
            if str(spec.get("role", "")) == "scanner":
                g.check(f"{name}: publishes to code scanning", True,
                        str(spec.get("evidence", "")))
                continue
            artifact = str(spec.get("artifact", ""))
            uploads = [s for s in steps
                       if "upload-artifact" in str(s.get("uses", ""))
                       and str(cast("dict[str, Any]",
                                    s.get("with", {})).get("name", "")) == artifact]
            g.check(f"{name}: uploads {artifact}", bool(uploads))
            if not uploads:
                ok = False
                g.fail(what=f"gate '{name}' preserves no evidence", where=str(wf),
                       why=f"no upload-artifact step named {artifact!r}",
                       requirement="Reports must survive the run and the log "
                                   "retention window, especially on failure.",
                       fix=f"Add actions/upload-artifact named {artifact} with "
                           "`if: always()` and `if-no-files-found: error`.")
            for step in uploads:
                with_ = cast("dict[str, Any]", step.get("with", {}))
                if str(step.get("if", "")).strip() != "always()":
                    ok = False
                    g.check(f"{name}: uploads on failure", False, str(step.get("if")))
                    g.fail(what=f"'{name}' only uploads evidence when it passes",
                           where=f"{wf} -> {artifact}",
                           requirement="Evidence matters most on failure.",
                           fix="Add `if: always()` to the upload step.")
                if str(with_.get("if-no-files-found", "")) != "error":
                    ok = False
                    g.check(f"{name}: missing evidence is loud", False,
                            str(with_.get("if-no-files-found")))
                    g.fail(what=f"'{name}' ignores a missing artifact",
                           where=f"{wf} -> {artifact}",
                           why="if-no-files-found is not 'error', so a gate that "
                               "produced no evidence uploads nothing and the job "
                               "stays green",
                           requirement="Artifact absence must be detectable.",
                           fix="Set `if-no-files-found: error`.")

        # 8. every script any workflow invokes exists
        for wf in sorted(WORKFLOWS.glob("*.yml")):
            for script in sorted(set(re.findall(r"scripts/[\w./-]+\.(?:py|sh)",
                                                wf.read_text(encoding="utf-8")))):
                if not Path(script).is_file():
                    ok = False
                    g.check(f"{wf.name}: {script}", False, "missing")
                    g.fail(what="workflow calls a script that does not exist",
                           where=f"{wf.name} -> {script}",
                           requirement="Every invoked verifier must exist.",
                           fix=f"Restore {script} or remove the step.")

        # 9. the manifest agrees with itself
        ruleset: dict[str, Any] = manifest.get("ruleset", {})
        required = {str(c) for c in ruleset.get("required_checks", [])}
        aligned = required == set(mandatory)
        g.check("required_checks == mandatory gates", aligned,
                f"{len(required)} required, {len(mandatory)} mandatory")
        if not aligned:
            ok = False
            for ctx in sorted(required - set(mandatory)):
                g.fail(what=f"ruleset requires '{ctx}' but no gate declares it",
                       requirement="Required checks must map to real jobs, or "
                                   "merges hang forever.",
                       fix=f"Add the gate to {MANIFEST} or drop '{ctx}'.")
            for name in sorted(set(mandatory) - required):
                g.fail(what=f"gate '{name}' is mandatory but not required",
                       why="it runs, it can go red, and nothing is blocked by it",
                       requirement="A mandatory gate that GitHub does not require "
                                   "blocks nothing.",
                       fix=f"Add '{name}' to required_checks in {MANIFEST} and to "
                           "the ruleset.")

        # 10. docs must not tell anyone to run a verifier that is gone.
        # Scoped to INVOCATIONS, not every mention: evidence.md legitimately
        # documents scripts that do NOT exist and says so, and flagging that
        # would punish honesty.
        for doc in DOCS:
            if not doc.is_file():
                continue
            for script in sorted(set(re.findall(
                    r"(?:python3?|bash|sh)\s+(scripts/[\w./-]+\.(?:py|sh))",
                    doc.read_text(encoding="utf-8")))):
                if not Path(script).is_file():
                    ok = False
                    g.check(f"{doc}: {script}", False, "missing")
                    g.fail(what="documentation names a script that does not exist",
                           where=f"{doc} -> {script}",
                           why="the doc describes a verifier the repo no longer has",
                           requirement="Docs must not describe a verification "
                                       "system that is not the one running.",
                           fix=f"Update {doc}, or restore {script}.")

        g.artifact("reports/preflight.json")
        g.passed() if ok else g.failed()


if __name__ == "__main__":
    main()
