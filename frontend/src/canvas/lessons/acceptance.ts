import type { Lesson } from '../contract/types'

/* THE SEVEN ACCEPTANCE LESSONS.
 *
 * They exist to make one claim falsifiable: that the same engine produces
 * COMPOSITIONALLY DIFFERENT and STYLISTICALLY UNIFIED output. Seven different
 * subjects, seven semantic profiles, one design system.
 *
 * Every payload here is SEMANTIC. There is no coordinate, no colour, no size
 * and no alignment in this file — search it and you will not find one. What a
 * lesson says is what exists and how it relates; everything else is the
 * frontend's decision.
 */

/* 1 — prose-dominant */
export const opportunityCost: Lesson = {
  id: 'opportunity-cost',
  question: 'What is opportunity cost?',
  elements: [
    {
      id: 'define', kind: 'text', purpose: 'define', priority: 'primary',
      title: 'The idea',
      payload: {
        paragraphs: [
          'Opportunity cost is what you give up when you choose one thing over another. It is not the money you spend — it is the value of the best alternative you did not take.',
          'An hour spent studying is an hour not spent earning. The cost of the study hour is not zero simply because no money changed hands; it is whatever that hour was worth doing something else.',
        ],
        emphasis: ['best alternative'],
      },
    },
    {
      id: 'example', kind: 'text', purpose: 'explain', priority: 'supporting',
      title: 'Worked through',
      payload: {
        paragraphs: [
          'You have a free evening. You can work a shift for 800 rupees, revise for a test, or see friends. If you revise, the opportunity cost is the 800 rupees — the best thing you turned down, not the sum of everything you turned down.',
        ],
      },
    },
    {
      id: 'caution', kind: 'text', purpose: 'explain', priority: 'optional',
      title: 'The common mistake',
      payload: { paragraphs: ['Opportunity cost counts the single best alternative, never the total of all of them.'] },
    },
  ],
}

/* 2 — table-dominant */
export const inventoryMethods: Lesson = {
  id: 'inventory-methods',
  question: 'How do LIFO, FIFO and weighted average differ?',
  elements: [
    {
      id: 'compare', kind: 'table', purpose: 'compare', priority: 'primary',
      title: 'Three costing methods',
      payload: {
        columns: [
          { key: 'method', label: 'Method', type: 'text' },
          { key: 'assumes', label: 'Assumes', type: 'text' },
          { key: 'cogs', label: 'COGS when prices rise', type: 'category' },
          { key: 'profit', label: 'Reported profit', type: 'category' },
        ],
        rows: [
          { method: 'FIFO', assumes: 'Oldest stock sells first', cogs: 'Lower', profit: 'Higher' },
          { method: 'LIFO', assumes: 'Newest stock sells first', cogs: 'Higher', profit: 'Lower' },
          { method: 'Weighted average', assumes: 'All units cost the same', cogs: 'Between', profit: 'Between' },
        ],
      },
    },
    {
      id: 'numbers', kind: 'table', purpose: 'quantify', priority: 'supporting',
      title: 'The same 100 units, three answers',
      payload: {
        columns: [
          { key: 'method', label: 'Method', type: 'text' },
          { key: 'cogs', label: 'COGS', type: 'currency', precision: 2 },
          { key: 'closing', label: 'Closing stock', type: 'currency', precision: 2 },
        ],
        rows: [
          { method: 'FIFO', cogs: 4200, closing: 5800 },
          { method: 'LIFO', cogs: 4900, closing: 5100 },
          { method: 'Weighted average', cogs: 4550, closing: 5450 },
        ],
      },
    },
    {
      id: 'note', kind: 'text', purpose: 'explain', priority: 'optional',
      payload: { paragraphs: ['LIFO is not permitted under IFRS. Indian companies reporting under Ind AS use FIFO or weighted average.'] },
    },
  ],
}

