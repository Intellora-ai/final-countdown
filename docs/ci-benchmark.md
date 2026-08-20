# pytest-xdist benchmark — measured on GitHub runners

Seven sequential samples on PR #25. The lockfile is constant across all of
them, so the only variable is the pytest configuration in the `coverage` job.

## Why seven samples and not three

`coverage` is an unchanged job that measured 111s, 129s and 148s across three
runs before this benchmark began — a 37-second spread, larger than any effect
a single-sample comparison could resolve. One sample per configuration would
report runner variance and call it a result.

## Samples

| label | config | coverage job | verify wall | critical path | run |
|---|---|---|---|---|---|
| A1 | serial | 148s | 160s | 160s | 32364…  |

## Decision rule

Lowest median comparable critical path, and only if every verification
dimension is identical. Tie or indistinguishable → keep serial. No meaningful
median improvement → revert xdist and the lockfile entries.
