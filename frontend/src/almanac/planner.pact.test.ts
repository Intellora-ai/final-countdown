/**
 * The contract on the boundary that actually breaks.
 *
 * WHY A SECOND PACT FILE EXISTS
 * -----------------------------
 * `src/api/client.pact.test.ts` contracts the EXTERNAL Learning OS API. That is
 * a real boundary and the contract is a good one, but it is not the boundary a
 * learner's request crosses. The browser talks to `frontend/server` --
 * `/api/day`, `/api/lesson`, `/api/ask`, `/api/done` -- and that is where the
 * 502s, the 503s and the 404s were measured. Contracting the wrong boundary is
 * how a project ends up owning a tool rather than using it: the ceremony is
 * present, the failure it would have caught is somewhere else.
 *
 * WHAT A CONTRACT ADDS THAT THE UNIT TESTS DO NOT
 * -----------------------------------------------
 * `client.test.ts` drives this client against a fake `fetchImpl`, so it proves
 * the client reads a shape THIS FILE'S AUTHOR wrote down. Nothing checks that
 * the shape is the one the server sends. A pact is that check: the interactions
 * recorded here are replayed against the real handler by
 * `server/planner.provider.test.ts`, so a field renamed on one side fails on
 * the other.
 *
 * MATCHERS, NOT LITERALS, with two deliberate exceptions.
 * `like('x')` records "a string is required here". A contract pinned to values
 * fails the first time a fixture changes, which teaches everyone to regenerate
 * contracts without reading them. `done: true` and the 400's `error` are pinned
 * because the client branches on those, not on their type.
 */

import { MatchersV3, PactV3 } from '@pact-foundation/pact'
import { describe, expect, it } from 'vitest'

import { createAlmanacClient } from './client'

const { arrayContaining, eachLike, integer, like, string } = MatchersV3

/**
 * A FRESH provider per interaction. `PactV3` accumulates interactions on the
 * builder and `executeTest` expects every one registered so far to arrive in
 * that single run -- the sibling pact file records the failure this causes when
 * one instance is shared. Contracts merge by consumer/provider name, so
 * separate instances still produce one file.
 *
 * `decodeURIComponent(new URL(...).pathname)` rather than `__dirname`: this file
 * is type-checked by the BROWSER tsconfig, which has no Node types, and
 * `URL.pathname` is percent-encoded so a checkout under a directory with a
 * space in its name resolves to a path that does not exist. Both traps are
 * recorded at length in `src/api/client.pact.test.ts`.
 */
function contract(): PactV3 {
  return new PactV3({
    consumer: 'learning-canvas',
    provider: 'canvas-planner',
    dir: decodeURIComponent(new URL('../../../pacts', import.meta.url).pathname),
    logLevel: 'warn',
  })
}

const JSON_HEADERS = { 'content-type': 'application/json' }

