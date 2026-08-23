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
]

function vitest(outFile) {
  try {
    execFileSync(
      'npx',
      ['vitest', 'run', '--reporter=json', `--outputFile=${outFile}`],
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

for (const m of MUTANTS) {
  const original = readFileSync(m.file, 'utf8')
  if (!original.includes(m.from)) {
    invalid.push({ ...m, why: 'the mutation target no longer exists in the source' })
    process.stdout.write(`  STALE     ${m.id}\n`)
    continue
  }
  let r
  inFlight = { file: m.file, original }
  writeFileSync(LOCK, `${m.id} -> ${m.file}`)
  try {
    writeFileSync(m.file, original.replace(m.from, m.to))
    r = vitest(out)
  } finally {
    /* Unconditional. A throw anywhere above must not leave the tree broken. */
    restoreInFlight()
  }

  if (!r || r.numTotalTests !== BASE_TOTAL) {
    /* A syntax error reports zero tests and exits non-zero, which is
     * indistinguishable from a kill unless the count is checked. */
    invalid.push({ ...m, why: `ran ${r ? r.numTotalTests : 0} tests, expected ${BASE_TOTAL}` })
    process.stdout.write(`  INVALID   ${m.id}\n`)
    continue
  }
  if (r.numFailedTests > 0) {
    killed++
    process.stdout.write(`  killed    ${m.id}  (${r.numFailedTests} test(s) caught it)\n`)
  } else {
    survived.push(m)
    process.stdout.write(`  SURVIVED  ${m.id}\n`)
  }
}

const scored = MUTANTS.length - invalid.length
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
