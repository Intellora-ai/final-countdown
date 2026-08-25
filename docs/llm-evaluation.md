# Evaluating the model call sites

P11. The product calls a language model in four places and, until this, scored
none of them.

| Where | Provider |
|---|---|
| `frontend/src/practice/engine/modelProvider.ts` | Anthropic |
| `learning-os/src/learning_os/llm/anthropic_client.py` | Anthropic |
| `learning-os/src/learning_os/llm/gemini_client.py` | Google Gemini |
| `frontend/src/agent/ports/httpModel.ts` | local model, OpenAI wire format |

## The rule that shapes all of it

**Deterministic checks run first, and a model is never the only judge.**

Whether a response is valid JSON, carries every required field at the right
type, offers exactly four distinct options, and names a correct option that
actually exists all have answers. Asking a model would be paying for an opinion
about a decided question, and it would make the verdict depend on a network call
and a temperature.

So `evals/validators/practice.ts` decides structure, and only responses that
survive it are scored for whether their solution is supported by the cited
source.

## No new tool, and why

The plan recommended Promptfoo. It is not used.

Adding a dependency is a stop-and-ask decision in this repository, and nothing
was missing without one:

- **vitest** already runs the suite, and `evals/` is a declared area in
  `vite.config.ts`.
- **`precision`** and **`citationSupports`** already exist in
  `src/websearch/quality.ts`.
- The fixtures are plain JSON, read through `resolveJsonModule` rather than
  `fs` — which is also why `evals/` needs no `@types/node`.

Writing a second scorer would have given the repository two numbers that mean
almost the same thing, disagree at the edges, and force every future reader to
work out which one to trust.

## No new metrics

`grade`, `precision`, `recall`, `coverage` and `citationSupports` were built for
the web-search work and measure exactly what is needed here.

`citationSupports` requires **every figure in a claim to appear in the cited
source**. That is stricter than it first looks, and it caught the first version
of the `clean` fixture: the claim cited **300 K** and **600 K** from a source
that named neither number. The metric was right and the fixture was wrong. The
fixture now states the figures, as a real citation would.

## The oracle is the dataset, not the code

Each case in `evals/practice/cases.json` states what must happen — `accept`, and
where it applies `supported` — written from the requirement.

A baseline recorded from whatever the code returned on the day would test only
that the code equals itself. `ci/baselines/llm.json` is a **floor**: the gate
fails when a score drops below it and says nothing when one rises. Raising a
number there is a deliberate act that must come with the run that earned it, and
`practice.eval.test.ts` pins the values so a silent edit is a failing test.

## Six fixtures, more than six checks

Every accepted case is also run with each required field removed in turn, and
every derived case must be **rejected**. Six hand-written cases catch six
defects; the sweep turns them into inputs nobody had to write.

That is the same reasoning `.github/workflows/nightly.yml` already states: more
examples, not a second suite. A nightly suite that diverges from the
pull-request suite is two things to maintain and one of them is never read.

## Offline is enforced, not intended

`practice.eval.test.ts` replaces `fetch` with a throwing stub for the duration
of the suite. An edit that reaches for a live provider fails there rather than
quietly adding a bill to every pull request.

## What is deliberately NOT built

**A run against the real Anthropic and Gemini APIs.** It needs credentials this
repository does not hold and it spends money on every execution. Neither is a
decision a build step should take on its own.

The `llm-eval` job in `nightly.yml` is the seam it would land in: add the
provider step there, behind the secrets, and the validators, the scoring and the
baselines already exist. Nothing else has to be designed for it.

This is recorded as an open decision rather than a silent gap, because a missing
capability nobody wrote down is indistinguishable from one nobody noticed.

## `evals/` is declared in three places, on purpose

`vite.config.ts` (vitest), `eslint.config.js` plus the `lint` script, and
`tsconfig.evals.json` wired into `typecheck`.

A directory named in one and not the others is silently skipped with no error.
That is how `src/api` once shipped unlinted, and it is why `e2e/` is typechecked
by nothing — an undeclared identifier there reached CI as a `ReferenceError`
after `npm run typecheck` had passed cleanly over it.

`evals/` sits outside `src/` because the reachability gate walks `src/` and
fails any non-test file no shipped entry point can reach. Validators exist to
judge model output in CI and are reached by nothing the product loads, so living
under `src/` would make them permanent orphans and the honest fix would be an
exemption — a rule a file can never satisfy.