/* 3 — chart-dominant */
export const indiaGdp: Lesson = {
  id: 'india-gdp',
  question: 'How has India’s GDP grown since 2015?',
  elements: [
    {
      id: 'trend', kind: 'chart', purpose: 'quantify', priority: 'primary',
      title: 'Real GDP growth',
      payload: {
        intent: 'trend',
        fields: [{ name: 'year', role: 'x', type: 'temporal' }, { name: 'growth', role: 'y', type: 'quantitative', unit: '%' }],
        data: [
          { year: 2015, growth: 8.0 }, { year: 2016, growth: 8.3 }, { year: 2017, growth: 6.8 },
          { year: 2018, growth: 6.5 }, { year: 2019, growth: 3.9 }, { year: 2020, growth: -5.8 },
          { year: 2021, growth: 9.1 }, { year: 2022, growth: 7.2 }, { year: 2023, growth: 8.2 },
          { year: 2024, growth: 6.5 }, { year: 2025, growth: 6.4 },
        ],
      },
    },
    {
      id: 'sectors', kind: 'chart', purpose: 'compare', priority: 'supporting',
      title: 'Share by sector',
      payload: {
        intent: 'composition',
        fields: [{ name: 'sector', role: 'x', type: 'nominal' }, { name: 'share', role: 'y', type: 'quantitative', unit: '%' }],
        data: [{ sector: 'Services', share: 55 }, { sector: 'Industry', share: 27 }, { sector: 'Agriculture', share: 18 }],
      },
    },
    {
      id: 'read', kind: 'text', purpose: 'explain', priority: 'supporting',
      payload: { paragraphs: ['The 2020 contraction is the pandemic. The 2021 rebound is measured against that low base, which is why it looks larger than the underlying recovery.'] },
    },
  ],
}

/* 4 — flowchart-dominant (no prior content existed for this) */
export const billToLaw: Lesson = {
  id: 'bill-to-law',
  question: 'How does a bill become law in India?',
  elements: [
    {
      id: 'stages', kind: 'diagram', purpose: 'sequence', priority: 'primary',
      title: 'The passage of an ordinary bill',
      payload: {
        nodes: [
          { id: 'draft', label: 'Drafting' },
          { id: 'intro', label: 'Introduction' },
          { id: 'first', label: 'First reading' },
          { id: 'second', label: 'Second reading' },
          { id: 'committee', label: 'Committee stage' },
          { id: 'third', label: 'Third reading' },
          { id: 'other', label: 'Other House' },
          { id: 'assent', label: 'Presidential assent' },
        ],
        edges: [
          { from: 'draft', to: 'intro' }, { from: 'intro', to: 'first' },
          { from: 'first', to: 'second' }, { from: 'second', to: 'committee' },
          { from: 'committee', to: 'third' }, { from: 'third', to: 'other' },
          { from: 'other', to: 'assent' },
        ],
      },
    },
    {
      id: 'deadlock', kind: 'text', purpose: 'explain', priority: 'supporting',
      title: 'When the Houses disagree',
      payload: { paragraphs: ['If the two Houses cannot agree, the President may summon a joint sitting under Article 108. Money bills are the exception: the Rajya Sabha may only recommend, and the Lok Sabha may ignore.'] },
    },
  ],
}

/* 5 — equation-dominant (no prior content existed for this) */
export const quadraticFormula: Lesson = {
  id: 'quadratic-formula',
  question: 'Where does the quadratic formula come from?',
  elements: [
    {
      id: 'derive', kind: 'equation', purpose: 'derive', priority: 'primary',
      title: 'Completing the square',
      payload: {
        steps: [
          { latex: 'ax^2 + bx + c = 0', note: 'Start with the general form.' },
          { latex: 'x^2 + \\frac{b}{a}x + \\frac{c}{a} = 0', note: 'Divide through by a.' },
          { latex: 'x^2 + \\frac{b}{a}x = -\\frac{c}{a}', note: 'Move the constant across.' },
          { latex: '\\left(x + \\frac{b}{2a}\\right)^2 = \\frac{b^2 - 4ac}{4a^2}', note: 'Complete the square.' },
          { latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}', note: 'Take the root and solve.' },
        ],
        variables: [
          { symbol: 'a', meaning: 'Coefficient of the squared term' },
          { symbol: 'b', meaning: 'Coefficient of the linear term' },
          { symbol: 'c', meaning: 'Constant term' },
        ],
      },
    },
    {
      id: 'discriminant', kind: 'text', purpose: 'explain', priority: 'supporting',
      title: 'What the discriminant tells you',
      payload: { paragraphs: ['The quantity under the root decides everything. Positive gives two real roots, zero gives one, negative gives none on the real line.'] },
    },
  ],
}

