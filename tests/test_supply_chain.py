"""SUPPLY CHAIN GUARDS — keep the pinning from silently coming undone.

The supply chain was hardened by hand: every `uses:` became an immutable
40-char commit SHA, every Python package became a `==` pin with a sha256, and
every workflow started installing with `--require-hashes`. None of that is
self-enforcing. A single `@v5` in a pull request, or one `pip install pytest`
added to save a few seconds, puts a mutable dependency back inside the
verification system — and nothing red would appear, because a floating tag
resolves and a bare install succeeds.

These tests are the thing that turns red. They are STATIC: they read files and
nothing else. No network, no `gh`, no GitHub API. That is deliberate — a guard
that only runs where credentials exist is a guard that does not run on the
laptop where the mistake is actually made.

Every checker here is a plain function over TEXT, not a test body, so the
positive controls at the bottom can feed each one a deliberately sabotaged
workflow and assert it rejects it. A guard that has never been seen to fire is
not known to work.
"""

from __future__ import annotations

import re
import tomllib
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

import pytest
import yaml
from yaml.nodes import MappingNode, Node, ScalarNode, SequenceNode

REPO = Path(__file__).resolve().parent.parent
WORKFLOWS = REPO / ".github" / "workflows"
REQUIREMENTS = REPO / "requirements.txt"
LOCK = REPO / "requirements.lock"
PREFLIGHT_LOCK = REPO / "requirements-preflight.lock"
DEPENDABOT = REPO / ".github" / "dependabot.yml"
GATES = REPO / "ci" / "gates.toml"


# ---------------------------------------------------------------------------
# Findings. Every one carries a file and a line, because "supply chain check
# failed" tells a contributor nothing and "verify.yml:132: ..." tells them
# exactly which line to edit.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Violation:
    path: str
    line: int
    what: str

    def __str__(self) -> str:
        return f"{self.path}:{self.line}: {self.what}"


def render(violations: Sequence[Violation]) -> str:
    """One violation per line, indented, for an assertion message."""
    return "\n".join(["", *(f"  {v}" for v in violations)])


# ---------------------------------------------------------------------------
# YAML node walking. We use `yaml.compose` rather than `yaml.safe_load` because
# the composed node tree keeps source line numbers, and a violation without a
# line number is not actionable.
# ---------------------------------------------------------------------------


def _items(node: Node | None) -> list[tuple[str, Node]]:
    if not isinstance(node, MappingNode):
        return []
    pairs: list[tuple[Any, Any]] = list(node.value)
    return [(str(k.value), v) for k, v in pairs if isinstance(k, ScalarNode)]


def _get(node: Node | None, key: str) -> Node | None:
    for name, value in _items(node):
        if name == key:
            return value
    return None


def _sequence(node: Node | None) -> list[Node]:
    if not isinstance(node, SequenceNode):
        return []
    entries: list[Any] = list(node.value)
    return [e for e in entries if isinstance(e, Node)]


def _line(node: Node) -> int:
    return int(node.start_mark.line) + 1


# ---------------------------------------------------------------------------
# RULE 1 — every `uses:` is pinned to a 40-char commit SHA.
# ---------------------------------------------------------------------------

# owner/repo, optionally with a subdirectory path, then @ref.
ACTION_REF = re.compile(
    r"^(?P<action>[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)*)"
    r"@(?P<ref>\S+)$"
)
SHA40 = re.compile(r"^[0-9a-f]{40}$")


@dataclass(frozen=True)
class UsesRef:
    path: str
    line: int
    job: str
    step: str
    ref: str


