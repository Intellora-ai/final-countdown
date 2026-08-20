#!/usr/bin/env python3
"""REGISTRY GATE — the registries must resolve against the system they describe.

ci/gates.toml answers "did the checks run". It cannot answer "which requirements
were verified, and which were not", because it has no denominator: it lists the
checks somebody wrote, and a requirement nobody wrote a check for leaves no
trace anywhere. ci/requirements.yml supplies that denominator and
ci/assumptions.yml records what the verdict rests on that no check establishes.

Two registries that describe a system they are not connected to rot in a week.
This gate is the connection. It proves, on every run:

  * every `verification:` names a gate that really is in ci/gates.toml
  * every `evidence:` equals, byte for byte, that gate's own `evidence` value
  * `severity: blocking` holds exactly when the cited gate is mandatory, so a
    requirement cannot claim to block on a gate that blocks nothing
  * no id is used twice in either file
  * every `severity`, `impact` and `status` is inside its closed set
  * the acceptance policy below

and then it PRINTS THE INVENTORY, which is the part a human reads: how many
requirements, how many verified, how many verified by nothing, and how many
assumptions sit at each status.

EXIT CODES
    0  the registries resolve and the policy holds
    1  findings — the registries are wrong about the system
    2  cannot run — a registry is missing, unparsable or structurally malformed

2 is never 0. A gate that cannot read its input has not checked it, and
"could not check" must not be indistinguishable from "checked and fine".

------------------------------------------------------------------------------
THE FAILURE POLICY, AND WHY IT IS NOT "FAIL ON high + unverified"
------------------------------------------------------------------------------
The obvious rule — fail the build on any high-impact assumption that has not
been tested — fails this repository today, permanently, for reasons no engineer
can fix. Eight of the nine high-impact assumptions are unverified, and most are
irreducible: TRUST.md classifies the Lean kernel as "the root", CPython's parser
as "it *is* Python's syntax", and scripts/spec_strength.py records that
strengthening observational into semantic equivalence is undecidable by Rice's
theorem. A gate that goes red because a true, documented, unclosable limitation
exists gets deleted inside a week — or, worse, every `impact: high` is quietly
edited to `medium` and the file becomes a decoration. Both outcomes destroy the
honesty the registry exists to hold, which is a strictly worse result than
having no registry at all.

The opposite rule — never fail on an assumption — is a gate that does nothing.

So this gate separates two things that "unverified" runs together: whether an
assumption has been TESTED, and whether its residual risk has been consciously
ACCEPTED. It fails on the second, never the first:

    impact: high + status: unverified   ->  needs `accepted:`, a real sentence
    status: falsified (any impact)      ->  needs `accepted:`, a real sentence
    impact: high + status: falsified    ->  fails outright, no escape

The escape hatch is not free, and that is the whole reason it works. ci/ is a
trusted path in scripts/tcb_gate.py, so adding an `accepted:` line to
ci/assumptions.yml requires a `TCB:` acknowledgement in a commit message saying
what changed in the trusted base and why. The hatch cannot be used quietly, the
count of accepted risks is printed on every run, and the text is required to be
long enough to be a sentence rather than a checkbox — the same reason
tcb_gate.py rejects a bare `TCB:` trailer.

`impact: high` + `status: falsified` gets no hatch because there is no version
of "we accept that a blocking verdict rests on a claim we have measured to be
false". That is a defect, not a risk.

------------------------------------------------------------------------------
WHY YAML, AND WHY THAT IS NOT A NEW DEPENDENCY
------------------------------------------------------------------------------
PyYAML is already direct intent in requirements.txt, already hash-pinned in
requirements.lock AND in requirements-preflight.lock, and already imported by
scripts/gate_integrity.py to parse workflow files. Reading these two registries
with `yaml.safe_load` therefore adds nothing to the trusted computing base. The
alternative — TOML via stdlib `tomllib` — would have been free too, and was
rejected only because prose paragraphs are the substance of both files and TOML
has no folded block scalar. ci/gates.toml stays TOML and is read with tomllib
here, so neither file changed format to suit the other.
"""

