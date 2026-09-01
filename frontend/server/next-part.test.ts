/*
 * PRESSING CONTINUE MUST NOT COST WHAT WRITING A WHOLE LESSON COSTS.
 *
 * `briefFor` tells the model "Write ONLY THE NEXT PART. One or two blocks, no
 * more." The request carrying that instruction reserved 2000 output tokens and
 * shipped a 2534-character schema beside it -- about 4800 tokens of an
 * 8000-per-minute budget, spent on every press, against a 200000-per-DAY
 * ceiling. That is roughly forty presses in a day, which is not a lesson.
 *
 * These checks are about WHICH CALL IS MADE, because that is where the price is
 * set. They do not assert a latency: no measurement of one exists that was not
 * taken on a budget already spent, and a number nobody measured does not belong
 * in an assertion.
 */

import { describe, expect, it } from 'vitest'

import { createHandler, type ModelPort, type SearchPort } from './handler.ts'

const A_LESSON = {
  id: 'photosynthesis',
  question: 'What is photosynthesis?',
  blocks: [
    {
      id: 'intro',
      kind: 'prose',
      emphasis: 'primary',
      tone: 'neutral',
      role: 'definition',
      depth: 'core',
      body: 'Photosynthesis is how a leaf turns light into stored sugar.',
      terms: [{ text: 'light', mark: 'key' }],
    },
  ],
  relations: [],
}

const A_TEST_SECRET = 'test-secret-not-used-anywhere-real'
const noSearch: SearchPort = { search: async () => [] }
const ask = (body: Record<string, unknown>) => ({ method: 'POST', path: '/api/ask', body })

/** Records which of the two calls was taken. */
function twoWayModel(options: { withNextPart: boolean }) {
  const taken: string[] = []
  const model: ModelPort = {
    lesson: async () => {
      taken.push('lesson')
      return A_LESSON
    },
    ...(options.withNextPart
      ? {
          nextPart: async () => {
            taken.push('nextPart')
            return A_LESSON
          },
        }
      : {}),
  }
  return { model, taken }
}

const CONTINUING = {
  question: 'What is photosynthesis?',
  taught: 'A leaf takes in light. That light does work inside the leaf.',
  justSaid: 'carry on',
}

describe('the next part of a lesson in progress', () => {
  it('is asked for with the call priced for one or two blocks', async () => {
    const { model, taken } = twoWayModel({ withNextPart: true })

    const res = await createHandler({ model, search: noSearch, identitySecret: A_TEST_SECRET })(
      ask(CONTINUING),
    )

    expect(res.status).toBe(200)
    expect(
      taken,
      'continuing a lesson still paid the whole-lesson price: the schema and a 2000-token reservation, for one or two blocks',
    ).toEqual(['nextPart'])
  })

  it('is still served by a provider that has no such call', async () => {
    /* Anthropic and Ollama have only `lesson`. Losing the saving is acceptable.
       Losing the lesson is not. */
    const { model, taken } = twoWayModel({ withNextPart: false })

    const res = await createHandler({ model, search: noSearch, identitySecret: A_TEST_SECRET })(
      ask(CONTINUING),
    )

    expect(res.status, 'a provider without the cheap call stopped teaching').toBe(200)
    expect(taken).toEqual(['lesson'])
  })

  it('is not taken for a fresh question, which is a different thing entirely', async () => {
    /* A fresh question carries no `taught`, and `briefFor` checks that FIRST for
       the same reason: the next part must follow what she has read, and there is
       nothing to follow. Routing a first question here would hand her part two
       of a lesson that has no part one. */
    const { model, taken } = twoWayModel({ withNextPart: true })

    await createHandler({ model, search: noSearch, identitySecret: A_TEST_SECRET })(
      ask({ question: 'What is photosynthesis?' }),
    )

    expect(taken, 'a first question was answered as though it were a continuation').toEqual(['lesson'])
  })

  it('treats a blank taught as no taught, rather than as a continuation of nothing', async () => {
    const { model, taken } = twoWayModel({ withNextPart: true })

    await createHandler({ model, search: noSearch, identitySecret: A_TEST_SECRET })(
      ask({ question: 'What is photosynthesis?', taught: '   ' }),
    )

    expect(taken).toEqual(['lesson'])
  })
})
