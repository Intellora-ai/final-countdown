# 01 — Runtime Architecture

**Package:** `final-countdown/learning-os/`, a Python package.
**Read with:** doc 02 (the contracts every boundary speaks).

> **Pinned to `60b3bf4`** on `learning-os/llm`, the integration branch —
> `api domain llm memory models policy runtime verifiers`. Verified on CI's
> configuration (Python 3.12, hash-locked install): **207 tests passing**, ruff
> clean, `mypy --strict` clean over 30 files.
>
> `diagnosis/` is described against **`ebc4059`** on `learning-os/diagnosis`,
> which is stacked on this branch and **not yet integrated**. `mastery/` **landed at `f4b2fe6`**, after this pin — `mastery/estimate.py`
> plus `tests/test_mastery.py`. Like `diagnosis/`, it is built and tested and
> **nothing outside its own tests imports it**. The earlier note here said it
> was not started; that was true at the pin and is no longer.

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
| `llm/` | Generation behind a fake-able protocol | **done** — `contract.py`, `client.py`, `validation.py` |
| `diagnosis/` | Estimating skill from evidence; selecting the bottleneck | **done at `ebc4059`**, not yet integrated — doc 04 §9 |
| `mastery/` | Learner model, mastery states, retention | **done at `f4b2fe6`**, not yet consumed by any other module |
| `policy/` | Candidate actions, ranking, the `Decision` | **done** — `select.py` |
| `runtime/` | The teaching loop | **done** — `loop.py` |
| `api/` | `LessonSpec` emission. No decisions. | **done** — `emit.py` |

`diagnosis/` exists at `ebc4059` on a branch stacked above the pinned commit;
statements about it are marked with that commit where they appear. `mastery/`
has not been started — the branch is cut at the old canvas head and contains no
`learning_os` source, so nothing in this set describes its internals.

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

### Invariant 4 — every memory has future decision utility

`relevant(skill_id, limit=8)` is where this is enforced, and the enforcement is
in the **ordering**, not in what gets written.

Attempts come back ranked by how much they constrain the next decision, not by
recency:

```python
rank = {Outcome.FAILURE: 0, Outcome.PARTIAL: 1, Outcome.SUCCESS: 2}
# failures first, then partials, then successes; recency breaks ties within a band
```

A failure is the most decision-changing thing in the log because it **removes an
option**. A success is the least, because it only confirms one. Sorting by
recency instead would surface whatever happened last, which is unrelated to
whether it changes anything.

`limit` is the other half. A decision context that grows without bound is
eventually truncated by something that did not choose what to drop — a token
window, a prompt builder, a database page. Truncating here means the thing
dropped is the least relevant one, rather than whichever happened to be last.

That is the whole of invariant 4 in practice: nothing is retained "just in
case", and retrieval is ordered by decision impact. If a stored field is never
read by a decision, it fails this invariant and should not be stored.

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

### `runtime/loop.py` — where the modules are composed

Every other module answers one question well. This is the only place they are
put together, and **composition is where the interesting failures live**: a
validator that works and is never consulted, a memory that records nothing
because the caller forgot, a repair path that loops because nothing counts
attempts. None of those are visible inside the modules; all of them are visible
here.

```python
MAX_GENERATION_ATTEMPTS = 2

class TurnStatus(StrEnum):
    TAUGHT                  # content generated and honoured its contract
    UNAVAILABLE             # the model could not be reached
    CONTRACT_UNSATISFIABLE  # content broke the contract in ways rewriting cannot fix
    EXHAUSTED               # every mechanism for this diagnosis has failed here

@dataclass(frozen=True, slots=True)
class Turn:
    status: TurnStatus
    decision: Decision
    content: GeneratedContent | None = None
    violations: tuple[Violation, ...] = ()
    attempts: int = 0
    at: datetime | None = None
```

**The loop records even when it fails.** The tempting shape — generate,
validate, return on success, raise on failure — throws away the most valuable
thing the system produces. A generation that broke its contract twice and was
abandoned is exactly what the policy needs next time, and a loop that raises
leaves no trace, so the same strategy is chosen again, fails again, and the
engine never learns because nobody wrote it down.

Every terminal state records an `Attempt`. `Outcome.FAILURE` on the way out is
the output, not an error path.

**Four statuses rather than a bool**, because the right next move differs for
each and collapsing them forces the caller to re-derive which happened from
whatever incidental detail survived. `CONTRACT_UNSATISFIABLE` in particular
means the *policy* must choose differently — regenerating is the blind repeat
invariant 7 exists to stop.