from __future__ import annotations

import argparse
import re
import sys
import tomllib
from pathlib import Path
from typing import Any, cast

import yaml

MANIFEST = Path("ci/gates.toml")
REQUIREMENTS = Path("ci/requirements.yml")
ASSUMPTIONS = Path("ci/assumptions.yml")

SCHEMA_VERSION = 1

# Closed sets. Anything outside them is a finding, never a shrug.
SEVERITIES = ("blocking", "advisory")
IMPACTS = ("high", "medium", "low")
STATUSES = ("verified", "falsified", "unverified", "not-applicable")

# The literal that means "nothing establishes this". Spelled out rather than
# left empty so an omission and a decision look different in a diff.
NOTHING = "none"

REQUIRED_REQ_FIELDS = (
    "id",
    "statement",
    "verification",
    "severity",
    "evidence",
    "source",
)
REQUIRED_ASM_FIELDS = (
    "id",
    "statement",
    "impact",
    "how_to_test",
    "status",
    "documented_in",
)
OPTIONAL_REQ_FIELDS = ("note",)
OPTIONAL_ASM_FIELDS = ("accepted", "note")

REQ_ID = re.compile(r"^REQ-\d{3}$")
ASM_ID = re.compile(r"^ASM-\d{3}$")

# Lengths, not adjectives. Each one names the thing it is there to reject.
MIN_STATEMENT = 20  # rejects "it works"
MIN_HOW_TO_TEST = 20  # rejects "run the tests"
MIN_ACCEPTED = 40  # rejects "known", "wontfix", "by design"

# Openers that describe an intention to think rather than an action to take.
# `how_to_test` has to be something a person could do tomorrow, so a plan to
# form a plan is rejected. Deliberately short: "review" and "read" are real
# actions here and are NOT on this list.
VAGUE_OPENERS = frozenset(
    {
        "investigate",
        "tbd",
        "todo",
        "unknown",
        "n/a",
        "consider",
        "explore",
        "research",
        "somehow",
        "maybe",
    }
)


class CannotRun(Exception):
    """The registry could not be read or is structurally malformed — exit 2."""


def load_manifest(path: Path) -> dict[str, dict[str, Any]]:
    if not path.is_file():
        raise CannotRun(f"{path} is missing")
    try:
        doc = tomllib.loads(path.read_text(encoding="utf-8"))
    except (tomllib.TOMLDecodeError, UnicodeDecodeError) as exc:
        raise CannotRun(f"{path} does not parse: {exc}") from exc
    raw = doc.get("gates")
    if not isinstance(raw, dict):
        raise CannotRun(f"{path} declares no [gates] table")
    gates = cast("dict[str, Any]", raw)
    out: dict[str, dict[str, Any]] = {}
    for name, spec in gates.items():
        if not isinstance(spec, dict):
            raise CannotRun(f"{path}: [gates.{name}] is not a table")
        out[name] = cast("dict[str, Any]", spec)
    return out