def collect_uses(text: str, path: str) -> list[UsesRef]:
    """Every action reference a workflow actually INVOKES.

    Walks the parsed document rather than grepping, so that a `uses:` written
    inside a `run:` heredoc or a comment cannot be mistaken for an invocation,
    and so every hit can be named by job and step.

    Covers both step-level `uses:` and job-level `uses:` (a reusable-workflow
    call), which is subject to exactly the same pinning rule.
    """
    # SafeLoader.get_single_node() rather than yaml.compose(): identical
    # result, but typed under strict mode. The loader reads a str, so it holds
    # no OS handle and needs no explicit disposal.
    root = yaml.SafeLoader(text).get_single_node()
    if root is None:
        return []
    found: list[UsesRef] = []
    for job_id, job in _items(_get(root, "jobs")):
        called = _get(job, "uses")
        if isinstance(called, ScalarNode):
            found.append(
                UsesRef(path, _line(called), job_id, "<reusable workflow>",
                        str(called.value)))
        for index, step in enumerate(_sequence(_get(job, "steps"))):
            uses = _get(step, "uses")
            if not isinstance(uses, ScalarNode):
                continue
            named = _get(step, "name")
            label = (str(named.value) if isinstance(named, ScalarNode)
                     else f"steps[{index}]")
            found.append(UsesRef(path, _line(uses), job_id, label, str(uses.value)))
    return found


def unpinned_uses(text: str, path: str) -> list[Violation]:
    """Any `uses:` that is not `owner/repo(/path)@<40 hex>`.

    A tag is a pointer the upstream owner can move. `@v5` today and `@v5`
    tomorrow are not the same code, which means a green run cannot be replayed
    and a compromised tag ships straight into a job holding repository
    credentials. Only a commit SHA is immutable.
    """
    out: list[Violation] = []
    for use in collect_uses(text, path):
        # `./path` is an action stored in THIS repository. It is already fixed
        # by the commit being checked out, so there is no mutable third party.
        if use.ref.startswith("./"):
            continue
        where = f"job '{use.job}', step '{use.step}'"
        matched = ACTION_REF.match(use.ref)
        if matched is None:
            out.append(Violation(
                path, use.line,
                f"{where}: uses: {use.ref!r} is not owner/repo@ref — a Docker "
                f"or malformed reference cannot be SHA-pinned and is not "
                f"allowed here"))
            continue
        ref = str(matched.group("ref"))
        if SHA40.match(ref) is None:
            action = str(matched.group("action"))
            repo = "/".join(action.split("/")[:2])
            out.append(Violation(
                path, use.line,
                f"{where}: uses: {use.ref} is pinned to '{ref}', a MUTABLE tag "
                f"or branch. Resolve it once and pin the commit: "
                f"`gh api repos/{repo}/commits/{ref} --jq .sha`, then write "
                f"`{action}@<sha> # {ref}`"))
    return out


# ---------------------------------------------------------------------------
# RULE 2 — every pinned SHA carries a trailing version comment.
# ---------------------------------------------------------------------------

USES_LINE = re.compile(r"^\s*(?:-\s+)?uses:\s*(?P<ref>[^\s#]+)\s*(?P<rest>.*)$")
VERSION_COMMENT = re.compile(r"^#\s*v\S+")


def raw_uses_lines(text: str) -> list[tuple[int, str, str]]:
    """(line number, ref, trailing text) for every literal `uses:` line."""
    out: list[tuple[int, str, str]] = []
    for number, line in enumerate(text.splitlines(), 1):
        matched = USES_LINE.match(line)
        if matched is not None:
            out.append((number, str(matched.group("ref")),
                        str(matched.group("rest")).strip()))
    return out


def uses_without_version_comment(text: str, path: str) -> list[Violation]:
    """A SHA with no `# v...` beside it.

    `fbc6f39...` is unreadable. Without the comment nobody reviewing a diff can
    tell whether a bump went forwards or backwards, and Dependabot's
    github-actions ecosystem uses that comment to know which version it is
    upgrading FROM — strip it and the pin stops receiving security fixes.
    """
    out: list[Violation] = []
    for number, ref, rest in raw_uses_lines(text):
        if ref.startswith("./"):
            continue
        if VERSION_COMMENT.match(rest) is None:
            out.append(Violation(
                path, number,
                f"uses: {ref} has no trailing `# v...` version comment "
                f"(found {rest or '<nothing>'!r}) — the pin becomes unreadable "
                f"and Dependabot cannot bump it"))
    return out


