# 04 — Policy and Tool Routing

**Status:** `policy/` is **implemented** — `learning_os/policy/select.py`.
This document describes it.
**Read with:** doc 02 §5 (`Decision`, `CandidateAction`), doc 01 §5 (`memory/`).

> **Pinned to `60b3bf4`** on `learning-os/llm`, the integration branch —
> `api domain llm memory models policy runtime verifiers`. Verified on CI's
> configuration (Python 3.12, hash-locked install): **207 tests passing**, ruff
> clean, `mypy --strict` clean over 30 files.
>
> **§5's reason-code list describes `045cbbe`**, a descendant of the pin —
> `PREREQUISITE_FIRST` was deleted there, taking the enum from ten to nine.
> Verified by enumerating the enum at that commit, not by trusting the report.
>
> `diagnosis/` is described in §9 against **`ebc4059`** on
> `learning-os/diagnosis`, which is stacked on this branch and **not yet
> integrated**. `mastery/` is **not started** — its branch is cut but carries no
> `learning_os` source.

---

## 1. What the policy layer decides

Given a learner state, a selected bottleneck skill, and a memory of what has
been tried, produce a `Decision`: a ranked set of candidate actions, one
selection, and enough recorded reasoning that the choice can be argued with
afterwards.

**It does not generate content.** It chooses what kind of thing to do. The LLM
layer produces the artefact, and the verifier checks it.

---

## 2. Candidate generation

The policy generates a `CandidateAction` for each action kind that is applicable
to the bottleneck, and **`DIAGNOSE` and `DO_NOTHING` are always among them**.

| `ActionKind` | Applicable when |
|---|---|
| `teach_by_example` | The skill is `unknown` or `developing`, and a representation not yet tried exists |
| `repair_broken_example` | The learner can trace but not construct; or a known misconception is suspected |
| `transfer_challenge` | The skill is `competent` and the claim needs independent evidence before `mastered` |
| `diagnose` | `Certainty` is `UNCERTAIN` or `CONFLICTING` — the engine does not know what is blocking them |
| `do_nothing` | The learner is progressing; interrupting costs more than it gains |

`DO_NOTHING` is not a null option. It carries a real `expected_value`, and it
wins whenever every teaching action has more `learner_friction` and
`overload_risk` than expected gain. An engine that cannot choose it will
interrupt a learner who was doing fine.

`DIAGNOSE` is how `Certainty.CONFLICTING` gets resolved. Conflicting evidence is
made **worse** by gathering more of the same kind, so the right move is a
targeted question, not another example.

---

## 3. Ranking

`CandidateAction.expected_value` is the ranking function, and it lives on the
contract rather than in this layer so the optimisation stays replaceable:

```python
gain = expected_learning_gain * probability_of_success
return gain + 0.25*diagnostic_value - 0.35*learner_friction - 0.4*overload_risk
```

Reading the weights:

- **Gain is discounted by the chance of getting it.** A high-gain action the
  learner will probably fail is not a high-value action.
- **Diagnostic value is a positive term**, so an action that teaches nothing but
  resolves uncertainty can still win. Without it the engine would never choose
  to find out.
- **Overload outweighs friction** (0.4 vs 0.35). Friction is a learner finding
  something tedious; overload is a learner unable to proceed. They are not the
  same cost.

**The ranking is not the decision.** Section 4 can veto the top-ranked action.

---

## 4. The repeat check — invariant 7

Before selecting, consult `MemoryStore.failed_strategies(skill_id)`.

If the top-ranked action is in that set, exactly two paths exist:

1. **Select the next-ranked action**, or
2. **Select it anyway and set `Decision.repeat_justification`** to a stated
   reason.

There is no third path. `repeat_justification` is a field on the contract, so
silence is not available — a repeat with no recorded reason cannot be
constructed as an explainable decision.

Valid justifications are narrow:

- The diagnosis changed — the strategy failed against a different understanding
  of the problem
- The context changed — a prerequisite has since been established
- The failure was judged not to be caused by the strategy (interruption, a
  misread prompt)

"The learner should try again" is not a justification. It is a restatement.

Remember that `failed_strategies` already excludes anything that also succeeded
(doc 01 §5), so this check does not fire on a strategy with a mixed record.

### Exclusion is by MECHANISM, not by `ActionKind`

This was a bug before it was a design, and the failure is worth keeping.

Four `CONCEPT_GAP` strategies share the action `TEACH_BY_EXAMPLE`. Keying
exclusion on the action therefore **burned all four on a single failure**, and
the fallback chain declared itself exhausted after one attempt — the engine gave
up on a skill it had barely tried.

