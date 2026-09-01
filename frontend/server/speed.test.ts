/*
 * HOW LONG A LEARNER WAITS, AS A TEST RATHER THAN AS A HOPE.
 *
 * THE MEASUREMENT THAT MADE THIS FILE. A lesson already on the shelf is one
 * SQLite row and was measured served in 11ms. A lesson that has to be written
 * was measured at 6-10s on `gemini-2.5-flash-lite` and 15-30s on
 * `gemini-2.5-flash`, plus whatever a 429 adds. So the product's speed is not a
 * property of the model at all -- it is the share of asks that never reach one.
 *
 * AND THE SHELF WAS UNREACHABLE WITHOUT PAYING. It is keyed by the SUBJECT, and
 * only the controller could turn a typed sentence into one -- so every hit
 * still cost a full model round trip first. These tests hold the line that it
 * no longer does, and they are written as COUNTS of model calls rather than as
 * wall-clock assertions, because a count is the thing that actually causes the
 * seconds and does not go green or red with the speed of the machine.
 *
 * The one timing assertion here is about ORDER, not speed: two independent
 * network calls must overlap rather than queue. It uses tenths of a second and
 * a wide margin for exactly that reason.
 */

import { describe, expect, it } from 'vitest'

import { createHandler, type ModelPort, type SearchPort } from './handler.ts'
import { explanationsIn } from './memory/explanations.ts'
import { writtenLessons } from './memory/lessons.ts'
import { subjectAliases } from './memory/aliases.ts'
import { inMemoryStore as aStore } from './memory/inMemory.spec.ts'

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
  /* Two branches, because `validateLesson` refuses one: "only 1 branch
     offered. Give at least two, so what comes next is a choice". A double that
     is refused buys a repair turn and every call count here would be wrong. */
  next: [
    { id: 'deeper', label: 'Why a missing base case never stops' },
    { id: 'related', label: 'How recursion builds the answer back up' },
  ],
}

const A_TEST_SECRET = 'test-secret-not-used-anywhere-real'
const RECIPE = 'r1'
const QUESTION = 'wat is fotosynthesis'
const SUBJECT = 'photosynthesis'

/** A model that counts every call, and answers as the real pair of calls do. */
function counted(target: string, delayMs = 0): ModelPort & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    lesson: async () => {
      throw new Error('the whole-lesson path must not be taken for a fresh question')
    },
    chat: async (system: string) => {
      calls.push(system.includes('You are the controller') ? 'controller' : 'tutor')
      if (delayMs > 0) await new Promise((go) => setTimeout(go, delayMs))
      return system.includes('You are the controller')
        ? JSON.stringify({
            action: 'START_LESSON',
            target,
            reason: 'the double always names this',
            source_needed: false,
            subject_named: true,
          })
        : JSON.stringify(A_CONCEPT)
    },
  }
}

const noSearch: SearchPort = { search: async () => [] }
const ask = (body: Record<string, unknown>) => ({ method: 'POST', path: '/api/ask', body })
const cookieFrom = (res: { setCookie?: string }) => (res.setCookie ?? '').split(';')[0] ?? ''

/** One store, one shelf, one memo -- shared exactly as one server shares them. */
function aServer(
  model: ModelPort,
  search: SearchPort = noSearch,
  lessons?: ReturnType<typeof writtenLessons>,
) {
  const store = aStore()
  return createHandler({
    model,
    search,
    identitySecret: A_TEST_SECRET,
    explanations: explanationsIn(store),
    lessons: lessons ?? writtenLessons(store, RECIPE),
    aliases: subjectAliases(store, RECIPE),
  })
}

