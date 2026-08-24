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

When a real provider is added it reads `LEARNING_OS_LLM_API_KEY` from the
environment. Never hard-coded, never committed; CI greps for an assigned value.

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
