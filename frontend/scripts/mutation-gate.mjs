#!/usr/bin/env node
/* MUTATION GATE FOR THE CANVAS — the gate that tests the tests.
 *
 * WHY THIS EXISTS. Six gates in ci/gates.toml already detect weak tests:
 * mutmut, spec-strength, spec-composition, vacuity-check,
 * counterexample-search and honest-report. Every one of them is scoped to
 * `src/` Python and `specs/` Lean -- `pyproject.toml` pins
 * `paths_to_mutate = ["src/"]`, which is ten executable statements of integer
 * arithmetic. Not one of them mutates a line of TypeScript.
 *
 * So the canvas had hundreds of unit tests with NO automated check that any of
 * them could fail. That is not hypothetical. A manual mutation run over the
 * four files repaired on the branch this gate was written for scored 15/25:
 * flipping the pie chart's arc sweep flag inverted every sector and passed,
 * because the only assertion on path data was `toMatch(/A/)` -- an arc COMMAND
 * exists, not a correct arc. Dropping `* 100` from the legend passed because a
 * <title> tooltip computed the percentage independently. The suite protected
 * the DISPATCH and almost nothing about the DRAWING.
 *
 * Those specific holes are now closed. This gate exists so the next ten are
 * found by CI instead of by hand.
 *
 * THE CATALOGUE WAS REBUILT WHEN THE CANVAS WAS, AND THEN IT WAS REBUILT TOO
 * SMALL.
 *
 * The hand-positioned panel renderer this gate first targeted -- `panels/`,
 * `renderer/`, `layout/flow.ts` -- no longer exists. Every mutant below is
 * aimed at the data-driven lesson engine that replaced it, and each one was
 * confirmed against the source and then run, so the list is a record of what
 * the suite CAN see rather than a list of what it ought to.
 *
 * That first rebuild covered eight files with sixteen mutants. `SeriesShape`
 * was the only shape renderer in it; the other ten shipped several hundred
 * passing tests each with nothing checking that any of those tests could fail.
 * Sixteen against a floor of twenty-seven is what `scripts/gate_integrity.py`
 * caught, and it was right to: a catalogue that shrinks has quietly stopped
 * watching something it used to watch. The dispatch in `FigureView`, the cell
 * formatting in `TableView`, and one to three defects apiece in `ProcessShape`,
 * `MatrixShape`, `GraphShape`, `HierarchyShape`, `DistributionShape`,
 * `PartsShape` and `IntervalsShape` are now covered too.
 *
 * STILL NOT COVERED, and said here rather than left to be discovered:
 * `FlowWeightedShape`, `GeometryShape` and `LogicShape`. The first has a suite
 * and simply has not been mutated yet; the last two were being actively
 * rewritten while this catalogue was extended, and mutating a file somebody
 * else is editing produces a verdict about the collision rather than about the
 * tests. They are the obvious next three.
 *
 * A mutant that survives is left in place and says so; a curated survivor is
 * the most useful thing this file produces, and the run then fails, which is
 * the point.
 *
 * WHAT IT IS NOT. This is not a general mutation engine like Stryker. A full
 * AST sweep over 10k lines would take tens of minutes and add a dependency the
 * brief does not name. This is a CURATED catalogue: every mutant below
 * re-creates a defect that actually shipped on this branch, or inverts an
 * invariant the project states in writing. That makes it fast enough to gate
 * on and makes each failure legible -- a survivor names a specific promise the
 * suite has stopped keeping.
 *
 * THE FALSE-KILL TRAP, guarded explicitly. A mutation that produces a syntax
 * error makes vitest report zero tests and exit non-zero, which looks
 * identical to "the mutant was killed". Every run therefore asserts the total
 * test count is unchanged; a mutant that changes it is reported INVALID, never
 * counted as killed.
 *
 * THE OTHER FALSE KILL, WHICH THAT GUARD DOES NOT CATCH. Anything else editing
 * the working tree while this runs -- a second agent, a watch task, a rebase --
 * can turn a test red for its own reasons in the window a mutant is applied,
 * and the mutant is then credited with a kill it had nothing to do with. It has
 * happened here: `collision-check-vacuous` was recorded killed by eight tests in
 * a run that overlapped somebody else's edit, and survives cleanly when it is
 * the only thing changed. The count check cannot see this, because the other
 * edit need not change the count. RUN THIS ON A QUIET TREE, and treat a result
 * that contradicts a previous run as the concurrency artefact it probably is
 * rather than as news.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { isScopedKill } from './mutation-verdict.mjs'

/* CRASH SAFETY, because this tool edits real source files in the working tree.
 *
 * The first version had no try/finally and no signal handlers. Between
 * `writeFileSync(mutated)` and `writeFileSync(original)` the repository holds
 * deliberately broken code, and a Ctrl-C, a CI timeout or a thrown exception in
 * that window left it broken PERMANENTLY -- with a plausible-looking diff that
 * a hurried `git commit -a` would happily capture. Earlier on this branch a
 * mutation run and a `git checkout --` overlapped and destroyed uncommitted
 * work; this is the same hazard from the other direction.
 *
 * Three layers, because one is not enough:
 *
 *   try/finally      restores after a normal throw
 *   signal handlers  restore on SIGINT and SIGTERM, then re-raise
 *   a lock file      survives SIGKILL, which no handler can catch. It names
 *                    the file left mutated, and the next run REFUSES to start
 *                    until it is resolved -- so a hard kill costs one clear
 *                    error instead of a silent corruption nobody attributes.
 */
const LOCK = 'scripts/.mutation-gate.lock'

/** The file currently holding mutated bytes, and what to put back. */
let inFlight = null

function restoreInFlight() {
  if (!inFlight) return
  writeFileSync(inFlight.file, inFlight.original)
  inFlight = null
  try { rmSync(LOCK, { force: true }) } catch { /* nothing left to clean */ }
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    restoreInFlight()
    process.stdout.write(`\ncanvas-mutation-gate: ${signal} — source restored.\n`)
    /* Default disposition, so the caller sees a real signal death rather than
     * a tidy exit code that hides an interrupted run. */
    process.kill(process.pid, signal)
  })
}
process.on('uncaughtException', (e) => {
  restoreInFlight()
  process.stdout.write(`canvas-mutation-gate: crashed, source restored. ${e?.stack ?? e}\n`)
  process.exit(1)
})

