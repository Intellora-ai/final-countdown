# AGABI Canvas — working agreement

Read this file and `PROGRESS.md` at the start of every session. Chat context
gets compacted; these files do not.

---

## How to talk to Tanveer — read this first

Tanveer asked for this rule on 2026-08-24:

> **Use simple language. Explain technical things in plain words.**

This is an accessibility requirement, not a style preference. It applies to
EVERY reply, every session, forever.

### Writing rules

- Short sentences. One idea each. One concept at a time.
- Plain words: "broken", not "defective". "Check", not "validate".
- Explain a technical word the first time you use it, in brackets, like:
  "CI (the robot on GitHub that checks your code)".
- Answer first. Details after.
- Use short lists and small tables. Walls of text are hard to scan.
- Use numbered steps when the order matters.
- **Bold** the part that matters most.
- Keep facts, actions, warnings and decisions in separate blocks. Do not mix
  them into one paragraph.
- Say plainly what is happening now, what happens next, what is finished, and
  what is blocked and why.
- Do not repeat one idea in different words.

Say: "This file checks whether…" · "This command does…" · "The error means…" ·
"The problem is…" · "The fix is…" · "Run this next…" · "This is complete
because…"

Never say: "Obviously…" · "Simply…" · "As you know…" · "Just do…" · "This is
trivial…" · "You should already understand…" · "It goes without saying…"

**Do not talk down to him.** He runs this repo, directs several AI sessions at
once, and catches real mistakes in their work — including mine. Simple is not
the same as dumb. He works across Python, AI and LLMs, OCR, CI/CD, GitHub
Actions, Lean, Rust, APIs, databases and security tools. **Simplify the
explanation, never the technical quality of the work.** He also asks for the
"HONEST ANSWER" and means it: never soften bad news, just say it plainly.

If a hook turns on "caveman mode" (dropping words, using fragments), **this rule
wins**. Fragments are harder to read, not easier. Write full simple sentences.

### How to run a task

1. State the objective.
2. List the smallest actions needed.
3. Do one group of related actions at a time.
4. Show the result.
5. Name any error straight away, in plain words.
6. State the next action.
7. Mark a step complete only after you have verified it.

Mark every step **not started**, **in progress**, **blocked**, or **complete**.

Do not put ten unrelated decisions in front of him at once. When several choices
are valid: explain them briefly, recommend one, say why it is recommended. Do not
make him compare options that do not matter.

### How to end a substantial task

End with these four headings, in this order:

- **Completed** — what was built, what was tested, what passed, which files.
- **Problems** — what failed, what the error means, what you did about it.
- **Next step** — the single most important next action.
- **Status** — complete, in progress, blocked, or awaiting approval.

This does not replace the STEP COMPLETE stop protocol further down. When a reply
finishes a numbered step, use the stop protocol. Use these four headings for
everything else.

### Scope — chat only

These rules govern replies to Tanveer in chat. Commit messages, PR bodies, issue
text and code comments stay technical and complete — they are written for the
repo and for other engineers.

**Personal details about Tanveer never go into anything published.** That means
commit messages, PR bodies, issues, GitHub annotations, CI logs, generated
reports, application logs and shared artifacts. This repository is public. Those
details live only in local instruction files that are never pushed.

**Their absence from this file is deliberate. Do not add them back.** A future
session may notice the rules here have no stated reason and want to supply one.
Do not. The reason is recorded privately, off this repository, and this file
carries the rules alone on purpose.

---

## How work gets built — read before writing a single line

Tanveer's rule, 2026-08-24, verbatim:

> **"DEFINE REQUIREMENTS + WHAT MUST BE TRUE TO GET DESIRED OUTCOME THEN BUILD
> AROUND THAT, DO NOT MAKE TESTS WEAK, EASY. BUILD TESTS THAT FULFILL DESIRED
> OUTCOME, ONLY THEN WRITE CODE. CODE WRITTEN SHOULD BE CHANGED AND BETTER BUT
> TESTS ONLY CHANGE IF MUTANTS SHOW A REAL EVIDENCE ERROR"**

And, from the same day:

> **"EVERY BUG, ERROR, MUST BECOME A PERMANENT FIX AND NOT JUST SURFACE LEVEL FIX"**

> **"ALL BUGS MUST BE FOUND VIA GITHUB, I DON'T CONSIDER LOCAL TESTS A TEST"**

**The order. Never skipped, never reordered:**

1. **Write down the requirement** and what must be TRUE for the desired outcome.
   Aim at the requirement, never at what the code currently happens to do.
2. **Write the hardest test you can** against that outcome. Ugliest realistic
   input, not the happy path. Assume the code is trying to sneak past you.
3. **Run it and WATCH IT FAIL.** A real assertion failure. An import error or a
   collection error is a weak red and does not count as having seen it fail.
4. **Now write or fix the CODE.**
5. Re-run. It must pass for the right reason.

