# 06 — Evaluation and Benchmark Suite

**Status:** not yet built. This document specifies it.
**Read with:** doc 02 §6 (`EvaluationStatus`), doc 05 §8 (the safety reading).

---

## 1. What this is for

Two distinct jobs, and conflating them is the failure this document exists to
prevent:

1. **Is the engine correct?** — the test suite. Deterministic, offline, fast.
2. **Is a proposed policy change an improvement?** — the benchmark suite. Runs
   only when something wants to change policy, and gates whether it may.

Job 2 is the reason `EvaluationStatus` exists. A candidate change enters at
`OBSERVED`; the benchmark is the `BENCHMARK_REPLAYED` step, and the gates are
`GATES_PASSED`. Nothing reaches `LIVE` without passing through both, and then a
human.

---

## 2. The offline evaluation pipeline

```
interaction → outcome event → offline policy evaluation → benchmark replay
   → safety and quality gates → candidate policy version → human approval
   → canary deployment → monitored rollout
```

| Stage | `EvaluationStatus` | What happens |
|---|---|---|
| Outcome recorded | `OBSERVED` | A `PolicyUpdate` is constructed. Production unchanged. |
| Offline evaluation | `OFFLINE_EVALUATED` | Counterfactual scoring against logged decisions |
| Benchmark replay | `BENCHMARK_REPLAYED` | §3 |
| Gates | `GATES_PASSED` | §4 |
| Human | `AWAITING_HUMAN_APPROVAL` → `APPROVED` | A person reads the diff and the benchmark delta |
| Canary | `CANARY` | Small traffic fraction, monitored |
| Rollout | `LIVE` | Full |

`REJECTED` is reachable from every state, `LIVE` included.

**Offline evaluation is counterfactual, and that is the hard part.** The log
records what the policy did and what happened. It does not record what would
have happened under the candidate. Scoring a candidate therefore means
estimating a counterfactual, and the estimate is only as good as the overlap
between what the old policy explored and what the new one would do. **Where the
candidate diverges into actions the log never contains, offline evaluation
cannot answer, and must say so rather than extrapolating.** That is what the
canary is for.

---

## 3. Benchmark replay

A **fixed, versioned** set of recorded learner trajectories. Replay runs the
candidate policy against each and compares decisions to the recorded ones.

### Properties the suite must have

**Fixed.** A benchmark that changes alongside the policy measures nothing. It is
versioned, and a change to it is a reviewed act with its own justification.

**Adversarial, not just typical.** The trajectories that matter are the ones
where the engine could plausibly do harm:

- A learner who guesses correctly three times running
- A learner who answers correctly immediately after being told the answer
- Conflicting evidence — strong on Tuesday, absent on Thursday
- A learner who self-reports understanding while every objective signal says
  otherwise
- A skill whose verifier reports `UNSUPPORTED`
- A strategy that has already failed twice for this learner
- Prerequisite gaps two levels deep

Each maps to an invariant. The suite's job is to catch a candidate policy that
satisfies the type system and still behaves badly.

**Deterministic.** Same trajectories plus same policy version equals the same
result, every run. A benchmark with a nondeterministic score cannot distinguish
a regression from noise. Seed everything; inject the clock.

**Offline.** No network, no model. `FakeLLMClient` with fixtures. Doc 01 §2.

---

## 4. Safety and quality gates

A candidate must pass **all** of these to reach `GATES_PASSED`. Any failure
routes to `REJECTED`.

### Safety gates — absolute, no threshold

| Gate | Fails if the candidate ever |
|---|---|
| No fabricated confidence | Reports confidence on an `UNSUPPORTED` domain |
| No unearned mastery | Claims `mastered` where `can_claim_mastery()` is `False` |
| No self-report override | Raises an estimate on `SELF_REPORT` alone |
| No unjustified repeat | Repeats a failed strategy with no `repeat_justification` |
| No diagnosis | Produces any learner-model content outside the closed vocabulary |
| Replayability intact | Emits a `DecisionEvent` from which the decision cannot be rebuilt |

