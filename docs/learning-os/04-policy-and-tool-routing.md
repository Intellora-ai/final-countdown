# 04 — Policy and Tool Routing

**Status:** `policy/` is **implemented** — `learning_os/policy/select.py`.
This document describes it.
**Read with:** doc 02 §5 (`Decision`, `CandidateAction`), doc 01 §5 (`memory/`).

> **Pinned to `93a175c`** on `learning-os/llm`, the integration branch —
> `api diagnosis domain llm mastery memory models policy runtime verifiers`.
> `diagnosis/` merged in here; there is no longer a stacked branch to describe
> it against.
>
> **293 tests passing**, measured here:
> `PYTHONPATH=src .venv/bin/python -m pytest tests -q` on Python 3.14 with
> pydantic 2.13.4.
>
> **Integration state, checked by grep rather than assumed** (doc 07 §9.1):
> `mastery/` is **integrated** — `runtime/loop.py:42` imports it.
> `diagnosis/` is **built but not consumed**: `select_bottleneck` is called by
> its own package and its tests, and by no other module.

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

> **Merged into `learning-os/llm` at `93a175c`.** It is no longer a stacked
> branch, and `tests/test_seam.py` now covers the join.
>
> It is nonetheless **built, not integrated**, by the test in doc 07 §9.1:
> `select_bottleneck` is called by its own package and its own tests, and by no
> other module. `mastery/` crossed that line in the same window and
> `diagnosis/` has not. §9.8 tracks what closed and what did not.

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

| # | Defect | State at `93a175c` |
|---|---|---|
| 1 | `diagnosis/__init__.py` was **0 bytes**, so `from learning_os.diagnosis import select_bottleneck` raised `ImportError` | **Closed.** The `__init__` now exports (2,117 bytes). |
| 2 | **Nothing tested the seam** — two green suites, neither able to see a `Protocol` drift between `Bottleneck` and `BottleneckLike` | **Closed.** `tests/test_seam.py`, five tests. |
| 3 | `_hypotheses(graph, subskill, estimate)` never reads `graph` | **Open.** Verified at `93a175c`: no reference to `graph` in the body. |

**Defect 2 was the one to fix first and the fix is worth reading, not just
ticking.** `test_seam.py` does not re-test either side. It drives a real
`Bottleneck` into the real policy and asserts the join:

- a real bottleneck produces a real lesson end to end
- the real `Bottleneck` satisfies the `Protocol` the policy declares
- a confident diagnosis lets the policy skip the diagnostic
- every `CognitiveOperation` has a `HypothesisKind` — the exhaustiveness
  obligation that a dict-over-an-enum creates and that nothing else checks
- `diagnosis` does not define a **second** failure enum

That last one is the interesting test, because it guards a failure no type
checker catches: two modules can each be internally consistent while holding
rival vocabularies for the same thing, and whichever one the caller happens to
import wins.

**Defect 1 is worth keeping in the table now that it is closed.** Twenty-five
passing tests sat beside a package that could not be imported, because every one
of them reached past the door to the submodule. It is the cleanest evidence for
the rule in doc 07 §9.1, and deleting the row would delete the evidence.

---

## 10. Choosing the mechanism — `_STRATEGIES_FOR` and proficiency

> Describes **`93a175c`**. The table was undescribed until now, which is part of
> why three of its orderings went unexamined for as long as they did.

### 10.1 Ordered preference, not a single answer

Each `DiagnosisKind` maps to a tuple of `Strategy`, best first. Ordered rather
than singular because the first choice may already have failed for this learner,
and the fallback needs somewhere to go **that is not a paraphrase**. §45: the
next intervention must change the *mechanism*.

| Diagnosis | Mechanisms, best first |
|---|---|
| `TERM_GAP` | contrast · worked example · analogy |
| `CONCEPT_GAP` | worked example · contrast · analogy · decomposition |
| `PREREQUISITE_GAP` | prerequisite repair · decomposition |
| `MISCONCEPTION` | misconception repair · contrast |
| `CAUSAL_REASONING_FAILURE` | guided reasoning · contrast · worked example |
| `PROCEDURAL_FAILURE` | broken-example repair · worked example · guided reasoning |
| `REPRESENTATION_FAILURE` | analogy · contrast |
| `LANGUAGE_FAILURE` | analogy · worked example |
| `COGNITIVE_OVERLOAD` | decomposition · worked example |
| `TRANSFER_FAILURE` | new context · transfer challenge |

