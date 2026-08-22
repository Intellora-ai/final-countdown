/* THE FIXTURE MANIFEST — every board the picker and the gallery can load.
 *
 * Loaders are dynamic import() thunks, which is what makes the loading state
 * honest: there is a real async boundary between choosing a fixture and
 * holding its data. Every loader returns BoardSource — even the fixtures
 * authored as LearningBoard — because the validator is the only door, and the
 * door does not care how well-typed you claim to be on the other side.
 *
 * WHY THE ENTRIES CARRY MORE THAN A LABEL NOW. The scenario coverage claim
 * ("24 scenarios exist, all valid ones validate with zero notices") used to be
 * a hand-written list of five fixtures inside a test file, which meant adding a
 * fixture proved nothing until somebody remembered to edit that list. The
 * expectation and the scenarios each fixture covers are declared HERE, beside
 * the fixture, and the test iterates this manifest. A fixture that is added and
 * forgotten now fails a test instead of quietly widening a gap.
 */
import type { BoardSource } from '../types/learningBoard'

/** What validateBoard must say about a fixture. Declared, then checked.
 *
 *   ok        validates cleanly with zero notices. Nothing was repaired,
 *             truncated, dropped or downgraded.
 *   repaired  survives, but the board is told what changed. Every invalid
 *             fixture that demonstrates a repair lives here.
 *   failed    refused at the root. The board cannot be shown at all.
 */
export type FixtureExpectation = 'ok' | 'repaired' | 'failed'

/** The scenarios the milestone requires the gallery to cover. */
export type ScenarioTag =
  | 'explanation-only'
  | 'explanation-equation'
  | 'table-heavy'
  | 'pie-chart'
  | 'bar-chart'
  | 'line-chart'
  | 'timeline'
  | 'process'
  | 'comparison'
  | 'diagram'
  | 'quiz'
  | 'image'
  | 'simulation'
  | 'multiple-connected-blocks'
  | 'empty-content'
  | 'long-text'
  | 'long-labels'
  | 'large-tables'
  | 'invalid-chart-values'
  | 'unsupported-block-types'
  | 'broken-connectors'
  | 'mobile-layout'
  | 'reduced-motion'
  | 'progressive-teaching'

/* The 24. A test asserts every one of these is claimed by some fixture, so
 * this array is the coverage requirement rather than a description of it. */
export const REQUIRED_SCENARIOS: readonly ScenarioTag[] = [
  'explanation-only', 'explanation-equation', 'table-heavy',
  'pie-chart', 'bar-chart', 'line-chart',
  'timeline', 'process', 'comparison', 'diagram',
  'quiz', 'image', 'simulation', 'multiple-connected-blocks',
  'empty-content', 'long-text', 'long-labels', 'large-tables',
  'invalid-chart-values', 'unsupported-block-types', 'broken-connectors',
  'mobile-layout', 'reduced-motion', 'progressive-teaching',
]

export type FixtureSubject =
  | 'mathematics' | 'physics' | 'chemistry' | 'biology'
  | 'history' | 'geography' | 'economics' | 'data'
  /* Fixtures that demonstrate validator behaviour rather than a subject. */
  | 'none'

export interface FixtureEntry {
  id: string
  /** Picker label. */
  label: string
  /** Header eyebrow; boards without curriculum context use a plain label. */
  eyebrow: string
  subject: FixtureSubject
  /** Scenarios this fixture demonstrates; the primary one first. */
  scenarios: ScenarioTag[]
  /** What the validator must say. Checked by fixtures.test.ts. */
  expect: FixtureExpectation
  /** Shown as a header pill. The rest are reachable from the gallery, because
   *  twenty-five pills do not fit a phone and stop being a choice. */
  featured?: boolean
  load: () => Promise<BoardSource>
}

