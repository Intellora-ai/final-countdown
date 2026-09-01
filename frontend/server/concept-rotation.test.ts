/*
 * ASKING THE SAME THING TWICE MUST NOT ANSWER IT THE SAME WAY.
 *
 * WHY THIS IS A HANDLER TEST AND NOT A `concept.ts` ONE.
 *   `nextRoute` is already tested, and it was already correct: given a list of
 *   routes a learner has spent, it picks one she has not had. The defect was
 *   never in the picking. It was that the list arrived EMPTY every time, because
 *   `/api/ask` called `authorConcept` without the parameter at all -- so the
 *   rotation ran perfectly over a history that was always blank, and the same
 *   question returned the same way in forever.
 *
 *   `concept.ts` cannot catch that. It is the seam ABOVE it that was unwired, so
 *   the proof has to drive the route the browser actually posts to.
 *
 * WHY THE MODEL IS A DOUBLE AND NOT GROQ.
 *   Two reasons, and the first is the honest one: this account's ceiling is
 *   200000 tokens per DAY, and a suite that spends a learner's budget to check
 *   its own bookkeeping is a suite that gets deleted. The second is that a live
 *   model would make this test's verdict depend on what a vendor felt like
 *   writing. The double returns the same concept every time ON PURPOSE -- so if
 *   the two replies still differ, the difference can only have come from the
 *   route, which is exactly the claim.
 */

import { describe, expect, it } from 'vitest'

import { createHandler, type ModelPort, type SearchPort } from './handler.ts'

/* The worked example `conceptRequest` itself puts in the prompt, so the shape is
   the prompt's own rather than one invented here. */
const A_CONCEPT = {
  id: 'base-case',
  question: 'What is a base case?',
  technicalTerms: [{ term: 'recursion', introducedIn: 'shown' }],
  blocks: [
    {
      id: 'says-what',
      kind: 'prose',
      emphasis: 'primary',
      tone: 'neutral',
      role: 'definition',
      depth: 'core',
      body: 'A base case is the branch that returns without calling itself.',
      terms: [{ text: 'branch', mark: 'key' }],
    },
    {
      id: 'shown',
      kind: 'table',
      emphasis: 'supporting',
      tone: 'neutral',
      role: 'framework',
      depth: 'core',
      columns: [
        { key: 'call', label: 'Call', type: 'text' },
        { key: 'does', label: 'What it does', type: 'text' },
      ],
      rows: [
        { call: 'fact(1)', does: 'returns 1, no recursion' },
        { call: 'fact(4)', does: 'calls fact(3)' },
      ],
    },
  ],
  relations: [{ kind: 'supports', from: 'says-what', to: 'shown' }],
  checkpoint: 'Which of those two calls is the base case, and how can you tell?',
  next: [
    { id: 'deeper', label: 'Why a missing base case never stops' },
    { id: 'related', label: 'How recursion builds the answer back up' },
  ],
}

const A_TEST_SECRET = 'test-secret-not-used-anywhere-real'
const noSearch: SearchPort = { search: async () => [] }

/** Records every prompt it is handed, and always answers the same thing. */
function recordingModel() {
  const prompts: string[] = []
  const model: ModelPort = {
    lesson: async () => {
      throw new Error('the whole-lesson path must not be taken for a fresh question')
    },
    /* THE SYSTEM ARGUMENT, NOT THE USER ONE, AND THE FIRST VERSION OF THIS
       TEST RECORDED THE WRONG HALF. `authorConcept` puts the whole request --
       the "HOW TO COME AT IT THIS TIME" directive that IS the route -- in
       `system`, and sends the bare question as `user`. Recording `user` gave
       the same string every time and made the test fail against working code,
       which is a test asserting its author's assumption rather than the
       product's behaviour. */
    chat: async (system: string) => {
      prompts.push(system)
      return JSON.stringify(A_CONCEPT)
    },
  }
  return { model, prompts }
}

function ask(body: Record<string, unknown>) {
  return { method: 'POST', path: '/api/ask', body }
}

const QUESTION = 'Why does a chameleon change colour?'

describe('asking the same question again', () => {
  it('takes a route it has not taken before, and says which one it took', async () => {
    const { model, prompts } = recordingModel()
    const handler = createHandler({ model, search: noSearch, identitySecret: A_TEST_SECRET })

    const first = await handler(ask({ question: QUESTION }))
    expect(first.status, 'the first ask did not produce a lesson').toBe(200)
    const firstRoute = (first.body as { route?: string }).route
    expect(
      firstRoute,
      'the route was not reported, so a caller has no way to avoid repeating it',
    ).toBeTruthy()

    const second = await handler(ask({ question: QUESTION, alreadyUsed: [firstRoute] }))
    expect(second.status).toBe(200)
    const secondRoute = (second.body as { route?: string }).route

    expect(
      secondRoute,
      'the same question took the same way in twice, so the second telling carried nothing the first had not',
    ).not.toBe(firstRoute)

    /* The prompts differ, and that is WHERE the difference is made. Comparing
       only the reported ids would pass even if the id were cosmetic and the
       model had been asked the identical thing twice. */
    expect(
      prompts[1],
      'the model was handed the identical prompt twice, so the route id is decoration',
    ).not.toBe(prompts[0])
  })

  it('does not need the history, and does not break without it', async () => {
    /* A caller that sends nothing must still be taught. The rotation is a
       benefit it forgoes, never a precondition it fails. */
    const { model } = recordingModel()
    const handler = createHandler({ model, search: noSearch, identitySecret: A_TEST_SECRET })

    const res = await handler(ask({ question: QUESTION }))

    expect(res.status).toBe(200)
    expect((res.body as { lesson?: unknown }).lesson).toBeDefined()
  })

  it('ignores a history that is not a list of strings rather than refusing to teach', async () => {
    /* This arrives over HTTP from a browser, so it is whatever was posted. A
       learner must not lose her lesson because a field she never sees was the
       wrong type. */
    const { model } = recordingModel()
    const handler = createHandler({ model, search: noSearch, identitySecret: A_TEST_SECRET })

    for (const junk of [42, 'everyday-example', { route: 'x' }, [1, 2, null]]) {
      const res = await handler(ask({ question: QUESTION, alreadyUsed: junk }))
      expect(res.status, `a lesson was refused because alreadyUsed was ${JSON.stringify(junk)}`).toBe(200)
    }
  })
})
