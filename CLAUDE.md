# AGABI Canvas — working agreement

Read this file and `PROGRESS.md` at the start of every session. Chat context
gets compacted; these files do not.

---

## The central principle

> The design system is constant.
> The representation is variable.
> The composition is variable.
> The content is variable.
> The runtime state is variable.

Consistency comes from shared tokens and component contracts. Dynamism comes
from semantic data, representation selection, layout strategy, and runtime
state.

**Do not make every lesson look identical. Make every lesson feel like it
belongs to the same product.**

---

## Scope — what this work touches

| | |
|---|---|
| **Target route** | `/canvas/gas` — the explanation canvas |
| **Target source** | `frontend/src/canvas/**` (today `frontend/src/board/scene/` + `frontend/src/board/model/`) |
| **Reference** | The gas-pressure scene is the visual specification. It is where the design grammar is extracted **from**, not something the layout system overwrites. A visual regression in it is an extraction bug. |

### The dashboard protection rule

`frontend/src/components/`, `frontend/src/data/`, `frontend/src/styles/` are the
**original dashboard**. They are out of scope.

- Do **not** migrate dashboard components to the canvas token system.
- Do **not** change dashboard colour or spacing to satisfy a canvas rule.
- If a shared stylesheet or token creates a conflict, **report it and stop**.
  Do not resolve it unilaterally.

Verified fact: the dashboard imports nothing from `board/`. `App.tsx` couples to
the canvas in three lines only.

---

## Three goals

### Goal 1 — Visual language invariance

Same design-token system and component recipes everywhere. Consistency means
consistent design **grammar**, not identical geometry.

**Constant across all lessons:** colour roles · typography roles · font sizes ·
line heights · spacing scale · border styles · radius values · stroke weights ·
arrow geometry style · motion timing · control styles · focus styles ·
component recipes · row heights · header treatments.

**Variable according to content:** which components appear · how many · their
order · composition strategy · block width and height within approved limits ·
stacked / grouped / paginated / scrollable / collapsed · whether relationships
render as arrows · whether a table, chart, diagram or equation is appropriate.

```
arrow style   = constant      arrow count          = relationships
table padding = constant      rows visible         = adaptive
font role     = constant      content length       = variable
colour roles  = constant      which roles are used = variable
```

### Goal 2 — Universal coverage

Any topic, subject, content shape, content volume.

All content stays **accessible and correct**. It does **not** have to be
simultaneously visible. When content exceeds a frame: paginate, scroll, expand,
open a detail drawer, aggregate with an accessible data view, disclose
progressively, or split into related sections.

**Never clip, distort, or silently delete content. Never render a broken frame.**

### Goal 3 — Incremental execution

One step per message. Stop. Wait for explicit approval. Never batch, never skip,
never start a later step because it looks related. Going slow is the point.

---

## Four laws

Violating any of these is a bug, not a judgment call.

**LAW 1 — The LLM never draws.** Typed `LessonSpec` JSON only. No SVG, HTML,
React, or raster output.

**LAW 2 — The LLM never positions.** No `x`, `y`, `top`, `left`, `width`, or
`height` in any schema field, ever.

**LAW 3 — The LLM never styles.** Semantic roles only. No colour, font size,
spacing value, alignment, or radius in any schema field. If such a field exists,
it is a bug — delete it.

**LAW 4 — No raw colour or arbitrary design values outside the token layer.**

*Banned outside `tokens.ts`:* hex · `rgb()` · `rgba()` · `hsl()` · named CSS
colours · arbitrary px/rem for spacing, font-size, line-height, letter-spacing,
radius, border-width, gap.

*Allowed anywhere:* `0` · percentages · `vw/vh/vmin/vmax` · `fr` · `auto` ·
`min/max/fit-content` · transforms · `aspect-ratio` · `z-index` · `opacity` ·
`calc()` whose operands are tokens or the above.

If lint blocks a legitimate structural value, **report it and propose an
allowlist entry. Never add `eslint-disable`.**

```
LLM decides      WHAT exists, HOW blocks relate
design system    HOW IT LOOKS
layout grammar   WHERE IT GOES
validator        WHETHER IT SHIPS
```

---

## Destructive-migration warning — Step 0 only

**This project contains exactly one approved destructive migration: the Step 0
legacy-blackboard deletion.** Outside Step 0, all work is additive or
refactoring within the target canvas.

Before Step 0 runs, all five must be true:

1. A migration branch exists.
2. A backup tag exists at `9462d0d`.
3. The deleted paths are archived.
4. The working tree is clean.
5. The deletion manifest is recorded.