# ---------------------------------------------------------------------------
# RULE 3 — every pip install is hash-locked.
# ---------------------------------------------------------------------------

PIP_INSTALL = re.compile(
    r"\bpip[0-9]*\s+install\b|\bpython[0-9.]*\s+-m\s+pip\s+install\b")
DASH_R = re.compile(r"(?:^|\s)-r\s+(?P<target>\S+)")


def logical_lines(text: str) -> list[tuple[int, str]]:
    """Shell lines with backslash continuations joined, keyed by first line.

    A `run:` block may split one command across several lines; scanning raw
    lines would see `pip install --quiet \\` and conclude there was no
    `--require-hashes` on it.
    """
    out: list[tuple[int, str]] = []
    pending: list[str] = []
    start = 0
    for number, raw in enumerate(text.splitlines(), 1):
        if not pending:
            start = number
        stripped = raw.rstrip()
        if stripped.endswith("\\"):
            pending.append(stripped[:-1])
            continue
        pending.append(stripped)
        out.append((start, " ".join(part.strip() for part in pending)))
        pending = []
    if pending:
        out.append((start, " ".join(part.strip() for part in pending)))
    return out


def pip_install_violations(text: str, path: str) -> list[Violation]:
    """Any `pip install` that is not `--require-hashes -r <something>.lock`.

    Three distinct failures, all of which have actually happened here:

      * no `--require-hashes` — pip accepts whatever bytes the index serves,
        so a re-uploaded artifact at the same version installs silently;
      * `-r requirements.txt` — that file holds `>=` floors, so the same
        commit is verified by a different toolchain on different days;
      * a hand-listed package subset — it drifts from the lock, which is
        exactly how three jobs broke.
    """
    out: list[Violation] = []
    for number, line in logical_lines(text):
        if line.lstrip().startswith("#"):
            continue
        if PIP_INSTALL.search(line) is None:
            continue
        # Drop a trailing comment. ` #` starts one in both a YAML plain
        # scalar and a shell line, and no pip argument here contains it —
        # `--hash=sha256:...` has no space before its `#`-free digest.
        command = re.split(r"\s#", line, maxsplit=1)[0]
        if "--require-hashes" not in command:
            out.append(Violation(
                path, number,
                f"`pip install` without --require-hashes: {command.strip()!r} — "
                f"pip will install whatever bytes the index serves"))
        targets = [str(m.group("target")) for m in DASH_R.finditer(command)]
        if not targets:
            out.append(Violation(
                path, number,
                f"`pip install` with a bare package list: {command.strip()!r} — "
                f"install from requirements.lock so the toolchain matches every "
                f"other job"))
        for target in targets:
            if not target.endswith(".lock"):
                out.append(Violation(
                    path, number,
                    f"`pip install -r {target}` does not point at a .lock file — "
                    f"only the lock carries `==` pins and sha256 hashes"))
    return out


# ---------------------------------------------------------------------------
# RULES 4 and 5 — the lock files themselves.
# ---------------------------------------------------------------------------

REQ_PIN = re.compile(
    r"^(?P<name>[A-Za-z0-9][A-Za-z0-9._-]*)"
    r"(?P<extras>\[[A-Za-z0-9,._\s-]+\])?"
    r"==(?P<version>[A-Za-z0-9][A-Za-z0-9.!+*_-]*)$")
HASH_OPT = re.compile(r"^--hash=sha256:(?P<digest>[0-9a-f]{64})$")


def canonical(name: str) -> str:
    """PEP 503 normalisation: `PyYAML`, `pyyaml` and `py_yaml` are one package."""
    return re.sub(r"[-_.]+", "-", name).lower()


@dataclass(frozen=True)
class LockEntry:
    name: str
    version: str
    hashes: frozenset[str]
    line: int


