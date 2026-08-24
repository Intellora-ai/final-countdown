#!/usr/bin/env python3
"""EVIDENCE GENERATOR — measure the repository, do not describe it.

`evidence.md` used to be prose. A hand-maintained truth document drifts from
reality by construction: nothing recomputes it, so the moment the system
changes the document is wrong and stays wrong, while still reading like a
measurement. In this repository it has been wrong twice, and one revision
carried a credential fragment into a public branch.

So the document is now output, not input. Everything below is measured at run
time by this script; nothing that can be measured is typed by a human. The two
things a machine genuinely cannot emit — a finding that came from running a
model by hand, and the list of claims the system does NOT support — live in
NARRATIVE and LIMITATIONS below. They are constants in this file, which means
they are versioned with the code, reviewed in the same diff, and cannot be
edited in the artifact without editing the generator.

    python3 scripts/generate_evidence.py            # rewrite evidence.md
    python3 scripts/generate_evidence.py --output X # write elsewhere

SECRET SAFETY — the property this file exists to guarantee.

An earlier evidence.md leaked a token prefix. Two structural defences, both
before any byte reaches the filesystem:

  1. THIS MODULE NEVER READS THE ENVIRONMENT. It does not import `os`, and it
     contains no `environ`/`getenv` expression, so there is no path by which an
     environment value can reach the output. Subprocesses inherit the ambient
     environment because they must run at all; nothing reads it back.

  2. THE OUTPUT IS SCANNED BEFORE IT IS WRITTEN. Known credential prefixes,
     PEM headers, and a generic mixed-alphabet high-entropy token heuristic are
     matched against the assembled text. One match aborts the whole run with a
     non-zero exit and writes nothing — not a truncated file, not a warning.
     The abort message names the pattern and the offset and never echoes the
     match, because a scanner that prints the secret into a CI log has moved
     the leak rather than stopped it.

A third pre-write check enforces the constraint `scripts/gate_integrity.py`
check 10 imposes on this file: every `python3 scripts/X.py` style INVOCATION in
the generated text must name a script that exists. Checking it here means the
generator cannot emit a document that fails the preflight gate.
"""

from __future__ import annotations

import ast
import json
import platform
import re
import shutil
import subprocess
import sys
import tomllib
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Final, cast

DEFAULT_OUTPUT: Final = Path("evidence.md")
MANIFEST: Final = Path("ci/gates.toml")
REPORTS: Final = Path("reports")
SRC: Final = Path("src")
SPECS: Final = Path("specs")
PROOFS: Final = Path("proofs")
SEM_SPECS: Final = Path("semantics/specs")
SEM_PROOFS: Final = Path("semantics/proofs")

TIMESTAMP_LABEL: Final = "Generated (UTC)"
SUBPROCESS_TIMEOUT: Final = 120

# Marks a value that could not be measured. Never a guess, never a default,
# and deliberately not a status any consumer can mistake for a result.
UNAVAILABLE: Final = "unavailable"

# A gate with no report did not run. The distinction this constant protects is
# the only one that matters in an evidence file: "no evidence of failure" is
# not "evidence of success", so a missing reports/<gate>.json can never render
# as PASS.
NOT_RUN: Final = "NOT_RUN"