/** Each mutant re-creates a defect that could ship, or inverts a stated rule. */
const MUTANTS = [
  /* PER-SOURCE ISOLATION. `gather.ts` states "FAILURE IS PER SOURCE, NEVER PER
   * SEARCH" in its own header, and nothing enforced it: the worker loop had no
   * try/catch, so one throwing dependency rejected through `Promise.all` and
   * lost every other source. Latent only because the shipped fetcher and cache
   * never throw — a dependency on a fact nobody promised, in a file that
   * explicitly anticipates a network-backed cache. */
  {
    id: 'cache-read-failure-sinks-the-batch',
    file: 'src/websearch/gather.ts',
    /* Anchored to the whole recovery BLOCK, not to the bare `cached = undefined`
       inside it. That assignment is generic text whose uniqueness rested on its
       indentation, and a stale-anchor refusal there would read as a formatting
       problem rather than as "the cache recovery moved". `} catch {` paired with
       the assignment is unique in this file — the fetch recovery below catches
       `(err)` — and it names the construct the mutant is actually about. */
    from: '      } catch {\n        cached = undefined\n      }',
    to: '      } catch (e) {\n        throw e\n      }',
    breaks: 'a cache whose connection has dropped takes down every search instead of degrading to no-cache; the pages were reachable the whole time',
  },
  {
    id: 'fetch-failure-loses-its-reason',
    file: 'src/websearch/gather.ts',
    from: "          detail: err instanceof Error ? err.message : String(err),",
    to: "          detail: '',",
    breaks: 'a source that threw is reported as failed with no reason, so nothing upstream can tell a dead host from a host that returned nothing',
  },
  {
    id: 'engine-outage-reported-as-no-answers',
    file: 'src/websearch/engine.ts',
    from: '      const body = await fetchJson(url)\n      return config.map(body).filter(usable)',
    to: '      try { const body = await fetchJson(url); return config.map(body).filter(usable) } catch { return [] }',
    breaks: 'a dead search engine reports engineFailed:false with zero results, which is byte-identical to a question that genuinely has no answers — an outage presented as a fact about the world',
  },
  /* SEARCH RETRIEVAL. `src/websearch` had ZERO mutants while carrying the SSRF
   * guard, the injection quarantine and the size cap — and the gate reported
   * PASS on every PR that shipped it, because it was mutating a different
   * directory. Every real defect in that module was found by something its
   * author did not write: CodeQL caught a sanitiser bypass, a loopback stub
   * caught an unbounded body read at 5011ms against a 250ms budget, and
   * generated encodings caught 42 SSRF bypasses where five had been guessed.
   * These entries convert that observation into enforcement. */
  {
    id: 'ssrf-guard-string-matching',
    file: 'src/websearch/fetchPage.ts',
    from: '  const host = withoutRootLabel(hostname).toLowerCase()',
    to: '  const host = hostname.trim().toLowerCase()',
    breaks: 'http://localhost./ and http://printer.local./ reach the fetcher, because every internal-name pattern is anchored and the trailing root label survives into URL.hostname',
  },
  {
    id: 'ssrf-mapped-ipv6-unwrap-removed',
    file: 'src/websearch/fetchPage.ts',
    from: '    const wrapped = unwrapV4(groups)',
    to: '    const wrapped = null as number | null',
    breaks: 'http://[::ffff:169.254.169.254]/ reaches cloud instance metadata: URL serialises it to [::ffff:a9fe:a9fe], so no dotted-quad pattern matches and credentials are one redirect away',
  },
  {
    id: 'ssrf-cgnat-range-dropped',
    file: 'src/websearch/fetchPage.ts',
    from: '  [0x64400000, 10],',
    to: '  [0x64400001, 32],',
    breaks: '100.64.0.0/10 becomes reachable, so a fetched page can pivot into carrier-internal address space that is not the public internet',
  },
  {
    id: 'injection-fence-fixed-not-chosen',
    file: 'src/websearch/guard.ts',
    from: '    if (!content.includes(candidate)) return candidate',
    to: '    if (true) return candidate',
    breaks: 'a page that ships the fence delimiter closes its own quarantine block early and the rest of its text is read as though the system said it',
  },
  {
    id: 'size-cap-after-the-fact',
    file: 'src/websearch/fetchPage.ts',
    from: '    if (total + value.length > maxBytes) {',
    to: '    if (false) {',
    breaks: 'the size cap stops bounding anything: an adversarial host streams until memory gives out, because the limit is only consulted after the bytes have arrived',
  },
  /* THE HONESTY LAYER. `shapeInvariants.ts` is the only thing standing between
   * a dishonest dataset and a picture that looks fine. Every mutant here is a
   * way for a representation to stop being able to refuse. */
  {
    id: 'parts-sum-downgraded',
    file: 'src/canvas/spec/shapeInvariants.ts',
    from: "not the stated whole ${data.whole}`, level: 'reject' })",
    to: "not the stated whole ${data.whole}`, level: 'warn' })",
    breaks: 'a pie whose slices account for 87% of the stated total is drawn as a complete whole; the missing 13% is never mentioned',
  },
  {
    id: 'declared-dag-may-cycle',
    file: 'src/canvas/spec/shapeInvariants.ts',
    from: '  if (data.acyclic) {',
    to: '  if (false) {',
    breaks: 'a dependency graph the author swore was acyclic is drawn with a loop in it, so "A waits for B waits for A" is presented as a build order',
  },
  {
    id: 'sankey-conservation-unchecked',
    file: 'src/canvas/spec/shapeInvariants.ts',
    from: '  if (data.conserved) {',
    to: '  if (false) {',
    breaks: 'a sankey takes 10 into a node and passes 7 out of it; the ribbon widths assert arithmetic that is simply false',
  },
  {
    /* Disabled rather than inverted. Inverting the comparison makes the check
     * fire on the HONEST matrix in the machine-learning lesson, which is built
     * at module scope in four test files -- they then fail to collect, the
     * total test count drops, and the harness correctly reports INVALID. The
     * mutation has to leave a correct matrix alone and only stop refusing a
     * wrong one, or it is testing collection rather than behaviour. */
    id: 'confusion-axes-may-disagree',
    file: 'src/canvas/spec/shapeInvariants.ts',
    from: '    if (data.rows.length !== data.columns.length || data.rows.some((r, i) => r !== data.columns[i]))',
    to: '    if (false)',
    breaks: 'a confusion matrix whose two axes list the classes in different orders is drawn, and the reader reads precision where recall is',
  },

  /* THE SHAPE/REPRESENTATION AGREEMENT. Without it the registry stops meaning
   * anything: a name would no longer imply what data it needs. */
  {
    id: 'figure-shape-mismatch-allowed',
    file: 'src/canvas/spec/figure.ts',
    from: '  if (block.data.shape !== required) {',
    to: '  if (false) {',
    breaks: 'a block that asked to be a sankey is handed pie data and drawn from it, so the reader is shown a chart nobody asked for',
  },

  /* THE LAYOUT GRAMMAR. `plan` decides where everything goes and `checkFrame`
   * decides whether that was allowed. Both halves are mutated, because a
   * planner that places badly and a validator that never objects are two
   * different defects with the same symptom. */
  {
    id: 'stack-shares-an-occupied-band',
    file: 'src/canvas/layout/layout.ts',
    from: '      if (cursor > 0) {',
    to: '      if (false) {',
    breaks: 'THE SHIPPED BUG: a derived equation is painted on top of the table already sitting in that band',
  },
  {
    /*
     * THIS WAS THE CATALOGUE'S ONE RECORDED SURVIVOR. IT IS NOT ANY MORE.
     *
     * Every test of the layout invariants used to run them over a frame `plan`
     * produced, and `plan` is correct, so all four checks were only ever
     * observed AGREEING. Nothing handed `checkFrame` a frame that was genuinely
     * broken, so `ok: true` was indistinguishable from the real thing and this
     * mutant could not die. The finding was recorded here rather than deleted,
     * and it named its own cure: a test that builds a `Frame` by hand with two
     * blocks overlapping in one band and asserts `noCollision` returns
     * `ok: false` naming both.
     *
     * `layout.test.ts` now has exactly that, under "the layout detectors can
     * actually fail", and this mutant dies to it. The entry stays because the
     * defect is still worth watching — a detector can be made vacuous again by
     * any refactor, and the only thing standing between that and a shipped
     * overlap is a test that feeds it a broken frame on purpose.
     */
    id: 'collision-check-vacuous',
    file: 'src/canvas/layout/layout.ts',
    from: "  return { name: 'noCollision', ok: offenders.length === 0, offenders: [...new Set(offenders)] }",
    to: "  return { name: 'noCollision', ok: true, offenders: [] }",
    breaks: 'two blocks drawn over each other are reported as a clean frame and painted anyway',
  },
  {
    id: 'narrow-frame-keeps-the-desktop-grid',
    file: 'src/canvas/layout/layout.ts',
    from: 'const narrow = viewport.width < 900',
    to: 'const narrow = viewport.width < 0',
    breaks: 'a phone is given the twelve-column desktop grid, so blocks are squeezed into slivers instead of stacking',
  },

  /* TICKS AND MARKS ARE A CORRECTNESS SURFACE. A y-axis reading 200, 150, 100,
   * 110 is not an ugly chart; it is a false one, and it shipped once. */
  {
    id: 'series-baseline-truncated',
    file: 'src/canvas/render/shapes/SeriesShape.tsx',
    from: '    scale: plan.zeroBaseline !== true,',
    to: '    scale: true,',
    breaks: 'bar charts no longer start at zero, so a bar drawn twice as long as its neighbour is a difference of two percent',
  },
  {
    id: 'series-ticks-pinned-by-hand',
    file: 'src/canvas/render/shapes/SeriesShape.tsx',
    from: '    splitLine: splitLine(),',
    to: '    interval: 7,\n    splitLine: splitLine(),',
    breaks: 'the axis stops choosing its own gradations and takes a hand-typed one instead, which is how a chart ends up labelled 200, 150, 100, 110',
  },
  {
    id: 'bubble-radius-carries-the-value',
    file: 'src/canvas/render/shapes/SeriesShape.tsx',
    from: '  return BUBBLE_SPAN * Math.sqrt(value / largest)',
    to: '  return BUBBLE_SPAN * (value / largest)',
    breaks: 'a bubble worth four times another is drawn with sixteen times the ink, so every reading off the chart is squared',
  },

  /* THE CAUSAL CHAIN. Its connectors once painted nothing at all, and the row
   * a link belongs to is what tells the renderer which kind of connector it is. */
  {
    id: 'flow-wrap-unmarked',
    file: 'src/canvas/render/FlowView.tsx',
    from: '    const wrap = to.cy !== from.cy',
    to: '    const wrap = false',
    breaks: 'the connector that drops from the end of one row to the start of the next is drawn as an ordinary left-to-right step, so one chain reads as two',
  },

  /* TEACHING. A lesson handed over whole is a lecture, and a resolver that
   * always answers is a resolver that invents. */
  {
    id: 'beat-cap-lifted',
    file: 'src/canvas/teach/beats.ts',
    from: 'const MAX_BLOCKS_PER_BEAT = 3',
    to: 'const MAX_BLOCKS_PER_BEAT = 99',
    breaks: 'the whole lesson arrives in one go and the learner is never once asked whether any of it landed',
  },
  {
    id: 'beats-partition-check-inverted',
    file: 'src/canvas/teach/contract.ts',
    from: 'flat.some((id, i) => id !== order[i])',
    to: 'flat.some((id, i) => id === order[i])',
    breaks: 'every honestly cut lesson is refused as a broken partition, and the learner is shown a diagnostic where the lesson should be',
  },
  {
    id: 'doubt-answers-on-one-shared-word',
    file: 'src/canvas/teach/doubt.ts',
    from: '  if (matched >= 2 && matched / nameTokens.length >= HALF) return matched',
    to: '  if (matched >= 1) return matched',
    breaks: 'THE ANTI-HALLUCINATION REGRESSION: a learner asking what precision means in a physics lesson is confidently answered with a row about mean particle speed',
  },
  {
    id: 'doubt-coincidence-guard-removed',
    file: 'src/canvas/teach/doubt.ts',
    from: '  for (const token of typed) if (!known.has(token)) return true',
    to: '  for (const token of typed) if (!known.has(token)) return false',
    breaks: 'THE ANTI-HALLUCINATION REGRESSION: "how does humidity change this" hits the word "change" in a lesson that never mentions humidity and comes back as a confident table of pressures',
  },

  /* THE DISPATCH. Six finished renderers were once unreachable behind this
   * switch while 246 of their own tests passed, because every one of those
   * suites imports its shape module directly and none of them came through
   * here. A wired arm and a refusal that outranks it are both mutated. */
  {
    id: 'figure-matrix-arm-unwired',
    file: 'src/canvas/render/FigureView.tsx',
    from: '      return <MatrixShape data={data as unknown as MatrixData} at={block.id} />',
    to: '      return null',
    breaks: 'THE SHIPPED BUG, IN MINIATURE: the confusion matrix in the machine-learning lesson becomes a grey box reading "this kind of drawing has not been built", while the renderer that draws it sits finished and passing its own tests',
  },
  {
    id: 'figure-refusal-downgraded',
    file: 'src/canvas/render/FigureView.tsx',
    from: "  const rejected = checkFigure(block, block.id).filter((i) => i.level === 'reject')",
    to: '  const rejected = checkFigure(block, block.id).filter(() => false)',
    breaks: 'a figure that arrived without meeting the validator — a live edit, a fetch — is drawn from data that contradicts its own name, so the reader is shown an authoritative-looking picture of something nobody claimed',
  },

  /* TABLES. A cell can be wrong without looking wrong: every value renders as
   * SOMETHING, and only the formatting rules decide whether that something is
   * the number the data holds. */
  {
    id: 'table-failed-sum-printed-as-a-number',
    file: 'src/canvas/render/TableView.tsx',
    from: '  if (!Number.isFinite(value)) return { text: NO_VALUE, missing: true }',
    to: '  if (false) return { text: NO_VALUE, missing: true }',
    breaks: 'a division by zero upstream reaches the page as a cell reading "NaN", dressed as a measurement in a column of real ones',
  },
  {
    id: 'table-scientific-threshold-raised',
    file: 'src/canvas/render/TableView.tsx',
    from: 'const SCIENTIFIC_AT_OR_ABOVE = 1e6',
    to: 'const SCIENTIFIC_AT_OR_ABOVE = 1e9',
    breaks: 'a column of populations prints 602,000,000 in full and drags itself wide enough to crush every other column in the table, and the same quantity now reads one way in a metric block and another in a cell',
  },

  /* PROCESS DIAGRAMS. Three ways to mislead in the drawing rather than in the
   * data: the column a step lands in, a loop drawn like a step, and an arrow
   * that crosses between two actors in silence. */
  {
    id: 'process-loop-drawn-as-a-step',
    file: 'src/canvas/render/shapes/ProcessShape.tsx',
    from: "      if (seen === 1) backEdges.add(`${transition.from}>${transition.to}`)",
    to: "      if (false) backEdges.add(`${transition.from}>${transition.to}`)",
    breaks: 'a "reject, go back and rework it" transition is drawn as an ordinary left-to-right arrow, so the reader is shown a process that only ever moves forwards',
  },
  {
    id: 'process-handoff-unmarked',
    file: 'src/canvas/render/shapes/ProcessShape.tsx',
    from: '    const crossesLane = from.lane !== to.lane',
    to: '    const crossesLane = false',
    breaks: 'the moment work passes from one team to another — usually where a process actually goes wrong — is drawn exactly like a step inside one team, and vanishes from the description too',
  },
  {
    id: 'process-column-is-a-hop-count',
    file: 'src/canvas/render/shapes/ProcessShape.tsx',
    from: '      if (candidate > (layers.get(transition.to) ?? 0)) {',
    to: '      if ((layers.get(transition.to) ?? 0) === 0 && candidate > 0) {',
    breaks: 'a step reachable both directly and the long way round is drawn in the early column, so its own incoming arrow runs backwards past steps it came through and the reader reads a loop that is not there',
  },

  /* HEAT MAPS. Colour is the only encoding, so where the ends and the middle of
   * the scale sit IS the claim, and which axis is which decides whether the
   * reader is looking at precision or at recall. */
  {
    id: 'correlation-scale-follows-the-data',
    file: 'src/canvas/render/shapes/MatrixShape.tsx',
    from: "  if (data.variant === 'correlationMatrix') {",
    to: '  if (false) {',
    breaks: 'a weakly correlated matrix stretches r = 0.1 to r = 0.35 across the whole ramp, so r = 0.3 is painted the same deep colour that r = 0.95 gets in the matrix beside it',
  },
  {
    id: 'matrix-rows-read-bottom-to-top',
    file: 'src/canvas/render/shapes/MatrixShape.tsx',
    from: '      inverse: true,',
    to: '      inverse: false,',
    breaks: 'the first row of the data lands at the BOTTOM of the picture, so a confusion matrix read top-down off the screen is the transpose of the one in the numbers — precision read where recall is',
  },

  /* GRAPHS. A dependency graph and a feedback loop are the same data structure
   * and opposite claims, and a connector that passes over a box is a
   * relationship the data does not contain. */
  {
    id: 'dependency-graph-loses-its-direction',
    file: 'src/canvas/render/shapes/GraphShape.tsx',
    from: "  dependencyGraph: 'layered',",
    to: "  dependencyGraph: 'force',",
    breaks: 'a build-order diagram becomes a pleasant blob in which nothing is above anything else, so "this has to happen before that" is no longer readable off the page at all',
  },
  {
    id: 'connector-takes-the-first-route-it-tries',
    file: 'src/canvas/render/shapes/GraphShape.tsx',
    from: '  for (const candidate of candidates) {\n    const hits = countHits(candidate, others)\n    if (hits === 0) return candidate',
    to: '  for (const candidate of candidates) {\n    const hits = countHits(candidate, others)\n    if (hits >= 0) return candidate',
    breaks: 'a long connector is drawn straight over a node it has nothing to do with, and a line touching a box reads as a dependency the reader has no way to tell from a real one',
  },

  /* TREES. Separation is the claim: a tidy tree says these branches are
   * distinct, and a pyramid says this level is this much of the whole. */
  {
    id: 'tidy-siblings-may-touch',
    file: 'src/canvas/render/shapes/HierarchyShape.tsx',
    from: '          need = Math.max(need, (accRight[d] ?? 0) + spacing - (c.left[d] ?? 0))',
    to: '          need = Math.max(need, (accRight[d] ?? 0) - (c.left[d] ?? 0))',
    breaks: 'two branches of an issue tree are drawn touching, so a split the diagram exists to show reads as one merged blob of boxes',
  },
  {
    id: 'tidy-compares-only-the-top-row',
    file: 'src/canvas/render/shapes/HierarchyShape.tsx',
    from: '        const shared = Math.min(accRight.length, c.left.length)',
    to: '        const shared = Math.min(1, c.left.length)',
    breaks: 'a deep branch swings underneath its shallow neighbour and the two overlap three levels down, where the parents above them still look correctly spaced',
  },
  {
    id: 'pyramid-band-ignores-the-share',
    file: 'src/canvas/render/shapes/HierarchyShape.tsx',
    from: '      const w = PYRAMID_MIN_SLICE + spare * share',
    to: '      const w = PYRAMID_MIN_SLICE + spare / row.length',
    breaks: 'every block in a test pyramid is drawn the same width whatever it is worth, so the proportion between levels — the only thing a pyramid claims — is decoration',
  },

  /* DISTRIBUTIONS. The author supplies samples and every summary is derived, so
   * one wrong definition here is wrong in the same way on every chart. */
  {
    id: 'whisker-reaches-the-extreme',
    file: 'src/canvas/render/shapes/DistributionShape.tsx',
    from: '    whiskerHigh: inside[inside.length - 1] ?? sorted[sorted.length - 1] ?? Number.NaN,',
    to: '    whiskerHigh: sorted[sorted.length - 1] ?? Number.NaN,',
    breaks: 'the box stretches out to the single worst reading, so the one observation that was unusual stops looking unusual and is read as the ordinary top of the range',
  },
  {
    id: 'outliers-dropped-from-the-summary',
    file: 'src/canvas/render/shapes/DistributionShape.tsx',
    from: '    outliers,\n    count: sorted.length,',
    to: '    outliers: [],\n    count: sorted.length,',
    breaks: 'A HIDDEN OUTLIER IS A DELETED DATA POINT: the samples beyond the fences are drawn nowhere and counted nowhere, and the caption says none exists',
  },
  {
    id: 'quantile-stops-interpolating',
    file: 'src/canvas/render/shapes/DistributionShape.tsx',
    from: '  return low + (h - lo) * (high - low)',
    to: '  return low',
    breaks: 'every median, quartile and fence on the canvas jumps to the order statistic below it, so a box plot of eight samples reports a median nobody measured and the fences move with it',
  },

  /* PARTS OF A WHOLE. The arithmetic lies are refused upstream; these are the
   * lies that live in the drawing. */
  {
    id: 'waffle-loses-its-spare-cells',
    file: 'src/canvas/render/shapes/PartsShape.tsx',
    from: '  const spare = cellCount - floors.reduce((sum, f) => sum + f, 0)',
    to: '  const spare = 0',
    breaks: 'three equal thirds fill 99 of a hundred cells, so a grid a reader is invited to count comes up short and the missing cell belongs to nobody',
  },
  {
    id: 'waterfall-decrease-drawn-from-the-wrong-edge',
    file: 'src/canvas/render/shapes/PartsShape.tsx',
    from: '      base: Math.min(previous, running),',
    to: '      base: previous,',
    breaks: 'a bar showing churn is drawn hanging off the wrong end of the running total, so a fall of 25 is painted where a rise of 25 belongs',
  },
  {
    id: 'funnel-width-scale-leaves-zero',
    file: 'src/canvas/render/shapes/PartsShape.tsx',
    from: '        min: 0,',
    to: '        min: 1,',
    breaks: 'the width scale stops starting at zero, so a stage still holding a tenth of the top of the funnel is drawn as a hairline and reads as nothing left',
  },

  /* SCHEDULES. This renderer draws its own axis, so it cannot hand the tick
   * problem to a chart library — and a gantt without a critical path is a bar
   * chart of dates. */
  {
    id: 'gantt-axis-takes-a-raw-step',
    file: 'src/canvas/render/shapes/IntervalsShape.tsx',
    from: '  const step = niceStep(span > 0 ? span / Math.max(1, target) : 1)',
    to: '  const step = span > 0 ? span / Math.max(1, target) : 1',
    breaks: 'the time axis is labelled 0, 3.83, 7.67, 11.5 — a scale nobody chose, which makes reading a date off a bar guesswork',
  },
  {
    id: 'critical-path-counts-hops',
    file: 'src/canvas/render/shapes/IntervalsShape.tsx',
    from: '    const total = durationOf(item) + upstream',
    to: '    const total = 1 + upstream',
    breaks: 'the critical path is marked along the chain with the most tasks instead of the most days, so five one-day tasks outrank the ten-day task that is actually holding the project up',
  },
  {
    id: 'milestone-drawn-as-a-zero-width-bar',
    file: 'src/canvas/render/shapes/IntervalsShape.tsx',
    from: '        milestone: duration === 0,',
    to: '        milestone: false,',
    breaks: '"royal assent" — a dated event with no duration — is drawn as a rectangle of no width, which paints nothing, so the milestone is simply absent from the schedule',
  },

  /* ================================================================== */
  /* THE AI CAPABILITY LAYER                                            */
  /* ================================================================== */
  /* `src/agent/**` arrived with 433 tests and, until these, nothing
   * checking that any of them could fail — the exact condition the header
   * of this file describes the canvas having been in. Test COUNT is not
   * evidence: a suite can be broad in kind (unit, integration, end-to-end,
   * regression) and still assert only that dispatch happened.
   *
   * Every mutant below inverts a promise the layer states in writing, and
   * each one is aimed at a decision that FAILS SILENTLY when broken. That
   * is the selection rule: a mutant whose damage would be obvious in the
   * output teaches nothing, because a human would catch it. These all
   * produce a confident, well-formed, wrong result. */

  {
    id: 'agent-arithmetic-verification-always-passes',
    file: 'src/agent/verify/verify.ts',
    from: '  const ok = Math.abs(actual - stated) <= Math.max(tolerance, Math.abs(actual) * 1e-9)',
    to: '  const ok = true',
    breaks: 'the one check a user cannot perform themselves stops performing it: "17.5% of 2400 = 380" ships carrying a passing arithmetic verification, which is worse than shipping unverified because the verification is what earns the trust',
  },
  {
    id: 'agent-explicit-deletion-is-only-a-hide',
    file: 'src/agent/memory/memory.ts',
    from: '      p.write(p.read().filter((r) => r.id !== id))',
    to: '      p.write(p.read())',
    breaks: 'a user asks for something to be forgotten, is told it was, and the record stays on disk — a lie told with their own data, and the kind that only surfaces when someone reads the store directly',
  },
  {
    id: 'agent-every-tool-failure-is-retried',
    file: 'src/agent/tools/tools.ts',
    from: '    if (last.failure !== \'transient\') return last',
    to: '    if (false) return last',
    breaks: 'malformed arguments are re-sent unchanged and a DENIED action is attempted a second time — the recovery layer stops distinguishing weather from a decision somebody made',
  },
  {
    id: 'agent-effectful-tools-run-ungated',
    file: 'src/agent/tools/tools.ts',
    from: '  if (tool.effectful && !opts.allowEffects) {',
    to: '  if (false) {',
    breaks: 'anything that changes the world runs without permission, and it cannot be un-run; the gate exists precisely because a malformed delete is still a delete attempt',
  },
  {
    id: 'agent-partial-work-reported-as-finished',
    file: 'src/agent/execute/execute.ts',
    from: '    complete: done === steps.length && steps.length > 0,',
    to: '    complete: steps.length > 0,',
    breaks: 'a task whose remaining steps are all BLOCKED has also run out of things to do, so it reports itself complete — half-done work delivered as done, with a journal that says so',
  },
  {
    id: 'agent-disagreement-presented-at-full-confidence',
    file: 'src/agent/knowledge/knowledge.ts',
    from: '      confidence: conflict ? Math.min(base, 0.4) : base,',
    to: '      confidence: base,',
    breaks: 'two sources saying 6.2% and 4.9% produce one confidently-stated number; the split is laundered into certainty, which is the single failure the whole research path was shaped to prevent',
  },
  {
    id: 'agent-negation-stops-being-read',
    file: 'src/agent/understand/understand.ts',
    from: '    if (cur) scores.delete(n.kind)',
    to: '    if (false) scores.delete(n.kind)',
    breaks: '"explain closures, but do not search for this" searches anyway — the request is read as a bag of keywords, and the word the user used to REFUSE something becomes evidence for it',
  },
  {
    id: 'agent-unanswerable-requests-answered-anyway',
    file: 'src/agent/kernel/loop.ts',
    from: "  if (action.action === 'ask') {",
    to: '  if (false) {',
    breaks: '"fix it" with nothing yet named is handed to the model, which answers about whatever it guesses — a fluent, well-sourced answer to a question nobody asked, and harder to catch than no answer',
  },
  {
    id: 'agent-referent-ambiguity-no-longer-blocks',
    file: 'src/agent/kernel/router.ts',
    from: '  if (blocking) {',
    to: '  if (false) {',
    breaks: 'certainty about the verb is treated as certainty about the noun, so the agent acts confidently on a referent that does not exist',
  },
  {
    id: 'agent-single-fact-forced-into-a-table',
    file: 'src/agent/communicate/communicate.ts',
    from: '  const plural = s.cardinality >= 2',
    to: '  const plural = true',
    breaks: 'one number is rendered as a one-row comparison table — scaffolding built around nothing, which is how a system that "chooses representations" quietly becomes one that decorates',
  },
  {
    id: 'agent-a-stated-struggle-resets-the-learner',
    file: 'src/agent/learn/learn.ts',
    from: "      mastery.set(concept.id, 'partial')",
    to: "      mastery.set(concept.id, 'unknown')",
    breaks: 'someone who says "I struggle with integration" is treated as never having met integration, so the curriculum restarts them on material they have already sat through — the fastest way to lose a learner',
  },

  /* ---- The wiring, and the bug that made it necessary -------------------
   *
   * Everything above mutates a DECISION. The nine below mutate the WIRING,
   * because the wiring is where this layer actually failed: two modules and
   * five capabilities were selected, reported as used, and never executed,
   * and every unit test stayed green throughout.
   *
   * The selection rule is unchanged and matters more here than anywhere
   * else. A broken decision produces a wrong answer, which somebody
   * eventually notices. Broken wiring produces a CONFIDENT answer plus an
   * audit trail claiming the work was done, and nobody notices at all. */

  {
    id: 'agent-attached-file-is-never-actually-read',
    file: 'src/agent/kernel/loop.ts',
    from: "  if (selected.has('files')) {",
    to: '  if (false) {',
    breaks: 'the original bug, exactly: "summarise this PDF" answers from the model\'s own knowledge while the trace reports `files` among the capabilities used — an audit trail that lies in the one direction nobody checks, because everything looks wired',
  },
  {
    id: 'agent-trace-claims-capabilities-that-were-never-selected',
    file: 'src/agent/kernel/loop.ts',
    from: '  const didRun = (c: Capability) => void (selected.has(c) && executed.add(c))',
    to: '  const didRun = (c: Capability) => void executed.add(c)',
    breaks: 'the execution record over-claims, which is exactly as misleading as under-reporting: "communicate always runs" quietly puts an unselected capability into the trace, and the one guard that makes the record trustworthy is gone',
  },
  {
    id: 'agent-unmet-capability-loses-its-reason',
    file: 'src/agent/kernel/loop.ts',
    from: '  const couldNot = (c: Capability, why: string) => void (selected.has(c) && (unmet[c] = why))',
    to: "  const couldNot = (c: Capability) => void (selected.has(c) && (unmet[c] = ''))",
    breaks: '"I could not read your file" degrades to a bare flag, so the one thing that makes an absence debuggable — WHY it was absent — is dropped, and the capability is indistinguishable from one that silently did nothing',
  },
  {
    id: 'agent-failed-verification-is-reported-but-never-fixed',
    file: 'src/agent/kernel/loop.ts',
    from: '  const repairable = answering && degraded === undefined',
    to: '  const repairable = false',
    breaks: 'the system knows the answer misses a stated constraint and ships it unchanged, with the evidence attached where nobody reads it — verification becomes a report rather than a correction',
  },
  {
    id: 'agent-repair-loop-becomes-unbounded',
    file: 'src/agent/kernel/loop.ts',
    from: '      await verifyAndRepair({ answer, claims }, checks, repair, 1)',
    to: '      await verifyAndRepair({ answer, claims }, checks, repair, 12)',
    breaks: 'a check the repairer cannot satisfy burns twelve model calls per turn instead of one; latency and cost scale with failure, and the round count that would signal "the approach is wrong, not the output" is buried',
  },
  {
    id: 'agent-task-is-dropped-between-turns',
    file: 'src/agent/kernel/loop.ts',
    from: "    ...(task && task.status !== 'done' ? { task } : {}),",
    to: '    ...({}),',
    breaks: 'cross-session continuity dies silently: "carry on with what we started" starts a second task with a new id, abandoning the first plan and its journal, and every turn looks individually correct',
  },
  {
    id: 'agent-the-answer-step-runs-before-the-work',
    file: 'src/agent/kernel/loop.ts',
    from: '    after: specs.map((s) => s.goal),',
    to: '    after: [],',
    breaks: 'the synthesis step loses its dependencies, so `nextStep` can hand back "answer the goal" before any of the work it is meant to summarise has run — a confident summary of nothing',
  },
  {
    id: 'agent-production-agent-has-no-calculator',
    file: 'src/agent/index.ts',
    from: '  const tools = createRegistry([calculator, ...(opts.files ? fileTools(opts.files) : [])])',
    to: '  const tools = createRegistry([...(opts.files ? fileTools(opts.files) : [])])',
    breaks: 'the exact shape of the original defect: arithmetic passes every unit test and cannot work for a real caller, because the only registry the product builds does not contain a calculator',
  },
  {
    /* ANCHOR RE-POINTED, NOT RETIRED. `suspend()` changed from serialising the
     * task alone to writing the whole session, which moved this line. The
     * mutant is the same defect at the new address; deleting it because its
     * anchor drifted would have quietly dropped coverage of a bug that has
     * already happened once. */
    id: 'agent-suspended-task-resumes-stuck-mid-step',
    file: 'src/agent/index.ts',
    from: '        session = { ...session, task: pause(session.task, session.working, now()) }',
    to: '        session = { ...session, task: session.task }',
    breaks: 'an `active` task is serialised, so tomorrow it restores believing a step is still running — `nextStep` skips it, nothing is pending, and the task reports itself stuck the moment someone comes back to it',
  },

  /* THE TEACHING LEDGER. Four mutants, and the bar for each was: does this
   * reproduce a defect that ACTUALLY OCCURRED, rather than one that could?
   * All four are measured failures from this repository, not hypotheses. */
  {
    /* THE ONLY ONE OF TWENTY-THREE THAT SURVIVED. Twenty-three mutants were
     * applied to the ledger before it shipped; twenty-two died. This one
     * lived, and the gap was real: the corrupt-blob test used `version`, which
     * is the LEDGER's field name, so that case was being refused for having no
     * `conversation` rather than for its version. One version gate was tested
     * twice and the other not at all. A mutant that has caught something is
     * evidence; the other twenty-two are hypotheses. */
    id: 'agent-session-envelope-version-ignored',
    file: 'src/agent/session/persist.ts',
    from: '  if (raw.v !== SESSION_VERSION) {',
    to: '  if (false) {',
    breaks: 'a session written by a different build is read as if its shape had not changed, so a field added since is silently absent and the lesson resumes from a position half of which was never in the file',
  },
  {
    /* OCCURRED. `established` accepted `advanced` as evidence of exposure, so
     * opening a session on `quad` reported the student as exposed to
     * quadratics before a single thing had been taught. */
    id: 'agent-intent-to-teach-counts-as-having-taught',
    file: 'src/agent/session/ledger.ts',
    from: "  const seen = l.log.some((e) => e.conceptId === conceptId && e.kind === 'shown')",
    to: "  const seen = l.log.some((e) => e.conceptId === conceptId && (e.kind === 'shown' || e.kind === 'advanced'))",
    breaks: 'the teacher moving the lesson to a concept counts as the student having seen it, so a curriculum skips material that was never presented and the log agrees it was',
  },
  {
    /* OCCURRED, measured: the identical `Turn` applied twice took `turnIndex`
     * from 1 to 2 and appended the goal twice. */
    id: 'agent-retry-counted-as-a-second-turn',
    file: 'src/agent/session/wire.ts',
    from: '  const claimed = beginTurn(l, id)\n  if (claimed.alreadySeen) return l',
    to: '  const claimed = beginTurn(l, id)',
    breaks: 'a network retry appends to the evidence log a second time, so a student who asked once is recorded as having asked twice and the learner model drifts toward over-confidence with nothing to notice',
  },
  {
    /* OCCURRED, measured on a conversation already about quadratics:
     * "continue" produced entities [quadratics, continue] and topicShift=true.
     * The word whose entire meaning is "do not change the subject". */
    id: 'agent-continue-reads-as-a-new-subject',
    file: 'src/agent/understand/understand.ts',
    from: "  'continue', 'continues', 'continuing', 'carry', 'keep', 'keeps', 'going',",
    to: "  'continues', 'continuing', 'carry', 'keep', 'keeps', 'going',",
    breaks: 'asking to carry on is read as changing the subject, so the lesson pushes a detour that never happened and the position the student wanted resumed is buried one frame deeper each time they say it',
  },
]