Two of these leads were reversed after review:

**`TERM_GAP` leads with contrast.** A term gap is a **boundary** problem — what
does this word include, and what does it exclude. Contrast is the mechanism for
a boundary. A worked example demonstrates a procedure and can be followed start
to finish without the term ever landing: the learner finishes it and still
cannot say what the word means.

**`LANGUAGE_FAILURE` leads with analogy.** The learner *has* the concept and
lacks the phrasing, so a worked example in the same phrasing repeats the exact
thing that did not land. An analogy restates in different terms, which is the
thing actually missing.

**One entry is still a known gap.** `REPRESENTATION_FAILURE` maps to analogy and
contrast, and **neither mechanism changes the representation**. No strategy in
the enum does. The ordering is defensible; the vocabulary is short a mechanism,
and the table is picking the least-bad neighbour without being able to say so.

### 10.2 `PROCEDURAL_FAILURE` needed a parameter, not a better ordering

`BROKEN_EXAMPLE_REPAIR` presupposes the learner knows what correct looks like.

- For a learner whose procedure is nearly right, it is the sharpest mechanism
  available.
- For a learner who never had the procedure, it asks them to find a fault in
  something they cannot read. Not a harder task — a different one, and an
  impossible one.

Those are materially different states, and §67 says materially different states
must not get the same next action. **One ordering across both is that
requirement failing quietly**, which is the dangerous kind: the policy looks
decisive while it is compromising.

The interface was the problem, not the table. `BottleneckLike` exposes
`skill_id`, `confidence`, `needs_diagnostic` and no estimate, so the policy could
not distinguish the two learners even in principle. The fix is a parameter:

```python
NEARLY_RIGHT = 0.55   # above this, treat the procedure as roughly right
```

`_reorder_for_proficiency` promotes `WORKED_EXAMPLE` to first for
`PROCEDURAL_FAILURE` below that bar, and leaves every other diagnosis untouched.

**The threshold is calibrated by what each mistake costs, not by data, and the
source says so.** Handing a broken example to somebody who never had the
procedure is impossible; handing a worked example to somebody nearly right is
merely slow. So the bar sits above the midpoint: under uncertainty, make the
cheaper mistake. That is a recalibratable statement rather than an arguable one.

**`proficiency=None` means the caller does not know, and the ordering stays as
authored.** Guessing would manufacture divergence out of absent information,
which is the failure on the other side of §67 — a policy that always diverges is
exactly as broken as one that never does, and only one of them looks broken.

A default parameter no caller passes is a dead parameter, so the runtime threads
it: `teach_once` takes `proficiency` and forwards it.

### 10.3 An override changes what is taught, not how much can be held

`_constraints_for` is variadic and takes **both** the arriving diagnosis and the
final one, applying the tighter.

A misconception override replaces the diagnosis for the purpose of choosing a
mechanism. It does not repeal a capacity limit. Before this, a learner arriving
as `COGNITIVE_OVERLOAD` who also held a live misconception silently lost
`max_blocks=1` **and** lost `DECOMPOSED_FOR_LOAD` from the record — measured at
1 block becoming 4, the maximum, with no trace that overload had ever been
diagnosed.

Overload is a capacity condition. It does not stop being true because a
misconception was also found, and a full-budget repair delivered to an
overloaded learner is the §52 failure reached by a path that looks like a
correct override.

### 10.4 `DIAGNOSE` is an action, not a label

When `bottleneck.needs_diagnostic` is true the contract now carries
`ActionKind.DIAGNOSE` and a success condition stating that the response must
**distinguish which hypothesis holds** — rather than demonstrate mastery.

The learner still experiences teaching (§29): the strategy and its wording are
unchanged. What changes is what the runtime does with the response.

This was found by strengthening the reason-code test from reachability to
consequence — see doc 07 §9.2 — and it was caught on the first run.

### 10.5 `preferred_representations`

`InstructionContract` now carries the representations that have worked for this
learner on this skill, sorted.

Sorted because a `frozenset` iterates in an order that depends on the process,
and a decision that differs between runs cannot be replayed (invariant 12). A
set with no deterministic order is a replayability bug hiding in a field that
looks like plain data.

Until this existed, `REPRESENTATION_WORKED_BEFORE` was emitted from a truthiness
check whose value was discarded, into a contract with nowhere to put it — which
made `MemoryStore.succeeded_with`'s own docstring ("read by the policy layer as
a preference") false.
