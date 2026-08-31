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

/* -------------------------------------------------------------------------- */
/* The sentence the chain wrote is the sentence she reads                     */
/* -------------------------------------------------------------------------- */

/**
 * WHAT WAS MEASURED, BEFORE ANY OF THIS WAS WRITTEN.
 *
 * `askChain` composes a refusal for every case it cannot answer -- and every
 * one of those sentences was thrown away one line after it arrived. `answer`
 * cast the chain's `Resolution` down to `{ kind?, text? }`, which has no
 * `reason` and no `nearest`, read only `kind === 'answer'`, and substituted a
 * constant for everything else. Measured in the browser build: `CanvasRoute`
 * passes no `ask` port, so EVERY refusal a learner could ever meet -- from
 * `chain.ts`, from `modelResolver.ts`, from `webResolver.ts` -- was replaced
 * with "I could not reach the part of me that answers questions outside this
 * lesson".
 *
 * These tests are PAIRED on purpose, because the interesting half of this is
 * not "say more". It is knowing WHICH of the two sentences is true. An
 * assertion that only ever demands the chain's sentence is satisfied by
 * deleting the constant, and that would put a network lie back on the other
 * side of the branch.
 */
describe('a refusal is not reported as a network failure', () => {
  const refusing = (nearest: readonly string[] = []): DoubtResolver => ({
    name: 'lesson',
    resolve: () => ({
      kind: 'refusal',
      reason: 'This lesson does not cover that.',
      nearest,
    }),
  })

  it('does NOT claim it could not reach, when the port answered and had nothing', async () => {
    /* `ok: true` means the port was REACHED. It answered; it simply had nothing
       to say. Telling the learner a network failure happened here points her at
       a cause she cannot check and invites her to retry something that will
       fail identically. She gets the chain's own true sentence instead. */
    const ask = vi.fn().mockResolvedValue({ ok: true, text: '' })
    const a = createAnswering({ resolvers: [refusing()], ask })

    const result = await a.answer(doubt, LESSON)

    expect(result.text).toContain('This lesson does not cover that.')
    expect(
      result.text,
      'a network failure was reported to the learner that did not happen',
    ).not.toMatch(/could not reach/i)
  })

  it('DOES say it could not reach, when nothing outside the lesson was reached', async () => {
    /* The other half of the pair, and the reason the constant is kept. Here the
       port really was not reached -- this is the shape `CanvasRoute` ships,
       where no `ask` port is configured at all -- so the sentence about
       reaching is the true one and must survive. */
    const ask = vi.fn().mockResolvedValue({ ok: false, reason: 'no question service is configured' })
    const a = createAnswering({ resolvers: [refusing()], ask })

    const result = await a.answer(doubt, LESSON)

    expect(result.text, 'the learner was not told the outside was unreachable').toMatch(
      /could not reach/i,
    )
  })

  it('offers the "did you mean" blocks, named the way she sees them on the page', async () => {
    /* `nearest` is the only CONCRETE help a refusal carries, and it was
       computed on every refusal and read by nobody. It holds block IDS, so it
       is titled the way `TeachView` titles `drawnFrom` -- and by id where a
       block has no title, because an id reads worse than a title and far
       better than a silent gap. `ideal-gas-law` is the untitled block of the
       stored lesson, which is why it is in this list. */
    const ask = vi.fn().mockResolvedValue({ ok: false, reason: 'unreachable' })
    const a = createAnswering({
      resolvers: [refusing(['pressure-vs-temperature', 'ideal-gas-law'])],
      ask,
    })

    const result = await a.answer(doubt, LESSON)

    expect(result.text, 'the "did you mean" list never reached the learner').toContain(
      'Pressure vs temperature',
    )
    expect(result.text, 'an untitled block vanished instead of being named by id').toContain(
      'ideal-gas-law',
    )
  })

  it('does not promise closest parts when the refusal named none', async () => {
    /* The pair for the test above. A lead-in with nothing after it is worse
       than no lead-in: it reads as a list that failed to render. */
    const ask = vi.fn().mockResolvedValue({ ok: false, reason: 'unreachable' })
    const a = createAnswering({ resolvers: [refusing([])], ask })

    const result = await a.answer(doubt, LESSON)

    expect(result.text, 'a "closest parts" line was written with nothing in it').not.toMatch(
      /closest parts/i,
    )
    expect(result.text.trim().endsWith('come back to it.')).toBe(true)
  })
})
