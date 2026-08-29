/*
 * A MESSAGE MUST NOT PROMISE SOMETHING THE CODE DOES NOT DO.
 *
 * MEASURED IN A BROWSER. With the outside-the-lesson answerer unreachable, a
 * learner asking "who is the president of india" was told:
 *
 *     "I could not reach the part of me that answers questions outside this
 *      lesson, so I cannot answer that one properly yet. Your question is
 *      saved -- ask me again in a moment and I will come back to it."
 *
 * Two claims, both false:
 *
 *   "Your question is saved"      -- nothing stores it. `answering.ts` has no
 *                                    queue, no retry and no pending list; a
 *                                    grep for save/retry/queue finds only the
 *                                    sentence itself.
 *   "ask me again in a moment"    -- asking again returns the IDENTICAL text.
 *                                    The advice cannot work while the
 *                                    dependency is down, which is exactly when
 *                                    it is given.
 *
 * The file's own comment asserts the first one: "The learner's question is not
 * thrown away, and the wording says so". The wording says so; the code does
 * not do so. That is the same defect as the refusal banner that said the model
 * had answered when it had never been contacted -- a sentence that is kind and
 * untrue, which is worse than a blunt one that is true, because a learner acts
 * on it and is let down twice.
 *
 * What must be true: the unavailable message says what happened and what the
 * learner can actually do, and promises no future action that nothing performs.
 */
import { describe, expect, it, vi } from 'vitest'

import { createAnswering } from './answering'
import { validateLesson } from '../spec/validate'
import { gasPressure } from '../lessons/gasPressure'
import type { DoubtResolver } from './contract'

const LESSON = (() => {
  const checked = validateLesson(gasPressure)
  if (!checked.ok) throw new Error('the stored lesson no longer validates')
  return checked.lesson
})()

/** A lesson rung that cannot answer, so the doubt escalates past it. */
const CANNOT: DoubtResolver = {
  name: 'test',
  resolve: () => ({ kind: 'refusal', reason: 'not in this lesson', nearest: [] }),
}

/** The outside-the-lesson answerer, down. */
const down = () => vi.fn(async () => ({ ok: false, reason: 'ECONNREFUSED' }))

const DOUBT = { text: 'who is the president of india', atBeatId: 'what-pressure-is' }

describe('what a learner is told when the outside answerer is down', () => {
  it('does not claim the question was saved', async () => {
    const answering = createAnswering({ resolvers: [CANNOT], ask: down() })
    const answered = await answering.answer(DOUBT, LESSON)
    const text = answered.text ?? ''

    expect(
      /saved|stored|kept/i.test(text),
      `the learner was told their question was saved, and nothing saves it: "${text}"`,
    ).toBe(false)
  })

  it('does not promise to come back to it', async () => {
    const answering = createAnswering({ resolvers: [CANNOT], ask: down() })
    const answered = await answering.answer(DOUBT, LESSON)
    const text = answered.text ?? ''

    expect(
      /come back to it|i will return to|get to it later/i.test(text),
      `the learner was promised a follow-up that never happens: "${text}"`,
    ).toBe(false)
  })

  /* The advice must not be one the learner can immediately disprove. */
  it('asking again gives the same message, so it must not say asking again helps', async () => {
    const ask = down()
    const answering = createAnswering({ resolvers: [CANNOT], ask })

    const first = (await answering.answer(DOUBT, LESSON)).text ?? ''
    const second = (await answering.answer(DOUBT, LESSON)).text ?? ''

    expect(second, 'asking again produced a different message').toBe(first)
    expect(
      /ask me again in a moment/i.test(first),
      'the learner is told to ask again, and asking again returns this same text',
    ).toBe(false)
  })

  /* THE PAIR. Honesty is not silence -- it must still say what happened, or the
     learner is left with a blank and assumes they were ignored. */
  it('still explains what went wrong', async () => {
    const answering = createAnswering({ resolvers: [CANNOT], ask: down() })
    const answered = await answering.answer(DOUBT, LESSON)
    const text = answered.text ?? ''

    expect(text.length, 'the learner was told nothing at all').toBeGreaterThan(20)
    expect(
      /could not reach|not available|cannot answer/i.test(text),
      `the message does not say what happened: "${text}"`,
    ).toBe(true)
  })
})
