import type { Lesson, LessonElement } from '../contract/types'

/* CONTENT DESIGNED TO BREAK THE LAYOUT.
 *
 * The acceptance lessons prove the engine handles content someone wrote
 * carefully. These prove it handles content nobody wrote carefully: a table
 * with sixty rows, a chain with sixty-character labels, a chart with one
 * point, an empty series, nine blocks all claiming to be primary.
 *
 * PASS is not "it rendered". PASS is: no overflow, no collision, no accidental
 * void, every piece of content still reachable, and a result a person would
 * call intentionally composed rather than survived.
 */

const el = (over: Partial<LessonElement>): LessonElement => ({
  id: over.id ?? 'x', kind: 'text', purpose: 'explain', payload: {}, ...over,
})

const lesson = (id: string, question: string, elements: LessonElement[]): Lesson =>
  ({ id, question, elements })

export const sixtyRowTable = lesson('60-row-table', 'What does a long table do?', [
  el({
    id: 'big', kind: 'table', purpose: 'quantify', priority: 'primary',
    payload: {
      columns: [
        { key: 'n', label: 'Index', type: 'number' },
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'val', label: 'Value', type: 'currency', precision: 2 },
      ],
      rows: Array.from({ length: 60 }, (_, i) => ({ n: i + 1, name: `Row ${i + 1}`, val: i * 137.5 })),
    },
  }),
])

export const fourteenColumnTable = lesson('14-col-table', 'What does a wide table do?', [
  el({
    id: 'wide', kind: 'table', purpose: 'compare', priority: 'primary',
    payload: {
      columns: Array.from({ length: 14 }, (_, i) => ({ key: `c${i}`, label: `Column ${i}`, type: 'number' })),
      rows: Array.from({ length: 5 }, (_, r) =>
        Object.fromEntries(Array.from({ length: 14 }, (_, c) => [`c${c}`, r * c]))),
    },
  }),
])

export const fourHundredWordProse = lesson('400-word-prose', 'What does very long prose do?', [
  el({
    id: 'wall', kind: 'text', purpose: 'explain', priority: 'primary',
    payload: { paragraphs: [Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ')] },
  }),
])

export const thirtyEventTimeline = lesson('30-event-timeline', 'What does a long timeline do?', [
  el({
    id: 'tl', kind: 'timeline', purpose: 'sequence', priority: 'primary',
    payload: {
      events: Array.from({ length: 30 }, (_, i) => ({ at: String(1990 + i), label: `Event ${i + 1}` })),
    },
  }),
])

export const twelveStepChain = lesson('12-step-chain', 'What does a long chain do?', [
  el({
    id: 'chain', kind: 'diagram', purpose: 'sequence', priority: 'primary',
    payload: {
      nodes: Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, label: `Step ${i + 1}` })),
      edges: Array.from({ length: 11 }, (_, i) => ({ from: `s${i}`, to: `s${i + 1}` })),
    },
  }),
])

export const fiveHundredPointChart = lesson('500-point-chart', 'What does a dense chart do?', [
  el({
    id: 'dense', kind: 'chart', purpose: 'quantify', priority: 'primary',
    payload: {
      intent: 'trend',
      fields: [
        { name: 't', role: 'x', type: 'quantitative' },
        { name: 'v', role: 'y', type: 'quantitative', unit: 'units' },
      ],
      data: Array.from({ length: 500 }, (_, i) => ({ t: i, v: Math.sin(i / 20) * 50 + 100 })),
    },
  }),
])

export const nineAllPrimary = lesson('9-all-primary', 'What if everything is important?',
  Array.from({ length: 9 }, (_, i) =>
    el({ id: `p${i}`, kind: 'text', priority: 'primary', payload: { paragraphs: [`Block ${i}`] } })))

export const oneBlockOnly = lesson('1-block', 'What is the shortest possible lesson?', [
  el({ id: 'only', kind: 'text', priority: 'primary', payload: { paragraphs: ['Yes.'] } }),
])

export const zeroRelationships = lesson('0-relationships', 'What if nothing connects?', [
  el({ id: 'a', kind: 'text', priority: 'primary', payload: { paragraphs: ['One.'] } }),
  el({ id: 'b', kind: 'text', payload: { paragraphs: ['Two.'] } }),
  el({ id: 'c', kind: 'text', payload: { paragraphs: ['Three.'] } }),
])

export const fullyConnected = lesson('fully-connected', 'What if everything connects?', [
  el({
    id: 'mesh', kind: 'diagram', purpose: 'relate', priority: 'primary',
    payload: {
      nodes: Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, label: `Node ${i}` })),
      edges: Array.from({ length: 6 }, (_, i) =>
        Array.from({ length: 6 }, (_, j) => ({ from: `n${i}`, to: `n${j}` }))).flat()
        .filter((e) => e.from !== e.to),
    },
  }),
])

export const sixtyCharLabels = lesson('60-char-labels', 'What if every label is a sentence?', [
  el({
    id: 'verbose', kind: 'diagram', purpose: 'sequence', priority: 'primary',
    payload: {
      nodes: Array.from({ length: 4 }, (_, i) => ({
        id: `v${i}`,
        label: `This is an extremely long node label number ${i} that nobody should write`,
      })),
      edges: Array.from({ length: 3 }, (_, i) => ({ from: `v${i}`, to: `v${i + 1}` })),
    },
  }),
])

export const singleDataPoint = lesson('1-data-point', 'What does one point do?', [
  el({
    id: 'lonely', kind: 'chart', purpose: 'quantify', priority: 'primary',
    payload: {
      intent: 'trend',
      fields: [
        { name: 'x', role: 'x', type: 'quantitative' },
        { name: 'y', role: 'y', type: 'quantitative' },
      ],
      data: [{ x: 1, y: 42 }],
    },
  }),
])

export const emptySeries = lesson('empty-series', 'What does no data do?', [
  el({
    id: 'nothing', kind: 'chart', purpose: 'quantify', priority: 'primary',
    payload: {
      intent: 'trend',
      fields: [
        { name: 'x', role: 'x', type: 'quantitative' },
        { name: 'y', role: 'y', type: 'quantitative' },
      ],
      data: [],
    },
  }),
])

export const emptyTable = lesson('empty-table', 'What does an empty table do?', [
  el({
    id: 'blank', kind: 'table', purpose: 'quantify', priority: 'primary',
    payload: { columns: [{ key: 'a', label: 'A', type: 'text' }], rows: [] },
  }),
])

export const oneWordAnswer = lesson('one-word', 'Is water wet?', [
  el({ id: 'yes', kind: 'text', priority: 'primary', payload: { paragraphs: ['Yes.'] } }),
])

export const noGoodVisual = lesson('no-good-visual', 'What is justice?', [
  el({
    id: 'essay', kind: 'text', purpose: 'define', priority: 'primary',
    payload: {
      paragraphs: [
        'Justice resists a diagram. It is contested, contextual, and argued over rather than measured.',
        'A lesson that forced a chart onto it would be inventing precision the subject does not have.',
      ],
    },
  }),
])

export const ADVERSARIAL_LESSONS = [
  sixtyRowTable, fourteenColumnTable, fourHundredWordProse, thirtyEventTimeline,
  twelveStepChain, fiveHundredPointChart, nineAllPrimary, oneBlockOnly,
  zeroRelationships, fullyConnected, sixtyCharLabels, singleDataPoint,
  emptySeries, emptyTable, oneWordAnswer, noGoodVisual,
] as const
