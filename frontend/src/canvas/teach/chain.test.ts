import { describe, expect, it, vi } from 'vitest'

import { askChain } from './chain'
import type { AnyResolver, Doubt, Resolution } from './contract'
import type { Lesson } from '../spec/spec'
import { validateLesson } from '../spec/validate'

/**
 * The chain: what happens after the first resolver says no.
 *
 * WHY THIS FILE IS THE CENTRE OF THE FEATURE
 * ------------------------------------------
 * `lessonResolver` refusing is correct and always was. What was missing is that
 * a refusal was TERMINAL: the learner admitted confusion, got told this page
 * does not answer it, and nothing caught them. The engine had a catch
 * (`session/doubt.py`), the retrieval layer had a catch (`websearch/`), and
 * neither could ever be reached because `resolve()` is synchronous and both are
 * async. The chain is the doorway that makes a refusal a HANDOFF.
 *
 * WHAT MUST NOT CHANGE, AND IS TESTED HERE
 * ----------------------------------------
 * Connecting more answerers must not weaken the one property the feature is
 * built on: it never invents. So the hardest tests here are the ones asserting
 * that a chain which cannot answer still REFUSES, that a broken remote resolver
 * cannot take down the offline one, and that the answer always says where it
 * came from.
 */

const LESSON: Lesson = (() => {
  /* `'off'`. What this file tests is which resolver answers and whether the
     chain falls through -- not whether the fixture teaches. */
  const result = validateLesson({
    id: 'chain-fixture',
    question: 'Why does heating a gas raise its pressure?',
    blocks: [
      {
        id: 'intro',
        kind: 'prose',
        title: 'Particle speed',
        body: 'Heating a gas makes its particles move faster.',
        emphasis: 'primary',
        tone: 'neutral',
      },
    ],
    relations: [],
  /* `'off'`. This fixture is the lesson a doubt is asked ABOUT. What the
     file tests is which resolver answers, what it cites and how it falls
     through -- never whether this stub teaches. Structure is still fully
     checked, so a malformed fixture still fails here. */
  }, { teaching: 'off' })
  if (!result.ok) throw new Error('fixture lesson is invalid: ' + JSON.stringify(result.issues))
  return result.lesson
})()

const DOUBT: Doubt = { text: 'what is a transformation graph', atBeatId: 'beat-0' }

function answerer(name: string): AnyResolver {
  return {
    name,
    resolve: (): Resolution => ({
      kind: 'answer',
      lesson: LESSON,
      drawnFrom: ['intro'],
    }),
  }
}

function refuser(name: string, nearest: readonly string[] = []): AnyResolver {
  return {
    name,
    resolve: (): Resolution => ({ kind: 'refusal', reason: `${name} has nothing`, nearest }),
  }
}

function asyncAnswerer(name: string, delayMs = 0): AnyResolver {
  return {
    name,
    async resolve(): Promise<Resolution> {
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
      return { kind: 'answer', lesson: LESSON, drawnFrom: [] }
    },
  }
}

