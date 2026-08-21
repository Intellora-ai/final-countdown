/* THE FIXTURE MANIFEST — every board the picker can load.
 *
 * Loaders are dynamic import() thunks, which is what makes the loading state
 * honest: there is a real async boundary between choosing a fixture and
 * holding its data. Every loader returns BoardSource — even the fixtures
 * authored as LearningBoard — because the validator is the only door, and the
 * door does not care how well-typed you claim to be on the other side.
 */
import type { BoardSource } from '../types/learningBoard'

export interface FixtureEntry {
  id: string
  /** Picker label. */
  label: string
  /** Header eyebrow; boards without curriculum context use a plain label. */
  eyebrow: string
  load: () => Promise<BoardSource>
}

export const FIXTURES: FixtureEntry[] = [
  {
    id: 'change-of-state',
    label: 'Chemistry',
    eyebrow: '', // resolved from the curriculum at load time, see below
    load: () => import('./change-of-state').then((m) => m.CHANGE_OF_STATE_BOARD as BoardSource),
  },
  {
    id: 'maths-quadratic',
    label: 'Mathematics',
    eyebrow: 'MATHEMATICS · QUADRATIC FORMULA',
    load: () => import('./maths-quadratic').then((m) => m.MATHS_QUADRATIC_BOARD as BoardSource),
  },
  {
    id: 'history-timeline',
    label: 'History',
    eyebrow: 'HISTORY · THE PRINT REVOLUTION',
    load: () => import('./history-timeline').then((m) => m.HISTORY_TIMELINE_BOARD as BoardSource),
  },
  {
    id: 'data-lesson',
    label: 'Data',
    eyebrow: 'DATA · READING A BUDGET',
    load: () => import('./data-lesson').then((m) => m.DATA_LESSON_BOARD as BoardSource),
  },
  {
    id: 'biology-cell',
    label: 'Biology',
    eyebrow: 'BIOLOGY · THE CELL',
    load: () => import('./biology-cell').then((m) => m.BIOLOGY_CELL_BOARD as BoardSource),
  },
  {
    id: 'empty-board',
    label: 'Empty',
    eyebrow: 'FIXTURE · EMPTY BOARD',
    load: () => import('./empty-board').then((m) => m.EMPTY_BOARD as BoardSource),
  },
  {
    id: 'broken-board',
    label: 'Broken',
    eyebrow: 'FIXTURE · VALIDATOR DEMONSTRATION',
    load: () => import('./broken-board').then((m) => m.BROKEN_BOARD),
  },
  {
    id: 'invalid-board',
    label: 'Invalid',
    eyebrow: 'FIXTURE · ROOT REFUSAL DEMONSTRATION',
    load: () => import('./invalid-board').then((m) => m.INVALID_BOARD),
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
