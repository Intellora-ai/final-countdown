# Constraints

Last reviewed: 2026-08-29

What "good enough to ship" means here, with the command that decides it. Every
number below already passes on this codebase, or is recorded as a measured
value rather than an aspiration.

**Read this before writing code. Do not weaken it to make a change pass.**

---

## Why this file exists

The rules were already real — they were spread across `CLAUDE.md`, several
hook scripts, `ci/gates.toml`, and the comments inside individual gates. That
meant a number could be argued per-change, because it was never written next to
the command that checks it.

This file does not add rules. It writes down the ones already enforced, so a
threshold and its verdict live in the same row.

---

## The floor — always, no setup required

- **No new suppressions.** `@ts-ignore`, `eslint-disable`, `# noqa`,
  `# type: ignore`. Enforced by `~/.claude/hooks/no-symptom-patch.py` and
  `laws.py`, which refuse the edit rather than reporting it.
- **No swallowed failures.** An empty `catch`, a `catch` that only logs,
  `except: pass`. A caught failure must change control flow.
- **No skipped or deleted tests** to reach green.
- **No weakening a test.** The only licence to change one is a surviving
  mutant — mutation evidence that the test cannot fail. Not "it looks too
  strict", not "the code is fine".
- **No secrets in source.** Note `VITE_*` is compiled into the browser bundle,
  so a key there is a published key.
- **This file is not edited to make a change pass.**

---

## Enforced, with the command that decides

| Dimension | Rule | Checked by | Runs at |
|---|---|---|---|
| Types (frontend) | zero errors, three projects | `npm run typecheck` | every edit, CI |
| Types (engine) | zero errors | `pyright` | CI (`pyright`) |
| Lint | zero errors, **zero warnings** | `npm run lint` (`--max-warnings 0`) | every edit, CI |
| Design values | no raw colour or arbitrary px outside `tokens.ts` | the `design-value` ESLint rule | every edit |
| Unit tests | all pass | `npm test -- --run` | every edit, CI (`frontend`) |
| Engine tests | all pass | `pytest` | CI (`full`, `coverage`) |
| Security (engine) | no findings | `bandit` | CI (`bandit`) |
| Security (code scanning) | no alerts | CodeQL — python, actions | CI (required) |
| Secrets | none exposed | `npm run gate:secrets` | CI |
| Dead code | no unreachable non-test file, no dead export | `npm run gate:reachability` | CI (`frontend`) |
| Assertion quality | planted mutants are killed | `npm run test:mutation`, `mutmut` | CI (`mutation N/4`, `mutmut`) |
| Bundle size | within budget | `npm run budget` | CI (`frontend`) |
| End to end | all specs pass | Playwright | CI (`e2e`) |
| Teaching shape | a lesson is refused unless it teaches | `checkTeaching` via `validateLesson` | every render |

A dimension with a number and no command in the `Checked by` column is an
aspiration, not a constraint.

---

## The 17 that block a merge

Enforced by repository **ruleset `20990225`**, not classic branch protection —
`gh api .../branches/main/protection` returns 404, which misleads. The list is
asserted against GitHub's live set by `scripts/check_ruleset.py`, so
`ci/gates.toml:54-62` and reality cannot drift.

```
preflight   axle-verify   spec-strength   spec-composition   vacuity-check
counterexample-search     honest-report   coverage           pyright
bandit      mutmut        correspondence  full
codeql-python             codeql-actions  CodeQL             e2e
```

`strict_required_status_checks_policy: true` — a branch must be up to date with
`main` before it can merge.

**Not required, and worth knowing why:**

- `learning-canvas-frontend` — has been red on `main` and on every recent PR
  since 2026-08-25. Do not read its red as caused by your change.
