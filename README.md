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

`scripts/axle_gate.py` first proves the sets match — every spec has a proof,
every proof has a spec, and there is at least one of each — because verifying
every member of a set says nothing about it being the right set. Only then does
it pair each `specs/<name>_spec.lean` with `proofs/<name>_proof.lean` and call:

```bash
axle verify-proof --environment lean-4.33.0 specs/add_spec.lean proofs/add_proof.lean
```

AXLE is a client for a hosted Lean 4.33.0 + Mathlib service, so **no local Lean
install is required**. Two numbers describe how long verification of the bundled
examples takes, and they measure different things:

| number | measured | what it is |
|---|---|---|
| **77–111 ms** (median 84 ms) | server-side | `info.total_request_time_ms` in the AXLE response: queue time plus Lean execution. This is the proof check itself. |
| **1.03–1.20 s** (median 1.10 s) | wall clock | one `axle verify-proof` invocation, start to exit. This is what you wait for. |

Measured over the 10 bundled spec/proof pairs, one invocation each, plus N=10
repeats of `specs/add_spec.lean`. The ~1.0 s difference is connection setup, not
proof checking: `axle --help` returns in 144 ms, and a TLS handshake to
`axle.axiommath.ai` completes at 570–720 ms (`curl -w %{time_appconnect}`). The
CLI opens a fresh connection per invocation, so every pair pays that once.

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
python3 scripts/axle_gate.py                        # AXLE proof check
pyright                                             # strict types
bandit -r src scripts --severity-level low --confidence-level low
```

### Browser smoke test

There is no web frontend here, so Playwright opens the one artifact this
project renders: the coverage report, regenerated from `.coverage` and served
on `127.0.0.1:4173`. A placeholder page would prove only that a browser can
load a file this repository does not ship.

```bash
npm ci                      # install exactly what package-lock.json pins
npx playwright install chromium
npm run test:e2e            # both viewports, headless
npm run test:e2e:headed     # watch it run
npm run test:e2e:debug      # step through with the inspector
npm run test:e2e:report     # open the HTML report from the last run
```

The suite is two runs of one spec — desktop and a phone viewport. On failure
Playwright keeps a trace, a screenshot and the HTML report; CI uploads them as
the `playwright-report` artifact and keeps them for seven days.

## Gates

All of them are jobs in one workflow, `verify.yml`, and that is not tidiness.
Separate workflows are separate runs with separate filesystems, so a finalizer
in one cannot see evidence produced in another — an aggregate spread across
workflows can only ever summarise its own duplicate execution of the gates.
One workflow gives the finalizer `needs:` and `download-artifact` over the same
run, which is the only arrangement where the aggregate is real.

```
preflight ─┐
gate  ×10 ─┴─→ full   (needs: all, if: always())
```

| Job | Gate | Threshold |
|---|---|---|
| `preflight` | `scripts/gate_integrity.py` — the verification system still matches `ci/gates.toml` | no drift |
| `axle-verify` | spec set completeness, then AXLE proofs | `SPEC_SET == PROOF_SET`, non-empty, all verified |
| `spec-strength` | joint spec strength over the whole set | **0.90** |
| `spec-composition` | joint strength per function | **0.90** |
| `vacuity-check` | precondition reachability | not vacuous |
| `counterexample-search` | spec claim against the real Python | no counterexample |
| `honest-report` | ten dimensions, reported separately | blocks on FAIL only |
| `coverage` | pytest branch coverage | **95%** |
| `pyright` | strict types | 0 errors |
| `bandit` | LOW severity and above, `src` and `scripts` | verified safe patterns only |
| `mutmut` | spec vs AST mutants; mutants indistinguishable at ~481 sampled points excluded, never called equivalent | **95%** |
| `full` | finalizer: evidence set == declared set | no missing, unexpected, duplicate or foreign evidence |

`pr-fast.yml` is supplementary and blocks nothing — a strict subset of
`axle-verify`, `spec-strength` and `coverage`, kept for latency feedback on a
PR. `ci/gates.toml` records that decision rather than leaving it implicit.

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

## External dependency: the AXLE service

Every proof gate calls `https://axle.axiommath.ai`. Lean never runs on your
machine or on the GitHub runner — AXLE is a client, and the kernel check happens
server-side.

**If that host is unreachable, `axle-verify`, `pr-fast` and `full-verify` all
fail, and nothing merges.**

That is deliberate, not a gap. The alternative — skipping the proof check when
the server is down — would mean unverified code merges during exactly the window
when verification is impossible. A blocked merge is recoverable; a merge that
silently skipped its proof is not.

Three options were considered:

| Option | Verdict |
|---|---|
| Self-host AXLE | Strongest, but real infrastructure to run and keep current with Mathlib |
| **Accept the risk** | **Chosen.** An outage blocks merges; it never weakens a gate |
| Skip when unreachable | Rejected — turns an outage into silently unverified merges |

### Telling an outage apart from a bad proof

`scripts/axle_health.py` runs before the proof steps and reports the service
separately, so the CI log distinguishes the two cases:

```bash
python3 scripts/axle_health.py
# REACHABLE: https://axle.axiommath.ai  1261ms  13 Lean environments
```

It exits non-zero when unreachable, so the gate still blocks — it just says why.

### External monitoring

Not configured. A hosted monitor (UptimeRobot, Better Stack, Pingdom) needs an
account this repository cannot create. To add one, point an HTTPS monitor at
`https://axle.axiommath.ai` and alert on non-200 or >5s latency. Until then, the
preflight above is in-CI only: it tells you about an outage when a build runs,
not before.

Override the endpoint with `AXLE_API_URL`, and authenticate with `AXLE_API_KEY`
if the server starts requiring it.

## License

MIT
