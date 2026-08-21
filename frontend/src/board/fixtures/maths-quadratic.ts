import type { LearningBoard } from '../types/learningBoard'

/* A mathematics lesson: equation + explanation + steps + worked example.
 * Same shell, completely different composition — that is the point. */
export const MATHS_QUADRATIC_BOARD: LearningBoard = {
  type: 'learning_board',
  version: 1,
  id: 'board-maths-quadratic',
  title: 'How does the quadratic formula find the roots?',
  subtitle: 'Quadratic equations · Class 10',
  layout: 'grid',
  blocks: [
    {
      id: 'equation-1',
      type: 'equation',
      eyebrow: 'THE FORMULA',
      title: 'The quadratic formula',
      layout: { width: 'medium' },
      latex: 'x = (−b ± √(b² − 4ac)) / 2a',
      variables: [
        { symbol: 'a, b, c', meaning: 'coefficients of ax² + bx + c = 0' },
        { symbol: 'b² − 4ac', meaning: 'the discriminant — decides how many real roots exist' },
      ],
    },
    {
      id: 'explanation-1',
      type: 'explanation',
      title: 'Where it comes from',
      layout: { width: 'wide' },
      content:
        'The formula is completing the square, done once in general. Any quadratic ' +
        'ax² + bx + c = 0 can be reshaped until x appears in a single squared term; ' +
        'taking the square root of both sides then isolates x.\n\n' +
        'The ± is not decoration: a square root has two answers, and each one is a ' +
        'root of the original equation.',
    },
    {
      id: 'process-1',
      type: 'process',
      title: 'Using it, step by step',
      layout: { width: 'wide' },
      steps: [
        { title: 'Write the equation in standard form', detail: 'Everything on one side: ax² + bx + c = 0.' },
        { title: 'Read off a, b and c', detail: 'Signs included — a dropped minus is the classic error.' },
        { title: 'Compute the discriminant', detail: 'b² − 4ac tells you what to expect: two roots, one, or none real.' },
        { title: 'Apply the formula', detail: 'Substitute and simplify, keeping both ± branches.' },
      ],
    },
    {
      id: 'example-1',
      type: 'example',
      eyebrow: 'WORKED EXAMPLE',
      title: 'x² − 5x + 6 = 0',
      layout: { width: 'medium' },
      prompt: 'Find the roots of x² − 5x + 6 = 0.',
      input: 'a = 1, b = −5, c = 6',
      working: [
        'discriminant = (−5)² − 4·1·6 = 25 − 24 = 1',
        '√1 = 1',
        'x = (5 ± 1) / 2',
      ],
      result: 'x = 3 or x = 2',
    },
    {
      id: 'callout-1',
      type: 'callout',
      tone: 'key',
      layout: { width: 'medium' },
      content: 'The discriminant decides everything before you compute a single root: positive means two real roots, zero means one, negative means none.',
    },
  ],
  connectors: [
    { id: 'c1', from: 'equation-1', to: 'example-1', kind: 'reference', label: 'applied here' },
  ],
  metadata: { chapterId: 'quadratic-equations', conceptId: 'quadratic-formula', source: 'fixture' },
}
