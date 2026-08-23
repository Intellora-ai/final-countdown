# 07 — V1 Implementation Plan

**Package:** `final-countdown/learning-os/`, a Python package.
**V1 domain:** Python programming, specifically recursion.
**Read with:** doc 02 (contracts), doc 03 (verifier interface).

> **Pinned to `93a175c`** on `learning-os/llm`, the integration branch —
> `api diagnosis domain llm mastery memory models policy runtime verifiers`.
> `diagnosis/` merged in here; there is no longer a stacked branch to describe
> it against.
>
> **Integration state, checked by grep rather than assumed** (doc 07 §9.1):
> `mastery/` is **integrated** — `runtime/loop.py:42` imports it.
> `diagnosis/` is **built but not consumed**: `select_bottleneck` is called by
> its own package and its tests, and by no other module.
>
> 269 `def test_` across 12 files, counted here. The collected total is higher
> after parametrisation; no interpreter available to this session has pytest, so
> any figure above 269 in these documents is relayed, not run.

---

## 1. Scope — what V1 contains

Thirteen items and nothing else:

1. Concept and subskill models
2. Learner evidence events
3. Representation history
4. Memory retrieval
5. Bottleneck selection
6. Instruction policy
7. Three intervention types
8. Python verifier
9. Mastery estimator
10. One transfer task
11. `LessonSpec` generation
12. Outcome logging
13. The contracts everything above speaks

Anything not on this list is V2. That includes: additional domains, a real LLM
provider, the Lean verifier, spaced repetition, multi-learner cohorts, and any
form of automatic policy update.

### The three interventions

| `ActionKind` | What it does | Evidence it targets |
|---|---|---|
| `teach_by_example` | Presents a worked example in a chosen representation | `own_word_explanation`, `prediction` |
| `repair_broken_example` | Gives a function that fails; learner fixes it | `repair_or_construction` |
| `transfer_challenge` | Same concept, structurally novel context | `independent_novel_transfer` |

### Why `ActionKind` has five members and not three

`DIAGNOSE` and `DO_NOTHING` are first-class alongside the three teaching
actions. An engine whose action set contains only teaching actions will always
teach — including at the two moments when teaching is the wrong move: when the
engine does not yet know what is blocking the learner (`DIAGNOSE`), and when the
learner already understands and should be left alone (`DO_NOTHING`).

Knowing what *not* to do is part of competent behaviour. If the action set
cannot express it, the policy cannot choose it, and the system will interrupt a
learner who was doing fine.

---

## 2. State of the build

### Done

| Module | Contents |
|---|---|
| `models/contracts.py` | Six contracts, `CONTRACT_VERSION = "1.0.0"`, twelve invariants where they are type-enforceable, `EvaluationStatus` + `_ALLOWED_TRANSITIONS` + `may_transition()` |
| `domain/knowledge.py` | `Concept`, `Subskill`, `Misconception`, `CognitiveOperation`, `KnowledgeGraph` with cycle detection, `prerequisites_of()`, `teachable_order()` |
| `domain/python_recursion.py` | `KNOWLEDGE_VERSION = "python_recursion_v1"`, `RECURSION` and `FUNCTIONS` concepts, 8 subskills, 3 misconceptions, `GRAPH` |
| `memory/store.py` | `MemoryStore`, `Attempt`, `Outcome`, `similarity()`, `SAME_EXPLANATION`, `failed_strategies()`, `succeeded_with()`, `is_repeat()`, `relevant()` |
| `verifiers/` | `DomainVerifier`, `Task`, `Judgement`, `UnsupportedVerifier`, `PythonVerifier` |
| `llm/` | `InstructionContract`, `Strategy`, `DiagnosisKind`, `SimplicityConstraints`, `preferred_representations`, the fake-able client, output validation |
| `policy/select.py` | `ReasonCode` (nine), `BottleneckLike`, `Decision`, `_STRATEGIES_FOR`, `_reorder_for_proficiency`, `NEARLY_RIGHT`, `choose_strategy()`, `select_action()` — doc 04 §10 |
| `mastery/estimate.py` | `MasteryState` (nine), `EVIDENCE_WEIGHT`, `Gates`, `DomainWeights`, `Belief`, `update()`, `state_of()`, `RETENTION_SCHEDULE` — doc 02 §11 |
| `runtime/loop.py` | `teach_once()`, threading `proficiency` through to the policy |
| `api/figure.py` | The figure boundary; its test parses `representations.ts` to check the shape map against the other side |

