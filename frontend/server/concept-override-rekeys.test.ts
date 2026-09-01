/*
 * WHEN THE VETO MOVES THE TARGET, THE HISTORY AND THE SHELF MOVE WITH IT.
 *
 * WHY THIS FILE EXISTS. Every override test in this repository stops at
 * `permitted`: it asserts the verdict, and the suite stays green without any of
 * them ever reaching `handler.ts`. But `permitted` returning `instead` is only
 * half of an override -- the other half is the handler noticing that the target
 * it read the history under is no longer the target it is about to teach, and
 * reading again under the new one.
 *
 * That branch is where the two stores can silently disagree. Filing under the
 * DECIDED target while judging against the PROPOSED one puts the shelf and the
 * history back out of step, which is the exact defect the unified key was
 * introduced to remove -- and its symptom is a learner being handed a way in
 * she has already had. A verdict-level test cannot see any of it.
 *
 * THE OVERRIDE USED HERE IS THE MEASURED ONE. A learner asked about a chameleon
 * and the controller answered `START_LESSON target="introduction to algebra"`.
 * The target appears nowhere in what she said, so `permitted` refuses it and
 * substitutes her own words -- and from that point the proposed key and the
 * final key are two different keys for the rest of the request.
 *
 * WHY THE MODEL IS A DOUBLE. The same reason `concept-remembers.test.ts` gives:
 * this account's ceiling was measured exhausted at 199591 tokens in one
 * session, and a live model would make the verdict depend on what a vendor felt
 * like writing. The double answers identically every time on purpose, so any
 * difference between two replies can only have come from the route.
 */

import { describe, expect, it } from 'vitest'

import { createHandler, type ModelPort, type SearchPort } from './handler.ts'
import type { Explanation, Explanations } from './memory/explanations.ts'
import { writtenLessons } from './memory/lessons.ts'
import { inMemoryStore as aStore } from './memory/inMemory.spec.ts'

/* The worked example the concept prompt itself carries, so the shape is the
   prompt's own rather than one invented here. */
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
const RECIPE = 'r1'
const noSearch: SearchPort = { search: async () => [] }

const QUESTION = 'Why does a chameleon change colour?'
/* Shares no word with the question, so `grounded` refuses it and `permitted`
   substitutes her own words. This is the target a real controller produced. */
const INVENTED = 'introduction to algebra'

/** A controller that names a subject she never mentioned; a tutor that does not. */
function namesSomethingElse(): ModelPort {
  return {
    lesson: async () => {
      throw new Error('the whole-lesson path must not be taken for a fresh question')
    },
    chat: async (system: string) =>
      system.includes('You are the controller')
        ? JSON.stringify({
            action: 'START_LESSON',
            target: INVENTED,
            reason: 'the double always names this',
            source_needed: false,
            subject_named: true,
          })
        : JSON.stringify(A_CONCEPT),
  }
}

/** The history, in memory, recording which concept each read was keyed by. */
function aBook(): Explanations & { readonly asked: string[] } {
  const kept = new Map<string, Explanation[]>()
  const asked: string[] = []
  return {
    asked,
    priorFor(_owner, concept) {
      asked.push(concept)
      return { explanations: kept.get(concept) ?? [] }
    },
    routesSpent(_owner, concept) {
      return (kept.get(concept) ?? []).map((one) => one.route)
    },
    wordsShown(_owner, concept) {
      return (kept.get(concept) ?? []).map((one) => one.text)
    },
    remember(_owner, concept, shown) {
      kept.set(concept, [...(kept.get(concept) ?? []), shown])
    },
  }
}

function ask(body: Record<string, unknown>) {
  return { method: 'POST', path: '/api/ask', body }
}

/** The `Set-Cookie` a reply planted, as a browser would send it back. */
function cookieFrom(res: { setCookie?: string }): string {
  return (res.setCookie ?? '').split(';')[0] ?? ''
}

const routeOf = (res: { body: unknown }) => (res.body as { route?: string }).route

describe('the veto moves the target, and the history follows it', () => {
  it('reads the history again under the target it decided, not the one it refused', async () => {
    const book = aBook()
    const handler = createHandler({
      model: namesSomethingElse(),
      search: noSearch,
      identitySecret: A_TEST_SECRET,
      explanations: book,
    })

    const first = await handler(ask({ question: QUESTION }))
    expect(first.status, 'the overruled decision did not produce a lesson').toBe(200)

    /* Both keys were read: the proposed one before the verdict, the decided one
       after it. Reading only the first is the mismatch this branch exists to
       prevent. */
    expect(book.asked, 'the proposed target was never read').toContain(INVENTED)
    expect(
      book.asked,
      'the history was never re-read under the target the veto substituted',
    ).toContain(QUESTION)
  })

  it('does not repeat a way in she has already had, after an override', async () => {
    const book = aBook()
    const handler = createHandler({
      model: namesSomethingElse(),
      search: noSearch,
      identitySecret: A_TEST_SECRET,
      explanations: book,
    })

    const first = await handler(ask({ question: QUESTION }))
    const second = await handler({ ...ask({ question: QUESTION }), cookie: cookieFrom(first) })

    expect(second.status).toBe(200)
    expect(
      routeOf(second),
      'the second telling took the route the first did, so the override lost her history',
    ).not.toBe(routeOf(first))
  })

  it('never puts a target the app supplied onto the shared shelf', async () => {
    /*
     * WHOSE WORDS THE KEY IS MADE OF.
     *
     * When the veto refuses an ungrounded target it substitutes the learner's
     * whole SENTENCE -- which is the same thing `fallbackDecision` produces
     * when the controller cannot be reached, and that case is already refused a
     * place on the shared shelf: "a fallback target is the learner's whole
     * sentence, and filing under it creates a key no second learner will ever
     * produce". Only one of the two paths was guarded.
     *
     * It became urgent when the phrasing memo made such a key answerable with
     * NO model call at all: file `Why does a chameleon change colour?` as a
     * SUBJECT and the next learner typing those words is served it without the
     * veto ever running again.
     *
     * SHE IS STILL TAUGHT. Only the two shared stores refuse it.
     */
    const shelf = writtenLessons(aStore(), RECIPE)
    const kept: string[] = []
    const handler = createHandler({
      model: namesSomethingElse(),
      search: noSearch,
      identitySecret: A_TEST_SECRET,
      explanations: aBook(),
      lessons: {
        findUnseen: (concept, spent) => shelf.findUnseen(concept, spent),
        keep: (concept, written) => {
          kept.push(concept)
          shelf.keep(concept, written)
        },
      },
    })

    const first = await handler(ask({ question: QUESTION }))
    expect(first.status, 'the overruled decision did not produce a lesson').toBe(200)
    expect(routeOf(first), 'she was not taught').toBeTruthy()
    expect(
      kept,
      'the learner\u2019s own sentence was filed as a subject every learner can reach',
    ).toEqual([])
  })
})