`MemoryStore.failed_mechanisms(skill_id)` is the fix. It shares its
implementation (`_burned`) with `failed_strategies`, so the
failed-and-never-succeeded asymmetry from doc 01 §5 is written once and applies
to both. A mechanism that has also worked is not burned.

### Repeats hide in three places

`MemoryStore.is_repeat()` checks mechanism, example signature, and text
similarity. The policy must call it against the *generated artefact*, not just
the action kind — choosing `teach_by_example` twice with a genuinely different
example is not a repeat, and choosing it twice with the same example is, even
though the `ActionKind` alone cannot tell them apart.

### The misconception override intersects, it does not match

`misconception_live` fires on the **intersection** of the knowledge graph's
catalogue with what the learner is actually estimated to hold.

Firing on the catalogue alone was the original bug: every skill with any
catalogued misconception became a misconception repair for every learner, so
**all ten diagnoses collapsed to one** and the policy produced identical
teaching for materially different learner states. A diagnosis that returns the
same answer for everyone is not a diagnosis.

---

## 5. Constructing the `Decision`

```python
Decision(
    decision_id=...,
    target_skill=bottleneck,          # invariant 1 — required
    hypotheses=(...),                 # competing explanations, with probabilities
    candidate_actions=(...),          # min_length=1, ALL considered options
    selected=...,                     # must be one of candidate_actions
    expected_evidence=...,            # invariant 2 — chosen BEFORE acting
    confidence=...,
    certainty=...,
    reason_codes=(...),               # min_length=1
    repeat_justification=None,        # or a stated reason — §4
)
```

Two things the validators will not let you skip:

- `selected` must be in `candidate_actions`, or the decision is not replayable.
- `expected_evidence` is set now, not after seeing the outcome. Choosing the
  success criterion afterwards is how every intervention comes to look
  successful.

**Every candidate is recorded, not just the winner.** Replaying a bad decision
means seeing what it was chosen over; a selection with no alternatives in the
log is unfalsifiable.

### `reason_codes` — the nine in `policy/select.py`

Machine-readable, stable, enumerated. They make a population of decisions
queryable rather than merely readable.

```
diagnostic_needed              evidence_already_sufficient
misconception_live             avoided_failed_strategy
representation_worked_before   first_attempt
ready_for_transfer             strategies_exhausted
decomposed_for_load
```

**Every one corresponds to a branch the selector actually takes** — and as of
`045cbbe` that sentence is enforced rather than asserted. It was not true when
this document first made the claim.

#### `prerequisite_first`, and the claim that was wrong

This list held ten codes until `045cbbe`. `PREREQUISITE_FIRST` was **defined and
never emitted** — no branch produced it. This document nonetheless stated that
every code corresponded to a real branch, which was an unverified claim of mine
about someone else's module, and it was false.

It was **deleted rather than implemented**, and that is the right call: choosing
a prerequisite over the target is the *bottleneck engine's* decision (§9.6),
taken before the policy is called. A policy explaining another layer's decision
is how two layers end up disagreeing about what happened.

The general fix outlives the instance. `test_every_reason_code_is_reachable`
drives every emitting branch and asserts the union of what was emitted covers
the enum. Enumerating rather than spot-checking is the point: a test naming the
codes it expects would pass on the day an eleventh was added and never emitted,
which is exactly how this one survived ten other tests. Mutation-checked —
re-adding the dead code fails the test by name.

**A vocabulary entry no branch produces is an unfalsifiable sentence with a
type.** Look for the same shape anywhere else something enumerates.

An earlier draft of this document proposed eight codes of my own. They were a
specification written before the module existed; these are the description.
Where the two differ, these replace them — do not reconcile the lists.

---

## 6. Tool routing

Tools are resolved by the dotted prefix of the `skill_id` (doc 03 §6). Three
rules:

**A tool is chosen by what it can establish, not by what it can produce.** The
question is "what would settle this?", not "what is available?".

**A missing tool is `UNSUPPORTED`, never a substitute.** Falling back to a
general checker produces a confident result from a component with no competence
in that domain — invariant 11's precise failure.

**Every tool result carries provenance.** `ToolResult.source` distinguishes
`execution`, `web`, `calculation`, `memory`, `canonical` and `inference`. These
must never be merged: canonical knowledge, retrieved evidence, learner-provided
information and model inference have different trust, and a result three layers
deep with no source cannot be told from a guess.

### Tool permissions

Which tools a policy may invoke is **standing configuration**, not a runtime
judgement. Per doc 05 §8, a tool-permission rule may not change automatically
from a learner outcome — it goes through the `EvaluationStatus` machine like any
other policy change.

---

## 7. What the policy layer must never do

- **Update production policy.** It writes a `PolicyUpdate` at `OBSERVED` and
  stops. Doc 02 §6.
