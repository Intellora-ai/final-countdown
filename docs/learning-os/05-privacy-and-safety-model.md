# 05 — Privacy and Safety Model

**This system may be used by children.** Every rule below is written on that
assumption. Where a rule could be enforced by a schema rather than a policy, it
is, and the schema is named.

**Read with:** doc 02 §7 (the no-diagnosis constraint as implemented), doc 02 §8
(replay).

> **Pinned to `2e0832d`** on `learning-os/llm`, the integration branch —
> `api domain llm mastery memory models policy runtime verifiers`. **262 tests
> passing**, ruff clean, `mypy --strict` clean, as measured by session
> `final-countdown-2d` on CI's configuration (Python 3.12, hash-locked install).
> Counted independently here: 238 `def test_` across 11 files, the difference
> being parametrised cases.
>
> `diagnosis/` is described against **`ebc4059`** on `learning-os/diagnosis`,
> stacked above this pin and **not yet integrated**. `mastery/` is integrated
> into the branch and **imported by nothing but its own tests** — doc 07 §9.1
> for why that is a distinct state from done.

---

## 1. The prohibition that outranks the others

The system **may** record that a learner abandoned three tasks in a row, took
90 seconds before the first keystroke, or produced the same wrong answer twice.
Those are observations about an interaction.

The system may **never** convert them into a claim about the person:

> "the student has ADHD" · "is lazy" · "is emotionally unstable" ·
> "is a slow learner" · "has poor working memory"

Interaction signals stay **uncertain operational hypotheses**. They describe a
moment, they carry a confidence, they cite the evidence that produced them, and
they expire.

This is not a guideline for whoever writes the recommender next year. It is a
schema constraint, and doc 02 §7 documents the implementation. The short form:

- **Lock 1** — `ObservationalHypothesis.signal` is a closed `Literal` of five
  values (`possible_confusion`, `possible_disengagement`, `possible_overload`,
  `possible_guessing`, `high_friction`). Each instance carries `confidence`,
  non-empty `evidence_ids`, and `expires_after_session=True`.
- **Lock 2** — there is **no free-text field anywhere on `LearnerState`**.
  `misconceptions` is `tuple[MisconceptionId, ...]`, pattern-constrained to
  `^[a-z0-9]+(\.[a-z0-9_]+)+$`, so it can only reference a misconception the
  reviewed knowledge model already defines.

Lock 2 is the one that matters. A closed enum sitting beside one free string is
not closed: the day someone needs to record something the enum lacks, they write
it into the nearest field that accepts it, and
`misconceptions=["probably has ADHD"]` validates perfectly against `str`.

**Rule for anyone extending `LearnerState`:** adding an unconstrained `str`
field to it, or to anything it contains, reopens the hole. New descriptive
fields must be an enum or an id into a reviewed artefact. There is a test
asserting `"the student is lazy and probably has ADHD"` is refused; add an
equivalent for every new field.

### Why expiry is part of the constraint

`expires_after_session=True` is not tidiness. A signal that persists across
sessions accumulates, and an accumulation of "possible_disengagement" is a label
in everything but name — the system would treat a learner having a bad Tuesday
the same way for weeks. A signal that cannot outlive the session it came from
cannot harden into a trait.

---

## 2. Rights over stored data

The engine stores an event log, a learner state, and a memory of attempts.
Everything below is a capability the system must expose, not a promise it makes
in a policy document.

| Right | What it means | Implementation note |
|---|---|---|
| **View** | A learner or guardian can see everything stored about them, in plain language | The event log is the source; render it, do not summarise it away |
| **Correct** | A wrong estimate or misattributed attempt can be challenged and fixed | See §3 — corrections are appended, never edited in place |
| **Delete** | Everything about a learner can be removed | See §4 — deletion must survive the replay requirement |
| **Retention limit** | Nothing is kept indefinitely by default | See §5 |
| **Consent** | Recording requires it; withdrawal is honoured | Consent state is itself an event |
| **Access control** | A guardian sees their child; a teacher sees their class; nobody sees more | Enforced at the API boundary, doc 01 |
| **Audit** | Every read of learner data is logged | An audit trail nobody can inspect is decoration |

### Sensitive-data separation

Identity (name, email, guardian contact, school) lives in a **separate store**
from learning data. The engine's contracts carry only `learner_id`, an opaque
identifier. Nothing in `Event`, `LearnerState`, `Evidence`, `Decision` or
`DecisionEvent` holds a name.

That separation is what makes §4 possible: identity can be destroyed while an
anonymised learning record survives for the aggregate evaluation the system
depends on.

---

## 3. Correction is append-only

A learner who says "that wasn't me, my brother used my account" is making a
claim about the record. The record does not get edited.

`Event` is frozen and append-only. A correction is a **new event** that
supersedes an earlier one, and the estimator recomputes from the corrected view.
The original stays in the log.

Editing history in place would break invariant 12: a decision replayed against
a retroactively-changed past would reconstruct something that never happened,
and would look correct while doing it. The audit trail and the correction
mechanism are the same mechanism.

**A correction event never carries free text about the learner** — same rule as
§1. It references what is wrong, not who was at fault.

---

## 4. Deletion, and its collision with replay

Two requirements pull against each other and the tension must be resolved
explicitly rather than discovered later:

- **Doc 02 §8 / invariant 12:** every decision must be replayable from the log.
- **This document:** a learner can have their data deleted.

