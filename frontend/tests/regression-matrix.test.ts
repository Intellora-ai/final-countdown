import { describe, expect, it } from 'vitest'
import { lessonSchema } from '../src/lesson'
import { splitSpeech } from '../src/voice'
import { calculate } from '../server/calculator'

describe('visual regression matrix', () => {
  for (let i = 0; i < 120; i++) it(`validates visual scene ${i}`, () => {
    const element = i % 3 === 0 ? { type: 'rect', x: i, y: i, width: 40 + i, height: 30, label: `R${i}` } : i % 3 === 1 ? { type: 'circle', x: 100 + i, y: 80, radius: 10 + i % 20, label: `C${i}` } : { type: 'line', x1: i, y1: 10, x2: 200 + i, y2: 100, label: `L${i}` }
    const lesson = lessonSchema.parse({ title: `Visual ${i}`, explanation: 'Tested scene.', blocks: [{ kind: 'scene', title: `Scene ${i}`, elements: [element] }] })
    expect(lesson.blocks[0].kind).toBe('scene')
  })
})

describe('lesson regression matrix', () => {
  for (let i = 0; i < 100; i++) it(`validates lesson variant ${i}`, () => {
    const lesson = lessonSchema.parse({ title: `Topic ${i}`, explanation: `Explanation ${i}`, blocks: i % 2 ? [{ kind: 'steps', title: 'Steps', items: [`First ${i}`, `Second ${i}`] }] : [{ kind: 'comparison', title: 'Compare', columns: ['A', 'B'], rows: [[`A${i}`, `B${i}`], ['yes', 'no']] }] })
    expect(lesson.title).toContain(String(i))
  })
})

describe('calculator regression matrix', () => {
  for (let i = 1; i <= 100; i++) it(`calculates expression ${i}`, () => expect(calculate(`${i} * 2 + 1`)).toBe(i * 2 + 1))
})

describe('voice chunking regression matrix', () => {
  for (let i = 0; i < 80; i++) it(`chunks spoken answer ${i}`, () => {
    const parts = splitSpeech(`Sentence ${i}. Follow-up ${i}! Question ${i}?`)
    expect(parts).toEqual([`Sentence ${i}.`, `Follow-up ${i}!`, `Question ${i}?`])
  })
})
