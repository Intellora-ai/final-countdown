import type { LearningBoard } from '../types/learningBoard'

/* IMAGE — inline, described, and sourced.
 *
 * The picture is an inline data: SVG, so this fixture makes no network request
 * at all: the loading invariants can be proved without a server, and a board
 * that runs offline stays honest about what it fetched. The validator refuses
 * any http(s) source, so an external image could not be used here even if one
 * were convenient.
 *
 * The alt text describes what the image SHOWS, not that it is an image. The
 * caption says what to look at; the source note says where it came from.
 */

/* A schematic clay tablet with wedge marks. Drawn in a handful of shapes
 * because the lesson is about reading a record, not about the artwork. */
const TABLET_SVG =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180" role="img">
      <rect x="14" y="10" width="212" height="160" rx="18" fill="#c8b088"/>
      <rect x="30" y="26" width="180" height="128" rx="10" fill="#d7c39d"/>
      <g fill="#7a6242">
        <path d="M46 52 l14 6 -14 6z"/><path d="M70 52 l14 6 -14 6z"/><path d="M94 52 l14 6 -14 6z"/>
        <path d="M46 80 l14 6 -14 6z"/><path d="M70 80 l14 6 -14 6z"/>
        <path d="M46 108 l14 6 -14 6z"/><path d="M70 108 l14 6 -14 6z"/><path d="M94 108 l14 6 -14 6z"/>
        <path d="M118 108 l14 6 -14 6z"/>
        <rect x="140" y="46" width="60" height="4" rx="2"/>
        <rect x="140" y="74" width="60" height="4" rx="2"/>
        <rect x="140" y="102" width="42" height="4" rx="2"/>
      </g>
    </svg>`,
  )

export const HISTORY_ARTIFACT_IMAGE_BOARD: LearningBoard = {
  type: 'learning_board',
  version: 1,
  id: 'board-history-artifact-image',
  title: 'What a receipt tells you about a civilisation',
  subtitle: 'Reading an ordinary object as evidence',
  layout: 'grid',
  blocks: [
    {
      id: 'artifact-text',
      type: 'text',
      title: 'The dullest objects are the most informative',
      layout: { width: 'medium' },
      paragraphs: [
        [
          { text: 'Most surviving cuneiform tablets are not poetry or law. They are ' },
          { text: 'receipts', emphasis: 'strong' },
          { text: ' — deliveries of barley, wages in beer, counts of livestock.' },
        ],
        [
          { text: 'That is exactly why they are useful. A monument tells you what a ruler ' },
          { text: 'wanted remembered', emphasis: 'accent' },
          { text: '. A receipt tells you what people actually did on an ordinary day, because nobody bothers lying on paperwork nobody was meant to read.' },
        ],
      ],
    },
    {
      id: 'artifact-image',
      type: 'image',
      eyebrow: 'THE OBJECT',
      title: 'An administrative tablet, schematic',
      layout: { width: 'medium' },
      src: TABLET_SVG,
      alt: 'A rectangular clay tablet with a raised border. Its face carries rows of small wedge-shaped marks on the left and three horizontal ruled lines on the right, in the layout of a tally beside a list.',
      caption: 'Wedge groups on the left are quantities; the ruled lines on the right held the names they belonged to.',
      sourceNote: 'Schematic drawing for teaching — not a photograph of a specific tablet.',
    },
    {
      id: 'artifact-callout',
      type: 'callout',
      tone: 'note',
      layout: { width: 'wide' },
      content:
        'Counting comes before writing. The earliest tablets record amounts with no grammar at all — the script grew out of accounting, not the other way round.',
    },
  ],
  connectors: [
    { id: 'c1', from: 'artifact-text', to: 'artifact-image', kind: 'reference', label: 'the object itself' },
  ],
  metadata: { source: 'fixture' },
}