**The code is what changes. The test is not.** If a test fails, the code is
wrong until proven otherwise. The ONLY licence to change an existing test is a
**surviving mutant** — mutation testing producing real evidence that the test
itself cannot fail. Not "the test looks too strict". Not "the test is old".

One narrow exception, and it must be stated out loud when used: a test that
deliberately PINNED a known hole, and whose own docstring instructs the next
person to update it once the hole is closed. Closing the hole and rewriting
that test is finishing the job. Weakening any other test to go green is not.

**Test in PAIRS.** Every check needs an input that must FAIL and one that must
PASS. A check asserted only to fail is satisfied by `return false`, exactly as
one asserted only to pass is satisfied by `return true`. Both are vacuous.

**Assert the harness is not vacuous.** The clean baseline must exit 0 AND report
a non-zero passed count. A suite that collected nothing looks identical to a
suite that looked hard and found nothing.

**A suite that passes on the first implementation is a smell.** Say so plainly
rather than reporting it as success.

**Permanent, not surface.** Every fix ships with the thing that stops the class
recurring: the root cause, a test that fails without the fix, every other copy
of the same bug, and — where one exists — the gate that let it through. A
comment or a promise is not a fix.

**GitHub is the only real test.** Local green is a hint. The required contexts
on GitHub are the proof. Never report work as done on local results alone.

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

## LAW 5 — requirements first, then the hardest test, then the code

> **DEFINE REQUIREMENTS + WHAT MUST BE TRUE TO GET THE DESIRED OUTCOME, THEN
> BUILD AROUND THAT. DO NOT MAKE TESTS WEAK, EASY. BUILD TESTS THAT FULFILL THE
> DESIRED OUTCOME, ONLY THEN WRITE CODE. CODE SHOULD BE CHANGED AND MADE BETTER,
> BUT TESTS ONLY CHANGE IF MUTANTS SHOW A REAL EVIDENCE ERROR.**

Stated by the user, four times, escalating. It is not advice.

**The loop, in order, every time:**

1. Write down the requirement and **what must be true** for the outcome. Aim the
   test at *that*, never at the implementation.
2. Write the test **as hard as the outcome demands** — ugliest realistic input,
   generated over a space rather than a hand-picked list. Assume whoever wrote
   the code is trying to sneak past.
3. Run it. **Watch the CODE fail.** A `Cannot find module` or a collection error
   is a weak red and does **not** count as having watched a test fail.
4. Fix the **CODE**.
5. Re-run. It must pass for the right reason.

**NEVER edit a test to make it pass.** If a test fails, the code is wrong until
proven otherwise. The ONLY licence to change an existing test is a **surviving
mutant** — mutation testing producing real evidence that the test cannot fail.

| Not a reason to touch a test | The only reason |
|---|---|
| "the assertion is too strict" | a mutant survived |
| "the code is fine, the test is wrong" | a mutant survived |
| "it's flaky" (unproven) | a mutant survived |
| "just to get CI green" | a mutant survived |

**A suite that passes on the first implementation is a smell.** Say so plainly
rather than reporting it as success, then attack it with mutants — that is the
only way to learn whether the tests were hard or merely lucky.

**Strengthening a test after the fact is NOT this loop.** Widening a test once
the code already passes proves nothing new, however much harder the test got.
Name it honestly instead of presenting it as a fix.

**Test in PAIRS.** Every check needs an input that must FAIL and one that must
PASS. A check asserted only to pass is satisfied by `return true`; one asserted
only to fail is satisfied by `return false`. Both are vacuous.

**Local green is a hint, not proof.** The user's words: *"I DON'T CONSIDER LOCAL
TESTS A TEST."* The required contexts on GitHub are the evidence.

---

## Every bug becomes a permanent fix

> **EVERY BUG, ERROR, MUST BECOME A PERMANENT FIX AND NOT JUST A SURFACE LEVEL
> FIX. ENFORCED — NEVER OVERRIDDEN.**

A fix is finished only when all four hold:

1. **Root cause named** — not the symptom, not the file where it surfaced.
2. **Fixed at the source** — not at the call site, not by catching it further
   out. If the same defect could reach a second caller, the fix is in the wrong
   place. Fix every copy of the shape; a defect written twice was a copy-paste.
3. **A guard that fails if it returns** — a test, a lint rule, a gate, a mutant,
   verified by running it against the broken code.
4. **If a check let it through, fix the check too.** A bug CI passed is two
   bugs: the code, and the gate that said PASS.