- **Claim mastery.** It requests evidence; `SkillEstimate.can_claim_mastery()`
  decides.
- **Let self-report win.** `EvidenceStrength.SELF_REPORT` ranks last and
  `.is_objective` is `False`. A learner saying "I get it now" may lower
  `diagnostic_value`; it may not raise an estimate on its own (invariant 8).
- **Emit an action with no target skill** (invariant 1) **or no expected
  evidence** (invariant 2). Both are required fields; this is a reminder that
  the requirement is meaningful, not incidental.

---

## 8. Testing

- `DO_NOTHING` must win at least one constructed scenario. If no test produces
  it, the engine cannot choose it in practice and the action is decorative.
- `DIAGNOSE` must win under `Certainty.CONFLICTING`.
- A top-ranked action in `failed_strategies` must either be replaced or carry a
  `repeat_justification` — assert both branches.
- A `Decision` whose `selected` is not among `candidate_actions` must raise.
- Ranking must be deterministic for identical input. A policy that reorders
  between runs cannot be replayed, and invariant 12 is the whole point.

---

## 9. `diagnosis/bottleneck.py` — choosing what to work on

> Described against **`ebc4059`** on `learning-os/diagnosis`, stacked above this
> document's pin and **not yet integrated into `learning-os/llm`**. Integration
> has been probed and works: nine modules, **264 tests**, ruff clean,
> `mypy --strict` clean over 36 files. Two defects found in that probe are
> recorded in §9.8 as reported-and-open.

The policy decides *what to do*. This decides *what to do it about*, and it runs
first. A perfect intervention aimed at the wrong subskill is a wasted turn the
learner pays for.

The measured end-to-end case, from the integration probe:

```
learner: trace_calls 0.9 | identify_base_case 0.2 | write_recursive_function 0.4
target : write_recursive_function
  -> bottleneck: identify_base_case | confidence 0.8 | needs_diagnostic False
  -> policy   : worked_example, reasons [evidence_already_sufficient, first_attempt]
  -> lesson   : python-recursion-identify-base-case, 3 blocks / 2 relations
```

The bottleneck is a **prerequisite** — not the named target, and not merely the
lowest number on the board. That is the whole claim the module exists to make.

### 9.1 Three floors, applied before anything is ranked

```python
MAX_TARGETED_DIAGNOSTICS = 2   # past this a diagnostic stops feeling like
                               # learning and starts feeling like a test
SUFFICIENT_CONFIDENCE = 0.55   # below this an estimate is not safe to act on alone
COMPETENT_ENOUGH = 0.8         # at or above this, not a bottleneck whatever else
                               # is true
```

`COMPETENT_ENOUGH` is the one that is easy to leave out and the one that matters
most. Without a floor, "the weakest available skill" **always returns
something** — and an engine that always finds a problem will always teach one.
The floor is what lets the system conclude that nothing needs fixing, which is
the state `DO_NOTHING` (§3) exists to serve.

`SUFFICIENT_CONFIDENCE` is documented in the source with the failure on **each**
side: lower and the engine commits off one lucky answer; higher and it
interrogates learners it already knows enough about. That is the right way to
write a threshold — it makes the number recalibratable against a real cohort
instead of arguable.

### 9.2 Five factors, multiplied — not summed

| Factor | Answers | Shape |
|---|---|---|
| `need(subskill)` | How much leans on this? | `subskill.criticality` |
| `weakness(estimate)` | How far below mastery? | `1.0 - estimate` |
| `causal_relevance(graph, target, candidate)` | Could failing here explain failing there? | `1 / (1 + distance)` |
| `evidence_confidence(estimate)` | How much can the estimate be trusted? | `confidence * (0.6*volume + 0.4*variety)` |
| `recency(memory, skill_id)` | How recently did this go wrong? | `0.5 + 0.5*(bad/recent)` |

**Multiplication is the design decision, and it is deliberate.** Any factor at
zero zeroes the result: an irrelevant skill, or one with no evidence, is not a
bottleneck no matter how good the other factors look. A weighted sum would let
three strong factors carry one that is disqualifying — which is precisely the
failure mode of a scoring blob.

Each factor is a separate function with its own test, so **a wrong diagnosis
traces to the factor that produced it.** The module's own docstring calls the
heuristic replaceable; keeping the factors separable is what makes replacing one
of them cheap.

`evidence_confidence` weights volume at 0.6 and variety at 0.4 — it reads
`evidence_diversity`, not just `evidence_count`, for the reason doc 02 §3 gives:
ten identical multiple-choice answers are not ten observations.

### 9.3 `SELF_REPORT_WEIGHT = 1.25` does not contradict invariant 8

It looks like it should. It does not, and the distinction is worth stating
precisely because a reader will otherwise reach for a bug report.

