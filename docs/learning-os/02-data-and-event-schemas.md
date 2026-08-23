# 02 — Data and Event Schemas

**Status:** contracts implemented and frozen.
**Source of truth:** `learning-os/src/learning_os/models/contracts.py`.
**Contract version:** `CONTRACT_VERSION = "1.0.0"`.

This document describes the six contracts as they exist at the pinned commit
above. Where this document and that commit disagree, the commit is right and
this document is a bug. Naming the commit is what makes that sentence
checkable — "the code" was five different commits when this was written.

> **Pinned to `15aabe8`** on `learning-os/llm`, the integration branch —
> `domain llm memory models policy runtime verifiers`. Verified on CI's
> configuration (Python 3.12, hash-locked install): **181 tests passing**, ruff
> clean, `mypy --strict` clean over 27 files.
>
> `diagnosis/` is described against **`ebc4059`** on `learning-os/diagnosis`,
> which is stacked on this branch and **not yet integrated**. `mastery/` is
> **not started** — its branch is cut but carries no `learning_os` source.

---

## 0. Why these are frozen before the engine exists

The value of this system is that a bad decision can be explained afterwards. An
explanation is only possible if the decision, the evidence under it, and the
state it changed were recorded in a shape that cannot drift. A dict that grows a
key in one module and loses it in another destroys replay silently — the log
still parses, it just stops answering the question.

Every boundary in the engine speaks one of these six types. Nothing crosses a
layer as a bare dict.

### The base class

All six inherit `_Frozen`:

```python
model_config = ConfigDict(frozen=True, extra="forbid", strict=True)
```

`extra="forbid"` is the load-bearing setting, not `frozen`. The failure it
prevents: a caller writes `evidence_count=3` where the field is `evidence_ids`.
With extras allowed the object constructs, the real field keeps its default, and
the mistake surfaces later as a mastery estimate computed from nothing.

`strict=True` means no coercion. `"0.8"` is not `0.8`.

### Shared vocabulary

| Name | Definition | Why |
|---|---|---|
| `SkillId` | `str`, pattern `^[a-z0-9]+(\.[a-z0-9_]+)+$`, ≤120 | `domain.concept.subskill`. Dotted so the graph is legible in a raw log. |
| `MisconceptionId` | same pattern | A **reference** into the knowledge model. See §7. |
| `Confidence` | `float` in `[0,1]` | |
| `Estimate` | `float` in `[0,1]` | |

Timestamps come from `_now()`, which returns timezone-aware UTC. A naive
datetime in an event log sorts backwards across machines in different zones, and
a replay then rebuilds a decision from state that did not exist yet. `Event`
re-checks this in `_timestamp_is_aware`.

---

## 1. Contract 1 — `Event`

One immutable thing that happened. Append-only; nothing may edit an event after
it is written. That is what makes replay meaningful, and why the model is frozen
rather than conventionally-not-mutated.

```python
class Event(_Frozen):
    contract_version: str = CONTRACT_VERSION
    event_id: str                      # 1..64
    event_type: EventType
    timestamp: datetime                # tz-aware, default _now()
    learner_id: str                    # 1..64
    session_id: str                    # 1..64
    situation_state_version: int       # >= 0
    learner_state_version: int         # >= 0
    knowledge_version: str             # 1..64
    skill_id: SkillId | None = None
    payload: dict[str, str | int | float | bool | None] = {}
```

`EventType`: `student_message`, `task_started`, `response_submitted`,
`hint_used`, `tool_called`, `intervention_started`, `intervention_completed`,
`concept_switched`, `session_ended`.

The three version fields exist so replay can rebuild the inputs a decision
*saw*, not the state as it looks now. That is the difference between explaining
a past decision and re-deciding it with hindsight.

`payload` is deliberately a flat scalar map. Nested free-form structure here
would become the place people smuggle in state that belongs in a typed field.

---

## 2. Contract 5 — `Evidence`

