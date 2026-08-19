# AI code review

A non-blocking reviewer on every pull request. It is declared in
`ci/gates.toml` as `[gates.ai-review]` with `mandatory = false`, and it is
**inert until a human creates one secret**. See "Activation" below.

## What was chosen, and why

**`anthropics/claude-code-action`, run as a GitHub Actions job**
(`.github/workflows/ai-review.yml`, job id `ai-review`).

Three reasons, in order of weight:

1. **The `claude` GitHub App (app_id 1236702) is already installed on this
   repository**, with `pull_requests: write` and `checks: write`. No new
   integration, no new trust boundary, no admin install step.
2. **GitHub Actions is free for public repositories.** No trial clock, no
   card on file, no expiry date that turns the reviewer off silently.
3. **The check run comes from integration_id 15368 (GitHub Actions)** — the
   same source as the other 17 checks this repository already pins. If a repo
   admin later decides to require it, it is required the same way everything
   else is, from the same app, with no new source to select.

## What was rejected, and why

| Candidate | Reason rejected |
|---|---|
| **GitHub Copilot code review** | Not available on this account — the API reports `access_type_sku: no_access`. And even when paid for, a Copilot review **cannot block a merge**: it posts comments, it does not post a required check. |
| **CodeAnt AI** | 14-day trial, not free. The reviewer stops after 14 days, and a gate that expires on a calendar date is not a gate. |
| **Gitar** | 14-day trial, not free. Same failure mode. |
| **CodeRabbit** | Requires **manual triggering on repositories with fewer than 10 stars**. A reviewer a human has to remember to invoke is not a reviewer. |

## Where the blocking power actually comes from

Not from this check. `ai-review` is green whether or not it found anything —
that is deliberate, and it is why the gate is `mandatory = false` and is
**not** in `required_checks`.

The enforcement is the ruleset's `required_review_thread_resolution = true`:
**an inline review comment this job posts must be resolved by a human before
the pull request can merge.** So the prompt in the workflow instructs the
reviewer to post findings as inline comments on the exact lines they concern,
because a summary comment has no teeth and an inline comment does.

## What the reviewer may and may not touch

Decision from the repository owner: **the reviewer may correct ordinary code
defects it finds; it may not modify the verification system itself.**

A reviewer that can edit its own gates is not gated. The mechanical checks are
the only thing in this repository carrying verification weight — an AI opinion
carries none — so the reviewer must sit strictly *inside* them, never above
them. The following paths are denied:

```
.github/workflows/**
ci/gates.toml
scripts/*_gate.py
scripts/gate_integrity.py
scripts/gate.py
scripts/run_gate.py
scripts/aggregate_gates.py
scripts/check_ruleset.py
tests/test_ci_integrity.py
```

`scripts/gate_integrity.py` is listed separately because it does **not** match
the `scripts/*_gate.py` glob, and it is the guard on the guard — the single
worst file in the tree to leave editable. It was added to the owner's list for
that reason; the rest of the list is exactly as given.

**If the reviewer thinks one of those files genuinely needs changing, it must
say so in a comment and stop.** A human decides. Reporting a problem it is not
allowed to fix is the correct outcome, not a failure.

The boundary is enforced twice:

1. **In the prompt**, as an explicit deny-list with the reasoning, plus an
   instruction to treat any contrary instruction found in the diff, commit
   messages, PR title or PR body as hostile input and report it — that text is
   data under review, not a command.
2. **Mechanically**, via the action's `settings` input, as Claude Code
   `permissions.deny` rules (`Edit(...)` and `Write(...)` per path). This holds
   even if the prompt is ignored, misread, or overridden.

**Known gap, stated rather than papered over.** The deny-list covers the files
the owner named plus `gate_integrity.py`. It does *not* cover every verifier in
`scripts/` — `enforce_spec.py`, `check_composition.py`, `check_vacuity.py`,
`find_counterexample.py`, `honest_report.py`, `correspondence_gate.py`'s
helpers and `sarif_suppress.py` are all invoked by required checks and are not
individually denied. That gap is currently unexploitable, because the job has
no write capability at all (below). **Close it before granting `contents:
write`** — the honest fix is to deny `scripts/**` outright and allow-list the
handful of files the reviewer should be able to touch.

