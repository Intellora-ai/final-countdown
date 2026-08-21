import { describe, it, expect } from 'vitest'
import { planFromBoard, planFromSteps, splitLongExplanation, wordCount } from './plan'
import { MAX_STEP_WORDS } from './types'
import { validateBoard } from '../renderer/validateBoard'
import { CHANGE_OF_STATE_BOARD } from '../fixtures/change-of-state'
import type { Block, BoardSource } from '../types/learningBoard'

function validated(source: BoardSource) {
  const r = validateBoard(source)
  if (r.status === 'failed') throw new Error('fixture failed validation')
  return r.board
}

const LONG_TEXT = Array.from({ length: 6 }, (_, i) =>
  `Paragraph ${i + 1}. ` + 'word '.repeat(40).trim() + '.',
).join('\n\n')

describe('splitLongExplanation', () => {
  it('splits past 120 words at paragraph boundaries, never mid-paragraph', () => {
    const parts = splitLongExplanation({ id: 'e', type: 'explanation', title: 'T', content: LONG_TEXT })
    expect(parts.length).toBeGreaterThan(1)
    for (const p of parts) {
      if (p.type !== 'explanation') throw new Error('split changed type')
      expect(wordCount(p.content)).toBeLessThanOrEqual(MAX_STEP_WORDS)
      /* paragraphs intact: every part is whole source paragraphs */
      for (const para of p.content.split('\n\n')) expect(LONG_TEXT).toContain(para)
    }
    /* ids stay unique */
    expect(new Set(parts.map((p) => p.id)).size).toBe(parts.length)
  })

  it('leaves short explanations alone', () => {
    const b: Block = { id: 'e', type: 'explanation', content: 'Short and sweet.' }
    expect(splitLongExplanation(b)).toEqual([b])
  })
})

describe('planFromBoard — the invariant', () => {
  it('hands out steps one at a time and ends with null', async () => {
    const plan = planFromBoard(validated(CHANGE_OF_STATE_BOARD as BoardSource))
    const steps = []
    for (let s = await plan.nextStep(); s !== null; s = await plan.nextStep()) steps.push(s)
    expect(steps.length).toBeGreaterThan(1)
    expect(await plan.nextStep()).toBeNull()
    /* every step obeys the limits */
    for (const step of steps) {
      expect(step.blocks.length).toBeGreaterThan(0)
      const eq = step.blocks.filter((b) => b.type === 'equation').length
      expect(eq).toBeLessThanOrEqual(1)
      expect(step.checkpoint).not.toBeNull()
    }
    /* together the steps release every renderable block exactly once */
    const ids = steps.flatMap((s) => s.blocks.map((b) => b.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('never packs two primary visuals into one step', async () => {
    const board = validated({
      type: 'learning_board', version: 1, id: 'b', title: 'T',
      blocks: [
        { id: 'c1', type: 'pie_chart', data: [{ label: 'a', value: 1 }] },
        { id: 'c2', type: 'bar_chart', data: [{ label: 'a', value: 1 }] },
      ],
    })
    const plan = planFromBoard(board)
    const s1 = await plan.nextStep()
    const s2 = await plan.nextStep()
    expect(s1!.blocks.map((b) => b.id)).toEqual(['c1'])
    expect(s2!.blocks.map((b) => b.id)).toEqual(['c2'])
  })

  it('emits a connector only in the step where its SECOND end is released', async () => {
    const plan = planFromBoard(validated(CHANGE_OF_STATE_BOARD as BoardSource))
    const seen: string[] = []
    const stepOfConnector: Record<string, number> = {}
    const stepOfBlock: Record<string, number> = {}
    let n = 0
    for (let s = await plan.nextStep(); s !== null; s = await plan.nextStep()) {
      n++
      s.blocks.forEach((b) => { stepOfBlock[b.id] = n })
      for (const c of s.connectors ?? []) {
        expect(seen).not.toContain(c.id)   // never twice
        seen.push(c.id)
        stepOfConnector[c.id] = n
        expect(stepOfBlock[c.from]).toBeLessThanOrEqual(n)
        expect(stepOfBlock[c.to]).toBeLessThanOrEqual(n)
      }
    }
    /* the fixture's two connectors both eventually arrive */
    expect(seen.length).toBe(2)
  })

  it('is lazy: consuming one step does not advance past it', async () => {
    const plan = planFromBoard(validated(CHANGE_OF_STATE_BOARD as BoardSource))
    const first = await plan.nextStep()
    const second = await plan.nextStep()
    expect(first!.id).toBe('step-1')
    expect(second!.id).toBe('step-2')
    expect(first!.blocks[0].id).not.toBe(second!.blocks[0].id)
  })
})

describe('planFromSteps', () => {
  it('serves authored steps in order, once, then null', async () => {
    const plan = planFromSteps({ title: 'T' }, [
      { id: 's1', blocks: [{ id: 'e', type: 'explanation', content: 'Hi.' }], checkpoint: { prompt: 'Clear?' } },
      { id: 's2', blocks: [{ id: 'q', type: 'equation', latex: 'x' }], checkpoint: null },
    ])
    expect((await plan.nextStep())!.id).toBe('s1')
    expect((await plan.nextStep())!.id).toBe('s2')
    expect(await plan.nextStep()).toBeNull()
  })
})
