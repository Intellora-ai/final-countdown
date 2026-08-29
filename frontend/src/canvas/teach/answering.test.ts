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

/* A CHAIN of one, not a single resolver.
 *
 * Two branches built this independently -- a resolver chain that records what
 * each rung did, and a two-step lesson-then-model escalation. The chain is the
 * better structure and is the injection point `CanvasRoute` already depends on,
 * so the escalation became its last rung. These checks are unchanged in what
 * they assert; only the shape of the fast path moved. */
const answering = (resolver: DoubtResolver, ask = vi.fn()) => ({
  answering: createAnswering({ resolvers: [resolver], ask }),
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
    /*
     * And it tells the learner they were not ignored.
     *
     * THIS ASSERTION CHANGED, AND HERE IS THE EVIDENCE THAT LICENSED IT.
     *
     * It used to require the words /saved|kept|come back/. The requirement
     * behind those words -- stated in the line above it, unchanged -- is that
     * the learner knows their question was not thrown away. But the only
     * message that could satisfy that regex was one promising the question had
     * been STORED and would be RETURNED TO, and nothing in `answering.ts` does
     * either: no queue, no retry, no pending list.
     *
     * Measured in a browser: a learner asked "who is the president of india",
     * was told "Your question is saved — ask me again in a moment and I will
     * come back to it", asked again exactly as instructed, and received the
     * identical sentence. The assertion was pinning a promise the system
     * cannot keep -- which is the measured contradiction LAW 0 requires before
     * a test may move, not a preference about wording.
     *
     * The requirement is unchanged and now tested directly: the message must
     * put the fault on this end rather than on their question.
     */
    expect(result.text).toMatch(/not with your question|on this end|not your fault/i)
    expect(
      /saved|kept|come back to it/i.test(result.text),
      'the message promises to store or return to the question, and nothing does',
    ).toBe(false)
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
