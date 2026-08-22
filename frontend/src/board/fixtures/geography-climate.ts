import type { LearningBoard } from '../types/learningBoard'

/* BAR CHART — twelve bars, one highlighted, and the table that proves them.
 *
 * Twelve labels across 380 drawable pixels is the case the axis truncation was
 * written for: "Sep" fits, and the chart stays readable because the component
 * shortens what it must and keeps the full label in the title and summary.
 */
export const GEOGRAPHY_CLIMATE_BOARD: LearningBoard = {
  type: 'learning_board',
  version: 1,
  id: 'board-geography-climate',
  title: 'Where a monsoon shows up in the data',
  subtitle: 'Mumbai rainfall, month by month',
  layout: 'grid',
  blocks: [
    {
      id: 'climate-intro',
      type: 'explanation',
      title: 'An average hides the shape of a year',
      content:
        'Mumbai receives roughly 2,200 mm of rain a year. Stated that way it sounds like a wet place in general, which is the wrong picture entirely.\n\nAlmost all of it arrives in four months. For the other eight the city is close to dry. The annual total is accurate and useless; the distribution is what a farmer, an engineer or a city planner actually needs.',
      layout: { width: 'medium' },
    },
    {
      id: 'climate-chart',
      type: 'bar_chart',
      eyebrow: 'THE DISTRIBUTION',
      title: 'Average monthly rainfall',
      layout: { width: 'medium' },
      yLabel: 'Rainfall (mm)',
      data: [
        { label: 'Jan', value: 1 },
        { label: 'Feb', value: 1 },
        { label: 'Mar', value: 1 },
        { label: 'Apr', value: 2 },
        { label: 'May', value: 18 },
        { label: 'Jun', value: 523 },
        { label: 'Jul', value: 800, highlight: true },
        { label: 'Aug', value: 530 },
        { label: 'Sep', value: 312 },
        { label: 'Oct', value: 56 },
        { label: 'Nov', value: 17 },
        { label: 'Dec', value: 5 },
      ],
    },
    {
      id: 'climate-table',
      type: 'table',
      title: 'The same year as numbers',
      layout: { width: 'wide' },
      columns: ['Season', 'Months', 'Rainfall (mm)', 'Share of year'],
      rows: [
        ['Dry season', 'Nov–May', 45, '2%'],
        ['Monsoon', 'Jun–Sep', 2165, '97%'],
        ['Retreating', 'Oct', 56, '1%'],
      ],
    },
    {
      id: 'climate-callout',
      type: 'callout',
      tone: 'key',
      layout: { width: 'wide' },
      content:
        'July alone delivers more rain than the other eight dry months combined, several times over. When a climate is this seasonal, the annual mean describes no month that actually happens.',
    },
  ],
  connectors: [
    { id: 'c1', from: 'climate-chart', to: 'climate-table', kind: 'reference', label: 'same data' },
  ],
  metadata: { source: 'fixture' },
}