describe('a question that has been answered once is answered for nothing', () => {
  it('costs the second learner NO model call at all', async () => {
    /*
     * THE WHOLE POINT, AND THE NUMBER THAT MATTERS. The first learner pays two
     * calls -- one decision, one authoring. The second learner types the same
     * words and the count must not move: not one call, which is what a shelf
     * behind the controller cost, but none.
     */
    const model = counted(SUBJECT)
    const handler = aServer(model)

    const first = await handler(ask({ question: QUESTION }))
    expect(first.status, 'the first ask did not produce a lesson').toBe(200)
    expect(model.calls, 'the first ask should cost a decision and an authoring turn')
      .toEqual(['controller', 'tutor'])

    /* No cookie: a different learner entirely, which is the case a shared shelf
       exists for. */
    const second = await handler(ask({ question: QUESTION }))

    expect(second.status).toBe(200)
    expect(
      model.calls.length,
      'the second learner paid for a model call to be handed a lesson already written',
    ).toBe(2)
    expect((second.body as { route?: string }).route).toBe(
      (first.body as { route?: string }).route,
    )
  })

  it('matches a phrasing however it was capitalised or spaced', async () => {
    const model = counted(SUBJECT)
    const handler = aServer(model)

    await handler(ask({ question: QUESTION }))
    const again = await handler(ask({ question: '  WAT   is   Fotosynthesis ' }))

    expect(again.status).toBe(200)
    expect(model.calls.length, 'case and spacing started a second, empty memory').toBe(2)
  })

  it('still refuses to hand the same learner a way in she has already had', async () => {
    /*
     * THE RULE SPEED IS NOT ALLOWED TO BREAK. The shelf holds one route, and
     * she has had it -- so the fast path must MISS and the request must fall
     * through to the controller and be authored afresh. Cheapness that buys a
     * repeat is worth nothing.
     */
    const model = counted(SUBJECT)
    const handler = aServer(model)

    const first = await handler(ask({ question: QUESTION }))
    const second = await handler({ ...ask({ question: QUESTION }), cookie: cookieFrom(first) })

    expect(second.status).toBe(200)
    expect(
      (second.body as { route?: string }).route,
      'she was served the way in she had just been given, because it was quick',
    ).not.toBe((first.body as { route?: string }).route)
    expect(model.calls.length, 'a genuine miss must still reach the model').toBeGreaterThan(2)
  })

  it('never builds a memo for a message that named nothing', async () => {
    /*
     * THE VETO IS NOT BYPASSED. A greeting files no lesson, so it can never
     * acquire an alias, so the second `hi` reaches the controller exactly as
     * the first did. The fast path can only ever repeat a decision the model
     * has already made about a subject it named.
     */
    const model: ModelPort = {
      lesson: async () => {
        throw new Error('not used')
      },
      chat: async (system: string) =>
        system.includes('You are the controller')
          ? JSON.stringify({
              action: 'START_LESSON',
              target: 'hi',
              reason: 'they arrived',
              source_needed: false,
              subject_named: false,
            })
          : JSON.stringify(A_CONCEPT),
    }
    const seen: string[] = []
    const handler = aServer({
      ...model,
      chat: async (system: string, user: string) => {
        seen.push(system.includes('You are the controller') ? 'controller' : 'tutor')
        return model.chat!(system, user)
      },
    })

    const first = await handler(ask({ question: 'hi' }))
    expect((first.body as { clarify?: boolean }).clarify, 'a greeting was taught').toBe(true)

    const second = await handler(ask({ question: 'hi' }))
    expect((second.body as { clarify?: boolean }).clarify).toBe(true)
    expect(seen, 'a greeting acquired an alias and skipped the veto').toEqual([
      'controller',
      'controller',
    ])
  })
})

