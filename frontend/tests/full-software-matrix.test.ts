import { describe, expect, it } from 'vitest'
import { lessonSchema, requestSchema } from '../src/lesson'
import { calculate } from '../server/calculator'
import { splitSpeech } from '../src/voice'

describe('full API input matrix', () => {
  for (let i = 0; i < 600; i++) it(`request boundary ${i}`, () => {
    const result = requestSchema.parse({ question: `Explain subject ${i}`, memory: [] })
    expect(result.question).toMatch(String(i))
  })
})

describe('full lesson matrix', () => {
  for (let i = 0; i < 600; i++) it(`lesson output ${i}`, () => {
    const kind = i % 3
    const block = kind === 0 ? { kind: 'steps', title: `Process ${i}`, items: [`Start ${i}`, `Finish ${i}`] } : kind === 1 ? { kind: 'comparison', title: `Choice ${i}`, columns: ['Before', 'After'], rows: [[`A${i}`, `B${i}`], ['yes', 'no']] } : { kind: 'chart', title: `Measure ${i}`, unit: 'units', points: [{ label: `P${i}`, value: i + 1 }, { label: 'baseline', value: 1 }] }
    const result = lessonSchema.parse({ title: `Lesson ${i}`, explanation: `Explanation ${i}`, blocks: [block] })
    expect(result.title).toBe(`Lesson ${i}`)
  })
})

describe('full scene matrix', () => {
  for (let i = 0; i < 600; i++) it(`scene primitive ${i}`, () => {
    const element = i % 4 === 0 ? { type: 'rect', x: i % 1000, y: i % 700, width: 20 + i % 100, height: 20 + i % 60 } : i % 4 === 1 ? { type: 'circle', x: i % 1000, y: i % 700, radius: 5 + i % 50 } : i % 4 === 2 ? { type: 'line', x1: i % 1000, y1: i % 700, x2: (i + 100) % 1200, y2: (i + 50) % 800 } : { type: 'text', x: i % 1000, y: i % 700, label: `Label ${i}` }
    const result = lessonSchema.parse({ title: 'Scene', explanation: 'Scene', blocks: [{ kind: 'scene', title: `Primitive ${i}`, elements: [element] }] })
    expect(result.blocks[0].kind).toBe('scene')
  })
})

describe('full diagram matrix', () => {
  for (let i = 0; i < 400; i++) it(`diagram graph ${i}`, () => {
    const result = lessonSchema.parse({ title: 'Graph', explanation: 'Graph', blocks: [{ kind: 'diagram', title: `Graph ${i}`, nodes: [{ id: 'one', label: `One ${i}` }, { id: 'two', label: `Two ${i}` }, { id: 'three', label: 'Three' }], edges: [{ from: 'one', to: 'two' }, { from: 'two', to: 'three' }] }] })
    expect(result.blocks[0].kind).toBe('diagram')
  })
})

describe('full calculator matrix', () => {
  for (let i = 1; i <= 400; i++) it(`calculation ${i}`, () => expect(calculate(`(${i} + 2) * 3`)).toBe((i + 2) * 3))
})

describe('full voice matrix', () => {
  for (let i = 0; i < 400; i++) it(`speech delivery ${i}`, () => {
    const parts = splitSpeech(`Hello ${i}. This is a test! Are you ready?`)
    expect(parts).toEqual([`Hello ${i}.`, 'This is a test!', 'Are you ready?'])
  })
})