/*
 * SCOPED FIRST, FULL ONLY TO CONFIRM A SURVIVOR.
 *
 * Running all 950 tests per mutant is what makes this gate 512 seconds of a
 * 14-minute CI job — 39 mutants x ~13s on a runner, which matches the measured
 * total to the second.
 *
 * The obvious cure is to run only the tests "related to" the mutated file, and
 * on its own that is a WEAKENING, not an optimisation: a mutant killed only by
 * a distant test would report as SURVIVING, and the gate would then claim a
 * coverage gap that does not exist. A gate lying in the direction that looks
 * like rigour is worse than a slow one, because a false survivor generates work
 * to fix nothing and spends the credibility of every real survivor after it.
 *
 * What makes scoping sound here is the asymmetry: a scoped run can produce a
 * false SURVIVOR, but never a false KILL. If a test in the scoped subset fails,
 * a real test really did fail on this mutant, and the full suite contains that
 * same test. So a scoped kill is final, and only a scoped SURVIVAL is
 * re-checked against everything. The verdict set comes out identical to running
 * the full suite every time; only the wall clock moves.
 *
 * `--changed HEAD` is how the subset is chosen, and it is chosen by vitest's own
 * module graph rather than by a list here that would drift: the gate has already
 * written the mutant into the file, so vitest sees exactly one changed file and
 * walks its importers. Measured on this repo, mutating GraphShape selects 4 test
 * files including FigureView's, which imports it transitively — the case a
 * hand-written mapping gets wrong.
 *
 * PRECISION IS NOT A CORRECTNESS REQUIREMENT. If the subset is too narrow the
 * mutant survives it and gets the full run anyway. Being wrong here costs time,
 * never accuracy, which is the property that makes this safe to ship.
 */