def parse_lock(text: str, path: str) -> tuple[dict[str, LockEntry], list[Violation]]:
    """Parse a `--generate-hashes` lock into entries, reporting anything odd.

    Returns (entries by canonical name, violations). A line that is neither a
    comment, nor `name==version`, nor a `--hash=sha256:<64 hex>` is a
    violation by construction: `pip install --require-hashes` refuses to run
    against a file containing an unpinned entry, so anything unrecognised here
    either breaks the install or, worse, is an unpinned requirement.
    """
    entries: dict[str, LockEntry] = {}
    violations: list[Violation] = []
    order: list[str] = []
    hashes: dict[str, set[str]] = {}
    current: str | None = None

    for number, raw in enumerate(text.splitlines(), 1):
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
        stripped = stripped.rstrip("\\").strip()
        if not stripped:
            continue

        if stripped.startswith("--hash"):
            digest = HASH_OPT.match(stripped)
            if digest is None:
                violations.append(Violation(
                    path, number,
                    f"malformed hash {stripped!r} — expected "
                    f"`--hash=sha256:<64 hex chars>`"))
                continue
            if current is None:
                violations.append(Violation(
                    path, number,
                    f"hash {stripped!r} belongs to no requirement"))
                continue
            hashes[current].add(str(digest.group("digest")))
            continue

        pinned = REQ_PIN.match(stripped)
        if pinned is None:
            violations.append(Violation(
                path, number,
                f"{stripped!r} is not an exact `name==version` pin — a range or "
                f"a bare name in a hash-locked file is an unpinned dependency"))
            current = None
            continue
        current = canonical(str(pinned.group("name")))
        if current in hashes:
            violations.append(Violation(
                path, number, f"{current} is pinned twice"))
        hashes[current] = set()
        order.append(current)
        entries[current] = LockEntry(current, str(pinned.group("version")),
                                     frozenset(), number)

    for name in order:
        entries[name] = LockEntry(name, entries[name].version,
                                  frozenset(hashes[name]), entries[name].line)
    return entries, violations


def parse_requirements(text: str) -> set[str]:
    """Canonical names of the direct requirements, ignoring comments."""
    names: set[str] = set()
    for raw in text.splitlines():
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
        matched = re.match(r"^(?P<name>[A-Za-z0-9][A-Za-z0-9._-]*)", stripped)
        if matched is not None:
            names.add(canonical(str(matched.group("name"))))
    return names


# ---------------------------------------------------------------------------
# Fixtures over the real repository.
# ---------------------------------------------------------------------------


def workflow_files() -> list[Path]:
    return sorted(WORKFLOWS.glob("*.yml")) + sorted(WORKFLOWS.glob("*.yaml"))


def rel(path: Path) -> str:
    return str(path.relative_to(REPO))


@pytest.fixture(scope="module")
def workflows() -> list[tuple[Path, str]]:
    files = workflow_files()
    assert files, f"no workflows found under {rel(WORKFLOWS)} — this guard " \
                  f"would pass vacuously"
    return [(p, p.read_text(encoding="utf-8")) for p in files]


# ---------------------------------------------------------------------------
# RULE 1
# ---------------------------------------------------------------------------


def test_every_uses_is_pinned_to_a_commit_sha(
        workflows: list[tuple[Path, str]]) -> None:
    violations: list[Violation] = []
    total = 0
    for path, text in workflows:
        total += len(collect_uses(text, rel(path)))
        violations.extend(unpinned_uses(text, rel(path)))
    # Vacuity first: a guard that inspected nothing would otherwise report
    # success in exactly the same way as a guard that inspected everything.
    assert total > 0, "no `uses:` found at all — the SHA-pinning guard is vacuous"
    assert not violations, (
        "GitHub Actions pinned to a mutable ref. The upstream owner can move a "
        "tag, so the same commit no longer runs the same CI:"
        + render(violations))


# ---------------------------------------------------------------------------
# RULE 2
# ---------------------------------------------------------------------------


def test_every_pinned_sha_carries_a_version_comment(
        workflows: list[tuple[Path, str]]) -> None:
    violations: list[Violation] = []
    for path, text in workflows:
        violations.extend(uses_without_version_comment(text, rel(path)))
    assert not violations, (
        "A 40-char SHA with no `# v...` beside it is unreviewable, and "
        "Dependabot needs the comment to bump the pin:" + render(violations))