**Delete nothing beyond the paths Step 0 explicitly lists.** Step 0 removes ~94
files / ~12,352 lines and takes the unit-test count from 303 to roughly 44. That
cost is accepted and recorded, not discovered later.

---

## Stop protocol

Every reply that completes a step ends with exactly this, then updates
`PROGRESS.md`, then stops:

```
STEP <N> COMPLETE
FILES CHANGED       <path> — one line why
DEFINITION OF DONE  [x] each criterion
VERIFY YOURSELF     1. specific thing to look at / command to run
RISKS               anything you think is wrong, or "none"
Continue to Step <N+1>?
```

If you finish early, stop early.

---

## Tripwires — stop and ask first

- starting an unapproved step, or two steps in one reply
- changing the **normal** output of an existing renderer for existing content
- adding a schema field carrying colour / size / spacing / position
- `eslint-disable` on the design-value rule
- weakening a test to make it pass
- adding a dependency not named in the brief
- rebuilding something that works instead of layering
- hardcoding a value "just for now"
- touching files the current step does not name
- **touching the dashboard for any reason**

---

## Anti-patterns

| Excuse | Reality |
|---|---|
| "I'll extract tokens later." | Step 1 or nothing. Every later layer inherits Step 1's leaks. |
| "This component keeps its own padding." | That single exception breaks Goal 1. |
| "Let the model return the hex." | Indices into `tokens.series`. |
| "Let the model pick the layout." | Pure function. Deterministic. |
| "Chart looks fine, skip the tick test." | A build once shipped a y-axis reading 200, 150, 100, 110. |
| "Make the text smaller so it fits." | Never. Disclose, don't shrink. |
| "I'll change density to fix spacing." | Density is a **capacity** policy. It never touches style tokens. |
| "Close enough." | Run the tests. |
| "Zero visual change" while merging four teals | Those cannot both be true. Report the collapse; get approval. |
| "Verified — tests pass." | With a command that does not exist? See below. |

---

## Verification honesty

Inspect `package.json` before running anything. Use the project's real commands.

Currently real: `typecheck` · `test` · `build` · `budget`.
Currently **absent**: `lint` — it arrives in Step 1.

If a command or a Playwright project does not exist, **report it and stop**.
Never infer success from a command that did not run.

Also true today, and not to be papered over:

- **No screenshot-regression tooling exists.** 0 uses of `toHaveScreenshot`, 0
  baseline directories. The PNGs under `e2e/report/shots/` are gitignored manual
  captures. Do not claim pixel-perfect verification that cannot be performed.
- **ESLint does not lint standalone `.css`.** Whether a separate CSS check is
  needed must be reported, not assumed covered.

---

## Enforcement — instructions don't enforce, these do

| Concern | Mechanism |
|---|---|
| Goal 1 invariance | `token-invariance.spec.ts` — render N lessons, extract computed CSS per block kind, assert every style-token property is identical. Geometry (width, height, item count) is **excluded**. |
| Law 4 | `design-value` ESLint AST rule with a structural allowlist |
| Token coverage | every computed colour / spacing / font-size in the DOM traces to `tokens.ts` |
| Chart ticks | property test — 20 random ranges per chart type, monotonic and evenly spaced |
| Goal 2 coverage | adversarial fixtures + screenshot regression (built at Step 10) |
| No regression | the 7 acceptance lessons after every step |

---

## Final acceptance

| # | Lesson | Dominant form |
|---|---|---|
| 1 | What is opportunity cost | prose |
| 2 | Compare LIFO vs FIFO vs weighted average | table |
| 3 | India GDP growth 2015–2025 | chart |
| 4 | How does a bill become law in India | flowchart |
| 5 | Derive the quadratic formula | equation |
| 6 | Why does heating a gas raise its pressure | simulation |
| 7 | Explain compound interest | mixed |

Two things must be **simultaneously** true:

**Compositionally different** — different semantic profiles produce different
compositions. Each archetype choice is deterministic, explainable, appropriate.
Two lessons sharing an archetype is fine *if* their profiles are genuinely
similar and the selector can justify it.

**Stylistically unified** — identical tokens and component recipes across all
seven. Same padding tokens, gutters, font roles, accent, radii, row heights,
stroke weights, arrow style, motion timing. Geometry differs. Grammar does not.

> If lesson 2 has different padding tokens than lesson 5, the token layer failed.
> If the selector cannot justify its archetype choice, the selector failed.