**269 `def test_` across 12 files at `93a175c`** — counted here. The collected
total is higher after parametrisation and is not stated, because no interpreter
available to this session has pytest and a relayed figure should not be written
as a measured one. Doc 06 §7 keeps the full provenance note.
`ruff check` clean; `mypy --strict` clean on `src` and `tests`, on Python 3.12 with the hash-locked install CI uses.

An earlier revision of this section recorded 99 of 100 with
`test_verifier.py::test_learner_code_cannot_import_the_engine` failing. That was
a real sandbox defect, fixed at `6eef301` with `-S` plus an install-independent
regression test — doc 03 §4 keeps the account, because *how* it hid is more
reusable than the fix: it passed under `PYTHONPATH=src` with no install, the one
configuration in which the escape is impossible.

```bash
cd learning-os
python3 -m venv .venv
./.venv/bin/pip install --require-hashes -r requirements-learning-os.lock
PYTHONPATH=src ./.venv/bin/python -m pytest tests -q
./.venv/bin/ruff check src tests
MYPYPATH=src ./.venv/bin/mypy --strict src/learning_os tests
```

**`pip install -e` deliberately does not appear here.** The repository's
supply-chain gate forbids it outright, CI cannot use it, and reproducing the
developer-only editable install is exactly what made the sandbox test green for
the wrong reason. `mypy` covers `tests` as well as `src` since `59bfaaf` — the
tests are where the invariants are actually asserted, so leaving them unchecked
was the more consequential half.

### Remaining

**Every V1 module now has source.** What is left is not writing them — it is
wiring them together.

| Module | State at `93a175c` | Consumed by |
|---|---|---|
| `mastery/` | **integrated** | `runtime/loop.py` |
| `diagnosis/` | merged onto the branch, **built not consumed** | its own package and `tests/test_diagnosis.py`; `tests/test_seam.py` now covers the join |
| everything else | integrated | `models domain memory verifiers llm policy runtime api` |

Both remaining modules are in the same state, and it is a state worth naming
rather than calling done: **built, tested, and imported by nobody.** A module
whose only caller is its own test suite has never had its interface used in
anger, and the seam is where the untested behaviour lives — see doc 04 §9.8,
defect 2. Counting them as finished is how an integration bug becomes a
surprise.

`diagnosis/` and `mastery/` are being built by other sessions right now and
their interfaces are **not settled**. Anything this document set says about them
is provisional, written against the spec rather than against signatures that do
not exist yet.

---

## 3. The knowledge model as built

`KNOWLEDGE_VERSION = "python_recursion_v1"`. Two concepts, eight subskills.

| Subskill | Operation | Criticality | Verifiability |
|---|---|---|---|
| `python.functions.call_and_return` | PREDICT | 0.9 | VERIFIABLE |
| `python.functions.missing_return_is_none` | RECOGNISE | 0.7 | **HUMAN_REVIEW_REQUIRED** |
| `python.recursion.identify_base_case` | RECOGNISE | 0.8 | **HUMAN_REVIEW_REQUIRED** |
| `python.recursion.trace_calls` | PREDICT | 0.7 | VERIFIABLE |
| `python.recursion.explain_termination` | EXPLAIN | 0.9 | **HUMAN_REVIEW_REQUIRED** |
| `python.recursion.repair_missing_base_case` | DEBUG | 0.85 | VERIFIABLE |
| `python.recursion.write_recursive_function` | CONSTRUCT | 0.9 | VERIFIABLE |
| `python.recursion.apply_to_nested_structure` | TRANSFER | 0.75 | VERIFIABLE |

The default is `HUMAN_REVIEW_REQUIRED`; the five `VERIFIABLE` entries are
deliberate assertions. Three subskills cannot be settled by execution — you
cannot run "identify the base case in this function" and get an answer — and a
permissive default had already marked two of them checkable by silence. See
doc 03 §2 for the asymmetry argument; it is the part a maintainer will be
tempted to relax.

Three misconceptions: `thinks_base_case_is_optional`,
`thinks_it_is_just_a_loop`, `thinks_return_value_accumulates_itself`. Each
carries `predicts_error` — the specific wrong answer a learner holding it will
produce. Without that field the entry is a label, not something detectable from
evidence.

`Concept.forbidden_simplifications` exists so that a struggling learner is not
taught something false. Simplify the path through the knowledge; never the
knowledge.

---

## 4. Build order

Each step is shippable and testable on its own. The ordering is by dependency,
not by importance.

### Step 1 — `verifiers/`

Start here: it is the only module with no dependency on the others, and every
later step wants real evidence rather than fixtures.

