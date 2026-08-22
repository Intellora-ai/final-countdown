import type { LearningBoard } from '../types/learningBoard'

/* LINE CHART — numeric x, so the shape means something.
 *
 * The x values are seconds, not categories, which is why the constant-velocity
 * stretch after t=6 is genuinely flat rather than decoratively flat: the
 * component positions points by value when x is numeric.
 */
export const PHYSICS_MOTION_BOARD: LearningBoard = {
  type: 'learning_board',
  version: 1,
  id: 'board-physics-motion',
  title: 'Reading a velocity–time graph',
  subtitle: 'Where the line is flat, the speed is not changing',
  layout: 'grid',
  blocks: [
    {
      id: 'motion-intro',
      type: 'explanation',
      title: 'The slope is the acceleration',
      content:
        'A velocity–time graph answers two questions at once. The height tells you how fast the object is going; the steepness tells you how quickly that speed is changing.\n\nA rising line means speeding up. A flat line means a steady speed — not a stopped object, which is a common misreading. A line at zero height is the stopped one.',
      layout: { width: 'medium' },
    },
    {
      id: 'motion-chart',
      type: 'line_chart',
      eyebrow: 'THE MOTION',
      title: 'A cyclist accelerating, then holding speed',
      layout: { width: 'medium' },
      xLabel: 'Time (s)',
      yLabel: 'Velocity (m/s)',
      /* Uniform acceleration to 6 s, then constant. Chosen so the elbow is
       * unmistakable and the flat section is exactly flat. */
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1.5 },
        { x: 2, y: 3 },
        { x: 3, y: 4.5 },
        { x: 4, y: 6 },
        { x: 5, y: 7.5 },
        { x: 6, y: 9 },
        { x: 7, y: 9 },
        { x: 8, y: 9 },
        { x: 9, y: 9 },
        { x: 10, y: 9 },
      ],
      highlightIndex: 6,
    },
    {
      id: 'motion-equation',
      type: 'equation',
      title: 'Acceleration from the graph',
      layout: { width: 'medium' },
      latex: 'a = Δv / Δt = (9 − 0) / 6 = 1.5 m/s²',
      variables: [
        { symbol: 'a', meaning: 'acceleration', unit: 'm/s²' },
        { symbol: 'Δv', meaning: 'change in velocity', unit: 'm/s' },
        { symbol: 'Δt', meaning: 'time taken', unit: 's' },
      ],
    },
    {
      id: 'motion-callout',
      type: 'callout',
      tone: 'key',
      layout: { width: 'medium' },
      content:
        'After 6 seconds the line is flat and the acceleration is zero — but the cyclist is moving faster than at any earlier moment. Zero acceleration means unchanging speed, not no speed.',
    },
  ],
  connectors: [
    { id: 'c1', from: 'motion-chart', to: 'motion-equation', kind: 'causal', label: 'slope gives a' },
  ],
  metadata: { source: 'fixture' },
}
