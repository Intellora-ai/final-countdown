import { expect, it } from 'vitest'
import { lessonSchema } from '../src/lesson'

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
