# CS-1 … CS-5 — the semantic core

One batch, because these five are one idea: **the board is a projection of a semantic model, not a
document.** Shipping the route without the variable store, or the log without the registry, would
leave a canvas that renders but cannot be replayed, synchronised, or explained — which is the
failure mode the whole plan exists to avoid.

## What landed

| CS | Delivered | Files |
|---|---|---|
| 1 | `/canvas/:chapterId/:conceptId`; bare `/canvas` resolves through `lastTouched()` and rewrites itself to the identified URL; an unresolvable id gets a real, accessible selection state | `lib/canvas-identity.ts`, `components/CanvasView.tsx`, `App.tsx`, `TodayView.tsx`, `ChapterView.tsx` |
| 2 | `SemanticEdgeType` (11 kinds) and `Concept.edges`, with `deps` derived from them | `types.ts`, `data/curriculum.ts` |
| 3 | `VariableStore` — one value, many subscribers, validation that refuses rather than clamps, undo, reset, replay | `lib/variables.ts` |
| 4 | `OperationLog` — append-only, sequenced, deterministic ids, semantic-step counting | `lib/operations.ts` |
| 5 | `RepresentationRegistry` — purpose, `explains`, `cannotExplain`, `requiredData`; alternatives ranked by what the current one cannot explain | `lib/representations.ts` |
| — | Scene construction, the single place that decides what a board opens with | `lib/scene.ts` |

## Results

| Check | Result |
|---|---|
| `npm run typecheck` | exit 0, zero errors |
| `npm test -- --run` | **38 passed / 38**, 6 files |
| `npm run build` | exit 0, 49 modules, 223.30 kB (71.72 kB gzip), 20.66 kB CSS |

## Three decisions worth the record

### `deps` is derived from `edges`, and every imported row stays `prerequisite`

`deps` feeds `layout()`, `prereqsMet()` and the planner. Any drift between the two lists moves
nodes on the chapter map, changes which concept a learner may start next, and reorders today's
plan. So `deps` is not maintained alongside `edges` — it *is* `edges.map(e => e.to)`, and
`curriculum.semantics.test.ts` asserts the equality across every concept in every class and
stream.

Retyping was equally deliberate: nothing was retyped. The imported tables encoded exactly one
relationship, and a row that quietly became `causal` would draw a different arrow and assert a
claim no author made. New typed edges arrive with authored scenes, not by reinterpreting old rows.

### Result objects carry optional fields instead of discriminating on `ok`

The first version used `{ ok: true; record } | { ok: false; reason }`. It does not compile here:
the imported `tsconfig.json` ships `strict: false`, and without `strictNullChecks` TypeScript will
not narrow a boolean discriminant — `if (!result.ok) return result.reason` is an error at every
call site.

Turning on `strict` would fix it and would be a repository-wide change to the imported design,
smuggled into a canvas changeset, with a diff nobody asked to review. The result shape changed
instead. String-literal discriminants (`IdentityResolution.kind`) narrow fine and were kept.

`strict: false` stays recorded as a known limitation, to be raised in its own changeset with its
own evidence.

### The reference concept is Class 9, not Class 10

The plan said "Change of state, Class 10 Chemistry". It is **Class 9** — `curriculum.ts:98` places
"Matter in Our Surroundings" in `C9`. The error surfaced as a failing test rather than as a
wrong-looking board, which is the point of testing against real curriculum data instead of a
fixture.

Scene authoring is keyed on `chapterId/conceptId` rather than class, so the binding survives the
tables being re-graded.

## What this batch deliberately does not do

The board does not yet write by hand, run a simulation, or construct the eight-step lesson. It
resolves the concept, declares its variables into the one store every representation will read,
and logs its opening operations so the scene is replayable from its first frame rather than from
whenever logging was remembered.

`CanvasView` says so on screen. It is not a placeholder — it renders real identity, real variables
and real typed edges — but it does not pretend to be the finished board either.

## Rollback

`git revert` the batch commit. Nothing outside `frontend/` and `docs/` is touched; no Python,
Lean, spec, proof, gate or workflow file is modified, so a revert cannot disturb the seventeen
required contexts.
