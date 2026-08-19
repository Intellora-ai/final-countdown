# CI optimizations

Seven optimizations were requested. **Three** required a change, **four** did not —
and the four "no change" verdicts are recorded here with the evidence that
settles them, because "already optimal" asserted without evidence is just a
claim that nobody checked.

Rule for this document: every number is measured, and every number says what
produced it. Where a number cannot exist yet, it says **MEASUREMENT PENDING**
and names the exact command or event that would produce it. No estimates.

> **`pr-fast` no longer exists.** The rows below that name it are kept as the
> record of what was measured at the time, not as a description of the current
> workflow set. It was removed after a later measurement tested its stated
> purpose — "latency feedback on a PR" — and found it false: at job-level
> medians it ran in 126s while `axle-verify` answered the same question in 23s
> and `coverage` in 98s. A supplementary check slower than every required job
> it shadows delivers no feedback earlier than they do. See `ci/gates.toml`
> where `[gates.fast]` used to be for the full numbers.

## Measured baseline

Wall-clock seconds for **successful** runs, from GitHub's own `run_started_at`
and `updated_at`, via `python3 scripts/ci_metrics.py`. Cancelled and failed runs
are excluded: a cancelled run's duration measures when someone hit the button.

| workflow | N | median | p95 | min | max |
|---|---|---|---|---|---|
| codeql  | 32 | 56.0 s | 122.0 s | 45.0 s | 200.0 s |
| e2e     | 3  | 115.0 s | 135.0 s | 113.0 s | 135.0 s |
| pr-fast | 28 | 95.0 s | 163.0 s | 24.0 s | 168.0 s |
| verify  | 25 | 102.0 s | 287.0 s | 72.0 s | 292.0 s |

Re-run `scripts/ci_metrics.py --baseline` against a saved copy of these numbers
to compare after/before. This table is the "before".

---

## 1. Cancel superseded runs (concurrency)

**Requested.** Stop paying for runs whose commit has already been replaced.

**Found.** No `concurrency:` block in any of the four workflows. Every push to a
PR branch left the previous run executing to completion against a commit nobody
would merge.

**Changed.** A `concurrency:` block on all four workflows, keyed
`${{ github.workflow }}-${{ github.ref }}` so runs on different PRs never cancel
each other, with:

```yaml
cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

The condition is the load-bearing part. On a push to `main` the run **is** the
authoritative verification of an already-merged commit; cancelling it would
leave a merged commit with no completed verification, which is the single
outcome this repository exists to prevent. Superseding is only ever safe on
`pull_request`.

**Evidence: MEASUREMENT PENDING.** Cancellation saves nothing until a run is
actually superseded, and no superseded run exists yet. The number appears after
two commits are pushed to one open PR less than a workflow-duration apart. To
produce it:

```bash
gh run list --json status,conclusion,createdAt,updatedAt,workflowName \
  --jq '[.[] | select(.conclusion=="cancelled")]'
