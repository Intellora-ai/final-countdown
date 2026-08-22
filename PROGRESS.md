# AGABI Canvas — progress

One step per message. Stop after each. Wait for explicit approval before the
next. See `CLAUDE.md` for the laws, tripwires and stop protocol.

**Status:** first action complete. Nothing else started.

---

## First action

- [x] `CLAUDE.md` — principle, goals, laws, stop protocol, tripwires,
      anti-patterns, scope, dashboard protection, Step 0 warning
- [x] `PROGRESS.md` — this file
- [ ] **Approved to begin Step 0**

---

## Step 0 — Controlled removal of the legacy blackboard

> The **one** approved destructive migration. Everything after this is additive
> or refactoring within the canvas.

**Pre-flight — all five before a single deletion**

- [ ] migration branch created
- [ ] backup tag at `9462d0d`
- [ ] deleted paths archived
- [ ] working tree verified clean
- [ ] deletion manifest recorded

**The deletion** — `frontend/src/board/` except `scene/` and `model/`

- [ ] `types/` `renderer/` `blocks/` `fixtures/` `teaching/` `progress/`
      `camera/` `shell/` `lib/` `BoardView.tsx` `GalleryView.tsx` `index.ts`
- [ ] 3 legacy e2e specs (`canvas-invariants`, `canvas-phase4`, `canvas-phase5`)
- [ ] `App.tsx` — 3 lines (import at :10, routes at :109–110)
- [ ] `board/scene/` → `src/canvas/`, `board/model/` → `src/canvas/model/`

**Definition of done**

- [ ] typecheck clean
- [ ] surviving tests green (~44, down from 303)
- [ ] dashboard still renders Today / Chapter / Sidebar
- [ ] `/canvas/gas` renders **identically**
- [ ] budget passes
- [ ] dashboard untouched — verified, not assumed

---

## Step 1 — `tokens.ts` + Law 4 ESLint rule

*Canvas scope only. Dashboard is not migrated.*

- [ ] `src/canvas/design/tokens.ts` authoritative
- [ ] codegen emits `:root` custom properties from it
- [ ] drift test: generated CSS and `tokens.ts` cannot disagree
- [ ] `space` (0,4,8,12,16,24,32,48,64,96) — no other spacing token
- [ ] exactly 7 type roles: display, title, heading, body, label, micro, mono
- [ ] semantic colour roles only (bg → warning)
- [ ] `series[6]` fixed order — model picks an **index**
- [ ] `radius` · `stroke` · `motion` · `arrow`
- [ ] **aliases preserve current rendered values**
- [ ] **every value collapse reported, not applied** (four teals: `#0C9B8E`,
      `#1AADA6`, `#38e4d7`, `#2dd4bf`)
- [ ] ESLint introduced: `eslint`, `typescript-eslint`, `@typescript-eslint/rule-tester`
- [ ] flat config + `lint` script + CI step
- [ ] `design-value` rule via `ESLintUtils.RuleCreator`
- [ ] covers JSX style objects, JSX/SVG attributes, TS/JS style objects, R3F props
- [ ] `RuleTester` valid **and** invalid cases
- [ ] zero `eslint-disable`
- [ ] CSS blind spot reported — is a separate check needed?

**Definition of done**

- [ ] no *unreported* visual change
- [ ] lint passes with zero disables
- [ ] every colour / spacing / font-size in the DOM traces to `tokens.ts`
- [ ] verification method stated honestly (no screenshot tooling exists yet)

---

## Step 2 — Universal Representation Contract

*The foundation for Steps 3–8.*

- [ ] `LessonElement` envelope — no x/y/width/height/colour/spacing, ever
- [ ] `RepresentationContext`
- [ ] `RepresentationContract`: validate · normalize · fitness · capacity ·
      disclosure · derive · invariants · degrade · renderer
- [ ] registry
- [ ] deterministic selection, with logged fitness and rejection reasons
- [ ] six disclosure strategies: truncate_expand · paginate · scroll_y ·
      split_block · aggregate · progressive_disclosure
- [ ] existing hand-rolled validation style — **no Zod**
- [ ] adding a representation costs: 1 contract + 1 renderer + 1 registry entry + tests
- [ ] the 7 acceptance lessons authored (2 have no existing content:
      flowchart-dominant, equation-dominant)

**Definition of done**

- [ ] 400-word prose and a 60-row table both disclose, never overflow
- [ ] every disclosure path keeps all content accessible and correct

---

## Step 3 — `archetypes.ts`

- [ ] 12-col grid, gutter `space.5`, canvas padding `space.7`
- [ ] seven compositions: NARRATIVE · DATA · PROCESS · COMPARISON ·
      DERIVATION · EXPLORATORY · SPLIT
- [ ] `selectArchetype(blocks)` — pure, no LLM, no randomness
- [ ] gas scene rebuilt as EXPLORATORY

**Definition of done**

- [ ] deterministic — same spec, same archetype, every run
- [ ] every selection explainable: which rule fired and why
- [ ] different profiles → different compositions; similar profiles may share
- [ ] gas scene looks the same or better

---

## Step 4 — `disclosure.ts`

- [ ] mass = Σ (chars/600 + rows/12 + points/40 + items/8)
- [ ] `< 1.5` relaxed · `< 4.0` normal · else compact
- [ ] ladder: block strategy → collapse asides → paginate largest →
      simpler archetype → split canvas
- [ ] policy **never** touches font size, colour, spacing tokens, line height,
      radius, stroke width, row height, arrow style

**Definition of done**

- [ ] `token-invariance.spec.ts` passes: 2-block and 9-block lessons have
      identical computed padding, font sizes, colours, radii, row heights,
      stroke widths
- [ ] only item counts, visibility and pagination differ

---

## Step 5 — `validate.ts`

Runs after layout, before paint. Code, not review.

- [ ] noOverflow · noCollision · noOrphanConnector · axesValid · contrastAA
- [ ] minTapTarget · noAccidentalVoid · contentAccessible · labelFits
- [ ] repair ladder = Step 4's ladder, max 3 passes, then single-column fallback
- [ ] never paint a failing frame; log which repair fired

**Definition of done**

- [ ] 9 overlapping primary blocks resolve through the ladder
- [ ] a one-block lesson with large intentional whitespace passes
      `noAccidentalVoid`

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

- [ ] ticks from `d3-scale.nice()` — model never supplies ticks
- [ ] series colours by index into `tokens.series` — model never supplies hex
- [ ] renderer chooses baseline/scale/range; bars at zero, narrow-range lines not forced
- [ ] <3 points → table or prose · >300 → LTTB + note · >6 series → top 5 + "Other"
- [ ] legend: none at 1, inline at 2–3, block at 4+
- [ ] gridlines horizontal only; axis labels always carry units

**Definition of done**

- [ ] property test: 20 random ranges per chart type, every tick sequence
      monotonic and evenly spaced
- [ ] no chart in the acceptance set has a misleading axis

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
