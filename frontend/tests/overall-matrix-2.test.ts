import { describe, expect, it } from 'vitest'
import { lessonSchema, requestSchema } from '../src/lesson'
import { calculate } from '../server/calculator'
import { splitSpeech } from '../src/voice'

describe('request contract matrix', () => {
  for (let i = 0; i < 150; i++) it(`accepts request ${i}`, () => {
    const parsed = requestSchema.parse({ question: `Question ${i}`, memory: [] })
    expect(parsed.question).toBe(`Question ${i}`)
  })
})

describe('diagram contract matrix', () => {
  for (let i = 0; i < 150; i++) it(`accepts connected diagram ${i}`, () => {
    const lesson = lessonSchema.parse({ title: `Diagram ${i}`, explanation: 'A graph.', blocks: [{ kind: 'diagram', title: `Graph ${i}`, nodes: [{ id: 'a', label: `Start ${i}` }, { id: 'b', label: `End ${i}` }], edges: [{ from: 'a', to: 'b', label: `Step ${i}` }] }] })
    expect(lesson.blocks[0].kind).toBe('diagram')
  })
})

describe('calculator boundary matrix', () => {
  for (let i = 1; i <= 100; i++) it(`evaluates arithmetic ${i}`, () => expect(calculate(`${i} + ${i} / 2`)).toBe(i * 1.5))
})

describe('voice punctuation matrix', () => {
  for (let i = 0; i < 100; i++) it(`preserves conversational punctuation ${i}`, () => {
    const parts = splitSpeech(`Wait... ${i}. Really? Yes!`)
    expect(parts).toHaveLength(4)
    expect(parts[1]).toBe(`${i}.`)
  })
})
