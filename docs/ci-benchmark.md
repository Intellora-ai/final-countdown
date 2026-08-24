# pytest-xdist benchmark — measured on GitHub runners

> **STATUS: COMPLETED EXPERIMENT.** This is a record of a finished measurement,
> not a procedure. The configuration below is already in force. Nothing here
> asks anyone to reproduce it.
>
> **CURRENT ACCEPTED CONFIGURATION**
>
>     pytest -n auto --dist loadfile
>
> **NORMAL DEVELOPMENT**
>
>     one logical change set
>       -> fast-check
>       -> one final push
>       -> one current required PR workflow run
>
> **RE-BENCHMARK ONLY WHEN** test topology, fixture behavior, the dependency
> lockfile, the runner class, external-service behavior, test selection, or
> workflow topology materially changes. Absent one of those, the numbers below
> stand and re-running the comparison measures runner weather.

Seven samples were taken on PR #25. The lockfile was constant across all of
them, so the only variable was the pytest configuration in the `coverage` job.

## Why this experiment took seven samples

This section explains the sample count that was used; it is not a threshold
anyone must meet again.

`coverage` is an unchanged job that measured 111s, 129s and 148s across three
runs before this benchmark began — a 37-second spread, larger than any effect
a single-sample comparison could resolve. One sample per configuration would
have reported runner variance and called it a result.

## Samples

| label | config | coverage job | verify wall | critical path |
|---|---|---|---|---|
| A1 | serial | 148s | 160s | 160s |
| A2 | serial | 132s | 147s | 147s |
| A3 | serial | 148s | 165s | 165s |
| B1 | `-n auto` | 75s | 85s | 85s |
| B2 | `-n auto` | 63s | 77s | 77s |
| C1 | `-n auto --dist loadfile` | 70s | 83s | 83s |
| C2 | `-n auto --dist loadfile` | 59s | 74s | 74s |

## Medians

| config | n | coverage | critical path |
|---|---|---|---|
| serial | 3 | 148s | 160s |
| `-n auto` | 2 | 69s | 81s |
| **`-n auto --dist loadfile`** | 2 | **64s** | **78s** |

## Decision: `--dist loadfile`

Against serial the result is decisive: coverage 148s → 64s, critical path
160s → 78s. That is 2.05x on the critical path with an identical verification
contract.

Between the two parallel modes the medians differ by 3s and the ranges overlap
([77, 85] against [74, 83]), so wall clock alone does not separate them. The
tiebreak is `tests/test_evidence.py:49` — a `scope="module"` fixture that
shells out with a `timeout=300` budget. Under the default `--dist load` it runs
once per worker; under `loadfile` it runs once. `loadfile` is equal-or-better
on time AND removes duplicated expensive work, which is the documented
condition for preferring it.

The feared cost did not appear. `test_ci_integrity.py` (85 tests) and
`test_spec_parser.py` (88 tests) pinned to single workers could have formed
serial tails that bound the run; the measurements show they did not.

## Verification contract, unchanged

765 progress-dot characters in both serial and parallel local runs — identical
execution count. Coverage 100.00% against a 95% threshold in every sample. All
17 required contexts passed on all seven.

## Where the benchmark sits against the contract

The objective is `TOTAL_GITHUB_REQUIRED_PR_SECONDS <= 900`. The measured figure
on the current configuration is **182s**, leaving 718s of headroom. An earlier
93s figure appeared in working notes and was wrong — it measured a push run and
omitted a workflow. It is withdrawn; 182s is the number.
