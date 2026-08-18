# Evidence Report

Every line below is a command result, not a claim.

This file used to restate what the gates measure. That is why it went stale:
it was a hand-written copy of facts the system already emits, and nothing kept
the copy true. Anything mechanical now lives in `reports/gate-manifest.json`,
which is generated per run and bound to that run's commit. What stays here is
the part a machine cannot emit — what was measured by hand, and what is still
not true.

`scripts/gate_integrity.py` now fails the build if this file or `README.md`
tells anyone to run a verifier that does not exist. That check is narrow on
purpose: it does not make prose true, it only blocks the claim that breaks
first when a gate is renamed.

---

## Repository

| | |
|---|---|
| Repo | `Intellora-ai/final-countdown`, PUBLIC, created 2026-08-18 |
| Default branch | `main` |
| Commits | 15 |
| Open PR | #1 — full-verify on PRs, one security source of truth, AXLE health preflight |
| Workflows | 13 |
| Ruleset | "final countdown protection" (id 20990225), 10 required checks pinned to GitHub Actions |

The earlier blocker in this file — "repo DOES NOT EXIST, token cannot create
it" — is resolved. The repo exists and direct pushes to `main` are rejected by
the ruleset (tested).

## Corpus

| | count |
|---|---|
| `src/*.py` | 4 (`add`, `clamp`, `multiply`, `subtract`) |
| `specs/*_spec.lean` | 10 |
| `proofs/*_proof.lean` | 10 |
| tests | 67 passed, 2 skipped |
| of those, adversarial CI tests | 44 |

Ten specs against four functions: a function's contract is a *set* of theorems,
and `check_composition.py` scores the set, because individually weak specs can
be jointly strong.

## Gates — measured, all ten on one filesystem

```
axle-verify            PASS   11759 ms
spec-strength          PASS    3244 ms
spec-composition       PASS    3538 ms
vacuity-check          PASS     175 ms
counterexample-search  PASS     390 ms
honest-report          PASS   26064 ms
coverage               PASS    2399 ms
pyright                PASS    1214 ms
bandit                 PASS     273 ms
mutmut                 PASS    3437 ms
                       ────────────────
                       total  ~52 s   (job timeout 600 s)
```

Authoritative copy: `reports/gate-manifest.json`, which also records the run
identity every report had to match.

## What the gates block — proven by attack, not by assertion

Each row is a real sabotage run against a throwaway copy, with a test that
fails if the defence is removed. Full list in `tests/test_ci_integrity.py`.

| Attack | Result |
|---|---|
| Delete a gate step, leave the job green | caught by `gate_integrity.py` |
| Delete a workflow / rename a job / delete a script | caught |
| `continue-on-error`, `\|\| true` on a gate | caught |
| Empty `specs/` | `axle_gate.py` FAILs — previously exited 0 |
| Proof whose spec was deleted | FAILs — previously invisible |
| Spec with no proof | FAILs |
| AXLE binary absent | `INFRASTRUCTURE_FAILURE`, not `FAIL` |
| Report missing / corrupt / from another run / another commit / another attempt | aggregate blocks |
| Report omitting its identity fields | blocked (absence must not be a bypass) |
| One gate's report renamed to cover another | blocked |
| `reports/` unwritable | `INFRASTRUCTURE_FAILURE`, exit 1 |
| Per-function loop with zero functions | FAILs |
| Gate prints "PASS" but exits 7 | recorded `FAIL` |
| Gate killed with SIGKILL | not PASS |

## `enforce_spec.py` — two defects found and fixed

Tested verbatim before shipping:

| Input | Verdict | Exit code |
|---|---|---|
| `a + b = a + b` | trivial (correct) | **0** |
| `x + 0 = x` | "strong" | 0 |
| `n ≤ n + 1` | "strong" | 0 |

1. **Exit code was always 0.** `enforce_spec()` returned `False` but `__main__`
   discarded it, so the gate was a no-op. Fixed with `sys.exit(0 if … else 1)`.
2. **Only checked `sys.argv[1]`.** With `specs/*_spec.lean` expanding to many
   files, only the first was inspected. Fixed by looping over `sys.argv[1:]`.

Rows 2 and 3 still pass. They are non-trivial theorems that say nothing about
the Python. A regex cannot close that gap, which is why the mutation gate
exists: a spec is scored by whether a realistic bug makes it false.

---

# What is still NOT true

## AXLE does not write itself

The load-bearing step — "AI writes the Lean spec and proof" — is not satisfied.
Measured:

```
$ ollama run qwen2.5-coder:7b "prove: theorem py_add_comm (a b : Int) : a + b = b + a"
theorem py_add_comm (a b : Int) : a + b = b + a := by rw [add.comm]

$ axle verify-proof …
okay: false — Unknown identifier `add.comm`
```

The easiest theorem in the corpus, and the model hallucinated the lemma name
(Mathlib's is `add_comm`). None of the installed Ollama models are Lean-tuned,
so `scripts/translate_to_lean.py` would be a script that reliably emits proofs
AXLE rejects. It was not shipped for that reason. `scripts/fix_python.py` and
`scripts/github_logs_analyzer.py` are also not built — the second is blocked on
an auto-commit-bot decision that was never made, and "when GitHub logs load" is
not a GitHub event.

**Every spec and proof in this repo was written by hand.** They verify. That is
honest, and it is not "you write Python and Lean appears."

## The Python ↔ Lean boundary

AXLE proves that `proofs/<n>_proof.lean` discharges `specs/<n>_spec.lean`. It
knows nothing about Python. Nothing in this repo formally proves that the Lean
`def` models `src/<n>.py`.

That gap is bounded, not closed:

- `spec_source.py` requires each spec to name a real `src/*.py` subject.
- `find_counterexample.py` runs the spec's claim against the **real Python
  function** and fails on a counterexample.
- `mutation_gate.py` scores the spec by whether realistic mutations of the
  Python make it false, excluding equivalent mutants.
- `honest_report.py` reports contract sufficiency as `ESTABLISHED` /
  `NOT_ESTABLISHED` / `UNKNOWN` within a declared search scope, and never as
  "fully specified".

So the formal claim is about the Lean model; the empirical claims are about the
Python. Do not read a green `axle-verify` as "the Python is proven correct".

## Root of trust

Everything above bottoms out at `ci/gates.toml` and `scripts/gate.py` **as
committed**. One commit that edits both the manifest and the checker together
defeats the integrity layer. Nothing inside the repo can escape that; only the
diff and PR review can. Recursive self-verification has an end, and this is it.

`ci/gates.toml`'s `[ruleset]` block is a copy of the live GitHub ruleset that
nothing compares against GitHub. They match today; nothing keeps them matching.

## Security note

An earlier revision of this file contained the first 25 characters of a
fine-grained GitHub PAT, and that revision is on `origin/main` in a **public**
repository. The fragment is removed here, but it remains in git history.
A truncated token is not directly usable; a published credential prefix is
still a reason to rotate. Rotating the token is the fix — removing it from
history alone does not un-publish it.