What one interaction demonstrated. **Not a correct/wrong flag**, and that is the
point: a response can be right by guessing, by recognition, by memorisation, or
because the wording was familiar; and wrong through a slip on a concept the
learner holds perfectly well.

```python
class Evidence(_Frozen):
    contract_version: str
    evidence_id: str                   # 1..64
    event_id: str                      # 1..64
    skill_id: SkillId
    strength: EvidenceStrength
    observed_performance: float        # [0,1]
    task_difficulty: float             # [0,1]
    task_reliability: float            # [0,1]
    independence: float                # [0,1]  1.0 = unaided
    hint_factor: float = 0.0           # [0,1]
    context_novelty: float = 0.0       # [0,1]  1.0 = never-seen context
    response_time_ms: int              # >= 0
    representation: str                # 1..64
    attempt_number: int                # >= 1
    error_type: str | None = None      # <= 64
```

### `EvidenceStrength`, strongest first

`independent_novel_transfer`, `independent_application`,
`repair_or_construction`, `own_word_explanation`, `prediction`, `recall`,
`recognition`, `answer_after_hint`, `answer_after_explanation`, `self_report`.

Two derived members:

- `.rank` → `int`, 0 is strongest. Ordering is exposed because invariant 8 is
  only checkable if self-report and objective evidence are comparable.
- `.is_objective` → `bool`. `SELF_REPORT` is the only non-objective kind.

### `Evidence.weight`

```python
task_reliability * independence * (1.0 - hint_factor)
```

Deliberately **not** the estimator. The learner-state interface must survive
replacing the estimator with BKT or IRT; this is the part every estimator
agrees on — reliable, independent, novel evidence counts for more.

---

## 3. Contract 2 — Learner state

### `SkillEstimate`

An estimate with its own uncertainty. Never a fact. Storing
`understands_x = 0.84` as truth is forbidden: 0.84 from eight varied
demonstrations and 0.84 from one lucky guess are the same number and completely
different situations.

```python
class SkillEstimate(_Frozen):
    skill_id: SkillId
    estimate: Estimate
    confidence: Confidence
    evidence_count: int                # >= 0
    evidence_diversity: int            # >= 0  distinct KINDS of evidence
    evidence_ids: tuple[str, ...] = ()
    last_updated: datetime
    state: Literal["unknown", "developing", "competent", "mastered"] = "unknown"
```

`evidence_diversity` is separate from `evidence_count` because ten identical
multiple-choice answers are not ten independent observations, and without the
field the two are indistinguishable in state.

**Validator `_updates_cite_evidence`** (invariant 3):

- `state != "unknown"` with empty `evidence_ids` → `ValueError`
- `evidence_count > 0` with empty `evidence_ids` → `ValueError`

**Method `can_claim_mastery(*, min_independent: int = 2) -> bool`** (invariant 10):

```python
state == "mastered"
and evidence_count     >= min_independent
and evidence_diversity >= min_independent
and confidence         >= 0.7
```

A floor, not a formula. It rules out calling something mastered off one answer
given immediately after being shown the answer.

### `ObservationalHypothesis`

**This type exists to make a diagnosis unrepresentable.** See §7.

```python
class ObservationalHypothesis(_Frozen):
    signal: Literal[
        "possible_confusion", "possible_disengagement",
        "possible_overload", "possible_guessing", "high_friction",
    ]
    confidence: Confidence
    observed_at: datetime
    expires_after_session: bool = True
    evidence_ids: tuple[str, ...] = ()
```

Validator `_signals_cite_evidence`: empty `evidence_ids` → `ValueError`
("an observational signal with no evidence is an opinion").

### `LearnerState`

```python
class LearnerState(_Frozen):
    contract_version: str
    learner_id: str                                # 1..64
    version: int                                   # >= 0
    skills: dict[str, SkillEstimate] = {}
    misconceptions: tuple[MisconceptionId, ...] = ()
    prerequisite_gaps: tuple[SkillId, ...] = ()
    strategy_stats: dict[str, tuple[int, int]] = {}   # strategy -> (attempts, successes)
    signals: tuple[ObservationalHypothesis, ...] = ()
    current_bottleneck: SkillId | None = None
    updated_at: datetime
```

