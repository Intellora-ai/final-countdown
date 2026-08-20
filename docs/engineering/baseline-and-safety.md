# Baseline and safety contract

Authoritative for: **baseline fact classification**, **status vocabulary**, **safety boundaries**,
and **inversion records**. It does not restate what other documents already own — see the map at the
end.

Recorded on 2026-08-20 against `main` @ `221e319`.

---

## 1. Status vocabulary

One meaning each. These are the only four.

| status | meaning |
|---|---|
| **PASS** | Complete valid evidence exists and satisfies the criterion. |
| **FAIL** | Evidence exists and a verified requirement, check, assertion, threshold or artifact failed. |
| **BLOCK** | Safe progression cannot occur: required evidence is absent, stale, malformed, contradictory, incomplete, unavailable, skipped, cancelled, or not terminal. |
| **UNKNOWN** | Available evidence does not prove the claim, state, cause or result. |

**UNKNOWN is never PASS** for a merge, safety or release decision. Absent evidence is not zero and
is not success.

---

## 2. Baseline facts

Every fact carries a classification. Nothing is stated bare.

| fact | value | classification | source |
|---|---|---|---|
| Repository identity | `Intellora-ai/final-countdown` | INDEPENDENTLY_VERIFIED | `git remote get-url origin` |
| Required-context count | 17 | INDEPENDENTLY_VERIFIED | `scripts/check_ruleset.py` → `ALIGNED: 17 required checks, all pinned, manifest and GitHub agree`, 2026-08-20 |
| Accepted pytest configuration | `pytest -n auto --dist loadfile` | INDEPENDENTLY_VERIFIED | `.github/workflows/verify.yml`, `coverage` job |
| Complete required PR time | **97 s** on `861f64d` | INDEPENDENTLY_VERIFIED | GitHub jobs API; latest required-job `completed_at` − earliest `pull_request` workflow `created_at`; measured 2026-08-20 |
| Complete required PR time | **182 s** | HISTORICAL REPORT — NOT INDEPENDENTLY REVERIFIED | `docs/ci-benchmark.md`. Two later same-definition measurements on this repository returned 97 s and 98 s. Sample size, SHA and whether queue time was included are **UNKNOWN**. |
| 900-second maximum | 900 s | CONTRACT — a requirement, not a measurement | stated objective |
| Headroom | 900 − 97 = **803 s** on `861f64d` | DERIVED — inherits the status of its inputs | formula and inputs shown |
| Withdrawn figure | 93 s | WITHDRAWN — must not be reused | — |
| Reason for withdrawal | It measured a **push** run rather than a complete pull-request run, and omitted a workflow. | INDEPENDENTLY_VERIFIED | `docs/ci-benchmark.md` |

**182 s is not permanent, universally representative, or a guarantee.** Neither is 97 s: it is one
measurement on one SHA on one day. `docs/ci-benchmark.md` remains authoritative for CI timing
methodology; this table is authoritative only for how each figure is *classified*.

### Local measurements, this machine

| command | runs | median | slowest | target | status |
|---|---|---|---|---|---|
| `make sandbox-fast` | 3 | 7 s | 7 s | ≤ 60 s | PASS |
| `make sandbox-test` | 3 | 65 s | 67 s | ≤ 180 s | PASS |

Machine: Apple Silicon arm64, macOS 26.4.1, 10 CPUs, Python 3.14.7, Node v26.0.0.
**Limit:** the workflows declare Python 3.12 and Node 24. A local pass does not promise a CI pass,
and `make doctor` prints that as `LIMIT` on every run.

---

## 3. Safety boundaries

**May modify host state:** `make bootstrap` only — it creates `.venv/`, installs from lockfiles,
and sets `core.hooksPath`. It prints every action before taking it.

**May delete data:** nothing. No target deletes, and none touches host Docker resources, volumes,
databases or user files — there are none to touch.

**Namespacing:** all generated state lives under the repository: `.venv/`, `.evidence/`,
`reports/`, `node_modules/`. All gitignored. Nothing global except the absence of it.

**Secrets:** none in source, logs, fixtures or evidence. `.env.example` carries variable *names*
and never values. AXLE needs no credential from this repository.

**Network:** `make test`, `make sandbox-fast` and `make sandbox-test` make **no** network call.
`-m "not axle"` is the boundary. `make test-axle` is the single explicit opt-in and says so before
it runs.

**External / accounting systems:** none exist in this repository. No Tally, ODBC, GST or accounting
integration is present — verified by search, not assumed. Automated tests are prohibited from
connecting to any real production system, and there is nothing here that could.