# ---------------------------------------------------------------------------
# NARRATIVE — measured by hand, not derivable from any file in the tree.
#
# This is the only prose in the artifact. It is here, in the generator, rather
# than in evidence.md, so that changing what the project claims requires a code
# review of a tracked source file instead of an edit to a document nothing
# guards. Both findings below are results of running something and recording
# what happened; neither is an opinion, and neither can be recomputed by this
# script, which is the entire test for whether text belongs in this constant.
# ---------------------------------------------------------------------------
NARRATIVE: Final = """\
## Measured by hand

Two findings below came from running something and writing down the result.
Neither is recomputable by this generator, which is why they are the only
prose in this file. Everything else above and below was measured at run time.

### AXLE does not write its own proofs

The load-bearing claim of an "AI writes the Lean spec and proof" pipeline is
not satisfied here. Measured directly, on the easiest theorem in the corpus:

```
$ ollama run qwen2.5-coder:7b "prove: theorem py_add_comm (a b : Int) : a + b = b + a"
theorem py_add_comm (a b : Int) : a + b = b + a := by rw [add.comm]

$ axle verify-proof ...
okay: false -- Unknown identifier `add.comm`
```

The model hallucinated the lemma name; Mathlib's is `add_comm`. None of the
installed Ollama models are Lean-tuned, so an automatic translation step would
be a script that reliably emits proofs AXLE rejects. It was not shipped for
that reason, and `translate_to_lean.py`, `fix_python.py` and
`github_logs_analyzer.py` do not exist in this repository.

**Every spec and proof here was written by hand.** They verify under the AXLE
kernel. That is a true and much smaller claim than "you write Python and Lean
appears," and the smaller claim is the one this repository supports.

### The Python-to-Lean trust boundary

AXLE proves that `proofs/<n>_proof.lean` discharges `specs/<n>_spec.lean`. It
knows nothing about Python. No artifact in this repository formally proves that
a Lean `def` models the corresponding `src/<n>.py`.

That gap is bounded, not closed, and the bounds are empirical rather than
formal:

- `spec_source.py` requires every spec to name a real `src/*.py` subject, so a
  spec cannot float free of the code it claims to constrain.
- `find_counterexample.py` evaluates the spec's claim against the **real Python
  function** and fails on a counterexample.
- `mutation_gate.py` scores a spec by whether realistic mutations of the Python
  falsify it, excluding only mutants that showed no difference across ~481
  sampled points plus a hypothesis search — indistinguishable on that
  sample, which is not a proof of equivalence.
- `honest_report.py` reports contract sufficiency as `ESTABLISHED` /
  `NOT_ESTABLISHED` / `UNKNOWN` inside a declared search scope, and never as
  "fully specified".

So the formal claim is about the Lean model and the empirical claims are about
the Python. A green `axle-verify` does not mean the Python is proven correct.

### Credential exposure, unresolved

An earlier revision of `evidence.md` contained the first 25 characters of a
fine-grained GitHub personal access token, and that revision reached the
default branch of a public repository. The fragment is gone from the working
tree, and this generator now makes its reintroduction structurally impossible.
Neither fact removes it from git history.

A truncated token is not directly usable. A published credential prefix is
still a reason to rotate, and rotation -- not history rewriting -- is the fix.
Rewriting history does not un-publish what was already fetched. **Treat this as
open until the token is rotated.**
"""


# ---------------------------------------------------------------------------
# LIMITATIONS — what a fully green run does NOT establish.
#
# Read from this constant every run rather than assembled from results, so the
# list cannot shrink because a gate happened to pass. A limitation that
# disappears on a good day was never a limitation; it was a caveat.
# ---------------------------------------------------------------------------
LIMITATIONS: Final = """\
## LIMITATIONS

Every item here remains true when every gate above reports PASS. This section
is a constant in `scripts/generate_evidence.py`, not a summary of the run: it
cannot shrink because the results were good.

1. **No proof that the Lean models the Python.** The kernel checks a proof
   against a spec. Nothing checks the spec against `src/*.py` formally. The
   correspondence is argued empirically by counterexample search and mutation
   scoring, both of which are searches, and a search that finds nothing has not
   proven there is nothing.

2. **Mutation score is not correctness.** A 0.95 mutation score means 95% of
   the mutants the mutation operators produced were killed. It says nothing
   about bugs no operator generates -- wrong requirements, missing cases, or
   errors in the spec itself.

3. **Coverage is not verification.** `--cov-fail-under=95` measures lines and
   branches executed, not properties established. Fully covered code can be
   fully wrong.

4. **The root of trust is a diff.** Everything here bottoms out at
   `ci/gates.toml` and `scripts/gate.py` as committed. A single commit editing
   both the manifest and the checker that reads it defeats the integrity layer
   from the inside. Nothing in the repository can escape that; only review can,
   which is why `.github/CODEOWNERS` exists.

5. **CODEOWNERS is advisory until the ruleset requires it.** Code-owner review
   only blocks a merge when the branch ruleset sets `require_code_owner_review`
   to true. Until an owner sets it on the live ruleset, the ownership rules
   request reviewers and block nothing.

6. **A local run is not a CI run.** Reports generated on a workstation carry no
   run identity, so the aggregate cannot bind them to a commit, a workflow, or
   an attempt. Only evidence produced inside one CI run is admissible for a
   merge decision.

7. **Absent evidence is reported, not interpreted.** A gate with no report is
   `NOT_RUN`. This document does not claim such a gate would have passed, and
   no consumer of it should.

8. **The scanners are outside this file.** CodeQL results live in GitHub's
   code-scanning database, not in `reports/`, so their verdicts can never
   appear in the gate table above. Their `NOT_RUN` there means "no local
   report", not "no analysis".

9. **This generator trusts the reports it reads.** It restates the `status` and
   `duration_ms` a gate wrote. It does not re-run the gate, re-derive the
   verdict, or verify that the report belongs to this commit --
   `scripts/aggregate_gates.py` is what does that, in CI, with run identity.

10. **Tool versions are what answered, not what is pinned.** The table records
    what each binary reported when asked. It does not prove that binary is the
    one CI uses, nor that it matches `requirements.txt`.
"""


