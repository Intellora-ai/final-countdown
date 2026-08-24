#!/usr/bin/env python3
"""Merge the registry parts into one registry, and refuse to if they lie.

The specification's acceptance test is that there is exactly one record for
every inventory item. That is checkable, so it is checked here rather than
asserted in a report: this script exits non-zero unless the merged registry
agrees with `inventory.txt` on every id, name and category.

The validations that matter are the ones that catch a registry drifting away
from the thing it claims to describe:

  COUNT        550 records, ids 1..550, no gaps, no repeats.
  FIDELITY     Every name and category byte-identical to the inventory. A
               registry that renames "Apache ECharts" to "ECharts" is a
               registry that no longer answers the question it was built for.
  ENUMS        Every enumerated field holds a declared value. An unknown
               readiness level is worse than a missing one.
  EVIDENCE     P2 and above require a measured version. This is the rule that
               stops the registry from inflating: a level is a claim about
               what was observed, and a claim with no observation behind it
               makes every other level untrustworthy too.
  CANONICAL    A non-canonical record points at a lower id sharing its
               technology_id. Fifteen names recur in the spec; this keeps the
               duplicates from being counted as separate technologies.

    python3 technology-universe/registry/build.py            # build + validate
    python3 technology-universe/registry/build.py --check    # validate only
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
INVENTORY = HERE / "inventory.txt"
PARTS = HERE / "parts"
OUT = HERE

ECOSYSTEMS = {
    "javascript",
    "python",
    "rust",
    "go",
    "jvm",
    "c-cpp",
    "lean",
    "ocaml",
    "haskell",
    "native",
    "browser",
    "container",
    "spec",
}
KINDS = {
    "library",
    "framework",
    "runtime",
    "cli-tool",
    "service",
    "platform-api",
    "standard",
    "alternative-group",
}
INSTALL = {
    "npm",
    "pip",
    "cargo",
    "go",
    "maven",
    "elan",
    "opam",
    "brew",
    "apt",
    "binary-release",
    "source-build",
    "oci-image",
    "builtin",
    "none",
}
LICENSE_CLASS = {
    "OPEN_SOURCE",
    "SOURCE_AVAILABLE",
    "FREE_BUT_RESTRICTED",
    "COMMERCIAL_RESTRICTIONS",
    "SPECIAL_LICENSE",
    "LICENSE_REVIEW_REQUIRED",
}
READINESS = {"P0", "P1", "P2", "P3", "P4", "P5"}
PRODUCTION = {"available", "service", "platform-api", "toolchain", "review-required"}
VERIFICATION = {"unverified", "present", "version-measured", "smoke-tested"}
SECURITY = {"unscanned", "scanned-clean", "review-required"}
CONTAINER = {"native", "official-image", "community-image", "not-applicable"}
PLATFORMS = {"linux", "macos", "windows", "browser"}
DEPLOY = {
    "local",
    "docker",
    "compose",
    "kubernetes",
    "browser",
    "serverless",
    "desktop",
}

# Levels that are a claim about this machine rather than about the world.
MEASURED_LEVELS = {"P2", "P3", "P4", "P5"}


def read_inventory() -> dict[int, tuple[str, str, int]]:
    """id -> (name, category, category_number), straight from the spec."""
    out: dict[int, tuple[str, str, int]] = {}
    category = ""
    category_number = 0
    for line in INVENTORY.read_text(encoding="utf-8").splitlines():
        heading = re.match(r"^##\s+(\d+)\.\s+(.*)$", line)
        if heading:
            category_number = int(heading.group(1))
            category = heading.group(2).strip()
            continue
        item = re.match(r"^(\d+)\.\s+(.*)$", line)
        if item and category:
            out[int(item.group(1))] = (item.group(2).strip(), category, category_number)
    return out


def load_parts() -> list[dict[str, Any]]:
    if not PARTS.is_dir():
        raise SystemExit(f"no parts directory at {PARTS}")
    records: list[dict[str, Any]] = []
    for path in sorted(PARTS.glob("*.json")):
        loaded = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(loaded, list):
            raise SystemExit(f"{path.name} is not a JSON array")
        for record in loaded:
            record["_part"] = path.name
            records.append(record)
    return records


def enum_problem(record: dict[str, Any], field: str, allowed: set[str]) -> str | None:
    value = record.get(field)
    if value not in allowed:
        return f"{field}={value!r} not one of {sorted(allowed)}"
    return None


def validate(
    records: list[dict[str, Any]], inventory: dict[int, tuple[str, str, int]]
) -> list[str]:
    problems: list[str] = []

    ids = [r.get("id") for r in records]
    counts = Counter(ids)
    for dup, n in sorted(counts.items()):
        if n > 1:
            problems.append(f"id {dup} appears {n} times")

    missing = sorted(set(inventory) - set(counts))
    extra = sorted(set(counts) - set(inventory))
    if missing:
        problems.append(
            f"{len(missing)} inventory ids have no record: "
            f"{missing[:20]}{' ...' if len(missing) > 20 else ''}"
        )
    if extra:
        problems.append(f"{len(extra)} records are not in the inventory: {extra}")

    by_tech: dict[str, list[int]] = defaultdict(list)

    for record in records:
        rid = record.get("id")
        where = f"id {rid} ({record.get('_part')})"
        if rid not in inventory:
            continue

        name, category, category_number = inventory[rid]
        if record.get("name") != name:
            problems.append(
                f"{where}: name {record.get('name')!r} != inventory {name!r}"
            )
        if record.get("category") != category:
            problems.append(
                f"{where}: category {record.get('category')!r} != {category!r}"
            )
        if record.get("category_number") != category_number:
            problems.append(
                f"{where}: category_number "
                f"{record.get('category_number')} != {category_number}"
            )

        for field, allowed in (
            ("ecosystem", ECOSYSTEMS),
            ("kind", KINDS),
            ("install_method", INSTALL),
            ("license_class", LICENSE_CLASS),
            ("readiness", READINESS),
            ("production_status", PRODUCTION),
            ("verification_status", VERIFICATION),
            ("security_status", SECURITY),
            ("container_support", CONTAINER),
        ):
            bad = enum_problem(record, field, allowed)
            if bad:
                problems.append(f"{where}: {bad}")

        for field, allowed in (
            ("platform_support", PLATFORMS),
            ("deployment_support", DEPLOY),
        ):
            values = record.get(field)
            if not isinstance(values, list):
                problems.append(f"{where}: {field} is not a list")
                continue
            unknown = sorted(set(values) - allowed)
            if unknown:
                problems.append(f"{where}: {field} has unknown {unknown}")

        # The rule that keeps the levels honest.
        if record.get("readiness") in MEASURED_LEVELS and not record.get("version"):
            problems.append(
                f"{where}: readiness {record.get('readiness')} claims this was "
                "installed and measured, but version is null"
            )

        tech = record.get("technology_id")
        if not isinstance(tech, str) or not tech:
            problems.append(f"{where}: technology_id missing")
        else:
            by_tech[tech].append(rid)

    for tech, group in sorted(by_tech.items()):
        lowest = min(group)
        for rid in group:
            record = next(r for r in records if r.get("id") == rid)
            is_canonical = bool(record.get("canonical"))
            if rid == lowest and not is_canonical:
                problems.append(
                    f"id {rid}: lowest id for {tech!r} but canonical is false"
                )
            if rid != lowest and is_canonical:
                problems.append(
                    f"id {rid}: repeats {tech!r} first seen at {lowest} but "
                    "claims canonical"
                )
            if rid != lowest and record.get("canonical_id") != lowest:
                problems.append(
                    f"id {rid}: canonical_id={record.get('canonical_id')} "
                    f"should be {lowest}"
                )

    return problems


def emit(records: list[dict[str, Any]]) -> None:
    clean = [{k: v for k, v in r.items() if k != "_part"} for r in records]
    clean.sort(key=lambda r: r["id"])

    (OUT / "technologies.json").write_text(
        json.dumps(clean, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    (OUT / "versions.json").write_text(
        json.dumps(
            {
                str(r["id"]): {
                    "name": r["name"],
                    "package": r.get("package"),
                    "version": r.get("version"),
                    "install_method": r.get("install_method"),
                }
                for r in clean
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    (OUT / "licenses.json").write_text(
        json.dumps(
            {
                str(r["id"]): {
                    "name": r["name"],
                    "license": r.get("license"),
                    "license_class": r.get("license_class"),
                    "notes": r.get("notes", ""),
                }
                for r in clean
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    (OUT / "deployment.json").write_text(
        json.dumps(
            {
                str(r["id"]): {
                    "name": r["name"],
                    "kind": r.get("kind"),
                    "container_support": r.get("container_support"),
                    "deployment_support": r.get("deployment_support", []),
                }
                for r in clean
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    (OUT / "security.json").write_text(
        json.dumps(
            {
                str(r["id"]): {
                    "name": r["name"],
                    "security_status": r.get("security_status"),
                    "ecosystem": r.get("ecosystem"),
                }
                for r in clean
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    (OUT / "compatibility.json").write_text(
        json.dumps(
            {
                str(r["id"]): {
                    "name": r["name"],
                    "platform_support": r.get("platform_support", []),
                    "runtime_requirements": r.get("runtime_requirements", []),
                }
                for r in clean
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )


def summarise(records: list[dict[str, Any]]) -> str:
    readiness = Counter(r.get("readiness") for r in records)
    licence = Counter(r.get("license_class") for r in records)
    kind = Counter(r.get("kind") for r in records)
    eco = Counter(r.get("ecosystem") for r in records)
    canonical = sum(1 for r in records if r.get("canonical"))
    measured = sum(1 for r in records if r.get("version"))

    lines = [
        f"  records            {len(records)}",
        f"  canonical          {canonical}",
        f"  duplicate entries  {len(records) - canonical}",
        f"  version measured   {measured}",
        "",
        "  readiness:",
    ]
    lines += [
        f"    {k or '?':22s} {v}"
        for k, v in sorted(readiness.items(), key=lambda x: str(x[0]))
    ]
    lines += ["", "  license_class:"]
    lines += [
        f"    {k or '?':30s} {v}"
        for k, v in sorted(licence.items(), key=lambda x: -x[1])
    ]
    lines += ["", "  kind:"]
    lines += [
        f"    {k or '?':22s} {v}" for k, v in sorted(kind.items(), key=lambda x: -x[1])
    ]
    lines += ["", "  ecosystem:"]
    lines += [
        f"    {k or '?':22s} {v}" for k, v in sorted(eco.items(), key=lambda x: -x[1])
    ]
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--check",
        action="store_true",
        help="validate without writing the merged registry",
    )
    ns = ap.parse_args()

    inventory = read_inventory()
    records = load_parts()

    print(
        f"[REGISTRY BUILD]\n  inventory items    {len(inventory)}\n"
        f"  part files         {len(list(PARTS.glob('*.json')))}"
    )

    problems = validate(records, inventory)
    if problems:
        print(f"\nFAIL — {len(problems)} problem(s):\n", file=sys.stderr)
        for problem in problems[:60]:
            print(f"  {problem}", file=sys.stderr)
        if len(problems) > 60:
            print(f"  ... and {len(problems) - 60} more", file=sys.stderr)
        return 1

    print("\n" + summarise(records))
    if not ns.check:
        emit(records)
        print("\n  wrote technologies.json, versions.json, licenses.json,")
        print("        deployment.json, security.json, compatibility.json")
    print("\nPASS — one record per inventory item, every field declared")
    return 0


if __name__ == "__main__":
    sys.exit(main())
