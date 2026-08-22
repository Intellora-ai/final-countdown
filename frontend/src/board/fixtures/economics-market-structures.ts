import type { LearningBoard } from '../types/learningBoard'

/* COMPARISON — three subjects, one set of criteria, values aligned by index.
 *
 * The comparison block exists so a learner can read DOWN a criterion rather
 * than across three separate paragraphs. Every criterion here has exactly
 * three values because there are three subjects; the validator would drop a
 * comparison with fewer than two subjects, and a ragged criterion would be a
 * question the board could not answer.
 */
export const ECONOMICS_MARKET_STRUCTURES_BOARD: LearningBoard = {
  type: 'learning_board',
  version: 1,
  id: 'board-economics-market-structures',
  title: 'Who sets the price?',
  subtitle: 'Three market structures, compared on the things that differ',
  layout: 'grid',
  blocks: [
    {
      id: 'markets-intro',
      type: 'explanation',
      title: 'Market power is the whole question',
      content:
        'Every market structure is really an answer to one question: how much can a single seller change the price without losing all its customers?\n\nWhere the answer is "none at all", the seller takes whatever the market gives. Where the answer is "quite a lot", the seller chooses. Everything else — entry barriers, product differences, advertising — follows from that.',
      layout: { width: 'wide' },
    },
    {
      id: 'markets-comparison',
      type: 'comparison',
      eyebrow: 'SIDE BY SIDE',
      title: 'Three structures',
      layout: { width: 'full' },
      subjects: ['Perfect competition', 'Monopolistic competition', 'Monopoly'],
      criteria: [
        {
          label: 'Number of sellers',
          values: ['Very many', 'Many', 'One'],
        },
        {
          label: 'Product',
          values: ['Identical', 'Differentiated', 'Unique, no close substitute'],
        },
        {
          label: 'Price setting',
          values: ['Takes the market price', 'Some control within a range', 'Sets the price'],
        },
        {
          label: 'Barriers to entry',
          values: ['None', 'Low', 'High — legal, natural or strategic'],
        },
        {
          label: 'Long-run profit',
          values: ['Normal profit only', 'Normal profit only', 'Can persist above normal'],
        },
        {
          label: 'Real example',
          values: ['Wheat at a commodity exchange', 'Coffee shops in a city', 'A regulated water utility'],
        },
      ],
    },
    {
      id: 'markets-callout',
      type: 'callout',
      tone: 'key',
      layout: { width: 'wide' },
      content:
        'Notice that monopolistic competition ends up in the same place as perfect competition on profit, by a different route: new entrants keep arriving until the advantage of being different is competed away.',
    },
  ],
  metadata: { source: 'fixture' },
}
