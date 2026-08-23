# 01 — Runtime Architecture

**Package:** `final-countdown/learning-os/`, a Python package.
**Read with:** doc 02 (the contracts every boundary speaks).

---

## 1. What this system is

Not a chatbot that explains things. A **backend decision engine**.

The question it answers is not *"what is a good explanation of recursion"*. It
is: *given everything known about this learner, this concept, what has already
failed, and the tools available — what is the best thing to do next?* Then do
it, observe what happened, update state, and decide better next time.

The LLM sits **inside** this architecture. It is not the architecture. It
generates content within a knowledge model it cannot modify, under a policy it
does not choose, and its output is checked before a learner sees it.

---

## 2. Boundaries that do not move

### Python engine, TypeScript canvas

The engine is Python. The canvas is TypeScript. **The engine never imports the
canvas and the canvas never imports the engine.** The only thing that crosses is
JSON.

### The engine never draws

The engine emits a **versioned `LessonSpec`**; the canvas renders it. The engine
contains no rendering logic, no layout, and no geometry.

Concretely, a `LessonSpec` may state *what exists* and *how blocks relate*. It
may not state `x`, `y`, `width`, `height`, colour, font size, or spacing. Those
are the canvas's decisions, and an engine that made them would be deciding a
screen it cannot measure.

`LessonSpec` is versioned **separately** from `CONTRACT_VERSION`. The two evolve
on different clocks, and a renderer pinned to one spec version must not break
because an internal contract was bumped.

### No live LLM key

`LLMClient` is a protocol with a deterministic fake, fixture responses, and
failure simulation. **The real model must never be required by the test suite.**

Env var `LEARNING_OS_LLM_API_KEY` when a real provider is added. Never commit
credentials. If a test needs a key to pass, the boundary is in the wrong place.

---

## 3. Module map

| Module | Owns | Status |
|---|---|---|
| `models/` | The six contracts, versioning, the invariants that are type-enforceable | done |
| `domain/` | Canonical knowledge: concepts, subskills, misconceptions, the graph | done |
| `memory/` | What was tried, what failed, what is worth retrieving | done |
| `verifiers/` | Whether a claim can be checked, and what a check established | done |
| `llm/` | Generation behind a fake-able protocol | not started |
| `diagnosis/` | Estimating skill from evidence; selecting the bottleneck | in progress, interface unsettled |
| `mastery/` | Learner model, mastery states, retention | in progress, interface unsettled |
| `policy/` | Candidate actions, ranking, the `Decision` | not started |
| `runtime/` | The loop; `Judgement` → `ToolResult`; `LessonSpec` emission | not started |
| `api/` | Transport. No decisions. | not started |

`diagnosis/` and `mastery/` are being built concurrently by other sessions.
Anything this document set says about their internals is **provisional** and
written against the spec, not against signatures that do not yet exist.

---

## 4. The decision loop

```
  event in
     │
     ▼
  ① retrieve      MemoryStore.relevant(skill_id)      → past attempts
     │
     ▼
  ② diagnose      Evidence[] → SkillEstimate          → where is the learner
     │            bottleneck selection                → what is blocking them
     ▼
  ③ decide        CandidateAction[] → ranked          → Decision
     │            memory consulted for repeats
     ▼
  ④ act           LLM generates inside the knowledge model
     │
     ▼
  ⑤ check         validators + DomainVerifier         → Judgement
     │            failed content never reaches a learner
     ▼
  ⑥ emit          LessonSpec (versioned JSON)         → canvas
     │
     ▼
  ⑦ record        DecisionEvent + Evidence            → append-only log
                  PolicyUpdate (status=observed)
```

Every arrow carries one of the six contracts. Nothing crosses as a bare dict.

Step ⑦ writes a `PolicyUpdate` at `OBSERVED`, and **that is where the live loop
stops**. Nothing about production policy changes here; see doc 02 §6 and doc 05
§8.

### Where `Judgement` becomes `ToolResult`

Step ⑤ produces `Judgement` (`passed`, `performance`, `verifiability`, `detail`,
`limitations`). Step ⑦ converts it to `ToolResult`, adding `source` and
`retrieved_at`.

The conversion lives at the runtime boundary because that is the only place the
provenance is known — a verifier knows what it checked, not when the engine
called it or what the engine calls it. Doc 03 §3 has the mapping.

---

## 5. `memory/` — what was tried, and what may be tried again

`MemoryStore` is complete and stable. It supplies invariants 4 and 7.