**There is no free-text field on this model.** That is a requirement, not an
oversight — see §7.

---

## 4. Contract 4 — `ToolResult`

```python
class ToolResult(_Frozen):
    contract_version: str
    tool: str                          # 1..64
    tool_input: str                    # <= 4000
    result: str                        # <= 20000
    source: Literal["execution", "web", "calculation",
                    "memory", "canonical", "inference"]
    retrieved_at: datetime
    verification: Verifiability
    confidence: Confidence
    limitations: tuple[str, ...] = ()
```

`source` is what keeps canonical knowledge, retrieved evidence,
learner-provided information and inference from merging. A result with no
source cannot be told from a guess once it is three layers deep in a decision.

`limitations` records what the result does **not** establish. A passing test
proves the cases it covers and nothing else; the engine reads this before
letting a tool result support a mastery claim.

**Validator `_unsupported_cannot_be_confident`** (invariant 11):
`verification is UNSUPPORTED and confidence > 0.0` → `ValueError`.

---

## 5. Contract 3 — `Decision`

### `ActionKind`

```
teach_by_example  repair_broken_example  transfer_challenge  diagnose  do_nothing
```

Five members, not three. `DIAGNOSE` and `DO_NOTHING` are first-class because an
engine whose action set contains only teaching actions will always teach —
including when the right move was to ask a question, or to leave alone a learner
who already understood.

### `CandidateAction`

```python
kind: ActionKind
representation: str                    # 1..64
expected_learning_gain: float          # [0,1]
probability_of_success: Confidence
expected_cost_seconds: float           # >= 0
diagnostic_value: float = 0.0          # [0,1]
learner_friction: float = 0.0          # [0,1]
overload_risk: float = 0.0             # [0,1]
```

```python
@property
def expected_value(self) -> float:
    gain = expected_learning_gain * probability_of_success
    return gain + 0.25*diagnostic_value - 0.35*learner_friction - 0.4*overload_risk
```

One honest expression rather than ranking spread through the policy layer, so
the optimisation algorithm stays replaceable.

### `Hypothesis`

```python
label: str                             # 1..120
probability: Confidence
supporting_evidence_ids: tuple[str, ...] = ()
contradicting_evidence_ids: tuple[str, ...] = ()
```

### `Decision`

```python
contract_version: str
decision_id: str                       # 1..64
target_skill: SkillId                  # required — invariant 1
hypotheses: tuple[Hypothesis, ...] = ()
candidate_actions: tuple[CandidateAction, ...]   # min_length=1
selected: CandidateAction
expected_evidence: EvidenceStrength    # required — invariant 2
confidence: Confidence
certainty: Certainty
reason_codes: tuple[str, ...]          # min_length=1
repeat_justification: str | None = None          # invariant 7
```

Every candidate is recorded, not just the winner. Replaying a bad decision means
seeing what it was chosen **over**; a selection with no alternatives in the log
is unfalsifiable.

**Validator `_selected_was_a_candidate`**: `selected not in candidate_actions`
→ `ValueError`.

`expected_evidence` is set **before** acting. Choosing the success criterion
after seeing the outcome is how every intervention comes to look successful.

### `Certainty`

`known`, `likely`, `uncertain`, `unknown`, `conflicting`.

`CONFLICTING` is separate from `UNCERTAIN` deliberately: uncertain means thin
evidence and is fixed by gathering more; conflicting means the evidence
disagrees with itself and is made **worse** by gathering more of the same. They
call for different next actions, so they cannot share a name.

---

## 6. Contract 6 — `PolicyUpdate`, and the production safety control

### `EvaluationStatus` — the rejected loop and its replacement

The naive research loop is **rejected for production**:

```
policy → action → outcome → policy update          ← REJECTED
```

