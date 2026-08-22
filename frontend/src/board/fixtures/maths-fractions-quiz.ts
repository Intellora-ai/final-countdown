import type { LearningBoard } from '../types/learningBoard'

/* QUIZ — one answerable question with a stated reason.
 *
 * The wrong options are the actual mistakes learners make with equivalent
 * fractions, not filler: adding to both parts, multiplying only the top, and
 * matching a decimal that looks close. A distractor nobody would pick teaches
 * nothing and makes the question easier than the idea it tests.
 */
export const MATHS_FRACTIONS_QUIZ_BOARD: LearningBoard = {
  type: 'learning_board',
  version: 1,
  id: 'board-maths-fractions-quiz',
  title: 'Equivalent fractions',
  subtitle: 'The same amount, written differently',
  layout: 'grid',
  blocks: [
    {
      id: 'frac-intro',
      type: 'explanation',
      title: 'Multiply both parts, or neither',
      content:
        'Two fractions are equivalent when they describe the same amount. You get one from the other by multiplying — or dividing — the numerator and denominator by the same number.\n\nThe reason is that this is multiplying by 1 in disguise: 2/3 × 2/2 is 4/6, and 2/2 is 1. Adding the same number to both parts is not multiplying by anything, which is why it changes the value.',
      layout: { width: 'medium' },
    },
    {
      id: 'frac-example',
      type: 'example',
      eyebrow: 'WORKED',
      title: 'Turning 3/4 into twelfths',
      layout: { width: 'medium' },
      prompt: 'Write 3/4 as a fraction with denominator 12.',
      input: 'Target denominator = 12, current denominator = 4',
      working: [
        '12 ÷ 4 = 3, so both parts are multiplied by 3',
        '3 × 3 = 9',
        '4 × 3 = 12',
      ],
      result: '3/4 = 9/12 — the same amount, cut into smaller pieces.',
    },
    {
      id: 'frac-quiz',
      type: 'quiz',
      eyebrow: 'CHECK',
      title: 'Which fraction equals 2/3?',
      layout: { width: 'wide' },
      prompt: 'Which of these is equivalent to 2/3?',
      options: [
        { id: 'a', label: '3/4' },
        { id: 'b', label: '6/9', correct: true },
        { id: 'c', label: '4/3' },
        { id: 'd', label: '5/6' },
      ],
      explanation:
        '6/9 comes from multiplying both parts of 2/3 by 3. Adding 1 to each part gives 3/4, which is larger. Multiplying only the top gives 4/3, which is bigger than a whole. And 5/6 is close in decimal but is not the same amount.',
    },
  ],
  connectors: [
    { id: 'c1', from: 'frac-example', to: 'frac-quiz', kind: 'sequence', label: 'now you try' },
  ],
  metadata: { source: 'fixture' },
}
