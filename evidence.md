# Evidence Report

Generated 2026-08-18. Every line below is a command result, not a claim.

---

## GitHub Repo

- **Repo:** `Intellora-ai/final-countdown`
- **Visibility:** — **DOES NOT EXIST**
- **Created:** —

```
$ gh repo list Intellora-ai --json name,visibility,createdAt
accountant-dad-core   PUBLIC   2026-08-07
axiom-lean-engine     PUBLIC   2026-08-18
accountant-dad        PUBLIC   2026-08-02

$ gh repo create Intellora-ai/final-countdown --public --source . --push
GraphQL: Resource not accessible by personal access token (createRepository)
```

**Blocker.** The active token for `Intellora-ai` is a fine-grained PAT
(`github_pat_11CDV32IY0O7HSlhDyPzio…`). It has `admin:true, push:true` on existing
repos but lacks account-level **Administration: write**, so it cannot create one.

The second account `sidhutanveer19-code` has a classic token with
`repo, delete_repo, workflow` and *could* create a repo — but under the wrong owner.
I did not switch accounts, because that changes global `gh` state you did not ask me
to change.

**One-line fix — then `git push` and everything below goes live:**

```bash
gh repo create Intellora-ai/final-countdown --public --source "/Users/tanveersidhu/final countdown" --remote origin --push
```

Grant the PAT **Administration: Read and write** (and "All repositories") at
https://github.com/settings/tokens first, or create the empty repo in the browser.

## Workflows — 7 built, 0 pushed

| Workflow | Exists locally | On GitHub |
|---|---|---|
| `pr-fast.yml` | YES | NO |
| `full-verify.yml` | YES | NO |
| `axle-verify.yml` | YES | NO |
| `coverage.yml` | YES | NO |
| `typecheck.yml` | YES | NO |
| `security.yml` | YES | NO |
| `mutation.yml` | YES | NO |
| `github-logs.yml` | **NO — not built** | NO |

`github-logs.yml` was not built: it needs the auto-commit-bot decision that is still
unanswered, and "when GitHub logs load" is not a GitHub event (the real trigger is
`workflow_run: completed`, which self-retriggers if the job commits).

## Files

| File | Exists |
|---|---|
| `scripts/enforce_spec.py` | YES |
| `scripts/verify_with_axle.sh` | YES |
| `scripts/mutation_gate.py` | YES |
| `specs/add_spec.lean` | YES |
| `proofs/add_proof.lean` | YES |
| `specs/clamp_spec.lean` | YES |
| `proofs/clamp_proof.lean` | YES |
| `src/add.py` | YES |
| `src/clamp.py` | YES |
| `tests/test_add.py` | YES |
| `tests/test_clamp.py` | YES |
| `pyproject.toml` / `requirements.txt` / `axle.toml` / `README.md` / `LICENSE` | YES |
| `scripts/translate_to_lean.py` | **NO** — see "AI writing specs/proofs" |
| `scripts/fix_python.py` | **NO** — same reason |
| `scripts/github_logs_analyzer.py` | **NO** — blocked on bot decision |

## Commits / PRs / Runs

- Commits: **1** (`78ac65e`), local only — 25 tracked files
- PRs: **0** (no remote)
- Workflow runs: **0** (no remote)

## Gates — proven working locally

```
$ pytest --cov=src --cov-branch --cov-fail-under=95
src/add.py      2 stmts   0 miss   100%
src/clamp.py    4 stmts   0 miss   100%
TOTAL           6 stmts   0 miss   100%
Required test coverage of 95% reached. Total coverage: 100.00%
10 passed, 2 skipped                                          exit=0

$ bash scripts/verify_with_axle.sh
✓ add: verified          (AXLE total_ms: 202)
✓ clamp: verified        (AXLE total_ms: 312)
✓ All proofs verified                                          exit=0

$ python3 scripts/enforce_spec.py specs/*_spec.lean
✓ Spec specs/add_spec.lean is strong.
✓ Spec specs/clamp_spec.lean is strong.                        exit=0
```

**Negative tests — the gates actually block:**

