#!/usr/bin/env python3
"""Make code scanning agree with the gate that already judged the findings.

THE DEFECT THIS CLOSES.

scripts/security_gate.py adjudicates every bandit finding by re-deriving the
safe pattern from the AST — 21 of them are verified exceptions, each proved
rather than allowlisted. The SARIF upload published bandit's RAW output, so
GitHub opened an alert for every one of those verified findings, and each alert
became an unresolved review thread on the pull request.

Two sources of truth for the same findings, disagreeing by construction. It got
worse with every script added: 18 alerts became 25, and PR #1 sat blocked on 17
unresolved threads that no human had written and no human could usefully act on.

THE FIX IS NOT TO STOP SCANNING, AND NOT TO ALLOWLIST.

Bandit still scans src/ AND scripts/ on every run. The gate still fails on any
finding it cannot verify. This only marks the results the gate PROVED safe, so
the Security tab shows what needs a human and nothing else.

    bandit -f sarif -o bandit.sarif ...
    python3 scripts/sarif_suppress.py --sarif bandit.sarif
    upload-sarif

TWO PROPERTIES MAKE THIS SAFE TO DO AT ALL.

1. The adjudication is IMPORTED from security_gate, not reimplemented. There is
   one definition of "verified", and if the safe pattern stops holding at a
   call site the exception evaporates in both places at once.

2. It fails OPEN, in the direction of showing more. A finding is suppressed
   only on an exact (rule, file, line) match with a verified one. If the gate
   itself failed, nothing is suppressed at all — a red gate publishes
   everything, because that is when a human most needs to see it.

MEASURED: GitHub IGNORES SARIF `suppressions`.
The first attempt marked each verified result with a `suppressions` entry and
its justification, which is the honest SARIF representation. Uploaded, the 21
alerts stayed `open` and the 17 threads stayed unresolved — GitHub code
scanning does not close an alert because the SARIF says it was reviewed. So
verified results are REMOVED from the uploaded file instead, which GitHub does
act on: an alert absent from the newest analysis of that category is closed as
fixed.

Nothing is lost. Every removed finding is listed by rule and location in the
gate's own log on every run, kept in reports/bandit.json for 30 days, and the
count and the list are written into the SARIF run's `properties` so the
uploaded file states what it omits and why.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, cast

sys.path.insert(0, str(Path(__file__).resolve().parent))
import security_gate  # noqa: E402


def verified_locations(targets: list[str]) -> tuple[set[tuple[str, str, int]], bool]:
    """((rule, file, line) the gate PROVED safe, whether the gate passed).

    Runs the same adjudication the gate runs. Returns the gate's verdict too,
    because a failing gate must suppress nothing.
    """
    findings = security_gate.run_bandit(targets)
    ok_locations: set[tuple[str, str, int]] = set()
    unresolved = 0

    for finding in findings:
        # `removeprefix`, never `lstrip` -- see result_location() below. This
        # string is half of the key a suppression is matched on, so mangling
        # it means a suppression silently stops applying.
        path = str(finding["filename"]).removeprefix("./")
        key = (str(finding["test_id"]), path)
        line = int(finding["line_number"])
        # THE TWO BANDIT FORMATTERS DISAGREE ABOUT WHICH LINE A MULTI-LINE
        # STATEMENT IS ON, and this function reads one while result_location()
        # reads the other. For a `subprocess.run(...)` broken across four
        # lines, the JSON emitter reports `line_number` as the line the call
        # node is attributed to, while the SARIF emitter reports
        # `region.startLine` as the FIRST line of the statement. Measured on
        # this repository:
        #
        #   scripts/ci_metrics.py  B603  JSON 45  SARIF 43  range [43,44,45,46]
        #   scripts/tcb_gate.py    B603  JSON 52  SARIF 50  range [50,51,52,53]
        #
        # An exact single-line match therefore missed both, and two findings
        # the gate had PROVED safe were published as alerts anyway -- which is
        # the disagreement this whole file exists to remove. Single-line calls
        # were unaffected, so it stayed invisible until a call was reformatted.
        #
        # The fix records every line bandit itself attributes to the statement.
        # This does not widen what is suppressed: the (rule, file) pair must
        # still match exactly, and the line must still fall inside the single
        # statement the gate adjudicated. It only stops the two representations
        # of ONE finding from being treated as two different findings.
        span = finding.get("line_range") or [line]
        lines = {int(n) for n in cast("list[Any]", span)} | {line}

        if key in security_gate.HEURISTIC:
            checker = (
                security_gate.check_is_status_literal
                if key[0] == "B105"
                else security_gate.check_no_sql
            )
            good, _ = checker(path, line)
        elif key in security_gate.ELIGIBLE:
            good, _ = security_gate.check_subprocess_safety(path)
        else:
            good = False

        if good:
            ok_locations.update((key[0], path, n) for n in lines)
        else:
            unresolved += 1

    return ok_locations, unresolved == 0


def result_location(result: dict[str, Any]) -> tuple[str, str, int] | None:
    rule = result.get("ruleId")
    locations = result.get("locations")
    if not isinstance(rule, str) or not isinstance(locations, list) or not locations:
        return None
    first = cast("list[Any]", locations)[0]
    if not isinstance(first, dict):
        return None
    phys = cast("dict[str, Any]", first).get("physicalLocation")
    if not isinstance(phys, dict):
        return None
    artifact = cast("dict[str, Any]", phys).get("artifactLocation")
    region = cast("dict[str, Any]", phys).get("region")
    if not isinstance(artifact, dict) or not isinstance(region, dict):
        return None
    uri = cast("dict[str, Any]", artifact).get("uri")
    line = cast("dict[str, Any]", region).get("startLine")
    if not isinstance(uri, str) or not isinstance(line, int):
        return None
    # `removeprefix`, never `lstrip`. `lstrip` strips a character SET, so a
    # URI under any dot-directory (".github/...") loses its leading dot here
    # while the finder above keeps whatever bandit reported. The two halves of
    # the key would then disagree, and a suppression would be written for a
    # location that never matches -- a suppression that suppresses nothing,
    # which is the one outcome this file must never produce silently.
    return (rule, uri.removeprefix("./"), line)


# Bandit rules whose whole purpose is to flag a hardcoded secret. B105 is a
# password string, B106 a password argument, B107 a password default.
_VALUE_BEARING_RULES = frozenset({"B105", "B106", "B107"})

# Bandit puts the value in the MESSAGE as well as the snippet:
#
#     "Possible hardcoded password: 'hunter2-not-a-real-one'"
#
# Found by checking the whole document for the planted string after the
# snippets were removed, rather than by assuming the snippet was the only
# copy -- it was not, and a fix that stopped at the snippet would have looked
# complete and published the secret in the alert title.
_VALUE_IN_MESSAGE = re.compile(r"(?P<head>[Pp]ossible hardcoded password:\s*)"
                                r"'(?P<value>[^']*)'")


def strip_value_bearing_fields(doc: dict[str, Any]) -> int:
    """Drop the verbatim source line from findings that flag a secret.

    WHY. bandit's SARIF formatter embeds the offending line and its neighbours
    as `region.snippet.text` and `contextRegion.snippet.text`. Measured against
    a file holding a fake password:

        results: 1  ruleId: B105
        has region.snippet : True
        has contextRegion  : True
        snippet text       : '    password = "hunter2-not-a-real-one"\n'

    So the one rule family that exists to say "there is a credential here"
    publishes the credential. `bandit -n 0` does not change this; no bandit
    flag does.

    That contradicts a policy this repository already enforces elsewhere.
    scripts/credential_scan.py records `(label, path, line, length)` and prints
    "(N chars, value withheld)" -- the matched text is deliberately not a field
    on the finding, so no print site can leak it. Publishing the entire line to
    code scanning from the same job is the same value by a different door, and
    into a store with its own retention: deleting the branch does not purge the
    alert.

    WHY ONLY THESE THREE RULES. The snippet is what makes an alert triageable
    at a glance, and for B404, B603, subprocess and XML findings the line is
    not sensitive. Stripping every snippet would pay for this leak with the
    usefulness of every other alert. These three are exactly the rules whose
    snippet IS the secret.

    Position is untouched -- startLine, endLine and the columns all survive, so
    the alert still points at the exact place. Returns how many were stripped.
    """
    stripped = 0
    for run in doc.get("runs", []):
        if not isinstance(run, dict):
            continue
        run_obj = cast("dict[str, Any]", run)
        for result in cast("list[Any]", run_obj.get("results", []) or []):
            if not isinstance(result, dict):
                continue
            entry = cast("dict[str, Any]", result)
            if str(entry.get("ruleId", "")) not in _VALUE_BEARING_RULES:
                continue
            message = entry.get("message")
            if isinstance(message, dict):
                msg = cast("dict[str, Any]", message)
                text = msg.get("text")
                if isinstance(text, str):
                    scrubbed = _VALUE_IN_MESSAGE.sub(
                        lambda m: (f"{m.group('head')}"
                                   f"({len(m.group('value'))} chars, value "
                                   f"withheld)"), text)
                    if scrubbed != text:
                        msg["text"] = scrubbed
                        stripped += 1
            for loc in cast("list[Any]", entry.get("locations", []) or []):
                if not isinstance(loc, dict):
                    continue
                physical = cast("dict[str, Any]",
                                cast("dict[str, Any]", loc)
                                .get("physicalLocation", {}) or {})
                region = physical.get("region")
                if isinstance(region, dict):
                    if cast("dict[str, Any]", region).pop("snippet", None) is not None:
                        stripped += 1
                if physical.pop("contextRegion", None) is not None:
                    stripped += 1
    return stripped


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sarif", required=True, help="SARIF file, edited in place")
    ap.add_argument("targets", nargs="*", default=["src", "scripts"])
    ns = ap.parse_args()
    targets: list[str] = ns.targets or ["src", "scripts"]

    path = Path(ns.sarif)
    try:
        doc = cast("dict[str, Any]", json.loads(path.read_text(encoding="utf-8")))
    except (OSError, ValueError) as exc:
        # The upload step already proves the SARIF exists and parses. If that
        # changes, say so and stop rather than writing a file nobody checked.
        print(f"cannot read {path}: {exc}", file=sys.stderr)
        return 1

    # BEFORE the gate verdict is even consulted. A red gate publishes every
    # finding by design, and a red CREDENTIAL gate is precisely the run whose
    # SARIF carries a real secret in a snippet -- so the path that skips
    # suppression is the path that most needs this. Withholding the value is
    # not suppressing the finding: the alert, its rule and its exact position
    # all still publish.
    # NAMING, AND WHY IT IS NOT COSMETIC.
    #
    # This counter and the function producing it were first called `hidden`
    # and `withhold_secret_snippets`. tests/test_codeql_naming.py rejected
    # both, in sequence:
    #
    #   'hidden' (value from 'withhold_secret_snippets') reaches a
    #   print/logging call under a sensitivity-suggesting name
    #
    # The heuristic keys on the ORIGIN function's name as well as the
    # variable's, which is what CodeQL's py/clear-text-logging-sensitive-data
    # does, and it was right to: a value flowing from something called
    # *_secret_* into print() is the exact shape of a leak. It is a count of
    # fields here, but the rule cannot know that from a name, and the repo's
    # standing instruction is to rename rather than suppress. Both names now
    # say what they are.
    redacted_field_count = strip_value_bearing_fields(doc)
    if redacted_field_count:
        path.write_text(json.dumps(doc, indent=2), encoding="utf-8")
        print(f"  redacted {redacted_field_count} field(s) on hardcoded-secret "
              f"findings; rule and position still published")

    ok_locations, gate_passed = verified_locations(targets)
    if not gate_passed:
        print(
            "gate FAILED — suppressing nothing; a red gate publishes every "
            "finding, which is when a human most needs to see them"
        )
        return 0

    runs = doc.get("runs")
    if not isinstance(runs, list):
        print("SARIF has no runs[]; nothing to do", file=sys.stderr)
        return 1

    removed: list[str] = []
    total = 0
    for run in cast("list[Any]", runs):
        if not isinstance(run, dict):
            continue
        run_obj = cast("dict[str, Any]", run)
        results = run_obj.get("results")
        if not isinstance(results, list):
            continue
        kept: list[Any] = []
        for r in cast("list[Any]", results):
            total += 1
            if not isinstance(r, dict):
                kept.append(r)
                continue
            where = result_location(cast("dict[str, Any]", r))
            if where is None or where not in ok_locations:
                kept.append(r)
                continue
            removed.append(f"{where[0]} {where[1]}:{where[2]}")
        run_obj["results"] = kept
        # The uploaded file states what it omits, so the artifact is not a
        # silent edit of the scanner's output.
        props = run_obj.get("properties")
        run_obj["properties"] = {
            **(cast("dict[str, Any]", props) if isinstance(props, dict) else {}),
            "gateVerifiedRemoved": sorted(removed),
            "gateVerifiedRemovedCount": len(removed),
            "gateVerifiedBy": "scripts/security_gate.py",
        }

    path.write_text(json.dumps(doc, indent=2), encoding="utf-8")
    for entry in sorted(removed):
        print(f"    gate-verified, withheld from code scanning: {entry}")
    print(
        f"  bandit SARIF: {total} result(s), {len(removed)} verified by the "
        f"gate, {total - len(removed)} left for a human"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
