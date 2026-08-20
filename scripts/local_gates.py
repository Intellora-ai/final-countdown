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
        raise ManifestError(f"{path} is missing; local gate selection has no source of truth")
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
                "reason it cannot run here.")
        if runnable == "yes":
            command = spec.get("command")
            if not isinstance(command, list) or not command:
                raise ManifestError(f"{name}: locally_runnable=yes with no command array")
            if not all(isinstance(tok, str) for tok in cast("list[Any]", command)):
                raise ManifestError(f"{name}: command must be an argv array of strings")
            if not isinstance(spec.get("timeout_seconds"), int):
                raise ManifestError(f"{name}: locally_runnable=yes with no integer timeout_seconds")
        elif not str(spec.get("reason", "")).strip():
            raise ManifestError(f"{name}: locally_runnable=no with no reason")

    pyright = contexts.get(PYRIGHT)
    if pyright is None or pyright.get("locally_runnable") != "yes" or not pyright.get("in_fast"):
        raise ManifestError(
            "pyright must be locally_runnable=yes and in_fast=true. It is the check whose omission "
            "produced the failure this tool exists to prevent, so it may not be optional here.")
    return contexts


def github_only(contexts: dict[str, dict[str, Any]]) -> list[tuple[str, str]]:
    return sorted((n, str(s.get("reason", ""))) for n, s in contexts.items()
                  if s.get("locally_runnable") == "no")