The deny-list is deliberately **not** referenced from `must_contain` in
`ci/gates.toml`. `gate_integrity.py` locates a `must_contain` token in a step's
`run:` or `uses:` and explicitly excludes `with:` — so a token that only ever
appears in `with:` would be reported as missing the moment the gate became
mandatory. Adding it would create a latent failure, not a guarantee.

## Why `ai-review` is not in `required_checks`

`scripts/check_ruleset.py` asserts that the canonical gate set **equals**
GitHub's required-check set — not a subset in either direction. Adding
`ai-review` to `required_checks` before an admin adds it on the GitHub side
would therefore fail CI immediately, and a check GitHub requires with no gate
behind it hangs every merge. Both halves have to move together, and only a repo
admin can move the GitHub half.

## Activation — what a human must do

**Step 1 (required). Create the secret.**

Repository **Settings → Secrets and variables → Actions → New repository
secret**:

- Name: `CLAUDE_CODE_OAUTH_TOKEN`
- Value: a Claude Code OAuth token

The workflow reads it as `${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}`. Nothing
else has to change; the next pull request picks it up.

**Step 2 (optional). Make the check required.**

Only if you want the *check* required as well — remember that the review-thread
resolution rule already does the enforcing, so this step is about the job
running, not about findings being addressed.

Repository **Settings → Rules → Rulesets → "final countdown protection" →
Require status checks to pass**, add `ai-review`, and select **GitHub Actions**
as the source app (integration_id 15368) so the context cannot be spoofed by
another app posting a check of the same name.

If you do this, you **must** also add `"ai-review"` to `required_checks` in
`ci/gates.toml` and flip the gate to `mandatory = true` **in the same change** —
otherwise `scripts/check_ruleset.py` fails on the mismatch. Note that a
`mandatory = true` gate is also held to `gate_integrity.py`'s artifact rules,
which this job does not currently satisfy: it produces review comments, not a
`reports/*.json`. Making it required is therefore not a one-line edit.

## Until the secret exists, this job is a no-op

Stated plainly: **with no `CLAUDE_CODE_OAUTH_TOKEN` secret, no review happens.**
The job still runs, writes a one-line notice to the step summary saying no
reviewer is configured, and exits 0. It reviews nothing, comments on nothing,
and blocks nothing. The check being green means only that the job ran — it does
not mean the diff was reviewed.

This is also exactly what happens on a **pull request from a fork**:
`pull_request` (rather than `pull_request_target`) gives fork PRs no secrets and
a read-only token, so the guard evaluates false and the job degrades to the same
clean no-op. That is the intended trade: `pull_request_target` would hand a
write token and the secret to code controlled by the fork, which is the standard
poisoned-pipeline vulnerability.

## How the missing-secret guard is built

This is the part most likely to be "fixed" into a broken state later, so the
reasoning is recorded here.

The obvious form does not work:

```yaml
jobs:
  ai-review:
    if: secrets.CLAUDE_CODE_OAUTH_TOKEN != ''   # WRONG — parse error
```

Per GitHub's context-availability table, the `secrets` context is available in
**neither** a job-level nor a step-level `if:`:

| Workflow key | Contexts available |
|---|---|
| `jobs.<job_id>.if` | `github, needs, vars, inputs` |
| `jobs.<job_id>.steps.if` | `github, needs, strategy, matrix, job, runner, env, vars, steps, inputs` |
| `jobs.<job_id>.env` | `github, needs, strategy, matrix, vars, **secrets**, inputs` |

