# Learning OS

A replayable, verifiable instructional decision engine.

It is not a chatbot that explains things. The question it answers is not
"what is a good explanation of recursion" but:

> Given everything known about this learner, this concept, this conversation,
> what already failed, and the tools available — what is the best thing to do
> next?

Then: do it, observe the result, update state, and make a better next decision.
That closed loop is the product. The LLM sits inside this architecture; it is
not the architecture.

## Where the boundary is

```
learning-os/          this package — Python, decides WHAT to teach
   │
   │  emits a versioned LessonSpec (stable JSON)
   ▼
frontend/src/canvas/  TypeScript — decides HOW it is drawn
```

The engine never draws, never lays out, never contains rendering logic, and
never imports frontend code. The canvas already refuses to be told where to put
things — its own rules forbid an author supplying coordinates — so the same
discipline applies from this side: the engine chooses a representation, and the
canvas decides what that looks like.

## Status

Contracts are frozen. The engine is not built yet.

| | |
|---|---|
| `src/learning_os/models/contracts.py` | the six runtime contracts, versioned and validating |
| `tests/test_contracts.py` | 34 tests, each constructing something the spec says is impossible |

## The six contracts

| Contract | Answers |
|---|---|
| `Event` | what happened |
| `LearnerState` | what is currently estimated |
| `Decision` | what should happen next |
| `ToolResult` | what an external tool established |
| `Evidence` | what the learner's behaviour demonstrated |
| `PolicyUpdate` | what the system learned from the outcome |

They are frozen, strict, and closed to unknown keys. Nothing crosses a layer as
a bare dict, because a dict that grows a key in one module and loses it in
another destroys replay silently — the log still parses, it just stops
answering the question.

## Four things that are enforced, not documented

**Production policy cannot change from one live outcome.** The naive research
loop (outcome updates policy) is rejected. A candidate change walks a state
machine — offline evaluation, benchmark replay, safety gates, human approval,
canary, rollout — and there is no transition from `observed` to `live`. A
`PolicyUpdate` cannot even be constructed in a live state.

**A diagnosis cannot be stored.** The system may be used by children. It may
record `possible_confusion` with the evidence that produced it and an expiry. It
may never record "has ADHD", "is lazy", "is emotionally unstable". The signal
vocabulary is closed — and, just as importantly, there is no free-text field
anywhere on the learner model for a trait to be written into. `misconceptions`
holds references into the canonical knowledge model, not prose, because a closed
enum beside one free string is not closed at all.

**A mastery claim needs independent, varied evidence.** Ten identical
multiple-choice answers are not ten observations. An answer given straight after
being shown the answer is evidence of listening.

**An unsupported domain produces uncertainty, not confidence.** Python execution
can be checked. Historical interpretation cannot. A `ToolResult` marked
`UNSUPPORTED` cannot carry a confidence above zero.

## The suite runs offline

No API key. The LLM is a deterministic fake and every verifier is local, and
that is enforced by an autouse fixture that blocks sockets rather than by a
note. A suite that needs a real model is a suite that gets skipped the first
time a key expires — and the tests that would stop running are exactly the ones
asserting the engine does not fabricate confidence.

```bash
python -m venv .venv && ./.venv/bin/pip install -e ".[dev]"
PYTHONPATH=src ./.venv/bin/python -m pytest tests -q
./.venv/bin/ruff check src tests
MYPYPATH=src ./.venv/bin/mypy --strict src/learning_os
```

## Running it against a real model

The fake is the default and needs nothing. Two live adapters exist behind the
same one-method boundary, and switching between them changes the quality of the
prose and nothing else — every decision the engine makes is already made before
the model is called, and `validate` checks the result afterwards either way.

| `LEARNING_OS_LLM_PROVIDER` | Adapter | Credential it reads | SDK |
|---|---|---|---|
| unset, or `fake` | `FakeLLMClient` | none | none |
| `gemini` | `GeminiClient` | `LEARNING_OS_GEMINI_API_KEY` | `google-genai` |
| `anthropic` | `AnthropicClient` | `LEARNING_OS_LLM_API_KEY` | `anthropic` |

