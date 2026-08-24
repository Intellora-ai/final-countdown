# Merge evidence — a number in a pull request is a claim until a log says otherwise

> **STATUS: ADVISORY.** The `merge-evidence` job runs on every pull request and reports, but it is
> `mandatory = false` in `ci/gates.toml` and is **not** one of the 17 required contexts. It blocks
> nothing yet. Making it required is a separate, deliberate step — see *Becoming a real blocker*.

## Why this exists

Pull request #28 was merged with the sentence *"42 AXLE calls before, 13 after"*. The real figures
were 9 and 3.

The measurement that refutes the claim had been sitting in a job log of the same run for the whole
review: `13 passed, 767 deselected in 22.27s` against `13 passed, 772 deselected in 14.17s`. Eight
seconds of saving, spread over the removed calls, is 1.35s each — against an AXLE health probe that
costs 863ms. Twenty-nine removed calls would have had to cost 0.28s each. The claim was not merely
imprecise; it was arithmetically impossible against evidence GitHub already held.

Seventeen required checks were green. Nothing in the system was looking at the arithmetic.

## What this gate checks, stated exactly

The tempting target is *"prove the author read the logs"*. It is the wrong one: comprehension is not
machine-checkable, and a gate claiming to check it would itself be an unsupported claim. The
checkable requirement is narrower.

| for | the gate obtains |
|---|---|
| **every** required job | API/check evidence — latest-SHA identity and terminal success |
| every **failed** required job | its full log, and a failure dossier |
| every `source: log` evidence row | the full log of the cited run and job |
| every `source: api` evidence row | the API job data of the cited run |

**It does not download or interpret every successful job's complete raw log, and it does not claim
to.** That would add API calls and latency to every merge without touching the failure above.
`test_successful_job_logs_are_not_downloaded` proves the restraint rather than restating it.

## The Measured Evidence block

Any pull request stating a measured duration, count, coverage figure, call count, benchmark result
or speedup must carry this section. A pull request that states none needs nothing.

````markdown
## Measured Evidence

| ID | Type | Metric | Value | Unit | SHA | Run | Source | Evidence |
|---|---|---|---:|---|---|---:|---|---|
| R1 | baseline | correspondence | 22.27 | seconds | 8ea48f3 | 32371336445 | api | jobs[correspondence].duration |
| R2 | current | correspondence | 14.17 | seconds | 861f64d | 32374645764 | api | jobs[correspondence].duration |
| R3 | derived | duration saved | 8.10 | seconds | — | — | formula | R1 - R2 |
| R4 | derived | speedup | 1.57 | x | — | — | formula | R1 / R2 |
````

That table is what pull request #28 should have carried. `R3` is the row that would have caught the
error: the gate recomputes `R1 - R2` and refuses a value that does not match.

### Column rules

| column | rule |
|---|---|
| **ID** | `R1`, `R2`, … Unique. Derived formulas reference these. |
| **Type** | `current` (head SHA) · `baseline` (any earlier SHA, still bound to a real run) · `derived` (arithmetic only) |
| **Value** | numeric |
| **Unit** | closed set: `seconds` `ms` `calls` `tests` `percent` `x` `bytes` `count`. Anything else blocks — units are never guessed at or converted. |
| **SHA / Run** | required on `current` and `baseline`; `—` on `derived` |
| **Source** | `log` · `api` · `formula` (formula only on derived, and required there) |
| **Evidence** | `log`: a literal line from the log · `api`: `jobs[<job>].duration` or `jobs[<job>].conclusion` · `formula`: arithmetic over row IDs |

### Matching

Log text is normalized before matching — ANSI stripped, GitHub's RFC3339 timestamp prefix stripped,
whitespace collapsed, then case-sensitive substring. The raw log stays the record; normalization
exists only so that a claim's provability does not depend on when it ran.

Finding the marker is not sufficient. **The claimed number must appear inside the marker.** A row
citing `AXLE_CALLS=42` while claiming `13` is refused — that is exactly the #28 failure.

Derived rows must recompute within the looser of 0.005 absolute and 0.1% relative.

### Formulas

`R1 - R2` · `R1 / R2` · `(R1 - R2) / R1 * 100` · `max(R1, R2)` · `abs(...)` · `round(...)`

Evaluated by a whitelisted AST walk. **Never `eval`.** A pull request body is untrusted input on a
public repository, and `eval` on untrusted input is remote code execution with extra steps. Nine
injection payloads are in the test suite; each must raise without executing.

## Claims outside the table

A measured-looking claim in prose with no provenance nearby is refused. The detector is
`NUMBER ∧ METRIC ∧ ¬REQUIREMENT ∧ ¬nearby-provenance` — the shape already proven in
`accountant-dad-commit-bound-metrics.py`, whose docstring carries the lesson that matters most:
*deliberately narrow, because the cost of a false positive is that someone disables the whole
layer.*

