import type { LearningBoard } from '../types/learningBoard'

/* PROCESS — ordered stages where the order is the lesson.
 *
 * A process block is not a bulleted list with numbers glued on. Each stage
 * here changes the state of the water and hands it to the next, which is why
 * the cycle closes: the last stage's output is the first stage's input.
 */
export const GEOGRAPHY_WATER_CYCLE_BOARD: LearningBoard = {
  type: 'learning_board',
  version: 1,
  id: 'board-geography-water-cycle',
  title: 'The same water, moved around',
  subtitle: 'Why the cycle has no beginning',
  layout: 'grid',
  blocks: [
    {
      id: 'cycle-intro',
      type: 'explanation',
      title: 'Nothing is created, only relocated',
      content:
        'The water falling as rain today is the same water that has been on this planet for billions of years. The cycle does not make water; it moves it between the ocean, the air, the land and back.\n\nEach stage is a change of state or a change of place, driven by two things only: energy from the sun, and gravity.',
      layout: { width: 'medium' },
    },
    {
      id: 'cycle-process',
      type: 'process',
      eyebrow: 'THE STAGES',
      title: 'One full circuit',
      layout: { width: 'medium' },
      steps: [
        {
          title: 'Evaporation',
          detail: 'Solar energy turns surface water into vapour. The ocean supplies about 86% of it.',
        },
        {
          title: 'Transpiration',
          detail: 'Plants release water vapour through their leaves — a second, quieter source that forests dominate.',
        },
        {
          title: 'Condensation',
          detail: 'Rising vapour cools, and water returns to liquid around dust particles. This is what a cloud is.',
        },
        {
          title: 'Precipitation',
          detail: 'Droplets merge until they are too heavy for the updraught and gravity takes them down.',
        },
        {
          title: 'Collection and runoff',
          detail: 'Water gathers in rivers, lakes and aquifers, and flows back toward the sea to begin again.',
        },
      ],
    },
    {
      id: 'cycle-callout',
      type: 'callout',
      tone: 'note',
      layout: { width: 'wide' },
      content:
        'Numbering the stages is a convenience, not a claim. A raindrop can evaporate before it lands, and groundwater can sit underground for ten thousand years before returning. The cycle is a set of transfers, not a queue.',
    },
  ],
  connectors: [
    { id: 'c1', from: 'cycle-intro', to: 'cycle-process', kind: 'sequence', label: 'in order' },
  ],
  metadata: { source: 'fixture' },
}
