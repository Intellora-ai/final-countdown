import type { LearningBoard } from '../types/learningBoard'

/* LONG LABELS — legal, and still unreadable without help.
 *
 * Every label here is under the validator's 60-character cap, so this board
 * validates with ZERO notices. That is the point: the validator is satisfied
 * and the chart is still in trouble, because eight labels of fifty characters
 * cannot share one axis. This is the fixture the axis truncation exists for,
 * and the one that proves the full text survives in the title and the summary
 * even when the drawn label cannot.
 */
export const DATA_LONG_LABELS_BOARD: LearningBoard = {
  type: 'learning_board',
  version: 1,
  id: 'board-data-long-labels',
  title: 'When the category names are longer than the bars',
  subtitle: 'Survey responses, written out in full',
  layout: 'grid',
  blocks: [
    {
      id: 'labels-intro',
      type: 'explanation',
      title: 'A chart is not exempt from its own labels',
      content:
        'Survey categories are often written as full statements, because shortening them changes what respondents were asked. That leaves a chart whose bars are simple and whose labels are sentences.\n\nThe drawn axis shortens what will not fit, marking the cut. The full text stays available on the bar itself and in the text summary, so nothing is lost — only deferred.',
      layout: { width: 'wide' },
    },
    {
      id: 'labels-bar',
      type: 'bar_chart',
      eyebrow: 'THE RESPONSES',
      title: 'Reasons given for not cycling to work',
      layout: { width: 'wide' },
      yLabel: 'Respondents',
      data: [
        { label: 'No safe separated cycle lane on the main route', value: 412, highlight: true },
        { label: 'Distance is too far to cycle comfortably daily', value: 388 },
        { label: 'Nowhere secure to leave a bicycle at the office', value: 271 },
        { label: 'Weather makes it unreliable for most of the year', value: 244 },
        { label: 'No shower or changing facilities at the workplace', value: 190 },
        { label: 'Carrying children or shopping on the same trip', value: 165 },
        { label: 'Cost of buying and maintaining a suitable bicycle', value: 121 },
        { label: 'Do not know a route that avoids the ring road', value: 96 },
      ],
    },
    {
      id: 'labels-pie',
      type: 'pie_chart',
      eyebrow: 'GROUPED',
      title: 'The same answers, sorted into four causes',
      layout: { width: 'medium' },
      data: [
        { label: 'Infrastructure that does not exist on the route yet', value: 508 },
        { label: 'Practical trip constraints such as distance or cargo', value: 553 },
        { label: 'Facilities missing at the destination workplace', value: 461 },
        { label: 'Cost and knowledge barriers reported by respondents', value: 217 },
      ],
    },
    {
      id: 'labels-callout',
      type: 'callout',
      tone: 'note',
      layout: { width: 'medium' },
      content:
        'Grouping eight statements into four causes makes the chart readable and throws away detail. Both versions are here so you can see exactly which detail went.',
    },
  ],
  connectors: [
    { id: 'c1', from: 'labels-bar', to: 'labels-pie', kind: 'reference', label: 'grouped from' },
  ],
  metadata: { source: 'fixture' },
}