- `DomainVerifier` protocol, `Task`, `Judgement`, `UnsupportedVerifier` (doc 03)
- `PythonVerifier` — subprocess, `-I -S`, wall-clock timeout, no network
- Returns **`Judgement`** (`passed`, `performance`, `verifiability`, `detail`,
  `limitations`) — *not* `ToolResult`

A bare `bool` cannot satisfy invariant 5, but the verifier is not the component
that fixes that: it has no provenance to report. `Judgement` becomes a
`ToolResult` at the runtime boundary, where `source` and `retrieved_at` are
known. See doc 03 §3.

**Status: written**, with the sandbox fix in progress.

### Step 2 — `diagnosis/`

- Mastery estimator: `tuple[Evidence, ...] → SkillEstimate`
- Must populate `evidence_ids`, `evidence_count` and `evidence_diversity`, or
  construction fails on `_updates_cite_evidence`
- `evidence_diversity` counts distinct `EvidenceStrength` values, not distinct
  evidence rows
- Must never return `state="mastered"` unless `can_claim_mastery()` would hold
- Bottleneck selection: walk `prerequisites_of(target)` nearest-first, return
  the first subskill whose estimate is weak, weighted by `criticality`

Nearest-first is why `prerequisites_of` returns dependency order: when a learner
is blocked, check the immediate prerequisite, not the deepest one.

### Step 3 — `policy/`

- Generate `CandidateAction`s for the selected bottleneck, including
  `DIAGNOSE` and `DO_NOTHING` as genuine candidates
- Rank by `CandidateAction.expected_value`
- Consult `MemoryStore.failed_strategies(skill_id)`; if the top-ranked action is
  in that set, either pick the next one or set `Decision.repeat_justification`
  — invariant 7 makes silence impossible
- Emit a `Decision` with ≥1 `candidate_actions`, `expected_evidence` chosen
  **before** acting, and ≥1 `reason_codes`

### Step 4 — `llm/`

- `LLMClient` protocol
- `FakeLLMClient` — deterministic, seeded from the prompt hash
- Fixture responses on disk; failure simulation (timeout, malformed output,
  refusal)
- **The real model must never be required by the test suite.** Env var
  `LEARNING_OS_LLM_API_KEY` when a provider is added. Never commit credentials.

The engine must be fully testable with no network and no key. If a test needs a
key to pass, the boundary is in the wrong place.

### Step 5 — `runtime/` and `LessonSpec`

- Assemble the loop: retrieve → diagnose → select → decide → act → verify →
  record
- Emit a **versioned `LessonSpec`** as JSON
- Write a `DecisionEvent` per intervention

### Step 6 — `api/`

Thin. Transport only, no decisions.

---

## 5. The `LessonSpec` boundary

The engine emits a versioned `LessonSpec`; the TypeScript canvas renders it.

**The engine never draws, never lays out, and contains no rendering logic.** It
does not import the canvas, and the canvas does not import it. The only thing
crossing is JSON.

**The schema is not hypothetical — it exists, in the canvas.** Full contract,
field names, and the failure modes an engine author will hit are in doc 01 §9.
Read it before writing the emitter; it is written from the Zod schema and
confirmed by the canvas owner.

The three rules in short:

1. Versioned separately from `CONTRACT_VERSION`.
2. No `x`, `y`, `width`, `height`, colour, font size or spacing.
3. **Nothing the canvas can derive** — which also rules out beats, step counts,
   ordering-by-importance, and choosing the representation.

The one that will bite: `emphasis` and `relations` are load-bearing. Twelve
blocks at the default `supporting` with no relations produce a single
twelve-block beat, which is a lecture.

---

## 6. Transfer task

One, for V1: `python.recursion.apply_to_nested_structure`.

A transfer task is only transfer if the context is genuinely novel — that is
what `Evidence.context_novelty` records, and `1.0` means never seen before. A
"transfer" task recycling a context the learner has already worked is
`independent_application` at best, and labelling it
`independent_novel_transfer` inflates the strongest signal the system has.

---

## 7. Testing rules

- No test may require a network or an API key.
- Every invariant in doc 02 §9 needs a test that constructs the *violating*
  object and asserts it raises. A validator nobody has watched fail is a
  validator nobody should trust.
- The no-diagnosis constraint has such a test:
  `"the student is lazy and probably has ADHD"` must be refused. Keep it, and
  add one for any new field added to `LearnerState`.
- `may_transition` needs a test asserting there is no `observed → live` edge,
  and one asserting `LIVE → REJECTED` is allowed.

---

## 8. Explicitly out of scope for V1

- **Automatic policy update from live outcomes.** Rejected. See doc 02 §6.
- **Lean.** `LeanVerifier` is a boundary in doc 03, not a runtime dependency.
- **Any domain other than Python recursion.** `DomainVerifier` is generic so a
  second domain is an addition rather than a rewrite; adding one now would be
  designing against an imagined adapter.