**Escape hatch:** if the sandbox misbehaves, `rm -rf .venv .evidence && make bootstrap` restores it.
To stop the hook deliberately: `git config --unset core.hooksPath`. Both are visible acts, which is
the point — there is no bypass token.

---

## 4. Inversion records

Ten material failure modes, recorded before later milestones build on this.

| # | FAILURE_MODE | EVIDENCE_SOURCE | WHAT_IS_PROVEN | WHAT_IS_NOT_PROVEN | PLANNED_CONTROL | FUTURE_ACCEPTANCE_RULE | STATUS |
|---|---|---|---|---|---|---|---|
| 1 | A locally runnable required check is omitted before push | run 32380682052 (`pyright`, 16 errors) | It happened, and CI caught it | That no other check can be dropped the same way | `ci/local-execution.toml` + pyright invariant + pre-push hook | Manifest covers all 17; pyright forced `yes`+`in_fast` | **IMPLEMENTED** |
| 2 | A gate emits no verdict | run 32381293460 → `GATE RESULT UNKNOWN` | `gate.py` refuses to infer a result | That every future gate declares one | AST test asserting `passed()`/`failed()`/`infrastructure_failure()` exist | No gate merges without an explicit verdict path | **IMPLEMENTED** |
| 3 | Polling reads non-terminal state as final | SHA `e53bfed2` | A single read raced and lost | That the bounded wait is long enough for every future context | Bounded poll, fails closed on timeout | Non-terminal ⇒ BLOCK, never PASS | **IMPLEMENTED** |
| 4 | Logic waits for a check absent from the event | SHA `7cc6b0bb` — `CodeQL` absent on push | 16 of 17 contexts exist on a push SHA; `CodeQL` does not | That no other context is event-shaped | Event guard; probe API shape before writing logic against it | A context must be proven present for the event before it is awaited | **IMPLEMENTED** |
| 5 | A measured PR claim contradicts evidence | PR #28: claimed 42→13 AXLE calls; real 9→3 | The log held the refutation throughout | That prose claims outside the table are all caught | `merge-evidence` gate, advisory | Claims bind to current-SHA evidence; derived values recomputed | **PLANNED — NOT IMPLEMENTED** (advisory, not required) |
| 6 | A baseline metric is stale or scope-less | `docs/ci-benchmark.md` says "182 s is the number"; later same-definition runs measured 97 s and 98 s | The document states a figure as current that later measurement did not reproduce | Which figure is representative | §2 classification table; every figure labelled | No unlabelled baseline fact | **IMPLEMENTED** here |
| 7 | A planned control is described as implemented | this table | — | — | `PLANNED — NOT IMPLEMENTED` required on every unbuilt control | No control described as enforced without evidence | **IMPLEMENTED** |
| 8 | Future speed work weakens required verification | — | Nothing yet | That future work will resist the temptation | Fast and full are separate declared contracts; the full suite may not be trimmed to hit the fast target | A speed change that removes coverage is FAIL | **PLANNED — NOT IMPLEMENTED** |
| 9 | Unknown evidence is treated as PASS | §1 | The vocabulary forbids it | That every future tool obeys it | Fail-closed everywhere; `run_one` returns BLOCK for a missing binary or a timeout | UNKNOWN ⇒ BLOCK for merge/safety/release | **IMPLEMENTED** in this tooling |
| 10 | Documentation duplicates or contradicts itself | six proposed `docs/engineering/*` files reduced to three | Duplication was proposed and removed before it landed | That no future doc restates another | One authority per subject; new docs link | A term defined twice is FAIL | **IMPLEMENTED** |

---

## 5. Authoritative source map

| subject | authority |
|---|---|
| What verification proves and does not | [TRUST.md](../../TRUST.md) |
| Gate lifecycle, evidence schema | [evidence.md](../../evidence.md) |
| CI timing methodology and samples | [docs/ci-benchmark.md](../ci-benchmark.md) |
| PR measured-claim binding | [docs/merge-evidence.md](../merge-evidence.md) |
| Required-context identity | [ci/gates.toml](../../ci/gates.toml) + the live ruleset |
| Local execution eligibility and commands | [ci/local-execution.toml](../../ci/local-execution.toml) |
| Local sandbox usage | [local-sandbox.md](local-sandbox.md) |
| Word definitions and measurement rules | [measurement-and-definitions.md](measurement-and-definitions.md) |
| Baseline classification, status vocabulary, safety, inversion | **this document** |
