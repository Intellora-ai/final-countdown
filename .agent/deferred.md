
## Hand-written engine companion does not meet the teaching arc

`frontend/src/canvas/lessons/handwritten/contract-honoured-by-hand.json` fails
`checkTeaching` at `arc: true` after Batch 4 raised the engine's output contract.

Measured, not guessed:

| Rule | Detail |
|---|---|
| `definition-too-long` | its definition block is 54 words; the cap is 30 |
| `definition-split-up` | that definition runs across two sentences |
| `no-summary` / `nothing-is-shown` | it has neither a summary nor a shown block |
| `nothing-marked` | no block marks a term |

Not fixed here because fixing it is AUTHORING -- rewriting a human's prose --
not a change to `learning_os/api/emit.py`, which is what Batch 4 is about. The
two engine-GENERATED lessons now pass the same gate, which is the claim Batch 4
makes. See `frontend/src/canvas/lessons/engineTeaches.test.ts`.

---

## Two required contexts cannot report on a non-frontend diff (2026-08-30)

**Symptom.** A pull request that changes no file under `frontend/` can never
merge. PR #162 changed one line group in `.github/workflows/integration.yml`,
went green on 27 of 29 checks, and stayed `BLOCKED` with:

    2 of 21 required status checks are expected.

**Mechanism.** `frontend` and `frontend-verdict` are required contexts in live
ruleset 20990225. They are produced by `learning-canvas-frontend.yml`, whose
`on.pull_request` carries `paths: [frontend/**, <its own file>]`. GitHub leaves
a required context whose workflow never started in `Expected` indefinitely --
a job skipped by a job-level `if:` reports success, but a workflow skipped by a
path filter reports nothing at all. So the block is permanent, not a wait, and
nothing turns red to explain it.

`--admin` does not help: ruleset 20990225 has `bypass_actors: []`, so no actor
can override it. The merge call fails while still exiting 0.

**Scope.** Exactly one workflow has this shape. Every other workflow owning a
required context (`verify.yml`, `gate.yml`, `e2e.yml`, `codeql.yml`) has no
path filter. Surveyed by parsing all of `.github/workflows/*.yml` against the
21 required contexts.

**Why it was not fixed here.** The obvious repair -- move the filter from
`on.paths` down to a job-level `if:` so the jobs skip and the contexts report
-- was implemented and REFUSED by this repository's own gates, twice, for
reasons that are written down and are not accidents:

1. `gate_integrity.py` requires a manifest gate to carry exactly the condition
   `ci/gates.toml` declares for it. `[gates.frontend]` declares none, and the
   manifest calls `full`'s `always()` "the ONLY job-level condition allowed
   anywhere". The fix needs a second one.
2. `[gates.frontend-verdict]` states that a skipped required check is "the
   'absence looks like health' failure this whole workflow was built to
   avoid", and `frontend-verdict`'s aggregate step refuses a skipped
   dependency on purpose. Making `frontend` skip is that exact failure.

The attempted patch is not lost; it is 216 lines and was reverted after
`gate_integrity` refused it. Rebuilding it is not the hard part -- deciding
whether this repository WANTS a required check that can skip is.

**The contradiction worth resolving first.** `ci/gates.toml` declares both
contexts in `[advisory]`:

    "learning-canvas-frontend.yml::frontend"         = "DEBT ... blocks nothing."
    "learning-canvas-frontend.yml::frontend-verdict" = "DEBT ... the context that
                                                       would be required once the
                                                       ruleset is updated."

The ruleset HAS since been updated and does require them, so those two lines
are stale and the registry now contradicts the ruleset it is supposed to
mirror. `check_ruleset.py` does not catch it, because it compares only
`required_checks` to the live ruleset and never asks whether the same context
is also declared advisory. That missing cross-check is its own gap.

**Options, for a human.**

1. Un-require both contexts in ruleset 20990225 and delete them from
   `required_checks`. Matches what `[advisory]` already claims, and matches
   GitHub's own guidance ("avoid requiring workflows that can be skipped").
   Owner-only: the ruleset is not editable from here.
2. Drop `on.pull_request.paths` and let the full canvas lane run on every pull
   request. Honest and needs no policy change; costs the mutation shards and
   ~290 browser tests on every unrelated PR.
3. Allow a second declared `job_if` and accept a skipping required check,
   reversing the two written positions above.

A guard belongs on whichever is chosen: nothing currently fails when a
required context is declared behind a path filter, which is why this reached
`main`.
