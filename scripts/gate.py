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
import re
import shutil
import subprocess
import sys
import time
import traceback
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from types import TracebackType
from typing import Any, TypeVar, cast

REPORTS = Path("reports")

# Bump when the report shape changes. Consumers must reject an unknown major.
#
# 1.2 ADDS a field and removes and repurposes nothing, so the MAJOR is
# unchanged and scripts/aggregate_gates.py (which compares only the major)
# keeps reading every 1.x report. A major bump would have been wrong and
# expensive: SCHEMA_MAJOR is "1" there, so 2.0 would make every gate's
# evidence unreadable in the same push that added a field to it.
SCHEMA_VERSION = "1.2"  # 1.1 added run_attempt; 1.2 added environment+provenance

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


_T = TypeVar("_T")

UNAVAILABLE = "unavailable"

# ---------------------------------------------------------------------------
# ENVIRONMENT FINGERPRINT — what produced this verdict
#
# "The same commit passed on Tuesday and failed today. What changed?" cannot be
# answered from a report that records only the verdict. Nothing in the tree
# moved, so the difference is in what produced it: the interpreter, the host,
# the runner image, or the tools the gate shelled out to.
#
# Every field below is one a reader would consult to answer that question.
# Fields that are merely available are deliberately absent:
#
#   RUNNER_NAME       every job in verify.yml is `runs-on: ubuntu-latest`, so
#                     the name is an ephemeral label with no reproducibility
#                     content; on a self-hosted fleet it would publish an
#                     internal hostname in a public artifact. Cost, no answer.
#   hostname / user   platform.node() IS the hostname. Identifies the machine,
#                     explains nothing the OS and image do not already.
#   PATH / cwd        PATH routinely contains a home directory, and the
#                     resolved tool versions are the part that explains a
#                     differing result.
#   a timestamp       started_at already carries one, and this block must be
#                     deterministic: two runs on one machine have to fingerprint
#                     identically or two fingerprints cannot be compared.
# ---------------------------------------------------------------------------

# Read BY NAME. os.environ is never iterated, copied or unpacked in this file.
# The report is uploaded as a public artifact and this repository has already
# published one PAT prefix on a public branch; a blanket environment dump is a
# credential leak. A variable not named here cannot reach the report.
_RUNNER_VARS: dict[str, str] = {
    "runner_os": "RUNNER_OS",
    "runner_arch": "RUNNER_ARCH",
    # `ubuntu-latest` is a moving target: GitHub rolls the image forward with
    # no commit changing, taking every preinstalled tool with it. These two are
    # the most common true answer to "same commit, different result".
    "runner_image": "ImageOS",
    "runner_image_version": "ImageVersion",
}

# A version costs a subprocess, and this runs in twelve gates on every push, so
# a tool is probed only when the command this gate actually ran names it --
# scope["command"] already records that. A pure-Python gate probes nothing.
#
# Keys are tokens that may appear in that command. The indirect entries are
# wrappers that shell out to a tool their command line never mentions;
# tests/test_evidence.py re-derives each from the wrapper's own source, so a
# wrapper that stops using its tool fails a test rather than quietly reporting
# a version nothing used -- the failure mode SCOPE_PATTERNS already hit once.
_COMMAND_TOOLS: dict[str, dict[str, list[str]]] = {
    "pytest": {"pytest": ["pytest", "--version"]},
    "--cov": {"coverage": ["coverage", "--version"]},
    # pyright is a Node program: a Node major bump changes what it reports
    # without pyright's own version moving.
    "pyright": {"pyright": ["pyright", "--version"],
                "node": ["node", "--version"]},
    "node": {"node": ["node", "--version"]},
    "axle": {"axle": ["axle", "--version"]},
    # Indirect -- the command names the wrapper, not the tool it invokes.
    "security_gate.py": {"bandit": ["bandit", "--version"]},
    "correspondence_gate.py": {"axle": ["axle", "--version"]},
}

