/*
 * ASKING TWICE MUST NOT ANSWER TWICE THE SAME WAY.
 *
 * `lessonResolver.resolve` is a pure function of `(doubt, lesson)`. `Doubt`
 * carries `{ text, atBeatId }` and no history, so a learner who did not
 * understand and asks again gets the identical blocks back, byte for byte. The
 * one signal that the explanation failed -- them asking a second time -- is the
 * one thing the resolver cannot see.
 *
 * Repeating an explanation that already did not work is worse than saying
 * nothing: it costs the learner the same reading twice and teaches them the
 * system is not listening.
 *
 * `shown` closes that. It is the ids this learner has already been given, and a
 * resolver that has it can move somewhere else in the lesson.
 */
import { describe, expect, it } from 'vitest'
import { lessonResolver } from './doubt'
import { validateLesson } from '../spec/validate'
import { logarithms } from '../lessons/logarithms'

const lesson = (() => {
  const r = validateLesson(logarithms)
  if (!r.ok) throw new Error(`the logarithms fixture does not validate: ${JSON.stringify(r.issues)}`)
  return r.lesson
})()

/** The block ids an answer put on screen. */
function idsOf(resolution: ReturnType<typeof lessonResolver.resolve>): string[] {
  return resolution.kind === 'answer' ? resolution.lesson.blocks.map((b) => b.id) : []
}

describe('asking the same thing twice', () => {
  const doubt = { text: 'what is the base', atBeatId: 'b1' }

  it('answers the first time', () => {
    const first = lessonResolver.resolve(doubt, lesson)
    expect(first.kind).toBe('answer')
    expect(idsOf(first).length).toBeGreaterThan(0)
  })

  /* The PAIR, and the reason this file exists. Without `shown` the two calls
     are identical by construction, so this test is the whole feature. */
  it('does not repeat a block the learner has already been shown', () => {
    const first = lessonResolver.resolve(doubt, lesson)
    const alreadySeen = idsOf(first)
    expect(alreadySeen.length).toBeGreaterThan(0)

    const second = lessonResolver.resolve({ ...doubt, shown: alreadySeen }, lesson)
    const nowShown = idsOf(second)

    for (const id of nowShown) {
      expect(alreadySeen, `block ${id} was shown twice`).not.toContain(id)
    }
  })

  it('still answers on the second ask rather than refusing', () => {
    const first = lessonResolver.resolve(doubt, lesson)
    const second = lessonResolver.resolve({ ...doubt, shown: idsOf(first) }, lesson)
    expect(second.kind).toBe('answer')
  })

  /*
   * WHEN THE LESSON RUNS OUT, THAT IS INFORMATION, NOT A BUG. Every block
   * already shown means this lesson has nothing left to say differently, and a
   * refusal naming that is more honest than a fourth identical answer.
   */
  it('refuses rather than repeating when everything has been shown', () => {
    const everything = lesson.blocks.map((b) => b.id)
    const out = lessonResolver.resolve({ ...doubt, shown: everything }, lesson)
    expect(out.kind).toBe('refusal')
  })

  it('an empty history behaves exactly as no history', () => {
    const withNone = lessonResolver.resolve({ ...doubt, shown: [] }, lesson)
    const without = lessonResolver.resolve(doubt, lesson)
    expect(idsOf(withNone)).toEqual(idsOf(without))
  })
})
