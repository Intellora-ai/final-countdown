#!/usr/bin/env python3
"""SBOM — CycloneDX JSON for one verification bundle.

WHAT IT COVERS, AND THE LIMIT STATED IN THE DOCUMENT ITSELF. The inventory is derived from
the two dependency files this repository actually has: `requirements.lock`, which pins
every Python package to an exact version with hashes, and `package-lock.json`. Nothing
else is discoverable here -- there is no container base image, no system package manifest,
no vendored third-party source tree in the tracked set -- so nothing else is claimed. The
`coverage` block below records that limit inside the SBOM, because an SBOM that silently
implies whole-system coverage is worse than one that names its boundary.

BINDING. The document names the exact bundle it describes: the bundle's SHA-256 is the
`metadata.component` hash, and the source SHA it was built from is recorded beside it. An
SBOM that does not say which artifact it describes cannot be checked against anything.

DETERMINISM. `serialNumber` is derived from the bundle digest rather than randomly
generated, so regenerating an SBOM for the same bundle produces the same identifier. The
only field that varies between runs is `metadata.timestamp`, which is the honest record of
when the document was produced.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
import uuid
from pathlib import Path
from typing import Any, cast

REPO_ROOT = Path(__file__).resolve().parent.parent
GENERATOR_NAME = "scripts/generate_sbom.py"
GENERATOR_VERSION = "1.0.0"
SPEC_VERSION = "1.6"

#: `name==version` at the start of a line. requirements.lock is pip-compile output, so a
#: pinned line is always exactly this shape; hash continuation lines are indented and do
#: not match, which is what keeps them out of the component list.
PINNED = re.compile(r"^(?P<name>[A-Za-z0-9][A-Za-z0-9._-]*(?:\[[^\]]+\])?)==(?P<version>[^\s\\;]+)")


def python_components(lock: Path) -> list[dict[str, Any]]:
    if not lock.is_file():
        return []
    seen: dict[str, str] = {}
    for line in lock.read_text(encoding="utf-8").splitlines():
        matched = PINNED.match(line.strip()) if not line.startswith((" ", "\t")) else None
        if matched is not None:
            seen[str(matched.group("name"))] = str(matched.group("version"))
    return [
        {
            "type": "library",
            "name": name,
            "version": version,
            "purl": f"pkg:pypi/{name.split('[')[0].lower()}@{version}",
            "scope": "required",
            "properties": [{"name": "source-manifest", "value": lock.name}],
        }
        for name, version in sorted(seen.items())
    ]


def node_components(lock: Path) -> list[dict[str, Any]]:
    if not lock.is_file():
        return []
    try:
        doc = cast("dict[str, Any]", json.loads(lock.read_text(encoding="utf-8")))
    except json.JSONDecodeError:
        return []
    packages = cast("dict[str, Any]", doc.get("packages") or {})
    out: list[dict[str, Any]] = []
    for path, spec in sorted(packages.items()):
        if not path.startswith("node_modules/"):
            continue  # the "" entry is the repository itself, not a dependency
        entry = cast("dict[str, Any]", spec)
        name = path.split("node_modules/")[-1]
        version = str(entry.get("version", ""))
        if not version:
            continue
        out.append(
            {
                "type": "library",
                "name": name,
                "version": version,
                "purl": f"pkg:npm/{name}@{version}",
                "scope": "optional" if entry.get("dev") else "required",
                "properties": [{"name": "source-manifest", "value": lock.name}],
            }
        )
    return out


def build_sbom(bundle_name: str, bundle_sha256: str, source_sha: str) -> dict[str, Any]:
    py_lock = REPO_ROOT / "requirements.lock"
    npm_lock = REPO_ROOT / "package-lock.json"
    components = python_components(py_lock) + node_components(npm_lock)

    # Deterministic, not random: the same bundle always yields the same serial number.
    serial = uuid.UUID(hashlib.sha256(bundle_sha256.encode("utf-8")).hexdigest()[:32])

    return {
        "bomFormat": "CycloneDX",
        "specVersion": SPEC_VERSION,
        "serialNumber": f"urn:uuid:{serial}",
        "version": 1,
        "metadata": {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "tools": {
                "components": [
                    {
                        "type": "application",
                        "name": GENERATOR_NAME,
                        "version": GENERATOR_VERSION,
                    }
                ]
            },
            "component": {
                "type": "file",
                "name": bundle_name,
                "version": source_sha,
                "description": (
                    "Verification bundle for one exact source commit. Not a deployable "
                    "artifact, container image, release binary, or promotion candidate."
                ),
                "hashes": [{"alg": "SHA-256", "content": bundle_sha256}],
                "properties": [
                    {"name": "source-sha", "value": source_sha},
                    {"name": "bundle-sha256", "value": bundle_sha256},
                ],
            },
            "properties": [
                {
                    "name": "coverage",
                    "value": (
                        "Dependencies discoverable from requirements.lock and "
                        "package-lock.json only. No container base image, system "
                        "package manifest, or vendored third-party source is included, "
                        "because this repository has none in its tracked set."
                    ),
                },
                {"name": "python-manifest", "value": py_lock.name},
                {"name": "node-manifest", "value": npm_lock.name},
            ],
        },
        "components": components,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--bundle-manifest", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ns = ap.parse_args()

    manifest_path = Path(str(ns.bundle_manifest))
    if not manifest_path.is_file():
        print(f"BLOCK: {manifest_path} is missing", file=sys.stderr)
        return 2
    manifest = cast(
        "dict[str, Any]", json.loads(manifest_path.read_text(encoding="utf-8"))
    )

    sbom = build_sbom(
        str(manifest["bundle_name"]),
        str(manifest["bundle_sha256"]),
        str(manifest["source_sha"]),
    )
    out = Path(str(ns.out))
    out.write_text(json.dumps(sbom, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    python_count = sum(
        1
        for c in sbom["components"]
        if any(p["value"] == "requirements.lock" for p in c["properties"])
    )
    print("[SBOM]")
    print(f"FORMAT             CycloneDX JSON specVersion={SPEC_VERSION}")
    print(f"BOUND_BUNDLE       {manifest['bundle_name']}")
    print(f"BOUND_DIGEST       {manifest['bundle_sha256']}")
    print(f"BOUND_SOURCE_SHA   {manifest['source_sha']}")
    print(f"COMPONENTS_TOTAL   {len(sbom['components'])}")
    print(f"COMPONENTS_PYTHON  {python_count}")
    print(f"COMPONENTS_NODE    {len(sbom['components']) - python_count}")
    print(f"EVIDENCE           {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