# The block's shape is fixed: a consumer finds the same keys whether collection
# succeeded, partly failed, or failed outright.
ENVIRONMENT_FIELDS: tuple[str, ...] = (
    "python", "platform", "machine", "cpu_count",
    "runner_os", "runner_arch", "runner_image", "runner_image_version",
    "tools", "collection_errors",
)


def _safe(reasons: list[str], name: str, get: Callable[[], _T]) -> _T | str:
    """Collect one field, or record why it could not be collected.

    Catches BaseException on purpose. gate.py is the thing that records
    failures; a fingerprint collector that lets anything escape turns a
    recorded FAIL into a crash with no evidence, destroying the thing it was
    added to strengthen. A missing value is a fact. A lost report is not.
    """
    try:
        return get()
    except BaseException as exc:  # noqa: BLE001 - deliberate, see docstring
        reasons.append(f"{name}: {type(exc).__name__}: {str(exc)[:120]}")
        return UNAVAILABLE


def _cpu_count() -> int:
    return os.cpu_count() or 0


def _reader(var: str) -> Callable[[], str]:
    """Getter for one named variable. `local` outside GitHub Actions."""
    def read() -> str:
        return os.environ.get(var, "local")
    return read


def _prober(argv: list[str]) -> Callable[[], str]:
    def probe() -> str:
        return tool_version(argv)
    return probe


def probes_for(command: str) -> dict[str, list[str]]:
    """The version probes the recorded command justifies paying for."""
    probes: dict[str, list[str]] = {}
    for token, spec in _COMMAND_TOOLS.items():
        # Delimited, not substring: `axle` must not match `axle_gate.py`.
        if re.search(rf"(?:^|[\s/]){re.escape(token)}(?:$|[\s=])", command):
            probes.update(spec)
    return probes


def environment_fingerprint(command: str = "",
                            tools: dict[str, str] | None = None
                            ) -> dict[str, Any]:
    """What produced the verdict. Deterministic, never raises, no env dump."""
    reasons: list[str] = []
    known: dict[str, str] = dict(tools or {})

    fingerprint: dict[str, Any] = {
        "python": _safe(reasons, "python", platform.python_version),
        "platform": _safe(reasons, "platform", platform.platform),
        "machine": _safe(reasons, "machine", platform.machine),
        # GitHub moved hosted runners from 2 cores to 4 with no commit
        # changing; a gate that times out on one and passes on the other has
        # this as its entire explanation.
        "cpu_count": _safe(reasons, "cpu_count", _cpu_count),
    }
    for field, var in _RUNNER_VARS.items():
        fingerprint[field] = _safe(reasons, field, _reader(var))

    for name, argv in sorted(probes_for(command).items()):
        if name in known:
            continue  # measured at gate start; do not pay for it twice
        known[name] = str(_safe(reasons, name, _prober(argv)))
    fingerprint["tools"] = dict(sorted(known.items()))
    fingerprint["collection_errors"] = reasons
    return fingerprint


def degraded_environment(reason: str, tools: dict[str, str]) -> dict[str, Any]:
    """The block when collection failed outright: same keys, stated reason."""
    block: dict[str, Any] = {field: UNAVAILABLE for field in ENVIRONMENT_FIELDS}
    block["tools"] = dict(sorted(tools.items()))
    block["collection_errors"] = [reason]
    return block


# ---------------------------------------------------------------------------
# PROVENANCE — which workflow, which event, and which tree
#
# `commit`, `workflow`, `job`, `run_id`, `run_attempt` and `ref` say a run
# happened. They do not say WHICH workflow file ran, what kind of event caused
# it, or -- the one that actually bites -- whether the tree the runner tested
# is the tree GitHub believes it tested.
#
# A `push` result and a `pull_request` result are checks of DIFFERENT TREES: a
# pull_request event tests the merge commit, not the branch head. This
# repository has already hit that (a PR reporting 3f99adb8 while the pushed
# head was 1e8859c). Two verdicts are only comparable once you know which of
# those produced each one.
# ---------------------------------------------------------------------------