describe('two independent calls overlap instead of queueing', () => {
  it('enters the search before the decision has come back', async () => {
    /*
     * The search is grounding for the AUTHORING call and is keyed by what the
     * learner typed, so it never depended on the decision -- but it was awaited
     * after it, and a learner waited for the sum of two network calls instead
     * of the longer one.
     *
     * ASSERTED AS ORDER, NOT AS A CLOCK. The first version of this test gave a
     * 240ms workload a 330ms ceiling, which a loaded machine can miss for
     * reasons that have nothing to do with overlap -- and the suite it runs in
     * holds a socket open for twenty seconds elsewhere. What actually has to be
     * true is that the search is ENTERED before the decision RETURNS, and that
     * is a fact about sequence that no scheduler can flake.
     */
    const order: string[] = []
    const model: ModelPort = {
      lesson: async () => {
        throw new Error('not used')
      },
      chat: async (system: string) => {
        const controller = system.includes('You are the controller')
        order.push(controller ? 'decision in' : 'authoring in')
        /* One turn of the event loop, so anything already started can run. */
        await new Promise((go) => setTimeout(go, 20))
        order.push(controller ? 'decision out' : 'authoring out')
        return controller
          ? JSON.stringify({
              action: 'START_LESSON',
              target: SUBJECT,
              reason: 'the double always names this',
              source_needed: false,
              subject_named: true,
            })
          : JSON.stringify(A_CONCEPT)
      },
    }
    const search: SearchPort = {
      search: async () => {
        order.push('search in')
        return [{ url: 'https://example.org/photosynthesis', content: 'Plants use light.' }]
      },
    }

    expect((await aServer(model, search)(ask({ question: QUESTION }))).status).toBe(200)

    expect(
      order.indexOf('search in'),
      `the search was queued behind the decision: ${order.join(' -> ')}`,
    ).toBeLessThan(order.indexOf('decision out'))
  })

  it('does not look anything up for a message that names nothing', async () => {
    /*
     * The overlap is bought by starting early, and started unconditionally it
     * spent one web search on every greeting -- a lookup for the word "hi"
     * whose result is discarded the moment the veto asks the learner back.
     */
    let looked = 0
    const model: ModelPort = {
      lesson: async () => {
        throw new Error('not used')
      },
      chat: async () =>
        JSON.stringify({
          action: 'START_LESSON',
          target: 'hi',
          reason: 'they arrived',
          source_needed: false,
          subject_named: false,
        }),
    }
    const counting: SearchPort = {
      search: async () => {
        looked += 1
        return []
      },
    }

    const res = await aServer(model, counting)(ask({ question: 'hi' }))
    expect((res.body as { clarify?: boolean }).clarify, 'a greeting was taught').toBe(true)
    expect(looked, 'a greeting bought a web search').toBe(0)
  })
})

describe('a decision does not reserve a lesson’s budget', () => {
  it('asks for far less on the controller call than on the authoring one', async () => {
    /*
     * `max_tokens` IS A RESERVATION, NOT A MEASUREMENT -- a vendor deducts it
     * from the per-minute allowance whatever the reply actually costs. One
     * `chat` served both calls, so a sixty-token decision reserved a whole
     * lesson's worth of an 8,000-per-minute budget and the 429s arrived four
     * times sooner than they had to. Each of those 429s is a retry pause a
     * learner sits through, which is why a token count belongs in a file about
     * speed.
     */
    const budgets: { call: string; budget: number | undefined }[] = []
    const handler = aServer({
      lesson: async () => {
        throw new Error('not used')
      },
      chat: async (system: string, _user: string, _prior?: string, budget?: number) => {
        const call = system.includes('You are the controller') ? 'controller' : 'tutor'
        budgets.push({ call, budget })
        return call === 'controller'
          ? JSON.stringify({
              action: 'START_LESSON',
              target: SUBJECT,
              reason: 'the double always names this',
              source_needed: false,
              subject_named: true,
            })
          : JSON.stringify(A_CONCEPT)
      },
    })

    expect((await handler(ask({ question: QUESTION }))).status).toBe(200)

    const decision = budgets.find((one) => one.call === 'controller')
    expect(decision, 'the controller was never asked').toBeDefined()
    expect(
      decision?.budget,
      'the decision still reserves whatever the authoring call reserves',
    ).toBeLessThan(1000)

    /* The authoring call says nothing and gets the concept default, which is
       the behaviour it has always had. */
    expect(budgets.find((one) => one.call === 'tutor')?.budget).toBeUndefined()
  })
})

