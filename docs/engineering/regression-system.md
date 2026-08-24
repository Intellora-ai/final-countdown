# The regression system

Authoritative for: **which specific failure each retained test prevents**, and **how the
local quality gate reports what it did and did not run**. Status vocabulary lives in
[baseline-and-safety.md](baseline-and-safety.md); measurement rules live in
[measurement-and-definitions.md](measurement-and-definitions.md); the sandbox itself is
described in [local-sandbox.md](local-sandbox.md).

Recorded on 2026-08-21.

---

## 1. What the registry is for

`ci/gates.toml` answers *what runs in CI*. `ci/requirements.yml` answers *what is thereby
established*. Neither can answer a third question: **which specific failure would come
back if a given test were deleted.**

`ci/regression-fixtures.yml` answers it. Twelve rows, each naming one failure and the one
test that stops it returning.

### Nothing is called an escape without evidence it escaped

Every row carries `source_evidence.type`:

| type | meaning | `reference` must be |
|---|---|---|
| `ESCAPE` | the defect actually reached `main` or a green CI run before being caught | a linkable commit SHA, pull request, CI run id, or in-repository incident record |
| `REQUIREMENT` | no known escape; the fixture proves a rule this repository chose to hold | the document the rule comes from |

This distinction is the registry's point, not decoration. A registry that labels every
rule an "escape" tells a reader this repository has failed in ways it has not, and the
rows describing real failures stop standing out.

**Current split: 4 `ESCAPE`, 8 `REQUIREMENT`.** The four real ones:

| row | escape | reference |
|---|---|---|
| RF-001, RF-002 | `pyright`, a required context, was absent from the set run before pushing; four consecutive CI runs went red | commit `27429ae` |
| RF-007 | `merge-evidence` waited its full 420-second budget for `CodeQL`, a context that cannot exist on a push SHA | commit `7cc6b0b` |
| RF-008 | a pull request merged claiming "42 AXLE calls before, 13 after" when the real figures were 9 and 3 | PR #28 |

### The registry validates itself

`scripts/registry_gate.py` resolves every row: the `test_file` must exist and the
`test_name` must be **defined** in it. Parsed with `ast`, not grepped — a grep matches the
name inside a docstring, which is exactly how a row keeps "resolving" to a test that was
deleted and only mentioned in prose afterwards.

Proven non-vacuous by construction: a registry whose row names a function that does not
exist makes the gate exit 1.

---

## 2. `[local_checks]` — local checks are not GitHub contexts

`ci/local-execution.toml` now has two tables, and they never merge.

| table | holds | guard |
|---|---|---|
| `[contexts.*]` | exactly the 17 live required GitHub contexts | `test_no_context_is_invented` — unchanged, not weakened |
| `[local_checks.*]` | local regression and quality checks | `load_local_checks()` refuses any name that collides with a context |

A local check wearing a required context's name would print a line indistinguishable from
the check GitHub actually enforces. That is the false reassurance the whole manifest
exists to remove, so it is refused at load time rather than discouraged in a comment.

Every local check declares its requirement, exact argv, timeout, evidence file, tier,
`requires_network`, and a `tier_reason`. Tier membership is a decision and has to be
defensible in the file that makes it. `regression-push-chain` sits in `full` for a
correctness reason, not a budget one: it invokes `make sandbox-fast`, so in the fast tier
it would invoke itself.

---

## 3. `requires_network` is enforced, not annotated

A flag that only *documents* a network call still lets the call happen.

`local_gates.select()` — the single place every tier passes through — removes any check
with `requires_network = true` from **both** default tiers. The check is then reported as
`NOT_RUN_LOCALLY` with its reason and its opt-in command. No subprocess is spawned for it.

### preflight, reclassified on measurement

`preflight` previously carried the reason *"Neither runs offline, so the context cannot
honestly complete in the default local loop."* That was measured and found false:

```
python3 scripts/check_ruleset.py                 -> exit 0, [RESULT] PASS
python3 scripts/tcb_gate.py --base origin/main   -> exit 0
```