function thrower(name: string): AnyResolver {
  return {
    name,
    resolve: (): Resolution => {
      throw new Error(`${name} exploded`)
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Order and short-circuit                                                    */
/* -------------------------------------------------------------------------- */

describe('the chain tries resolvers in order and stops at the first answer', () => {
  it('returns the first answer and never calls what comes after it', async () => {
    const later = vi.fn(() => ({ kind: 'refusal' as const, reason: 'x', nearest: [] }))
    const result = await askChain(DOUBT, LESSON, [
      answerer('lesson'),
      { name: 'web', resolve: later },
    ])

    expect(result.resolution.kind).toBe('answer')
    expect(later).not.toHaveBeenCalled()
  })

  it('a refusal falls through to the next resolver', async () => {
    const result = await askChain(DOUBT, LESSON, [refuser('lesson'), answerer('web')])
    expect(result.resolution.kind).toBe('answer')
  })

  it('records every resolver it tried, in order', async () => {
    const result = await askChain(DOUBT, LESSON, [
      refuser('lesson'),
      refuser('web'),
      answerer('engine'),
    ])
    expect(result.tried.map((t) => t.name)).toEqual(['lesson', 'web', 'engine'])
  })

  it('does not record resolvers it never reached', async () => {
    const result = await askChain(DOUBT, LESSON, [answerer('lesson'), refuser('web')])
    expect(result.tried.map((t) => t.name)).toEqual(['lesson'])
  })
})

/* -------------------------------------------------------------------------- */
/* It still refuses. That is the point.                                       */
/* -------------------------------------------------------------------------- */

describe('a chain that cannot answer refuses rather than inventing', () => {
  it('all refuse -> the chain refuses', async () => {
    const result = await askChain(DOUBT, LESSON, [refuser('a'), refuser('b'), refuser('c')])
    expect(result.resolution.kind).toBe('refusal')
  })

  it('an empty chain refuses rather than crashing', async () => {
    const result = await askChain(DOUBT, LESSON, [])
    expect(result.resolution.kind).toBe('refusal')
  })

  it('the final refusal keeps the FIRST resolver’s "did you mean" list', async () => {
    /* The lesson resolver is the only one that can point at blocks of the
       lesson the learner is looking at. A later refusal has no such list, and
       overwriting the useful one with an empty one loses the only concrete help
       available. */
    const result = await askChain(DOUBT, LESSON, [
      refuser('lesson', ['intro']),
      refuser('web', []),
    ])
    if (result.resolution.kind !== 'refusal') throw new Error('expected a refusal')
    expect(result.resolution.nearest).toEqual(['intro'])
  })

  it('names every resolver that was asked, so the learner is not told a half-truth', async () => {
    const result = await askChain(DOUBT, LESSON, [refuser('lesson'), refuser('web')])
    if (result.resolution.kind !== 'refusal') throw new Error('expected a refusal')
    expect(result.resolution.reason).toContain('lesson')
    expect(result.resolution.reason).toContain('web')
  })
})

/* -------------------------------------------------------------------------- */
/* A broken remote must not break the offline answer                          */
/* -------------------------------------------------------------------------- */

describe('one resolver failing does not take down the chain', () => {
  it('a resolver that throws is recorded and the chain carries on', async () => {
    const result = await askChain(DOUBT, LESSON, [thrower('web'), answerer('lesson')])
    expect(result.resolution.kind).toBe('answer')
    expect(result.tried.map((t) => t.name)).toEqual(['web', 'lesson'])
  })

  it('the failure is reported as a failure, not as "nothing found"', async () => {
    /* THE DISTINCTION THAT MATTERS. "The web is down" and "the web has no answer
       to this" both produce no answer and mean opposite things. Collapsing them
       tells a learner their question is unanswerable when the truth is that a
       server is offline. */
    const result = await askChain(DOUBT, LESSON, [thrower('web'), refuser('lesson')])
    const web = result.tried.find((t) => t.name === 'web')
    expect(web?.outcome).toBe('failed')
    expect(web?.error).toContain('exploded')

    const lesson = result.tried.find((t) => t.name === 'lesson')
    expect(lesson?.outcome).toBe('refused')
  })

  it('every resolver throwing still refuses rather than throwing at the caller', async () => {
    const result = await askChain(DOUBT, LESSON, [thrower('a'), thrower('b')])
    expect(result.resolution.kind).toBe('refusal')
  })

  it('a refusal caused only by failures says so, and does not blame the question', async () => {
    const result = await askChain(DOUBT, LESSON, [thrower('web')])
    if (result.resolution.kind !== 'refusal') throw new Error('expected a refusal')
    expect(result.resolution.reason.toLowerCase()).toContain('could not be reached')
  })
})

/* -------------------------------------------------------------------------- */
/* Sync and async through one doorway                                         */
/* -------------------------------------------------------------------------- */

describe('sync and async resolvers pass through the same doorway', () => {
  it('an async resolver can answer', async () => {
    const result = await askChain(DOUBT, LESSON, [refuser('lesson'), asyncAnswerer('web')])
    expect(result.resolution.kind).toBe('answer')
  })

  it('sync and async can be mixed in any order', async () => {
    const result = await askChain(DOUBT, LESSON, [asyncAnswerer('web', 1), answerer('lesson')])
    expect(result.resolution.kind).toBe('answer')
    expect(result.tried.map((t) => t.name)).toEqual(['web'])
  })
})

/* -------------------------------------------------------------------------- */
/* The learner is told what is happening while they wait                      */
/* -------------------------------------------------------------------------- */

describe('a slow resolver announces itself before it runs', () => {
  it('calls onTry with each resolver name BEFORE asking it', async () => {
    const seen: string[] = []
    await askChain(DOUBT, LESSON, [refuser('lesson'), answerer('web')], {
      onTry: (name) => seen.push(name),
    })
    expect(seen).toEqual(['lesson', 'web'])
  })

  it('onTry throwing does not break the chain', async () => {
    /* A UI callback is not allowed to decide whether a learner gets an answer. */
    const result = await askChain(DOUBT, LESSON, [answerer('lesson')], {
      onTry: () => {
        throw new Error('render blew up')
      },
    })
    expect(result.resolution.kind).toBe('answer')
  })

  it('an onTry failure is RECORDED, not swallowed', async () => {
    /* Carrying on is right; carrying on silently is not. If the pending state
       failed to render, the learner sat looking at a frozen page while work
       happened, and that is a real defect. Continuing without keeping the
       evidence means nobody ever finds out. */
    const result = await askChain(DOUBT, LESSON, [answerer('lesson')], {
      onTry: () => {
        throw new Error('render blew up')
      },
    })
    expect(result.hookErrors).toHaveLength(1)
    expect(result.hookErrors[0]).toContain('render blew up')
    expect(result.hookErrors[0]).toContain('lesson')
  })

  it('no hook errors when nothing threw', async () => {
    const result = await askChain(DOUBT, LESSON, [answerer('lesson')], { onTry: () => {} })
    expect(result.hookErrors).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */
/* Provenance: every answer says where it came from                           */
/* -------------------------------------------------------------------------- */

describe('an answer carries which resolver produced it', () => {
  it('stamps the answering resolver onto the result', async () => {
    const result = await askChain(DOUBT, LESSON, [refuser('lesson'), answerer('web')])
    expect(result.answeredBy).toBe('web')
  })

  it('answeredBy is null when nothing answered', async () => {
    const result = await askChain(DOUBT, LESSON, [refuser('lesson')])
    expect(result.answeredBy).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* Cancellation: leaving the lesson stops the work                            */
/* -------------------------------------------------------------------------- */

describe('an aborted chain stops asking', () => {
  it('does not call a resolver after the signal aborts', async () => {
    const controller = new AbortController()
    const second = vi.fn(() => ({ kind: 'refusal' as const, reason: 'x', nearest: [] }))

    const first: AnyResolver = {
      name: 'slow',
      async resolve(): Promise<Resolution> {
        controller.abort()
        return { kind: 'refusal', reason: 'no', nearest: [] }
      },
    }

    await askChain(DOUBT, LESSON, [first, { name: 'second', resolve: second }], {
      signal: controller.signal,
    })
    expect(second).not.toHaveBeenCalled()
  })

  it('an already-aborted signal asks nobody', async () => {
    const controller = new AbortController()
    controller.abort()
    const never = vi.fn(() => ({ kind: 'refusal' as const, reason: 'x', nearest: [] }))

    const result = await askChain(DOUBT, LESSON, [{ name: 'a', resolve: never }], {
      signal: controller.signal,
    })
    expect(never).not.toHaveBeenCalled()
    expect(result.resolution.kind).toBe('refusal')
  })
})

/* -------------------------------------------------------------------------- */
/* A rung that never answers                                                  */
/* -------------------------------------------------------------------------- */

/*
 * A HANG IS THE ONE ERROR THAT NEVER REPORTS ITSELF.
 *
 * `TeachView` has a `.catch`, so a rung that REJECTS is handled and the learner
 * is told. A rung that simply never settles is not a rejection: the promise
 * stays pending, `pending` stays true, and the screen says "Working on it…"
 * until the tab is closed.
 *
 * Nothing here could stop that. `answering.ts` calls `askChain` with no options
 * at all -- no signal, no deadline -- and the model escalation behind it is
 * unbounded. The only timeout in the system lives inside `engineResolver` and
 * covers exactly one rung of three.
 *
 * Waldo et al., `a-note-on-distributed-computing.pdf`: a remote call fails in
 * ways a local call cannot, and you cannot paper over the difference. The
 * standard from `non_blocking_algorithms/README.md` is wait-free -- guaranteed
 * progress in bounded steps. A bound that only logs is not progress; it has to
 * change what the person sees.
 */
function hanger(name: string): AnyResolver {
  return {
    name,
    resolve: (): Promise<Resolution> => new Promise<Resolution>(() => {}),
  }
}

/*
 * WHY THESE RACE INSTEAD OF AWAITING DIRECTLY.
 *
 * `await askChain(...)` against a hanging rung never reaches its assertion --
 * the test dies on the runner's own timeout, which is a WEAK red. It proves the
 * test did not finish, not that the code is wrong, and it would report exactly
 * the same way if the assertion below were nonsense.
 *
 * Racing against a sentinel makes the promise settle either way, so the failure
 * is an assertion naming what happened.
 */
const NEVER_RETURNED = Symbol('the chain never returned')

async function withinTest<T>(work: Promise<T>, ms = 1_000): Promise<T | typeof NEVER_RETURNED> {
  return Promise.race([
    work,
    new Promise<typeof NEVER_RETURNED>((resolve) => setTimeout(() => resolve(NEVER_RETURNED), ms)),
  ])
}

describe('a rung that never answers does not hold the learner forever', () => {
  it('gives up on a rung that never answers, and says so', async () => {
    const outcome = await withinTest(askChain(DOUBT, LESSON, [hanger('hangs')], { budgetMs: 50 }))

    expect(outcome, 'the chain waited on a rung with no deadline').not.toBe(NEVER_RETURNED)
    if (outcome === NEVER_RETURNED) return

    expect(outcome.resolution.kind).toBe('refusal')
    /* `failed`, never `refused`. The chain already separates "the web is down"
       from "the web has no answer", and a timeout belongs on the first side --
       a rung that never spoke did not decline. */
    expect(outcome.tried).toEqual([
      { name: 'hangs', outcome: 'failed', error: expect.stringContaining('timed out') },
    ])
  })

  it('still lets a rung that answers in time answer', async () => {
    /*
     * THE PAIR, and it is load-bearing. Without it `budgetMs: 0` satisfies the
     * case above and the chain can never answer at all -- a cure strictly worse
     * than the hang, because a learner who waits forever at least still has a
     * question outstanding.
     */
    const result = await askChain(DOUBT, LESSON, [asyncAnswerer('quick', 5)], { budgetMs: 1_000 })
    expect(result.resolution.kind).toBe('answer')
    expect(result.answeredBy).toBe('quick')
  })

  it('falls through to the next rung when the first one hangs', async () => {
    /* The whole point of a chain. A rung that hangs must cost its budget and
       nothing else -- the offline answer is the one a learner can always be
       given, and a frozen remote must not be able to prevent it. */
    const outcome = await withinTest(
      askChain(DOUBT, LESSON, [hanger('hangs'), answerer('offline')], { budgetMs: 50 }),
    )
    expect(outcome, 'a hanging rung blocked the one behind it').not.toBe(NEVER_RETURNED)
    if (outcome === NEVER_RETURNED) return
    expect(outcome.answeredBy).toBe('offline')
  })

  it('leaves the chain unbounded when no budget is given', async () => {
    /*
     * The other pair: `budgetMs` is opt-in, so every existing caller keeps its
     * present behaviour and this change cannot alter a passing test by
     * accident. A resolver that answers immediately must still answer.
     */
    const result = await askChain(DOUBT, LESSON, [answerer('immediate')])
    expect(result.answeredBy).toBe('immediate')
  })
})

/* -------------------------------------------------------------------------- */
/* What a rung PROMISES when it answers                                       */
/* -------------------------------------------------------------------------- */

/*
 * THE POSTCONDITION THE CHAIN NEVER CHECKED.
 *
 * `contract.ts` says of `DoubtAnswer.lesson`: "Already validated. Renderers can
 * trust every field." That is a promise every rung makes and nothing enforced.
 * The loop checked `resolution.kind === 'answer'` and returned it -- so a rung
 * that answered with a lesson it had not filled in handed a broken document
 * straight to the renderer, three layers from the rung that produced it.
 *
 * Hoare's argument is that a component has a precondition and a postcondition
 * and that they compose. This codebase already does it well twice --
 * `validateLesson` and `checkFrame` are real postconditions -- and the idea
 * simply stopped before `chain.ts`.
 *
 * A VIOLATION IS `failed`, NEVER `refused`, and the distinction is load-bearing.
 * `refusalFrom` writes a different sentence to the learner for each: `refused`
 * means the rungs had nothing to say, `failed` means one of them broke. A rung
 * that returned a malformed answer did not decline the question -- recording it
 * as `refused` would tell a learner their question was the problem when the
 * truth is that a rung is broken.
 */
describe('a rung that answers must answer with a lesson', () => {
  /** A rung that claims an answer while handing back a document with no
   *  blocks. Cast because the type forbids it -- which is the point: the type
   *  cannot stop a rung that lies at runtime, and a remote one can. */
  function liar(name: string): AnyResolver {
    return {
      name,
      resolve: (): Resolution =>
        ({ kind: 'answer', lesson: { ...LESSON, blocks: [] }, drawnFrom: [] }) as Resolution,
    }
  }

  it('does not hand a lesson with no blocks to the renderer', async () => {
    const result = await askChain(DOUBT, LESSON, [liar('broken')])
    expect(
      result.resolution.kind,
      'a rung answered with an empty lesson and the chain passed it on',
    ).toBe('refusal')
  })

  it('records the breach as failed, not refused', async () => {
    /*
     * The half that decides what the learner is told. `refused` would say the
     * question had no answer; `failed` says a rung broke. Only one of those is
     * true here.
     */
    const result = await askChain(DOUBT, LESSON, [liar('broken')])
    expect(result.tried).toEqual([
      { name: 'broken', outcome: 'failed', error: expect.stringContaining('blocks') },
    ])
  })

  it('falls through to a rung that can actually answer', async () => {
    /* A broken rung must cost its own turn and nothing else -- the offline
       answer is the one a learner can always be given. */
    const result = await askChain(DOUBT, LESSON, [liar('broken'), answerer('offline')])
    expect(result.answeredBy).toBe('offline')
  })

  it('still lets a well-formed answer through untouched', async () => {
    /*
     * THE PAIR, and it matters more here than anywhere else in this file. A
     * postcondition that refuses everything stops the product dead while
     * looking like a passing suite: every test above would still be green.
     */
    const result = await askChain(DOUBT, LESSON, [answerer('good')])
    expect(result.resolution.kind).toBe('answer')
    expect(result.answeredBy).toBe('good')
    expect(result.tried).toEqual([{ name: 'good', outcome: 'answered' }])
  })

  it('refuses an answer whose blocks share an id', async () => {
    /*
     * The second postcondition, tested because an untested check is decoration.
     * React keys on block ids: a duplicate makes one paragraph vanish, and
     * nothing anywhere reports that a learner lost a piece of their answer.
     */
    const twinned: AnyResolver = {
      name: 'twins',
      resolve: (): Resolution => {
        const first = LESSON.blocks[0]
        if (first === undefined) throw new Error('fixture has no blocks')
        return { kind: 'answer', lesson: { ...LESSON, blocks: [first, first] }, drawnFrom: [] }
      },
    }
    const result = await askChain(DOUBT, LESSON, [twinned])
    expect(result.resolution.kind).toBe('refusal')
    expect(JSON.stringify(result.tried)).toContain('block ids')
  })

  it('refuses an answer that cites a block the lesson does not have', async () => {
    /*
     * The third. `drawnFrom` is what lets the interface point back at what an
     * answer drew on -- an id outside the original lesson points at nothing,
     * which is a citation to a source that does not exist.
     */
    const miscited: AnyResolver = {
      name: 'miscites',
      resolve: (): Resolution => ({
        kind: 'answer',
        lesson: LESSON,
        drawnFrom: ['no-such-block'],
      }),
    }
    const result = await askChain(DOUBT, LESSON, [miscited])
    expect(result.resolution.kind).toBe('refusal')
    expect(JSON.stringify(result.tried)).toContain('no-such-block')
  })

  it('accepts an answer that cites a block the lesson really has', async () => {
    /* The pair for the citation check: a real citation must pass, or the
       feature that points back at the lesson stops working entirely. */
    const firstId = LESSON.blocks[0]?.id
    expect(firstId, 'fixture has no blocks').toBeDefined()
    const cited: AnyResolver = {
      name: 'cites-properly',
      resolve: (): Resolution => ({
        kind: 'answer',
        lesson: LESSON,
        drawnFrom: firstId === undefined ? [] : [firstId],
      }),
    }
    const result = await askChain(DOUBT, LESSON, [cited])
    expect(result.answeredBy).toBe('cites-properly')
  })

  it('leaves a refusal a refusal, not a breach', async () => {
    /* The other pair. A rung with nothing to say has broken no promise, and
       recording it as `failed` would make "the web has no answer" read as "the
       web is down" -- the exact confusion this file already guards. */
    const result = await askChain(DOUBT, LESSON, [refuser('empty-handed')])
    expect(result.tried).toEqual([{ name: 'empty-handed', outcome: 'refused' }])
  })
})
