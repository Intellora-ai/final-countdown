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
 * THE CATALOGUE WAS REBUILT WHEN THE CANVAS WAS.
 *
 * The hand-positioned panel renderer this gate first targeted -- `panels/`,
 * `renderer/`, `layout/flow.ts` -- no longer exists. Every mutant below is
 * aimed at the data-driven lesson engine that replaced it, and each one was
 * confirmed against the source and then run, so the list is a record of what
 * the suite CAN see rather than a list of what it ought to. Where a mutant
 * survives it is left in place and says so; a curated survivor is the most
 * useful thing this file produces.
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
     * A KNOWN SURVIVOR, AND IT IS LEFT HERE ON PURPOSE.
     *
     * Every test of the layout invariants runs them over a frame `plan`
     * produced, and `plan` is correct, so all four checks are only ever
     * observed AGREEING. Nothing anywhere hands `checkFrame` a frame that is
     * genuinely broken, which means `ok: true` is indistinguishable from the
     * real thing and this mutant cannot die. The same is true of `noOverflow`,
     * `noOrphanEdge`, `noAccidentalVoid` and `frameIsSafe`.
     *
     * `stack-shares-an-occupied-band` above is the other half of the pincer and
     * it dies loudly: it breaks the PLANNER and twelve tests notice, by way of
     * `noCollision` firing. So the detector demonstrably works — what is
     * missing is any test that would notice it being switched off.
     *
     * What kills it: a test in `layout.test.ts` that builds a `Frame` by hand
     * with two blocks overlapping in one band and asserts `noCollision(frame)`
     * returns `ok: false` naming both. Deleting this entry to make the run
     * green would delete the finding, which is the one thing this file is for.
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
