/*
 * OUR OWN GATE REFUSING IS NOT A REASON TO SHOW HER NOTHING.
 *
 * INVARIANT R3, PHASE 4 ITEM 1, in the owner's words: "every input gets a
 * reply; never blank, dropped, or refused."
 *
 * WHAT WAS ACTUALLY HAPPENING. `/api/ask` takes the concept path. When
 * `validateLesson` disliked the shape of what the model wrote, that path threw
 * the model's work away and answered 502. The model had answered. The question
 * was fair. The explanation existed and was sitting in `written.raw`. She got a
 * dead screen because OUR checker wanted a different arrangement.
 *
 * MEASURED, ten real questions through the real server in this session: nine
 * taught, and "how does a fridge work?" came back
 * `the model returned a lesson that failed validation`. That is one child in
 * ten sent away from a question the model had answered.
 *
 * WHY THE WHOLE-LESSON PATH DID NOT HAVE THIS BUG. It has always called
 * `deliverable` -- repair without inventing, re-judge as an ANSWER, drop only
 * the refused blocks, then say so honestly. The ladder was built, tested, and
 * simply unreachable from the route the browser posts to. The same orphan shape
 * this repository built a reachability gate for, one layer above where that
 * gate looks.
 *
 * WHAT THESE TESTS WILL NOT ACCEPT. A pass here must be the model's OWN words
 * reaching her. Every rung of the ladder either keeps what the model wrote or
 * removes some of it; if a test could pass on server-written content, it would
 * be licensing the exact invention this project refuses.
 */

import { describe, expect, it } from 'vitest'

import { createHandler, type ModelPort, type SearchPort } from './handler.ts'

const A_TEST_SECRET = 'test-secret-not-used-anywhere-real'
const noSearch: SearchPort = { search: async () => [] }
const QUESTION = 'How does a fridge work?'

/** The learner's own words, so a pass can be checked for HER content. */
const HER_ANSWER =
  'A fridge moves heat from inside to outside using a liquid that boils at a low temperature.'

/**
 * A concept the gate refuses, for a reason that is real and is not fatal.
 *
 * NO BLOCK THAT SHOWS ANYTHING. `conceptIssues` requires one of table, chart,
 * flow, figure or simulation -- "this step shows nothing, it is all words" --
 * so this is refused for a rule about ARRANGEMENT while every sentence in it is
 * a true, readable explanation. That is exactly the shape a learner lost.
 */
const ALL_WORDS_NO_PICTURE = {
  id: 'fridge',
  question: QUESTION,
  technicalTerms: [{ term: 'refrigerant', introducedIn: 'says-what' }],
  blocks: [
    {
      id: 'says-what',
      kind: 'prose',
      emphasis: 'primary',
      tone: 'neutral',
      role: 'definition',
      depth: 'core',
      body: HER_ANSWER,
      terms: [{ text: 'boils', mark: 'key' }],
    },
  ],
  relations: [],
  checkpoint: 'Where does the heat actually end up?',
  next: [
    { id: 'deeper', label: 'Why the back of a fridge is warm' },
    { id: 'related', label: 'How an air conditioner does the same thing' },
  ],
}

function modelWriting(reply: unknown): ModelPort {
  return {
    lesson: async () => {
      throw new Error('the whole-lesson path must not be taken for a fresh question')
    },
    chat: async () => (typeof reply === 'string' ? reply : JSON.stringify(reply)),
  }
}

function ask(body: Record<string, unknown>) {
  return { method: 'POST', path: '/api/ask', body }
}

function handlerFor(model: ModelPort) {
  return createHandler({ model, search: noSearch, identitySecret: A_TEST_SECRET })
}

/** Every readable string in the reply, so a claim about content is checkable. */
function wordsIn(body: Record<string, unknown>): string {
  return JSON.stringify(body['lesson'] ?? '')
}

