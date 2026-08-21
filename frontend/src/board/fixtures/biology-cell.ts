import type { LearningBoard } from '../types/learningBoard'

/* A biology lesson: diagram + emphasised text + a safe inline image + a quiz
 * with local interactivity. The image is a data:image/svg+xml URI — a labelled
 * schematic that ships with the fixture, proving the image path with no
 * binary asset and no network. */

/* A minimal cell schematic, authored as SVG and inlined. encodeURIComponent
 * keeps it readable here while remaining a legal data URI. */
const CELL_SVG =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">` +
      `<rect width="320" height="200" rx="16" fill="#16191C"/>` +
      `<ellipse cx="160" cy="100" rx="140" ry="82" fill="none" stroke="#38E4D7" stroke-width="2"/>` +
      `<ellipse cx="160" cy="100" rx="134" ry="76" fill="rgba(56,228,215,0.06)"/>` +
      `<circle cx="140" cy="95" r="30" fill="rgba(56,228,215,0.18)" stroke="#38E4D7"/>` +
      `<circle cx="140" cy="95" r="10" fill="#38E4D7"/>` +
      `<ellipse cx="225" cy="70" rx="18" ry="9" fill="none" stroke="#8E9CA3"/>` +
      `<ellipse cx="210" cy="140" rx="18" ry="9" fill="none" stroke="#8E9CA3"/>` +
      `<text x="140" y="145" fill="#8E9CA3" font-family="monospace" font-size="10" text-anchor="middle">NUCLEUS</text>` +
      `<text x="240" y="55" fill="#8E9CA3" font-family="monospace" font-size="10" text-anchor="middle">MITOCHONDRIA</text>` +
    `</svg>`,
  )

export const BIOLOGY_CELL_BOARD: LearningBoard = {
  type: 'learning_board',
  version: 1,
  id: 'board-biology-cell',
  title: 'What makes a cell a living unit?',
  subtitle: 'The fundamental unit of life · Class 9',
  layout: 'grid',
  blocks: [
    {
      id: 'text-1',
      type: 'text',
      layout: { width: 'wide' },
      paragraphs: [
        [
          { text: 'A cell is not a bag of chemistry. It is ' },
          { text: 'organised', emphasis: 'strong' },
          { text: ' chemistry — each structure below has one job, and the jobs depend on each other.' },
        ],
      ],
    },
    {
      id: 'image-1',
      type: 'image',
      eyebrow: 'SCHEMATIC',
      title: 'An animal cell, simplified',
      layout: { width: 'medium' },
      src: CELL_SVG,
      alt: 'Simplified diagram of an animal cell: an outer membrane enclosing cytoplasm, a nucleus near the centre, and two mitochondria.',
      caption: 'Membrane, cytoplasm, nucleus, mitochondria — the four structures this lesson names.',
      sourceNote: 'fixture schematic',
    },
    {
      id: 'diagram-1',
      type: 'diagram',
      eyebrow: 'WHO DOES WHAT',
      title: 'Structures and their jobs',
      layout: { width: 'wide' },
      nodes: [
        { id: 'membrane', label: 'Cell membrane', detail: 'decides what enters and leaves', group: 'boundary' },
        { id: 'cytoplasm', label: 'Cytoplasm', detail: 'where reactions happen', group: 'interior' },
        { id: 'nucleus', label: 'Nucleus', detail: 'holds the instructions', group: 'interior' },
        { id: 'mito', label: 'Mitochondria', detail: 'release usable energy', group: 'interior' },
      ],
      edges: [
        { from: 'membrane', to: 'cytoplasm', kind: 'causal', label: 'admits raw material' },
        { from: 'nucleus', to: 'cytoplasm', kind: 'causal', label: 'directs' },
        { from: 'mito', to: 'cytoplasm', kind: 'causal', label: 'powers' },
      ],
    },
    {
      id: 'quiz-1',
      type: 'quiz',
      eyebrow: 'CHECK YOURSELF',
      title: 'One question',
      layout: { width: 'wide' },
      prompt: 'A poison blocks the mitochondria. Which ability does the cell lose FIRST?',
      options: [
        { id: 'a', label: 'Keeping its instructions safe' },
        { id: 'b', label: 'Releasing usable energy', correct: true },
        { id: 'c', label: 'Controlling what enters and leaves' },
      ],
      explanation: 'Mitochondria release the energy every other structure spends. The membrane and nucleus still exist — but their work stops when the energy does.',
    },
  ],
  connectors: [
    { id: 'c1', from: 'image-1', to: 'diagram-1', kind: 'reference', label: 'the same structures, named' },
  ],
  metadata: { chapterId: 'the-fundamental-unit-of-life', conceptId: 'cell-as-a-unit', source: 'fixture' },
}
