"""The verification bundle, attacked.

Three claims carry this artifact, and each is worth exactly as much as its proof:

    deterministic   two builds from identical inputs produce byte-identical SHA-256.
                    Not "the code normalises fields" -- the digests are compared.

    bound           the SBOM and the provenance name the exact bundle digest and the
                    exact source SHA. A document that does not say which artifact it
                    describes cannot be checked against anything.

    honest          a SHA that names no commit is refused rather than replaced by the
                    branch tip, and provenance for a commit the bundle was not built
                    from is refused rather than written.

The bundle is a VERIFICATION bundle. Nothing here calls it deployable, and one test
asserts the manifest says so, because the word is the part most likely to drift.

No network. Builds are module-scoped: each is a real `git archive` of the whole tracked
tree, so rebuilding per test would spend seconds proving nothing new.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tarfile
from pathlib import Path
from typing import Any, cast

import pytest

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

import build_bundle as bb  # noqa: E402
import generate_provenance as gp  # noqa: E402
import generate_sbom as gs  # noqa: E402


def head_sha() -> str:
    out = subprocess.run(  # noqa: S603
        ["git", "rev-parse", "HEAD"],
        cwd=str(REPO),
        capture_output=True,
        text=True,
        timeout=60,
        shell=False,
        check=False,
    )
    return out.stdout.strip()


@pytest.fixture(scope="module")
def built(tmp_path_factory: pytest.TempPathFactory) -> dict[str, Any]:
    """One authoritative build, plus a second one used only to compare digests."""
    root = tmp_path_factory.mktemp("bundle")
    evidence = root / "ev"
    evidence.mkdir()
    (evidence / "deep-verify-summary.json").write_text('{"k": 1}\n', encoding="utf-8")
    (evidence / "deep-verify-summary.md").write_text("# summary\n", encoding="utf-8")

    sha = head_sha()
    first = bb.build(sha, evidence, root / "one")
    second = bb.build(sha, evidence, root / "two")
    return {"sha": sha, "root": root, "first": first, "second": second}


# --------------------------------------------------------------------------
# Deterministic
# --------------------------------------------------------------------------
def test_two_builds_produce_a_byte_identical_bundle(built: dict[str, Any]) -> None:
    """The whole immutability claim rests here. Digests, not intentions."""
    first = cast("dict[str, Any]", built["first"])
    second = cast("dict[str, Any]", built["second"])
    assert first["bundle_sha256"] == second["bundle_sha256"], (
        "two builds of the same source SHA produced different bundles; the digest is "
        "then a function of when someone built it, not of what was built"
    )
    assert first["bundle_bytes"] == second["bundle_bytes"]


def test_every_entry_is_normalised(built: dict[str, Any]) -> None:
    """Owner, group and mode are properties of the machine, not of the commit."""
    root = cast("Path", built["root"])
    tar_path = root / "one" / str(cast("dict[str, Any]", built["first"])["bundle_name"])
    with tarfile.open(tar_path) as archive:
        members = archive.getmembers()
    assert members, "the bundle is empty"
    for member in members:
        assert member.uid == 0, f"{member.name}: uid {member.uid}"
        assert member.gid == 0, f"{member.name}: gid {member.gid}"
        assert member.uname == "", f"{member.name}: uname {member.uname!r}"
        assert member.gname == "", f"{member.name}: gname {member.gname!r}"
        assert member.mode == bb.FILE_MODE, f"{member.name}: mode {oct(member.mode)}"


def test_entries_are_in_lexical_order(built: dict[str, Any]) -> None:
    """Directory iteration order is not stable across machines."""
    root = cast("Path", built["root"])
    tar_path = root / "one" / str(cast("dict[str, Any]", built["first"])["bundle_name"])
    with tarfile.open(tar_path) as archive:
        names = archive.getnames()
    assert names == sorted(names), f"members are not lexically ordered: {names}"


def test_the_entry_mtime_is_the_commit_time_not_the_clock(built: dict[str, Any]) -> None:
    """A build timestamp inside the archive makes the digest depend on when it ran."""
    root = cast("Path", built["root"])
    manifest = cast("dict[str, Any]", built["first"])
    expected = int(manifest["source_commit_timestamp"])
    with tarfile.open(root / "one" / str(manifest["bundle_name"])) as archive:
        for member in archive.getmembers():
            assert member.mtime == expected, f"{member.name}: mtime {member.mtime}"


# --------------------------------------------------------------------------
# Contents
# --------------------------------------------------------------------------
def test_the_bundle_contains_source_evidence_and_an_entries_manifest(
    built: dict[str, Any],
) -> None:
    root = cast("Path", built["root"])
    manifest = cast("dict[str, Any]", built["first"])
    with tarfile.open(root / "one" / str(manifest["bundle_name"])) as archive:
        names = set(archive.getnames())
    assert "source.tar" in names
    assert "entries.manifest.json" in names
    assert any(n.startswith("evidence/") for n in names), (
        f"no deep-verification evidence is in the bundle: {sorted(names)}"
    )


def test_source_tar_is_the_git_archive_of_the_recorded_sha(
    built: dict[str, Any],
) -> None:
    """The bundle's source snapshot must BE the commit it names, not resemble it."""
    root = cast("Path", built["root"])
    manifest = cast("dict[str, Any]", built["first"])
    sha = str(manifest["source_sha"])

    with tarfile.open(root / "one" / str(manifest["bundle_name"])) as archive:
        extracted = archive.extractfile("source.tar")
        assert extracted is not None
        bundled = hashlib.sha256(extracted.read()).hexdigest()

    direct = subprocess.run(  # noqa: S603
        ["git", "archive", "--format=tar", sha],
        cwd=str(REPO),
        stdout=subprocess.PIPE,
        timeout=300,
        shell=False,
        check=False,
    )
    assert direct.returncode == 0
    assert bundled == hashlib.sha256(direct.stdout).hexdigest(), (
        "source.tar is not the git archive of the SHA the manifest records"
    )