**`content` is `None` unless `status is TAUGHT`**, structurally rather than by
convention. A caller cannot accidentally render content that failed validation,
because on that path there is nothing to render.

**Two generation attempts, not three.** Content failing its contract twice is
evidence about the *contract*; a third attempt spends money to learn nothing the
second did not already say.

### Two decisions in the loop that are not obvious

**An outage records nothing.** `TurnStatus.UNAVAILABLE` writes no `Attempt`.
Recording it would burn a good mechanism forever on one network timeout — the
strategy did not fail, the transport did, and `failed_mechanisms` cannot tell
the difference after the fact.

**Exhaustion is decided before the model is called.** Generating first would
spend a request producing content the caller has already been told not to
trust.

---

## 10. `api/emit.py` — the emitter, diffed against the schema

`emit.py` produces `LessonInput`-shaped payloads and **does not describe the
format**. `validateLesson` remains the only adapter. There is no second schema.

I diffed it against `spec.ts` field by field rather than reading the summary,
because these constraints are duplicated across a language boundary and
duplication is what drifts.

| Constraint | `spec.ts` | `emit.py` | |
|---|---|---|---|
| `Id` | `^[a-z0-9][a-z0-9-]*$`, 1..64 | `_ID` + `MAX_ID = 64` | match |
| `question` | 1..200 | `MAX_QUESTION = 200`, raises | match |
| `Prose` | 1..2000 | `MAX_PROSE`, both bounds raise | match |
| `blocks` | 1..24 | `MAX_BLOCKS`, empty raises | match |
| `relations` | max 48, `.default([])` | always emitted, even empty | match |
| `subject` | `Label.optional()` | **omitted** when absent, never `null` | match |

`subject` is the one that only shows up in a browser: `optional()` accepts a
missing key, not a `null`, so `"subject": null` fails parsing for a field meant
to be skipped.

**Block id uniqueness is enforced independently on both sides** — `emit.py`
raises `EmitError` ("relations would bind to the wrong one") and
`validate.ts:180` reports a duplicate-id issue. Neither relies on the other.

**One inconsistency, currently unreachable.** Every bound in `emit.py` raises
except `relations`, which truncates silently via `out[:MAX_RELATIONS]`. It
cannot fire today: relations are one-per-non-primary-block, so `MAX_BLOCKS = 24`
caps them at 23 against a limit of 48. It becomes a live silent-data-loss path
if the block cap ever rises above 49, and relations are load-bearing — dropping
them changes the beat structure.

**Known gap: `figure`/`data` are not emitted yet.** The emitter produces
prose-bearing blocks only, so the `figure.as` must agree with `data.shape` rule
in §9 is **not yet exercised**. The first figure-bearing lesson meets it cold.

Only `supports` relations are emitted. `derives` and `contrasts` would make the
graph look richer and would be structure the content does not have — and the
canvas would render the assertion faithfully.

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
./.venv/bin/python -m pytest tests -q       # 207 tests, all passing
./.venv/bin/ruff check src tests            # clean
MYPYPATH=src ./.venv/bin/mypy --strict src/learning_os   # clean, 11 files
```

The failing test is the sandbox one; doc 03 §4. Install the package before
running — the suite passes under `PYTHONPATH=src` with no install, and that is
the configuration in which the defect is invisible.

---

## 9. `LessonSpec` — the engine/canvas contract

**Source of truth:** `frontend/src/canvas/spec/spec.ts`,
`spec/validate.ts`, `spec/figure.ts`, `spec/representations.ts`.
Confirmed against the canvas owner and read out of the code, not designed here.

The engine emits **`LessonInput`-shaped JSON and nothing else**. Do not invent a
wire format; the canvas already has the two-stream split an adapter would buy.

```ts
export type LessonInput = z.input<typeof LessonSpec>   // what a model WRITES: defaults optional
export type Lesson      = z.output<typeof LessonSpec>  // defaults filled, every field present
```

`validateLesson(input: unknown) -> {ok: true, lesson} | {ok: false, issues}` in
`spec/validate.ts` **is** the adapter, at the canvas edge. It parses, applies
defaults, runs the shape invariants, and returns a discriminated result.

A hand-written adapter on the engine side would be a third shape to keep in step
with two others, and the day it drifts the same payload renders differently
depending on which door it came through.

### The shape

```ts
LessonSpec = {
  id:        Id
  question:  string        // 1..200 — the question the lesson answers; rendered as the title
  subject?:  Label
  blocks:    Block[]       // 1..24
  relations: Relation[]    // 0..48, default []
}.strict()