/* 6 — simulation-dominant: the reference scene, as a lesson */
export const gasPressure: Lesson = {
  id: 'gas-pressure',
  question: 'Why does increasing temperature increase pressure in a gas?',
  elements: [
    {
      id: 'box', kind: 'simulation', purpose: 'demonstrate', priority: 'primary',
      title: 'Particle model',
      payload: { model: 'ideal-gas', controls: ['T'], readouts: ['P', 'KE'] },
    },
    {
      id: 'chain', kind: 'diagram', purpose: 'explain', priority: 'supporting',
      payload: {
        nodes: [
          { id: 't', label: 'Temperature up' }, { id: 'speed', label: 'Faster particles' },
          { id: 'ke', label: 'More kinetic energy' }, { id: 'hits', label: 'More wall collisions' },
          { id: 'p', label: 'Pressure up' },
        ],
        edges: [
          { from: 't', to: 'speed' }, { from: 'speed', to: 'ke' },
          { from: 'ke', to: 'hits' }, { from: 'hits', to: 'p' },
        ],
      },
    },
    {
      id: 'law', kind: 'equation', purpose: 'relate', priority: 'supporting',
      payload: {
        steps: [{ latex: 'P \\propto T', note: 'At constant volume and amount.' }, { latex: 'PV = nRT' }],
        variables: [
          { symbol: 'P', meaning: 'Pressure', unit: 'kPa' },
          { symbol: 'T', meaning: 'Temperature', unit: 'K' },
        ],
      },
    },
    {
      id: 'graph', kind: 'chart', purpose: 'quantify', priority: 'supporting',
      payload: {
        intent: 'relationship',
        fields: [{ name: 'T', role: 'x', type: 'quantitative', unit: 'K' }, { name: 'P', role: 'y', type: 'quantitative', unit: 'kPa' }],
        data: [],
      },
    },
  ],
  model: {
    vars: [{ id: 'T', label: 'Temperature', value: 450, min: 100, max: 600, unit: 'K' }],
    derived: [{ id: 'P', label: 'Pressure', expr: 'n * 8.314 * T / V', unit: 'kPa', precision: 0 }],
  },
}

/* 7 — mixed */
export const compoundInterest: Lesson = {
  id: 'compound-interest',
  question: 'How does compound interest work?',
  elements: [
    {
      id: 'idea', kind: 'text', purpose: 'define', priority: 'primary',
      payload: { paragraphs: ['Compound interest is interest earned on interest. Each period, the interest already earned joins the principal and earns in its turn.'] },
    },
    {
      id: 'formula', kind: 'equation', purpose: 'relate', priority: 'supporting',
      payload: {
        steps: [{ latex: 'A = P\\left(1 + \\frac{r}{n}\\right)^{nt}' }],
        variables: [
          { symbol: 'P', meaning: 'Principal' },
          { symbol: 'r', meaning: 'Annual rate' },
          { symbol: 'n', meaning: 'Compounds per year' },
          { symbol: 't', meaning: 'Years' },
        ],
      },
    },
    {
      id: 'growth', kind: 'chart', purpose: 'quantify', priority: 'supporting',
      payload: {
        intent: 'trend',
        fields: [{ name: 'year', role: 'x', type: 'quantitative' }, { name: 'value', role: 'y', type: 'currency' }],
        data: Array.from({ length: 21 }, (_, i) => ({ year: i, value: Math.round(10000 * Math.pow(1.08, i)) })),
      },
    },
    {
      id: 'versus', kind: 'table', purpose: 'compare', priority: 'supporting',
      payload: {
        columns: [
          { key: 'years', label: 'Years', type: 'number' },
          { key: 'simple', label: 'Simple', type: 'currency', precision: 0 },
          { key: 'compound', label: 'Compound', type: 'currency', precision: 0 },
        ],
        rows: [
          { years: 5, simple: 14000, compound: 14693 },
          { years: 10, simple: 18000, compound: 21589 },
          { years: 20, simple: 26000, compound: 46610 },
        ],
      },
    },
  ],
}

export const ACCEPTANCE_LESSONS = [
  opportunityCost, inventoryMethods, indiaGdp, billToLaw,
  quadraticFormula, gasPressure, compoundInterest,
] as const