One unusual learner response could make the system worse for everyone. The
replacement, modelled as states so a change cannot skip one silently:

```
interaction → outcome event → offline policy evaluation → benchmark replay
   → safety and quality gates → candidate policy version → human approval
   → canary deployment → monitored rollout
```

```
observed → offline_evaluated → benchmark_replayed → gates_passed
        → awaiting_human_approval → approved → canary → live
```

`_ALLOWED_TRANSITIONS` is the full table. Two properties are worth stating
explicitly because they are the whole point:

- **There is no transition from `observed` to `live`.** Every intermediate state
  is a place a gate or a human can say no.
- **`rejected` is reachable from every state including `LIVE`.** A rollout that
  cannot be stopped is not a canary. `REJECTED` is terminal (`frozenset()`).

```python
def may_transition(current: EvaluationStatus, proposed: EvaluationStatus) -> bool:
    return proposed in _ALLOWED_TRANSITIONS[current]
```

### `PolicyUpdate`

A **candidate**. Constructing one changes nothing in production; it records that
an intervention happened and what it produced.

```python
contract_version: str
policy_version: str                    # 1..64
decision_id: str                       # 1..64
state_before: LearnerState
action: CandidateAction
predicted_outcome: float               # [0,1]
actual_outcome: float                  # [0,1]
learning_gain: float
cost_seconds: float                    # >= 0
recovered: bool
evaluation_status: EvaluationStatus = OBSERVED
candidate_change: str | None = None    # <= 2000
```

`prediction_error` → `actual_outcome - predicted_outcome`. This is the training
signal, recorded per decision: an outcome with no prediction beside it only ever
supports a correlation.

**Validator `_live_policy_was_approved`** (invariant 9): constructing with
`evaluation_status in {LIVE, CANARY}` → `ValueError`. Reaching those states
requires walking the machine.

---

## 7. The no-diagnosis constraint — a schema constraint, not a policy footnote

The system may be used by children. It may record that a learner abandoned three
tasks in a row and adapt what it offers next. It may **never** convert that into
"the student has ADHD", "is lazy", or "is emotionally unstable".

Writing that in a document is not enough — somebody eventually adds a `traits`
dict "just for the recommender". It took **two locks**, and the second is the one
that matters.

**Lock 1 — a closed vocabulary.** `ObservationalHypothesis.signal` is a
`Literal` of five observable, uncertain, operational signals. Each instance
carries `confidence`, `evidence_ids` (validated non-empty) and
`expires_after_session=True`. A signal that cannot outlive its session cannot
harden into a label.

**Lock 2 — no free text anywhere on the learner model.** This is the one that
actually closes the hole. `LearnerState.misconceptions` began as
`tuple[str, ...]`, and `misconceptions=["probably has ADHD"]` validates
perfectly against `str`. A closed enum beside one free string is not closed at
all: the day someone needs to record something the enum lacks, they write it
into the nearest field that accepts it.

`MisconceptionId` is therefore pattern-constrained. Prose does not match
`^[a-z0-9]+(\.[a-z0-9_]+)+$`, so a misconception must already exist in the
reviewed knowledge model before it can be attached to a learner.

**Implementation rule for anyone extending `LearnerState`:** adding any
unconstrained `str` field to it, or to anything it contains, reopens this hole.
New descriptive fields must be an enum, or an id into a reviewed artefact.

There is a test asserting `"the student is lazy and probably has ADHD"` is
refused.

---

## 8. Replayability — `DecisionEvent`

Invariant 12. One immutable row from which a decision can be rebuilt entirely.

```python
contract_version: str
event_id: str                          # 1..64
event_type: Literal["instruction_intervention"]
timestamp: datetime
learner_id: str                        # 1..64
situation_state_version: int           # >= 0
learner_state_version: int             # >= 0
knowledge_version: str                 # 1..64
retrieved_memory_ids: tuple[str, ...] = ()
decision: Decision
tool_results: tuple[ToolResult, ...] = ()
generated_output_hash: str | None = None    # <= 128
verification: Verifiability = UNSUPPORTED
actual_outcome: float | None = None    # [0,1]
post_state_version: int | None = None  # >= 0
```