def test_the_version_comment_scan_sees_every_invoked_action(
        workflows: list[tuple[Path, str]]) -> None:
    """Rule 2 reads raw text; rule 1 reads the parse tree. They must agree.

    If they ever diverge, one of the two guards is inspecting a set of lines
    the other is not, and the smaller one is silently under-enforcing.
    """
    mismatches: list[str] = []
    for path, text in workflows:
        parsed = len(collect_uses(text, rel(path)))
        raw = len(raw_uses_lines(text))
        if parsed != raw:
            mismatches.append(
                f"{rel(path)}: parse tree has {parsed} `uses:` but raw text has "
                f"{raw} — one scan is missing references the other sees")
    assert not mismatches, "\n" + "\n".join(f"  {m}" for m in mismatches)


# ---------------------------------------------------------------------------
# RULE 3
# ---------------------------------------------------------------------------


def test_every_pip_install_requires_hashes_and_a_lock(
        workflows: list[tuple[Path, str]]) -> None:
    violations: list[Violation] = []
    installs = 0
    for path, text in workflows:
        for _, line in logical_lines(text):
            if not line.lstrip().startswith("#") and PIP_INSTALL.search(line):
                installs += 1
        violations.extend(pip_install_violations(text, rel(path)))
    assert installs > 0, "no `pip install` found — this guard is vacuous"
    assert not violations, (
        "A pip install that is not hash-locked puts an unverified toolchain "
        "inside the verification system:" + render(violations))


# ---------------------------------------------------------------------------
# RULE 4
# ---------------------------------------------------------------------------


def test_requirements_lock_is_fully_pinned_and_hashed() -> None:
    text = LOCK.read_text(encoding="utf-8")
    entries, violations = parse_lock(text, rel(LOCK))
    assert not violations, (
        f"{rel(LOCK)} has lines that are neither comments, exact pins, nor "
        f"sha256 hashes:" + render(violations))
    assert entries, f"{rel(LOCK)} declares no packages at all"

    unhashed = [Violation(rel(LOCK), e.line,
                          f"{e.name}=={e.version} carries no --hash=sha256: — "
                          f"`==` says WHICH version, only the hash says which "
                          f"BYTES")
                for e in entries.values() if not e.hashes]
    assert not unhashed, (
        "Requirements pinned by version but not by content:" + render(unhashed))


# ---------------------------------------------------------------------------
# RULE 5
# ---------------------------------------------------------------------------


def test_preflight_lock_is_a_strict_subset_of_the_main_lock() -> None:
    """Preflight installs a one-package subset. It must not DRIFT from the lock.

    The subset exists so the guard on the guard does not depend on the
    toolchain it judges. That only holds if the one package it does install is
    byte-for-byte the same one every other job installs; a divergence means
    preflight is judging a system it is not running on.
    """
    main, main_bad = parse_lock(LOCK.read_text(encoding="utf-8"), rel(LOCK))
    sub, sub_bad = parse_lock(PREFLIGHT_LOCK.read_text(encoding="utf-8"),
                              rel(PREFLIGHT_LOCK))
    assert not main_bad + sub_bad, (
        "lock files did not parse cleanly:" + render(main_bad + sub_bad))
    assert sub, f"{rel(PREFLIGHT_LOCK)} declares no packages at all"

    violations: list[Violation] = []
    for name, entry in sub.items():
        parent = main.get(name)
        if parent is None:
            violations.append(Violation(
                rel(PREFLIGHT_LOCK), entry.line,
                f"{name} is not in {rel(LOCK)} at all — preflight would install "
                f"something no other job installs"))
            continue
        if parent.version != entry.version:
            violations.append(Violation(
                rel(PREFLIGHT_LOCK), entry.line,
                f"{name}=={entry.version} but {rel(LOCK)}:{parent.line} pins "
                f"=={parent.version} — preflight and the gates it judges would "
                f"run different code"))
        if parent.hashes != entry.hashes:
            only_here = sorted(entry.hashes - parent.hashes)[:2]
            only_there = sorted(parent.hashes - entry.hashes)[:2]
            violations.append(Violation(
                rel(PREFLIGHT_LOCK), entry.line,
                f"{name} hash set differs from {rel(LOCK)}:{parent.line} "
                f"({len(entry.hashes)} vs {len(parent.hashes)} hashes; "
                f"only here: {only_here}; only there: {only_there}) — copy the "
                f"block from {rel(LOCK)} verbatim"))
    assert not violations, (
        "requirements-preflight.lock has drifted from requirements.lock:"
        + render(violations))