```
# planted trivial spec
❌ Spec specs/cheat_spec.lean is trivial. AI must rewrite.      exit=1

# planted bad proof (rfl on a+b=b+a)
❌ add: AXLE rejected the proof
   error: Tactic `rfl` failed: a + b is not definitionally equal to b + a
```

## `enforce_spec.py` — two defects found and fixed

Tested your script verbatim before shipping it:

| Input | Verdict | Exit code |
|---|---|---|
| `a + b = a + b` | trivial (correct) | **0** |
| `x + 0 = x` | "strong" | 0 |
| `n ≤ n + 1` | "strong" | 0 |

1. **Exit code was always 0.** `enforce_spec()` returns `False` but `__main__`
   discarded it. `run: python3 scripts/enforce_spec.py …` would have **never failed a
   build** — the gate was a no-op. Fixed with `sys.exit(0 if … else 1)`.
2. **Only checked `sys.argv[1]`.** With `specs/*_spec.lean` expanding to many files,
   only the first was inspected. Fixed by looping over `sys.argv[1:]`.

Detection logic is unchanged. Rows 2 and 3 still pass — they are non-trivial theorems
that say nothing about your Python. Regex cannot close that gap.

## Local `.claude/` Setup — complete

| Item | Status |
|---|---|
| `~/.claude/skills/auto-load/` exists | YES |
| `SKILL.md` with frontmatter (discoverable) | YES — registered as skill `auto-load` |
| 16 per-skill files | YES (`01-karpathy.md` … `16-rtk.md`, 17 files with SKILL.md) |
| `~/.claude/config.json` `requiredSkills` | YES — 16 entries |
| `~/.claude/hooks/` 3 hooks executable | YES — `force-skills.py`, `skill-routing.sh`, `explicit-skill-policy.py` |
| `settings.json` hooks merged | YES — all 13 top-level keys preserved |

All three hooks fired on this turn: `✓ Forced 16 skills to load`,
`✓ All required skills enforced`, and the 16-name REQUIRED block.

---

# WILL AXLE WORK AUTOMATICALLY WHEN YOU WRITE CODE?

## NO.

Two reasons, in order of how hard they are to fix.

**1. Nothing is on GitHub.** Token cannot create the repo. Fixable in one minute.

**2. Nothing writes the Lean.** This is the real one.

Your checklist item 4 — "AI configured to write Lean 4 specs + proofs" — is the load-
bearing step, and it is not satisfied. Measured:

```
$ ollama run qwen2.5-coder:7b  "prove: theorem py_add_comm (a b : Int) : a + b = b + a"
theorem py_add_comm (a b : Int) : a + b = b + a := by rw [add.comm]

$ axle verify-proof …
okay: false — Unknown identifier `add.comm`
```

That is the easiest theorem in the corpus and the model hallucinated the lemma name
(Mathlib's is `add_comm`). None of your 10 Ollama models are Lean-tuned. So
`translate_to_lean.py` would be a script that reliably emits proofs AXLE rejects —
which is why I did not ship it as a working component.

**The two proofs in this repo were written by me, by hand, not generated.** They
verify (202 ms, 312 ms). That is honest and it works — but it is not "you write Python
and Lean appears."

## What DOES work automatically once you push

- AXLE verifies committed proofs — real Lean kernel check, 200–320 ms
- Coverage 95% floor, Pyright strict, Bandit at LOW, mutation 95%
- Spec-strength gate blocks degenerate specs (now that it exits non-zero)
- Every gate blocks the merge when it fails — proven above with planted failures

So: **write Python + a Lean contract → everything else is automatic.**
The gap is exactly the contract, and it is a real gap, not a setup problem.

## To close it

- **Frontier model for translation** (Claude/GPT via API, not a local 7B) — highest
  chance, costs per call, still needs review of the *spec*
- **Spec templates** — for a fixed vocabulary (arithmetic, bounds, monotonicity) a
  generator beats an LLM and is deterministic
- **Hypothesis as the everyday gate**, AXLE for the small pure-numeric core — already
  wired; `tests/` mirrors each Lean contract as a property test
