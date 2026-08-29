/*
 * "I DON'T UNDERSTAND" IS THE MOST IMPORTANT THING A LEARNER EVER SAYS, AND IT
 * NAMES NOTHING.
 *
 * `idk`, `dont` and `understand` are all stopwords, so a doubt made only of
 * them has zero content tokens and `resolve` refuses with "try naming the thing
 * you are stuck on". That answer is backwards. A learner who could name the
 * part they are stuck on would not be stuck in the way they are, and being
 * asked to be more precise is what makes a person stop asking.
 *
 * What must be true instead:
 *
 *   1. It is answered, not refused.
 *   2. The answer comes from the beat they are ON -- that is the only place
 *      the confusion can be about, and it is the information the doubt lacks.
 *   3. Asking it again moves somewhere else. Repeating the explanation that
 *      already failed is the specific thing this must never do.
 *   4. A doubt that names nothing AND signals nothing STILL refuses. Without
 *      this pair the feature is satisfied by answering everything.
 */
import { describe, expect, it } from 'vitest'
import { lessonResolver } from './doubt'
import { deriveBeats } from './beats'
import { validateLesson } from '../spec/validate'
import { logarithms } from '../lessons/logarithms'

const lesson = (() => {
  const r = validateLesson(logarithms)
  if (!r.ok) throw new Error(`the logarithms fixture does not validate: ${JSON.stringify(r.issues)}`)
  return r.lesson
})()

const beats = deriveBeats(lesson)
/* The second beat, so "the blocks of this beat" is a real subset and a test
   that passes by returning the whole lesson cannot hide here. */
const beat = beats[1] ?? beats[0]!

function idsOf(resolution: ReturnType<typeof lessonResolver.resolve>): string[] {
  return resolution.kind === 'answer' ? resolution.lesson.blocks.map((b) => b.id) : []
}

describe('a learner who says they are stuck', () => {
  const stuck = { text: 'i dont understand', atBeatId: beat.id }

  it('is answered rather than told to be more specific', () => {
    const answered = lessonResolver.resolve(stuck, lesson)
    expect(answered.kind).toBe('answer')
    expect(idsOf(answered).length).toBeGreaterThan(0)
  })

  it('is answered from the beat they are actually on', () => {
    const answered = lessonResolver.resolve(stuck, lesson)
    /* Not vacuous: an empty list would satisfy the loop below on its own. */
    expect(idsOf(answered).length).toBeGreaterThan(0)
    for (const id of idsOf(answered)) {
      expect(beat.blockIds, `block ${id} is not in the beat the learner is on`).toContain(id)
    }
  })

  /* The whole point. Same words, second time, different blocks. */
  it('does not repeat itself when they say it a second time', () => {
    const first = lessonResolver.resolve(stuck, lesson)
    const seen = idsOf(first)
    expect(seen.length).toBeGreaterThan(0)

    const second = lessonResolver.resolve({ ...stuck, shown: seen }, lesson)
    for (const id of idsOf(second)) {
      expect(seen, `block ${id} was shown twice to a learner who said it did not help`).not.toContain(id)
    }
  })

  it('recognises the short forms a real learner types', () => {
    for (const text of ['idk', 'i still dont get it', 'huh?', 'this makes no sense']) {
      const answered = lessonResolver.resolve({ text, atBeatId: beat.id }, lesson)
      expect(answered.kind, `"${text}" was not recognised as being stuck`).toBe('answer')
    }
  })

  /* One block is what already failed them. A second look that shows a single
     thing is the same size as the thing they just did not follow, so where the
     beat has more to give, more is given. Pins MAX_STUCK_BLOCKS, which a mutant
     could otherwise drop to 1 unnoticed. */
  it('shows more than one block when the beat has more than one to give', () => {
    expect(beat.blockIds.length).toBeGreaterThan(1)
    const answered = lessonResolver.resolve(stuck, lesson)
    expect(idsOf(answered).length).toBeGreaterThan(1)
  })

  /* THE PAIR. Without it "answer everything" passes every test above. */
  it('still refuses a doubt that names nothing and signals nothing', () => {
    for (const text of ['asdf qwer', '...', 'the a of the']) {
      const answered = lessonResolver.resolve({ text, atBeatId: beat.id }, lesson)
      expect(answered.kind, `"${text}" should not have been treated as being stuck`).toBe('refusal')
    }
  })

  /* Honest when it runs out, rather than repeating. */
  it('refuses rather than repeat once the whole beat has been shown', () => {
    const answered = lessonResolver.resolve({ ...stuck, shown: beat.blockIds }, lesson)
    expect(answered.kind).toBe('refusal')
  })
})
