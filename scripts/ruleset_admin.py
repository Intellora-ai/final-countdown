#!/usr/bin/env python3
"""Read and safely amend the LIVE GitHub ruleset.

The rulesets API has no "add one required check" call — the only write is
PUT, a full replacement. Hand-writing that body is how unrelated protections
get deleted by accident: omit `bypass_actors` and it resets, omit the
`code_scanning` rule and CodeQL enforcement silently disappears.

So this never composes a body from scratch. It GETs the live ruleset, mutates
exactly the required_status_checks list, and PUTs the rest back byte-identical.
Then it GETs again and diffs, because a write that reports 200 is not evidence
that the state is what you intended.

    python3 scripts/ruleset_admin.py show
    python3 scripts/ruleset_admin.py probe          # no-op PUT: permission test
    python3 scripts/ruleset_admin.py add CONTEXT... # add required checks

`probe` exists because "can this token write the ruleset" must be answered
before the answer matters, and answering it by attempting the real change
risks a partial write.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from typing import Any, cast

REPO = "Intellora-ai/final-countdown"
RULESET_ID = 20990225
# GitHub Actions. A context with no integration_id can be satisfied by any
# actor that posts a status of that name, which is a required check anyone
# can forge.
ACTIONS_APP = 15368

# Fields the PUT accepts. Anything the GET returns that is not here is
# read-only metadata (id, node_id, timestamps, _links, source*) and must not
# be sent back.
WRITABLE = ("name", "target", "enforcement", "conditions", "rules",
            "bypass_actors")


def gh(args: list[str], body: str | None = None) -> str:
    # Absolute path from shutil.which, never the bare name: a partial
    # executable path resolves through PATH, and this command holds repository
    # admin rights. bandit flags it as B607 and the safe-pattern checker in
    # scripts/security_gate.py refuses the exception without it.
    exe = shutil.which("gh")
    if exe is None:
        raise SystemExit("gh is not on PATH; cannot reach the GitHub API")
    out = subprocess.run([exe, *args], input=body, capture_output=True,
                         text=True, timeout=120)
    if out.returncode != 0:
        raise SystemExit(f"gh {' '.join(args)} failed ({out.returncode}):\n"
                         f"{(out.stderr or out.stdout).strip()[:800]}")
    return out.stdout


def fetch() -> dict[str, Any]:
    return cast("dict[str, Any]",
                json.loads(gh(["api", f"repos/{REPO}/rulesets/{RULESET_ID}"])))


def strip_nulls(rule: Any) -> dict[str, Any]:
    """Drop null-valued parameters from one rule.

    Measured, not guessed: the GET returns `code_coverage` with
    `max_coverage_drop: null`, and PUTting that exact value back is rejected
    with `422 Invalid property /rules/6: data matches no possible input`.
    The API emits a field it will not accept. Null means "unset" here, so
    removing it reproduces the same state and the write is accepted.
    """
    if not isinstance(rule, dict):
        return rule
    typed = cast("dict[str, Any]", rule)
    params = typed.get("parameters")
    if not isinstance(params, dict):
        return typed
    kept = {k: v for k, v in cast("dict[str, Any]", params).items()
            if v is not None}
    return dict(typed, parameters=kept)


def body_from(live: dict[str, Any]) -> dict[str, Any]:
    """The PUT body that reproduces `live` exactly, minus unsendable nulls."""
    body = {k: live[k] for k in WRITABLE if k in live}
    if "rules" in body:
        body["rules"] = [strip_nulls(r) for r in cast("list[Any]", body["rules"])]
    return body


def checks_rule(rules: list[Any]) -> dict[str, Any] | None:
    for r in rules:
        if isinstance(r, dict) and \
                cast("dict[str, Any]", r).get("type") == "required_status_checks":
            return cast("dict[str, Any]", r)
    return None


def contexts(live: dict[str, Any]) -> list[str]:
    rule = checks_rule(cast("list[Any]", live.get("rules", [])))
    if rule is None:
        return []
    params = cast("dict[str, Any]", rule.get("parameters", {}))
    raw = cast("list[Any]", params.get("required_status_checks", []))
    return [str(cast("dict[str, Any]", c).get("context")) for c in raw]


def put(body: dict[str, Any]) -> dict[str, Any]:
    return cast("dict[str, Any]", json.loads(gh(
        ["api", "--method", "PUT", f"repos/{REPO}/rulesets/{RULESET_ID}",
         "--input", "-"], json.dumps(body))))


def summarise(live: dict[str, Any]) -> str:
    rules = cast("list[Any]", live.get("rules", []))
    kinds = sorted(str(cast("dict[str, Any]", r).get("type")) for r in rules)
    return json.dumps({
        "enforcement": live.get("enforcement"),
        "conditions": live.get("conditions"),
        "bypass_actors": live.get("bypass_actors"),
        "rule_types": kinds,
        "required_status_checks": sorted(contexts(live)),
    }, indent=2, sort_keys=True)


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    action = sys.argv[1]
    before = fetch()

    if action == "show":
        print(summarise(before))
        return 0

    if action == "probe":
        # Write the live state back unchanged. Success proves the token may
        # write; failure names the exact permission that is missing. Either
        # way the ruleset is untouched.
        put(body_from(before))
        after = fetch()
        same = summarise(before) == summarise(after)
        print("WRITE PERMITTED — no-op PUT accepted, ruleset unchanged"
              if same else "WROTE, BUT STATE CHANGED — inspect immediately")
        return 0 if same else 1

    if action == "add":
        wanted = sys.argv[2:]
        if not wanted:
            print("add needs at least one context", file=sys.stderr)
            return 2
        rules = cast("list[Any]", before["rules"])
        rule = checks_rule(rules)
        if rule is None:
            print("no required_status_checks rule to amend", file=sys.stderr)
            return 1
        params = cast("dict[str, Any]", rule["parameters"])
        existing = cast("list[Any]", params["required_status_checks"])
        have = {str(cast("dict[str, Any]", c).get("context")) for c in existing}
        added = [c for c in wanted if c not in have]
        for context in added:
            existing.append({"context": context, "integration_id": ACTIONS_APP})

        body = body_from(before)
        put(body)
        after = fetch()

        # Prove the amendment, and prove nothing else moved.
        got = set(contexts(after))
        expected = have | set(wanted)
        ok = got == expected
        preserved = (
            before.get("enforcement") == after.get("enforcement")
            and before.get("conditions") == after.get("conditions")
            and before.get("bypass_actors") == after.get("bypass_actors")
            and sorted(str(cast("dict[str, Any]", r).get("type"))
                       for r in cast("list[Any]", before["rules"]))
            == sorted(str(cast("dict[str, Any]", r).get("type"))
                      for r in cast("list[Any]", after["rules"])))
        print(f"added: {added or '(already present)'}")
        print(f"required checks now ({len(got)}): {sorted(got)}")
        print(f"context set as intended: {ok}")
        print(f"other rules preserved:   {preserved}")
        return 0 if (ok and preserved) else 1

    print(f"unknown action {action!r}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