describe('a lesson our own gate refuses still teaches her something', () => {
  it('answers 200 with the model’s own words, not a 502', async () => {
    const res = await handlerFor(modelWriting(ALL_WORDS_NO_PICTURE))(ask({ question: QUESTION }))

    expect(
      res.status,
      'the gate refused an arrangement and she was shown nothing at all',
    ).toBe(200)
    expect(
      wordsIn(res.body),
      'she was answered, but not with what the model actually wrote for her',
    ).toContain('moves heat from inside to outside')
  })

  it('says plainly that it is only part of it', async () => {
    /* A salvaged answer is LESS than the lesson promised, and she has to be
       able to tell. Passing it off as the whole thing would be the quiet
       degradation this project keeps guarding against. */
    const res = await handlerFor(modelWriting(ALL_WORDS_NO_PICTURE))(ask({ question: QUESTION }))
    expect(res.status).toBe(200)
    expect(
      res.body['partial'],
      'a partial answer was served as though it were the whole lesson',
    ).toBe(true)
  })

  it('invents nothing — every sentence shown is one the model wrote', async () => {
    /*
     * THE PAIR, AND THE ONE THAT MATTERS MOST. "Never refuse" is trivially
     * satisfiable by writing something ourselves, and that would be far worse
     * than a refusal: a child cannot tell a server's invention from a model's
     * answer, and nobody checked it.
     */
    const res = await handlerFor(modelWriting(ALL_WORDS_NO_PICTURE))(ask({ question: QUESTION }))
    const shown = wordsIn(res.body)

    /* A sentence that appears nowhere in what the model wrote. */
    expect(shown).not.toContain('compressor pushes the gas')
    expect(shown).not.toContain('evaporator coil')
  })

  it('does not spend a route on a partial answer', async () => {
    /*
     * She is owed the GOOD version of that way in later. Recording a salvaged
     * one as spent would take it away from her for a full explanation that
     * never happened.
     */
    const res = await handlerFor(modelWriting(ALL_WORDS_NO_PICTURE))(ask({ question: QUESTION }))
    expect(res.status).toBe(200)
    /* The route is still reported so a caller can see which way in was tried;
       what must not happen is it being written into the history. That is
       asserted where the history lives -- see `concept-remembers.test.ts` --
       and here the reply simply must not claim to be a full lesson. */
    expect(res.body['partial']).toBe(true)
  })

  it('still refuses honestly when there is genuinely nothing true to show', async () => {
    /*
     * THE OTHER HALF OF THE PAIR. "Never refuse" must not become "always claim
     * success". A reply with no readable content anywhere cannot be salvaged
     * into one, and inventing something to avoid a 502 is the failure this
     * whole file exists to prevent.
     */
    const res = await handlerFor(modelWriting('this is not JSON at all'))(ask({ question: QUESTION }))

    expect(res.status, 'nothing usable came back and it was reported as a lesson').not.toBe(200)
    expect(
      JSON.stringify(res.body),
      'the failure did not say anything a person could act on',
    ).toMatch(/could not|failed|refused/i)
  })

  it('answers every shape of question, including the ugly ones', async () => {
    /*
     * R3 says EVERY input gets a reply. These are all things a twelve-year-old
     * can type, and none of them may produce a blank screen or a crash.
     */
    const handler = handlerFor(modelWriting(ALL_WORDS_NO_PICTURE))
    const typed = [
      'why',
      '???',
      'HOW DOES A FRIDGE WORK',
      'how does a fridge work' + '?'.repeat(200),
      '  spaces  everywhere  ',
      'emoji 🧊 question',
      '<script>alert(1)</script>',
      "'; DROP TABLE lessons;--",
      'a'.repeat(2000),
    ]

    for (const question of typed) {
      const res = await handler(ask({ question }))
      expect([200, 400, 502], `"${question.slice(0, 24)}" produced ${res.status}`)
        .toContain(res.status)
      expect(
        Object.keys(res.body).length,
        `"${question.slice(0, 24)}" came back with an empty body`,
      ).toBeGreaterThan(0)
    }
  })
})