export const FIXTURES: FixtureEntry[] = [
  {
    id: 'change-of-state',
    label: 'Chemistry',
    eyebrow: '', // resolved from the curriculum at load time, see below
    subject: 'chemistry',
    /* The only fixture with an authored multi-step lesson, so it is where
     * progressive teaching and reduced motion are actually exercised. */
    scenarios: ['progressive-teaching', 'reduced-motion'],
    expect: 'ok',
    featured: true,
    load: () => import('./change-of-state').then((m) => m.CHANGE_OF_STATE_BOARD as BoardSource),
  },
  {
    id: 'maths-quadratic',
    label: 'Mathematics',
    eyebrow: 'MATHEMATICS · QUADRATIC FORMULA',
    subject: 'mathematics',
    scenarios: ['explanation-equation'],
    expect: 'ok',
    featured: true,
    load: () => import('./maths-quadratic').then((m) => m.MATHS_QUADRATIC_BOARD as BoardSource),
  },
  {
    id: 'history-timeline',
    label: 'History',
    eyebrow: 'HISTORY · THE PRINT REVOLUTION',
    subject: 'history',
    scenarios: ['timeline'],
    expect: 'ok',
    featured: true,
    load: () => import('./history-timeline').then((m) => m.HISTORY_TIMELINE_BOARD as BoardSource),
  },
  {
    id: 'data-lesson',
    label: 'Data',
    eyebrow: 'DATA · READING A BUDGET',
    subject: 'data',
    scenarios: ['pie-chart'],
    expect: 'ok',
    featured: true,
    load: () => import('./data-lesson').then((m) => m.DATA_LESSON_BOARD as BoardSource),
  },
  {
    id: 'biology-cell',
    label: 'Biology',
    eyebrow: 'BIOLOGY · THE CELL',
    subject: 'biology',
    scenarios: ['diagram'],
    expect: 'ok',
    featured: true,
    load: () => import('./biology-cell').then((m) => m.BIOLOGY_CELL_BOARD as BoardSource),
  },
  {
    id: 'empty-board',
    label: 'Empty',
    eyebrow: 'FIXTURE · EMPTY BOARD',
    subject: 'none',
    scenarios: ['empty-content'],
    /* Zero blocks is a valid board, not a failure: the empty state is a state,
     * and the validator has nothing to repair. */
    expect: 'ok',
    featured: true,
    load: () => import('./empty-board').then((m) => m.EMPTY_BOARD as BoardSource),
  },
  {
    id: 'broken-board',
    label: 'Broken',
    eyebrow: 'FIXTURE · VALIDATOR DEMONSTRATION',
    subject: 'none',
    /* Nine planted faults at once. The three single-fault fixtures below carry
     * the required tags; this one shows what a pile-up looks like. */
    scenarios: [],
    expect: 'repaired',
    featured: true,
    load: () => import('./broken-board').then((m) => m.BROKEN_BOARD),
  },
  {
    id: 'invalid-board',
    label: 'Invalid',
    eyebrow: 'FIXTURE · ROOT REFUSAL DEMONSTRATION',
    subject: 'none',
    scenarios: [],
    expect: 'failed',
    featured: true,
    load: () => import('./invalid-board').then((m) => m.INVALID_BOARD),
  },

  /* ── Phase 4 scenario gallery ──────────────────────────────────────────── */

  {
    id: 'physics-inertia',
    label: 'Inertia',
    eyebrow: 'PHYSICS · NEWTON’S FIRST LAW',
    subject: 'physics',
    scenarios: ['explanation-only'],
    expect: 'ok',
    load: () => import('./physics-inertia').then((m) => m.PHYSICS_INERTIA_BOARD as BoardSource),
  },
  {
    id: 'physics-motion',
    label: 'Motion graph',
    eyebrow: 'PHYSICS · VELOCITY AND TIME',
    subject: 'physics',
    scenarios: ['line-chart'],
    expect: 'ok',
    load: () => import('./physics-motion').then((m) => m.PHYSICS_MOTION_BOARD as BoardSource),
  },
  {
    id: 'physics-gas-pressure',
    label: 'Gas pressure',
    eyebrow: 'PHYSICS · PRESSURE AND TEMPERATURE',
    subject: 'physics',
    scenarios: ['simulation'],
    expect: 'ok',
    load: () => import('./physics-gas-pressure').then((m) => m.PHYSICS_GAS_PRESSURE_BOARD as BoardSource),
  },
  {
    id: 'chemistry-periodic-trends',
    label: 'Periodic trends',
    eyebrow: 'CHEMISTRY · PERIODIC TRENDS',
    subject: 'chemistry',
    scenarios: ['table-heavy'],
    expect: 'ok',
    load: () => import('./chemistry-periodic-trends').then((m) => m.CHEMISTRY_PERIODIC_TRENDS_BOARD as BoardSource),
  },
  {
    id: 'geography-climate',
    label: 'Rainfall',
    eyebrow: 'GEOGRAPHY · CLIMATE DATA',
    subject: 'geography',
    scenarios: ['bar-chart'],
    expect: 'ok',
    load: () => import('./geography-climate').then((m) => m.GEOGRAPHY_CLIMATE_BOARD as BoardSource),
  },
  {
    id: 'geography-water-cycle',
    label: 'Water cycle',
    eyebrow: 'GEOGRAPHY · THE WATER CYCLE',
    subject: 'geography',
    scenarios: ['process'],
    expect: 'ok',
    load: () => import('./geography-water-cycle').then((m) => m.GEOGRAPHY_WATER_CYCLE_BOARD as BoardSource),
  },
  {
    id: 'economics-market-structures',
    label: 'Market structures',
    eyebrow: 'ECONOMICS · MARKET STRUCTURES',
    subject: 'economics',
    scenarios: ['comparison'],
    expect: 'ok',
    load: () => import('./economics-market-structures').then((m) => m.ECONOMICS_MARKET_STRUCTURES_BOARD as BoardSource),
  },
  {
    id: 'economics-supply-demand',
    label: 'Supply and demand',
    eyebrow: 'ECONOMICS · SUPPLY AND DEMAND',
    subject: 'economics',
    scenarios: ['multiple-connected-blocks'],
    expect: 'ok',
    load: () => import('./economics-supply-demand').then((m) => m.ECONOMICS_SUPPLY_DEMAND_BOARD as BoardSource),
  },
  {
    id: 'maths-fractions-quiz',
    label: 'Fractions quiz',
    eyebrow: 'MATHEMATICS · EQUIVALENT FRACTIONS',
    subject: 'mathematics',
    scenarios: ['quiz'],
    expect: 'ok',
    load: () => import('./maths-fractions-quiz').then((m) => m.MATHS_FRACTIONS_QUIZ_BOARD as BoardSource),
  },
  {
    id: 'history-artifact-image',
    label: 'Artifact',
    eyebrow: 'HISTORY · READING AN ARTIFACT',
    subject: 'history',
    scenarios: ['image'],
    expect: 'ok',
    load: () => import('./history-artifact-image').then((m) => m.HISTORY_ARTIFACT_IMAGE_BOARD as BoardSource),
  },
  {
    id: 'history-long-reading',
    label: 'Long reading',
    eyebrow: 'HISTORY · THE INDUSTRIAL CITY',
    subject: 'history',
    scenarios: ['long-text'],
    expect: 'ok',
    load: () => import('./history-long-reading').then((m) => m.HISTORY_LONG_READING_BOARD as BoardSource),
  },
  {
    id: 'data-long-labels',
    label: 'Long labels',
    eyebrow: 'DATA · LABELS THAT DO NOT FIT',
    subject: 'data',
    scenarios: ['long-labels'],
    expect: 'ok',
    load: () => import('./data-long-labels').then((m) => m.DATA_LONG_LABELS_BOARD as BoardSource),
  },
  {
    id: 'data-large-table',
    label: 'Large table',
    eyebrow: 'DATA · FIFTY ROWS',
    subject: 'data',
    scenarios: ['large-tables'],
    expect: 'ok',
    load: () => import('./data-large-table').then((m) => m.DATA_LARGE_TABLE_BOARD as BoardSource),
  },
  {
    id: 'data-mobile-stress',
    label: 'Mobile stress',
    eyebrow: 'DATA · SMALL SCREEN STRESS',
    subject: 'data',
    scenarios: ['mobile-layout'],
    expect: 'ok',
    load: () => import('./data-mobile-stress').then((m) => m.DATA_MOBILE_STRESS_BOARD as BoardSource),
  },
  {
    id: 'invalid-chart-values',
    label: 'Bad chart data',
    eyebrow: 'FIXTURE · CHART REPAIR',
    subject: 'none',
    scenarios: ['invalid-chart-values'],
    expect: 'repaired',
    load: () => import('./invalid-chart-values').then((m) => m.INVALID_CHART_VALUES_BOARD),
  },
  {
    id: 'unsupported-blocks',
    label: 'Unknown types',
    eyebrow: 'FIXTURE · UNKNOWN BLOCK TYPES',
    subject: 'none',
    scenarios: ['unsupported-block-types'],
    expect: 'repaired',
    load: () => import('./unsupported-blocks').then((m) => m.UNSUPPORTED_BLOCKS_BOARD),
  },
  {
    id: 'broken-connectors',
    label: 'Broken links',
    eyebrow: 'FIXTURE · CONNECTOR REPAIR',
    subject: 'none',
    scenarios: ['broken-connectors'],
    expect: 'repaired',
    load: () => import('./broken-connectors').then((m) => m.BROKEN_CONNECTORS_BOARD),
  },
]

/** The chemistry fixture's eyebrow needs the curriculum lookup that lives in
 *  its own module; fetched lazily with it. */
export async function eyebrowFor(entry: FixtureEntry): Promise<string> {
  if (entry.id === 'change-of-state') {
    const m = await import('./change-of-state')
    return m.CHANGE_OF_STATE_EYEBROW
  }
  return entry.eyebrow
}

/** Fixtures shown as header pills. */
export function featuredFixtures(): FixtureEntry[] {
  return FIXTURES.filter((f) => f.featured)
}

/** Look up one fixture by id. */
export function fixtureById(id: string): FixtureEntry | undefined {
  return FIXTURES.find((f) => f.id === id)
}