- **Hard-coded illustrative flows.** The source spec's examples (concert
  tickets, lemonade, equilibrium) are illustrations. The spec says explicitly
  they must not become prescribed flows, so no module may reference them.

---

## 9. Two rules about what "done" means

Both came out of writing these documents rather than out of planning, and both
describe a way a module can look finished and not be.

### 9.1 A module whose only caller is its own test suite is not done

`mastery/` and `diagnosis/` are each complete, tested, and **imported by
nothing but `tests/test_mastery.py` and `tests/test_diagnosis.py`.** Verified by
grep, not assumed.

That is a specific and recognisable state, and it deserves a name rather than a
tick in a table. A test suite is a **cooperative** caller. It constructs exactly
the inputs the author had in mind, in the order the author had in mind, and it
was written by the person who wrote the interface — usually in the same hour.
It cannot discover that a parameter is confusing, that two modules disagree
about a type, or that the package does not export what a consumer would reach
for.

The evidence that this is not theoretical is in doc 04 §9.8. `diagnosis/` had
**25 passing tests and a 0-byte `__init__.py`**, so
`from learning_os.diagnosis import select_bottleneck` raised `ImportError`. Not
one of the 25 tests could catch it, because they all imported the submodule
directly — which is what an author does and not what a consumer does.

**The rule:** a module is `integrated` when a non-test module imports it. Until
then it is `built`, and the two must be recorded as different states. §2's table
records the consumer, not just the state, for exactly this reason.

**The rule has since been applied, and it moved one module and not the other.**
At `93a175c`, `mastery/` is integrated — `runtime/loop.py` imports it — and
`diagnosis/` is merged onto the branch but still called by nothing outside its
own package and tests. A single "done" column would have shown those two as the
same thing on the day they stopped being the same thing.

What the integration produced is the part worth noting: `_proficiency_of` (doc
02 §11.6) exists only because something outside the tests had to consume a
`Belief`, and it encodes a decision no test suite had forced anybody to make —
that a low-confidence estimate must reach the policy as `None` rather than as a
number. **The interface got a real question asked of it the moment it got a real
caller.**

**The corollary:** the seam is where the untested behaviour is. Two suites can
both be green while the interface between them is wrong, and neither suite is
capable of noticing — a `Protocol` drift between `Bottleneck` and
`BottleneckLike` would leave 264 tests passing. Seam tests are not extra
coverage of code that is already covered. They are the only coverage of the one
thing nothing else tests.

Two good versions now exist and are worth copying.

`tests/test_api_figure.py` parses `representations.ts` — the *other side* of the
boundary — to verify the shape map. It caught two representation names that had
been invented, on its first run.

`tests/test_seam.py` drives a real `Bottleneck` through the real policy rather
than re-testing either side, and its sharpest test asserts that `diagnosis` does
not define a **second** failure enum. That guards a failure no type checker
catches: two modules can each be internally consistent while holding rival
vocabularies for the same thing, and whichever one the caller happens to import
wins.

**A test that reads the other side of a seam is the only kind that can find a
disagreement about it.**

### 9.2 Reachability is the weak property; consequence is the strong one

`test_every_reason_code_is_reachable` asserted that every `ReasonCode` was
emitted by some branch. That is the wrong bar, and it passed for two codes that
changed nothing:

- `REPRESENTATION_WORKED_BEFORE` — measured: `a.contract == b.contract` was
  `True`. Identical decision, different explanation.
- `DIAGNOSTIC_NEEDED` — announced that evidence was needed, then produced a
  contract identical to the confident case.

A reason code whose consequence does not exist is **worse than a missing one**.
It reads as adaptation that never happened, and any later analysis asking which
reasons precede good outcomes would be attributing a difference to a decision
nobody made.

The test is now `test_every_reason_code_changes_a_decision`: for each code,
there must exist two states differing only in the condition that emits it, whose
**decisions** differ. Codes that legitimately annotate live in a named
`ANNOTATES_ONLY` set where each one has to be argued for in writing.

**The escape hatch is the part that makes this work.** `READY_FOR_TRANSFER` sits
in that set today labelled *known gap, not an argument* — it does not steer and
should. A silent default would have hidden it; a list somebody has to write a
sentence into makes the outstanding item legible.

Generalise past reason codes: **anything that enumerates should be checked for
consequence, not presence.** `HypothesisKind`, `MasteryState`, `EvidenceStrength`
and `ReasonCode` are all vocabularies where an unused member is an unfalsifiable
sentence with a type.