def test_the_bundle_excludes_untracked_and_ignored_paths(built: dict[str, Any]) -> None:
    """`.git`, `.venv`, caches and node_modules are absent by construction, not by filter."""
    root = cast("Path", built["root"])
    manifest = cast("dict[str, Any]", built["first"])
    with tarfile.open(root / "one" / str(manifest["bundle_name"])) as archive:
        extracted = archive.extractfile("source.tar")
        assert extracted is not None
        with tarfile.open(fileobj=extracted) as inner:  # type: ignore[arg-type]
            names = inner.getnames()
    forbidden = [
        n
        for n in names
        if n.startswith((".git/", ".venv/", "node_modules/", ".evidence/"))
        or "__pycache__" in n
    ]
    assert not forbidden, f"untracked or ignored paths leaked into the bundle: {forbidden[:5]}"


def test_every_manifest_hash_matches_the_file_it_names(built: dict[str, Any]) -> None:
    """A manifest nobody recomputes is a list of numbers."""
    root = cast("Path", built["root"])
    manifest = cast("dict[str, Any]", built["first"])
    tar_path = root / "one" / str(manifest["bundle_name"])
    recorded = cast("dict[str, str]", manifest["entries_sha256"])

    with tarfile.open(tar_path) as archive:
        for name, expected in recorded.items():
            member = archive.extractfile(name)
            assert member is not None, f"{name} is in the manifest but not the bundle"
            assert hashlib.sha256(member.read()).hexdigest() == expected, name

    assert bb.sha256_file(tar_path) == str(manifest["bundle_sha256"]), (
        "the recorded bundle digest is not the digest of the bundle"
    )


def test_the_manifest_says_this_is_not_deployable(built: dict[str, Any]) -> None:
    """The word most likely to drift, pinned where a reader will see it."""
    manifest = cast("dict[str, Any]", built["first"])
    assert manifest["artifact_type"] == "verification bundle"
    assert manifest["not_a_deployable_artifact"] is True