describe('the retry that doubles the wait asks about the same subject', () => {
  it('names the decided target on the second attempt, not the raw message', async () => {
    /*
     * THE NOVELTY RETRY IS THE MOST EXPENSIVE THING THE SERVER DOES: a second
     * full authoring call, in series with the first, on the request that was
     * already the slowest -- measured at 6-10s each, so 12-20s for the learner.
     *
     * It passed `question`, the raw message, while the call it is retrying
     * passed `decision.target`. So the one call whose entire job is to produce
     * something BETTER was the only one asked about a different thing. It is
     * the same defect this repository already recorded and fixed on the first
     * call -- "the entire controller was decorative for the target" -- left
     * standing on the second.
     */
    const asked: string[] = []
    /* The same lesson text twice, which is exactly what makes `noveltyAgainst`
       call it a repeat and spend the retry. */
    const model: ModelPort = {
      lesson: async () => {
        throw new Error('not used')
      },
      chat: async (system: string, user: string) => {
        if (system.includes('You are the controller')) {
          return JSON.stringify({
            action: 'START_LESSON',
            target: SUBJECT,
            reason: 'the double always names this',
            source_needed: false,
            subject_named: true,
          })
        }
        asked.push(user)
        return JSON.stringify(A_CONCEPT)
      },
    }
    const handler = aServer(model)

    const first = await handler(ask({ question: QUESTION }))
    const second = await handler({ ...ask({ question: QUESTION }), cookie: cookieFrom(first) })
    expect(second.status).toBe(200)

    /* The last authoring prompt is the retry's. It must be about the SUBJECT
       the controller decided, never the sentence the learner typed. */
    const retry = asked[asked.length - 1] ?? ''
    expect(retry, 'the retry asked about something else').toContain(SUBJECT)
    expect(
      retry.includes(QUESTION),
      `the retry was handed the raw message instead of the subject: ${retry.slice(0, 120)}`,
    ).toBe(false)
  })
})

describe('a veto that corrects the ACTION does not cost the shelf', () => {
  it('files a bare subject the model named, even when the action was overruled', async () => {
    /*
     * THE DEFECT THIS CATCHES, and it silently switched the caching off for the
     * commonest phrasing there is. `appSupplied` asked "was the decision
     * refused, and does the target equal the message?" -- true whenever
     * `permitted` corrected the ACTION and left the target alone.
     *
     * A learner types `photosynthesis`. The model answers EXPLAIN with target
     * `photosynthesis`; `permitted` rewrites the action to START_LESSON because
     * nothing has been explained yet, and never touches the target -- the model
     * named that subject itself. Under the old test the lesson was refused the
     * shared shelf and the memo, so every learner typing a bare subject that
     * tripped any action rule paid full price for ever.
     *
     * Every other test of this gate uses the GROUNDING override, where the veto
     * really does substitute, and both formulations agree there -- which is why
     * the suite stayed green.
     */
    const shelf = writtenLessons(aStore(), RECIPE)
    const kept: string[] = []
    const watching = {
      findUnseen: (concept: string, spent: readonly string[]) => shelf.findUnseen(concept, spent),
      keep: (concept: string, written: Parameters<typeof shelf.keep>[1]) => {
        kept.push(concept)
        shelf.keep(concept, written)
      },
    }
    const handler = aServer({
      lesson: async () => {
        throw new Error('not used')
      },
      chat: async (system: string) =>
        system.includes('You are the controller')
          ? JSON.stringify({
              /* EXPLAIN with nothing explained yet: `permitted` must correct
                 the action, and must not touch the target. */
              action: 'EXPLAIN',
              target: SUBJECT,
              reason: 'they sound stuck',
              source_needed: false,
              subject_named: true,
            })
          : JSON.stringify(A_CONCEPT),
    }, noSearch, watching)

    const res = await handler(ask({ question: SUBJECT }))
    expect(res.status).toBe(200)
    expect((res.body as { route?: string }).route, 'she was not taught').toBeTruthy()
    expect(
      kept,
      'a subject the model named itself was refused the shared shelf',
    ).toEqual([SUBJECT])
  })
})