- `ai-review` — blocked on a credential; 0 of 36 reviews have run (issue #93).
- `codeql-javascript-typescript` — explicitly excluded at `ci/gates.toml:405-411`.

---

## Measured, not yet enforced

Today's values, recorded so they can only improve. A drop is the finding.

| Metric | Today | Direction |
|---|---|---|
| Gate rule coverage | **31 rules, 31 paired** — `ruleCensus.test.ts`, 61 tests | stays at zero unpaired; the census fails naming any new rule |
| Lessons passing the teaching gate | **5 of 8** registered, all 5 guarded by `lessons.test.ts` | must reach 8 |
| Canvas reachability | declared it and **measured 6 orphans + 25 dead exports**; reverted to keep the gate honest | classify all 31, then declare `src/canvas` permanently |
| Authoring, real model | **5 of 6**, mean **22.0s** (`openai/gpt-oss-120b`, per-concept + repair) | must reach 6 of 6, then widen past six questions |
| `teach/concept.ts` | built and tested (9 tests), **imported by nothing that ships** | wire it into `CanvasRoute`, or it is the orphan this repo's reachability gate exists to catch |
| Local model, warm latency | **1.68s** (`qwen2.5:3b`, 40 tokens) | cold load is minutes — budget for it |

### Every authoring measurement, including the failures

Recorded because a number believed on the way to a result is worse than no
number, and four of these were wrong for reasons that had nothing to do with
teaching. Same six questions across six subjects every time, temperature 0.

| # | Model | Unit | Score | Mean | What the refusals actually were |
|---|---|---|---|---|---|
| 1 | qwen2.5:7b | whole lesson | 0/6 | 223.5s | the baseline this set out to beat |
| 2 | qwen2.5:7b | per concept | 0/6 | 12.0s | **harness bug** — `JSON.parse` instead of the repo's own `extractJson` |
| 3 | qwen2.5:7b | per concept | 0/6 | 12.3s | **harness bug** — no token budget, JSON truncated mid-object |
| 4 | qwen2.5:7b | per concept | 1/6 | 18.4s | first real pass; prompt showed the model UNQUOTED placeholders and it copied them |
| 5 | qwen2.5:7b | per concept | 0/6 | 21.1s | **worse after adding enum lists** — a negative result, kept |
| 6 | qwen2.5:7b | per concept + repair | 2/6 | 58.5s | the repair turn doubled it |
| 7 | openai/gpt-oss-120b | per concept + repair | 2 of 2 asked | 2.6s | four questions never reached the model — HTTP 429, free-tier rate limit |
| 8 | **openai/gpt-oss-120b** | **per concept + repair** | **5/6** | **22.0s** | only "how does a bill become a law in India" refused |

Three lessons this table is the evidence for:

- **Runs 2, 3 and 4 all measured the harness, not the model.** Both causes were
  already written down in this repository — `extractJson` in `authorLesson.ts`
  and the token-budget note in `CanvasRoute.tsx` — and neither was read before
  the probe was built.
- **Run 5 got worse and is recorded anyway.** Adding enum lists to the prompt
  moved 1/6 down to 0/6.
- **Run 7 is not a 2/6.** Four of six were never asked. A probe that counts a
  rate limit as a teaching failure measures the billing plan.


---

## Where the checks run, and why placement matters

A check that stalls the edit loop gets switched off, and a gate people switched
off is worse than no gate because the bar still looks like it exists.

| Phase | What runs | Budget |
|---|---|---|
| Every edit | typecheck, lint, the changed file's tests | seconds |
| Task end | the full unit suite, reachability | under 90s |
| CI | everything above plus mutation, e2e, CodeQL, bandit | minutes |

---

## The one thing this file cannot check

**Whether the teaching is good.** `llm/validation.py` and
`teach/teaching.ts` both draw that line deliberately, and it holds here: a
score mixing countable structure with judged quality produces a number that
looks like a measurement and is not.

Rules are a floor. They prevent bad teaching; they cannot produce good
teaching. The mechanisms that raise the ceiling — generate several and pick,
self-critique, learner-outcome evidence, never repeating an explanation — are
in `docs/engineering/teaching-patterns.md`, and none of them is a rule.

**Do not add rules to fix a quality problem.** Each new rule narrows what can
be said, and a model optimising against a long rule list produces output that
passes and does not teach.