_SHA = re.compile(r"[0-9a-f]{40}")

# The event payload is a few hundred KB at most. A larger file is not the
# payload; reading it into memory in every gate is not worth finding out.
_MAX_EVENT_BYTES = 8 * 1024 * 1024

PROVENANCE_FIELDS: tuple[str, ...] = (
    "workflow_ref", "event", "pull_request", "commit_identity",
)
COMMIT_IDENTITY_FIELDS: tuple[str, ...] = (
    "checked_out_sha", "expected_sha", "identity_verified", "collection_errors",
)


def checked_out_sha() -> str:
    """The SHA git says is checked out, or a reason. Never raises.

    `git rev-parse` rather than parsing `.git/HEAD`: HEAD holds a bare SHA only
    on a detached checkout. In a worktree `.git` is a file pointing elsewhere,
    a symbolic HEAD needs the loose ref or `packed-refs`, and a hand-rolled
    resolver is a second implementation of git's ref resolution that can
    disagree with the first -- silently, and about the one fact this function
    exists to establish.

    The usual objection to a subprocess here is bandit B404/B603, which is why
    scripts/credential_scan.py reads `.git/index` directly. That objection does
    not apply: `("B404", "scripts/gate.py")` and `("B603", "scripts/gate.py")`
    are both already in scripts/security_gate.py's ELIGIBLE set, and that gate
    re-derives the safe pattern (shell=False, argv list literal, argv[0] from
    shutil.which, timeout set) from this AST. This call satisfies all four, so
    it needs no edit to security_gate.py and adds no new exception.
    """
    exe = shutil.which("git")
    if exe is None:
        return UNAVAILABLE
    try:
        out = subprocess.run([exe, "rev-parse", "HEAD"], capture_output=True,
                             text=True, timeout=30)
    except (OSError, subprocess.SubprocessError):
        return UNAVAILABLE
    sha = out.stdout.strip()
    # Shape-checked: garbage on stdout must not be recorded as a commit.
    return sha if out.returncode == 0 and _SHA.fullmatch(sha) else UNAVAILABLE


def _event_payload(reasons: list[str]) -> dict[str, Any]:
    """GitHub's webhook payload for this run, or {}. Never returned as-is.

    Exactly three scalars are lifted out of this below. The payload also
    carries committer email addresses and the full message of every commit in
    a push; none of that is evidence about a verdict, and this report is
    uploaded as a public artifact.
    """
    where = os.environ.get("GITHUB_EVENT_PATH", "")
    if not where:
        return {}
    path = Path(where)
    if not path.is_file():
        reasons.append("event payload: GITHUB_EVENT_PATH is not a file")
        return {}
    if path.stat().st_size > _MAX_EVENT_BYTES:
        reasons.append(f"event payload: larger than {_MAX_EVENT_BYTES} bytes")
        return {}
    data: Any = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        reasons.append("event payload: not a JSON object")
        return {}
    return cast("dict[str, Any]", data)


def _sha_field(source: dict[str, Any], key: str) -> str | None:
    value = source.get(key)
    return value if isinstance(value, str) and _SHA.fullmatch(value) else None


def pull_request_context(reasons: list[str]) -> dict[str, Any] | None:
    """PR number and the two SHAs it spans, or None on a non-PR event.

    None rather than a filled-in guess: on a `push` there is no pull request,
    and inventing a base SHA would make a report say something false about
    what it compared.
    """
    payload = _event_payload(reasons)
    raw = payload.get("pull_request")
    if not isinstance(raw, dict):
        return None
    request = cast("dict[str, Any]", raw)
    head: Any = request.get("head")
    base: Any = request.get("base")
    number: Any = payload.get("number", request.get("number"))
    return {
        "number": number if isinstance(number, int) else None,
        "head_sha": _sha_field(cast("dict[str, Any]", head), "sha")
        if isinstance(head, dict) else None,
        "base_sha": _sha_field(cast("dict[str, Any]", base), "sha")
        if isinstance(base, dict) else None,
    }