def select(contexts: dict[str, dict[str, Any]], tier: str) -> list[str]:
    runnable = [n for n, s in contexts.items() if s.get("locally_runnable") == "yes"]
    if tier == "fast":
        chosen = [n for n in runnable if contexts[n].get("in_fast")]
        if PYRIGHT not in chosen:                    # belt and braces; load_manifest already checked
            raise ManifestError("the fast tier does not include pyright")
        return sorted(chosen)
    return sorted(runnable)


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
        record.update(status="BLOCK", exit_code=None, duration_seconds=0.0,
                      what_failed=f"{command[0]!r} is not on PATH",
                      observed_why="UNKNOWN — the interpreter or tool was not found",
                      next_safe_action="INVESTIGATE — run `make doctor` and install the tool")
    else:
        try:
            out = subprocess.run(                    # noqa: S603 - argv only, no shell
                [exe, *command[1:]], cwd=str(REPO_ROOT), capture_output=True, text=True,
                timeout=timeout, stdin=subprocess.DEVNULL, shell=False, env=env)
            record.update(
                status="PASS" if out.returncode == 0 else "FAIL",
                exit_code=out.returncode,
                stdout_tail=out.stdout[-4000:],
                stderr_tail=out.stderr[-4000:])
            if out.returncode != 0:
                record.update(
                    what_failed=" ".join(command),
                    where=f"{REPO_ROOT} (exit {out.returncode})",
                    observed_why="UNKNOWN — the command exited non-zero; the log below is the "
                                 "only proven evidence",
                    next_safe_action="INVESTIGATE — read the captured output, then re-run this "
                                     "single command")
        except subprocess.TimeoutExpired:
            record.update(status="BLOCK", exit_code=None,
                          what_failed=" ".join(command),
                          observed_why=f"UNKNOWN — no result within {timeout}s",
                          next_safe_action="INVESTIGATE — a timeout proves nothing about the code")

    record["end"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    record["duration_seconds"] = round(time.time() - started, 2)
    path = evidence_dir / f"{name}.json"
    path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
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
    out = subprocess.run(                            # noqa: S603 - argv only, no shell
        [exe, *argv[1:]], capture_output=True, text=True, timeout=timeout,
        cwd=str(REPO_ROOT), stdin=subprocess.DEVNULL, shell=False)
    return out.returncode, (out.stdout or out.stderr).strip().splitlines()[0] if (
        out.stdout or out.stderr).strip() else ""


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
        ("node", False, "https://nodejs.org/ (only needed for the e2e context, which is GitHub-only)"),
        ("npm", False, "ships with node"),
        ("shellcheck", False, "brew install shellcheck / apt-get install shellcheck "
                              "(the `bandit` context is GitHub-only without it)"),
        ("gh", False, "https://cli.github.com/ (needed only to read GitHub evidence)"),
    ):
        found = shutil.which(tool)
        state = "ok" if found else ("MISSING" if mandatory else "absent")
        print(f"  {tool:<12} {state:<8} {found or install}")
        if mandatory and not found:
            mandatory_missing.append(tool)

    _, ver = _probe(["python3", "--version"])
    local_py = ver.replace("Python ", "").strip()
    print(f"\n  python local={local_py or 'UNKNOWN'}  workflows declare={DECLARED_PYTHON}")
    if local_py and not local_py.startswith(DECLARED_PYTHON):
        print(f"    LIMIT: local Python {local_py} differs from the {DECLARED_PYTHON} CI uses. "
              "A local pass does not promise a CI pass.")
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
        print(f"  manifest ok: {len(contexts)} contexts, "
              f"{sum(1 for v in contexts.values() if v['locally_runnable'] == 'yes')} runnable here")
    except ManifestError as exc:
        print(f"  manifest BLOCK: {exc}")
        mandatory_missing.append("ci/local-execution.toml")

    if mandatory_missing:
        print(f"\nSTATUS: BLOCK — missing mandatory prerequisite(s): {', '.join(mandatory_missing)}")
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
    out = subprocess.run(                            # noqa: S603 - argv only, no shell
        [exe, "install", "--quiet", "--require-hashes", "-r", "requirements.lock"],
        cwd=str(REPO_ROOT), capture_output=True, text=True, timeout=900,
        stdin=subprocess.DEVNULL, shell=False, env=env)
    if out.returncode != 0:
        print(f"STATUS: FAIL — lockfile install rejected:\n{(out.stderr or out.stdout)[-1500:]}")
        return 1

    if shutil.which("npm"):
        print("-> npm ci")
        code, _ = _probe(["npm", "ci"], timeout=900)
        if code != 0:
            print("STATUS: FAIL — npm ci rejected package-lock.json")
            return 1
    else:
        print("-> npm absent; skipping node dependencies (only the GitHub-only e2e context needs them)")

    print("-> git config core.hooksPath .githooks")
    code, _ = _probe(["git", "config", "core.hooksPath", ".githooks"])
    if code != 0:
        print("STATUS: FAIL — could not set the repository-local hook path")
        return 1

    print("\nSTATUS: PASS — repository-local environment ready, pre-push hook installed.")
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
_RULE_NAMES = ("wall-clock timestamp", "coverage fragment filename", "xdist worker count",
               "pytest duration line")


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
        res = subprocess.run(                        # noqa: S603 - argv only, no shell
            [exe, *rest], cwd=str(REPO_ROOT), capture_output=True, text=True, timeout=1800,
            stdin=subprocess.DEVNULL, shell=False, env=env)
        raw = (res.stdout or "") + (res.stderr or "")
        raws.append(raw)
        (out_dir / f"run{i}.raw.txt").write_text(raw, encoding="utf-8")

    norm, rules = zip(*(_normalize(r) for r in raws))
    for i, n in enumerate(norm, 1):
        (out_dir / f"run{i}.normalized.txt").write_text(n, encoding="utf-8")

    import difflib
    raw_diff = "\n".join(difflib.unified_diff(raws[0].splitlines(), raws[1].splitlines(),
                                              "run1.raw", "run2.raw", lineterm=""))
    (out_dir / "raw.diff").write_text(raw_diff, encoding="utf-8")
    norm_diff = "\n".join(difflib.unified_diff(norm[0].splitlines(), norm[1].splitlines(),
                                               "run1.normalized", "run2.normalized", lineterm=""))
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
    (out_dir / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(f"\nraw differences:        {'yes' if raw_diff else 'none'}")
    print(f"after normalization:    {'DIFFERENT' if norm_diff else 'identical'}")
    print(f"rules applied:          {', '.join(rules[0]) or 'none'}")
    print(f"evidence:               {out_dir}")
    if norm_diff:
        print("\nSTATUS: FAIL — UNEXPLAINED NONDETERMINISM")
        print(norm_diff[:2000])
        return 1
    print("\nSTATUS: PASS — two runs agree once only the allowlisted sources are normalized.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tier", choices=("fast", "full"), default="fast")
    parser.add_argument("--run-id", default=time.strftime("%Y%m%d-%H%M%S", time.gmtime()))
    parser.add_argument("--doctor", action="store_true")
    parser.add_argument("--bootstrap", action="store_true")
    parser.add_argument("--determinism", action="store_true")
    args = parser.parse_args()

    if args.doctor:
        return cmd_doctor()
    if args.bootstrap:
        return cmd_bootstrap()
    if args.determinism:
        return cmd_determinism(args.run_id)

    try:
        contexts = load_manifest()
    except ManifestError as exc:
        print(f"BLOCK: {exc}", file=sys.stderr)
        return 2

    evidence_dir = EVIDENCE_ROOT / args.tier / args.run_id
    evidence_dir.mkdir(parents=True, exist_ok=True)

    # THE GITHUB-ONLY LIST COMES FIRST, ALWAYS. Printing it after execution would let the
    # first failing gate suppress it, and a partial local pass that hides what it did not
    # cover is exactly the false reassurance this tool exists to remove.
    absent = github_only(contexts)
    print(f"=== required contexts that do NOT run locally ({len(absent)}) ===")
    for name, reason in absent:
        print(f"NOT_RUN_LOCALLY\nREQUIRED_ON_GITHUB\ncontext={name}\nREASON={reason}\n")

    chosen = select(contexts, args.tier)
    print(f"=== running {len(chosen)} local gate(s), tier={args.tier} ===")

    results: list[dict[str, Any]] = []
    failed: dict[str, Any] | None = None
    for name in chosen:
        record = run_one(name, contexts[name], evidence_dir)
        results.append(record)
        print(f"  {record['status']:<5} {name:<24} {record['duration_seconds']:>6.1f}s")
        if record["status"] != "PASS":
            failed = record
            break

    summary = {
        "tier": args.tier,
        "run_id": args.run_id,
        "selected": chosen,
        "github_only": [n for n, _ in absent],
        "results": results,
        "status": "PASS" if failed is None else failed["status"],
    }
    (evidence_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n",
                                               encoding="utf-8")

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
        print(f"\nSTATUS: {failed['status']} — {len(absent)} required context(s) still run only "
              "on GitHub and were NOT evaluated here.")
        return 1

    print(f"\nSTATUS: PASS ({len(chosen)} local gate(s)). This is a PARTIAL result: "
          f"{len(absent)} required context(s) run only on GitHub.")
    print(f"EVIDENCE: {evidence_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
