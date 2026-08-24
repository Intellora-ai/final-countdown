# AGABI Canvas — progress

One step per message. Stop after each. Wait for explicit approval before the
next. See `CLAUDE.md` for the laws, tripwires and stop protocol.

**Status:** Steps 0-5 and 8 complete. Steps 6, 7, 9, 10 next.

---

## First action

- [x] `CLAUDE.md` — principle, goals, laws, stop protocol, tripwires,
      anti-patterns, scope, dashboard protection, Step 0 warning
- [x] `PROGRESS.md` — this file
- [x] **Approved to begin Step 0**

---

## Step 0 — Controlled removal of the legacy blackboard

> The **one** approved destructive migration. Everything after this is additive
> or refactoring within the canvas.

**Pre-flight — all five before a single deletion**

- [x] migration branch created — `canvas/step-0-remove-blackboard`
- [x] backup tag at `9462d0d` — `backup/pre-blackboard-deletion`
- [x] deleted paths archived — `docs/migrations/blackboard-9462d0d.tar.gz` (181 KB)
- [x] working tree verified clean
- [x] deletion manifest recorded — `docs/migrations/step-0-blackboard-deletion.md`, 94 files named before deletion

**The deletion** — `frontend/src/board/` except `scene/` and `model/`

- [x] `types/` `renderer/` `blocks/` `fixtures/` `teaching/` `progress/`
      `camera/` `shell/` `lib/` `BoardView.tsx` `GalleryView.tsx` `index.ts`
- [x] 3 legacy e2e specs (`canvas-invariants`, `canvas-phase4`, `canvas-phase5`)
- [x] `App.tsx` — 3 lines (import at :10, routes at :109–110)
- [x] `board/scene/` → `src/canvas/`, `board/model/` → `src/canvas/model/`

**Definition of done**

- [x] typecheck clean
- [x] surviving tests green — **46** (down from 303)
- [x] dashboard still renders Today / Chapter / Sidebar
- [x] `/canvas/gas` renders **identically** — 6/6 browser guards pass
- [x] budget passes — **67.68 KB** of 150 (was 92.03)
- [x] dashboard untouched — `git diff 9462d0d` on components/data/styles returns nothing

---

## Step 1 — `tokens.ts` + Law 4 ESLint rule

*Canvas scope only. Dashboard is not migrated.*

- [x] `src/canvas/design/tokens.ts` authoritative
- [x] variables applied at runtime to `.scene` — no codegen artefact to drift
- [x] drift impossible by construction; alias-coverage test guards renames
- [x] `space` scale defined — **6 off-scale gaps found in use, reported not snapped**
- [x] exactly 7 type roles — **6 off-role font sizes found in use, reported not snapped**
- [x] semantic colour roles only (bg → warning)
- [x] `series[6]` fixed order — model picks an **index**
- [x] `radius` · `stroke` · `motion` · `arrow`
- [x] **aliases preserve current rendered values** — 118 substitutions, zero value changed
- [x] **every collapse reported, not applied** — `COLLAPSE_CANDIDATES`, `pending`, `pendingSize`, `ACCENT_CONFLICTS`
- [x] ESLint introduced: `eslint@10.9`, `typescript-eslint@8.67`, `rule-tester@8.67`
- [x] flat config + `lint` script + CI step
- [x] `design-value` rule, local, no third-party plugin
- [x] covers JSX style objects, JSX/SVG attributes, TS/JS style objects, R3F props
- [x] `RuleTester` — 18 valid, 15 invalid, 33 assertions
- [x] zero `eslint-disable` in source
- [x] CSS blind spot reported — see Step 1 report

**Definition of done**

- [x] no *unreported* visual change — 30/30 browser guards, visual check by eye
- [x] lint passes with zero disables
- [x] every colour / spacing / font-size in `src/canvas` traces to `tokens.ts`
- [x] verification stated honestly — no screenshot tooling exists; manual + DOM guards

---

## Step 2 — Universal Representation Contract

*The foundation for Steps 3–8.*

- [x] `LessonElement` envelope — appearance refused at runtime AND in the type
- [x] `RepresentationContext` — viewport, data profile, a11y requirements
- [x] `RepresentationContract` — all nine members
- [x] registry — refuses a duplicate kind
- [x] deterministic selection — every candidate, score and rejection reason
- [x] all six disclosure strategies exercised by the table + text contracts
- [x] hand-rolled validation, repair-notice style — **no Zod**
- [x] proven by test: a `molecule` contract joins and is selected with zero engine edits
- [x] the 7 acceptance lessons authored in Step 3

**Definition of done**

- [x] 400-word prose truncate_expand; 60-row table paginates; 260 rows aggregate
- [x] every path states `reachableVia`; `everyRowReachable` is an invariant

---

## Step 3 — `archetypes.ts`