# ---------------------------------------------------------------------------
# RULE 6
# ---------------------------------------------------------------------------


def test_mutmut_stays_out_of_every_requirements_file() -> None:
    """mutmut was removed on purpose. Do not let it come back.

    The gate named `mutmut` runs scripts/mutation_gate.py — our own AST
    mutation scorer. The mutmut PACKAGE was imported nowhere; it surfaced only
    because `mutmut --version` crashes on this interpreter, which made the
    evidence report list an unavailable tool that nothing used. An unused
    package inside a hash-pinned trusted computing base is attack surface with
    no function.

    !! THE GATE NAME `mutmut` MUST NOT BE RENAMED. !!
    It is a required status-check context in the live GitHub ruleset. Renaming
    the gate does not fail the check — it makes the required context
    permanently PENDING, which blocks every pull request with no error to read.
    Removing the package and keeping the name is the correct state. This test
    asserts BOTH halves: the package is gone, and the gate name is still there.
    """
    manifest = tomllib.loads(GATES.read_text(encoding="utf-8"))
    declared = cast("dict[str, Any]", manifest.get("gates", {}))
    assert "mutmut" in declared, (
        f"{rel(GATES)}: the gate named `mutmut` is gone. Its name is a required "
        f"status-check context in the live GitHub ruleset — removing or "
        f"renaming it does not fail the check, it leaves that context "
        f"permanently PENDING and blocks every pull request with no error to "
        f"read. Restore the name (the gate runs scripts/mutation_gate.py; it "
        f"never ran the mutmut package)")

    sources: list[tuple[Path, set[str]]] = [
        (REQUIREMENTS, parse_requirements(REQUIREMENTS.read_text(encoding="utf-8"))),
    ]
    for lock in (LOCK, PREFLIGHT_LOCK):
        entries, _ = parse_lock(lock.read_text(encoding="utf-8"), rel(lock))
        sources.append((lock, set(entries)))

    offenders = [f"  {rel(path)}: declares 'mutmut'"
                 for path, names in sources if "mutmut" in names]
    assert not offenders, (
        "mutmut is back in the dependency set. It is imported nowhere; the "
        "gate named `mutmut` runs scripts/mutation_gate.py. Remove the package "
        "and DO NOT rename the gate (its name is a required status-check "
        "context):\n" + "\n".join(offenders))


# ---------------------------------------------------------------------------
# RULE 7
# ---------------------------------------------------------------------------