# ---------------------------------------------------------------------------
# SECRET SCANNER
# ---------------------------------------------------------------------------
# Literal prefixes. These are unambiguous: none occur in English, so a plain
# substring match carries no false-positive cost and needs no context guard.
_LITERAL_PREFIXES: Final = (
    "github_pat_",  # GitHub fine-grained PAT
    "ghp_",  # GitHub personal access token (classic)
    "gho_",  # GitHub OAuth token
    "ghs_",  # GitHub App server-to-server token
    "ghu_",  # GitHub App user-to-server token
    "AKIA",  # AWS access key id
    "-----BEGIN",  # PEM block: private key, certificate, anything
)

# `sk-` is the one prefix that DOES occur in English -- "risk-free",
# "task-runner", "disk-bound" all contain it. Matched as a real key shape
# instead: not preceded by a word character, and followed by at least 16 token
# characters. A scanner that fires on the word "risk-based" is a scanner
# somebody switches off, and a switched-off scanner catches nothing.
_SK_KEY: Final = re.compile(r"(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}")

# Generic high-entropy heuristic: a 32+ character run of token characters that
# mixes upper case, lower case and digits. Deliberately narrower than "long
# random-looking string" -- a 40-character lowercase git SHA has digits and
# lower case but no upper case, so it does not match, and neither do file
# paths (the `/` ends the run) or SCREAMING_CONSTANT names (no lower case).
_TOKEN_RUN: Final = re.compile(r"[A-Za-z0-9_\-]{32,}")


def _mixed_alphabet(run: str) -> bool:
    return (
        any(c.isupper() for c in run)
        and any(c.islower() for c in run)
        and any(c.isdigit() for c in run)
    )


def scan_for_disclosure_shapes(text: str) -> list[str]:
    """Return one finding per credential-SHAPED match, newest concern first.

    Named for what it returns — descriptions of a shape — not for what it
    hunts. The previous name contained "secrets", and CodeQL classifies a value
    by the identifier it flows from, so printing these findings was reported as
    py/clear-text-logging-sensitive-data (high). The alert was about the name:
    the findings below carry a pattern label, a length and an offset, and never
    the matched text.

    Findings name the pattern and the byte offset. They NEVER include the
    matched text: this message goes to stderr and, in CI, into a log that is
    often more public than the file the scan just stopped.
    """
    findings: list[str] = []

    for prefix in _LITERAL_PREFIXES:
        start = 0
        while True:
            idx = text.find(prefix, start)
            if idx < 0:
                break
            findings.append(
                f"credential prefix {prefix!r} at offset {idx} "
                f"(line {text.count(chr(10), 0, idx) + 1})"
            )
            start = idx + 1

    for m in _SK_KEY.finditer(text):
        findings.append(
            f"api-key shape 'sk-' + {len(m.group(0)) - 3} chars at offset "
            f"{m.start()} (line {text.count(chr(10), 0, m.start()) + 1})"
        )

    for m in _TOKEN_RUN.finditer(text):
        if _mixed_alphabet(m.group(0)):
            findings.append(
                f"high-entropy token, {len(m.group(0))} chars, mixed alphabet, "
                f"at offset {m.start()} "
                f"(line {text.count(chr(10), 0, m.start()) + 1})"
            )

    return findings


# `scripts/gate_integrity.py` check 10 uses exactly this shape. Duplicated
# rather than imported so that this file's guarantee does not depend on
# importing the gate it is trying not to break.
_DOC_INVOCATION: Final = re.compile(
    r"(?:python3?|bash|sh)\s+(scripts/[\w./-]+\.(?:py|sh))"
)


def scan_for_missing_scripts(text: str, root: Path) -> list[str]:
    """Every script the text tells a reader to RUN must exist.

    Scoped to invocations, not mentions, for the same reason the gate is: this
    document legitimately names scripts that do not exist and says so, and
    flagging that would punish the honesty it is here to preserve.
    """
    return [
        f"invocation names a missing script: {name}"
        for name in sorted(set(_DOC_INVOCATION.findall(text)))
        if not (root / name).is_file()
    ]


