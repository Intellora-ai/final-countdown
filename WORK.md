# WORK.md — what is actually true, and what is left

Last updated: 2026-08-29

This file exists because the same wrong belief survived a whole day of work:
that the canvas could not teach because the model was weak. It could not teach
because **the product never called the code that teaches**.

---

## The one fact that reframes everything

| | Function called | Measured score |
|---|---|---|
| The measurement (`conceptProbe.test.ts`) | `authorConcept` | **5 of 6** |
| **The product** (`CanvasRoute.tsx:231`) | `authorLesson` | **0 of 6** |

`concept.ts` is imported by nothing that ships. So the product's real score is
**zero**, and no amount of model improvement changes that until it is wired.

This is a wiring problem, not a model problem, not a prompt problem, and not a
gate problem.

---

## First-principles reconstruction

### Surface (the conventional answer, and the one that wasted the day)

> "It doesn't teach because the model isn't good enough or the prompt isn't
> right. Improve those and it will teach."

Hidden analogy: *a lesson is a document the model writes, and the gate marks
it.* That framing drove every decision in this codebase.

### The assumptions, questioned

| Assumption | Why believed | If false |
|---|---|---|
| The blocker is model quality | 0/6 became 5/6 when the model got 17x bigger | The 5/6 is real but IRRELEVANT — the product calls a different function |
| A "topic" is the unit | The probe measures six topics | If the unit is a CONCEPT, "any topic" is a chain of many, and one failure anywhere breaks the topic |
| A refusal means bad teaching | The gate has 31 rules | Four of eight runs were refused by the HARNESS, not by teaching. The gate cannot tell those apart |
| 6 of 6 would mean "any" | Six subjects feels broad | A finite sample can never establish a universal |
| A doubt is a smaller lesson | Both go through `validateLesson` | A doubt has no arc, no author, and NO ACCEPTABLE REFUSAL. Different thing, same type |

### Bedrock

`[FUNDAMENTAL]`
- `CanvasRoute.tsx:231` calls `authorLesson`. `authorConcept` is imported by
  nothing that ships.
- The measured 5/6 was produced by `authorConcept`.
- Therefore the product's measured score is 0/6.
- A finite sample cannot establish a universal. Logic, not opinion.
- `TeachView.tsx:511` has no refusal branch, stated in its own comment. When the
  chain cannot answer, **zero elements render**.

`[STILL ASSUMPTION]`
- That the 6th question fails for a teaching reason. Its refusal is unread.
- That `gpt-oss-120b` holds up across many more topics than six.

### Rebuild

1. The product calls `authorLesson`; the working code is `authorConcept`.
   **The product cannot teach any topic today, regardless of model quality.**
2. The fix is one import and one call site.
3. Because a sample cannot prove a universal, **"any topic" is not achievable as
   a measurement**. It is achievable as a PROPERTY: no path returns nothing.
4. The doubt path has exactly such a path. **"Any doubt answered" is false by
   construction**, not by model weakness.
5. The honest target is not a score. It is: **every path either teaches or says
   why, and none returns silence.**

### Implications

- Stop optimising 5/6 to 6/6. That is optimising a sample.
- Wire `authorConcept` into `CanvasRoute`. It is the only change that moves the
  product's behaviour at all today.
- Replace "any topic" as a SCORE with "no silent path" as an INVARIANT.
- The doubt refusal branch is not a UI nicety. It is the difference between
  "any doubt answered" being false and true.

**Cost of being wrong:** if `gpt-oss-120b` does not hold up, wiring it ships a
canvas that fails in front of a student instead of in a probe. That argues for
wiring it BEHIND the existing refusal display — which already shows the gate's
reasons — not for delaying the wiring.

---

## Every authoring measurement, including the failures

Same six questions, six subjects, temperature 0, every time.

| # | Model | Unit | Score | Mean | What the refusals actually were |
|---|---|---|---|---|---|
| 1 | qwen2.5:7b | whole lesson | 0/6 | 223.5s | the baseline |
| 2 | qwen2.5:7b | per concept | 0/6 | 12.0s | **harness bug** — `JSON.parse` not `extractJson` |
| 3 | qwen2.5:7b | per concept | 0/6 | 12.3s | **harness bug** — no token budget, JSON truncated |
| 4 | qwen2.5:7b | per concept | 1/6 | 18.4s | first real pass; prompt showed UNQUOTED placeholders and the model copied them |
| 5 | qwen2.5:7b | per concept | 0/6 | 21.1s | **worse after adding enum lists** — negative result, kept |
| 6 | qwen2.5:7b | per concept + repair | 2/6 | 58.5s | the repair turn doubled it |
| 7 | gpt-oss-120b | per concept + repair | 2 of 2 asked | 2.6s | four never reached the model — HTTP 429 |
| 8 | **gpt-oss-120b** | **per concept + repair** | **5/6** | **22.0s** | only "how does a bill become a law in India" refused |

Runs 2, 3 and 4 measured the harness, not the model. Both causes were already
written down in this repository and neither was read before the probe was built.

---

## What is done

| Item | State | Evidence |
|---|---|---|
| Engine hang fix | merged | PR #158 |
| Chart-fit rule (31st) | merged | PR #159, 61 census tests |
| 3 selector bugs | merged | PR #159 |
| `logs` + `tenses` guarded | merged | PR #159 |
| Per-concept authoring | built | `concept.ts`, 15 tests |
| Repair turn | built | doubled 7b score |
| Prompt JSON guard | built | `authorPrompt.test.ts`, both prompts |
| Batch 3 measurement | **complete** | table above, in CONSTRAINTS.md |
| `.env` gitignore hole | fixed | repo was public with no `.env` rule |

## What is NOT done

| Item | Why it matters |
|---|---|
| **Wire `authorConcept` into `CanvasRoute`** | the product still scores 0/6 without it |
| Doubt path renders nothing on failure | "any doubt answered" is false by construction |
| The 6th question | unread refusal |
| Widen past six questions | a sample cannot prove "any" |
| Reachability manifest for `src/canvas` | 6 orphans + 25 dead exports measured, then reverted |
| Beat floor rule | Batch 1 leftover, never attempted |

---

## Order of work

1. **Wire `authorConcept` into `CanvasRoute`** ← current
2. Batch 4 — engine output contract (needs explicit go-ahead)
3. Batch 5 — syllabus level (blocked: `examChoice.ts` on an unmerged branch)

---

## How to run the measurement

```bash
cd frontend
VITE_PROBE_MODEL=openai/gpt-oss-120b npx vitest run src/canvas/teach/conceptProbe.test.ts
```

Needs `frontend/.env.local` with `VITE_PROBE_ENDPOINT`, `VITE_PROBE_MODEL` and
`VITE_PROBE_KEY`. That file is git-ignored and must stay so — this repository is
public.
