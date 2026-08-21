import type { LearningBoard } from '../types/learningBoard'

/* A VALID board with nothing on it. Emptiness is a fact, not a fault: the
 * validator returns 'ok' and BoardView renders the empty state. This fixture
 * exists so that path is a thing you can look at, not just a branch in a test. */
export const EMPTY_BOARD: LearningBoard = {
  type: 'learning_board',
  version: 1,
  id: 'board-empty',
  title: 'A board with nothing on it yet',
  subtitle: null,
  layout: 'grid',
  blocks: [],
  connectors: [],
  metadata: { source: 'fixture' },
}
