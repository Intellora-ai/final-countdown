import type { LearningBoard } from '../types/learningBoard'

/* LONG TEXT — roughly 800 words across several blocks.
 *
 * Every explanation here is kept under the 120-word step limit deliberately,
 * so the teaching plan splits this board at PARAGRAPH boundaries rather than
 * having to cut mid-idea. That is the case worth testing: a long lesson that
 * still arrives one readable piece at a time. A single 800-word block would
 * test the truncation path instead, which the validator tests already cover.
 *
 * Every string is far under MAX_STRING (4000), so this fixture validates with
 * zero notices — long is not the same as oversized.
 */
export const HISTORY_LONG_READING_BOARD: LearningBoard = {
  type: 'learning_board',
  version: 1,
  id: 'board-history-long-reading',
  title: 'The city that ate its own workers',
  subtitle: 'Manchester, 1780–1850',
  layout: 'flow',
  blocks: [
    {
      id: 'long-1',
      type: 'explanation',
      title: 'A village becomes a machine',
      content:
        'In 1780 Manchester was a market town of about 25,000 people. By 1850 it held over 300,000. Nothing about the land had changed. What changed was that cotton spinning moved out of houses and into mills, and mills needed to be where the water and later the coal was.\n\nPeople followed work, as people do. They arrived faster than anyone built for them, which is the fact underneath everything that follows. A city can grow twelvefold in seventy years; sewers, water and housing cannot.',
    },
    {
      id: 'long-2',
      type: 'explanation',
      title: 'What the housing actually was',
      content:
        'The characteristic dwelling was the back-to-back: two houses sharing a rear wall, so each had windows on one side only. No through ventilation, no rear yard, one privy shared between many households.\n\nCellars were let separately. In 1840 roughly 15,000 people in Manchester lived below ground level, in rooms that flooded when the river rose. Rent for a cellar was about half that of a room upstairs, which is the only reason anyone chose one.',
    },
    {
      id: 'long-3',
      type: 'explanation',
      title: 'The arithmetic of dying',
      content:
        'Average life expectancy in rural Rutland at the time was about 38 years. In Manchester it was 26. For labourers within Manchester it was 17.\n\nThat last figure is not a typo and it is not mostly about adults dying young. It is dominated by infant mortality: more than half of working-class children died before their fifth birthday. Average lifespan is an average, and where infants die in numbers it stops describing any adult you could meet.',
    },
    {
      id: 'long-4',
      type: 'explanation',
      title: 'Why cholera changed minds when misery had not',
      content:
        'Poverty had been visible for decades without producing sanitation reform. Cholera produced it in years, and the reason is uncomfortable: cholera travelled along the water supply and did not respect the boundary between poor districts and prosperous ones.\n\nThe 1832 and 1848 epidemics reached households that had considered themselves insulated. Self-interest achieved what evidence of suffering had not, and the public health acts that followed were argued for in the language of contagion rather than of justice.',
    },
    {
      id: 'long-5',
      type: 'explanation',
      title: 'What the reformers measured, and what they missed',
      content:
        'Edwin Chadwick’s 1842 report is the foundation document, and it is genuinely rigorous: street-by-street mortality, drainage surveys, costs of burial set against costs of sewers.\n\nIt was also built on the miasma theory — the belief that disease spread through foul air rather than contaminated water. The recommendations were largely right anyway, because removing sewage from streets removes it from the water too. A wrong mechanism produced a correct policy, which happens more often in the history of public health than anyone likes to admit.',
    },
    {
      id: 'long-6',
      type: 'explanation',
      title: 'Reading the period without flattening it',
      content:
        'It is tempting to tell this as a story of villains, and there were some. But the mill owner who built decent housing and the one who did not were operating in the same market, and the first was undercut by the second until regulation made the floor the same for both.\n\nThat is the durable lesson. The conditions did not improve because individuals became kinder. They improved when the rules changed so that treating people badly stopped being cheaper than the alternative.',
    },
    {
      id: 'long-callout',
      type: 'callout',
      tone: 'key',
      content:
        'When you meet a life expectancy figure this low, always ask what share of it is infant mortality. The number for adults who survived childhood is a different number, and conflating them makes the past look stranger than it was.',
    },
  ],
  metadata: { source: 'fixture' },
}
