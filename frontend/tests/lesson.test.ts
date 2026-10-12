import { expect, it } from 'vitest'
import { lessonSchema, modelLessonSchema, requestSchema } from '../src/lesson'

const base = { title: 'A visual', explanation: 'An explanation' }
const scene = (element: unknown) => ({ ...base, blocks: [{ kind: 'scene', title: 'Sketch', width: 320, height: 200, elements: [element] }] })
it.each([
  { type: 'rect', x: 300, y: 20, width: 50, height: 40 },
  { type: 'circle', x: 20, y: 20, radius: 40 },
  { type: 'line', x1: 30, y1: 30, x2: 400, y2: 100 },
  { type: 'text', x: 20, y: 250, label: 'Hidden below canvas' },
])('accepts $type geometry beyond the initial page so the renderer can fit it', element => {
  expect(lessonSchema.safeParse(scene(element)).success).toBe(true)
})
it('accepts all supported primitives inside the same scene', () => {
  const value = scene({ type: 'rect', x: 0, y: 0, width: 320, height: 200 })
  value.blocks[0].elements.push({ type: 'circle', x: 80, y: 80, radius: 40 }, { type: 'line', x1: 0, y1: 0, x2: 320, y2: 200 }, { type: 'text', x: 50, y: 50, label: 'A < B' })
  expect(lessonSchema.parse(value).blocks).toHaveLength(1)
})
it.each(['script', 'foreignObject', 'image'])('rejects unsupported scene element %s', type => {
  expect(lessonSchema.safeParse(scene({ type, x: 1, y: 1, label: '<script>alert(1)</script>' })).success).toBe(false)
})
it.each([NaN, Infinity, -10001])('rejects invalid numeric coordinates %s', x => {
  expect(lessonSchema.safeParse(scene({ type: 'text', x, y: 50, label: 'A' })).success).toBe(false)
})
it.each([
  { nodes: [{ id: 'same', label: 'One idea' }, { id: 'same', label: 'Different idea' }], edges: [] },
  { nodes: [{ id: 'one', label: 'One idea' }, { id: 'two', label: 'Different idea' }], edges: [{ from: 'one', to: 'missing' }] },
])('rejects each independent graph identity or endpoint fault', graph => {
  expect(lessonSchema.safeParse({ ...base, blocks: [{ kind: 'diagram', title: 'Connections', ...graph }] }).success).toBe(false)
})
it('keeps minimally populated saved boards readable through schema validation', () => {
  const value = { ...base, blocks: [
    { kind: 'steps', title: 'Two operations', items: ['Begin', 'Finish'] },
    { kind: 'comparison', title: 'Alternatives', columns: ['First', 'Second'], rows: [['A', 'B'], ['C', 'D']] },
    { kind: 'chart', title: 'Measurements', unit: 'units', points: [{ label: 'First', value: 1 }, { label: 'Second', value: 2 }] },
  ] }
  expect(lessonSchema.parse(value).blocks).toHaveLength(3)
})
it('preserves saved scene typography at its declared limits and rejects values beyond those limits', () => {
  expect(lessonSchema.safeParse(scene({ type: 'text', x: 0, y: 20, label: 'Small but valid writing', fontSize: 12 })).success).toBe(true)
  expect(lessonSchema.safeParse(scene({ type: 'text', x: 0, y: 20, label: 'Too small', fontSize: 11 })).success).toBe(false)
  expect(lessonSchema.safeParse(scene({ type: 'line', x1: 0, y1: 0, x2: 30, y2: 40, strokeWidth: 20 })).success).toBe(true)
  expect(lessonSchema.safeParse(scene({ type: 'line', x1: 0, y1: 0, x2: 30, y2: 40, strokeWidth: 21 })).success).toBe(false)
  expect(lessonSchema.safeParse(scene({ type: 'math', x: 0, y: 0, latex: 'x', fontSize: 12 })).success).toBe(true)
  expect(lessonSchema.safeParse(scene({ type: 'math', x: 0, y: 0, latex: 'x', fontSize: 11 })).success).toBe(false)
})
it('enforces bounded saved text and path payloads without changing values at the declared limits', () => {
  const explanation = '界'.repeat(2000)
  expect(lessonSchema.parse({ explanation }).explanation).toBe(explanation)
  expect(lessonSchema.safeParse({ explanation: explanation + '界' }).success).toBe(false)
  const d = 'M0 0' + ' '.repeat(19995) + 'Z'
  expect(d.length).toBe(20000)
  expect(lessonSchema.parse(scene({ type: 'path', d })).blocks).toHaveLength(1)
  expect(lessonSchema.safeParse(scene({ type: 'path', d: d + ' ' })).success).toBe(false)
})
it('retains a readable answer when a model supplies an invalid nonempty drawing for the renderer fallback', () => {
  const lesson = { explanation: 'This answer must remain readable.', blocks: [{ kind: 'svg', title: 'Broken illustration', source: 'x' }] }
  expect(modelLessonSchema.parse(lesson).explanation).toBe(lesson.explanation)
})
it('bounds every retained list block at its declared payload limit', () => {
  const steps = (length: number) => ({ kind: 'steps', title: 'Operations', items: Array.from({ length }, (_, i) => `Operation ${i}`) })
  const comparison = (length: number) => ({ kind: 'comparison', title: 'Alternatives', columns: ['First', 'Second'], rows: Array.from({ length }, (_, i) => [`First ${i}`, `Second ${i}`]) })
  const chart = (length: number) => ({ kind: 'chart', title: 'Measurements', unit: 'units', points: Array.from({ length }, (_, i) => ({ label: `Point ${i}`, value: i })) })
  for (const block of [steps, comparison, chart]) {
    expect(lessonSchema.safeParse({ ...base, blocks: [block(8)] }).success).toBe(true)
    expect(lessonSchema.safeParse({ ...base, blocks: [block(9)] }).success).toBe(false)
  }
})
it('normalizes surrounding plot expression whitespace without changing the calculation', () => {
  const value = lessonSchema.parse(scene({ type: 'plot', expression: '\n x + 1 \t', x: 0, y: 0, width: 300, height: 200, xMin: -2, xMax: 2, yMin: -2, yMax: 2 }))
  const block = value.blocks[0]
  if (block.kind !== 'scene' || block.elements[0].type !== 'plot') throw Error('Expected plot')
  expect(block.elements[0].expression).toBe('x + 1')
})
it('preserves the complete learner profile at the context budget and rejects overflow', () => {
  const learner = '界'.repeat(2000)
  for (const [schema, required] of [[modelLessonSchema, { explanation: 'An answer' }], [requestSchema, { question: 'A question' }]] as const) {
    expect(schema.parse({ ...required, learner }).learner).toBe(learner)
    expect(schema.safeParse({ ...required, learner: learner + '界' }).success).toBe(false)
  }
})