Two variables and not one, deliberately. A single shared name makes the
providers mutually exclusive on one machine and — worse — sends one vendor's
credential to the other vendor's endpoint the first time somebody switches. A
key disclosed to the wrong party has no undo that is not rotation.

An unrecognised value is **refused**, not quietly replaced by the fake. A
fallback there would mean a typo produces a run that looks live, costs nothing,
and teaches nobody, with no signal at any layer.

### Getting a Gemini key

This repository does not issue one and cannot. Create it yourself at
[Google AI Studio](https://aistudio.google.com/apikey) — the free tier needs a
Google account and no card. Then:

```bash
# the SDK, hash-pinned, from its OWN lock. Never the base lock — see below.
.venv/bin/pip install --require-hashes -r requirements-live.lock

export LEARNING_OS_LLM_PROVIDER=gemini
export LEARNING_OS_GEMINI_API_KEY=...    # your own value; never commit it

# one command that says whether the live path is actually on
PYTHONPATH=src python -m learning_os.api.ask --doctor
```

`--doctor` prints the provider, whether the credential is present (a boolean,
never the value), whether the SDK imports, and the one command to fix whichever
is missing. It exits non-zero when the live path is not ready, so a script can
gate on it instead of parsing prose.

### Why the SDK has its own lock file

`requirements-learning-os.lock` is what CI installs. `requirements-live.lock` is
what it does **not**, and that separation *is* the offline guarantee.

Every honesty property here — the validator refusing content that misses a
required term, the runtime refusing to fabricate confidence — is asserted
against `FakeLLMClient`. A suite that *could* reach a real provider is a suite
that gets skipped the first time a key expires, and the tests that then stop
running are precisely the ones guarding against overconfident output. With the
SDK absent from the CI job entirely, a test that tried cannot succeed. That is
structural rather than a habit.

### Reaching the engine from the canvas

`frontend/vite-plugin-engine.ts` mounts `POST /api/doubt` on the dev server. It
spawns `python -m learning_os.api.ask` and returns its JSON, so a doubt the
canvas cannot answer reaches this engine. The subprocess inherits the server's
environment, which is why the key can be set there and never sent to a browser.

Dev only. `vite build` is static and the middleware is not in it — making the
engine reachable in production is a hosting decision, not one a build plugin
should make quietly.

`speak` runs one real turn — same policy, same memory, same validator, same
emitter as the runtime — and prints the lesson on **stdout** with every
diagnostic on **stderr**, so `| jq` works. It writes no files. Offline, with no
provider set, it runs the fake and still prints a valid lesson:

```bash
PYTHONPATH=src python -m learning_os.api.speak --question "Why does a recursive function need a base case?"
```

Exit codes are distinct because the fixes are: `2` the provider name is not one
this engine has · `3` no credential, no SDK, or the provider could not be
reached · `4` the contract could not be satisfied · `5` every mechanism for this
diagnosis has already failed and a human belongs here.

### What is deliberately not switched

`api/cli.py` and `api/demo.py` keep passing `FakeLLMClient` explicitly. Both
write committed fixtures that CI compares byte for byte, and a fixture whose
contents depend on an environment variable ends that comparison without removing
it — the check would stay green while checking nothing.

### What is not covered by a test

The one `generate_content` call itself. Mocking the SDK would assert that a mock
returns what the mock was told to return; the real risk lives in the prompt, the
response schema and the parse, and those are covered with no SDK, no key and no
socket. The request **shape** was validated against `google-genai` 2.19.0 by
constructing a real `GenerateContentConfig` — which rejects a misspelled key, so
the check is not vacuous — but no live call has been made from this repository.

## V1 scope

Domain: Python programming — chosen because code can be executed, tests run,
failure detected and transfer measured objectively, which most subjects do not
allow.

Three interventions: `teach_by_example`, `repair_broken_example`,
`transfer_challenge`. Plus two non-teaching actions that matter as much:
`diagnose`, and `do_nothing`. An engine whose action set is only teaching
actions will always teach, including when the right move was to leave alone a
learner who already understood.

`DomainVerifier` is generic from the start so Lean can be added later without
touching the core. Lean is not a V1 dependency.
