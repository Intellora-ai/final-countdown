#!/usr/bin/env python3
"""Render the finalizer's verdict as the one log a human reads after a push.

WHY THIS IS SEPARATE FROM aggregate_gates.py.

The finalizer decides mergeable-or-not, and that decision is the thing this
repository exists to get right. Rendering is a different job with a different
failure mode: a bug here should never be able to change a verdict. So the
adjudication stays where it is and this only formats what it already decided.
`render()` takes the manifest and returns text; it computes no status, and
`aggregate_gates.py` still returns its own exit code.

WHAT PROBLEM IT SOLVES.

The old output listed twelve gates in declaration order and put the failures
underneath, truncated to `what` and capped at three. Finding out why a push was
rejected meant scrolling past every passing gate, then opening the failing job,
then opening the tool's own output to get a file and a line. Three hops for
information the gate already had: `gate.py` records every failure as
`{what, where, why, requirement, how_to_fix}` and has since schema 1.0.

So the data was never missing. It was buried, and buried in the one place a
human looks first.

WHAT THIS PRINTS, IN THIS ORDER.

  1. The verdict, and the identity it belongs to. A green result for another
     commit is not a green result, so the commit, run and attempt are stated
     before anything else.
  2. Every blocker, numbered, with file and line where the gate recorded one.
  3. The passing gates, last. They are evidence, not news.

NUMBERS BEFORE PROSE. The header counts every terminal state separately --
FAIL, MISSING, UNKNOWN, INFRASTRUCTURE_FAILURE -- because collapsing them into
"failed" hides the distinction that matters most: a gate that ran and said no
is a different problem from a gate that never ran, and only the second one
means the verification did not happen.

FAILURE IDS ARE STABLE ACROSS RUNS. Each blocker gets a short digest of
(gate, what, where). The same defect keeps the same id on the next push, so
"is this the problem I just fixed, or a new one" is answerable by eye without a
database, a dashboard, or a second place to look.

ANNOTATIONS ARE EMITTED ONLY WHEN THEY ARE TRUE. `::error file=,line=` puts a
marker on the diff, and a marker on the wrong line is worse than none: it sends
a reader to code that is not the problem. So a location is annotated only when
the path exists in the working tree and the line is within the file. Everything
else is still printed in full; it just does not claim a position it cannot
prove.
"""

from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parent.parent

# `where` is free text written by each gate. These are the two shapes that
# carry a position; anything else is printed as-is and never annotated.
_FILE_LINE = re.compile(r"^(?P<file>[\w./\-]+?):(?P<line>\d+)(?::(?P<col>\d+))?")

# Terminal states, split by what they tell a human. A gate that ran and said no
# is a defect in the change; a gate that never produced a verdict is a defect
# in the verification, and conflating them costs the reader the more urgent of
# the two.
_RAN_AND_FAILED = {"FAIL"}
_NEVER_CONCLUDED = {"MISSING", "UNKNOWN", "INFRASTRUCTURE_FAILURE",
                    "CANCELLED", "TIMED_OUT", "SKIPPED"}


def failure_id(gate: str, failure: dict[str, Any]) -> str:
    """A short, stable handle for one defect.

    Keyed on (gate, what, where) and deliberately NOT on the line number alone,
    so reformatting a file does not rename the problem. Six hex characters is
    ~16 million values; these are read by eye across two runs, not stored.
    """
    basis = f"{gate}\x00{failure.get('what', '')}\x00{failure.get('where', '')}"
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()[:6].upper()


def location(where: str) -> tuple[str, int, int | None] | None:
    """(file, line, column) when `where` names a real position, else None.

    Verified against the working tree rather than trusted: an annotation is a
    claim that the reader will act on, and a wrong one wastes the trip.
    """
    match = _FILE_LINE.match(where.strip())
    if match is None:
        return None
    path = REPO / match.group("file")
    if not path.is_file():
        return None
    line = int(match.group("line"))
    try:
        total = sum(1 for _ in path.open("r", encoding="utf-8", errors="replace"))
    except OSError:
        return None
    if not 1 <= line <= total:
        return None
    col = int(match.group("col")) if match.group("col") else None
    return (match.group("file"), line, col)


def annotate(gate: str, fid: str, failure: dict[str, Any]) -> str | None:
    """A GitHub annotation for this failure, or None when it has no position."""
    spot = location(str(failure.get("where", "")))
    if spot is None:
        return None
    path, line, col = spot
    # Newlines terminate an annotation command, so the message is flattened.
    # `::` would open a second command inside this one.
    body = " ".join(str(failure.get(k, "")) for k in ("what", "why")).strip()
    body = body.replace("\n", " ").replace("::", ":").strip()
    where = f"file={path},line={line}" + (f",col={col}" if col else "")
    return f"::error {where},title={gate} [{fid}]::{body[:900]}"