def commit_identity() -> dict[str, Any]:
    """Did this runner test the tree GitHub says it tested?

    `identity_verified` is three-valued on purpose:

        True   both SHAs are known and equal
        False  both SHAs are known and DIFFER -- the runner tested a tree
               GitHub does not believe it tested, so no verdict from this run
               is a verdict about the change
        None   not determinable: no GITHUB_SHA (a local run), or git could not
               be asked. "Not checked" is not "checked and fine".

    Equality is the right comparison for BOTH event types this repository runs.
    On `push`, GITHUB_SHA is the pushed commit. On `pull_request`, GITHUB_SHA
    is the generated merge commit and actions/checkout defaults to that same
    merge ref -- so they agree, and the check does not fire on every PR. That
    holds only while no checkout overrides `ref:`; tests/test_evidence.py
    asserts none in verify.yml does, so this assumption fails a test rather
    than reddening twelve gates the day someone adds one.
    """
    reasons: list[str] = []
    expected = os.environ.get("GITHUB_SHA", "local")
    actual = _safe(reasons, "checked_out_sha", checked_out_sha)
    if not _SHA.fullmatch(expected) or not _SHA.fullmatch(str(actual)):
        verified = None  # nothing to compare; do not report a pass
    else:
        verified = actual == expected
    return {"checked_out_sha": actual, "expected_sha": expected,
            "identity_verified": verified, "collection_errors": reasons}


def provenance() -> dict[str, Any]:
    """Which workflow file, which event, which pull request, which tree."""
    identity = commit_identity()
    reasons = cast("list[str]", identity["collection_errors"])
    try:
        request = pull_request_context(reasons)
    except BaseException as exc:  # noqa: BLE001 - the recorder must not die
        # None, not the UNAVAILABLE string: "no pull request" and "could not
        # read the pull request" must both be falsy, or a consumer testing
        # `if report["pull_request"]` reads a failure as a PR.
        reasons.append(f"pull_request: {type(exc).__name__}: {str(exc)[:120]}")
        request = None
    return {
        # `.github/workflows/verify.yml@refs/heads/main` -- WHICH version of
        # the workflow ran. "the workflow passed" does not say which workflow.
        "workflow_ref": os.environ.get("GITHUB_WORKFLOW_REF", "local"),
        "event": os.environ.get("GITHUB_EVENT_NAME", "local"),
        "pull_request": request,
        "commit_identity": identity,
    }


def degraded_provenance(reason: str) -> dict[str, Any]:
    """Same keys, stated reason, when provenance collection failed outright."""
    identity: dict[str, Any] = {f: UNAVAILABLE for f in COMMIT_IDENTITY_FIELDS}
    identity["identity_verified"] = None
    identity["collection_errors"] = [reason]
    block: dict[str, Any] = {f: UNAVAILABLE for f in PROVENANCE_FIELDS}
    block["pull_request"] = None
    block["commit_identity"] = identity
    return block


