/*
 * THE MEMORY EXISTS AND IS THROWN AWAY.
 *
 * `TeachView` keeps every question and every answer of this session in `asked`.
 * The resolver can now use that -- `Doubt.shown` -- but only if someone reads
 * the ids out of the history and hands them over. `shownAlready` is that step,
 * and it is pure so it can be tested for what it must never do: forget a block
 * the learner has seen.
 */
import { describe, expect, it } from 'vitest'
import { shownAlready } from './shownAlready'

/** Minimal stand-ins. Only the fields `shownAlready` may look at are set. */
const answer = (at: number, ids: string[]) => ({
  at,
  beatId: 'b1',
  doubt: { text: 'q', atBeatId: 'b1' },
  pending: false,
  resolution: { kind: 'answer' as const, lesson: { blocks: ids.map((id) => ({ id })) }, drawnFrom: ids },
})
const refusal = (at: number) => ({
  at,
  beatId: 'b1',
  doubt: { text: 'q', atBeatId: 'b1' },
  pending: false,
  resolution: { kind: 'refusal' as const, reason: 'no', nearest: ['never-shown'] },
})

describe('what the learner has already been shown', () => {
  it('is empty before anything has been asked', () => {
    expect(shownAlready([])).toEqual([])
  })

  it('collects the blocks of a single answer', () => {
    expect(shownAlready([answer(0, ['a', 'b'])])).toEqual(['a', 'b'])
  })

  /* The one that matters. Two answers means both must be remembered; keeping
     only the latest lets the first answer be handed back on the third ask. */
  it('accumulates across every answer, not just the last', () => {
    expect(shownAlready([answer(0, ['a']), answer(1, ['b']), answer(2, ['c'])])).toEqual(['a', 'b', 'c'])
  })

  it('reports each block once even when two answers shared it', () => {
    expect(shownAlready([answer(0, ['a', 'b']), answer(1, ['b', 'c'])])).toEqual(['a', 'b', 'c'])
  })

  /* A refusal put NOTHING on screen. Counting its `nearest` as shown would
     retire blocks the learner never read. */
  it('does not count a refusal as having shown anything', () => {
    expect(shownAlready([refusal(0)])).toEqual([])
    expect(shownAlready([answer(0, ['a']), refusal(1)])).toEqual(['a'])
  })

  /* Prose came from outside the lesson, so it retires no lesson block. */
  it('ignores an answer that came from outside the lesson', () => {
    const outside = { at: 0, beatId: 'b1', doubt: { text: 'q', atBeatId: 'b1' }, pending: false, prose: 'text', resolution: undefined }
    expect(shownAlready([outside])).toEqual([])
  })

  it('ignores a question still waiting for its answer', () => {
    const waiting = { at: 0, beatId: 'b1', doubt: { text: 'q', atBeatId: 'b1' }, pending: true, resolution: undefined }
    expect(shownAlready([waiting])).toEqual([])
  })
})