- [x] 12-col grid; every slot verified inside it, no band overlaps
- [x] seven compositions, hand-tuned
- [x] `selectArchetype` — pure, deterministic, no clock or randomness
- [ ] gas scene rebuilt as EXPLORATORY — selector routes it there; the render still uses hand-placed layout

**Definition of done**

- [x] deterministic — 5 runs per lesson, one answer each
- [x] every selection names its rule and the numbers it fired on
- [x] **6 distinct archetypes across 7 lessons**; the one shared pair fired the same rule
- [ ] gas scene visual parity — pending the Step 3 render swap

---

## Step 4 — `disclosure.ts`

- [x] mass = Σ (chars/600 + rows/12 + points/40 + items/8)
- [x] thresholds at 1.5 / 4.0, boundary-tested
- [x] five-rung ladder; every rung logged whether or not it fired
- [x] policy **cannot** express style — no style key exists on the type

**Definition of done**

- [x] 2-block vs 9-block resolve to byte-identical design tokens
- [x] only counts and booleans differ — asserted by type inspection

---

## Step 5 — `validate.ts`

Runs after layout, before paint. Code, not review.

- [x] noOverflow · noCollision · noOrphanConnector · contrastAA (axesValid → Step 8)
- [x] minTapTarget · noAccidentalVoid · contentAccessible · labelFits
- [x] repair ladder reuses Step 4's ladder, 3 passes, then single-column fallback
- [x] never paints a failing frame; every repair logged with its pass number

**Definition of done**

- [x] 9 overlapping primary blocks resolve, all 9 kept, no content dropped
- [x] one-block NARRATIVE passes `noAccidentalVoid` — declared, not inferred

---

## Step 6 — Table contract

- [ ] column type drives alignment and width — never declarable in the schema
- [ ] `font-variant-numeric: tabular-nums` on every numeric column
- [ ] header: micro, uppercase, textMuted, tracking 0.04em, borderStrong
- [ ] constant row-height token; no zebra striping; hairline borders
- [ ] units in the header, never per cell
- [ ] capacity transforms change **visibility**, never styling
- [ ] max 3 emphasized cells, enforced in validation

**Definition of done**

- [ ] 6×8, 14×5 and 60-row tables all render as premium tables
- [ ] all three have identical padding, row height, header styling
- [ ] every row in the 60-row table is reachable

---

## Step 7 — Flow and arrow contract

- [ ] ≤5 horizontal · 6–8 serpentine · >8 vertical · >14 collapsible phases
- [ ] label >24 chars → two lines then truncate + tooltip; >40 → wrong representation
- [ ] arrow geometry **computed** from node boxes + the token curvature constant
- [ ] model supplies `from`/`to` ids only

**Definition of done**

- [ ] 3, 7, 12 and 20-step chains render with even node spacing
- [ ] curvature, cap style and stroke width identical across all four

---

## Step 8 — Chart contract

- [x] ticks from `d3-scale.nice()` — no code path in the contract picks a tick
- [x] series colours by index into `tokens.series`
- [x] baseline decided per mark: bars at zero, narrow-range lines not forced
- [x] <3 points degrades to table · >300 downsamples WITH a stated notice · >6 series → top 5 + Other
- [x] legend: none at 1, inline at 2-3, block at 4+
- [x] axis labels always carry units

**Definition of done**

- [x] property test: 20 seeded ranges x 6 intents, all monotonic and evenly spaced
- [x] the reference's 200/150/100/110 axis asserted unreachable

---

## Step 9 — Generation budget

- [ ] blocks 3–7, exactly 1 primary, max 2 aside
- [ ] prose ≤900 chars · table ≤6 cols · causal_chain ≤5 steps ·
      chart 3–40 points / ≤4 series · ≤1 simulation
- [ ] injected into the generation system prompt
- [ ] validated **before** layout; on breach apply disclosure, do not regenerate

**Definition of done**

- [ ] "Explain all of thermodynamics" degrades gracefully, not broken

---

## Step 10 — Adversarial stress suite

- [ ] screenshot-regression tooling **built here** — it does not exist today
- [ ] 60-row table · 14-col table · 400-word prose · 30-event timeline
- [ ] 12-step chain · 500-point chart · 9 all-primary blocks · 1 block only
- [ ] zero relationships · fully connected · 60-char labels · single data point
- [ ] empty series · empty table · one-word answer · no good visual representation

**Definition of done**

- [ ] every fixture: no overflow, no collision, no accidental void, all content
      accessible, reads as intentionally composed

---

## Final acceptance

- [ ] 1 opportunity cost (prose)
- [ ] 2 LIFO/FIFO/weighted average (table)
- [ ] 3 India GDP 2015–2025 (chart)
- [ ] 4 bill becomes law (flowchart)
- [ ] 5 quadratic formula (equation)
- [ ] 6 heating a gas (simulation)
- [ ] 7 compound interest (mixed)
- [ ] **compositionally different** — each archetype choice justified
- [ ] **stylistically unified** — identical tokens across all seven