| Field | Why replay needs it |
|---|---|
| three `*_version` fields | rebuild the exact inputs, not today's state |
| `retrieved_memory_ids` | which memories were in scope; a different retrieval is a different decision |
| `decision.candidate_actions` | what it was chosen over |
| `decision.reason_codes` | why, in machine-readable form |
| `tool_results` | what external tools asserted, with provenance |
| `generated_output_hash` | identify the exact output without storing learner text in the decision log |
| `verification` | whether the output was checkable at all |
| `actual_outcome`, `post_state_version` | what happened and what the state became |

**Validator `_state_moves_forward`**: `post_state_version < learner_state_version`
→ `ValueError`. The log would replay out of order.

---

## 9. The twelve invariants, and where each is enforced

| # | Invariant | Enforced by | Location |
|---|---|---|---|
| 1 | Every important action has a target skill | type | `Decision.target_skill` (required `SkillId`) |
| 2 | Every action specifies expected evidence | type | `Decision.expected_evidence` (required) |
| 3 | Every state update references evidence | validator | `SkillEstimate._updates_cite_evidence` |
| 4 | Every memory has future decision utility | architectural | memory layer — see doc 01; `MemoryStore` retrieval is relevance-scored, nothing is stored "just in case" |
| 5 | Every tool result has provenance and timestamp | type | `ToolResult.source`, `ToolResult.retrieved_at` (both required) |
| 6 | The LLM cannot mutate the canonical knowledge model | architectural | `domain/knowledge.py` models are frozen; the LLM layer is never handed a writable reference |
| 7 | A failed strategy cannot repeat without a reason | type + memory | `Decision.repeat_justification`; `MemoryStore.failed_strategies()` / `.is_repeat()` |
| 8 | Self-report cannot override objective evidence automatically | type | `EvidenceStrength.SELF_REPORT` is last in `_EVIDENCE_ORDER`; `.rank` and `.is_objective` make it comparable |
| 9 | Production policy cannot update without evaluation and versioning | validator + state machine | `PolicyUpdate._live_policy_was_approved`, `_ALLOWED_TRANSITIONS`, `may_transition()` |
| 10 | A mastery claim requires appropriate independent evidence | method | `SkillEstimate.can_claim_mastery()` |
| 11 | Unsupported domains produce uncertainty, not fabricated confidence | validator | `ToolResult._unsupported_cannot_be_confident`; `Verifiability.UNSUPPORTED` |
| 12 | Every important decision is replayable from the event log | type | `DecisionEvent` carries every input and output |

Invariants 4, 6 and 9 were described in the contracts docstring as
"architectural rather than structural". 9 has since acquired a type-level
enforcement as well (the constructor validator), so it is listed above under
both. 4 and 6 remain architectural: no type prevents someone passing a mutable
copy of the knowledge graph to a model, only the module boundary does. **If you
add a code path that hands knowledge to the LLM layer, invariant 6 becomes your
responsibility at that call site.**

---

## 10. Verification state

Measured independently against the tree, not quoted from the implementing
session:

| Check | Result |
|---|---|
| `pytest tests -q` | **181 tests, all passing** |
| `ruff check src tests` | clean |
| `mypy --strict src/learning_os` | clean on src and tests |

The single failure is `test_verifier.py::test_learner_code_cannot_import_the_engine`,
a real sandbox defect described in doc 03 §4. It is not a contract failure —
every validator in this document is exercised and green.

`memory/store.py` is implemented and stable (`MemoryStore`, `Attempt`,
`Outcome`, `similarity()`, `SAME_EXPLANATION`, `failed_strategies()`,
`succeeded_with()`, `is_repeat()`, `relevant()`). It supplies invariants 4
and 7; described in doc 01 §5.