function vitest(outFile, { scoped = false } = {}) {
  const args = ['vitest', 'run', '--reporter=json', `--outputFile=${outFile}`]
  if (scoped) args.push('--changed', 'HEAD')
  try {
    execFileSync(
      'npx',
      args,
      { stdio: 'ignore', cwd: process.cwd() },
    )
  } catch {
    /* Non-zero exit is the expected result for a killed mutant. The JSON file
     * is what carries the verdict, so a throw here is not itself an answer. */
  }
  try {
    return JSON.parse(readFileSync(outFile, 'utf8'))
  } catch {
    return null
  }
}

/* A lock from a previous run means that run died without restoring. Refusing
 * is the only safe move: mutating on top of already-mutated source would make
 * every later result meaningless and bury the original damage. */
if (existsSync(LOCK)) {
  const stale = readFileSync(LOCK, 'utf8').trim()
  process.stdout.write(
    `::error file=frontend/${LOCK},title=mutation gate did not clean up::`
    + `A previous run was killed while ${stale} held mutated source. `
    + `Restore that file with \`git checkout -- <file>\` after confirming you have no `
    + `uncommitted work in it, then delete frontend/${LOCK}.\n`,
  )
  process.exit(1)
}

/*
 * SHARDING: WALL CLOCK ONLY, NEVER COVERAGE.
 *
 * `--shard i/n` runs every n-th mutant. Each shard is a separate CI runner with
 * its own checkout, so no two shards ever mutate the same working tree — which
 * matters more than it sounds: this script rewrites real source files and
 * restores them in a `finally`, and two writers in one tree could leave a
 * mutant behind that the lock file names singularly.
 *
 * Every mutant still runs against the whole catalogue's rules. Nothing is
 * skipped, nothing is sampled — the set is partitioned, and the union of the
 * shards is exactly the set one machine would have run. A shard that reports
 * 10/10 killed is not claiming the other 29 passed; the workflow requires all
 * shards to succeed.
 */
