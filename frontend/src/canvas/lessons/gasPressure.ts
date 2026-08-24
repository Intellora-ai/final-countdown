import type { LessonInput } from '../spec/spec'

/**
 * The reference composition, expressed as data.
 *
 * WHAT THIS FILE PROVES
 * ---------------------
 * Not one word below says where anything goes or what colour it is. There is no
 * x, no width, no hex, no font size. The composition in the reference — the
 * numbered sections, the causal chain, the equation with `RT` underlined, the
 * annotated P-vs-T line, the simulation panel, the concept map — all of it is
 * DERIVED from the structure here by the layout grammar and the design system.
 *
 * Which means the same engine renders a lesson about the French Revolution, or
 * compound interest, or LIFO versus FIFO, at the same quality, from a file of
 * the same shape. That is the whole point of the exercise.
 */
export const gasPressure: LessonInput = {
  id: 'gas-pressure',
  question: 'Why does increasing temperature increase pressure in a gas?',
  subject: 'Physics',

  blocks: [
    {
      id: 'particle-model',
      kind: 'simulation',
      title: 'Particle model',
      emphasis: 'primary',
      tone: 'neutral',
      model: 'ideal-gas',
      controls: [
        { key: 'temperature', label: 'Temperature', min: 100, max: 800, initial: 450, unit: 'K' },
        { key: 'volume', label: 'Volume', min: 5, max: 60, initial: 24, unit: 'L' },
      ],
      /* Order is the author's emphasis: pressure is the answer, so it reads
         first. The renderer preserves that order rather than sorting. */
      readouts: ['pressure', 'temperature', 'volume'],
      caption: 'Drag temperature. Watch the particles speed up and the wall collisions get harder.',
    },

    {
      id: 'causal-chain',
      kind: 'flow',
      title: 'What actually happens',
      emphasis: 'primary',
      tone: 'insight',
      nodes: [
        { id: 'temp', label: 'Temperature ↑', tone: 'insight' },
        { id: 'motion', label: 'Faster particle motion', tone: 'neutral' },
        { id: 'kinetic', label: 'Increased kinetic energy', tone: 'neutral' },
        { id: 'collisions', label: 'More frequent wall collisions', tone: 'neutral' },
        { id: 'pressure', label: 'Pressure ↑', tone: 'result' },
      ],
      links: [
        { from: 'temp', to: 'motion' },
        { from: 'motion', to: 'kinetic' },
        { from: 'kinetic', to: 'collisions' },
        { from: 'collisions', to: 'pressure' },
      ],
      caption: 'Each step is a consequence of the one before it, not a coincidence.',
    },

    {
      id: 'proportionality',
      kind: 'equation',
      title: 'The relationship',
      emphasis: 'primary',
      tone: 'neutral',
      latex: 'P \\propto T \\qquad (V, n \\text{ constant})',
      caption: 'Hold volume and amount fixed, and pressure tracks temperature exactly.',
    },

    {
      id: 'ideal-gas-law',
      kind: 'equation',
      emphasis: 'supporting',
      tone: 'neutral',
      latex: 'PV = nRT',
      /* Names a TERM, not a glyph position. The design system decides that a
         highlighted term becomes an accent underline. */
      highlight: ['RT'],
      caption: 'The full law. R is constant, so with n and V fixed, only T can move P.',
    },

    {
      id: 'pressure-vs-temperature',
      kind: 'chart',
      title: 'Pressure vs temperature',
      emphasis: 'primary',
      tone: 'neutral',
      chartType: 'line',
      xLabel: 'Temperature (K)',
      yLabel: 'Pressure (kPa)',
      series: [
        {
          name: 'P at V = 24 L, n = 1 mol',
          colorIndex: 0,
          points: [
            { x: 100, y: 34.6 },
            { x: 200, y: 69.3 },
            { x: 300, y: 103.9 },
            { x: 400, y: 138.6 },
            { x: 500, y: 173.2 },
            { x: 600, y: 207.9 },
          ],
        },
      ],
      annotate: { atX: 300, label: '300 K → 103.9 kPa' },
      caption: 'A straight line through the origin. Double the temperature, double the pressure.',
    },

    {
      id: 'what-changes',
      kind: 'table',
      title: 'What changes, what does not',
      emphasis: 'supporting',
      tone: 'neutral',
      columns: [
        { key: 'quantity', label: 'Quantity', type: 'text' },
        { key: 'at300', label: 'At 300 K', type: 'number' },
        { key: 'at600', label: 'At 600 K', type: 'number' },
        { key: 'change', label: 'Change', type: 'percent' },
      ],
      rows: [
        { quantity: 'Pressure (kPa)', at300: 103.9, at600: 207.9, change: 100 },
        { quantity: 'Mean particle speed (m/s)', at300: 484, at600: 684, change: 41.4 },
        { quantity: 'Volume (L)', at300: 24, at600: 24, change: 0 },
        { quantity: 'Number of particles', at300: 6.02e23, at600: 6.02e23, change: 0 },
      ],
      caption: 'Only two things move. The volume and the particle count are held fixed by the setup.',
    },

    {
      id: 'energy-split',
      kind: 'chart',
      title: 'Where the added energy goes',
      emphasis: 'aside',
      tone: 'neutral',
      chartType: 'pie',
      series: [
        {
          name: 'Energy distribution at constant volume',
          colorIndex: 1,
          points: [
            { x: 'Translational kinetic energy', y: 60 },
            { x: 'Rotational', y: 25 },
            { x: 'Vibrational', y: 15 },
          ],
        },
      ],
      caption: 'At constant volume no work is done, so all of it becomes internal energy.',
    },

    {
      id: 'misconception',
      kind: 'callout',
      title: 'The common mistake',
      emphasis: 'supporting',
      tone: 'warning',
      body: 'Particles do not get bigger when heated, and there are not more of them. What changes is how fast they move, and therefore how hard and how often they hit the walls.',
    },

    {
      id: 'result',
      kind: 'metric',
      title: 'At 450 K',
      emphasis: 'supporting',
      tone: 'result',
      value: 155.9,
      unit: 'kPa',
      delta: 50,
      deltaMeaning: 'neutral',
      caption: 'Up from 103.9 kPa at 300 K, with volume unchanged.',
    },

    {
      id: 'summary',
      kind: 'prose',
      title: 'In one paragraph',
      emphasis: 'supporting',
      tone: 'neutral',
      body: 'Temperature is a measure of the average kinetic energy of the particles. Heat a gas in a sealed rigid container and the particles move faster, so they strike the walls more often and with more force each time. Pressure is exactly that force per unit area, so it rises in step with temperature.',
    },
  ],

  /* Relationships, not positions. The layout grammar reads these and may place
     a supporting block beside, beneath, or behind a disclosure — whichever the
     frame allows. The author states that the chart supports the equation, and
     stops there. */
  relations: [
    { from: 'pressure-vs-temperature', to: 'proportionality', kind: 'supports' },
    { from: 'ideal-gas-law', to: 'proportionality', kind: 'derives' },
    { from: 'causal-chain', to: 'particle-model', kind: 'exemplifies' },
    { from: 'what-changes', to: 'pressure-vs-temperature', kind: 'supports' },
    { from: 'misconception', to: 'causal-chain', kind: 'contrasts' },
  ],
}