Measured, not assumed: the bodies of pull requests #21–#28 carry between 10 and 56 numbers each. A
rule demanding every number appear in the table would block all eight. These do **not** trigger:

```
PR #27              17 required checks       900-second target
2 * 4 + 1 = 9       scripts/x.py:192-193     2026-08-20
run 32374645764     95% threshold            9109 bytes
```

**Honest limitation:** a carefully-worded claim can evade this detector. That is a deliberate trade.
A false-positive machine gets switched off, and a switched-off gate enforces nothing at all.

## When a required job fails

```
STATUS: FAIL
PR / LATEST_SHA / WORKFLOW / RUN_ID / JOB / STEP / LOG_SOURCE
WHAT FAILED:   <exact failing command, assertion, or API conclusion>
WHERE:         <file, line, test, step — or UNKNOWN>
OBSERVED WHY:  <log-supported reason>  |  UNKNOWN — LOG DOES NOT PROVE ROOT CAUSE
NEXT SAFE FIX: <repair direction>      |  INVESTIGATE — ROOT CAUSE NOT PROVEN
REQUIRED ACTION / EVIDENCE
```

**The gate never invents a cause.** If the log proves only that a command exited non-zero, it says
UNKNOWN and INVESTIGATE. A confidently wrong root cause sends the next person to the wrong file,
which is worse than an admitted absence of one.

## States that never become PASS

`NOT_FETCHED` · `STALE` · `UNKNOWN` · `PARTIAL` · `MALFORMED` · `CONTRADICTED` ·
`INFRASTRUCTURE_BLOCK`

Fetch budget: 30s per call, one retry, 120s total. Exhaustion is `INFRASTRUCTURE_BLOCK`, not a pass.
There is **no bypass token**. If the gate is wrong, the fix is to fix the gate and ship it through
this same process — a bypass trailer becomes the default path within a week.

## Trust boundary

> This required context protects against accidental or unsupported measured claims only to the
> extent that the merge-evidence workflow, its trusted scripts, and its required-context
> configuration cannot be modified or bypassed by the same pull request without independent
> review/policy enforcement.
>
> The gate is not a complete adversarial security boundary if a contributor can modify the gate,
> its workflow, its tests, or the ruleset enforcement logic in the same PR and still merge.

A required status check blocks a merge only while its own enforcement code is trusted. A pull
request able to edit `scripts/merge_evidence_gate.py` or `.github/workflows/verify.yml` so the gate
always passes defeats it. Required checks bind only because branch/ruleset policy requires them —
**the policy configuration is part of the enforcement boundary.**

Current coverage of the four files that matter:

| path | TCB-acknowledged | note |
|---|---|---|
| `scripts/merge_evidence_gate.py` | yes — `scripts/` prefix | |
| `.github/workflows/verify.yml` | yes — `.github/` prefix | |
| `ci/gates.toml` | yes — `ci/` prefix | |
| `tests/test_merge_evidence_gate.py` | **no** | `tests/` is not a trusted prefix |

The last row is a real gap, reported rather than quietly patched: the tests proving this gate can be
weakened without a `TCB:` acknowledgement. Extending `TRUSTED_PREFIXES` is a change to
`scripts/tcb_gate.py` and belongs to its own pull request.

## Also true, and worth stating plainly

- The local `PreToolUse` hook is an **agent-discipline preflight**, not a security control. It
  intercepts `gh pr merge` and detectable `gh api … /merge`; it cannot see the GitHub web UI, an
  MCP merge tool, or another developer's machine.
- Only a repository-side **required context** blocks every merge path. Until this gate is required,
  nothing here is mandatory.
- The gate proves a number appears in a real current-SHA log. It does not prove the number *means*
  what the pull request says it means.
- It verifies **status** evidence for every required job, and **log** evidence only for failed jobs
  and cited rows. It does not claim to have read every successful log.

## Becoming a real blocker

```
now      merge-evidence runs advisory; required contexts = 17; check_ruleset ALIGNED
next     ruleset 20990225: 17 → 18                      ← human decision, not automated
then     ci/gates.toml: mandatory = true                 ← check_ruleset proves the new equality
```

The order is forced. Flipping the manifest first makes `check_ruleset.py` fail until the ruleset
catches up; adding the required context before the job exists blocks every pull request on a check
that never reports.

## Optional later enhancement

Downloading and scanning **every** successful required job's complete raw log before merge. It adds
API calls and latency and does not improve the numeric-claim failure case. Out of scope here; it
would need its own measurement of the added critical-path cost before anyone should want it.
