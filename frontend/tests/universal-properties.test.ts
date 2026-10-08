import { describe, expect, it } from 'vitest'
import { lessonSchema, requestSchema } from '../src/lesson'
import { calculate } from '../server/calculator'
import { splitSpeech } from '../src/voice'

const word = (i: number) => `token_${i.toString(36)}_${(i * 7919).toString(36)}`

describe('universal request properties', () => {
  for (let i = 0; i < 1000; i++) it(`valid request remains valid ${i}`, () => {
    const input = { question: `${word(i)} explain this`, memory: [] }
    const parsed = requestSchema.parse(input)
    expect(parsed.question.length).toBeGreaterThan(0)
    expect(parsed.question.length).toBeLessThanOrEqual(1000)
    expect(parsed.memory).toEqual([])
  })
})

describe('universal lesson properties', () => {
  for (let i = 0; i < 1000; i++) it(`valid lesson preserves content ${i}`, () => {
    const input = { title: word(i), explanation: `Explanation ${word(i)}`, blocks: [{ kind: 'steps', title: 'Process', items: [`Start ${word(i)}`, `Finish ${word(i)}`] }] }
    const parsed = lessonSchema.parse(input)
    expect(parsed.title).toBe(input.title)
    expect(parsed.blocks).toHaveLength(1)
  })
})

describe('universal scene properties', () => {
  for (let i = 0; i < 1000; i++) it(`scene coordinates stay bounded ${i}`, () => {
    const x = i % 1200; const y = (i * 17) % 800
    const parsed = lessonSchema.parse({ title: 't', explanation: 'e', blocks: [{ kind: 'scene', title: 's', width: 1200, height: 800, elements: [{ type: 'circle', x, y, radius: 1 + i % 400, label: word(i) }] }] })
    const block = parsed.blocks[0]
    expect(block.kind).toBe('scene')
    if (block.kind === 'scene') { const element = block.elements[0]; expect(element.type).toBe('circle'); if (element.type === 'circle') { expect(element.x).toBeGreaterThanOrEqual(0); expect(element.x).toBeLessThanOrEqual(1200); expect(element.y).toBeLessThanOrEqual(800) } }
  })
})

describe('universal calculator properties', () => {
  for (let i = 1; i <= 1000; i++) it(`arithmetic identity ${i}`, () => {
    const value = calculate(`${i} + 0`)
    expect(value).toBe(i)
    expect(calculate(`${i} * 1`)).toBe(i)
  })
})

describe('universal voice properties', () => {
  for (let i = 0; i < 1000; i++) it(`voice chunks preserve sentence content ${i}`, () => {
    const source = `${word(i)}. ${word(i + 1)}! ${word(i + 2)}?`
    const chunks = splitSpeech(source)
    expect(chunks.join(' ')).toBe(source)
    expect(chunks.every(chunk => chunk.length > 0)).toBe(true)
  })
})

describe('universal rejection properties', () => {
  for (let i = 0; i < 1000; i++) it(`rejects invalid calculator input ${i}`, () => {
    expect(() => calculate(`${word(i)} + ${i}`)).toThrow('CALCULATION_INVALID')
  })
})