BlockBase = {
  id:        Id            // stable and meaningful — relations and doubt answers reference it
  title?:    Label
  emphasis:  'primary' | 'supporting' | 'aside'   // default 'supporting'
  tone:      Tone                                  // default 'neutral'
}

Relation = { from: Id, to: Id, kind: 'supports' | 'derives' | 'contrasts' | 'exemplifies' }
```

Eight block kinds: `prose`, `callout`, `metric`, `equation`, `table`, `chart`,
`flow`, `simulation`.

### `.strict()` — an unknown key is a refusal

Not an ignored field. A silently dropped key is how an engine ships a feature
the canvas never renders and nobody notices.

The consequence for the engine: **it cannot add a field ahead of the canvas
supporting it.** Version the spec and let the canvas widen first. This is the
concrete reason `LessonSpec` versions separately from `CONTRACT_VERSION`.

### `emphasis` and `relations` are load-bearing, not decoration

The single most important thing for an engine author to get right.

**Beats — the units a lesson is taught in — are derived from them.** A `primary`
block leads a beat and absorbs the `supporting` and `aside` blocks that follow,
until the next `primary` or until `MAX_BLOCKS_PER_BEAT = 3`.

An engine that emits twelve blocks all at the default `supporting`, with no
relations, produces **one enormous beat**. That is a lecture, which is the exact
failure the beat system exists to prevent. The cap is a backstop, and it cuts by
counting rather than by meaning, so it shows.

`relations` drives three separate things: beat derivation, layout (a `derives`
edge stacks a block under its source), and the doubt resolver, which uses
`supports`/`derives` edges to answer "why" questions. Omit them and all three
degrade quietly.

`emphasis` is three words rather than a number deliberately — a scale invites
`emphasis: 7`.

### The spec must NOT state beats, or any step count

Beats are derived so they cannot contradict the content. An engine shipping its
own beat boundaries can place one in the middle of an argument and nothing
downstream can tell.

`Beat` carries no index and no total, and `checkBeats` rejects a checkpoint
containing a count. **The learner is never told how many parts remain.**

### `figure.as` must agree with `data.shape`

A figure names one of **137 representations**; each maps to one of **12 data
shapes** (`series`, `parts`, `distribution`, `matrix`, `graph`, `hierarchy`,
`intervals`, `process`, `logic`, `geometry`, `tabular`, `flowWeighted`).

`checkFigure` **refuses** a mismatch rather than rendering something wrong:
`as: 'sankey'` with `parts` data is rejected, not coerced. Naive emitters get
this wrong constantly, because the representation name is the thing they are
thinking about and the shape is not.

**Three representations have no renderer** — `circuitSchematic`, `logicCircuit`,
`experimentalSetup`. Their payloads carry no wiring or gate-type data, so
drawing them would draw a *different* circuit. They render an honest
"cannot be drawn" state. The engine should not emit them expecting a picture.

### Shape invariants refuse rather than repair

An engine author will hit these: unordered x on a continuous axis, negative
values in `parts` (waterfall excepted), a confusion matrix whose axes are not
identical and in the same order, a declared DAG containing a cycle, a sankey
whose flow is not conserved, a decision node with fewer than two outcomes.

Each is a refusal with a stated reason. That is the behaviour to want — a chart
that silently sorts your data is a chart that lies about it.

### Captions are answers, not ornament

The doubt resolver indexes captions as a lower-priority match tier. A block with
no caption answers fewer of the learner's questions.

### `avoidWhen` is authoring guidance and must never reach a learner

It lives in the representation registry to guide selection. A placeholder once
printed it to the reader; it reads as an error they caused and can do nothing
about.

### The third boundary rule

Doc 01 §2 states two rules — versioned separately, and no geometry or style.
The canvas owner adds a third that subsumes them:

> **The spec may not state anything the canvas can derive.**

Position and style are the obvious cases. Beats, ordering-by-importance, and
"which representation is best" are the same category: every one is a place where
the engine can contradict the content it just emitted. If the canvas can compute
it from *what exists* and *how blocks relate*, the engine stays quiet.

### Before `runtime/` lands

The canvas owner has offered to review the engine's spec module against the
actual Zod schema before it ships. Take that offer — the comparison is cheap now
and expensive after two implementations exist.
