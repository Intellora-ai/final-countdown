import type { LearningBoard } from '../types/learningBoard'

/* A data lesson: two chart kinds + the same numbers as a table + a reading of
 * them. Charts and table share one dataset on purpose — a learner can check
 * one against the other, which is what the lesson teaches. */
export const DATA_LESSON_BOARD: LearningBoard = {
  type: 'learning_board',
  version: 1,
  id: 'board-data-spending',
  title: 'Where does a household budget actually go?',
  subtitle: 'Reading one dataset three ways',
  layout: 'grid',
  blocks: [
    {
      id: 'pie-1',
      type: 'pie_chart',
      eyebrow: 'THE SHARE',
      title: 'Monthly spending distribution',
      layout: { width: 'medium' },
      data: [
        { label: 'Rent', value: 40 },
        { label: 'Food', value: 25 },
        { label: 'Transport', value: 15 },
        { label: 'Other', value: 20 },
      ],
    },
    {
      id: 'bar-1',
      type: 'bar_chart',
      eyebrow: 'THE AMOUNTS',
      title: 'The same month in rupees',
      layout: { width: 'medium' },
      data: [
        { label: 'Rent', value: 20000, highlight: true },
        { label: 'Food', value: 12500 },
        { label: 'Transport', value: 7500 },
        { label: 'Other', value: 10000 },
      ],
      yLabel: '₹ per month',
    },
    {
      id: 'table-1',
      type: 'table',
      title: 'Detailed expenses',
      layout: { width: 'wide' },
      columns: ['Category', 'Amount (₹)', 'Share'],
      rows: [
        ['Rent', '20,000', '40%'],
        ['Food', '12,500', '25%'],
        ['Transport', '7,500', '15%'],
        ['Other', '10,000', '20%'],
      ],
    },
    {
      id: 'callout-1',
      type: 'callout',
      tone: 'key',
      layout: { width: 'medium' },
      content: 'A percentage hides the size of the whole. Rent is 40% — but whether that is manageable depends on the ₹50,000 it is 40% of.',
    },
  ],
  connectors: [
    { id: 'c1', from: 'pie-1', to: 'table-1', kind: 'reference', label: 'same data' },
  ],
  metadata: { source: 'fixture' },
}
