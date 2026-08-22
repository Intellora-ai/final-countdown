import type { LearningBoard } from '../types/learningBoard'

/* MULTIPLE CONNECTED BLOCKS — five blocks and four stated relationships.
 *
 * This is the fixture that exercises the connector layer with more than a
 * single link. Every connector names a real dependency between two blocks —
 * where the chart's crossing point comes from, what the table is showing about
 * that point, why the diagram follows. A connector that meant "these look nice
 * near each other" would be decoration, and the board has no field for it.
 */
export const ECONOMICS_SUPPLY_DEMAND_BOARD: LearningBoard = {
  type: 'learning_board',
  version: 1,
  id: 'board-economics-supply-demand',
  title: 'Where a price comes from',
  subtitle: 'Two schedules, one crossing point',
  layout: 'grid',
  blocks: [
    {
      id: 'sd-intro',
      type: 'explanation',
      title: 'Two opposite intentions',
      content:
        'Buyers want more as the price falls. Sellers want to supply more as it rises. Both are true at every price at once, and they disagree at almost all of them.\n\nThere is exactly one price where the quantity buyers want equals the quantity sellers offer. That is not a fair price or a correct price — it is the only price at which nobody is left holding unsold stock or queueing for something that ran out.',
      layout: { width: 'medium' },
    },
    {
      id: 'sd-schedule',
      type: 'table',
      eyebrow: 'THE SCHEDULES',
      title: 'What each side wants, at each price',
      layout: { width: 'medium' },
      columns: ['Price (₹)', 'Quantity demanded', 'Quantity supplied', 'Pressure'],
      rows: [
        [10, 100, 20, 'shortage — price rises'],
        [20, 80, 40, 'shortage — price rises'],
        [30, 60, 60, 'balanced'],
        [40, 40, 80, 'surplus — price falls'],
        [50, 20, 100, 'surplus — price falls'],
      ],
    },
    {
      id: 'sd-chart',
      type: 'line_chart',
      eyebrow: 'THE CROSSING',
      title: 'Quantity demanded as price rises',
      layout: { width: 'medium' },
      xLabel: 'Price (₹)',
      yLabel: 'Quantity',
      points: [
        { x: 10, y: 100 },
        { x: 20, y: 80 },
        { x: 30, y: 60 },
        { x: 40, y: 40 },
        { x: 50, y: 20 },
      ],
      highlightIndex: 2,
    },
    {
      id: 'sd-diagram',
      type: 'diagram',
      eyebrow: 'THE MECHANISM',
      title: 'How a market corrects itself',
      layout: { width: 'medium' },
      nodes: [
        { id: 'shortage', label: 'Shortage', detail: 'Buyers want more than exists', position: { col: 0, row: 0 } },
        { id: 'priceup', label: 'Price rises', detail: 'Sellers can ask for more', position: { col: 1, row: 0 } },
        { id: 'balance', label: 'Equilibrium', detail: 'Wanted equals offered', position: { col: 1, row: 1 } },
        { id: 'surplus', label: 'Surplus', detail: 'More exists than buyers want', position: { col: 2, row: 2 } },
        { id: 'pricedown', label: 'Price falls', detail: 'Sellers cut to clear stock', position: { col: 1, row: 2 } },
      ],
      edges: [
        { from: 'shortage', to: 'priceup', kind: 'causal' },
        { from: 'priceup', to: 'balance', kind: 'causal' },
        { from: 'surplus', to: 'pricedown', kind: 'causal' },
        { from: 'pricedown', to: 'balance', kind: 'causal' },
      ],
    },
    {
      id: 'sd-callout',
      type: 'callout',
      tone: 'warning',
      layout: { width: 'wide' },
      content:
        'Fix the price below ₹30 by law and the shortage does not disappear — it stops being visible in the price and starts showing up as queues, waiting lists and rationing. The imbalance has to go somewhere.',
    },
  ],
  connectors: [
    { id: 'c1', from: 'sd-schedule', to: 'sd-chart', kind: 'reference', label: 'plotted here' },
    { id: 'c2', from: 'sd-chart', to: 'sd-diagram', kind: 'causal', label: 'what pushes to the crossing' },
    { id: 'c3', from: 'sd-intro', to: 'sd-schedule', kind: 'sequence', label: 'stated as numbers' },
    { id: 'c4', from: 'sd-diagram', to: 'sd-callout', kind: 'reference', label: 'when blocked' },
  ],
  metadata: { source: 'fixture' },
}