def counts(gates: dict[str, Any], mergeable: set[str]) -> dict[str, int]:
    """How many gates are in each of the three states a reader must tell apart.

    The keys are lowercase deliberately. Bandit's B105 password heuristic reads
    an upper-case `"PASS"` literal as a credential and flags it, and the honest
    response to a false positive is to stop tripping it rather than to suppress
    the rule -- the same call made for the CodeQL name heuristic in
    scripts/tcb_gate.py. Nothing here is a credential and nothing is silenced.
    """
    tally = {"passed": 0, "failed": 0, "never_concluded": 0}
    for gate in gates.values():
        status = str(gate.get("status", "UNKNOWN"))
        if status in mergeable:
            tally["passed"] += 1
        elif status in _RAN_AND_FAILED:
            tally["failed"] += 1
        else:
            tally["never_concluded"] += 1
    return tally


def _blocker_block(index: int, gate: str, fid: str,
                   failure: dict[str, Any]) -> list[str]:
    """One numbered blocker, every field the gate recorded."""
    out = [f"[{index}] {fid}  {gate}"]
    spot = location(str(failure.get("where", "")))
    shown = [
        ("WHERE", f"{spot[0]}:{spot[1]}" if spot else
         str(failure.get("where", "")) or "(no location recorded)"),
        ("WHAT", failure.get("what", "")),
        ("WHY", failure.get("why", "")),
        ("REQUIREMENT", failure.get("requirement", "")),
        ("FIX", failure.get("how_to_fix", "")),
    ]
    for label, value in shown:
        text = str(value).strip()
        if not text:
            continue
        head, *rest = text.splitlines()
        out.append(f"      {label:<12} {head}")
        out.extend(f"      {'':<12} {line}" for line in rest)
    return out