const shardArg = process.argv.find((a) => a.startsWith('--shard='))
let shardIndex = 1
let shardCount = 1
if (shardArg) {
  const [i, n] = shardArg.slice('--shard='.length).split('/').map(Number)
  if (!Number.isInteger(i) || !Number.isInteger(n) || n < 1 || i < 1 || i > n) {
    process.stdout.write(`canvas-mutation-gate: bad --shard value ${shardArg}\n`)
    process.exit(1)
  }
  shardIndex = i
  shardCount = n
}

const MINE = MUTANTS.filter((_, at) => at % shardCount === shardIndex - 1)

/*
 * AN EMPTY SHARD IS A BUG, NOT A PASS.
 *
 * Without this, `--shard=99/100` selected nothing, printed
 * `0/0 killed (0%)` and then `PASS — every curated mutant was killed`, and
 * exited 0. A gate that reports success on work it never did is worse than no
 * gate: it is the exact defect this script exists to catch, in the script
 * itself. `killed/scored` with `scored === 0` is vacuously true, which is how
 * it read as a pass.
 *
 * A shard count above the catalogue size is a configuration mistake — the
 * workflow asking for more parallelism than there is work. Failing loudly is
 * the only honest answer, because the alternative is a green check mark that
 * means nothing.
 */
if (MINE.length === 0) {
  process.stdout.write(
    `canvas-mutation-gate: FAIL — shard ${shardIndex}/${shardCount} selected no mutants `
    + `from a catalogue of ${MUTANTS.length}. A shard with nothing to run cannot pass.\n`,
  )
  process.exit(1)
}

