import type { LearningBoard } from '../types/learningBoard'

/* MOBILE LAYOUT — the content that is hardest to fit on a phone.
 *
 * A wide table, a chart with long labels, and a three-subject comparison are
 * the three shapes that break first at 375px. They are collected here so the
 * mobile check has one board to open rather than a tour.
 *
 * The board's responsive behaviour is driven by CSS CONTAINER queries, not
 * viewport media queries, so shrinking a window is not enough on its own —
 * the board container has to shrink with it. The browser harness resizes the
 * viewport and reloads, which does both.
 */
export const DATA_MOBILE_STRESS_BOARD: LearningBoard = {
  type: 'learning_board',
  version: 1,
  id: 'board-data-mobile-stress',
  title: 'Everything that fits badly on a phone',
  subtitle: 'Six columns, long labels, and a three-way comparison',
  layout: 'grid',
  blocks: [
    {
      id: 'mobile-intro',
      type: 'explanation',
      title: 'Narrow is a real reading condition',
      content:
        'A board that only works at desk width works for half its readers. The three blocks below are the ones that fail first: a table with more columns than a phone can show, a chart whose labels outrun its axis, and a comparison that wants to be three columns wide.',
      layout: { width: 'wide' },
    },
    {
      id: 'mobile-table',
      type: 'table',
      eyebrow: 'SIX COLUMNS',
      title: 'Regional performance summary',
      layout: { width: 'full' },
      columns: ['Region', 'Population (m)', 'Median age', 'Literacy (%)', 'Urban (%)', 'Growth (%)'],
      rows: [
        ['Northern plains', 241.1, 22.4, 73.0, 25.9, 1.7],
        ['Western coast', 112.4, 28.1, 88.5, 45.2, 1.1],
        ['Southern peninsula', 84.7, 31.6, 94.0, 47.7, 0.6],
        ['Eastern delta', 99.6, 26.3, 76.3, 31.9, 1.3],
        ['Central highlands', 72.6, 24.8, 70.6, 27.6, 1.9],
        ['North-eastern hills', 45.8, 25.2, 79.2, 22.8, 1.5],
      ],
    },
    {
      id: 'mobile-chart',
      type: 'bar_chart',
      eyebrow: 'LONG LABELS',
      title: 'Reported barriers to school attendance',
      layout: { width: 'wide' },
      yLabel: 'Households reporting',
      data: [
        { label: 'Distance to the nearest secondary school', value: 1840, highlight: true },
        { label: 'Cost of uniforms, books and examination fees', value: 1622 },
        { label: 'Work needed at home during harvest season', value: 1290 },
        { label: 'No safe transport available in the mornings', value: 977 },
        { label: 'Lack of separate sanitation facilities', value: 754 },
      ],
    },
    {
      id: 'mobile-comparison',
      type: 'comparison',
      eyebrow: 'THREE ACROSS',
      title: 'Three intervention options',
      layout: { width: 'full' },
      subjects: ['School transport', 'Fee waiver', 'Local satellite classroom'],
      criteria: [
        { label: 'Barrier addressed', values: ['Distance and safety', 'Direct cost', 'Distance'] },
        { label: 'Cost per household', values: ['Medium', 'Low', 'High'] },
        { label: 'Time to first effect', values: ['One term', 'Immediate', 'Two years'] },
        { label: 'Reaches harvest-season absence', values: ['No', 'Partly', 'Yes'] },
      ],
    },
  ],
  connectors: [
    { id: 'c1', from: 'mobile-chart', to: 'mobile-comparison', kind: 'causal', label: 'options address these' },
  ],
  metadata: { source: 'fixture' },
}