Invariant 8 forbids self-report **raising an estimate**. A learner saying "I
understand recursion now" must not move their skill estimate.

`SELF_REPORT_WEIGHT` is a multiplier on the **selection score**, not on the
estimate. A learner saying "I'm stuck on base cases" is genuine information
about *where to look*. The constant's own comment states the bound: large enough
to break a tie between two similar candidates, *far too small to lift a
well-evidenced strong skill over a well-evidenced weak one*.

The test case is the one to keep in mind: a learner says "graphs confuse me",
the evidence says graph-*reading* is strong and graph-*interpretation* is weak.
A 1.25 boost that still loses to the evidence is doing exactly what is wanted —
**self-report is evidence, not truth.**

*Which skill to work on* and *how good the learner is at it* are different
questions. Self-report is admissible on the first and inadmissible on its own
for the second.

### 9.4 Disagreement with the learner is written down

`Bottleneck.contradicting_evidence` is not decoration. When the learner names a
skill and the engine picks a different one, the disagreement is recorded with
the self-reported skill's actual estimate and confidence.

The reasoning in the source is the correct one: a diagnosis listing only what
agrees with it is an argument, not an assessment — and overruling silently is
what makes a considered call indistinguishable from a bug six weeks later. This
is the audit surface for §9.3. Without it, invariant 8 compliance would be
unverifiable after the fact.

### 9.5 Two structural locks in the types

**An uncertain diagnosis must ask, not assert.** `Bottleneck` carries a
validator: confidence below `SUFFICIENT_CONFIDENCE` with `needs_diagnostic`
false raises. A confident-looking diagnosis built on thin evidence is the worst
output this module can produce, so the two are tied together in the type rather
than left to a caller's discipline.

**`DiagnosticBudget` is frozen.** `spend()` returns a *new* budget the caller has
to carry, rather than decrementing a counter. A mutable counter can be reset by
anything holding a reference; this cannot, so the ceiling stops being advisory.
Same shape as `Event` being append-only (doc 05 §3).

### 9.6 Ranking, determinism, and the honest `None`

Candidates are the target **plus its prerequisites only**. Relevance is applied
*before* ranking rather than as a tiebreak afterwards — nothing outside that set
can be the blocker, so nothing outside it is scored.

The sort key is `(-score, skill_id)`. The `skill_id` tiebreak is load-bearing:
two equal scores must not depend on dict ordering, or a replayed decision can
reach a different bottleneck than the original. That is invariant 12 reaching
down into a sort key.

`select_bottleneck` returns `None` when the evidence will not support a
diagnosis, and **the policy layer must treat that as a real answer**: no
diagnosis means gather more, never "nothing is wrong". Note the asymmetry with
§9.1 — a learner above `COMPETENT_ENOUGH` also yields `None`, so the caller
distinguishes the two by the learner state, not by the return value.

### 9.7 Hypotheses are plural on purpose

`_hypotheses()` emits competing explanations: `MISCONCEPTION` at 0.4 when the
subskill has any, `PREREQUISITE_GAP` at 0.3 when it has prerequisites, and
always one derived from the subskill's `CognitiveOperation` at 0.3.

The point is **not to be right first time.** It is to hold more than one
candidate so the next interaction can be chosen to *tell them apart*, rather
than to confirm the first guess. That is what makes `ActionKind.DIAGNOSE` a real
move rather than a stall.

`Hypothesis.probability` is explicitly not a belief the system defends — it is a
ranking device. Worth saying, because the values do not sum to 1 unless both
conditional hypotheses fire, and a reader expecting a distribution would file
that as a bug.

`HypothesisKind` is a **closed** set of ten, for the same reason the learner
model's signals are closed (doc 05 §1): an open one accumulates prose, and prose
about a learner becomes a label. Every member names a fault in the *learning*,
never in the person.

### 9.8 Open defects — reported, not yet fixed

| # | Defect | Consequence |
|---|---|---|
| 1 | `diagnosis/__init__.py` is **0 bytes** | `from learning_os.diagnosis import select_bottleneck` raises `ImportError`; consumers must know the internal file layout. Every other module exports through its `__init__`. `bottleneck.py` does define `__all__` — the gap is only the package door. |
| 2 | **Nothing tests the seam** | 25 tests cover `diagnosis`, 240 cover everything else, zero cover both. A Protocol drift between `Bottleneck` and `BottleneckLike` would leave both suites green. |
| 3 | `_hypotheses(graph, ...)` never reads `graph` | Found while writing this section. Harmless today; it is the same shape as a reason code no branch emits — a parameter that looks like a dependency and is not. Either use it or drop it. |

Defect 2 is the one to fix first. Defects of that class are invisible to both
test suites by construction, which is the property that makes them survive.
