#!/usr/bin/env python3
"""PROVENANCE — SLSA v1 in-toto Statement for one verification bundle.

WHAT IT BINDS. The statement's `subject` is the bundle's exact SHA-256, and the predicate
records the source repository, the exact source commit, the workflow identity, the run id,
the builder identity, the build timestamp and the build entrypoint. Every one of those is
read from the environment at run time. None is hard-coded, because a provenance document
naming a repository the build did not run in is not weak evidence, it is false evidence.

THE SOURCE SHA IS NOT `GITHUB_SHA`. On a `pull_request` run GitHub sets `GITHUB_SHA` to a
generated test-merge commit that exists in no branch. Binding a bundle to it would bind it
to a commit nobody can check out. The caller therefore passes the source SHA explicitly --
it comes from `github.event.pull_request.head.sha` on a pull request, or from the required
`source_sha` input on a manual dispatch -- and `GITHUB_SHA` is recorded separately, as the
workflow-run SHA it actually is.

RUN OUTSIDE CI. Every GitHub field is then recorded as `local`. That is the honest value:
a local build has no workflow identity and no run id, and inventing plausible ones would
make the document indistinguishable from one produced by a real run.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, cast

PREDICATE_TYPE = "https://slsa.dev/provenance/v1"
STATEMENT_TYPE = "https://in-toto.io/Statement/v1"
BUILD_TYPE = "https://github.com/Intellora-ai/final-countdown/verification-bundle/v1"

LOCAL = "local"


def env(name: str) -> str:
    """A GitHub variable, or the literal `local`. Never a guess."""
    return os.environ.get(name) or LOCAL


def workflow_identity() -> str:
    """`owner/repo/.github/workflows/file.yml@ref`, resolved, never assembled from guesses.

    GITHUB_WORKFLOW_REF already carries exactly this shape when it is set. Falling back to
    composing it by hand would produce a plausible string on a machine where the real one
    does not exist, and the verification step compares the ACTUAL certificate identity
    against this value -- so a fabricated expectation would either fail loudly or, worse,
    match a certificate nobody checked.
    """
    return env("GITHUB_WORKFLOW_REF")


def build_statement(
    bundle_name: str, bundle_sha256: str, source_sha: str, entrypoint: str
) -> dict[str, Any]:
    repository = env("GITHUB_REPOSITORY")
    server = os.environ.get("GITHUB_SERVER_URL") or "https://github.com"
    run_id = env("GITHUB_RUN_ID")
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    return {
        "_type": STATEMENT_TYPE,
        "subject": [
            {"name": bundle_name, "digest": {"sha256": bundle_sha256}},
        ],
        "predicateType": PREDICATE_TYPE,
        "predicate": {
            "buildDefinition": {
                "buildType": BUILD_TYPE,
                "externalParameters": {
                    "source_sha": source_sha,
                    "repository": repository,
                    "entrypoint": entrypoint,
                },
                "internalParameters": {
                    "workflow_ref": workflow_identity(),
                    "workflow_name": env("GITHUB_WORKFLOW"),
                    "job": env("GITHUB_JOB"),
                    "event_name": env("GITHUB_EVENT_NAME"),
                    "run_attempt": env("GITHUB_RUN_ATTEMPT"),
                    # Recorded because it is NOT the identity. On a pull_request run this
                    # is GitHub's test-merge commit; keeping it visible beside source_sha
                    # is what lets a reader see the two are different.
                    "workflow_run_sha": env("GITHUB_SHA"),
                },
                "resolvedDependencies": [
                    {
                        "uri": (
                            f"git+{server}/{repository}@{source_sha}"
                            if repository != LOCAL
                            else f"git+{LOCAL}@{source_sha}"
                        ),
                        "digest": {"gitCommit": source_sha},
                    }
                ],
            },
            "runDetails": {
                "builder": {
                    "id": (
                        f"{server}/{repository}/.github/workflows"
                        if repository != LOCAL
                        else LOCAL
                    ),
                    "version": {"build_bundle": "scripts/build_bundle.py"},
                },
                "metadata": {
                    "invocationId": (
                        f"{server}/{repository}/actions/runs/{run_id}"
                        if repository != LOCAL and run_id != LOCAL
                        else LOCAL
                    ),
                    "startedOn": now,
                    "finishedOn": now,
                },
            },
        },
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--bundle-manifest", type=Path, required=True)
    ap.add_argument("--source-sha", required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument(
        "--entrypoint", default="scripts/build_bundle.py", help="what produced the bundle"
    )
    ns = ap.parse_args()

    manifest_path = Path(str(ns.bundle_manifest))
    if not manifest_path.is_file():
        print(f"BLOCK: {manifest_path} is missing", file=sys.stderr)
        return 2
    manifest = cast(
        "dict[str, Any]", json.loads(manifest_path.read_text(encoding="utf-8"))
    )

    source_sha = str(ns.source_sha)
    if str(manifest["source_sha"]) != source_sha:
        print(
            f"BLOCK: the bundle manifest records source_sha {manifest['source_sha']} but "
            f"{source_sha} was supplied. Provenance naming a different commit than the "
            "bundle was built from is a false claim, not a mismatch to paper over.",
            file=sys.stderr,
        )
        return 2

    statement = build_statement(
        str(manifest["bundle_name"]),
        str(manifest["bundle_sha256"]),
        source_sha,
        str(ns.entrypoint),
    )
    out = Path(str(ns.out))
    out.write_text(
        json.dumps(statement, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    predicate = cast("dict[str, Any]", statement["predicate"])
    definition = cast("dict[str, Any]", predicate["buildDefinition"])
    internal = cast("dict[str, Any]", definition["internalParameters"])
    run_details = cast("dict[str, Any]", predicate["runDetails"])

    print("[PROVENANCE]")
    print("FORMAT             SLSA v1 in-toto Statement JSON")
    print(f"SUBJECT_NAME       {manifest['bundle_name']}")
    print(f"SUBJECT_SHA256     {manifest['bundle_sha256']}")
    print(f"SOURCE_SHA         {source_sha}")
    print(f"WORKFLOW_RUN_SHA   {internal['workflow_run_sha']}")
    print(f"WORKFLOW_REF       {internal['workflow_ref']}")
    print(f"BUILDER_ID         {cast('dict[str, Any]', run_details['builder'])['id']}")
    print(
        f"INVOCATION_ID      "
        f"{cast('dict[str, Any]', run_details['metadata'])['invocationId']}"
    )
    print(f"EVIDENCE           {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