```

Saved runner-minutes = sum of `updatedAt - createdAt` over those cancelled runs.
Note this is the one figure `ci_metrics.py` deliberately excludes from its
duration summary, so it must be counted separately — by design, not oversight.

**Open blocker introduced by this change — see §8.** As it stands this change
fails the test suite. It must not be committed until §8 is resolved.

## 2. Measure before claiming (scripts/ci_metrics.py)

**Requested.** A way to tell whether any of this actually helped.

**Found.** Nothing recorded CI durations. Every performance claim was unfalsifiable.

**Changed.** `scripts/ci_metrics.py` reports N, median, p95, min and max per
workflow from GitHub run metadata, and refuses to print a comparison it cannot
support. It installs nothing: GitHub already stores these timestamps, and a
monitoring platform would be a second source of truth for a number the first
source already has.

**Evidence.** It produced the baseline table above — N=88 successful runs across
four workflows. That table is the artifact.

## 3. Browser-level smoke test (e2e workflow)

**Requested.** Prove the one artifact this repository renders actually loads.

**Found / changed.** `e2e.yml` runs Playwright against the coverage report at
`127.0.0.1:4173`, in two viewports, headless.

**Evidence.** N=3 successful runs, median 115.0 s, min 113.0 s, max 135.0 s.
N=3 is thin — the median is one run away from moving. Treat it as an order of
magnitude, not a stable figure, until N ≥ 10.

## 4. Dependency caching — **the stated finding was wrong; one job was fixed**

**Requested.** Cache pip and npm downloads so jobs stop re-fetching them.

**Claimed finding.** "Every job already sets `cache: pip` or `cache: npm` on
setup-python/setup-node."

**Found — REFUTED.** Audit of all four workflow files by parsing the YAML rather
than grepping it:

| workflow | job | action | `cache:` before |
|---|---|---|---|
| e2e | e2e | setup-python | **NONE** |
| verify | full | setup-python | **NONE** |
| verify | 12 gate jobs | setup-python | `pip` |
| pr-fast | fast | setup-python | `pip` |
| e2e | e2e | setup-node | `npm` |

**13 of 15** `setup-python` steps were cached, not 15 of 15. The two exceptions
are not the same kind of exception:

- **`e2e` — a real gap, now fixed.** It runs
  `pip install --require-hashes -r requirements.lock`, the same 36-package
  locked set as every other Python job, with no cache. Added `cache: pip` plus
  `cache-dependency-path: requirements.lock`. The explicit dependency path
  matters: `cache: pip` alone keys on the default `requirements.txt`, which this
  job never reads — a cache keyed on a file the install ignores goes stale
  without ever announcing it. It now shares a cache key with `verify` and
  `pr-fast` rather than owning a second, divergent one.
- **`full` — correctly uncached, left alone.** Its steps are checkout,
  setup-python, download-artifact, `aggregate_gates.py`, upload-artifact. It
  runs no `pip install` at all, so a cache would be pure save/restore overhead
  on an empty set. Adding one would make it slower.

After the change: **14 of 15** `setup-python` cached, and the one remaining is
correct.

**Evidence: MEASUREMENT PENDING** for the saving. A cache saves time only on a
restore, and `e2e` has never run with this key. To produce the number, compare
the `Install Python dependencies` step duration in the next two `e2e` runs (first
= cold, populates cache; second = warm):

```bash
gh run view <run-id> --log | grep -A2 "Install Python dependencies"
```

Cold-minus-warm on that one step is the saving. Do not attribute whole-workflow
delta to it — `npx playwright install chromium` and the pytest coverage run
dominate this workflow's 115 s median and are untouched.

## 5. Shallow checkout — **confirmed, no change needed**

**Claimed finding.** `actions/checkout` defaults to `fetch-depth: 1`; only
`preflight` sets `fetch-depth: 0`, and it needs full history because
`scripts/tcb_gate.py` calls `git merge-base`.

**Found — CONFIRMED, all three parts.**

1. **Only `preflight` sets it.** Parsing all 17 jobs across four workflows:
   exactly one `checkout` step carries `fetch-depth`, in `verify.yml`'s
   `preflight`, value `0`. The other 16 use the action default of 1.
2. **The default really is 1**, so 16 jobs are already shallow. There is nothing
   to shorten.
3. **`preflight` genuinely needs full history.** `scripts/tcb_gate.py`:

   ```
   line 78:  def merge_base(base: str) -> str | None:
   line 79:      code, out = git("merge-base", "HEAD", base)
   line 84:      code, out = git("diff", "--name-only", f"{since}...HEAD")
   line 97:      code, out = git("log", "--format=%B", f"{since}..HEAD")
   line 110:     base = merge_base(ns.base)
   ```

   `merge-base HEAD origin/main` needs both histories to reach a common
   ancestor. Under `fetch-depth: 1` there is no common ancestor in the clone,
   `merge-base` fails, and the gate cannot run at all — it does not run weakly,
   it does not run. The trailing `git log --format=%B` over the same range is
   what reads the `TCB:` justification trailer, so shallowing this job would
   silently disable the trusted-computing-base check.

**Changed.** Nothing. Shallowing the only job that needs depth would break a
gate; the other 16 are already at depth 1.

**Evidence.** The audit above and the five cited lines of `scripts/tcb_gate.py`.
No timing measurement applies: there is no candidate change to measure.

## 6. Artifact retention — **confirmed, no change needed**

**Claimed finding.** `e2e` already uses `retention-days: 7`; `verify`/`pr-fast`
use 30 for gate evidence, which must not be shortened.

**Found — CONFIRMED.**

| workflow | uploads | retention-days |
|---|---|---|
| e2e | `playwright-report/`, `test-results/`, `if: failure()` only | 7 |
| pr-fast | `reports/` | 30 |
| verify | `reports/`, all 13 jobs | 30 |

The split matches what the artifacts are for. `e2e` uploads **only on failure**
— on a green run it stores nothing at all, which beats any retention setting —
and a Playwright trace is a debugging aid with a short useful life. The 30-day
artifacts are the gate evidence the `full` finalizer consumes and the audit
trail the repository exists to produce. Shortening those trades a small storage
saving against the ability to answer "what did this gate actually check on the
commit that merged", which is the wrong trade at any price.

**Changed.** Nothing.

**Evidence.** The table above, from parsing all `upload-artifact` steps. Storage
volume is not measured here because no change is proposed; if it is ever wanted,
`gh api /repos/{owner}/{repo}/actions/artifacts --jq '[.artifacts[].size_in_bytes]|add'`
gives the current total.

## 7. Parallel gate execution — **confirmed, no change needed**

**Claimed finding.** All 12 gate jobs in `verify.yml` already have no `needs:`,
so they run in parallel; only `full` has `needs:` and must, being the finalizer.

**Found — CONFIRMED, exactly.** `verify.yml` declares 13 jobs. Parsed:

- **12 with no `needs:`** — `preflight`, `axle-verify`, `spec-strength`,
  `spec-composition`, `vacuity-check`, `counterexample-search`, `honest-report`,
  `coverage`, `pyright`, `bandit`, `mutmut`, `correspondence`. All start
  together, bounded only by runner availability.
- **1 with `needs:`** — `full`, listing all 12, plus `if: always()`.

`full`'s dependency is not overhead, it is the entire point: it downloads every
gate's artifact and proves the set is complete. A finalizer that ran before its
inputs would prove nothing. `if: always()` is equally load-bearing — without it
one failing gate skips `full`, the required context never reports, and the PR
sits pending forever instead of failing.

Note `preflight` is deliberately **not** a dependency of the gates. It blocks
the merge on its own as a required check; making 12 jobs queue behind it would
buy nothing but latency.

**Changed.** Nothing. There is no serialization left to remove.

**Evidence.** Job-graph parse above. The critical path is already
`max(gate durations) + full`, which is the floor for this structure. `verify`'s
102.0 s median against a 292.0 s max is consistent with a fan-out whose spread is
runner scheduling, not dependency chaining.

---

## 8. Blocker: the concurrency change currently fails the test suite

**Not one of the seven.** Found while verifying the seven, and it blocks §1.

`tests/test_ci_integrity.py::test_codeql_workflow_has_no_untrusted_interpolation`
**fails** on the current working tree:

```python
text = (sandbox / CODEQL).read_text(encoding="utf-8")
assert not re.search(r"\$\{\{\s*github\.(event|head_ref)", text)
```

The regex matches `github.event` as a prefix of `github.event_name`, so the new
line 51 of `codeql.yml` trips it:

```yaml
cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