const tmp = mkdtempSync(join(tmpdir(), 'canvas-mutation-'))
const out = join(tmp, 'run.json')

process.stdout.write('canvas-mutation-gate: establishing the baseline\n')
const base = vitest(out)
if (!base || base.numFailedTests > 0) {
  process.stdout.write('::error title=mutation gate::The suite is not green before mutating. Fix the suite first.\n')
  process.exit(1)
}
/*
 * MEASURED, NEVER PINNED.
 *
 * A literal here would be a second place the suite's size is recorded, and the
 * only one nobody updates: it moved 626 -> 718 -> 736 while this catalogue was
 * being rebuilt, in a single afternoon. Pinned, every one of those additions
 * would have reported fifteen INVALID mutants and named the wrong cause. What
 * the gate actually needs is that the count does not move BETWEEN the baseline
 * and a mutated run, which is a comparison against this value, not against a
 * number typed last month.
 */
const BASE_TOTAL = base.numTotalTests
process.stdout.write(`canvas-mutation-gate: baseline ${BASE_TOTAL} tests, 0 failed\n\n`)

const survived = []
const invalid = []
let killed = 0

if (shardCount > 1) {
  process.stdout.write(
    `canvas-mutation-gate: shard ${shardIndex}/${shardCount} — ${MINE.length} of ${MUTANTS.length} mutants\n\n`,
  )
}