class Gate:
    """Context manager implementing the gate lifecycle."""

    def __init__(self, name: str, version: str = "1.0.0",
                 tools: dict[str, list[str]] | None = None) -> None:
        self.name = name
        self.version = version
        self.tools_spec = tools or {}
        # Populated by __enter__, but defined here so to_dict() works on a Gate
        # that was never entered.
        self.tools: dict[str, str] = {}
        self.environment: dict[str, Any] | None = None
        self.provenance: dict[str, Any] | None = None
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
        # After duration_ms on purpose. duration_ms is measured against the
        # workflow's timeout-minutes budget, so it must mean "how long the gate
        # took", not "how long the gate took plus how long the recorder took".
        # The fingerprint's own cost is measured offline, not self-reported:
        # a self-timing field would make the block non-deterministic and two
        # fingerprints would stop being comparable.
        self.environment = self.collect_environment()
        self.provenance = self.collect_provenance()
        # A runner that tested a different tree than GitHub believes has not
        # produced a verdict about the change, whatever the gate concluded.
        # That is an infrastructure failure, not a gate failure: the code was
        # never judged. Escalated here, before to_dict, so the report carries
        # the downgraded status rather than contradicting it.
        identity = cast("dict[str, Any]", self.provenance["commit_identity"])
        if identity["identity_verified"] is False:
            self.infrastructure_failure(
                f"checked-out tree {identity['checked_out_sha']} is not the "
                f"commit GitHub attributes this run to "
                f"({identity['expected_sha']})")
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
    def collect_environment(self) -> dict[str, Any]:
        """The fingerprint, guaranteed. The outer boundary of the collector.

        _safe() already contains a failure in one field. This contains a
        failure of the collector itself -- a bad probe table, a monkeypatched
        module, an import that went wrong. Either way the report is written
        and the reason is in it, because a gate that crashes while recording
        a failure has destroyed the evidence it exists to produce.
        """
        try:
            command = str(self.scope.get("command", ""))
            return environment_fingerprint(command, self.tools)
        except BaseException as exc:  # noqa: BLE001 - deliberate, see docstring
            return degraded_environment(
                f"environment collector raised {type(exc).__name__}: "
                f"{str(exc)[:120]}", self.tools)

    def collect_provenance(self) -> dict[str, Any]:
        """The provenance block, guaranteed. Same contract as the above."""
        try:
            return provenance()
        except BaseException as exc:  # noqa: BLE001 - the recorder must not die
            return degraded_provenance(
                f"provenance collector raised {type(exc).__name__}: "
                f"{str(exc)[:120]}")

    def to_dict(self, duration_ms: int) -> dict[str, Any]:
        passed = sum(1 for c in self.checks if c["result"] == PASS)
        environment = (self.environment if self.environment is not None
                       else self.collect_environment())
        origin = (self.provenance if self.provenance is not None
                  else self.collect_provenance())
        # One source, so the two views cannot disagree: tool_versions stays a
        # top-level field because ci/gates.toml requires it, and is exactly the
        # tools sub-block -- now including the ones derived from the command,
        # not only the ones the gate declared up front.
        measured = cast("dict[str, str]", environment.get("tools", self.tools))
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
            # WHICH version of WHICH workflow file, and what caused it to run.
            "workflow_ref": origin["workflow_ref"],
            "event": origin["event"],
            # None on a push: there is no pull request, and a guess would be a
            # false statement about what was compared.
            "pull_request": origin["pull_request"],
            # Did this runner test the tree GitHub says it tested?
            "commit_identity": origin["commit_identity"],
            "started_at": self.started_at,
            "ended_at": self.ended_at,
            "duration_ms": duration_ms,
            "tool_versions": measured,
            # What produced this verdict. Without it, "the same commit passed
            # on Tuesday and failed today" has no answer in the evidence.
            "environment": environment,
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
        environment = self.environment or {}
        for k in ENVIRONMENT_FIELDS:
            if k == "tools":
                continue
            print(f"{k}={environment.get(k, UNAVAILABLE)}")
        tools = cast("dict[str, str]",
                     environment.get("tools", self.tools))
        for k, v in tools.items():
            print(f"tool.{k}={v}")
        origin = self.provenance or {}
        print("\n[PROVENANCE]")
        for k in PROVENANCE_FIELDS:
            if k == "commit_identity":
                continue
            print(f"{k}={origin.get(k, UNAVAILABLE)}")
        identity = cast("dict[str, Any]",
                        origin.get("commit_identity", {}))
        for k in COMMIT_IDENTITY_FIELDS:
            print(f"{k}={identity.get(k, UNAVAILABLE)}")
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