def load_rows(
    path: Path, collection: str, required: tuple[str, ...], optional: tuple[str, ...]
) -> list[dict[str, str]]:
    """Read one registry, or raise CannotRun.

    Shape defects raise (exit 2). Value defects do not — they are findings, and
    findings are the caller's business. The line between the two is whether the
    gate can evaluate the file at all.
    """
    if not path.is_file():
        raise CannotRun(f"{path} is missing")
    try:
        loaded = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (yaml.YAMLError, UnicodeDecodeError) as exc:
        raise CannotRun(f"{path} does not parse: {exc}") from exc
    if not isinstance(loaded, dict):
        raise CannotRun(f"{path} is not a mapping at the top level")
    doc = cast("dict[str, Any]", loaded)

    version = doc.get("version")
    if version != SCHEMA_VERSION:
        raise CannotRun(
            f"{path}: schema version {version!r}, this gate reads "
            f"{SCHEMA_VERSION}. An unknown version is not a version to guess at."
        )

    rows_raw = doc.get(collection)
    if not isinstance(rows_raw, list):
        raise CannotRun(f"{path}: `{collection}:` is missing or is not a list")
    rows = cast("list[Any]", rows_raw)
    if not rows:
        raise CannotRun(
            f"{path}: `{collection}:` is empty. An empty registry would let "
            f"this gate report success having checked nothing."
        )

    allowed = set(required) | set(optional)
    out: list[dict[str, str]] = []
    for index, row_raw in enumerate(rows, start=1):
        where = f"{path} entry {index}"
        if not isinstance(row_raw, dict):
            raise CannotRun(f"{where} is not a mapping")
        row = cast("dict[str, Any]", row_raw)
        entry: dict[str, str] = {}
        for field, value in row.items():
            name = str(field)
            # Leading underscore is this gate's own namespace, below. A row that
            # used it could overwrite the bookkeeping and hide its own defects.
            if name.startswith("_"):
                raise CannotRun(f"{where}: field `{name}` is reserved")
            if not isinstance(value, str):
                raise CannotRun(
                    f"{where}: `{name}` is {type(value).__name__}, not text"
                )
            entry[name] = value.strip()
        for field in required:
            if not entry.get(field):
                raise CannotRun(f"{where}: `{field}` is missing or empty")
        entry["_unknown"] = ",".join(sorted(set(entry) - allowed))
        entry["_where"] = where
        out.append(entry)
    return out


def duplicates(rows: list[dict[str, str]]) -> list[str]:
    seen: set[str] = set()
    repeated: list[str] = []
    for row in rows:
        ident = row["id"]
        if ident in seen and ident not in repeated:
            repeated.append(ident)
        seen.add(ident)
    return repeated


def check_requirements(
    rows: list[dict[str, str]], gates: dict[str, dict[str, Any]]
) -> list[str]:
    findings: list[str] = []

    for ident in duplicates(rows):
        findings.append(
            f"duplicate id {ident} in the requirement registry — two rows "
            f"claiming one id is an ambiguity, not redundancy"
        )

    for row in rows:
        ident = row["id"]
        if not REQ_ID.fullmatch(ident):
            findings.append(f"{row['_where']}: id {ident!r} is not REQ-nnn")
        if row["_unknown"]:
            findings.append(
                f"{ident}: unknown field(s) {row['_unknown']} — a mistyped "
                f"field is silently ignored, which is how a registry rots"
            )
        if len(row["statement"]) < MIN_STATEMENT:
            findings.append(
                f"{ident}: statement is {len(row['statement'])} characters; a "
                f"falsifiable sentence needs at least {MIN_STATEMENT}"
            )

        severity = row["severity"]
        if severity not in SEVERITIES:
            findings.append(
                f"{ident}: severity {severity!r} is outside {{{', '.join(SEVERITIES)}}}"
            )

        named = row["verification"]
        evidence = row["evidence"]

        if named == NOTHING:
            if evidence != NOTHING:
                findings.append(
                    f"{ident}: verification is `none` but evidence is "
                    f"{evidence!r} — nothing produces evidence for a "
                    f"requirement nothing verifies"
                )
            continue

        gate = gates.get(named)
        if gate is None:
            findings.append(
                f"{ident}: verification names gate {named!r}, which is not in "
                f"{MANIFEST}. Declared gates are: "
                f"{', '.join(sorted(gates))}"
            )
            continue

        declared = gate.get("evidence")
        if not isinstance(declared, str) or evidence != declared:
            findings.append(
                f"{ident}: evidence {evidence!r} does not match the evidence "
                f"gate {named!r} actually declares ({declared!r})"
            )

        mandatory = bool(gate.get("mandatory"))
        expected = "blocking" if mandatory else "advisory"
        if severity in SEVERITIES and severity != expected:
            findings.append(
                f"{ident}: severity is {severity!r} but gate {named!r} has "
                f"mandatory = {str(mandatory).lower()}, so it must be "
                f"{expected!r}. A requirement cannot block on a gate that "
                f"blocks nothing, and a gate that blocks must not be called "
                f"advisory"
            )
        if not mandatory:
            findings.append(
                f"{ident}: cites gate {named!r}, which is not mandatory. A "
                f"gate GitHub does not require runs, goes red, and the pull "
                f"request merges anyway — it cannot establish a requirement"
            )

    return findings


