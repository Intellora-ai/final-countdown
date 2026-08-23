# 04 — Policy and Tool Routing

**Status:** `policy/` is not yet written. This document specifies it.
**Read with:** doc 02 §5 (`Decision`, `CandidateAction`), doc 01 §5 (`memory/`).

Where this describes `diagnosis/` or `mastery/`, it is **provisional** —
those modules are being built concurrently and their interfaces are unsettled.

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

### Repeats hide in three places

`MemoryStore.is_repeat()` checks mechanism, example signature, and text
similarity. The policy must call it against the *generated artefact*, not just
the action kind — choosing `teach_by_example` twice with a genuinely different
example is not a repeat, and choosing it twice with the same example is, even
though the `ActionKind` alone cannot tell them apart.

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

### `reason_codes`

Machine-readable, stable, and enumerated — not prose. They are what makes a
population of decisions queryable ("how often did we pick `transfer_challenge`
because `certainty=CONFLICTING`?"). Suggested initial set:

```
bottleneck_is_prerequisite      misconception_suspected
representation_not_yet_tried    certainty_conflicting
mastery_needs_independent       overload_risk_high
strategy_previously_failed      learner_progressing
```

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