| Symbol | Purpose |
|---|---|
| `Attempt` | One recorded try: skill, mechanism, example signature, outcome |
| `Outcome` | The result enum |
| `MemoryStore.record_*` | `record_event`, `record_decision`, `record_evidence`, `record_attempt` |
| `failed_strategies(skill_id)` | Strategies that have failed **and never succeeded** |
| `succeeded_with(skill_id)` | What has worked |
| `representations_tried(skill_id)` | Avoids re-showing the same form |
| `is_repeat(...)` | Three-way repeat detection — see below |
| `relevant(skill_id, limit=8)` | Retrieval for step ① |
| `similarity(a, b)` | Content-word overlap |
| `SAME_EXPLANATION = 0.6` | The novelty threshold |

### `failed_strategies` excludes anything that also succeeded

Invariant 7 says a failed strategy cannot repeat without a reason. It does not
say a strategy that failed once is banned forever. A strategy that has both
failed and succeeded for this learner is **not** in the failed set — otherwise
one bad afternoon would permanently forbid the single approach known to work for
them.

### `is_repeat()` checks three things

Mechanism, example signature, and text similarity. A repeat can hide in any one
of them:

- Same mechanism, different example → still the same explanation
- Different mechanism, same example → the learner sees the same thing again
- Different both, near-identical wording → a rephrase, not a new idea

Each check alone leaves an obvious way through. All three are needed.

**Success is exempt.** Retrieval practice *is* repetition, deliberately, and
treating it as a repeat would forbid the one thing known to work.

### `similarity()` is word overlap, deliberately not an embedding

An embedding would score better. It is rejected for two reasons:

1. It needs a model, and the offline rule (§2) forbids the test suite requiring
   one.
2. **A novelty verdict must be explainable.** "The model said 0.83" is not a
   reason a decision can be defended with six weeks later, and this system's
   entire value is that its decisions can be explained afterwards.

`SAME_EXPLANATION = 0.6` is calibrated against the failure on each side, and
each side has a test. Below it, two genuinely different explanations of
recursion collide, because any two share *recursive*, *call*, *base*, *case*.
Above it, swapping six words counts as a new idea.

**Its real weakness, stated rather than hidden:** word overlap cannot see two
texts that share a mechanism in different vocabulary. That is why
`Attempt.mechanism` is **recorded** rather than inferred from the text — the
weak measure never carries the load alone.

---

## 6. `domain/` — the subject is data

Without a canonical knowledge model the LLM redefines the subject on every call.
Ask twice what a base case is and you get two definitions, each fine alone and
quietly inconsistent, and a learner told both has been taught that the terms are
vague. Worse, nothing is then checkable: a misconception is only detectable if
the correct model was written down first.

So the subject is **data**, authored once and reviewed, and the LLM generates
inside it.

**Invariant 6 — the LLM cannot mutate the canonical knowledge model — is
architectural, not type-enforced.** The models are frozen and the LLM layer is
never handed a writable reference. No type prevents someone passing a mutable
copy; only the module boundary does. **If you add a code path that hands
knowledge to the LLM layer, invariant 6 becomes your responsibility at that call
site.**

What is deliberately *not* in `domain/`: no representation choice, no difficulty
ordering, no teaching sequence. Those depend on the learner, and freezing them
into the subject is how a system teaches every learner the same path while
claiming to adapt.

`KnowledgeGraph` validates at construction: no prerequisite cycles (DFS with an
on-stack marker, so a diamond is not a false positive), and every prerequisite
exists. `teachable_order()` returns a topological order — a constraint a
curriculum must satisfy, **not** a curriculum.

---

## 7. Failure behaviour

| Failure | Response |
|---|---|
| No verifier for a domain | `UnsupportedVerifier` → `UNSUPPORTED`, confidence `0.0`. Never a general fallback checker. |
| Learner code does not terminate | A `Judgement` recording non-termination. For `repair_missing_base_case` that is the most informative outcome available. |
| LLM unavailable or malformed | Fail visibly. No cached-answer fallback that looks like a fresh decision. |
| Generated content fails its verifier | It does not reach the learner. |
| Contract validation fails | Raise. The whole point of `extra="forbid"` is that the error surfaces at construction, not three layers downstream. |

The pattern: **fail loudly and early.** Every silent fallback in this design has
been removed on purpose, because a wrong answer delivered confidently is worse
than no answer.

---

## 8. Verification

Measured against the tree, not quoted:

```bash
cd learning-os
python3 -m venv .venv && ./.venv/bin/pip install -e ".[dev]"
./.venv/bin/python -m pytest tests -q       # 105 tests, all passing
./.venv/bin/ruff check src tests            # clean
MYPYPATH=src ./.venv/bin/mypy --strict src/learning_os   # clean, 11 files
```

The failing test is the sandbox one; doc 03 §4. Install the package before
running — the suite passes under `PYTHONPATH=src` with no install, and that is
the configuration in which the defect is invisible.