def check_assumptions(rows: list[dict[str, str]]) -> list[str]:
    findings: list[str] = []

    for ident in duplicates(rows):
        findings.append(
            f"duplicate id {ident} in the assumption registry — two rows "
            f"claiming one id is an ambiguity, not redundancy"
        )

    for row in rows:
        ident = row["id"]
        if not ASM_ID.fullmatch(ident):
            findings.append(f"{row['_where']}: id {ident!r} is not ASM-nnn")
        if row["_unknown"]:
            findings.append(
                f"{ident}: unknown field(s) {row['_unknown']} — a mistyped "
                f"field is silently ignored, which is how a registry rots"
            )
        if len(row["statement"]) < MIN_STATEMENT:
            findings.append(
                f"{ident}: statement is {len(row['statement'])} characters; "
                f"at least {MIN_STATEMENT} are needed to say anything"
            )

        impact = row["impact"]
        status = row["status"]
        if impact not in IMPACTS:
            findings.append(
                f"{ident}: impact {impact!r} is outside {{{', '.join(IMPACTS)}}}"
            )
        if status not in STATUSES:
            findings.append(
                f"{ident}: status {status!r} is outside {{{', '.join(STATUSES)}}}"
            )

        plan = row["how_to_test"]
        opener = plan.split()[0].strip(",.:;").lower() if plan.split() else ""
        if len(plan) < MIN_HOW_TO_TEST:
            findings.append(
                f"{ident}: how_to_test is {len(plan)} characters; a concrete "
                f"action needs at least {MIN_HOW_TO_TEST}"
            )
        elif opener in VAGUE_OPENERS:
            findings.append(
                f"{ident}: how_to_test opens with {opener!r}, which is an "
                f"intention to think rather than an action to take. Name what "
                f"someone would run or read, and what result would settle it"
            )

        findings.extend(
            acceptance_findings(ident, impact, status, row.get("accepted", ""))
        )

    return findings


def acceptance_findings(
    ident: str, impact: str, status: str, accepted: str
) -> list[str]:
    """The policy. See the module docstring for why it is shaped this way."""
    if impact == "high" and status == "falsified":
        return [
            f"{ident}: impact high and status falsified. A blocking verdict "
            f"resting on a claim measured to be false is a defect, not a risk, "
            f"and there is no acceptance that changes that. Fix it, or lower "
            f"the impact with a reason."
        ]

    needs = (impact == "high" and status == "unverified") or status == "falsified"

    if needs and len(accepted) < MIN_ACCEPTED:
        why = (
            "impact high and never tested"
            if status == "unverified"
            else "measured and found false"
        )
        return [
            f"{ident}: {why}, and `accepted:` is "
            f"{len(accepted)} characters. Policy needs at least "
            f"{MIN_ACCEPTED}: say why carrying this is acceptable and what "
            f"would close it. Editing ci/ also needs a TCB: acknowledgement, "
            f"so this cannot be done quietly."
        ]
    if not needs and accepted:
        return [
            f"{ident}: `accepted:` is set, but policy does not require it for "
            f"impact {impact!r} + status {status!r}. `accepted:` is reserved "
            f"for the policy escape — an acceptance that buys nothing hides "
            f"the ones that do. Move the text to `note:`."
        ]
    return []


