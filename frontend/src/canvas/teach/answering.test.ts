/* Every question gets an answer. That is the whole rule.
 *
 * WHY THE EXISTING RESOLVER REFUSES, AND WHY THAT IS NOT ENOUGH
 *   `doubt.ts` answers only out of the lesson already on screen -- it finds a
 *   block, a caption, two rows of a table, and re-presents them. It cannot
 *   write a sentence about the subject, which is precisely why it cannot write
 *   a WRONG one. So it refuses whenever the answer is not already there.
 *
 *   For a learner who has just admitted confusion, a refusal is the worst
 *   possible reply. So a refusal now escalates to the model instead of ending
 *   the conversation.
 *
 * WHY THE FAST PATH STAYS FIRST
 *   It is instant, it cannot invent, and it is right for most doubts, which
 *   are about something the lesson already said. Going to the model first
 *   would be slower and less safe for no gain.
 *
 * WHY THIS IS NOT INSIDE `DoubtResolver`
 *   That interface is synchronous ON PURPOSE: an async one would let the
 *   lesson advance while an answer was in flight, which is the one thing the
 *   feature exists to prevent. Its own comment says a networked resolver
 *   belongs behind an explicit pending state. This is that pending state.
 */

import { describe, expect, it, vi } from 'vitest'
import { createAnswering, RETURN_LINE } from './answering'
import { gasPressure } from '../lessons/gasPressure'
import { validateLesson } from '../spec/validate'
import type { DoubtResolver } from './contract'

const LESSON = (() => {
  const checked = validateLesson(gasPressure)
  if (!checked.ok) throw new Error('the stored lesson no longer validates')
  return checked.lesson
})()

const answering = (resolver: DoubtResolver, ask = vi.fn()) => ({
  answering: createAnswering({ resolver, ask }),
  ask,
})

const RESOLVER = (kind: 'answer' | 'refusal'): DoubtResolver => ({
  name: 'test',
  resolve: () =>
    kind === 'answer'
      ? { kind: 'answer', blocks: [LESSON.blocks[0]!], source: 'lesson' }
      : { kind: 'refusal', reason: 'nothing in this lesson names that' },
} as unknown as DoubtResolver)

const doubt = { text: 'why does that happen?', atBeatId: 'b1' }

describe('when the lesson already contains the answer', () => {
  it('answers immediately, without asking the model', async () => {
    const { answering: a, ask } = answering(RESOLVER('answer'))
    const result = await a.answer(doubt, LESSON)

    expect(result.from).toBe('lesson')
    expect(ask).not.toHaveBeenCalled()
  })

  it('does not add the come-back line, because we never left', () => {
    const { answering: a } = answering(RESOLVER('answer'))
    return a.answer(doubt, LESSON).then((result) => {
      expect(result.text ?? '').not.toContain(RETURN_LINE)
    })
  })
})

describe('when the lesson does not contain the answer', () => {
  it('asks the model instead of refusing', async () => {
    const ask = vi.fn().mockResolvedValue({ ok: true, text: 'Because the particles move faster.' })
    const { answering: a } = answering(RESOLVER('refusal'), ask)

    const result = await a.answer(doubt, LESSON)

    expect(ask).toHaveBeenCalledWith('why does that happen?')
    expect(result.from).toBe('model')
    expect(result.text).toContain('particles move faster')
  })

  it('offers to come back to the lesson, once, softly', async () => {
    /* The learner asked something off the lesson and got a real answer. The
     * single line invites them back without telling them off for leaving. */
    const ask = vi.fn().mockResolvedValue({ ok: true, text: 'Mount Everest is 8,849 m.' })
    const { answering: a } = answering(RESOLVER('refusal'), ask)

    const result = await a.answer({ text: 'how tall is everest?', atBeatId: 'b1' }, LESSON)

    expect(result.text).toContain('Mount Everest')
    expect(result.text.match(new RegExp(RETURN_LINE, 'g')) ?? []).toHaveLength(1)
  })

  it('STILL answers when the model cannot be reached', async () => {
    /* "Never refuse" has to survive the network being down, or it was never a
     * rule -- it was a rule that held while things were working. */
    const ask = vi.fn().mockResolvedValue({ ok: false, reason: 'the model could not be reached' })
    const { answering: a } = answering(RESOLVER('refusal'), ask)

    const result = await a.answer(doubt, LESSON)

    expect(result.from).toBe('unavailable')
    expect(result.text.length).toBeGreaterThan(20)
    expect(result.text).toMatch(/could not be reached|cannot answer/i)
    /* And it says the question is kept, so the learner knows it was not
     * ignored. */
    expect(result.text).toMatch(/saved|kept|come back/i)
  })

  it('never returns an empty answer, whatever the model sends', async () => {
    for (const reply of [
      { ok: true, text: '' }, { ok: true, text: '   ' }, { ok: true }, {},
    ]) {
      const ask = vi.fn().mockResolvedValue(reply)
      const { answering: a } = answering(RESOLVER('refusal'), ask)
      const result = await a.answer(doubt, LESSON)
      expect(result.text.trim().length, JSON.stringify(reply)).toBeGreaterThan(20)
    }
  })

  it('does not let the model throw into the lesson', async () => {
    const ask = vi.fn().mockRejectedValue(new Error('boom'))
    const { answering: a } = answering(RESOLVER('refusal'), ask)

    const result = await a.answer(doubt, LESSON)
    expect(result.from).toBe('unavailable')
    expect(result.text).not.toContain('boom')
  })
})

describe('what it will not do', () => {
  it('refuses NOTHING: every input produces an answer', async () => {
    const ask = vi.fn().mockResolvedValue({ ok: true, text: 'Here is an answer.' })
    const { answering: a } = answering(RESOLVER('refusal'), ask)

    for (const text of [
      'why?', 'what is the capital of France', 'tell me a joke',
      'i hate this', 'asdfgh', '???', 'how do i cheat on the exam',
    ]) {
      const result = await a.answer({ text, atBeatId: 'b1' }, LESSON)
      expect(result.text.trim().length, text).toBeGreaterThan(0)
      expect(result.from, text).not.toBe('refused')
    }
  })
})
