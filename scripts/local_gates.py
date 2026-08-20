#!/usr/bin/env python3
"""LOCAL GATES — run the required checks that can honestly run here, and name the ones that cannot.

WHY THIS EXISTS. On 2026-08-20 four consecutive CI runs went red. The first was `pyright`, one of
the seventeen required contexts, simply absent from the set of checks run before pushing. Nothing in
this repository answered "run what CI runs", so that set was assembled from memory, and memory
dropped one. This script answers it from `ci/local-execution.toml` instead.

WHAT IT WILL NOT DO. It will not claim a GitHub-only context passed. `CodeQL`, `e2e`, `axle-verify`,
`correspondence`, `preflight`, `bandit`, `full` and the two CodeQL jobs cannot run offline from this
repository's lockfiles, each for a reason recorded in the manifest. They are printed as
NOT_RUN_LOCALLY, before any gate executes, so that a first-gate failure can never suppress the list.
A local pass is a partial result and says so.

EXECUTION RULES, ALL LOAD-BEARING. Commands are argv arrays taken from the manifest and never
shell strings; `shell=False` always; argv[0] is resolved through `shutil.which` so PATH cannot
decide which binary runs; every call carries an explicit timeout and an explicit working directory;
and every result records argv, exit code, duration, output and evidence path. A gate that fails
makes this process exit non-zero. A gate whose result is unknown is not a gate that passed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import tomllib
from pathlib import Path
from typing import Any, cast

REPO_ROOT = Path(__file__).resolve().parent.parent
MANIFEST = REPO_ROOT / "ci" / "local-execution.toml"
EVIDENCE_ROOT = REPO_ROOT / ".evidence"

#: The context whose omission caused the failure this tool exists to prevent. If it is
#: ever missing, marked "no", left without a command, or dropped from the fast tier,
#: `make sandbox-fast` must FAIL rather than quietly run a smaller set.
PYRIGHT = "pyright"


class ManifestError(Exception):
    """The manifest cannot be trusted. Refuse rather than run a partial set."""


def load_manifest(path: Path = MANIFEST) -> dict[str, dict[str, Any]]:
    if not path.is_file():
        raise ManifestError(
            f"{path} is missing; local gate selection has no source of truth"
        )
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    contexts = cast("dict[str, dict[str, Any]]", data.get("contexts") or {})
    if not contexts:
        raise ManifestError(f"{path} declares no contexts")

    for name, spec in contexts.items():
        runnable = spec.get("locally_runnable")
        if runnable not in {"yes", "no"}:
            raise ManifestError(
                f"{name}: locally_runnable is {runnable!r}; only 'yes' or 'no' are permitted. "
                "There is no partial state -- a check either has an exact command or an exact "
                "reason it cannot run here."
            )
        if runnable == "yes":
            command = spec.get("command")
            if not isinstance(command, list) or not command:
                raise ManifestError(
                    f"{name}: locally_runnable=yes with no command array"
                )
            if not all(isinstance(tok, str) for tok in cast("list[Any]", command)):
                raise ManifestError(f"{name}: command must be an argv array of strings")
            if not isinstance(spec.get("timeout_seconds"), int):
                raise ManifestError(
                    f"{name}: locally_runnable=yes with no integer timeout_seconds"
                )
        elif not str(spec.get("reason", "")).strip():
            raise ManifestError(f"{name}: locally_runnable=no with no reason")

        # A network flag with no stated reason is a switch nobody can audit. The
        # exclusion it triggers removes a required check from every default run, so
        # the file that triggers it has to say what the network is for.
        if requires_network(spec) and not str(spec.get("network_reason", "")).strip():
            raise ManifestError(
                f"{name}: requires_network is set with no network_reason. The flag "
                "removes this check from both default tiers; that decision must carry "
                "its reason in the manifest, not in someone's memory."
            )

    pyright = contexts.get(PYRIGHT)
    if (
        pyright is None
        or pyright.get("locally_runnable") != "yes"
        or not pyright.get("in_fast")
    ):
        raise ManifestError(
            "pyright must be locally_runnable=yes and in_fast=true. It is the check whose omission "
            "produced the failure this tool exists to prevent, so it may not be optional here."
        )
    return contexts


def load_local_checks(path: Path = MANIFEST) -> dict[str, dict[str, Any]]:
    """The `[local_checks]` table: regression and quality checks that are NOT GitHub contexts.

    Kept in its own table and its own loader because the two namespaces must never
    merge. `[contexts.*]` is exactly the seventeen required GitHub contexts, and
    test_no_context_is_invented enforces that. A local check that could occupy a
    required context's name would print a line indistinguishable from the check
    GitHub actually enforces -- the false reassurance this manifest exists to remove.
    """
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    checks = cast("dict[str, dict[str, Any]]", data.get("local_checks") or {})
    contexts = cast("dict[str, dict[str, Any]]", data.get("contexts") or {})

    collisions = sorted(set(checks) & set(contexts))
    if collisions:
        raise ManifestError(
            f"local check(s) {collisions} share a name with a required GitHub context. "
            "A local check may not borrow a required context's identity: a local pass "
            "would then be indistinguishable from the check GitHub enforces."
        )

    for name, spec in checks.items():
        if not str(spec.get("requirement", "")).strip():
            raise ManifestError(
                f"local check {name}: no requirement. A check that cannot say which "
                "escape or rule it proves is a command, not a check."
            )
        command = spec.get("command")
        if not isinstance(command, list) or not command:
            raise ManifestError(f"local check {name}: no command array")
        if not all(isinstance(tok, str) for tok in cast("list[Any]", command)):
            raise ManifestError(f"local check {name}: command must be argv strings")
        if not isinstance(spec.get("timeout_seconds"), int):
            raise ManifestError(f"local check {name}: no integer timeout_seconds")
        if not spec.get("evidence"):
            raise ManifestError(f"local check {name}: no evidence identifier")
        if spec.get("tier") not in {"fast", "full"}:
            raise ManifestError(
                f"local check {name}: tier is {spec.get('tier')!r}; only 'fast' or 'full'"
            )
        if not str(spec.get("tier_reason", "")).strip():
            raise ManifestError(
                f"local check {name}: no tier_reason. Tier membership is a decision and "
                "has to be defensible in the file that makes it."
            )
    return checks


def requires_network(spec: dict[str, Any]) -> bool:
    return bool(spec.get("requires_network"))


def load_deep_checks(path: Path = MANIFEST) -> dict[str, dict[str, Any]]:
    """The `[deep_checks]` table — the deep verification lane (Milestone 5).

    A third table for the same reason `[local_checks]` got the second one:
    `[contexts.*]` is exactly the seventeen required GitHub contexts, and a deep check
    must never be able to look like one. Namespaces are proven disjoint at load time
    rather than left to convention.
    """
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    checks = cast("dict[str, dict[str, Any]]", data.get("deep_checks") or {})
    contexts = cast("dict[str, dict[str, Any]]", data.get("contexts") or {})
    local = cast("dict[str, dict[str, Any]]", data.get("local_checks") or {})

    collisions = sorted(set(checks) & (set(contexts) | set(local)))
    if collisions:
        raise ManifestError(
            f"deep check(s) {collisions} share a name with a required GitHub context or "
            "a local check. A deep check may not borrow another lane's identity."
        )

    for name, spec in checks.items():
        if not str(spec.get("category", "")).strip():
            raise ManifestError(f"deep check {name}: no category")
        if not str(spec.get("requirement", "")).strip():
            raise ManifestError(
                f"deep check {name}: no requirement. A check that cannot say what it "
                "proves is a command, not a check."
            )
        if not spec.get("evidence"):
            raise ManifestError(f"deep check {name}: no evidence identifier")
        if not isinstance(spec.get("timeout_seconds"), int):
            raise ManifestError(f"deep check {name}: no integer timeout_seconds")

        probes = spec.get("probes")
        command = spec.get("command")
        if probes is None and command is None:
            raise ManifestError(
                f"deep check {name}: neither a command nor probes. A category with "
                "nothing to run and nothing to prove absent is an empty claim."
            )
        if probes is not None and command is not None:
            raise ManifestError(
                f"deep check {name}: both a command and probes; one of the two is a lie "
                "about how this category is evaluated"
            )
        if probes is not None:
            rows = cast("list[Any]", probes)
            if not rows:
                raise ManifestError(
                    f"deep check {name}: an empty probe list proves nothing and would "
                    "report NOT_APPLICABLE vacuously"
                )
            for probe in rows:
                entry = cast("dict[str, Any]", probe)
                if not str(entry.get("name", "")).strip():
                    raise ManifestError(f"deep check {name}: a probe has no name")
                argv = entry.get("argv")
                if not isinstance(argv, list) or not argv:
                    raise ManifestError(f"deep check {name}: a probe has no argv")
        elif not isinstance(command, list) or not command:
            raise ManifestError(f"deep check {name}: command is not an argv array")
        if requires_network(spec) and not str(spec.get("network_reason", "")).strip():
            raise ManifestError(f"deep check {name}: requires_network with no reason")
    return checks


def run_probe(argv: list[str], timeout: int) -> dict[str, Any]:
    """One absence probe. Output means the thing exists; silence means it does not.

    The raw stdout is retained either way. A probe whose result is recorded only as a
    boolean cannot be re-checked by a reader, and "I ran a search and it was fine" is
    the kind of claim this repository replaces with the search's actual output.
    """
    env = dict(os.environ)
    env["PATH"] = f"{REPO_ROOT / '.venv' / 'bin'}{os.pathsep}{env.get('PATH', '')}"
    exe = shutil.which(argv[0], path=env["PATH"])
    if exe is None:
        return {
            "argv": argv,
            "exit_code": None,
            "stdout": "",
            "matched": False,
            "usable": False,
            "note": f"{argv[0]!r} is not on PATH, so this probe proved nothing",
        }
    try:
        out = subprocess.run(  # noqa: S603 - argv only, no shell
            [exe, *argv[1:]],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            timeout=timeout,
            stdin=subprocess.DEVNULL,
            shell=False,
            env=env,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {
            "argv": argv,
            "exit_code": None,
            "stdout": "",
            "matched": False,
            "usable": False,
            "note": f"no result within {timeout}s",
        }
    text = out.stdout.strip()
    return {
        "argv": argv,
        "exit_code": out.returncode,
        "stdout": text[:4000],
        "matched": bool(text),
        "usable": True,
    }


def run_absence_check(
    name: str, spec: dict[str, Any], evidence_dir: Path
) -> dict[str, Any]:
    """A category proven not to apply, or a category that turns out to apply after all.

    NOT_APPLICABLE is earned by every probe coming back empty AND usable. A probe that
    could not run does not count as evidence of absence -- that is UNKNOWN, because
    "the search did not work" and "the search found nothing" are different facts and
    only one of them supports the claim.
    """
    started = time.time()
    probes = [
        {**run_probe([str(t) for t in cast("list[Any]", p["argv"])], int(spec["timeout_seconds"])), "name": str(p["name"])}
        for p in cast("list[dict[str, Any]]", spec["probes"])
    ]
    found = [p for p in probes if p["matched"]]
    unusable = [p for p in probes if not p["usable"]]

    if found:
        status = "FAIL"
        what = f"{len(found)} probe(s) found a mechanism this check claims does not exist"
        why = "the NOT_APPLICABLE claim is false on this commit; see probe output"
        action = "INVESTIGATE — record what was found, then ask what evidence this category now needs"
    elif unusable:
        status = "UNKNOWN"
        what = f"{len(unusable)} probe(s) could not run"
        why = "UNKNOWN — a search that did not work is not a search that found nothing"
        action = "INVESTIGATE — make the probe runnable, then re-run"
    else:
        status = str(spec.get("expect", "NOT_APPLICABLE"))
        what = ""
        why = f"every probe returned no output; {len(probes)} searches, all empty"
        action = "NONE — the category has nothing to verify on this commit"

    record: dict[str, Any] = {
        "context": name,
        "category": str(spec["category"]),
        "requirement": str(spec["requirement"]),
        "status": status,
        "probes": probes,
        "start": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(started)),
        "end": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "duration_seconds": round(time.time() - started, 2),
        "observed_why": why,
        "next_safe_action": action,
    }
    if what:
        record["what_failed"] = what
    path = evidence_dir / f"{name}.json"
    path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    record["evidence_path"] = str(path)
    return record


#: `N passed`, `N failed`, `N skipped` in pytest's summary line. Parsed so the
#: integration record carries counts rather than a wall of output a reader has to
#: count by hand.
PYTEST_COUNT = re.compile(r"(\d+)\s+(passed|failed|skipped|error|errors)")


def pytest_counts(text: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for number, word in PYTEST_COUNT.findall(text):
        key = "errors" if word.startswith("error") else word
        counts[key] = counts.get(key, 0) + int(number)
    return counts


def github_only(contexts: dict[str, dict[str, Any]]) -> list[tuple[str, str]]:
    """Contexts the manifest says cannot run here at all.

    Deliberately unchanged in meaning and signature: existing callers and tests read
    it as "locally_runnable == no". Network-excluded contexts are a different case --
    they CAN run here -- and are reported by not_run_locally() instead.
    """
    return sorted(
        (n, str(s.get("reason", "")))
        for n, s in contexts.items()
        if s.get("locally_runnable") == "no"
    )


def not_run_locally(
    contexts: dict[str, dict[str, Any]], tier: str
) -> list[dict[str, str]]:
    """Every required context this run will NOT execute, with its category and reason.

    Two populations, and conflating them is what the categories exist to stop:

      locally_runnable = no    it cannot run here. Category says why -- a hosted
                               third party (EXTERNAL), the GitHub platform itself
                               (GITHUB_ONLY), or a local prerequisite nobody has
                               installed (LOCAL_PREREQUISITE_NOT_PROVISIONED). A
                               missing local browser is not a third-party service.

      requires_network = yes   it CAN run here and is excluded anyway, because a
                               default local loop that silently reaches the network
                               is not a local loop. Carries its opt-in command.
    COMPLETENESS, MEASURED. An earlier version listed only the contexts marked
    `locally_runnable = no`. On the fast tier that printed 8 while 13 of the 17
    required contexts had actually not been evaluated: the five runnable-but-not-in-
    this-tier ones vanished from the report entirely. Under-reporting what did not
    run is the same defect as claiming something passed, one step removed, so this
    is now derived as "every required context minus the ones this tier selected".
    The arithmetic is checkable: len(selected) + len(not_run) == len(contexts).
    """
    selected = set(select(contexts, tier))
    rows: list[dict[str, str]] = []
    for name, spec in sorted(contexts.items()):
        if name in selected:
            continue
        if spec.get("locally_runnable") == "no":
            category = str(spec.get("category", "UNCATEGORISED"))
            reason = str(spec.get("reason", ""))
            opt_in = ""
        elif requires_network(spec):
            category = "NETWORK_REQUIRED_EXCLUDED_FROM_DEFAULT"
            reason = str(
                spec.get("network_reason")
                or "requires the network; excluded from the default local loop"
            )
            opt_in = str(spec.get("opt_in_command", ""))
        else:
            category = "NOT_IN_THIS_TIER"
            reason = (
                f"runs locally but is not in the {tier} tier; "
                f"`make sandbox-test` selects it"
            )
            opt_in = "make sandbox-test"
        rows.append(
            {
                "context": name,
                "category": category,
                "reason": reason,
                "opt_in_command": opt_in,
            }
        )
    return rows


def select(contexts: dict[str, dict[str, Any]], tier: str) -> list[str]:
    """The contexts this tier executes.

    NETWORK EXCLUSION IS ENFORCED HERE, not annotated in the manifest. A flag that
    only documents a network call still lets the call happen; the selector is the
    single place every tier passes through, so it is the only place the exclusion
    cannot be forgotten. `requires_network = true` therefore removes a check from
    BOTH default tiers -- it is reported by not_run_locally() with its opt-in
    command instead.
    """
    runnable = [
        n
        for n, s in contexts.items()
        if s.get("locally_runnable") == "yes" and not requires_network(s)
    ]
    if tier == "fast":
        chosen = [n for n in runnable if contexts[n].get("in_fast")]
        if PYRIGHT not in chosen:  # belt and braces; load_manifest already checked
            raise ManifestError("the fast tier does not include pyright")
        return sorted(chosen)
    return sorted(runnable)


def select_local_checks(checks: dict[str, dict[str, Any]], tier: str) -> list[str]:
    """Local checks for this tier. `fast` is a subset of `full`, and network is excluded here too."""
    return sorted(
        n
        for n, s in checks.items()
        if not requires_network(s)
        and (s.get("tier") == "fast" or (tier == "full" and s.get("tier") == "full"))
    )


def run_one(name: str, spec: dict[str, Any], evidence_dir: Path) -> dict[str, Any]:
    """Execute one gate. Never with a shell, never without a timeout."""
    command = [str(tok) for tok in cast("list[Any]", spec["command"])]
    timeout = int(spec["timeout_seconds"])

    # THE SANDBOX IS THE VENV, SO THE VENV MUST WIN. The manifest carries the workflow's
    # own tokens -- `python3`, `pytest` -- and on this machine PATH resolves `python3` to
    # the system interpreter (3.14.7) rather than .venv/bin/python3. The first real run of
    # this tool failed in 90ms for exactly that reason: run_gate.py executed outside the
    # environment bootstrap had just built. Prepending .venv/bin makes the resolved binary
    # match the environment the lockfiles describe.
    env = dict(os.environ)
    env["PATH"] = f"{REPO_ROOT / '.venv' / 'bin'}{os.pathsep}{env.get('PATH', '')}"
    exe = shutil.which(command[0], path=env["PATH"])
    started = time.time()
    record: dict[str, Any] = {
        "context": name,
        "argv": command,
        "working_directory": str(REPO_ROOT),
        "timeout_seconds": timeout,
        "start": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(started)),
    }

    if exe is None:
        record.update(
            status="BLOCK",
            exit_code=None,
            duration_seconds=0.0,
            what_failed=f"{command[0]!r} is not on PATH",
            observed_why="UNKNOWN — the interpreter or tool was not found",
            next_safe_action="INVESTIGATE — run `make doctor` and install the tool",
        )
    else:
        try:
            out = subprocess.run(  # noqa: S603 - argv only, no shell
                [exe, *command[1:]],
                cwd=str(REPO_ROOT),
                capture_output=True,
                text=True,
                timeout=timeout,
                stdin=subprocess.DEVNULL,
                shell=False,
                env=env,
            )
            record.update(
                status="PASS" if out.returncode == 0 else "FAIL",
                exit_code=out.returncode,
                stdout_tail=out.stdout[-4000:],
                stderr_tail=out.stderr[-4000:],
            )
            if out.returncode != 0:
                record.update(
                    what_failed=" ".join(command),
                    where=f"{REPO_ROOT} (exit {out.returncode})",
                    observed_why="UNKNOWN — the command exited non-zero; the log below is the "
                    "only proven evidence",
                    next_safe_action="INVESTIGATE — read the captured output, then re-run this "
                    "single command",
                )
        except subprocess.TimeoutExpired:
            record.update(
                status="BLOCK",
                exit_code=None,
                what_failed=" ".join(command),
                observed_why=f"UNKNOWN — no result within {timeout}s",
                next_safe_action="INVESTIGATE — a timeout proves nothing about the code",
            )

    record["end"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    record["duration_seconds"] = round(time.time() - started, 2)
    path = evidence_dir / f"{name}.json"

    # THE FOUR STATUSES, AND THE ONE ASYMMETRY THAT MATTERS.
    #
    #   PASS     the command exited 0 and its evidence was retained and reread.
    #   FAIL     the command exited non-zero. Always. A non-zero exit is a known
    #            verdict even when the CAUSE is unknown -- that unknown belongs in
    #            observed_why, never in status.
    #   BLOCK    execution could not safely happen: tool absent, timeout.
    #   UNKNOWN  the VERDICT itself cannot be determined, because the evidence that
    #            would carry it is absent, unreadable, malformed or incomplete.
    #
    # UNKNOWN can only ever REPLACE A PASS. A FAIL or BLOCK whose evidence also went
    # missing stays FAIL or BLOCK: downgrading it would let a broken command reach
    # the softer word, and every one of the four blocks the push anyway, so there is
    # nothing to gain and a real hole to open.
    try:
        payload = json.dumps(record, indent=2) + "\n"
        path.write_text(payload, encoding="utf-8")
        reread = json.loads(path.read_text(encoding="utf-8"))
        if reread.get("context") != name or reread.get("status") != record["status"]:
            raise ValueError("evidence does not describe the run that wrote it")
    except (OSError, ValueError) as exc:
        if record["status"] == "PASS":
            record.update(
                status="UNKNOWN",
                what_failed=f"evidence for {name} could not be retained",
                observed_why=(
                    f"UNKNOWN — the command exited 0 but its evidence is absent, "
                    f"unreadable or malformed ({exc}), so the verdict is not proven"
                ),
                next_safe_action=(
                    "INVESTIGATE — an unprovable pass is not a pass; check that "
                    f"{evidence_dir} is writable, then re-run"
                ),
            )

    record["evidence_path"] = str(path)
    return record


#: Versions the workflows declare. A local interpreter that differs is not an error --
#: it is a LIMIT, and doctor reports it as one. Local green cannot promise CI green when
#: the interpreter differs, and pretending otherwise is the kind of quiet claim this
#: repository exists to remove.
DECLARED_PYTHON = "3.12"
DECLARED_NODE = "24"

LOCKFILES = ("requirements.lock", "requirements-preflight.lock", "package-lock.json")


def _probe(argv: list[str], timeout: int = 30) -> tuple[int, str]:
    exe = shutil.which(argv[0])
    if exe is None:
        return 127, ""
    out = subprocess.run(  # noqa: S603 - argv only, no shell
        [exe, *argv[1:]],
        capture_output=True,
        text=True,
        timeout=timeout,
        cwd=str(REPO_ROOT),
        stdin=subprocess.DEVNULL,
        shell=False,
    )
    return out.returncode, (out.stdout or out.stderr).strip().splitlines()[0] if (
        out.stdout or out.stderr
    ).strip() else ""


def cmd_doctor() -> int:
    """Prerequisites, reported before anything is installed.

    Runs on the SYSTEM interpreter on purpose: its job includes reporting that the venv
    is missing, which it could not do if it needed the venv to start.
    """
    print("=== doctor ===")
    mandatory_missing: list[str] = []

    for tool, mandatory, install in (
        ("git", True, "https://git-scm.com/downloads"),
        ("python3", True, "https://www.python.org/downloads/"),
        (
            "node",
            False,
            "https://nodejs.org/ (only needed for the e2e context, which is GitHub-only)",
        ),
        ("npm", False, "ships with node"),
        (
            "shellcheck",
            False,
            "brew install shellcheck / apt-get install shellcheck "
            "(the `bandit` context is GitHub-only without it)",
        ),
        ("gh", False, "https://cli.github.com/ (needed only to read GitHub evidence)"),
    ):
        found = shutil.which(tool)
        state = "ok" if found else ("MISSING" if mandatory else "absent")
        print(f"  {tool:<12} {state:<8} {found or install}")
        if mandatory and not found:
            mandatory_missing.append(tool)

    _, ver = _probe(["python3", "--version"])
    local_py = ver.replace("Python ", "").strip()
    print(
        f"\n  python local={local_py or 'UNKNOWN'}  workflows declare={DECLARED_PYTHON}"
    )
    if local_py and not local_py.startswith(DECLARED_PYTHON):
        print(
            f"    LIMIT: local Python {local_py} differs from the {DECLARED_PYTHON} CI uses. "
            "A local pass does not promise a CI pass."
        )
    _, nver = _probe(["node", "--version"])
    if nver:
        print(f"  node   local={nver}  workflows declare=v{DECLARED_NODE}")
        if not nver.lstrip("v").startswith(DECLARED_NODE):
            print(f"    LIMIT: local Node {nver} differs from v{DECLARED_NODE} in CI.")

    print()
    for lock in LOCKFILES:
        exists = (REPO_ROOT / lock).is_file()
        print(f"  {lock:<32} {'ok' if exists else 'MISSING'}")
        if not exists:
            mandatory_missing.append(lock)

    venv = REPO_ROOT / ".venv"
    print(f"\n  .venv {'present' if venv.is_dir() else 'absent — run: make bootstrap'}")

    try:
        contexts = load_manifest()
        print(
            f"  manifest ok: {len(contexts)} contexts, "
            f"{sum(1 for v in contexts.values() if v['locally_runnable'] == 'yes')} runnable here"
        )
    except ManifestError as exc:
        print(f"  manifest BLOCK: {exc}")
        mandatory_missing.append("ci/local-execution.toml")

    if mandatory_missing:
        print(
            f"\nSTATUS: BLOCK — missing mandatory prerequisite(s): {', '.join(mandatory_missing)}"
        )
        return 1
    print("\nSTATUS: PASS — mandatory prerequisites present.")
    return 0


def cmd_bootstrap() -> int:
    """Create the repository-local environment from lockfiles, and install the hook.

    Prints every action before taking it. Installs nothing globally: the venv lives in
    the repository, pip is called with --require-hashes so a package that is not exactly
    what the lockfile pins cannot enter, and npm ci refuses to proceed if package.json
    and package-lock.json disagree.
    """
    venv = REPO_ROOT / ".venv"
    actions = [
        f"create virtualenv at {venv} (repository-local; nothing installed system-wide)",
        "pip install --require-hashes -r requirements.lock  (exact pinned hashes only)",
        "npm ci                                             (package-lock.json only)",
        "git config core.hooksPath .githooks                 (repository-local hook path)",
    ]
    print("=== bootstrap will do exactly this ===")
    for i, a in enumerate(actions, 1):
        print(f"  {i}. {a}")
    print()

    if not venv.is_dir():
        print(f"-> creating {venv}")
        code, _ = _probe(["python3", "-m", "venv", str(venv)], timeout=180)
        if code != 0:
            print("STATUS: FAIL — could not create the virtualenv")
            return 1
    else:
        print(f"-> {venv} already exists, reusing")

    if not (venv / "bin" / "pip").is_file():
        print(f"STATUS: FAIL — {venv / 'bin' / 'pip'} missing after venv creation")
        return 1

    # argv[0] comes from shutil.which against a PATH whose first entry is the venv we
    # just created -- not from a path string this function assembled. scripts/security_gate.py
    # re-derives that rule from this file's AST on every run and rejected the assembled
    # form, which is the check doing its job: a constructed path is a path this code chose,
    # and the point of the rule is that the process chooses it.
    env = dict(os.environ)
    env["PATH"] = f"{venv / 'bin'}{os.pathsep}{env.get('PATH', '')}"
    exe = shutil.which("pip", path=env["PATH"])
    if exe is None:
        print("STATUS: FAIL — pip not resolvable inside the new virtualenv")
        return 1

    print("-> pip install --require-hashes -r requirements.lock")
    out = subprocess.run(  # noqa: S603 - argv only, no shell
        [exe, "install", "--quiet", "--require-hashes", "-r", "requirements.lock"],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        timeout=900,
        stdin=subprocess.DEVNULL,
        shell=False,
        env=env,
    )
    if out.returncode != 0:
        print(
            f"STATUS: FAIL — lockfile install rejected:\n{(out.stderr or out.stdout)[-1500:]}"
        )
        return 1

    if shutil.which("npm"):
        print("-> npm ci")
        code, _ = _probe(["npm", "ci"], timeout=900)
        if code != 0:
            print("STATUS: FAIL — npm ci rejected package-lock.json")
            return 1
    else:
        print(
            "-> npm absent; skipping node dependencies (only the GitHub-only e2e context needs them)"
        )

    print("-> git config core.hooksPath .githooks")
    code, _ = _probe(["git", "config", "core.hooksPath", ".githooks"])
    if code != 0:
        print("STATUS: FAIL — could not set the repository-local hook path")
        return 1

    print(
        "\nSTATUS: PASS — repository-local environment ready, pre-push hook installed."
    )
    print("A normal `git push` now runs `make sandbox-fast` first.")
    return 0


#: The ONLY differences that may be normalized before comparing two runs. Everything
#: else -- verdicts, counts, coverage, hashes, markers, error text -- is a real
#: difference and must fail. Normalizing a verdict would make the check meaningless.
_NORMALIZERS = (
    (re.compile(r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?"), "<TIMESTAMP>"),
    (re.compile(r"\.coverage\.[A-Za-z0-9._-]+\.\d+\.\d+"), "<COVERAGE_FRAGMENT>"),
    (re.compile(r"\b(?:gw\d+|\d+ workers?)\b"), "<XDIST_WORKERS>"),
    (re.compile(r"\bin \d+\.\d+s\b"), "in <DURATION>s"),
)
_RULE_NAMES = (
    "wall-clock timestamp",
    "coverage fragment filename",
    "xdist worker count",
    "pytest duration line",
)


def _normalize(text: str) -> tuple[str, list[str]]:
    applied: list[str] = []
    for (pattern, replacement), name in zip(_NORMALIZERS, _RULE_NAMES):
        text, n = pattern.subn(replacement, text)
        if n:
            applied.append(f"{name} x{n}")
    return text, applied


def cmd_determinism(run_id: str) -> int:
    """Run the declared local contract twice and compare. Any unexplained difference fails."""
    out_dir = EVIDENCE_ROOT / "determinism" / run_id
    out_dir.mkdir(parents=True, exist_ok=True)
    venv_bin = REPO_ROOT / ".venv" / "bin"
    if not (venv_bin / "python3").is_file():
        print("BLOCK: .venv missing — run `make bootstrap` first")
        return 2
    env = dict(os.environ)
    env["PATH"] = f"{venv_bin}{os.pathsep}{env.get('PATH', '')}"
    exe = shutil.which("pytest", path=env["PATH"])
    if exe is None:
        print("BLOCK: pytest not resolvable in the virtualenv — run `make bootstrap`")
        return 2
    # SERIAL ON PURPOSE, and this is not a weakening.
    #
    # The first run of this check failed with a real difference: two skipped tests
    # appeared at different positions in the progress dots. Same tests, same verdicts,
    # same counts -- what moved was the order xdist workers finished in. Comparing raw
    # stdout from `-n auto` compares the SCHEDULER, not the result, and no amount of
    # normalizing would make that comparison mean what it claims to mean.
    #
    # The alternative was to add "progress-dot ordering" to the allowlist. That would
    # have been normalizing away evidence to make a check pass -- the exact move the
    # allowlist exists to forbid. Running serially removes the noise at its source
    # instead: identical tests, identical verdicts, and an output order that is
    # deterministic because nothing is racing.
    #
    # `-n 0` disables distribution. Cost is wall-clock only; the executed set is
    # unchanged, which is the property under test.
    rest = ["-n", "0", "-m", "not axle", "-q"]
    argv = [exe, *rest]

    raws: list[str] = []
    for i in (1, 2):
        print(f"-> run {i}/2: {' '.join(argv)}")
        res = subprocess.run(  # noqa: S603 - argv only, no shell
            [exe, *rest],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            timeout=1800,
            stdin=subprocess.DEVNULL,
            shell=False,
            env=env,
        )
        raw = (res.stdout or "") + (res.stderr or "")
        raws.append(raw)
        (out_dir / f"run{i}.raw.txt").write_text(raw, encoding="utf-8")

    norm, rules = zip(*(_normalize(r) for r in raws))
    for i, n in enumerate(norm, 1):
        (out_dir / f"run{i}.normalized.txt").write_text(n, encoding="utf-8")

    import difflib

    raw_diff = "\n".join(
        difflib.unified_diff(
            raws[0].splitlines(),
            raws[1].splitlines(),
            "run1.raw",
            "run2.raw",
            lineterm="",
        )
    )
    (out_dir / "raw.diff").write_text(raw_diff, encoding="utf-8")
    norm_diff = "\n".join(
        difflib.unified_diff(
            norm[0].splitlines(),
            norm[1].splitlines(),
            "run1.normalized",
            "run2.normalized",
            lineterm="",
        )
    )
    (out_dir / "normalized.diff").write_text(norm_diff, encoding="utf-8")

    report = {
        "run_id": run_id,
        "command": argv,
        "normalization_rules_applied": {"run1": list(rules[0]), "run2": list(rules[1])},
        "allowed_normalizations": list(_RULE_NAMES),
        "raw_differed": bool(raw_diff),
        "normalized_differed": bool(norm_diff),
        "status": "FAIL — UNEXPLAINED NONDETERMINISM" if norm_diff else "PASS",
    }
    (out_dir / "report.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )

    print(f"\nraw differences:        {'yes' if raw_diff else 'none'}")
    print(f"after normalization:    {'DIFFERENT' if norm_diff else 'identical'}")
    print(f"rules applied:          {', '.join(rules[0]) or 'none'}")
    print(f"evidence:               {out_dir}")
    if norm_diff:
        print("\nSTATUS: FAIL — UNEXPLAINED NONDETERMINISM")
        print(norm_diff[:2000])
        return 1
    print(
        "\nSTATUS: PASS — two runs agree once only the allowlisted sources are normalized."
    )
    return 0


#: Every category not_run_locally() can emit. Listed rather than derived so the quality
#: summary always carries all four keys: a category that happens to be empty on this run
#: must still appear, or a reader cannot tell "none" from "not reported".
CATEGORIES = (
    "GITHUB_ONLY",
    "EXTERNAL",
    "LOCAL_PREREQUISITE_NOT_PROVISIONED",
    "NETWORK_REQUIRED_EXCLUDED_FROM_DEFAULT",
    "NOT_IN_THIS_TIER",
)


def _by_category(rows: list[dict[str, str]]) -> dict[str, list[str]]:
    grouped: dict[str, list[str]] = {c: [] for c in CATEGORIES}
    for row in rows:
        grouped.setdefault(row["category"], []).append(row["context"])
    return {k: sorted(v) for k, v in grouped.items()}


def _git_sha() -> str:
    """The commit this run measured, or UNKNOWN. Never a guess."""
    exe = shutil.which("git")
    if exe is None:
        return "UNKNOWN"
    try:
        out = subprocess.run(  # noqa: S603 - argv only, no shell
            [exe, "rev-parse", "HEAD"],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            timeout=30,
            stdin=subprocess.DEVNULL,
            shell=False,
        )
    except subprocess.TimeoutExpired:
        return "UNKNOWN"
    return out.stdout.strip() if out.returncode == 0 and out.stdout.strip() else "UNKNOWN"


def render_markdown(quality: dict[str, Any]) -> str:
    """summary.md carries the same fields as summary.json, in the order the contract lists them.

    Not a prettier restatement: it is the file a human opens after a blocked push, so
    every field the JSON carries appears here too. A markdown summary that showed less
    than the JSON would send the reader to the JSON, which makes it worthless.
    """
    # Two lanes write through here and they name their commit differently: the quality
    # gate records SHA, the deep lane records SOURCE_SHA because on a pull_request run
    # GITHUB_SHA is a test-merge commit and the two must stay distinguishable. Reading
    # both with a fallback keeps one renderer instead of two that drift apart, and an
    # absent key renders as UNKNOWN rather than crashing a run whose gates all passed.
    lane = str(quality.get("LANE", "quality gate"))
    sha = quality.get("SOURCE_SHA") or quality.get("SHA") or "UNKNOWN"
    lines = [
        f"# Local {lane} — {quality.get('STATUS', 'UNKNOWN')}",
        "",
        f"`{sha}` · run `{quality.get('RUN_ID', 'UNKNOWN')}` · "
        f"{quality.get('TOTAL_SECONDS', 'UNKNOWN')}s",
        "",
        "| field | value |",
        "|---|---|",
    ]
    for key, value in quality.items():
        if isinstance(value, list):
            rendered = ", ".join(f"`{v}`" for v in cast("list[Any]", value)) or "_none_"
        else:
            rendered = str(value)
        lines.append(f"| `{key}` | {rendered} |")
    lines += [
        "",
        "## What this does not prove",
        "",
        "A local pass is a PARTIAL result. The contexts listed under "
        "`LOCAL_GATES_NOT_RUN` were not evaluated here, and none of them is reported "
        "as having passed. GitHub's required contexts remain the merge proof.",
        "",
        "This gate is a developer-speed control, not a security boundary. "
        "`git push --no-verify`, the GitHub web UI, a direct API call, or another "
        "machine all bypass it.",
        "",
    ]
    return "\n".join(lines)


#: Deep-lane verdicts that do not block. NOT_APPLICABLE is a result, not a gap: a
#: category proven to have nothing to verify has been verified.
DEEP_ACCEPTABLE = {"PASS", "NOT_APPLICABLE"}


def cmd_deep(run_id: str) -> int:
    """The deep verification lane. Every component runs; none is skipped on a prior failure.

    sandbox-fast stops at the first non-PASS because its job is to answer "may I push".
    This lane's job is different: it produces EVIDENCE for five categories, and stopping
    early would leave four of them unmeasured while reporting a verdict about the tree.
    A reader would then have no way to tell "this category passed" from "this category
    never ran".
    """
    try:
        checks = load_deep_checks()
    except ManifestError as exc:
        print(f"BLOCK: {exc}", file=sys.stderr)
        return 2

    evidence_dir = EVIDENCE_ROOT / "deep-verify" / run_id
    evidence_dir.mkdir(parents=True, exist_ok=True)
    started = time.time()
    start_time = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(started))
    source_sha = _git_sha()

    network = sorted(n for n, s in checks.items() if requires_network(s))
    print("=== deep verification lane ===")
    print(f"SOURCE_SHA         {source_sha}")
    print(f"COMPONENTS         {len(checks)}")
    print(f"NETWORK_COMPONENTS {', '.join(network) if network else '(none)'}")
    print(
        "NOTE               this lane is the only one authorised to reach the network. "
        "`make sandbox-fast` excludes every network-requiring check in select()."
    )
    print()

    results: list[dict[str, Any]] = []
    for name in sorted(checks):
        spec = checks[name]
        if "probes" in spec:
            record = run_absence_check(name, spec, evidence_dir)
        else:
            record = run_one(name, spec, evidence_dir)
            record["category"] = str(spec["category"])
            record["requirement"] = str(spec["requirement"])
            counts = pytest_counts(
                str(record.get("stdout_tail", "")) + str(record.get("stderr_tail", ""))
            )
            if counts:
                record["test_counts"] = counts
            if requires_network(spec):
                record["endpoint"] = str(spec.get("endpoint", ""))
                record["network_reason"] = str(spec.get("network_reason", ""))
        record["source_sha"] = source_sha
        # run_one() wrote this file before the enrichment above existed, so the copy on
        # disk would carry none of it. Milestone 5 requires the endpoint, the source SHA
        # and the test counts to be IN the evidence -- a summary that has them while the
        # per-component file does not is two records disagreeing about one run.
        evidence_path = record.get("evidence_path")
        if isinstance(evidence_path, str):
            Path(evidence_path).write_text(
                json.dumps(record, indent=2) + "\n", encoding="utf-8"
            )
        results.append(record)
        counts = cast("dict[str, int]", record.get("test_counts") or {})
        detail = (
            "  " + " ".join(f"{k}={v}" for k, v in sorted(counts.items())) if counts else ""
        )
        print(
            f"  {record['status']:<15} {name:<22} "
            f"{record['duration_seconds']:>7.1f}s{detail}"
        )

    blocking = [r for r in results if r["status"] not in DEEP_ACCEPTABLE]
    status = "PASS" if not blocking else str(blocking[0]["status"])
    total_seconds = round(time.time() - started, 2)

    by_status: dict[str, list[str]] = {}
    for record in results:
        by_status.setdefault(str(record["status"]), []).append(str(record["context"]))

    grouped: dict[str, list[str]] = {
        k: sorted(v) for k, v in sorted(by_status.items())
    }
    identity: dict[str, Any] = {
        "sha": source_sha,
        "run_id": run_id,
        "lane": "deep-verify",
        "status": status,
        "components": sorted(checks),
        "by_status": grouped,
    }
    checksum = hashlib.sha256(
        json.dumps(identity, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()

    summary = {
        "LANE": "deep-verify",
        "SOURCE_SHA": source_sha,
        "RUN_ID": run_id,
        "START_TIME": start_time,
        "END_TIME": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "TOTAL_SECONDS": total_seconds,
        "COMPONENTS_SELECTED": sorted(checks),
        "BY_STATUS": grouped,
        "CATEGORIES": sorted({str(s["category"]) for s in checks.values()}),
        "NETWORK_COMPONENTS": network,
        "EXACT_FAILED_ARGV": (blocking[0].get("argv", []) if blocking else []),
        "EXIT_CODE": 0 if not blocking else 1,
        "EVIDENCE_PATHS": [str(evidence_dir)],
        "STATUS": status,
        "NEXT_SAFE_ACTION": (
            "NONE — every deep component reported PASS or a proven NOT_APPLICABLE."
            if not blocking
            else str(blocking[0].get("next_safe_action", "INVESTIGATE"))
        ),
        "RESULT_CHECKSUM": checksum,
        "RESULTS": results,
    }
    (evidence_dir / "summary.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )
    (evidence_dir / "summary.md").write_text(
        render_markdown({k: v for k, v in summary.items() if k != "RESULTS"}),
        encoding="utf-8",
    )

    print()
    for state, names in sorted(grouped.items()):
        print(f"{state:<15} {', '.join(names)}")
    print()
    print(f"STATUS: {status}")
    print(f"EVIDENCE: {evidence_dir}")
    print(f"NEXT_SAFE_ACTION: {summary['NEXT_SAFE_ACTION']}")
    return 0 if not blocking else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tier", choices=("fast", "full"), default="fast")
    parser.add_argument(
        "--run-id", default=time.strftime("%Y%m%d-%H%M%S", time.gmtime())
    )
    parser.add_argument("--doctor", action="store_true")
    parser.add_argument("--bootstrap", action="store_true")
    parser.add_argument("--determinism", action="store_true")
    parser.add_argument("--deep", action="store_true")
    args = parser.parse_args()

    if args.doctor:
        return cmd_doctor()
    if args.bootstrap:
        return cmd_bootstrap()
    if args.determinism:
        return cmd_determinism(args.run_id)
    if args.deep:
        return cmd_deep(args.run_id)

    try:
        contexts = load_manifest()
    except ManifestError as exc:
        print(f"BLOCK: {exc}", file=sys.stderr)
        return 2

    try:
        checks = load_local_checks()
    except ManifestError as exc:
        print(f"BLOCK: {exc}", file=sys.stderr)
        return 2

    evidence_dir = EVIDENCE_ROOT / args.tier / args.run_id
    evidence_dir.mkdir(parents=True, exist_ok=True)
    run_started = time.time()
    start_time = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(run_started))

    # THE NOT-RUN LIST COMES FIRST, ALWAYS. Printing it after execution would let the
    # first failing gate suppress it, and a partial local pass that hides what it did not
    # cover is exactly the false reassurance this tool exists to remove.
    absent = github_only(contexts)
    skipped = not_run_locally(contexts, args.tier)
    print(f"=== required contexts that do NOT run locally ({len(skipped)}) ===")
    for row in skipped:
        print("NOT_RUN_LOCALLY")
        print("REQUIRED_ON_GITHUB")
        print(f"context={row['context']}")
        print(f"CATEGORY={row['category']}")
        print(f"REASON={row['reason']}")
        if row["opt_in_command"]:
            print(f"OPT_IN={row['opt_in_command']}")
        print()

    chosen = select(contexts, args.tier)
    chosen_checks = select_local_checks(checks, args.tier)
    print(
        f"=== running {len(chosen)} local gate(s) + {len(chosen_checks)} local "
        f"check(s), tier={args.tier} ==="
    )

    results: list[dict[str, Any]] = []
    failed: dict[str, Any] | None = None
    for name in chosen:
        record = run_one(name, contexts[name], evidence_dir)
        results.append(record)
        print(f"  {record['status']:<7} {name:<26} {record['duration_seconds']:>6.1f}s")
        if record["status"] != "PASS":
            failed = record
            break

    # Local checks run after the required contexts and only if those held. A regression
    # fixture reporting on a tree whose required checks already failed adds a second
    # failure to triage, not a second piece of information.
    if failed is None:
        for name in chosen_checks:
            record = run_one(name, checks[name], evidence_dir)
            record["local_check"] = True
            results.append(record)
            print(
                f"  {record['status']:<7} {name:<26} {record['duration_seconds']:>6.1f}s"
            )
            if record["status"] != "PASS":
                failed = record
                break

    status = "PASS" if failed is None else str(failed["status"])
    total_seconds = round(time.time() - run_started, 2)
    end_time = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    by_category = _by_category(skipped)

    # ONE RESULT IDENTITY, TWO FILES. Q5 keeps the tier path exactly where its existing
    # readers expect it and adds the quality-gate path beside it. Both carry the same
    # run_id and the same checksum over the same identity fields, so a mismatch between
    # them is detectable rather than a matter of trusting that they were written together.
    identity = {
        "sha": _git_sha(),
        "run_id": args.run_id,
        "tier": args.tier,
        "status": status,
        "selected": chosen + chosen_checks,
        "gates_passed": sorted(
            str(r["context"]) for r in results if r["status"] == "PASS"
        ),
        "gates_failed": sorted(
            str(r["context"]) for r in results if r["status"] != "PASS"
        ),
    }
    checksum = hashlib.sha256(
        json.dumps(identity, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()

    # The tier summary keeps every key it already had; the new ones are additive, so
    # nothing that reads this file today has to change to keep working.
    summary = {
        "tier": args.tier,
        "run_id": args.run_id,
        "selected": chosen,
        "github_only": [n for n, _ in absent],
        "results": results,
        "status": status,
        "result_identity": identity,
        "result_checksum": checksum,
    }
    (evidence_dir / "summary.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )

    quality_dir = EVIDENCE_ROOT / "quality-gate" / args.run_id
    quality_dir.mkdir(parents=True, exist_ok=True)
    quality = {
        "SHA": identity["sha"],
        "START_TIME": start_time,
        "END_TIME": end_time,
        "TOTAL_SECONDS": total_seconds,
        "LOCAL_GATES_SELECTED": chosen + chosen_checks,
        "LOCAL_GATES_PASSED": identity["gates_passed"],
        "LOCAL_GATES_FAILED": identity["gates_failed"],
        "LOCAL_GATES_NOT_RUN": [r["context"] for r in skipped],
        "GITHUB_ONLY_REQUIRED_CONTEXTS": by_category["GITHUB_ONLY"],
        "EXTERNAL_REQUIRED_CONTEXTS": by_category["EXTERNAL"],
        "LOCAL_PREREQUISITE_NOT_PROVISIONED": by_category[
            "LOCAL_PREREQUISITE_NOT_PROVISIONED"
        ],
        "NETWORK_REQUIRED_EXCLUDED_FROM_DEFAULT": by_category[
            "NETWORK_REQUIRED_EXCLUDED_FROM_DEFAULT"
        ],
        "EXACT_FAILED_ARGV": (failed or {}).get("argv", []),
        "EXIT_CODE": 0 if failed is None else 1,
        "EVIDENCE_PATHS": [str(evidence_dir), str(quality_dir)],
        "STATUS": status,
        "NEXT_SAFE_ACTION": (
            "PUSH — every selected local check passed. GitHub's required contexts "
            "remain the merge proof."
            if failed is None
            else str(failed.get("next_safe_action", "INVESTIGATE"))
        ),
        "RESULT_CHECKSUM": checksum,
        "RUN_ID": args.run_id,
    }
    (quality_dir / "summary.json").write_text(
        json.dumps(quality, indent=2) + "\n", encoding="utf-8"
    )
    (quality_dir / "summary.md").write_text(render_markdown(quality), encoding="utf-8")

    if failed is not None:
        print(f"\nWHAT_FAILED: {failed.get('what_failed')}")
        print(f"WHERE: {failed.get('where', REPO_ROOT)}")
        print(f"EXIT_CODE: {failed.get('exit_code')}")
        print(f"DURATION_SECONDS: {failed.get('duration_seconds')}")
        print(f"EVIDENCE_PATH: {failed.get('evidence_path')}")
        print(f"OBSERVED_WHY: {failed.get('observed_why')}")
        print(f"NEXT_SAFE_ACTION: {failed.get('next_safe_action')}")
        tail = str(failed.get("stderr_tail") or failed.get("stdout_tail") or "")[-1500:]
        if tail:
            print(f"OBSERVED_EVIDENCE:\n{tail}")
        print(f"QUALITY_GATE_EVIDENCE: {quality_dir}")
        print(
            f"\nSTATUS: {failed['status']} — {len(skipped)} required context(s) were "
            "NOT evaluated here and none of them is reported as passed."
        )
        return 1

    print(
        f"\nSTATUS: PASS ({len(chosen)} local gate(s) + {len(chosen_checks)} local "
        f"check(s)). This is a PARTIAL result: {len(skipped)} required context(s) "
        "were not evaluated here."
    )
    print(f"EVIDENCE: {evidence_dir}")
    print(f"QUALITY_GATE_EVIDENCE: {quality_dir}")
    print(f"NEXT_SAFE_ACTION: {quality['NEXT_SAFE_ACTION']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