**Proof it is the concurrency block and nothing else:**

- `git show HEAD:.github/workflows/codeql.yml | grep 'github\.'` → no matches.
  The committed file contains zero `github.*` interpolations.
- Stash the `codeql.yml` change, run that single test → **exit 0**. Restore it →
  **exit 1**. Controlled, repeatable.

**Blast radius.** `pyproject.toml` sets `testpaths = ["tests"]`, so this test is
collected by `pytest -q` in `pr-fast` **and** by
`pytest --cov=src --cov-branch --cov-fail-under=95 -m "not axle"` in `verify`'s
`coverage` gate. Both would fail. `coverage` is a required check.

**On the merits.** The test's stated target is "a workflow that interpolates
event text into a shell". `github.event_name` is not event text — it is a fixed
enum GitHub sets (`push`, `pull_request`, `schedule`, …), it is not
attacker-controlled, and it is evaluated by the Actions expression engine in a
`cancel-in-progress:` key, never reaching a shell. So this is a false positive
on substance, produced by a deliberately broad prefix match.

**Not fixed here, deliberately.** Every available fix either narrows a
security gate's regex or edits the workflow, and loosening a gate to make a
change pass is the exact move this repository is built to prevent. It needs an
owner's decision. The options, stated plainly:

1. **Narrow the regex** to `github\.(event\b|event\.|head_ref)` so it still
   catches `github.event.*` and `github.head_ref` — the genuinely
   attacker-controlled contexts — but not `github.event_name`. This is a change
   to a security check and must be reviewed as one.
2. **Avoid the context in `codeql.yml`.** `cancel-in-progress` can be driven off
   `github.ref` instead, e.g. cancelling only for `refs/pull/*`. No test change,
   but the expression is less direct about its intent.
3. **Drop the concurrency block from `codeql.yml` only**, keeping it on the
   other three. Loses the saving on the workflow with the highest max (200.0 s).

Until one is chosen, §1 must not be committed.

---

## What is and is not measured

**Measured, real numbers:** the baseline table (§ top, N=88 runs); the
workflow-file audit in §4–§7 (parsed YAML, not grep); the `tcb_gate.py`
dependency in §5 (cited lines); the §8 failure (controlled stash/restore).

**MEASUREMENT PENDING, with the producing command named:** concurrency saving
(§1 — needs a superseded run); `e2e` pip-cache saving (§4 — needs one cold and
one warm run).

**Deliberately not measured:** artifact storage volume (§6) and gate critical
path (§7), because no change is proposed for either — measuring a thing you are
not changing produces a number with no decision attached to it.
