import type { LearningBoard } from '../types/learningBoard'

/* A history lesson: timeline + comparison + callout. No chart, no equation —
 * the shell does not care, which is the proof. */
export const HISTORY_TIMELINE_BOARD: LearningBoard = {
  type: 'learning_board',
  version: 1,
  id: 'board-history-printing',
  title: 'How did printing change who could know things?',
  subtitle: 'The print revolution',
  layout: 'grid',
  blocks: [
    {
      id: 'text-1',
      type: 'text',
      layout: { width: 'wide' },
      paragraphs: [
        [
          { text: 'Before print, a book was a hand-made object — ' },
          { text: 'one copy at a time, months per copy', emphasis: 'strong' },
          { text: '. Whoever owned the copies effectively owned the knowledge.' },
        ],
        [
          { text: 'Movable type turned copying into manufacture, and the price of an idea collapsed within ' },
          { text: 'a single lifetime', emphasis: 'accent' },
          { text: '.' },
        ],
      ],
    },
    {
      id: 'timeline-1',
      type: 'timeline',
      eyebrow: 'THE SPREAD',
      title: 'From workshop to continent',
      layout: { width: 'wide' },
      events: [
        { at: 'c. 1440', label: 'Gutenberg builds the press', detail: 'Movable metal type in Mainz.' },
        { at: '1455', label: 'The 42-line Bible', detail: 'About 180 copies — unthinkable by hand.' },
        { at: '1480', label: 'Presses in 110 towns', detail: 'The technology outruns any authority.' },
        { at: '1500', label: 'Some twenty million books', detail: 'More than all of scribal Europe had produced.' },
        { at: '1517', label: 'Pamphlets carry a dispute across Europe', detail: 'Ideas now travel faster than the people who oppose them.' },
      ],
    },
    {
      id: 'compare-1',
      type: 'comparison',
      title: 'Manuscript against print',
      layout: { width: 'full' },
      subjects: ['Manuscript culture', 'Print culture'],
      criteria: [
        { label: 'Speed of copying', values: ['Months per copy', 'Hundreds of copies per edition'] },
        { label: 'Cost of a book', values: ['A luxury object', 'Falling within reach of tradespeople'] },
        { label: 'Who controls the text', values: ['The owner of the copy', 'No one, once an edition is out'] },
        { label: 'Errors', values: ['Drift with every copying', 'Fixed per edition — and corrected per edition'] },
      ],
    },
    {
      id: 'callout-1',
      type: 'callout',
      tone: 'note',
      layout: { width: 'medium' },
      content: 'Print did not make people literate. It made literacy worth having — the incentive arrived before the skill.',
    },
  ],
  connectors: [],
  metadata: { source: 'fixture' },
}