These are not scored. One occurrence rejects the candidate. They correspond to
invariants 7, 8, 10, 11, 12 and doc 05 §1.

### Quality gates — thresholded

| Metric | Definition | Direction |
|---|---|---|
| Bottleneck precision | Selected skill was the one blocking progress | must not fall |
| Prediction calibration | `predicted_outcome` vs `actual_outcome` | must not worsen |
| Intervention efficiency | Learning gain per minute | may fall only within tolerance |
| Overload rate | Fraction ending in `possible_overload` | must not rise |
| Do-nothing appropriateness | `DO_NOTHING` chosen when the learner was progressing | must not fall |

The last one guards a specific regression: a candidate that improves every
teaching metric by teaching *more* — interrupting learners who were fine — would
pass a suite that only measured teaching.

### Calibration deserves its own note

`PolicyUpdate.prediction_error` is `actual_outcome - predicted_outcome`, and a
policy that predicts well is one that can be reasoned about. A candidate that
raises outcomes while destroying calibration has become less explainable, and
should be treated as a regression even when the headline number improves.

---

## 5. Human approval

`AWAITING_HUMAN_APPROVAL` is not a formality and must not become a rubber stamp.

The reviewer sees: the policy diff, the benchmark delta per metric, every safety
gate result, and **the trajectories where the candidate diverged most from the
current policy**. That last item is the one that surfaces judgement failures a
metric averages away.

The reviewer can reject. Recording *why* matters as much as the decision — a
rejection with no recorded reason teaches the next candidate nothing.

---

## 6. Canary

A small traffic fraction, monitored against the same metrics.

**`LIVE → REJECTED` exists precisely for this stage.** A rollout that cannot be
stopped is not a canary, and a state machine that only moved forward would make
the whole step theatre.

Rollback criteria are defined **before** the canary starts, for the same reason
`expected_evidence` is fixed before acting (invariant 2): criteria chosen after
seeing the results will be met.

---

## 7. What the engine test suite covers instead

The benchmark suite does not replace tests. The suite proves the engine is
correct; the benchmark proves a change is an improvement.

Current measured state:

```
105 tests, all passing
ruff check      clean
mypy --strict   clean on src and tests
```

Until `6eef301` this read 99 of 100, and the failure was the sandbox test in
doc 03 §4. It is worth keeping in this document because of *how* it hid: the
test passed under `PYTHONPATH=src` with no install, and failed under a realistic
install.

**The lesson generalises to the benchmark.** A suite that only runs in one
environment measures that environment. Run it the way production runs, or it
will be green for the same bad reason — and a benchmark is far harder to
re-audit than a unit test, because nobody reads a green metric twice.

### Two CI gaps, found while verifying the above

Neither is fixed, and neither belongs to a session that owns the workflow file.

**`tests/` is not type-checked in CI.** `learning-os.yml` runs
`mypy --strict src/learning_os`. The tests are where the invariants are actually
asserted — a test that constructs a violating object and asserts it raises is
the enforcement — so leaving them unchecked is the more consequential half. Six
type errors sat in the test files unnoticed; they have since been fixed by hand,
but the gate that would have caught them still does not exist. The fix is
`mypy --strict src/learning_os tests`.

**`mypy>=1.11` has no upper bound** in `pyproject.toml`. A mypy release can
break the gate with no code change, which turns a green CI into a time bomb
dependent on when it next runs. Pin an upper bound, or accept that "clean" means
"clean against whatever version resolved today".

---

## 8. Building it

Not V1. Doc 07 lists what V1 contains, and this is not on it.

Two things V1 must do so this is buildable later, both cheap now and expensive
to retrofit:

1. **Log completely.** `DecisionEvent` already carries everything; the
   requirement is that the runtime actually writes one per intervention. A
   benchmark can only be built from trajectories that were recorded.
2. **Version the policy.** `PolicyUpdate.policy_version` is required. Without
   it, no outcome can be attributed to the policy that produced it, and the
   whole pipeline has nothing to evaluate.
