import type { BoardSource } from '../types/learningBoard'

/* THE ROOT-INVALID BOARD — the failed path, on screen.
 *
 * The broken board demonstrates repairs; this one demonstrates REFUSAL. It
 * carries a repairable fault (an unrecognised layout) followed by a fatal one
 * (an unknown root key), which proves the validator's ordering contract
 * visibly: the repair notice is collected FIRST, the fatal is added as a
 * notice too, and the ErrorState shows both while rendering no content.
 */
export const INVALID_BOARD: BoardSource = {
  type: 'learning_board',
  version: 1,
  id: 'board-invalid',
  title: 'A board with an unsafe root',
  layout: 'spiral',              // repairable: noticed, then grid
  theme: 'dark',                 // fatal: unknown root key — refused, not stripped
  blocks: [
    { id: 'x1', type: 'explanation', content: 'This content must never render.' },
  ],
  metadata: { source: 'fixture' },
}