`gh` is on PATH, `origin/main` exists, and ruleset 20990225 is readable anonymously
because the repository is public. The honest statement is not "cannot run" but "runs, and
needs the network to do it". Those are different claims and only one of them was true.

It is now `locally_runnable = "yes"` with `requires_network = true`, which the selector
excludes from every default run.

---

## 4. The four not-run categories

A check that did not run is never reported as passed. Which *kind* of not-run it is
matters, because the remedies differ:

| category | meaning | remedy |
|---|---|---|
| `EXTERNAL` | contacts a hosted third party — `axle-verify`, `correspondence` | none locally; the service is not ours |
| `GITHUB_ONLY` | the proof is GitHub-platform-specific — `CodeQL`, `codeql-python`, `codeql-actions`, `full` | none locally; only GitHub can produce it |
| `LOCAL_PREREQUISITE_NOT_PROVISIONED` | runnable in principle, a local prerequisite is absent — `bandit` (no `shellcheck`), `e2e` (no Chromium) | install the prerequisite |
| `NETWORK_REQUIRED_EXCLUDED_FROM_DEFAULT` | runs here, excluded because the default loop makes no network call — `preflight` | run the opt-in command |
| `NOT_IN_THIS_TIER` | runs here, this tier did not select it | `make sandbox-test` |

**A missing local browser is not a third-party service.** Chromium is a prerequisite
nobody installed, not an external dependency, and calling it "external" would make an
installable gap look permanent.

### Completeness is arithmetic, not assertion

An earlier version listed only the contexts marked `locally_runnable = no`. On the fast
tier that printed **8** while **13** of the 17 required contexts had not been evaluated:
the runnable-but-not-in-this-tier ones vanished from the report entirely.

Under-reporting what did not run is the same defect as claiming something passed, one step
removed. The list is now derived as *every required context minus the ones this tier
selected*, so the arithmetic is checkable:

```
len(selected) + len(not_run) == len(contexts)      4 + 13 == 17
```

---

## 5. Status semantics

Four statuses, one asymmetry that carries the weight.

| status | when |
|---|---|
| `PASS` | the command exited 0 **and** its evidence was retained and reread |
| `FAIL` | the command exited non-zero. Always. |
| `BLOCK` | execution could not safely happen — tool absent, timeout |
| `UNKNOWN` | the **verdict itself** cannot be determined: the evidence carrying it is absent, unreadable, malformed or incomplete |

**A non-zero exit is `FAIL`, never `UNKNOWN`.** A known verdict with an unknown cause puts
the unknown in `OBSERVED_WHY`, not in `STATUS`. Otherwise a broken command reaches the
softer word and escapes the pre-push blocker.

**`UNKNOWN` may only ever replace a `PASS`.** A `FAIL` or `BLOCK` whose evidence also went
missing stays `FAIL` or `BLOCK`. Every one of the four blocks the push, so downgrading
buys nothing and opens a real hole.

---

## 6. Evidence, in two places, with one identity

| path | for | changed? |
|---|---|---|
| `.evidence/<tier>/<run-id>/summary.json` | existing readers | unchanged shape; new keys are additive |
| `.evidence/quality-gate/<run-id>/summary.json` | the Milestone 4 field contract | new |
| `.evidence/quality-gate/<run-id>/summary.md` | the file a human opens after a blocked push | new |

Both JSONs carry the same `run_id` and the same `RESULT_CHECKSUM` — a SHA-256 over the
same identity fields — so a mismatch between them is detectable rather than a matter of
trusting they were written together.

The pre-push hook prints the four categories by **reading that summary back**, not by
re-deriving them. A hook that re-derived the same facts would be a second copy, and second
copies drift.

---

## 7. What this does not claim

The local pre-push gate is a **developer-speed control, not a security boundary.**

`git push --no-verify`, the GitHub web UI, a direct API call, or another machine all
bypass it. GitHub's 17 required contexts remain the final merge proof.

A local pass is a **partial result**. On the fast tier it evaluates 4 of 17 required
contexts and says so, naming all 13 it did not.
