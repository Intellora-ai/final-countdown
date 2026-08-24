# Measurement and definitions contract

Authoritative for: **what ambiguous words mean here**, and **the rules every measurement obeys**.
Baseline facts and status vocabulary live in [baseline-and-safety.md](baseline-and-safety.md).

---

## Why this exists

"Fast", "safe", "reliable", "production-ready" have no single accepted meaning. Used as an
acceptance criterion, an undefined adjective is unfalsifiable — and an unfalsifiable claim cannot
fail, so it cannot pass either. Each term below is given a repository-specific operational meaning,
or is marked **NOT YET OPERATIONALIZED** and may not gate anything.

---

## Measurement rules

1. Every **percentage** states numerator and denominator.
2. Every **duration** states its start event and end event.
3. Every **comparison** names its baseline and confirms a comparable environment.
4. Every **derived value** shows its formula and source values.
5. Missing evidence is **UNKNOWN** — never zero, never PASS.
6. Every measurement states its **sample size**.

### Vague → measurable

| vague | measurable |
|---|---|
| "the sandbox is fast" | `make sandbox-fast` median 7 s over 3 runs on Apple Silicon arm64 / macOS 26.4.1 / Python 3.14.7, target ≤ 60 s |
| "tests are good" | 8 of 17 required contexts run locally; the other 9 are listed with exact reasons and are not evaluated here |
| "coverage improved" | `--cov-fail-under=95`; measured 100.00 % of `src` statements, 4 files, on SHA X |
| "the environment is reliable" | NOT YET OPERATIONALIZED — no failure-rate measurement exists over any window |
| "the build is production-ready" | NOT YET OPERATIONALIZED — no production exists |

---

## Terms

Schema per term: **definition · metric · formula · unit · evidence source · window/sample ·
threshold · PASS/FAIL/BLOCK/UNKNOWN · limitation.**

### Operationalized

**fast / speed** — Wall-clock duration of a named command on a named machine.
Metric: seconds, `end − start`. Source: `.evidence/<tier>/<run-id>/summary.json`; GitHub jobs API
for CI. Sample: 3 runs, median reported with slowest. Threshold: `sandbox-fast` ≤ 60 s,
`sandbox-test` ≤ 180 s, complete required PR path ≤ 900 s. Over threshold ⇒ **FAIL**; not measured ⇒
**UNKNOWN**. *Limitation:* one machine, one day; says nothing about other hardware.

**accurate / accuracy** — A stated claim agrees with the declared authoritative evidence.
Metric: count of contradictions. Formula: claims contradicted ÷ claims checked. Unit: count.
Source: GitHub logs and jobs API. Threshold: 0. Any contradiction ⇒ **FAIL**; unverifiable claim ⇒
**UNKNOWN**. *Limitation:* only covers claims someone thought to check.

**precise / precision** — A failure report names SHA, workflow, run/job, target, exact argv, exit
code, timeout, duration, evidence path, observed output, status, next safe action. Metric: required
fields present ÷ 12. Threshold: 12/12. Missing field ⇒ **FAIL**. Unproven cause ⇒ `OBSERVED_WHY =
UNKNOWN`, `NEXT_SAFE_ACTION = INVESTIGATE`. *Limitation:* proves the report is complete, not that
the diagnosis is correct.

**complete** — Every declared acceptance criterion for a stated scope has evidence.
Metric: criteria with evidence ÷ criteria declared. Threshold: 1.0 **and** the scope is written
down. Undeclared scope ⇒ **BLOCK**. *Limitation:* complete against the declared list only.

**fixed** — A retained reproducer that failed before the change and passes after.
Metric: boolean, both directions demonstrated. Source: the retained regression test. Threshold: both
required. Reproducer absent ⇒ **UNKNOWN**, never "fixed". *Limitation:* proves that case, not the
class.

**better** — A named baseline, a named metric, a comparable environment, and no regression in any
protected measure. Formula: `(baseline − new) / baseline`, both values shown. Missing baseline ⇒
**UNKNOWN**. *Limitation:* one metric improving is not the system improving.

**works** — A named command exits 0 on a named input in a named environment.
Metric: exit code. Threshold: 0. Not run ⇒ **UNKNOWN**. *Limitation:* the narrowest term here. It
means one command, one input, one machine.

**determinism** *(sandbox scope)* — Two runs of the declared local contract, same commit and
dependency state, produce identical output once **only** these are normalized: wall-clock
timestamps, `.coverage.<host>.<pid>.<random>` filenames, xdist worker-count metadata. Any other
difference ⇒ **FAIL — UNEXPLAINED NONDETERMINISM**. Evidence: raw output for both runs, normalized
output for both, the raw diff, and the rules applied, all retained under `.evidence/determinism/`.
*Limitation:* covers the non-AXLE local suite only; says nothing about GitHub runners.

**coverage** — Statement and branch coverage of `src/` measured by `pytest --cov=src --cov-branch`.
Unit: percent, numerator = covered statements, denominator = total statements in `src/`.
Threshold: `--cov-fail-under=95`. *Limitation:* `src/` is 38 lines; this number says almost nothing
about the verification apparatus, which is where the real logic lives.

### NOT YET OPERATIONALIZED

These may **not** be used as acceptance criteria. Listed so their absence is explicit rather than
quietly assumed.

| term | why not, and what would be needed |
|---|---|
| **reliable / reliability** | No failure-rate measurement over any window. Would need runs observed, failures counted, window stated. |
| **safe** | No stated threat model. Would need scope, assumptions, controls, and explicit limits. The one safety claim made here is narrow and stated in full: the pre-push hook stops ordinary local pushes and is bypassed by `--no-verify`, the web UI, the API, or another machine. |
| **secure** | Bandit, CodeQL, the security gate and the credential scan each measure *their own* rule sets. Their union is not "secure" and is not claimed to be. |
| **quality** | No definition that is not a restatement of the gates already listed. |
| **optimized** | Requires a named objective, baseline and constraint set. None declared. |
| **robust** | No fault-injection or perturbation testing exists. |
| **production-ready** | There is no production. The term has no referent here. |
| **availability** | Nothing is served. No uptime to measure. |
| **recovery** | No incident process is defined for this repository. |

### Never valid claims

**intelligent / smart** — Not a release, quality or safety criterion, in any form, ever.

If a model-backed feature is ever evaluated here, evaluate the specified behaviours separately: task
success rate on a versioned fixture set · schema-valid output rate · unsupported-claim rate ·
latency percentile · cost per successful task · error rate by input class. Those measure stated
behaviour on a stated evaluation set. **They do not prove general intelligence, truthfulness,
safety, or competence outside that set**, and no combination of them may be summarised as
"intelligent".

---

## Elsewhere

[baseline-and-safety.md](baseline-and-safety.md) — baseline classification, status vocabulary,
safety boundaries, inversion records ·
[local-sandbox.md](local-sandbox.md) — usage ·
[TRUST.md](../../TRUST.md) — what verification proves ·
[evidence.md](../../evidence.md) — gate lifecycle and schema ·
[docs/ci-benchmark.md](../ci-benchmark.md) — CI timing ·
[docs/merge-evidence.md](../merge-evidence.md) — PR claim binding
