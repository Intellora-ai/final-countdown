/* THE SCRIPTED LESSON — the deterministic local proof, no AI, no backend.
 *
 * Five authored steps matching the required demonstration exactly:
 *   1  title + short explanation          → checkpoint "Is this clear?"
 *   2  the equation                       (after explicit Continue)
 *   3  the diagram, node by node, then edges
 *   4  one chart                          → checkpoint "Shall we move forward?"
 *   5  the final takeaway
 *
 * Content reuses the validated chemistry fixture's blocks so the lesson and
 * the classic board can never drift apart — one source of truth, two
 * deliveries. The connector between equation and chart is authored into step
 * 4, the step where its second end is released.
 */
import type { TeachingStep } from '../types'
import type { Block, Connector, ExplanationBlock } from '../../types/learningBoard'
import { CHANGE_OF_STATE_BOARD } from '../../fixtures/change-of-state'

function block(id: string): Block {
  const b = CHANGE_OF_STATE_BOARD.blocks.find((x) => x.id === id)
  if (!b) throw new Error(`lesson references missing block '${id}'`)
  return b
}

function connector(id: string): Connector {
  const c = (CHANGE_OF_STATE_BOARD.connectors ?? []).find((x) => x.id === id)
  if (!c) throw new Error(`lesson references missing connector '${id}'`)
  return c
}

/* Step 1 keeps the opening SHORT — the fixture's full explanation is split
 * for the classic board; the lesson opens with its first paragraph only. */
const opening: ExplanationBlock = {
  ...(block('explanation-1') as ExplanationBlock),
  id: 'lesson-opening',
  content: (block('explanation-1') as ExplanationBlock).content.split(/\n{2,}/)[0],
  /* The step this block belongs to is already called "The main idea". The
   * block inherits that title from the board fixture it is spread from, and
   * keeping it would print the same heading twice — once as the step, once
   * inside its only card. The step owns the name here. */
  title: undefined,
}

export const CHANGE_OF_STATE_LESSON: {
  title: string
  subtitle: string | null
  steps: TeachingStep[]
} = {
  title: CHANGE_OF_STATE_BOARD.title,
  subtitle: CHANGE_OF_STATE_BOARD.subtitle ?? null,
  steps: [
    {
      id: 'step-1',
      purpose: 'explain',
      title: 'The main idea',
      blocks: [opening],
      checkpoint: { question: 'Is everything clear?', continueLabel: 'Continue', unclearLabel: 'Explain again' },
    },
    {
      id: 'step-2',
      purpose: 'explain',
      title: 'The energy of melting',
      blocks: [block('equation-1')],
      checkpoint: { question: 'Ready to see it drawn?', continueLabel: 'Show me', unclearLabel: 'Explain again' },
    },
    {
      id: 'step-3',
      purpose: 'demonstrate',
      title: 'How the states connect',
      blocks: [block('diagram-1')],
      checkpoint: { question: 'Does the picture make sense?', continueLabel: 'Continue', unclearLabel: 'Explain again' },
    },
    {
      id: 'step-4',
      purpose: 'demonstrate',
      title: 'Measured, not imagined',
      blocks: [block('chart-1')],
      connectors: [connector('c1')],   // equation → chart: both ends now released
      checkpoint: { question: 'Shall we move forward?', continueLabel: 'Move forward', unclearLabel: 'Explain again' },
    },
    {
      id: 'step-5',
      purpose: 'explain',
      title: 'The takeaway',
      blocks: [block('callout-1')],
      checkpoint: { question: 'Done — want another example?', continueLabel: 'Finish', unclearLabel: 'Explain again' },
    },
  ],
}
