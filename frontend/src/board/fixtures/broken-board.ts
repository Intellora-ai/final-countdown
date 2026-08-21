import type { BoardSource } from '../types/learningBoard'

/* THE DELIBERATELY BROKEN BOARD — authored as BoardSource, because it is NOT
 * a LearningBoard and never claims to be. Every fault in here is one the
 * validator documents a rule for, so switching the picker to this fixture
 * demonstrates, on screen: repairs with notices, a preserved unknown block,
 * a dropped smuggling attempt, a chart falling back to a table, and a dangling
 * relationship being removed. The board still renders. That is the point.
 */
export const BROKEN_BOARD: BoardSource = {
  type: 'learning_board',
  version: 1,
  id: 'board-broken',
  title: 'A board assembled wrongly on purpose',
  subtitle: 'Every fault below is caught, repaired or refused — visibly',
  layout: 'grid',
  blocks: [
    {
      /* No id: repaired with a synthesized one. */
      type: 'explanation',
      title: 'This block had no id',
      content: 'The validator assigned one and said so in the notices above.',
    },
    {
      id: 'styled-1',
      type: 'callout',
      content: 'This callout tried to smuggle a style field.',
      /* Unknown key: the block is refused, never silently stripped. */
      style: { color: 'hotpink' },
    },
    {
      id: 'future-1',
      /* Unknown type: preserved as a visible placeholder. */
      type: 'holographic_projection',
      title: 'A block from the future',
    },
    {
      id: 'table-1',
      type: 'table',
      title: 'Ragged rows',
      columns: ['A', 'B', 'C'],
      rows: [
        ['1', '2', '3'],
        ['only one'],
        ['1', '2', '3', '4', '5'],
      ],
    },
    {
      id: 'chart-1',
      type: 'pie_chart',
      title: 'A chart of nothing',
      /* Every value invalid: falls back to a table with a notice. */
      data: [
        { label: 'NaN slice', value: Number.NaN },
        { label: 'Infinite slice', value: Number.POSITIVE_INFINITY },
        { label: 'Negative slice', value: -5 },
      ],
    },
    {
      id: 'image-1',
      type: 'image',
      /* External source: refused. */
      src: 'https://example.com/leak.png',
      alt: 'An image that tried to load from the network',
    },
    {
      id: 'quiz-1',
      type: 'quiz',
      prompt: 'A quiz with one option is not a question.',
      options: [{ id: 'only', label: 'The lonely option' }],
    },
  ],
  connectors: [
    { id: 'c1', from: 'table-1', to: 'chart-1', kind: 'reference', label: 'valid relationship' },
    /* Dangling: removed with a notice. */
    { id: 'c2', from: 'table-1', to: 'ghost-block', kind: 'causal' },
  ],
  metadata: { source: 'fixture' },
}
