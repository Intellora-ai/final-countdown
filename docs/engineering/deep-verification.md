# The deep verification lane and the verification bundle

Authoritative for: **what the deep lane verifies**, **how a category proves it does not
apply**, and **what the verification bundle is and is not**. Status vocabulary lives in
[baseline-and-safety.md](baseline-and-safety.md); measurement rules in
[measurement-and-definitions.md](measurement-and-definitions.md); the fast sandbox in
[local-sandbox.md](local-sandbox.md); the regression registry in
[regression-system.md](regression-system.md).

---

## 1. The lane

```bash
make deep-verify
```

Six components across the five categories Milestone 5 names. Selection comes from
`[deep_checks.*]` in `ci/local-execution.toml` — a third table, kept apart from
`[contexts.*]` (the 17 required GitHub contexts) and `[local_checks.*]` for the same
reason those two are apart: a check that could occupy a required context's name would
print a line indistinguishable from the check GitHub actually enforces.

| category | component | what it runs |
|---|---|---|
| full regression | `full-regression` | `pytest -m "not axle" -n auto --dist loadfile` |
| integration | `integration-axle` | `pytest -m axle` — the hosted AXLE boundary |
| security | `security-gate` | bandit + AST re-derivation of every subprocess exception |
| security | `credential-scan` | credential-shaped strings in the tracked tree |
| determinism | `determinism` | the contract twice, compared after normalisation |
| migration | `migration` | five absence probes — no command, nothing to run |

**Every component runs. None is skipped because an earlier one failed.** `sandbox-fast`
stops at the first non-PASS because its question is *may I push*. This lane's question is
different — it produces evidence for five categories — and stopping early would leave four
unmeasured while still reporting a verdict. A reader could then not tell "this category
passed" from "this category never ran".

Verdicts come from the closed set `PASS / FAIL / BLOCK / UNKNOWN / NOT_APPLICABLE /
NOT_RUN_LOCALLY`. Evidence lands in `.evidence/deep-verify/<run-id>/`.

---

## 2. This is the only lane allowed to touch the network

`integration-axle` calls `axle.axiommath.ai` for real. That does **not** make AXLE
reachable from the pre-push loop:

- `requires_network` is enforced inside `local_gates.select()`, not annotated in a comment.
- Both default tiers — `sandbox-fast` and `sandbox-test` — exclude every network-requiring
  check, and report it as `NOT_RUN_LOCALLY` with its reason and opt-in command.
- `tests/test_deep_verify.py` proves it against the real manifest rather than against a
  reading of the code.

The integration record carries what Milestone 5 asks for: start and end time, exact
command, endpoint hostname, selected/passed/failed/skipped counts, source SHA, and
evidence path. If AXLE is unreachable, returns a transport error, or produces an
unverifiable result, the verdict is `BLOCK` or `UNKNOWN`. It is never `PASS`.

---

## 3. Migration is `NOT_APPLICABLE`, and that is earned every run

A single grep is not proof. A repository can lack the word "alembic" and still evolve a
schema under another name, so five probes look in five different places:

1. migration directories — `migrations`, `migrate`, `alembic`
2. migration commands — `Makefile`, `package.json` scripts, every workflow
3. migration dependencies — both Python manifests, both Node manifests
4. database connection config, `schema.sql`, `CREATE TABLE`, ORM config
5. database services — `services:` blocks, db images, ports in any workflow

Each probe's **raw output** is retained in the evidence, so a reader checks the finding
instead of trusting a boolean.

| outcome | verdict |
|---|---|
| every probe empty **and** every probe ran | `NOT_APPLICABLE` |
| any probe found something | `FAIL` — the claim is false on this commit |
| any probe could not run | `UNKNOWN` |

The third row is the one people skip. *The search did not work* and *the search found
nothing* are different facts, and only one of them supports the claim.

A `FAIL` here does not degrade to a quieter status. A migration mechanism appearing after
this document was written is exactly what the probes exist to catch.

---

## 4. The GitHub workflow — non-required, label-gated, fork-blocked

`.github/workflows/deep-verify.yml`. Declared in `ci/gates.toml` as `mandatory = false`,
so `required_checks` stays at 17 and no ruleset changes.

```yaml
on:
  workflow_dispatch:      # requires an explicit, validated source_sha
  pull_request:
    types: [labeled]
```

Three distinct states, and the vocabulary matters:

| situation | state |
|---|---|
| ordinary push, or normal PR synchronize | `DEEP_WORKFLOW_RUN: NOT_STARTED` — no run is created at all |
| a label event whose label is not `deep-verify` | `DEEP_WORKFLOW_STATUS: NOT_RUN` |
| a label event with `deep-verify` | `DEEP_WORKFLOW_STATUS: RUN` |

**Fork pull requests are blocked.** This workflow holds `id-token: write`, which is signing
authority. Anyone able to apply a label to a fork PR could otherwise make this
repository's identity sign bytes from a branch it does not control:

```
github.event.pull_request.head.repo.full_name == github.repository
```

False → `STATUS: BLOCK`, and the run stops before any network call or signature.