def test_dependabot_configures_both_ecosystems_on_a_schedule() -> None:
    """Pinning without an upgrade path is a slower kind of rot.

    Every dependency here is immutable, which means nothing moves until
    something moves it. Dependabot is that something. Lose either ecosystem
    and one half of the supply chain stops receiving security fixes silently.
    """
    assert DEPENDABOT.is_file(), (
        f"{rel(DEPENDABOT)} is missing — every SHA pin and every `==` pin in "
        f"this repository would stop receiving security updates, silently")

    text = DEPENDABOT.read_text(encoding="utf-8")
    try:
        loaded: Any = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        pytest.fail(f"{rel(DEPENDABOT)} is not valid YAML: {exc}")
    assert isinstance(loaded, dict), (
        f"{rel(DEPENDABOT)}:1: top level is {type(loaded).__name__}, not a mapping")
    config = cast("dict[str, Any]", loaded)

    assert config.get("version") == 2, (
        f"{rel(DEPENDABOT)}: `version` is {config.get('version')!r}, must be 2 — "
        f"GitHub ignores the file otherwise")

    raw_updates: Any = config.get("updates")
    assert isinstance(raw_updates, list) and raw_updates, (
        f"{rel(DEPENDABOT)}: `updates` is missing or empty")
    updates = cast("list[Any]", raw_updates)

    # Line numbers for the ecosystems, so a failure points at the file.
    lines = {m.group(1): i
             for i, line in enumerate(text.splitlines(), 1)
             for m in [re.match(r"\s*-?\s*package-ecosystem:\s*\"?([\w-]+)\"?", line)]
             if m is not None}

    problems: list[str] = []
    for ecosystem in ("github-actions", "pip"):
        blocks: list[dict[str, Any]] = [
            cast("dict[str, Any]", u) for u in updates
            if isinstance(u, dict)
            and cast("dict[str, Any]", u).get("package-ecosystem") == ecosystem]
        if not blocks:
            problems.append(
                f"{rel(DEPENDABOT)}: no `package-ecosystem: {ecosystem}` block — "
                + ("every `uses:` SHA pin stops receiving bumps"
                   if ecosystem == "github-actions"
                   else "the Python floors in requirements.txt stop receiving bumps"))
            continue
        for entry in blocks:
            at = f"{rel(DEPENDABOT)}:{lines.get(ecosystem, 1)}"
            schedule: Any = entry.get("schedule")
            if not isinstance(schedule, dict):
                problems.append(
                    f"{at}: `{ecosystem}` has no `schedule:` mapping — without "
                    f"an explicit schedule the cadence is implicit and "
                    f"unreviewable")
                continue
            interval: Any = cast("dict[str, Any]", schedule).get("interval")
            if not isinstance(interval, str) or not interval:
                problems.append(
                    f"{at}: `{ecosystem}` schedule has no `interval:` — "
                    f"`interval` is the only required schedule key")
            if entry.get("directory") is None and entry.get("directories") is None:
                problems.append(
                    f"{at}: `{ecosystem}` declares neither `directory:` nor "
                    f"`directories:` — Dependabot will not know where to look")

    assert not problems, "\n" + "\n".join(f"  {p}" for p in problems)


# ===========================================================================
# POSITIVE CONTROLS
#
# A guard that has never fired is not known to work. Every checker above is
# run here against a workflow that is deliberately wrong, and asserted to
# reject it — and against a correct one, and asserted to stay quiet. Both
# halves matter: a checker that always returns a violation would pass the
# first half and fail every real file, and a checker that always returns none
# would pass the second half and guard nothing.
# ===========================================================================

GOOD_WORKFLOW = """\
name: good
on: [push]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5.1.0
      - name: Set up Python
        uses: actions/setup-python@ece7cb06caefa5fff74198d8649806c4678c61a1 # v6.3.0
      - run: pip install --quiet --require-hashes -r requirements.lock
"""

# Four separate regressions, each of which has a real-world precedent:
#   line 7  — a floating tag, the most common actions mistake there is
#   line 9  — a SHA pinned but stripped of its version comment
#   line 10 — pip install from requirements.txt (floors, not pins)
#   line 11 — pip install of a hand-listed subset, no hashes at all
BAD_WORKFLOW = """\
name: bad
on: [push]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - name: Set up Python
        uses: actions/setup-python@ece7cb06caefa5fff74198d8649806c4678c61a1
      - run: pip install --require-hashes -r requirements.txt
      - run: pip install pytest hypothesis
"""


def test_control_sha_pinning_rejects_a_floating_tag() -> None:
    found = unpinned_uses(BAD_WORKFLOW, "bad.yml")
    assert len(found) == 1, f"expected exactly one unpinned ref, got: {render(found)}"
    only = found[0]
    assert only.line == 7, f"wrong line reported: {only}"
    assert "actions/checkout@v5" in only.what
    assert "MUTABLE" in only.what
    assert only.what.startswith("job 'verify'"), (
        f"failure does not name the job: {only}")
    assert str(only).startswith("bad.yml:7:"), (
        f"failure is not actionable — no file:line: {only}")


