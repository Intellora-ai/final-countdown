import type { BoardSource } from '../types/learningBoard'

/* INVALID CHART VALUES — one fault class, isolated.
 *
 * broken-board.ts plants nine different faults at once, which demonstrates
 * resilience but makes it hard to point at any single rule. This fixture does
 * one thing: it feeds every chart type data it cannot draw, so the three
 * fallback paths can be seen side by side.
 *
 * Authored as BoardSource because it is NOT a LearningBoard — NaN, Infinity
 * and a string where a number belongs are exactly what the authoring type
 * forbids, and pretending otherwise would defeat the compiler check that makes
 * the valid fixtures trustworthy.
 *
 * Expected: status 'repaired'. Every chart survives as a table or is dropped
 * with a notice; nothing renders NaN at a learner.
 */
export const INVALID_CHART_VALUES_BOARD: BoardSource = {
  type: 'learning_board',
  version: 1,
  id: 'board-invalid-chart-values',
  title: 'Charts that cannot be drawn',
  subtitle: 'Every one of these degrades into something readable',
  layout: 'grid',
  blocks: [
    {
      id: 'icv-intro',
      type: 'explanation',
      title: 'A broken chart still has labels',
      content:
        'When chart values are unusable, the labels usually are not. Dropping the whole block would throw away the part that still says something, so the validator converts the chart into a table and states that it did.',
    },
    {
      id: 'icv-pie',
      type: 'pie_chart',
      title: 'A pie of impossible slices',
      /* Not one of these can be a share of a whole. */
      data: [
        { label: 'Not a number', value: Number.NaN },
        { label: 'Infinite', value: Number.POSITIVE_INFINITY },
        { label: 'Negative share', value: -12 },
        { label: 'A word', value: 'plenty' },
      ],
    },
    {
      id: 'icv-bar',
      type: 'bar_chart',
      title: 'Bars with nothing to measure',
      yLabel: 'Units',
      data: [
        { label: 'Missing entirely', value: null },
        { label: 'Not a number', value: Number.NaN },
        { label: 'A word', value: 'many' },
      ],
    },
    {
      id: 'icv-line',
      type: 'line_chart',
      title: 'A series with readable times and unusable readings',
      xLabel: 'Hour',
      yLabel: 'Temperature (°C)',
      points: [
        { x: '06:00', y: Number.NaN },
        { x: '09:00', y: 'warm' },
        { x: '12:00', y: null },
        { x: '15:00', y: Number.NEGATIVE_INFINITY },
      ],
    },
    {
      id: 'icv-partial',
      type: 'line_chart',
      title: 'A series that is only partly broken',
      xLabel: 'Hour',
      yLabel: 'Temperature (°C)',
      /* Two usable points survive, so this one stays a chart — and the notice
       * says how many were dropped rather than quietly plotting fewer. */
      points: [
        { x: 0, y: 12 },
        { x: 1, y: Number.NaN },
        { x: 2, y: 17 },
        { x: 3, y: Number.POSITIVE_INFINITY },
      ],
    },
    {
      id: 'icv-empty',
      type: 'pie_chart',
      title: 'A chart with no data at all',
      /* No labels either: nothing survives, so the block is dropped. */
      data: [],
    },
  ],
  metadata: { source: 'fixture' },
}