# --------------------------------------------------------------------------
# Honest refusals
# --------------------------------------------------------------------------
@pytest.mark.parametrize(
    "bad", ["not-a-sha", "abc123", "z" * 40, "", "0123456789abcdef"]
)
def test_a_malformed_sha_is_refused(bad: str) -> None:
    with pytest.raises(bb.CannotBuild):
        bb.validate_sha(bad)


def test_a_sha_that_names_no_commit_is_refused_not_replaced() -> None:
    """The branch tip is never substituted. A bundle built from a commit other than the
    one it names is a false claim about which code was verified."""
    with pytest.raises(bb.CannotBuild, match="does not name a commit"):
        bb.validate_sha("0" * 40)


# --------------------------------------------------------------------------
# SBOM binding
# --------------------------------------------------------------------------
def test_the_sbom_binds_the_exact_digest_and_source_sha(built: dict[str, Any]) -> None:
    manifest = cast("dict[str, Any]", built["first"])
    sbom = gs.build_sbom(
        str(manifest["bundle_name"]),
        str(manifest["bundle_sha256"]),
        str(manifest["source_sha"]),
    )
    component = cast("dict[str, Any]", cast("dict[str, Any]", sbom["metadata"])["component"])
    hashes = cast("list[dict[str, str]]", component["hashes"])
    assert hashes[0]["alg"] == "SHA-256"
    assert hashes[0]["content"] == manifest["bundle_sha256"]
    assert component["version"] == manifest["source_sha"]
    assert sbom["bomFormat"] == "CycloneDX"
    assert sbom["specVersion"], "the schema version must be recorded in the output"


def test_the_sbom_records_the_limit_of_its_own_coverage(built: dict[str, Any]) -> None:
    """An SBOM that silently implies whole-system coverage is worse than one that
    names its boundary."""
    manifest = cast("dict[str, Any]", built["first"])
    sbom = gs.build_sbom(
        str(manifest["bundle_name"]),
        str(manifest["bundle_sha256"]),
        str(manifest["source_sha"]),
    )
    props = cast(
        "list[dict[str, str]]", cast("dict[str, Any]", sbom["metadata"])["properties"]
    )
    coverage = [p for p in props if p["name"] == "coverage"]
    assert coverage, "the SBOM does not state what it covers"
    assert "requirements.lock" in coverage[0]["value"]


def test_the_sbom_serial_number_is_derived_not_random(built: dict[str, Any]) -> None:
    """Regenerating an SBOM for the same bundle must produce the same identifier."""
    manifest = cast("dict[str, Any]", built["first"])
    args = (
        str(manifest["bundle_name"]),
        str(manifest["bundle_sha256"]),
        str(manifest["source_sha"]),
    )
    assert gs.build_sbom(*args)["serialNumber"] == gs.build_sbom(*args)["serialNumber"]


def test_the_sbom_finds_the_packages_the_lockfiles_pin(built: dict[str, Any]) -> None:
    """A component list that is empty would satisfy every binding test above."""
    manifest = cast("dict[str, Any]", built["first"])
    sbom = gs.build_sbom(
        str(manifest["bundle_name"]),
        str(manifest["bundle_sha256"]),
        str(manifest["source_sha"]),
    )
    components = cast("list[dict[str, Any]]", sbom["components"])
    assert components, "the SBOM lists no components at all"
    assert all(c["version"] for c in components), "a component has no version"
    assert all(str(c["purl"]).startswith("pkg:") for c in components)


# --------------------------------------------------------------------------
# Provenance binding
# --------------------------------------------------------------------------
def test_the_provenance_subject_is_the_bundle_digest(built: dict[str, Any]) -> None:
    manifest = cast("dict[str, Any]", built["first"])
    statement = gp.build_statement(
        str(manifest["bundle_name"]),
        str(manifest["bundle_sha256"]),
        str(manifest["source_sha"]),
        "scripts/build_bundle.py",
    )
    subject = cast("list[dict[str, Any]]", statement["subject"])[0]
    assert cast("dict[str, str]", subject["digest"])["sha256"] == manifest["bundle_sha256"]
    assert subject["name"] == manifest["bundle_name"]
    assert statement["predicateType"] == gp.PREDICATE_TYPE
    assert statement["_type"] == gp.STATEMENT_TYPE