Banned as "fixes": `continue-on-error`, `|| true`, swallowing an exception,
widening a threshold, deleting an assertion, `eslint-disable`, "quick fix for
now". Anything that makes the RED go away without changing what was WRONG.

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
src/agent src/websearch`. That fourth path was missing from this line for as
long as `src/websearch` has existed, which is this section's own warning
arriving on schedule: the list said less than the manifest, a session read it,
and the gap sat there. Flat config only lints a path with a matching `files:`
block, so
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
| Goal 1 invariance | `frontend/e2e/token-invariance.spec.ts` — renders all three lessons, reads computed CSS per **(block kind, emphasis)** and asserts every style-token property is identical across lessons. Geometry is **excluded**: width, height, margin, position, grid placement. Runs on all five viewport projects. |
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

---

# Working rules — knowledge base and engineering discipline

Added 2026-08-26. **This section is ADDITIVE.** Everything above it still
stands, unchanged.

## Precedence — read this before the rules below

**LAW 0 and LAW 5 win.** Where anything in this section is weaker than them, they
govern.

Specifically: "verify by running" below is a **floor, not a replacement for
test-first**. LAW 0 requires the order

```
requirements -> what must be true -> the hardest test -> WATCH IT FAIL -> then code
```

Running the code afterwards and seeing it work does not satisfy that. A test
written after the implementation passes on its first run and proves nothing,
which is exactly why the red run is mandatory. Nothing below relaxes it.

## Session start

At the start of every session, read `knowledge/README.md` and `wiki/index.md` to
load the current state of the project before doing anything else.

## Context first

Before ANY task, search the `knowledge/` folder (and `wiki/` if present) for
relevant context. Read the relevant files before writing code. Never build from
a partial picture. **If knowledge is missing, say so and ask before
proceeding** — do not fill the gap with a guess.

Order of authority when the sources disagree:

```
1. this repository's own code and tests   — what is actually true here
2. knowledge/architecture, decisions, patterns, api — what we decided and why
3. current official documentation          — what is true today upstream
4. knowledge/ curated corpus               — background and prior art only
```

The corpus never outranks official documentation on a live API. See
`.claude/skills/knowledge-research/SKILL.md` for the routing table and the
Current-Truth Rule.

## The always-on loop

For every non-trivial implementation task:

```
UNDERSTAND -> INSPECT CURRENT STATE -> RESEARCH RELEVANT KNOWLEDGE
           -> FORM STRUCTURED PLAN -> IMPLEMENT -> VERIFY
```

Use the repository-local `knowledge-research` skill when it is relevant. It is
not relevant to most tasks, and that is fine — skipping it deliberately and
saying so is correct behaviour.

Never:

- load an entire knowledge repository into context
- blindly copy an implementation
- assume an old example is current
- treat a curated list as authoritative
- use obsolete API information without verification
- research irrelevant sources merely to satisfy this rule

## Engineering rules

**1. Spec before code.** Define "done" in writing first: the exact behaviour,
the acceptance criteria, and how it will be verified. Write a short
step-by-step plan. Keep each step small and atomic. If "done" is unclear, ask —
do not code on a guess. *(Subordinate to LAW 0: the test comes before the code
and must be seen failing.)*

**2. State assumptions, do not guess.** List every assumption about
requirements, codebase and environment. If anything is ambiguous, STOP and ask
rather than silently picking one reading. Present multiple interpretations when
a request admits them. Push back when a simpler approach exists.

**3. Write minimum, surgical code.** The least code that solves the problem,
nothing speculative. Do not refactor what is not broken. Match existing style;
do not "improve" adjacent code.

**4. Verify by running, never by assuming.** After each piece, run it — tests,
build, or a real manual check — and prove it works. Do not move on until the
current piece is verified. "Done" requires evidence: a passing test, a clean
build, a successful run. If you cannot show it, it is not done. *(Floor only.
LAW 0's red-first requirement still applies.)*

**5. Git is your save point.** Commit after each verified step with a clear
message. If something breaks, revert to the last good commit rather than
patching on top of broken code. Stage explicit paths — never `git add -A` —
because other sessions share this worktree and a blanket add commits their work
under your message.

**6. If stuck, stop and report.** Do not guess and do not fake it. Report what
you tried, the exact error, what you think is wrong, and what you need.

**7. Context first.** Gather relevant context before large work: existing code,
docs, patterns, constraints. Prefer reading the files over guessing at them.

**8. Never claim success without evidence.** A task is done when it is verified
and committed. If you cannot verify, say so plainly. Honesty over optimism.

### One rule deliberately omitted

An earlier draft of this section said "treat coverage as a quality gate". It was
removed rather than softened. The required coverage check in this repository
measures **38 lines, about 0.05% of the codebase**, so that sentence would have
asserted a guarantee that does not exist here. Restoring it needs the gate to
cover something real first.

## Knowledge proof

Every PR/commit you make MUST reference the `knowledge/` or `wiki/` files you
consulted in its description. If you did not consult any, say so and explain
why. Never build without checking knowledge first.

"I consulted none, because this was a two-line rename" is a complete and
correct answer. The rule exists to make the decision *visible*, not to force
research onto tasks that do not need it — research performed only to satisfy a
rule is waste, and it teaches everyone to ignore the rule.

Checked by the `knowledge-gate` job in `.github/workflows/gate.yml`, which is
**non-blocking today**. It reports; it does not yet refuse.
