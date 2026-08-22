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
 * So the canvas had 418 unit tests and 25 browser tests with NO automated
 * check that any of them could fail. That is not hypothetical. A manual
 * mutation run over the four files repaired on this branch scored 15/25:
 * flipping the pie chart's arc sweep flag inverted every sector and passed,
 * because the only assertion on path data was `toMatch(/A/)` -- an arc COMMAND
 * exists, not a correct arc. Dropping `* 100` from the legend passed because a
 * <title> tooltip computed the percentage independently. The suite protected
 * the DISPATCH and almost nothing about the DRAWING.
 *
 * Those specific holes are now closed. This gate exists so the next ten are
 * found by CI instead of by hand.
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

/** Each mutant re-creates a defect that shipped, or inverts a stated rule. */
const MUTANTS = [
  {
    id: 'chart-pie-sweep',
    file: 'src/canvas/panels/ChartPanel.tsx',
    from: 'A ${radius} ${radius} 0 ${largeArc} 1 ${ex.toFixed(2)}',
    to: 'A ${radius} ${radius} 0 ${largeArc} 0 ${ex.toFixed(2)}',
    breaks: 'every pie sector sweeps the wrong way; the chart is visually inverted',
  },
  {
    id: 'chart-legend-percent',
    file: 'src/canvas/panels/ChartPanel.tsx',
    from: "· {Math.round(s.fraction * 100)}%",
    to: "· {Math.round(s.fraction)}%",
    breaks: 'the visible legend reads 1% instead of 55%',
  },
  {
    id: 'chart-zero-total-guard',
    file: 'src/canvas/panels/ChartPanel.tsx',
    from: 'if (!usable.length || total <= 0) {',
    to: 'if (false) {',
    breaks: 'a zero-total pie draws an empty circle instead of refusing',
  },
  {
    id: 'chart-zero-slice',
    file: 'src/canvas/panels/ChartPanel.tsx',
    from: 'Number.isFinite(s.value) && s.value > 0',
    to: 'Number.isFinite(s.value) && s.value >= 0',
    breaks: 'a zero-valued slice draws a zero-width wedge',
  },
  {
    id: 'flow-target-face',
    file: 'src/canvas/layout/flow.ts',
    from: 'const x1 = east ? b.x : b.x + b.w',
    to: 'const x1 = b.x',
    breaks: 'THE ORIGINAL ARROW BUG: every wire enters the target left face',
  },
  {
    id: 'flow-source-face',
    file: 'src/canvas/layout/flow.ts',
    from: 'const x0 = east ? a.x + a.w : a.x',
    to: 'const x0 = a.x + a.w',
    breaks: 'THE ORIGINAL ARROW BUG: every wire leaves the source right face',
  },
  {
    id: 'flow-bow-magnitude',
    file: 'src/canvas/layout/flow.ts',
    from: 'const bow = Math.max(arrow.minBow, Math.abs(x1 - x0) * arrow.curvature)',
    to: 'const bow = arrow.minBow',
    breaks: 'curvature stops scaling with span; a 3x visual change in arrow shape',
  },
  {
    id: 'measure-overflows-false',
    file: 'src/canvas/renderer/measure.ts',
    from: '    overflows: widthOverflow || heightOverflow,',
    to: '    overflows: false,',
    breaks: 'THE VACUOUS VALIDATOR: noOverflow can never fail again',
  },
  {
    id: 'measure-rows-literal',
    file: 'src/canvas/renderer/measure.ts',
    from: '    rows: Math.max(1, Math.round(el.getBoundingClientRect().height / GRID_ROW_PX)),',
    to: '    rows: 3,',
    breaks: 'THE VACUOUS VALIDATOR: the other fabricated literal returns',
  },
  {
    id: 'measure-intentional-scroll',
    file: 'src/canvas/renderer/measure.ts',
    from: "const scrollsOnPurpose = el.querySelector('[data-overflow=\"scroll\"]') !== null",
    to: 'const scrollsOnPurpose = false',
    breaks: 'every intentional table scroller counts as a layout fault again',
  },
  {
    id: 'renderer-invariants-ignored',
    file: 'src/canvas/renderer/LessonRenderer.tsx',
    from: 'const violated = invariants.filter((i) => !i.holds)',
    to: 'const violated: typeof invariants = []',
    breaks: 'a representation that cannot be honest is drawn anyway',
  },
  {
    id: 'renderer-unmeasured-desktop',
    file: 'src/canvas/renderer/LessonRenderer.tsx',
    from: 'const UNMEASURED_VIEWPORT = { width: 360, height: 640 } as const',
    to: 'const UNMEASURED_VIEWPORT = { width: 1200, height: 800 } as const',
    breaks: 'the pre-measurement frame guesses a desktop on a phone again',
  },
  {
    id: 'renderer-empty-degradation',
    file: 'src/canvas/renderer/LessonRenderer.tsx',
    from: '  if (!hasContent(dNormalized)) return null',
    to: '  if (false) return null',
    breaks: 'an empty chart degrades to a table with headers and no body',
  },
  {
    id: 'table-scroll-attribute',
    file: 'src/canvas/panels/TablePanel.tsx',
    from: '        data-overflow="scroll"\n',
    to: '',
    breaks: 'the measurement layer can no longer tell disclosure from a defect',
  },
  {
    id: 'simulation-named-model',
    file: 'src/canvas/contract/representations/simulation.ts',
    from: '    if (!isObj(payload.model)) {',
    to: '    if (false) {',
    breaks: 'a named model is accepted, putting hardcoded physics back in the engine',
  },

  /* THE LAYOUT VALIDATOR. Its whole job is to refuse a frame, so every mutant
   * here is a way for it to stop refusing -- the failure mode where the gate
   * is present, green, and enforcing nothing. */
  {
    id: 'validate-tap-floor',
    file: 'src/canvas/layout/validate.ts',
    from: 'const MIN_TAP = 40',
    to: 'const MIN_TAP = 0',
    breaks: 'the 40px accessibility floor stops existing; minTapTarget can never fail',
  },
  {
    id: 'validate-contrast-floor',
    file: 'src/canvas/layout/validate.ts',
    from: 'const AA_CONTRAST = 4.5',
    to: 'const AA_CONTRAST = 0',
    breaks: 'WCAG AA contrast stops being checked; unreadable text passes',
  },
  {
    id: 'validate-collision-boundary',
    file: 'src/canvas/layout/validate.ts',
    from: 'const overlap = a.col <= c.col + c.span - 1 && c.col <= a.col + a.span - 1',
    to: 'const overlap = a.col < c.col + c.span - 1 && c.col < a.col + a.span - 1',
    breaks: 'blocks sharing exactly one column no longer count as colliding',
  },
  {
    id: 'validate-always-passes',
    file: 'src/canvas/layout/validate.ts',
    from: '    if (!failed.length) {',
    to: '    if (true) {',
    breaks: 'a frame that failed its checks is reported as passed and painted',
  },
  {
    id: 'validate-repair-passes',
    file: 'src/canvas/layout/validate.ts',
    from: 'const MAX_PASSES = 3',
    to: 'const MAX_PASSES = 1',
    breaks: 'the repair ladder gives up after one rung instead of three',
  },

  /* THE SELECTOR. "ORDER IS THE DESIGN" is a written claim in archetypes.ts;
   * these mutants are what it would mean for that claim to be false. */
  {
    id: 'archetype-simulation-first',
    file: 'src/canvas/layout/archetypes.ts',
    from: '  if (p.hasSimulation) {',
    to: '  if (false) {',
    breaks: 'a lesson the learner can manipulate stops selecting EXPLORATORY',
  },
  {
    id: 'archetype-comparison-primary',
    file: 'src/canvas/layout/archetypes.ts',
    from: '  if (p.hasComparison && p.primaryCount === 1) {',
    to: '  if (p.hasComparison) {',
    breaks: 'COMPARISON wins with many primaries, where it is not the lesson',
  },
  {
    id: 'archetype-data-threshold',
    file: 'src/canvas/layout/archetypes.ts',
    from: '  if (p.dataMass > 0.5) {',
    to: '  if (p.dataMass > 0.05) {',
    breaks: 'one table in a prose lesson selects DATA',
  },
  {
    id: 'archetype-text-threshold',
    file: 'src/canvas/layout/archetypes.ts',
    from: '  if (p.textMass > 0.6) {',
    to: '  if (p.textMass > 0.06) {',
    breaks: 'almost anything selects NARRATIVE, collapsing the grammar to one shape',
  },

  /* DENSITY IS A CAPACITY POLICY. If compact stops being compact, the whole
   * disclosure ladder is decoration. */
  {
    id: 'disclosure-compact-capacity',
    file: 'src/canvas/layout/disclosure.ts',
    from: '    initialItems: 5, initialRows: 8,',
    to: '    initialItems: 50, initialRows: 80,',
    breaks: 'compact density discloses as much as relaxed; the ladder does nothing',
  },
  {
    id: 'simulation-reduced-motion',
    file: 'src/canvas/contract/representations/simulation.ts',
    from: "      dimension: wide && !reduced ? '3D' : '2D',",
    to: "      dimension: wide ? '3D' : '2D',",
    breaks: 'a reader who asked for less motion gets the animated WebGL box anyway',
  },
  {
    id: 'disclosure-compact-strategies',
    file: 'src/canvas/layout/disclosure.ts',
    from: '    collapseAsides: true, allowPagination: true,',
    to: '    collapseAsides: false, allowPagination: false,',
    breaks: 'compact loses both escape hatches, so overflow has nowhere to go',
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
