#!/usr/bin/env python3
"""RULESET ALIGNMENT — does GitHub enforce what ci/gates.toml declares?

ci/gates.toml carries a `[ruleset]` block listing the checks that are supposed
to be required. Nothing compared it against GitHub, so `gate_integrity.py`
check 9 validated the manifest against itself. Half the drift was already
covered and half was invisible:

    ruleset requires a check no gate declares   merges hang forever
                                                -> caught by gate_integrity 9
    a gate is mandatory but GitHub does not      the gate runs, goes red, and
    require its check                            the PR merges anyway
                                                -> caught by NOTHING

The second one is the dangerous direction. It produces a repository full of
working gates that block nothing, which looks exactly like a repository whose
gates work.

WHY THIS IS A CI GATE NOW.
The previous version of this docstring argued it could not be one: reading a
ruleset "needs repository administration access", the default GITHUB_TOKEN has
`contents: read`, so in CI this "would fail for lack of permission on every
run". That was never measured, and it is false for this repository:

    $ curl -s -o /dev/null -w '%{http_code}' \
        https://api.github.com/repos/Intellora-ai/final-countdown/rulesets/20990225
    200

Intellora-ai/final-countdown is public, and a public repository's rulesets are
public. The anonymous response carries every field this check reads: all 17
`required_status_checks` entries with their `integration_id`, and the
`code_scanning` rule's tool list. Only `bypass_actors` is withheld, and
nothing here reads it.

So the check needs no credentials at all, and both of the bad options the old
docstring was choosing between disappear. There is no "no token" state to
excuse, so there is no NOT_APPLICABLE branch and no fork-shaped hole.

`gh` is still tried first, because an authenticated call gets 1000 requests
per hour per repository where an anonymous one gets 60 per hour per IP, and CI
runners share IPs. When `gh` cannot authenticate — a pull request from a fork,
a GITHUB_TOKEN without `administration: read`, no GH_TOKEN set at all — the
anonymous fallback returns the identical data. The fork case is therefore not
a special case, not a skip, and not a hole: it is the same comparison.

WHAT COUNTS AS WHAT — scripts/gate.py's vocabulary, with its meanings:

    exit 0   PASS                     manifest and GitHub agree
    exit 1   FAIL                     they disagree: drift, and it fails closed
    exit 2   INFRASTRUCTURE_FAILURE   the ruleset could not be read at all

NOT_APPLICABLE is deliberately unreachable here. Every candidate for it — "no
credentials", "a fork PR", "GitHub said 403" — is an omission bypass: a check
that excuses itself whenever it cannot see is a check an attacker only has to
blind. scripts/tcb_gate.py returns 2 and says why for exactly this reason,
rather than passing.

Exit 2 is red, and that is the point: "could not compare" is not "aligned".
The defence against going red on GitHub's bad day is not to make the gate
green, it is to make "could not compare" rare — two independent transports and
bounded retries below — so that when it does go red, it means something.

    python3 scripts/check_ruleset.py
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import time
import tomllib
from pathlib import Path
from typing import Any, cast

MANIFEST = Path("ci/gates.toml")
REPO = "Intellora-ai/final-countdown"

# gate.py's result vocabulary, carried as exit codes. Named this way rather
# than as module-level PASS/FAIL string constants because bandit's B105 keys
# on the identifier, and scripts/security_gate.py's exemption list covers only
# B404 and B603 for this file.
EXIT_ALIGNED = 0  # gate.py PASS
EXIT_DRIFT = 1  # gate.py FAIL
EXIT_CANNOT_COMPARE = 2  # gate.py INFRASTRUCTURE_FAILURE

# Bounded: a gate that retries forever is a gate that hits the job timeout with
# no verdict at all. Three tries per transport, ~7s of backoff worst case.
ATTEMPTS = 3
BACKOFF_S = (2.0, 5.0)
TIMEOUT_S = 30

# Answers that will not change if we ask again. Retrying these only burns the
# job's clock and arrives at the same place.
DETERMINISTIC_HTTP = (401, 403, 404)


class Unreachable(RuntimeError):
    """The ruleset could not be read.

    `transient` says whether asking again could plausibly help. It controls
    retrying only — it never decides the verdict, because "I could not look"
    is the same answer to the merge question either way.
    """

    def __init__(self, why: str, transient: bool) -> None:
        super().__init__(why)
        self.transient = transient


def _parse(raw: str, source: str) -> dict[str, Any]:
    try:
        parsed: object = json.loads(raw)
    except ValueError as exc:
        raise Unreachable(
            f"{source} returned output that is not JSON: {exc}", transient=True
        ) from exc
    if not isinstance(parsed, dict):
        raise Unreachable(
            f"{source} returned JSON that is not a ruleset object", transient=False
        )
    return cast("dict[str, Any]", parsed)


def _gh_fetch(repo: str, ruleset_id: int) -> dict[str, Any]:
    """Authenticated read, for the higher rate limit."""
    gh = shutil.which("gh")
    if gh is None:
        raise Unreachable("gh is not on PATH", transient=False)
    try:
        out = subprocess.run(
            [gh, "api", f"repos/{repo}/rulesets/{ruleset_id}"],
            capture_output=True,
            text=True,
            timeout=TIMEOUT_S,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise Unreachable(f"gh could not reach GitHub: {exc}", transient=True) from exc
    if out.returncode != 0:
        err = (out.stderr or out.stdout).strip()[:200]
        # A token that is missing, expired or unauthorised will still be
        # missing, expired and unauthorised in two seconds. Fall through to the
        # anonymous transport instead of retrying the same refusal.
        denied = "auth" in err.lower() or any(
            str(code) in err for code in DETERMINISTIC_HTTP
        )
        raise Unreachable(
            f"gh api failed (exit {out.returncode}): {err}", transient=not denied
        )
    return _parse(out.stdout, "gh")


def _curl_fetch(repo: str, ruleset_id: int) -> dict[str, Any]:
    """Anonymous read. A public repository's rulesets are public.

    This is the transport that makes the gate work with no credentials, so it
    is also the one that carries a pull request from a fork.
    """
    curl = shutil.which("curl")
    if curl is None:
        raise Unreachable("curl is not on PATH", transient=False)
    url = f"https://api.github.com/repos/{repo}/rulesets/{ruleset_id}"
    try:
        out = subprocess.run(
            [
                curl,
                "-sS",
                "-H",
                "Accept: application/vnd.github+json",
                "-w",
                "\n%{http_code}",
                url,
            ],
            capture_output=True,
            text=True,
            timeout=TIMEOUT_S,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise Unreachable(
            f"curl could not reach GitHub: {exc}", transient=True
        ) from exc
    if out.returncode != 0:
        raise Unreachable(
            f"curl failed (exit {out.returncode}): {out.stderr.strip()[:200]}",
            transient=True,
        )
    body, _, code_text = out.stdout.rpartition("\n")
    try:
        code = int(code_text.strip())
    except ValueError:
        raise Unreachable("curl reported no HTTP status", transient=True) from None
    if code != 200:
        # Say which kind of "no" this was. A rate limit is the one 403 that
        # time alone fixes, and it is the plausible one here: an anonymous
        # caller gets 60 requests per hour per IP and CI runners share IPs.
        # Naming it in the log is what stops a human reading a rate limit as
        # a deleted ruleset.
        note = _describe(code, body)
        raise Unreachable(
            f"GitHub answered HTTP {code} for the ruleset{note}",
            transient=code not in DETERMINISTIC_HTTP or "rate limit" in body.lower(),
        )
    return _parse(body, "curl")


def _describe(code: int, body: str) -> str:
    if "rate limit" in body.lower():
        return (
            " — anonymous rate limit exhausted for this runner's IP; "
            "an authenticated GH_TOKEN raises it to 1000/hr per repository"
        )
    if code in DETERMINISTIC_HTTP:
        return " — the repository may be private, or the ruleset deleted"
    return f": {body.strip()[:160]}"


def fetch_ruleset(repo: str, ruleset_id: int) -> dict[str, Any]:
    """The live ruleset, or Unreachable. Never guesses, never returns a default.

    Authenticated first for the rate limit, anonymous second because the data
    is public and the authenticated identity may not be allowed to ask for it.
    """
    reasons: list[str] = []
    for transport in (_gh_fetch, _curl_fetch):
        for attempt in range(ATTEMPTS):
            try:
                return transport(repo, ruleset_id)
            except Unreachable as exc:
                reasons.append(str(exc))
                if not exc.transient or attempt == ATTEMPTS - 1:
                    break
                time.sleep(BACKOFF_S[min(attempt, len(BACKOFF_S) - 1)])
    # dict.fromkeys de-duplicates while keeping the order the failures happened.
    raise Unreachable(
        " | ".join(dict.fromkeys(reasons)) or "no transport ran", transient=False
    )


def _rules(ruleset: dict[str, Any], rule_type: str) -> list[dict[str, Any]]:
    raw: object = ruleset.get("rules")
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for item in cast("list[object]", raw):
        if not isinstance(item, dict):
            continue
        rule = cast("dict[str, Any]", item)
        if rule.get("type") == rule_type:
            out.append(rule)
    return out


def _parameter_list(rule: dict[str, Any], key: str) -> list[dict[str, Any]]:
    params: object = rule.get("parameters")
    if not isinstance(params, dict):
        return []
    raw: object = cast("dict[str, Any]", params).get(key)
    if not isinstance(raw, list):
        return []
    return [
        cast("dict[str, Any]", i)
        for i in cast("list[object]", raw)
        if isinstance(i, dict)
    ]


def live_checks(ruleset: dict[str, Any]) -> list[dict[str, Any]]:
    """Every context GitHub actually requires.

    An empty list is a real answer, not an error: an admin who deletes the
    required_status_checks rule outright leaves zero required contexts, and
    that must read as total drift rather than as nothing to compare.
    """
    out: list[dict[str, Any]] = []
    for rule in _rules(ruleset, "required_status_checks"):
        out.extend(_parameter_list(rule, "required_status_checks"))
    return out


def live_tools(ruleset: dict[str, Any]) -> list[str]:
    out: list[str] = []
    for rule in _rules(ruleset, "code_scanning"):
        out.extend(
            str(t.get("tool")) for t in _parameter_list(rule, "code_scanning_tools")
        )
    return sorted(out)


def main() -> int:
    if not MANIFEST.is_file():
        print(f"CANNOT COMPARE: {MANIFEST} is missing")
        return EXIT_CANNOT_COMPARE
    manifest = tomllib.loads(MANIFEST.read_text(encoding="utf-8"))
    ruleset_decl: dict[str, Any] = manifest.get("ruleset", {})
    declared = sorted(str(c) for c in ruleset_decl.get("required_checks", []))
    mandatory = sorted(
        name
        for name, spec in manifest.get("gates", {}).items()
        if spec.get("mandatory")
    )
    ruleset_id = ruleset_decl.get("id")
    repo = str(ruleset_decl.get("repository", REPO))

    print(f"manifest: {MANIFEST}  ruleset id {ruleset_id}  repo {repo}")

    ok = True
    # Checked without network: a mandatory gate the manifest itself forgot to
    # require is drift, and it is free to detect.
    if set(mandatory) != set(declared):
        ok = False
        print("MISMATCH inside the manifest:")
        for name in sorted(set(mandatory) - set(declared)):
            print(f"  mandatory but not in required_checks: {name}")
        for name in sorted(set(declared) - set(mandatory)):
            print(f"  required but not a mandatory gate:    {name}")

    if not isinstance(ruleset_id, int):
        print("CANNOT COMPARE: ruleset id is missing from the manifest")
        return EXIT_CANNOT_COMPARE
    try:
        live = fetch_ruleset(repo, ruleset_id)
    except Unreachable as exc:
        # Not "aligned", not "misaligned" — unknown. Say so, and go red.
        print(f"CANNOT COMPARE: {exc}")
        print(
            "\n[RESULT] INFRASTRUCTURE_FAILURE — the live ruleset could not "
            "be read, so drift was neither confirmed nor ruled out."
        )
        return EXIT_CANNOT_COMPARE

    checks = live_checks(live)
    live_contexts = sorted(str(c.get("context")) for c in checks)
    not_enforced = sorted(set(declared) - set(live_contexts))
    not_declared = sorted(set(live_contexts) - set(declared))

    if not_enforced:
        ok = False
        print(
            "GATES THAT BLOCK NOTHING — declared required, GitHub does not "
            "require them:"
        )
        for name in not_enforced:
            print(f"  {name}")
    if not_declared:
        ok = False
        print("CHECKS GITHUB REQUIRES THAT THE MANIFEST DOES NOT DECLARE:")
        for name in not_declared:
            print(f"  {name}")

    # A context not pinned to an app can be satisfied by any actor that reports
    # a status with that name, which is a required check anyone can forge.
    unpinned = sorted(
        str(c.get("context")) for c in checks if c.get("integration_id") is None
    )
    if unpinned:
        ok = False
        print("CONTEXTS NOT PINNED TO AN APP (any actor may satisfy them):")
        for name in unpinned:
            print(f"  {name}")

    # The code_scanning rule is enforcement too: a tool the manifest declares
    # but GitHub does not run means those findings block nothing.
    declared_tools = sorted(str(t) for t in ruleset_decl.get("code_scanning_tools", []))
    if declared_tools:
        enforced_tools = live_tools(live)
        if enforced_tools != declared_tools:
            ok = False
            print("CODE-SCANNING TOOL MISMATCH:")
            for t in sorted(set(declared_tools) - set(enforced_tools)):
                print(f"  declared but GitHub does not enforce: {t}")
            for t in sorted(set(enforced_tools) - set(declared_tools)):
                print(f"  GitHub enforces but manifest omits:   {t}")
        else:
            print(f"  code-scanning tools enforced: {', '.join(enforced_tools)}")

    if ok:
        print(
            f"ALIGNED: {len(live_contexts)} required checks, all pinned, "
            f"manifest and GitHub agree"
        )
        print("  " + ", ".join(live_contexts))
        print("\n[RESULT] PASS")
        return EXIT_ALIGNED
    print(
        "\n[RESULT] FAIL — ci/gates.toml and the live ruleset disagree. "
        "Reconcile them; do not silence this."
    )
    return EXIT_DRIFT


if __name__ == "__main__":
    sys.exit(main())
