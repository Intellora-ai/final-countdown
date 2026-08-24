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

## LAW 0 — requirements first, then hard tests, then code

> DEFINE REQUIREMENTS + WHAT MUST BE TRUE TO GET DESIRED OUTCOME THEN BUILD
> AROUND THAT, DO NOT MAKE TESTS WEAK, EASY. BUILD TESTS THAT FULLFILL DESIRED
> OUTCOME, ONLY THEN WRITE CODE. CODE WRITTEN SHOULD BE CHANGED AND BETTER BUT
> TESTS ONLY CHANGE IS MUTANTS SHOW AN REAL EVIDENCE ERROR

It is LAW 0 because the other four describe what may be built; this one decides
whether anything built can be trusted.

The order is fixed and none of it is optional:

```
requirements  ->  what must be true  ->  hard tests  ->  code  ->  WATCH IT FAIL  ->  fix the code
```

**A test encodes the desired outcome. The code is the thing that moves.** When a
test goes red, the first hypothesis is always that the CODE broke. That
hypothesis may only be overturned by MUTATION EVIDENCE: a surviving mutant, or a
measured behaviour proving the assertion contradicts the outcome that was
specified. Anything less and the code changes, not the test.

**Never weaken a test to reach green.** Not by loosening an assertion, not by
narrowing a range, not by deleting the case that failed, not by adding a
carve-out for the input that broke. A test edited to pass destroys the only
evidence that behaviour changed, and from the outside a justified edit and a
softened one look identical.

**Tests written after the code are biased by it.** They verify what was built
rather than what should have been, and they pass on the first run, which proves
nothing. If you did not watch it fail, you do not know it can fail.

*Measured, in this repository, in a single session:* three tests were edited to
go green — a pinned catalogue size, a `right triangle` extraction pin, and an
API-key guard case. Two of those edits were defensible and one was not, and at
the moment of editing each felt like the defensible kind. That is the whole
argument for making this absolute rather than a judgement call.

Related, and not a substitute: the reachability gate proves code is REACHED, the
mutation catalogue proves tests can SEE a defect. Neither proves a test was
written before the code it checks. Only the red run does, so show it.

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
- weakening a test to make it pass, in ANY form — loosening an assertion,
  narrowing a range, deleting the failing case, or carving out the input that
  broke it. See LAW 0: only mutation evidence may change a test
- writing the code before the test, or writing a test that passes on its first
  run. If you did not watch it fail, you have not tested it
- editing a test because the code disagreed with it, without a surviving mutant
  or a measured behaviour to prove the test was the wrong one
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

Currently real: `typecheck` · `test` · `build` · `budget` · `lint` ·
`test:mutation`.

`lint` was listed here as absent long after it shipped. That is worth naming,
because this section exists to stop a session claiming success on a command
that does not exist — and being stale in the OTHER direction is the same
failure wearing different clothes: a session reads "lint is absent", skips it,
and the Law 4 design-value rule goes unenforced on the very change that needed
it. Check `package.json` rather than this list; the list is a summary and can
rot, the manifest cannot.

Note what `lint` actually covers today: `eslint src/canvas src/practice
src/agent`. Flat config only lints a path with a matching `files:` block, so
adding a directory to that script alone changes nothing — `eslint.config.js`
needs the block too, or the target is silently skipped with no error.

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
| `/rtk` + `/investigate` every session | `scripts/enforce_skills.py` — a **Stop** hook, tested by `tests/test_enforce_skills.py` |
| Code that never runs | `frontend/scripts/reachability-gate.mjs` — see below |

### The reachability gate — why coverage could not catch this

`src/agent` shipped two modules, `execute/execute.ts` and `world/world.ts`,
that were fully written, fully unit-tested, and imported by **nothing that
ships**. Fifty-nine tests were green on code the product could never reach.
Alongside them the router selected `files`, `plan`, `act`, `code` and `tools`
and the loop had no branch for any of them, so the trace reported capabilities
as used that had done nothing at all.

Coverage does not merely miss this — it **argues against noticing it**. A
module imported only by its own test reports 100% coverage, and the number goes
UP as the orphan is tested more thoroughly. Coverage measures test reach; this
measures product reach; they diverge exactly when it matters.

The gate walks static imports from **declared** entry points and fails on any
non-test file that is unreachable, plus any export no reachable code can arrive
at. Two design points are load-bearing:

- **Entries are declared, never inferred.** "A file nobody imports is an entry
  point" makes the gate vacuous — every orphan is by definition a file nobody
  imports, so every orphan would be reclassified as an entry.
- **Test files are not edges.** `x.test.ts` importing `x.ts` does not make
  `x.ts` reachable. That edge is the whole reason the orphans looked connected.
- **Dead exports are a call graph, not an import count.** A function exported
  for direct testing and called by its neighbour is LIVE; a helper called only
  by an unreachable function is DEAD. The naive rule is wrong in both
  directions, and a gate that cries wolf gets switched off.

It runs under `npm test` (vitest sweeps `scripts/**/*.test.mjs`), so it is
enforced by the frontend job without touching a workflow file. `npm run
gate:reachability` runs it alone. Its own tests plant an orphan and require the
gate to fail — a gate only asserted to PASS is satisfied by `return true`.

**The companion rule, enforced in `loop.ts` and asserted over 14 turn shapes:**
every selected capability appears in `trace.executed` or in `trace.unmet`,
never neither, and nothing appears in `executed` that was not selected. A trace
that reports a decision without reporting the effect is an audit trail that
lies.

Tests must assert **effects**, not routing decisions. `plan.selected` contains
`files` is a fact about the router and is satisfied completely by a loop that
does nothing. See `src/agent/kernel/effects.test.ts`.

### Why the skill rule is a Stop hook and not a prompt

Three `UserPromptSubmit` hooks already told every session to invoke sixteen
skills. Measured across the eight most recent transcripts in this repo, `/rtk`
was invoked **0 times** — including in a 34 MB session — and `/investigate` in
four of eight, once each. A 0% enforcement rate is not a tuning problem. It is
what "add text to the prompt" buys, because text is a request and a model that
decides `/rtk` is "for PRs, and this isn't a PR" has not disobeyed anything.

`Stop` is the only hook event that can refuse. It fires when the turn tries to
END, and `{"decision": "block"}` sends the model back to work. The check reads
the transcript's `Skill` `tool_use` records, so a model's belief that it already
complied is not evidence and cannot satisfy the gate.

Two things follow, and both are deliberate:

- **The list is two skills, not sixteen.** Forcing sixteen does not save
  context, it spends it — `/investigate` alone injects ~8 KB of preamble per
  session. A gate expensive enough to resent is a gate that gets switched off.
- **It fails OPEN, never closed.** An unreadable transcript, a malformed
  payload, or an unexpected exception all exit 0 and let the turn end. A Stop
  hook that blocks by mistake cannot be recovered from inside the tool — you
  would edit `settings.json` from another editor to escape it. `stop_hook_active`
  and a per-session block ledger are two independent brakes on that loop, and
  either alone is sufficient.

Registered in `~/.claude/settings.json` under `hooks.Stop`; the copy that runs
lives at `~/.claude/hooks/enforce_skills.py`. `scripts/enforce_skills.py` is the
source of truth and the one the tests run against — if you change one, copy it.

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
