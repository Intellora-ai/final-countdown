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
| A1 | serial | 148s | 160s | 160s | 32364… |
| A2 | serial | 132s | 147s | 147s | 32365… |
| A3 | serial | 148s | 165s | 165s | 32366… |
| B1 | `-n auto` | **75s** | 85s | **85s** | 32367… |

| B2 | `-n auto` | **63s** | 77s | **77s** | 32368… |

Serial median: coverage 148s, critical path 160s.
| C1 | `-n auto --dist loadfile` | 70s | 83s | 83s | 32369… |

`-n auto` median: coverage 69s, critical path 81s.
C1 is inside the `-n auto` spread; a second loadfile sample decides it.

## Decision rule

Lowest median comparable critical path, and only if every verification
dimension is identical. Tie or indistinguishable → keep serial. No meaningful
median improvement → revert xdist and the lockfile entries.