def test_control_sha_pinning_accepts_a_correct_workflow() -> None:
    assert unpinned_uses(GOOD_WORKFLOW, "good.yml") == []


def test_control_sha_pinning_ignores_a_uses_inside_a_run_block() -> None:
    """A `uses:` in a shell heredoc is text, not an invocation."""
    text = GOOD_WORKFLOW + """\
      - run: |
          cat > /tmp/note <<'EOF'
          uses: actions/checkout@v5
          EOF
"""
    assert unpinned_uses(text, "heredoc.yml") == []


def test_control_version_comment_rejects_a_bare_sha() -> None:
    found = uses_without_version_comment(BAD_WORKFLOW, "bad.yml")
    by_line = {v.line: v for v in found}
    # Both offending lines lack the comment: line 7 (the floating tag, which
    # rule 1 also catches) and line 9 (a correct SHA stripped of its comment,
    # which ONLY this rule catches).
    assert set(by_line) == {7, 9}, (
        f"expected missing version comments on lines 7 and 9, got: {render(found)}")
    assert "actions/setup-python" in by_line[9].what
    assert str(by_line[9]).startswith("bad.yml:9:"), (
        f"failure is not actionable — no file:line: {by_line[9]}")


def test_control_version_comment_accepts_a_correct_workflow() -> None:
    assert uses_without_version_comment(GOOD_WORKFLOW, "good.yml") == []


def test_control_pip_rejects_requirements_txt_and_bare_packages() -> None:
    found = pip_install_violations(BAD_WORKFLOW, "bad.yml")
    by_line = {v.line: v for v in found}
    assert set(by_line) == {10, 11}, (
        f"expected violations on lines 10 and 11, got: {render(found)}")
    assert "requirements.txt" in by_line[10].what
    assert ".lock" in by_line[10].what
    bare = [v.what for v in found if v.line == 11]
    assert any("--require-hashes" in w for w in bare), bare
    assert any("bare package list" in w for w in bare), bare


def test_control_pip_accepts_a_correct_workflow() -> None:
    assert pip_install_violations(GOOD_WORKFLOW, "good.yml") == []


def test_control_pip_survives_a_backslash_continuation() -> None:
    """The flag on the second physical line still counts."""
    split = """\
name: split
on: [push]
jobs:
  v:
    runs-on: ubuntu-latest
    steps:
      - run: |
          pip install --quiet \\
              --require-hashes -r requirements.lock
"""
    assert pip_install_violations(split, "split.yml") == []

    unhashed = split.replace("--require-hashes ", "")
    found = pip_install_violations(unhashed, "split.yml")
    assert [v.line for v in found] == [8], (
        f"continuation not joined, or violation mis-located: {render(found)}")


def test_control_lock_parser_rejects_unpinned_and_unhashed_entries() -> None:
    bad = """\
# a comment
pytest>=8.0
hypothesis==6.1.0
pyyaml==6.0.3 \\
    --hash=sha256:deadbeef
"""
    entries, violations = parse_lock(bad, "bad.lock")
    by_line = {v.line: v.what for v in violations}
    assert 2 in by_line and "not an exact" in by_line[2], by_line
    assert 5 in by_line and "malformed hash" in by_line[5], by_line
    assert entries["hypothesis"].hashes == frozenset(), (
        "an entry with no hashes must be reported as unhashed")


def test_control_lock_parser_accepts_a_correct_block() -> None:
    good = ("attrs==26.1.0 \\\n"
            f"    --hash=sha256:{'a' * 64} \\\n"
            f"    --hash=sha256:{'b' * 64}\n"
            "    # via aiohttp\n")
    entries, violations = parse_lock(good, "good.lock")
    assert violations == []
    assert entries["attrs"].version == "26.1.0"
    assert len(entries["attrs"].hashes) == 2