def test_the_provenance_keeps_source_sha_separate_from_the_run_sha(
    built: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    """On a pull_request run GITHUB_SHA is a generated test-merge commit that exists in
    no branch. Recording it AS the source would bind the bundle to a commit nobody can
    check out, so the two must stay visibly distinct."""
    manifest = cast("dict[str, Any]", built["first"])
    monkeypatch.setenv("GITHUB_SHA", "d" * 40)
    monkeypatch.setenv("GITHUB_REPOSITORY", "owner/repo")
    monkeypatch.setenv("GITHUB_RUN_ID", "12345")

    statement = gp.build_statement(
        str(manifest["bundle_name"]),
        str(manifest["bundle_sha256"]),
        str(manifest["source_sha"]),
        "scripts/build_bundle.py",
    )
    predicate = cast("dict[str, Any]", statement["predicate"])
    definition = cast("dict[str, Any]", predicate["buildDefinition"])
    external = cast("dict[str, str]", definition["externalParameters"])
    internal = cast("dict[str, str]", definition["internalParameters"])

    assert external["source_sha"] == manifest["source_sha"]
    assert internal["workflow_run_sha"] == "d" * 40
    assert external["source_sha"] != internal["workflow_run_sha"]

    resolved = cast("list[dict[str, Any]]", definition["resolvedDependencies"])[0]
    assert cast("dict[str, str]", resolved["digest"])["gitCommit"] == manifest["source_sha"]


def test_the_provenance_records_local_rather_than_inventing_a_run(
    built: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    """A local build has no workflow identity. Inventing a plausible one would make the
    document indistinguishable from one produced by a real run."""
    for name in (
        "GITHUB_SHA",
        "GITHUB_REPOSITORY",
        "GITHUB_RUN_ID",
        "GITHUB_WORKFLOW_REF",
        "GITHUB_WORKFLOW",
        "GITHUB_JOB",
        "GITHUB_EVENT_NAME",
        "GITHUB_RUN_ATTEMPT",
        "GITHUB_SERVER_URL",
    ):
        monkeypatch.delenv(name, raising=False)

    manifest = cast("dict[str, Any]", built["first"])
    statement = gp.build_statement(
        str(manifest["bundle_name"]),
        str(manifest["bundle_sha256"]),
        str(manifest["source_sha"]),
        "scripts/build_bundle.py",
    )
    predicate = cast("dict[str, Any]", statement["predicate"])
    run_details = cast("dict[str, Any]", predicate["runDetails"])
    assert cast("dict[str, Any]", run_details["builder"])["id"] == gp.LOCAL
    assert cast("dict[str, Any]", run_details["metadata"])["invocationId"] == gp.LOCAL


def test_provenance_for_a_different_commit_is_refused(
    built: dict[str, Any], tmp_path: Path
) -> None:
    """Provenance naming a commit the bundle was not built from is a false claim."""
    root = cast("Path", built["root"])
    result = subprocess.run(  # noqa: S603
        [
            sys.executable,
            str(REPO / "scripts" / "generate_provenance.py"),
            "--bundle-manifest",
            str(root / "one" / "bundle.manifest.json"),
            "--source-sha",
            "1" * 40,
            "--out",
            str(tmp_path / "p.json"),
        ],
        cwd=str(REPO),
        capture_output=True,
        text=True,
        timeout=120,
        shell=False,
        check=False,
        env={**os.environ},
    )
    assert result.returncode != 0, "provenance for the wrong commit was written anyway"
    assert "BLOCK" in result.stderr
    assert not (tmp_path / "p.json").exists()


def test_the_written_documents_round_trip_as_json(built: dict[str, Any]) -> None:
    """An unparseable attestation is not evidence."""
    root = cast("Path", built["root"])
    manifest = json.loads(
        (root / "one" / "bundle.manifest.json").read_text(encoding="utf-8")
    )
    assert isinstance(manifest, dict)
    assert manifest["bundle_sha256"]