The `workflow_dispatch` input is free-form text that flows into `ref:`, so it is
constrained to a bare 40-character hex SHA at the gate, before anything downstream
consumes it. No template expression appears inside any `run:` block.

---

## 5. `SOURCE_SHA` is the PR head, never the test-merge commit

On a `pull_request` run GitHub sets `github.sha` to a generated test-merge commit that
exists in no branch. A bundle bound to it would be bound to a commit nobody can check out.

```
SOURCE_SHA        github.event.pull_request.head.sha    ← the identity for everything
WORKFLOW_RUN_SHA  github.sha                            ← recorded, never the identity
MERGE_SHA         github.event.pull_request.merge_commit_sha, when supplied
```

`SOURCE_SHA` alone identifies `source.tar`, the outer bundle, the SBOM, the provenance
subject, the artifact name and the verification report. The workflow asserts that the
checked-out tree really is that SHA before it builds anything.

---

## 6. The verification bundle

**It is a verification bundle.** It is not deployable, not a container image, not a release
binary, not a promotion candidate. This repository has no deployable artifact — no
`Dockerfile`, no `[build-system]` in `pyproject.toml`, no npm entry point, no release
workflow — and none was invented to fill the gap. `bundle.manifest.json` records
`not_a_deployable_artifact: true` so the claim travels with the file.

```
GitHub Actions artifact: sandbox-verification-bundle-<SOURCE_SHA>
├── sandbox-verification-bundle-<SOURCE_SHA>.tar   ← signed; its SHA-256 is the identity
│   ├── source.tar                                  git archive of SOURCE_SHA
│   ├── evidence/                                   deep-lane evidence from this run
│   └── entries.manifest.json                       SHA-256 of every entry
├── bundle.manifest.json
├── sbom.cdx.json            CycloneDX JSON — binds the outer digest and SOURCE_SHA
├── provenance.intoto.json   SLSA v1 in-toto — binds the outer digest and SOURCE_SHA
├── bundle.sig
└── bundle.pem
```

### Why two layers

`git archive` emits tracked files only — which is exactly what makes it the right
*source-snapshot* mechanism, because `.git`, `.venv`, `__pycache__`, `node_modules` and
`.evidence` are absent by construction rather than by a filter someone has to keep
correct. But deep-lane evidence is generated during the run and is untracked, so it cannot
appear inside a tar `git archive` produced. `git archive` is the snapshot mechanism; it is
not the bundle builder.

The SBOM and provenance sit **beside** the tar rather than inside it, because no file can
carry the SHA-256 of the archive containing it — adding it would change the bytes it
claims to describe.

### Determinism

Python's `tarfile` records whatever the filesystem reports for owner, group, mode and
mtime, and two machines disagree about all four. Every entry is normalised: lexical order,
uid and gid 0, empty uname and gname, fixed modes, and mtime taken from the **source
commit** rather than the clock. Uncompressed, because gzip embeds a timestamp of its own.

The acceptance test is not that the code looks deterministic — two builds' SHA-256 are
compared.

---

## 7. Signing, and what "verified" is allowed to mean

`cosign sign-blob` / `cosign verify-blob` over the exact `.tar` bytes. Not an image
command: this is a file, and there is no OCI registry anywhere in this repository. Keyless
via GitHub Actions OIDC — no long-lived key is generated, stored, or requested.

**The identity is observed, not constructed.** Deriving an expected identity from
environment variables and passing it to `cosign` proves only that cosign accepted the
arguments this repository supplied. The actual issuer and certificate identity are read
back out of `bundle.pem`, and verification passes only when all four hold:

```
ACTUAL_ISSUER               == https://token.actions.githubusercontent.com
ACTUAL_CERTIFICATE_IDENTITY == the identity derived at runtime from GITHUB_WORKFLOW_REF
RECORDED_SOURCE_SHA         == SOURCE_SHA
RECORDED_BUNDLE_DIGEST      == the independently recomputed SHA-256 of the tar
```

Any mismatch is `FAIL`. Nothing about the owner, repository, branch or workflow filename is
written into the workflow.

### One authoritative bundle, and one copy that is not

Exactly one bundle is built and signed per `SOURCE_SHA` per run. The altered copy used for
the rejection test is **not an artifact build**: it is never signed, never uploaded as the
authoritative bundle, and exists only so the rejection can be demonstrated against real
bytes.

```bash
cosign verify-blob \
  --signature bundle.sig \
  --certificate bundle.pem \
  <altered-bundle.tar>
# non-zero exit required
```

A comparison of two digest strings would prove nothing about the signature, so it is not
used.

---

## 8. What none of this claims

The deep lane is evidence, not a merge gate. It is non-required by design: an outage at a
third-party service must not be able to block a merge.

A local deep run is a partial result in exactly the way `sandbox-fast` is — it evaluates
what can run on this machine and names what cannot.

The bundle is signed and its digest is recorded. That makes it *tamper-evident*, which is
a narrower claim than secure: it means an altered copy fails verification against the
original signature, and it is proven by the rejection test above rather than asserted here.
