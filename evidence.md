# Evidence Report

**This file is generated. Do not edit it.** Every value below was measured when
`scripts/generate_evidence.py` last ran; an edit here is a value that no longer
corresponds to anything, which is the failure mode this file replaced.

To regenerate:

```
python3 scripts/generate_evidence.py
```

The prose sections are constants inside the generator, so changing what this
project claims requires a reviewed change to tracked source, not an edit to a
document nothing guards.

## Provenance

| Field | Value |
|---|---|
| Commit | `973446d26b3feeaec502ffeeb067485fbb1f8e0c` |
| Branch | `fix/full-verify-on-prs` |
| Working tree | dirty -- 2 path(s) differ from HEAD |
| Generated (UTC) | 2026-08-19T06:41:36+00:00 |
| Generator | `scripts/generate_evidence.py` |
| Python | 3.14.7 |
| Platform | macOS-26.4.1-arm64-arm-64bit-Mach-O |
| Machine | arm64 |

The working-tree check ignores the file being generated: its content is the
thing under construction, so counting it would make the answer depend on
whether this script had already run.

---

## Tool versions

What answered when asked, not what `requirements.txt` pins. A tool that is missing or fails to report is `unavailable`; a version is never inferred from a lockfile, an import, or a previous run.

| Tool | Version | Measured by |
|---|---|---|
| bandit | bandit 1.9.4 | `bandit --version` |
| pyright | pyright 1.1.411 | `pyright --version` |
| pytest | pytest 9.1.1 | `pytest --version` |
| hypothesis | hypothesis, version 6.165.10 | `hypothesis --version` |
| mutmut | unavailable | `mutmut --version` exited 1 |
| axle | axle 0.1.0 | `axle --version` |

---

## Mandatory gates

Every gate `ci/gates.toml` marks `mandatory = true`, in declaration order, with
its declared invocation and whatever `reports/<gate>.json` recorded.

**A missing report is `NOT_RUN`.** It is not `PASS`, and this document makes no
claim about what such a gate would have done. Reports present in this tree:
1 of 16 mandatory gates.

| Gate | Declared invocation | Status | Duration (ms) |
|---|---|---|---|
| `preflight` | `scripts/gate_integrity.py` | PASS | 20 |
| `axle-verify` | `scripts/axle_gate.py scripts/enforce_spec.py` | NOT_RUN | -- |
| `spec-strength` | `scripts/check_composition.py --min-strength 0.9` | NOT_RUN | -- |
| `spec-composition` | `scripts/check_composition.py --min-strength 0.9` | NOT_RUN | -- |
| `vacuity-check` | `scripts/check_vacuity.py` | NOT_RUN | -- |
| `counterexample-search` | `scripts/find_counterexample.py` | NOT_RUN | -- |
| `honest-report` | `scripts/honest_report.py --min-strength 0.9` | NOT_RUN | -- |
| `coverage` | `--cov-fail-under=95` | NOT_RUN | -- |
| `pyright` | `run_gate.py --name pyright -- pyright` | NOT_RUN | -- |
| `bandit` | `scripts/security_gate.py scripts/sarif_suppress.py shellcheck` | NOT_RUN | -- |
| `mutmut` | `scripts/mutation_gate.py --min-score 0.95` | NOT_RUN | -- |
| `correspondence` | `scripts/correspondence_gate.py pytest -m axle` | NOT_RUN | -- |
| `codeql-python` | `github/codeql-action/init@ff2f1c621b7f889edc0d3c761ac2e6a3f8cdb0dd github/codeql-action/analyze@ff2f1c621b7f889edc0d3c761ac2e6a3f8cdb0dd` | NOT_RUN | -- |
| `codeql-actions` | `github/codeql-action/init@ff2f1c621b7f889edc0d3c761ac2e6a3f8cdb0dd github/codeql-action/analyze@ff2f1c621b7f889edc0d3c761ac2e6a3f8cdb0dd` | NOT_RUN | -- |
| `CodeQL` | `github code scanning results check` | NOT_RUN | -- |
| `full` | `scripts/aggregate_gates.py download-artifact` | NOT_RUN | -- |

Reports are restated, not re-derived. Binding a report to a commit, a run and an
attempt is `scripts/aggregate_gates.py`'s job, and it only holds in CI.

---

## Corpus

| What | Count | How counted |
|---|---|---|
| source modules | 4 | `src/*.py`, excluding `_`-prefixed |
| source functions | 4 | top-level `def` in those modules, via `ast` |
| specs | 10 | `specs/*_spec.lean` |
| proofs | 10 | `proofs/*_proof.lean` |
| semantics pairs | 4 | names with BOTH a semantics spec and a semantics proof |
| tests collected | 385 | `pytest --collect-only` |

---

## Measured by hand

Two findings below came from running something and writing down the result.
Neither is recomputable by this generator, which is why they are the only
prose in this file. Everything else above and below was measured at run time.

### AXLE does not write its own proofs

The load-bearing claim of an "AI writes the Lean spec and proof" pipeline is
not satisfied here. Measured directly, on the easiest theorem in the corpus:

```
$ ollama run qwen2.5-coder:7b "prove: theorem py_add_comm (a b : Int) : a + b = b + a"
theorem py_add_comm (a b : Int) : a + b = b + a := by rw [add.comm]

$ axle verify-proof ...
okay: false -- Unknown identifier `add.comm`
```

The model hallucinated the lemma name; Mathlib's is `add_comm`. None of the
installed Ollama models are Lean-tuned, so an automatic translation step would
be a script that reliably emits proofs AXLE rejects. It was not shipped for
that reason, and `translate_to_lean.py`, `fix_python.py` and
`github_logs_analyzer.py` do not exist in this repository.

**Every spec and proof here was written by hand.** They verify under the AXLE
kernel. That is a true and much smaller claim than "you write Python and Lean
appears," and the smaller claim is the one this repository supports.

### The Python-to-Lean trust boundary

AXLE proves that `proofs/<n>_proof.lean` discharges `specs/<n>_spec.lean`. It
knows nothing about Python. No artifact in this repository formally proves that
a Lean `def` models the corresponding `src/<n>.py`.

That gap is bounded, not closed, and the bounds are empirical rather than
formal:

- `spec_source.py` requires every spec to name a real `src/*.py` subject, so a
  spec cannot float free of the code it claims to constrain.
- `find_counterexample.py` evaluates the spec's claim against the **real Python
  function** and fails on a counterexample.
- `mutation_gate.py` scores a spec by whether realistic mutations of the Python
  falsify it, excluding only mutants that showed no difference across ~481
  sampled points plus a hypothesis search — indistinguishable on that
  sample, which is not a proof of equivalence.
- `honest_report.py` reports contract sufficiency as `ESTABLISHED` /
  `NOT_ESTABLISHED` / `UNKNOWN` inside a declared search scope, and never as
  "fully specified".

So the formal claim is about the Lean model and the empirical claims are about
the Python. A green `axle-verify` does not mean the Python is proven correct.

### Credential exposure, unresolved

An earlier revision of `evidence.md` contained the first 25 characters of a
fine-grained GitHub personal access token, and that revision reached the
default branch of a public repository. The fragment is gone from the working
tree, and this generator now makes its reintroduction structurally impossible.
Neither fact removes it from git history.

A truncated token is not directly usable. A published credential prefix is
still a reason to rotate, and rotation -- not history rewriting -- is the fix.
Rewriting history does not un-publish what was already fetched. **Treat this as
open until the token is rotated.**

---

## LIMITATIONS

Every item here remains true when every gate above reports PASS. This section
is a constant in `scripts/generate_evidence.py`, not a summary of the run: it
cannot shrink because the results were good.

1. **No proof that the Lean models the Python.** The kernel checks a proof
   against a spec. Nothing checks the spec against `src/*.py` formally. The
   correspondence is argued empirically by counterexample search and mutation
   scoring, both of which are searches, and a search that finds nothing has not
   proven there is nothing.

2. **Mutation score is not correctness.** A 0.95 mutation score means 95% of
   the mutants the mutation operators produced were killed. It says nothing
   about bugs no operator generates -- wrong requirements, missing cases, or
   errors in the spec itself.

3. **Coverage is not verification.** `--cov-fail-under=95` measures lines and
   branches executed, not properties established. Fully covered code can be
   fully wrong.

4. **The root of trust is a diff.** Everything here bottoms out at
   `ci/gates.toml` and `scripts/gate.py` as committed. A single commit editing
   both the manifest and the checker that reads it defeats the integrity layer
   from the inside. Nothing in the repository can escape that; only review can,
   which is why `.github/CODEOWNERS` exists.

5. **CODEOWNERS is advisory until the ruleset requires it.** Code-owner review
   only blocks a merge when the branch ruleset sets `require_code_owner_review`
   to true. Until an owner sets it on the live ruleset, the ownership rules
   request reviewers and block nothing.

6. **A local run is not a CI run.** Reports generated on a workstation carry no
   run identity, so the aggregate cannot bind them to a commit, a workflow, or
   an attempt. Only evidence produced inside one CI run is admissible for a
   merge decision.

7. **Absent evidence is reported, not interpreted.** A gate with no report is
   `NOT_RUN`. This document does not claim such a gate would have passed, and
   no consumer of it should.

8. **The scanners are outside this file.** CodeQL results live in GitHub's
   code-scanning database, not in `reports/`, so their verdicts can never
   appear in the gate table above. Their `NOT_RUN` there means "no local
   report", not "no analysis".

9. **This generator trusts the reports it reads.** It restates the `status` and
   `duration_ms` a gate wrote. It does not re-run the gate, re-derive the
   verdict, or verify that the report belongs to this commit --
   `scripts/aggregate_gates.py` is what does that, in CI, with run identity.

10. **Tool versions are what answered, not what is pinned.** The table records
    what each binary reported when asked. It does not prove that binary is the
    one CI uses, nor that it matches `requirements.txt`.