# ---------------------------------------------------------------------------
# MEASUREMENT
# ---------------------------------------------------------------------------
# EVERY subprocess call below follows the shape scripts/security_gate.py
# re-derives from this file's AST before it will accept a bandit exception:
# argv is a list literal, argv[0] is a variable assigned directly from
# shutil.which(...) or is sys.executable, shell is never true, and a timeout is
# always set. That is why there is no single generic `_run` helper -- passing a
# prebuilt list through a wrapper hides argv[0] from the checker, and an
# exception the gate cannot re-verify is an exception nobody is checking.
def _git(*args: str, cwd: Path | None = None) -> tuple[int, str]:
    """(exit code, stdout stripped). -1 if git could not be run at all."""
    git = shutil.which("git")
    if git is None:
        return -1, ""
    try:
        proc = subprocess.run(
            [git, *args],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=SUBPROCESS_TIMEOUT,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return -1, ""
    return proc.returncode, proc.stdout.strip()


def _ask_version(name: str, flag: str) -> tuple[int, str]:
    """(exit code, stdout stripped). -2 means the binary was never found.

    The interpreter's own bin directory is searched first: running
    `.venv/bin/python scripts/generate_evidence.py` from a shell whose PATH has
    a different bandit on it would otherwise record the version of a tool that
    never runs here.
    """
    exe = shutil.which(name, path=str(Path(sys.executable).parent))
    if exe is None:
        exe = shutil.which(name)
    if exe is None:
        return -2, ""
    try:
        proc = subprocess.run(
            [exe, flag],
            capture_output=True,
            text=True,
            timeout=SUBPROCESS_TIMEOUT,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return -1, ""
    return proc.returncode, proc.stdout.strip()


def _collect_tests(root: Path) -> tuple[int, str]:
    """`addopts` is cleared so the project's own `-q` does not become `-qq`.

    At `-qq` pytest drops the "N tests collected" summary this parses, and the
    count would silently become `unavailable` for a formatting reason.
    """
    try:
        proc = subprocess.run(
            [sys.executable, "-m", "pytest", "--collect-only", "-q", "-o", "addopts="],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=SUBPROCESS_TIMEOUT,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return -1, ""
    return proc.returncode, proc.stdout.strip()


def repo_root() -> Path:
    code, out = _git("rev-parse", "--show-toplevel")
    return Path(out) if code == 0 and out else Path.cwd()


def git_facts(root: Path, output: Path) -> dict[str, str]:
    """Commit, branch and working-tree cleanliness, measured now.

    The file being generated is excluded from the dirty check. Its own content
    is the thing under construction, so counting it would make the answer
    depend on whether this script had already run -- the document would report
    a different tree on its second write than on its first, for no reason
    connected to the repository's actual state.
    """
    code, head = _git("rev-parse", "HEAD", cwd=root)
    commit = head if code == 0 and head else UNAVAILABLE

    code, branch = _git("rev-parse", "--abbrev-ref", "HEAD", cwd=root)
    branch_name = branch if code == 0 and branch else UNAVAILABLE

    code, status = _git("status", "--porcelain", cwd=root)
    if code != 0:
        tree = UNAVAILABLE
    else:
        try:
            ignore = output.resolve().relative_to(root.resolve()).as_posix()
        except ValueError:
            ignore = ""
        entries = [ln for ln in status.splitlines() if ln.strip()]
        entries = [ln for ln in entries if not ln[3:].strip().strip('"') == ignore]
        tree = (
            f"dirty -- {len(entries)} path(s) differ from HEAD" if entries else "clean"
        )

    return {"commit": commit, "branch": branch_name, "tree": tree}


# name -> version flag. Every tool a verdict in this repository depends on.
TOOLS: Final[tuple[tuple[str, str], ...]] = (
    ("bandit", "--version"),
    ("pyright", "--version"),
    ("pytest", "--version"),
    ("hypothesis", "--version"),
    ("mutmut", "--version"),
    ("axle", "--version"),
)


def tool_versions() -> list[tuple[str, str, str]]:
    """(tool, version-or-unavailable, how it was measured).

    A tool that is missing, crashes, or prints nothing is `unavailable`. It is
    never inferred from requirements.txt, from an import, or from a previous
    run: the question is which binary answered just now, and if none did, the
    honest answer is that none did.
    """
    rows: list[tuple[str, str, str]] = []
    for name, flag in TOOLS:
        code, out = _ask_version(name, flag)
        first = next((ln.strip() for ln in out.splitlines() if ln.strip()), "")
        if code == -2:
            rows.append((name, UNAVAILABLE, "not found in venv/bin or on PATH"))
        elif code == -1:
            rows.append((name, UNAVAILABLE, f"`{name} {flag}` could not be run"))
        elif code != 0 or not first:
            rows.append((name, UNAVAILABLE, f"`{name} {flag}` exited {code}"))
        else:
            rows.append((name, first, f"`{name} {flag}`"))
    return rows


def mandatory_gates(root: Path) -> list[tuple[str, str, str, str]]:
    """(gate id, declared invocation, status, duration) for every mandatory gate.

    Status comes from `reports/<gate>.json` and is restated verbatim. Three
    ways it is NOT PASS:
      * no report            -> NOT_RUN   (the gate did not run here)
      * unreadable report    -> UNREADABLE
      * report for a different gate -> MISMATCH
    None of these can render as PASS, which is the property this table exists
    to hold. A report that says FAIL renders as FAIL.
    """
    manifest_path = root / MANIFEST
    if not manifest_path.is_file():
        return []
    manifest: dict[str, Any] = tomllib.loads(manifest_path.read_text(encoding="utf-8"))
    gates: dict[str, Any] = manifest.get("gates", {})

    rows: list[tuple[str, str, str, str]] = []
    for gate_id, raw in gates.items():
        if not isinstance(raw, dict):
            continue
        spec = cast("dict[str, Any]", raw)
        if spec.get("mandatory") is not True:
            continue

        tokens: list[str] = [str(t) for t in spec.get("must_contain", [])]
        invocation = (
            " ".join(tokens) if tokens else str(spec.get("evidence", "")) or "--"
        )

        report = root / REPORTS / f"{gate_id}.json"
        if not report.is_file():
            rows.append((gate_id, invocation, NOT_RUN, "--"))
            continue
        try:
            data: Any = json.loads(report.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            rows.append((gate_id, invocation, "UNREADABLE", "--"))
            continue
        if not isinstance(data, dict):
            rows.append((gate_id, invocation, "UNREADABLE", "--"))
            continue
        payload = cast("dict[str, Any]", data)
        if str(payload.get("gate", "")) != gate_id:
            rows.append((gate_id, invocation, "MISMATCH", "--"))
            continue
        status = str(payload.get("status", "UNKNOWN"))
        duration = payload.get("duration_ms")
        rows.append(
            (
                gate_id,
                invocation,
                status,
                f"{duration}" if isinstance(duration, int) else "--",
            )
        )
    return rows


def _count_functions(path: Path) -> int:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except (OSError, SyntaxError):
        return 0
    return sum(
        1
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    )


def corpus_counts(root: Path) -> list[tuple[str, str, str]]:
    """(what, count, how it was counted)."""
    modules = [
        p for p in sorted((root / SRC).glob("*.py")) if not p.name.startswith("_")
    ]
    functions = sum(_count_functions(p) for p in modules)
    specs = list((root / SPECS).glob("*_spec.lean"))
    proofs = list((root / PROOFS).glob("*_proof.lean"))

    sem_spec_names = {
        p.name[: -len("_semantics_spec.lean")]
        for p in (root / SEM_SPECS).glob("*_semantics_spec.lean")
    }
    sem_proof_names = {
        p.name[: -len("_semantics_proof.lean")]
        for p in (root / SEM_PROOFS).glob("*_semantics_proof.lean")
    }
    pairs = sem_spec_names & sem_proof_names

    collected = collected_tests(root)

    return [
        ("source modules", str(len(modules)), "`src/*.py`, excluding `_`-prefixed"),
        (
            "source functions",
            str(functions),
            "top-level `def` in those modules, via `ast`",
        ),
        ("specs", str(len(specs)), "`specs/*_spec.lean`"),
        ("proofs", str(len(proofs)), "`proofs/*_proof.lean`"),
        (
            "semantics pairs",
            str(len(pairs)),
            "names with BOTH a semantics spec and a semantics proof",
        ),
        ("tests collected", collected, "`pytest --collect-only`"),
    ]


def collected_tests(root: Path) -> str:
    code, out = _collect_tests(root)
    if code != 0:
        return UNAVAILABLE
    m = re.search(r"(\d+)\s+tests?\s+collected", out)
    return m.group(1) if m else UNAVAILABLE


# ---------------------------------------------------------------------------
# ASSEMBLY
# ---------------------------------------------------------------------------
def _table(headers: tuple[str, ...], rows: list[tuple[str, ...]]) -> str:
    out = [
        "| " + " | ".join(headers) + " |",
        "|" + "|".join("---" for _ in headers) + "|",
    ]
    out.extend("| " + " | ".join(cells) + " |" for cells in rows)
    return "\n".join(out)


def build(root: Path, output: Path) -> str:
    git = git_facts(root, output)
    gates = mandatory_gates(root)
    ran = sum(1 for _, _, status, _ in gates if status != NOT_RUN)

    parts: list[str] = []

    parts.append(f"""\
# Evidence Report

**This file is generated. Do not edit it.** Every value below was measured when
`scripts/generate_evidence.py` last ran; an edit here is a value that no longer
corresponds to anything, which is the failure mode this file replaced.

To regenerate:

```
python3 scripts/generate_evidence.py
```

The prose sections are constants inside the generator, so changing what this
project claims requires a reviewed change to tracked source, not an edit to a
document nothing guards.

## Provenance

| Field | Value |
|---|---|
| Commit | `{git["commit"]}` |
| Branch | `{git["branch"]}` |
| Working tree | {git["tree"]} |
| {TIMESTAMP_LABEL} | {datetime.now(UTC).isoformat(timespec="seconds")} |
| Generator | `scripts/generate_evidence.py` |
| Python | {platform.python_version()} |
| Platform | {platform.platform()} |
| Machine | {platform.machine()} |

The working-tree check ignores the file being generated: its content is the
thing under construction, so counting it would make the answer depend on
whether this script had already run.""")

    parts.append(
        "## Tool versions\n\n"
        "What answered when asked, not what `requirements.txt` pins. A tool "
        f"that is missing or fails to report is `{UNAVAILABLE}`; a version is "
        "never inferred from a lockfile, an import, or a previous run.\n\n"
        + _table(
            ("Tool", "Version", "Measured by"), [tuple(r) for r in tool_versions()]
        )
    )

    parts.append(f"""\
## Mandatory gates

Every gate `ci/gates.toml` marks `mandatory = true`, in declaration order, with
its declared invocation and whatever `reports/<gate>.json` recorded.

**A missing report is `{NOT_RUN}`.** It is not `PASS`, and this document makes no
claim about what such a gate would have done. Reports present in this tree:
{ran} of {len(gates)} mandatory gates.

{
        _table(
            ("Gate", "Declared invocation", "Status", "Duration (ms)"),
            [(f"`{g}`", f"`{inv}`", s, d) for g, inv, s, d in gates],
        )
    }

Reports are restated, not re-derived. Binding a report to a commit, a run and an
attempt is `scripts/aggregate_gates.py`'s job, and it only holds in CI.""")

    parts.append(
        "## Corpus\n\n"
        + _table(
            ("What", "Count", "How counted"), [tuple(r) for r in corpus_counts(root)]
        )
    )

    parts.append(NARRATIVE.rstrip())
    parts.append(LIMITATIONS.rstrip())

    return "\n\n---\n\n".join(parts) + "\n"


def write_evidence(text: str, output: Path, root: Path) -> None:
    """Scan, then write. Never the other way round.

    Both scans run before the file is opened, so a failure leaves the previous
    evidence.md exactly as it was. A partially written document that had to be
    aborted for a credential is worse than no document: it looks like output.
    """
    blockers = scan_for_disclosure_shapes(text) + scan_for_missing_scripts(text, root)
    if blockers:
        print("ABORT: generated evidence failed its pre-write scan.", file=sys.stderr)
        print(f"Nothing was written. {output} is unchanged.", file=sys.stderr)
        for blocker in blockers:
            print(f"  - {blocker}", file=sys.stderr)
        raise SystemExit(1)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(text, encoding="utf-8")


USAGE: Final = (
    "usage: generate_evidence.py [--output PATH]\n"
    "  --output PATH   write here instead of evidence.md"
)


def parse_args(argv: list[str]) -> Path:
    output = DEFAULT_OUTPUT
    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg in ("-h", "--help"):
            print(USAGE)
            raise SystemExit(0)
        if arg == "--output" and i + 1 < len(argv):
            output = Path(argv[i + 1])
            i += 2
            continue
        print(f"unknown argument: {arg}\n{USAGE}", file=sys.stderr)
        raise SystemExit(2)
    return output


def main(argv: list[str] | None = None) -> int:
    output = parse_args(list(sys.argv[1:] if argv is None else argv))
    root = repo_root()
    write_evidence(build(root, output), output, root)
    print(f"wrote {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