They are reconciled by what is deleted:

| Deleted | Retained |
|---|---|
| Identity record (name, contact, school) | Anonymised event rows |
| Free-text learner submissions | `generated_output_hash` |
| The mapping `learner_id → person` | `learner_id` as an opaque token |

`DecisionEvent` already stores `generated_output_hash` rather than generated
text. That was not designed for deletion — it keeps learner prose out of the
decision log — but it is what lets a decision remain replayable in structure
after the content is gone.

**Full erasure, when required, wins.** If the applicable regime requires the
event rows themselves to go, they go, and the replay guarantee is documented as
broken for that learner rather than quietly preserved by keeping data that was
supposed to be destroyed. A system that honours deletion "except where
inconvenient" does not honour deletion.

---

## 5. Retention

Defaults, to be overridden only downward:

| Data | Default retention |
|---|---|
| `ObservationalHypothesis` | The session. `expires_after_session=True` |
| Raw learner submissions | 30 days |
| Event log (anonymised) | 12 months |
| `SkillEstimate` | While the account is active |
| Identity record | While the account is active, then deleted |
| Audit log | 12 months, and never longer than what it audits |

The last row is a constraint people get wrong: an audit log outliving the data
it describes becomes a shadow copy of deleted information.

---

## 6. Consent

Consent is an **event**, not a flag, so its history is replayable like anything
else: when it was given, by whom, for what, and when it changed.

- Recording a child's learning data requires guardian consent where the
  applicable regime demands it.
- Withdrawal stops collection immediately and triggers §4.
- Consent for *learning* is not consent for *research*, *product analytics*, or
  *model training*. Each is a separate grant, and the default for every one of
  them is no.
- **A refusal must leave the product usable.** A system that degrades into
  uselessness without optional consent is coercing, not asking.

---

## 7. Self-monitoring is operational, not self-awareness

The spec calls the system "self-monitoring". That word invites a claim this
system does not make. **The model does not introspect.** Nothing here inspects
its own reasoning or knows what it knows.

"Self-monitoring" means exactly this: **the system runs explicit validators over
its own output before that output reaches a learner, and detects violations
against them.** Nothing more.

The seven checks:

| Check | Question | Fails when |
|---|---|---|
| Pre-output validators | Does the output satisfy its structural contract? | Malformed `LessonSpec`, missing required block |
| Contradiction checker | Does this contradict what was said earlier this session? | Two incompatible definitions of one term |
| Strategy repetition checker | Has this approach already failed for this learner? | `MemoryStore.is_repeat()` fires without `repeat_justification` |
| Source checker | Does every factual claim have provenance? | A claim with `source="inference"` presented as canonical |
| Learner-state compatibility | Does this assume knowledge the learner does not have? | Uses a prerequisite whose estimate is `unknown` |
| Domain verifier | Is the content true, where truth is checkable? | `Judgement.passed == False` on generated material |
| Policy constraint checker | Does this violate a standing rule? | An action a tool permission forbids |

**The system is self-monitoring when and only when it detects a violation
against one of these explicit validators.** If a failure mode has no validator,
the system is not monitoring it, and no amount of model capability changes that.
Write it that way in every user-facing description too.

---

## 8. No production self-improvement from live data

Restating the doc 02 §6 control here because it is a **safety** property, not
just an architectural one.

The naive loop is rejected:

```
policy → action → outcome → policy update          ← REJECTED FOR PRODUCTION
```

**No production instructional policy, safety rule, mastery rule or
tool-permission rule may change automatically from a single learner outcome or
an unreviewed live interaction.**

The replacement is the `EvaluationStatus` machine, with a human in it:

```
observed → offline_evaluated → benchmark_replayed → gates_passed
        → awaiting_human_approval → approved → canary → live
```

Two properties carry the safety guarantee: there is **no `observed → live`
transition**, and **`rejected` is reachable from every state including `live`**
— a rollout that cannot be stopped is not a canary.

The child-safety reading: a system that rewrote its own teaching policy from one
learner's bad afternoon would be experimenting on children without review. The
state machine is what makes that a type error rather than a judgement call.

---

## 9. What the system must refuse to do

- Produce a confident answer in a domain it cannot verify. `UNSUPPORTED` must
  yield uncertainty (invariant 11, enforced in both `ToolResult` and
  `Judgement`).
- Claim mastery without independent evidence (invariant 10).
- Let self-report override objective evidence automatically (invariant 8).
- Store any statement about a learner's character, capacity, or clinical status
  (§1).
- Repeat a failed strategy without a recorded reason (invariant 7).
- Present generated content that failed its own verifier (§7).

---

## 10. Testing this document

A privacy model with no executable assertions is a policy document, and this
project's whole method is that a rule nobody executes is a suggestion.

- Constructing a `LearnerState` containing diagnostic prose must raise.
  The existing test uses `"the student is lazy and probably has ADHD"`.
- Every new field on `LearnerState` needs an equivalent test before it merges.
- `ObservationalHypothesis` with empty `evidence_ids` must raise.
- `may_transition(OBSERVED, LIVE)` must be `False`.
- `may_transition(LIVE, REJECTED)` must be `True`.
- A deletion request must be shown to remove the identity record while leaving
  the anonymised event log replayable — asserted, not assumed.
- Retention expiry needs a test per row of §5, driven by an injected clock
  rather than real time.
