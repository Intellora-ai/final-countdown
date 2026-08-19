#!/usr/bin/env python3
"""RULESET ALIGNMENT — does GitHub enforce what ci/gates.toml declares?

ci/gates.toml carries a `[ruleset]` block listing the checks that are supposed
to be required. Nothing compared it against GitHub, so `gate_integrity.py`
check 6 validated the manifest against itself. Half the drift was already
covered and half was invisible:

    ruleset requires a check no gate declares   merges hang forever
                                                -> caught by gate_integrity 6
    a gate is mandatory but GitHub does not      the gate runs, goes red, and
    require its check                            the PR merges anyway
                                                -> caught by NOTHING

The second one is the dangerous direction. It produces a repository full of
working gates that block nothing, which looks exactly like a repository whose
gates work.

WHY THIS IS NOT A CI GATE.
Reading a ruleset needs repository administration access. The default
GITHUB_TOKEN has `contents: read`, so in CI this would fail for lack of
permission on every run. The available workarounds are both worse than being
honest: treating "no credentials" as NOT_APPLICABLE would make an absent token
disable the check silently, which is the same omission bypass the evidence
layer already rejects; and requiring an admin PAT as a secret is a decision
about credentials that belongs to the repository owner, not to this script.

So this runs on demand, and says plainly which state it observed. It exits
non-zero when it could not check, because "could not compare" is not "aligned".

    python3 scripts/check_ruleset.py
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tomllib
from pathlib import Path
from typing import Any, cast

MANIFEST = Path("ci/gates.toml")
REPO = "Intellora-ai/final-countdown"

QUERY = ('[.rules[] | select(.type=="required_status_checks") '
         '| .parameters.required_status_checks[] '
         '| {context: .context, integration_id: .integration_id}]')

TOOLS_QUERY = ('[.rules[] | select(.type=="code_scanning") '
               '| .parameters.code_scanning_tools[] | .tool]')


def live_checks(repo: str, ruleset_id: int) -> list[dict[str, Any]]:
    """What GitHub actually requires. Raises RuntimeError if it cannot say."""
    gh = shutil.which("gh")
    if gh is None:
        raise RuntimeError("gh is not on PATH, so GitHub cannot be consulted")
    try:
        out = subprocess.run(
            [gh, "api", f"repos/{repo}/rulesets/{ruleset_id}", "--jq", QUERY],
            capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.SubprocessError) as exc:
        raise RuntimeError(f"gh could not reach GitHub: {exc}") from exc
    if out.returncode != 0:
        raise RuntimeError(
            f"gh api failed (exit {out.returncode}): "
            f"{(out.stderr or out.stdout).strip()[:200]}")
    try:
        parsed: object = json.loads(out.stdout)
    except ValueError as exc:
        raise RuntimeError(f"gh returned output that is not JSON: {exc}") from exc
    if not isinstance(parsed, list):
        raise RuntimeError("gh returned JSON that is not a list of checks")
    return cast("list[dict[str, Any]]", parsed)


def main() -> int:
    if not MANIFEST.is_file():
        print(f"CANNOT COMPARE: {MANIFEST} is missing")
        return 1
    manifest = tomllib.loads(MANIFEST.read_text(encoding="utf-8"))
    ruleset: dict[str, Any] = manifest.get("ruleset", {})
    declared = sorted(str(c) for c in ruleset.get("required_checks", []))
    mandatory = sorted(name for name, spec in manifest.get("gates", {}).items()
                       if spec.get("mandatory"))
    ruleset_id = ruleset.get("id")
    repo = str(ruleset.get("repository", REPO))

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
        return 1
    try:
        live = live_checks(repo, ruleset_id)
    except RuntimeError as exc:
        # Not "aligned", not "misaligned" — unknown. Say so and exit non-zero.
        print(f"CANNOT COMPARE: {exc}")
        return 1

    live_contexts = sorted(str(c.get("context")) for c in live)
    not_enforced = sorted(set(declared) - set(live_contexts))
    not_declared = sorted(set(live_contexts) - set(declared))

    if not_enforced:
        ok = False
        print("GATES THAT BLOCK NOTHING — declared required, GitHub does not "
              "require them:")
        for name in not_enforced:
            print(f"  {name}")
    if not_declared:
        ok = False
        print("CHECKS GITHUB REQUIRES THAT THE MANIFEST DOES NOT DECLARE:")
        for name in not_declared:
            print(f"  {name}")

    # A context not pinned to an app can be satisfied by any actor that reports
    # a status with that name, which is a required check anyone can forge.
    unpinned = sorted(str(c.get("context")) for c in live
                      if c.get("integration_id") is None)
    if unpinned:
        ok = False
        print("CONTEXTS NOT PINNED TO AN APP (any actor may satisfy them):")
        for name in unpinned:
            print(f"  {name}")

    # The code_scanning rule is enforcement too: a tool the manifest declares
    # but GitHub does not run means those findings block nothing.
    declared_tools = sorted(str(t) for t in ruleset.get("code_scanning_tools", []))
    if declared_tools:
        try:
            raw_tools = subprocess.run(
                [str(shutil.which("gh")), "api",
                 f"repos/{repo}/rulesets/{ruleset_id}", "--jq", TOOLS_QUERY],
                capture_output=True, text=True, timeout=60)
            live_tools = sorted(str(t) for t in json.loads(raw_tools.stdout))
        except (OSError, ValueError, subprocess.SubprocessError) as exc:
            print(f"CANNOT COMPARE code-scanning tools: {exc}")
            return 1
        if live_tools != declared_tools:
            ok = False
            print("CODE-SCANNING TOOL MISMATCH:")
            for t in sorted(set(declared_tools) - set(live_tools)):
                print(f"  declared but GitHub does not enforce: {t}")
            for t in sorted(set(live_tools) - set(declared_tools)):
                print(f"  GitHub enforces but manifest omits:   {t}")
        else:
            print(f"  code-scanning tools enforced: {', '.join(live_tools)}")

    if ok:
        print(f"ALIGNED: {len(live_contexts)} required checks, all pinned, "
              f"manifest and GitHub agree")
        print("  " + ", ".join(live_contexts))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
