# final-countdown

Learning OS with 100% verified Python code via AXLE + Lean 4.

You write Python. Every function carries a Lean 4 specification and a machine-checked
proof. AXLE runs the Lean kernel over each proof and CI blocks the merge if anything
fails.

## How verification works

```
src/<name>.py          you write this
specs/<name>_spec.lean the contract, as a sorried Lean theorem
proofs/<name>_proof.lean the proof AXLE checks against the spec
tests/test_<name>.py   Hypothesis properties mirroring the same contract
```

`scripts/verify_with_axle.sh` pairs each `specs/<name>_spec.lean` with
`proofs/<name>_proof.lean` and calls:

```bash
axle verify-proof --environment lean-4.33.0 specs/add_spec.lean proofs/add_proof.lean
```

AXLE is a client for a hosted Lean 4.33.0 + Mathlib service, so **no local Lean
install is required**. Verification of the bundled examples takes 200–320 ms.

## Install

```bash
pip install -r requirements.txt
axle environments          # confirm the AXLE service is reachable
```

Set `AXLE_API_URL` to point at a different server, and `AXLE_API_KEY` if it requires
authentication.

## Use

```bash
pytest --cov=src --cov-branch --cov-fail-under=95   # tests + coverage
python3 scripts/enforce_spec.py specs/*_spec.lean   # spec strength
bash scripts/verify_with_axle.sh                    # AXLE proof check
pyright                                             # strict types
bandit -r src scripts --severity-level low --confidence-level low
```

## Gates

| Workflow | Gate | Threshold |
|---|---|---|
| `pr-fast.yml` | spec strength + AXLE + tests | all must pass |
| `axle-verify.yml` | spec strength + AXLE proofs | all proofs verified |
| `coverage.yml` | pytest branch coverage | **95%** |
| `typecheck.yml` | Pyright | strict mode |
| `security.yml` | Bandit | LOW severity and above blocks |
| `mutation.yml` | mutmut via `scripts/mutation_gate.py` | **95%** |
| `full-verify.yml` | everything, on push to main | all must pass |

## What the proof does and does not tell you

AXLE checks one thing precisely: **does the proof in `proofs/` prove the theorem in
`specs/`.** That check is real — a wrong proof is rejected by the Lean kernel.

AXLE does not read Python. Nothing mechanically checks that the Lean spec describes
the Python function beside it. `scripts/enforce_spec.py` rejects the obvious
degenerate forms (`a = a`, `a + b = a + b`), but a spec can still be true, non-trivial,
and unrelated to the code.

So the specs in this repo are written and reviewed by a human, deliberately. The proof
is the part that is automated. Treat "verified" as "this contract holds", not "this
function is correct for every purpose".

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `invalid choice: 'verify'` | the subcommand is `verify-proof` | use `axle verify-proof SPEC PROOF` |
| `No such file or directory: 'theorem ...'` | AXLE takes file paths, not strings | pass `specs/x_spec.lean`, not the text |
| `Unknown identifier 'add.comm'` | Mathlib lemma is `add_comm` | underscore, not dot |
| spec exists but proof missing | naming mismatch | `<name>_spec.lean` pairs with `<name>_proof.lean` |
| AXLE requests hang in CI | service unreachable | check `axle environments`, set `AXLE_API_URL` |

## License

MIT