describe('the browser needs these things from the canvas planner', () => {
  it('needs a day it can render, with every field a row reads', async () => {
    await contract()
      .given('a student with a plannable class and subjects')
      .uponReceiving('a request for a day')
      .withRequest({
        method: 'POST',
        path: '/api/day',
        headers: JSON_HEADERS,
        body: {
          studentId: string('stu_arya'),
          date: string('2026-08-30'),
          schoolClass: integer(9),
          dailyMinutes: integer(120),
          subjectIds: eachLike('mathematics'),
        },
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: {
          day: {
            date: string('2026-08-30'),
            /* Every one of these five is read by `isDayPlan`, which REFUSES the
               whole day if any is missing -- so every one is part of the
               contract rather than a field that happens to be present. */
            items: eachLike({
              conceptId: string('number-systems-irrational'),
              subjectId: string('mathematics'),
              chapterId: string('number-systems'),
              minutes: integer(20),
            }),
            allocated: integer(20),
            capacity: integer(120),
          },
        },
      })
      .executeTest(async (mock) => {
        const result = await createAlmanacClient({ baseUrl: mock.url }).day({
          studentId: 'stu_arya',
          date: '2026-08-30',
          schoolClass: 9,
          dailyMinutes: 120,
          subjectIds: ['mathematics'],
        })

        /* Asserted, not merely fetched. A test that calls the client and checks
           nothing records a contract and proves the client cannot read it. */
        expect(result.ok, result.ok ? '' : result.reason).toBe(true)
        if (!result.ok) return
        expect(result.day.items[0]?.conceptId).toBeTypeOf('string')
        expect(result.day.capacity).toBeTypeOf('number')
      })
  })

  it('needs a lesson shaped well enough to render', async () => {
    await contract()
      .given('the model answers')
      .uponReceiving('a request for a lesson on a concept')
      .withRequest({
        method: 'POST',
        path: '/api/lesson',
        headers: JSON_HEADERS,
        body: { concept: string('Irrational numbers') },
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: {
          /* `isLessonShaped` requires all three, and a non-empty `blocks`. A
             lesson missing any of them never reaches the screen. */
          lesson: {
            id: string('irrational-numbers'),
            question: string('What makes a number irrational?'),
            /*
             * `arrayContaining`, NOT `eachLike`, and the provider verification
             * is what taught the difference. `eachLike` applies its template to
             * EVERY element, so a contract written with it claimed every block
             * carries `body` -- and the real gate requires a lesson to hold a
             * table and a summary, neither of which has one. The verification
             * failed on the provider's own valid lesson.
             *
             * `arrayContaining` says what the client actually needs: the array
             * holds AT LEAST ONE element of this shape.
             */
            blocks: arrayContaining(like({ id: 'opening', kind: 'prose' })),
          },
          strategy: string('worked_example'),
        },
      })
      .executeTest(async (mock) => {
        const result = await createAlmanacClient({ baseUrl: mock.url }).lesson({
          concept: 'Irrational numbers',
        })
        expect(result.ok, result.ok ? '' : result.reason).toBe(true)
        if (!result.ok) return
        /* `LessonResult.lesson` is deliberately `unknown` -- the client checks
           only enough shape to stop `undefined.blocks` reaching a student, and
           the canvas re-validates in full before teaching. Narrowed here rather
           than casting the whole result, so the assertion still fails if the
           blocks are gone. */
        const blocks = (result.lesson as { blocks?: readonly unknown[] }).blocks ?? []
        expect(blocks.length).toBeGreaterThan(0)
      })
  })

  it('needs a free question answered as a lesson with readable prose', async () => {
    await contract()
      .given('the model answers')
      .uponReceiving('a free question')
      .withRequest({
        method: 'POST',
        path: '/api/ask',
        headers: JSON_HEADERS,
        body: { question: string('why is the sky blue?') },
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: {
          lesson: {
            id: string('sky-blue'),
            question: string('Why is the sky blue?'),
            /* `body` specifically, and on at least one block. `proseFrom`
               reads that field and NOTHING else, so a rename to `text` would
               return an empty answer -- which the client reports as a failure,
               in front of a learner who has just admitted confusion. */
            blocks: arrayContaining(
              like({ id: 'opening', kind: 'prose', body: 'Shorter wavelengths scatter more.' }),
            ),
          },
        },
      })
      .executeTest(async (mock) => {
        const result = await createAlmanacClient({ baseUrl: mock.url }).ask('why is the sky blue?')
        expect(result.ok, result.ok ? '' : result.reason).toBe(true)
        if (!result.ok) return
        expect(result.text.length).toBeGreaterThan(0)
      })
  })

  it('needs completion to be acknowledged, because it is the only writer', async () => {
    await contract()
      .given('a student with a plannable class and subjects')
      .uponReceiving('a concept marked done')
      .withRequest({
        method: 'POST',
        path: '/api/done',
        headers: JSON_HEADERS,
        body: { studentId: string('stu_arya'), conceptId: string('number-systems-irrational') },
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        /* Pinned to the literal. The Done button is the only thing in the
           product that writes completion, and a 200 carrying `done: false`
           would be a silent no-op the learner reads as success. */
        body: { done: true },
      })
      .executeTest(async (mock) => {
        const result = await createAlmanacClient({ baseUrl: mock.url }).markDone(
          'stu_arya',
          'number-systems-irrational',
        )
        expect(result.ok, result.ok ? '' : result.reason).toBe(true)
      })
  })

  it('needs a REFUSAL it can read, which is where the 502s were', async () => {
    /*
     * THE INTERACTION THIS FILE EXISTS FOR.
     *
     * `reasonFrom` reads exactly one field -- `error`, a non-empty string -- and
     * falls back to "the planner answered 400" when it is absent. That fallback
     * is what a learner saw during the 502s: a number, with no statement of what
     * went wrong. The error SHAPE is as much a part of the contract as the
     * success shape, and it is the half nobody writes down.
     */
    await contract()
      .given('the planner is configured')
      .uponReceiving('a day request with no subjects')
      .withRequest({
        method: 'POST',
        path: '/api/day',
        headers: JSON_HEADERS,
        body: {
          studentId: string('stu_arya'),
          date: string('2026-08-30'),
          schoolClass: integer(9),
          dailyMinutes: integer(120),
          subjectIds: [],
        },
      })
      .willRespondWith({
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: { error: string('subjectIds must list at least one subject') },
      })
      .executeTest(async (mock) => {
        const result = await createAlmanacClient({ baseUrl: mock.url }).day({
          studentId: 'stu_arya',
          date: '2026-08-30',
          schoolClass: 9,
          dailyMinutes: 120,
          subjectIds: [],
        })
        expect(result.ok).toBe(false)
        if (result.ok) return
        /* The server's own sentence, not a status code. */
        expect(result.reason).not.toMatch(/^the planner answered/)
        expect(result.reason.length).toBeGreaterThan(0)
      })
  })
})