for (const m of MINE) {
  const original = readFileSync(m.file, 'utf8')
  if (!original.includes(m.from)) {
    invalid.push({ ...m, why: 'the mutation target no longer exists in the source' })
    process.stdout.write(`  STALE     ${m.id}\n`)
    continue
  }
  let r
  let scopedOnly = false
  inFlight = { file: m.file, original }
  writeFileSync(LOCK, `${m.id} -> ${m.file}`)
  try {
    writeFileSync(m.file, original.replace(m.from, m.to))
    /* Scoped first. A kill here is final — see the note on `vitest()`. */
    r = vitest(out, { scoped: true })
    /* The rule, and the reason for it, live in mutation-verdict.mjs. It is a
     * separate module because this file runs on import and runs vitest, so the
     * predicate was unreachable from any test until it moved. */
    scopedOnly = isScopedKill(r)
    if (!scopedOnly) {
      /* Survived the subset, or the subset could not be scored. Either way the
         answer is not trustworthy yet, so pay for the full suite. */
      r = vitest(out)
    }
  } finally {
    /* Unconditional. A throw anywhere above must not leave the tree broken. */
    restoreInFlight()
  }

  if (!r || (!scopedOnly && r.numTotalTests !== BASE_TOTAL)) {
    /* A syntax error reports zero tests and exits non-zero, which is
     * indistinguishable from a kill unless the count is checked.
     *
     * The count is only meaningful against a FULL run, so it is skipped when a
     * scoped subset already killed the mutant — that subset legitimately ran
     * fewer tests than the baseline. A scoped run that fails to score at all
     * (`r === null`) still falls through to the full run above, so a syntax
     * break cannot hide here. */
    invalid.push({ ...m, why: `ran ${r ? r.numTotalTests : 0} tests, expected ${BASE_TOTAL}` })
    process.stdout.write(`  INVALID   ${m.id}\n`)
    continue
  }
  if (r.numFailedTests > 0) {
    killed++
    process.stdout.write(
      `  killed    ${m.id}  (${r.numFailedTests} test(s) caught it${scopedOnly ? ', scoped' : ''})\n`,
    )
  } else {
    survived.push(m)
    process.stdout.write(`  SURVIVED  ${m.id}\n`)
  }
}