def tally(
    rows: list[dict[str, str]], field: str, values: tuple[str, ...]
) -> dict[str, int]:
    counts = {v: 0 for v in values}
    for row in rows:
        if row[field] in counts:
            counts[row[field]] += 1
    return counts


def inventory(
    reqs: list[dict[str, str]],
    asms: list[dict[str, str]],
    gates: dict[str, dict[str, Any]],
) -> None:
    """The output a human reads. Counts, then the rows those counts came from."""
    unverified_reqs = [r for r in reqs if r["verification"] == NOTHING]
    covered = {r["verification"] for r in reqs} - {NOTHING}
    uncited = sorted(set(gates) - covered)
    sev = tally(reqs, "severity", SEVERITIES)

    print("[REGISTRY GATE]")
    print(
        f"manifest: {MANIFEST}   gates declared: {len(gates)}   "
        f"mandatory: {sum(1 for g in gates.values() if g.get('mandatory'))}"
    )

    print(f"\nrequirements: {len(reqs)}")
    print(f"  verified by a gate      {len(reqs) - len(unverified_reqs)}")
    print(f"  verification: none      {len(unverified_reqs)}")
    for name in SEVERITIES:
        print(f"  severity {name:<14} {sev[name]}")

    if unverified_reqs:
        print("\n  NOTHING VERIFIES THESE:")
        for row in unverified_reqs:
            print(f"    {row['id']}  [{row['severity']}]  {row['statement'][:88]}")

    print(
        f"\n  gates cited by at least one requirement: {len(covered)} of {len(gates)}"
    )
    if uncited:
        print(f"  cited by no requirement: {', '.join(uncited)}")

    status_counts = tally(asms, "status", STATUSES)
    impact_counts = tally(asms, "impact", IMPACTS)
    carried = [a for a in asms if a.get("accepted")]

    print(f"\nassumptions: {len(asms)}")
    for name in STATUSES:
        print(f"  status {name:<16} {status_counts[name]}")
    for name in IMPACTS:
        print(f"  impact {name:<16} {impact_counts[name]}")
    print(
        f"  high impact, not verified: "
        f"{sum(1 for a in asms if a['impact'] == 'high' and a['status'] != 'verified')}"
    )
    print(f"  carrying an accepted-risk statement: {len(carried)}")
    if carried:
        print("\n  ACCEPTED RISKS:")
        for row in carried:
            print(
                f"    {row['id']}  [{row['impact']}/{row['status']}]  "
                f"{row['statement'][:88]}"
            )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--gates", type=Path, default=MANIFEST)
    ap.add_argument("--requirements", type=Path, default=REQUIREMENTS)
    ap.add_argument("--assumptions", type=Path, default=ASSUMPTIONS)
    ns = ap.parse_args()

    try:
        gates = load_manifest(cast("Path", ns.gates))
        reqs = load_rows(
            cast("Path", ns.requirements),
            "requirements",
            REQUIRED_REQ_FIELDS,
            OPTIONAL_REQ_FIELDS,
        )
        asms = load_rows(
            cast("Path", ns.assumptions),
            "assumptions",
            REQUIRED_ASM_FIELDS,
            OPTIONAL_ASM_FIELDS,
        )
    except CannotRun as exc:
        print(f"CANNOT RUN: {exc}", file=sys.stderr)
        print(
            "A registry this gate cannot read has not been checked, and "
            "'could not check' is not 'checked and fine'.",
            file=sys.stderr,
        )
        return 2

    inventory(reqs, asms, gates)

    findings = check_requirements(reqs, gates) + check_assumptions(asms)
    if findings:
        print(f"\nFAIL — {len(findings)} finding(s):", file=sys.stderr)
        for finding in findings:
            print(f"  ✗ {finding}", file=sys.stderr)
        return 1

    print("\nOK — every reference resolves and the acceptance policy holds.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