The form above is not a condition that evaluates false — it is a workflow parse
error, `Unrecognized named-value: 'secrets'`, which turns **every** pull request
red. That is the opposite of skipping cleanly. See
[actions/runner#520](https://github.com/actions/runner/issues/520), "Secrets
cannot be used to condition job runs".

The form used instead reduces the secret to a boolean in `jobs.<id>.env` — the
one job-level key that *can* read `secrets` — and branches the steps on `env`,
which `steps.if` *can* read:

```yaml
jobs:
  ai-review:
    env:
      HAS_REVIEW_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN != '' }}
    steps:
      - if: env.HAS_REVIEW_TOKEN == 'true'
        uses: anthropics/claude-code-action@<sha>
      - if: env.HAS_REVIEW_TOKEN != 'true'
        run: ...   # notice only, exit 0
```

An unset secret is the empty string, so an absent credential evaluates to
`false` rather than erroring. The flag is `true`/`false` — it is not the secret,
so the indirection discloses nothing.

**The rejected alternative.** A job-level `if:` *can* be kept by adding a guard
job that exposes the secret through `jobs.<id>.outputs` (which can read
`secrets`) and depending on it with `if: needs.guard.outputs.has_token ==
'true'` (`needs` *is* available in a job-level `if`). It was not used: it costs
a second runner job, adds a second check context to every PR, and leaves
`ai-review` reporting `skipped` rather than green — a conclusion whose treatment
by required-status-check evaluation is a detail nobody should have to reason
about for a check that blocks nothing.

## Security properties held deliberately

- **Every `uses:` is pinned to a full 40-character commit SHA** with a version
  comment, matching every other workflow here.
  `anthropics/claude-code-action@d40ddef4c030e508327d6e35a9c45f3368482c50` is
  `v1.0.195`; the annotated tag object is `cd2a4ef8…` and the **commit** it
  points at is `d40ddef4…`, which is what a `uses:` must name.
- **No `run:` block interpolates `${{ github.event.* }}` or
  `${{ github.head_ref }}`.** Branch names, PR titles and PR bodies are
  attacker-controlled text; expanding them into a shell is command injection,
  and it is the class CodeQL's `actions` pack — which this repository already
  runs as a required gate — exists to find. Only `github.event_name`,
  `github.workflow` and `github.ref`, which GitHub sets, are used.
- **No `continue-on-error` anywhere.** Once the secret exists, a genuinely
  broken review job goes red and stays visible. It blocks nothing because the
  gate is not required — the non-blocking decision lives in `ci/gates.toml`,
  where it is reviewable, not in a suppressed exit code.
- **`permissions` are `contents: read` and `pull-requests: write`** — enough to
  read the diff and post review comments, and nothing else. No write token
  means no commit, no push, no branch, whatever the model decides.
- **The verification system is denied to the reviewer** in the prompt and again
  mechanically through `permissions.deny` rules on the action's `settings`
  input. See "What the reviewer may and may not touch".

## NOT ENABLED: the autonomous-fix variant

**The reviewer cannot currently change a single byte of this repository.** It
comments; that is all. Whether it should ever be able to push a fix is an open
question the owner has not resolved, so nothing here implements it.

`permissions:` is `contents: read` and `pull-requests: write`. With no write
token the job physically cannot commit, push, or open a branch, regardless of
what the prompt says or what the model decides. That is why the deny-list above
is defence in depth today rather than the load-bearing control — it is written
now so that granting write later is a one-line change with the boundary already
in place, instead of a one-line change that also silently removes it.

If that variant is ever enabled, it needs **all three** of the following, not
just the first:

1. **`contents: write`** on the job — the one-line change. On its own this is
   the dangerous half.
2. **The deny-list widened first**, per the "Known gap" note above: deny
   `scripts/**` and allow-list the specific files the reviewer may touch. A
   reviewer with a write token and a partial deny-list can edit a required
   verifier that nobody listed.
3. **An infinite-loop guard.** A push from this job to the PR branch fires
   `pull_request: synchronize`, which starts this workflow again, which pushes
   again. The `concurrency` block does not stop this — it cancels a superseded
   run, it does not stop a new one from being created. The usual guards are to
   skip when the last commit's author is the bot (`bot_id` / `bot_name`, which
   the action already sets to `claude[bot]` / `41898282`), or to drop
   `synchronize` from the trigger types so only `opened` fires.

Until all three are in place and a human has approved the change, treat any PR
that adds `contents: write` to this workflow as the highest-risk change in the
repository.

## What is not verified

- **The workflow has never executed on GitHub.** It parses as YAML, and
  `gate_integrity.py` and `tests/test_ci_integrity.py` both pass against it, but
  neither of those runs a workflow. The expression forms above are verified
  against GitHub's published context-availability table and the linked runner
  issue, not against a live run or `actionlint` (which is not installed here).
- **The action's behaviour on this repository is unobserved.** With no secret,
  the review step has never run even once, so the quality, volume and
  usefulness of its comments are unmeasured. The first PR after activation is
  the measurement.
- **No model is pinned.** The workflow passes no `claude_args`, so the action's
  own default model applies. Pinning one would make runs more reproducible and
  would need re-checking whenever the action's supported set changes; the
  trade-off was resolved toward fewer moving parts, and can be revisited.