const scored = MINE.length - invalid.length
const score = scored ? killed / scored : 0
process.stdout.write(`\ncanvas-mutation-gate: ${killed}/${scored} killed (${(score * 100).toFixed(0)}%)\n`)

for (const m of survived) {
  process.stdout.write(
    `::error file=${m.file},title=surviving mutant ${m.id}::`
    + `No test failed when this was changed. It breaks: ${m.breaks}. `
    + `A defect the suite cannot see is a defect that ships.\n`,
  )
}
for (const m of invalid) {
  process.stdout.write(
    `::warning file=${m.file},title=mutant ${m.id} could not be scored::${m.why}\n`,
  )
}

/* EVERY curated mutant must die. This is not a percentage target: each one
 * re-creates a defect that actually reached a user on this branch, so a
 * survivor is a regression in the suite's ability to see it. */
if (survived.length > 0) {
  process.stdout.write(`\ncanvas-mutation-gate: FAIL — ${survived.length} mutant(s) survived\n`)
  process.exit(1)
}
if (invalid.length > 0) {
  process.stdout.write(
    '\ncanvas-mutation-gate: FAIL — a mutant could not be applied. Either the source '
    + 'moved and the catalogue needs updating, or the mutation broke the build.\n',
  )
  process.exit(1)
}
process.stdout.write('canvas-mutation-gate: PASS — every curated mutant was killed\n')