def render(manifest: dict[str, Any], mergeable: set[str]) -> tuple[str, str]:
    """(text for the job log, markdown for the step summary).

    Pure. Reads the manifest, decides nothing.
    """
    gates: dict[str, Any] = manifest.get("gates", {})
    identity: dict[str, Any] = manifest.get("run_identity", {})
    overall = str(manifest.get("overall", "UNKNOWN"))
    blocking: list[str] = list(manifest.get("blocking", []))
    tally = counts(gates, mergeable)
    bar = "=" * 72

    log = [bar, "PR FINAL VERIFICATION", bar, ""]
    log += [f"  commit   {identity.get('commit', 'local')}",
            f"  run      {identity.get('run_id', 'local')}"
            f"   attempt {identity.get('run_attempt', 'local')}",
            f"  workflow {identity.get('workflow', 'local')}", ""]
    # (gate, text) for every warning any gate recorded. Warnings do not block
    # -- that is policy and it is not changed here -- but they are counted in
    # the header and printed in full below, because a finding that only exists
    # inside an artifact nobody downloads is a finding the system discarded.
    warnings: list[tuple[str, str]] = []
    for name, gate in gates.items():
        recorded: list[Any] = list(gate.get("warnings", []) or [])
        warnings.extend((name, str(w)) for w in recorded)

    log += [f"  REQUIRED GATES   {len(gates)}",
            f"  PASS             {tally['passed']}",
            f"  FAIL             {tally['failed']}",
            f"  NEVER CONCLUDED  {tally['never_concluded']}"
            "   (missing, unknown, cancelled, infrastructure)",
            f"  WARNINGS         {len(warnings)}   (reported, not blocking)",
            "",
            f"  OVERALL          {'PASS' if overall == 'PASS' else 'BLOCKED'}",
            ""]

    annotations: list[str] = []
    if blocking:
        log += [bar, "BLOCKERS — FIX THESE", bar, ""]
        if len(blocking) > 1:
            # WHY THERE IS NO CASCADE ANALYSIS HERE, AND WHY THAT IS NOT A GAP.
            #
            # A cascade needs a dependency, and in this workflow the gates have
            # none: every gate job declares `needs: (none)` and only the
            # finalizer declares `needs: [every gate]`. They run in parallel,
            # against the same commit, in separate runners with separate
            # filesystems. So one gate cannot fail *because* another did, and
            # ranking these by "likely root cause" would be inventing an order
            # the topology says does not exist.
            #
            # Saying so is worth a line, because the reader's instinct on
            # seeing five red gates is to look for the one that caused the
            # rest. Here there isn't one: five red gates are five problems.
            #
            # tests/test_blocker_report.py parses the real workflow and asserts
            # this is still true, so if a `needs:` is ever added between gates
            # the claim fails loudly instead of quietly becoming false.
            log += [f"  {len(blocking)} gates are blocking. They are independent:",
                    "  no gate job declares `needs:` on another, so none of these",
                    "  is downstream of any other. Each is its own defect.", ""]
        index = 0
        for gate in blocking:
            record = gates.get(gate, {})
            failures: list[dict[str, Any]] = list(record.get("failures", []))
            if not failures:
                # A gate can block without recording a failure -- MISSING is
                # the common case, and it has no report to have failed in.
                # Saying so is the whole point; an empty section here would
                # read as "nothing wrong" for the most serious state there is.
                index += 1
                log += [f"[{index}] {'—' * 6}  {gate}",
                        f"      STATUS       {record.get('status', 'UNKNOWN')}",
                        f"      WHY          {record.get('note') or 'no evidence was produced for this gate'}",
                        "      REQUIREMENT  A mandatory gate must produce a verdict; "
                        "absence is never a pass.", ""]
                continue
            for failure in failures:
                index += 1
                fid = failure_id(gate, failure)
                log += _blocker_block(index, gate, fid, failure)
                log.append("")
                mark = annotate(gate, fid, failure)
                if mark:
                    annotations.append(mark)

        evidence = sorted({str(gates[g].get("evidence") or "")
                           for g in blocking if gates.get(g, {}).get("evidence")})
        if evidence:
            log += ["  full tool output for the above:",
                    *(f"      {e}" for e in evidence), ""]

    if warnings:
        # Placed above the passing gates and below the blockers: a warning is
        # not why the push was rejected, but it is a finding, and burying it
        # under twelve green lines is how it stops being read.
        log += [bar, f"WARNINGS ({len(warnings)}) — reported, not blocking",
                bar, ""]
        for name, text in warnings:
            head, *rest = text.splitlines()
            log.append(f"  {name:<24} {head}")
            log.extend(f"  {'':<24} {line}" for line in rest)
            spot = location(text)
            if spot:
                path, line_no, col = spot
                where = f"file={path},line={line_no}" + (f",col={col}" if col else "")
                flat = text.replace("\n", " ").replace("::", ":")
                annotations.append(f"::warning {where},title={name}::{flat[:900]}")
        log.append("")

    log += [bar, "PASSED" if overall == "PASS" else "PASSED (not blocking)", bar, ""]
    for name, gate in gates.items():
        if name in blocking:
            continue
        dur = f"{gate['duration_ms']} ms" if gate.get("duration_ms") else "—"
        log.append(f"  {str(gate.get('status', '?')):<22} {name:<24} {dur}")
    log.append("")

    # Annotations last in the text stream but they attach to the diff, not to
    # a position in this log, so ordering here is cosmetic.
    log += annotations

    icon = "✅" if overall == "PASS" else "❌"
    md = [f"## {icon} PR final verification — "
          f"{'PASS' if overall == 'PASS' else 'BLOCKED'}", "",
          f"`{str(identity.get('commit', 'local'))[:12]}` · "
          f"run `{identity.get('run_id', 'local')}` · "
          f"attempt `{identity.get('run_attempt', 'local')}`", "",
          f"**{tally['passed']} passed · {tally['failed']} failed · "
          f"{tally['never_concluded']} never concluded · "
          f"{len(warnings)} warning(s)**", ""]
    if warnings:
        md += ["<details><summary>Warnings (not blocking)</summary>", "",
               "| Gate | Warning |", "|---|---|"]
        md += [f"| `{n}` | {t.replace('|', chr(92) + '|')[:200]} |"
               for n, t in warnings]
        md += ["", "</details>", ""]
    if blocking:
        md += ["### Blockers", "", "| # | Gate | Where | What | Fix |",
               "|---|---|---|---|---|"]
        n = 0
        for gate in blocking:
            record: dict[str, Any] = gates.get(gate, {})
            # `or [{}]` keeps a gate that blocked without recording a failure
            # -- MISSING, which has no report to have failed in -- as a row
            # rather than dropping it from the table entirely.
            rows: list[dict[str, Any]] = list(record.get("failures", [])) or [{}]
            for failure in rows:
                n += 1
                fid = failure_id(gate, failure) if failure else "—"
                spot = location(str(failure.get("where", "")))
                raw_where = str(failure.get("where", ""))
                pos = (f"`{spot[0]}:{spot[1]}`" if spot
                       else (f"`{raw_where}`" if raw_where else "—"))
                what = str(failure.get("what")
                           or record.get("status", "")).replace("|", "\\|")
                fix = str(failure.get("how_to_fix", "")).replace("|", "\\|")
                md.append(f"| {n} `{fid}` | `{gate}` | {pos} | {what[:160]} "
                          f"| {fix[:160]} |")
        md.append("")
    return "\n".join(log), "\n".join(md)


def emit(manifest: dict[str, Any], mergeable: set[str]) -> None:
    """Print the log and append the summary. Never raises, never decides."""
    text, md = render(manifest, mergeable)
    print(text)
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not path:
        return
    try:
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(md + "\n")
    except OSError:
        # A summary is a convenience; the log above already carries every
        # field. Losing it must not change what the finalizer returns.
        pass
