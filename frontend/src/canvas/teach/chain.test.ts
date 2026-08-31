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

/**
 * A rung that declines.
 *
 * `reason` DEFAULTS to `"<name> has nothing"` because most proofs here need to
 * tell one refusal from another, and the rung's name is the cheapest way. It is
 * overridable because that default is unlike production: a real resolver writes
 * a sentence for a LEARNER, which never contains the rung's internal name. A
 * proof about what she reads must not be measuring this fixture's shorthand.
 */
function refuser(
  name: string,
  nearest: readonly string[] = [],
  reason = `${name} has nothing`,
): AnyResolver {
  return {
    name,
    resolve: (): Resolution => ({ kind: 'refusal', reason, nearest }),
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

  it('records every resolver that was asked — for the operator, not in her sentence', async () => {
    /* THIS TEST'S MECHANISM CHANGED. ITS INTENT DID NOT. SAID OUT LOUD.
     *
     * It used to require the refusal SENTENCE to contain "lesson" and "web" —
     * the internal names of the rungs. `chain.ts` removed them and records why,
     * measured in a browser: a learner who asked about baking a cake read
     * "...I asked: lesson, engine, web." Three words that mean nothing to her,
     * and one of them a lie, because the web rung DECLINED rather than searched.
     *
     * The intent — "the learner is not told a half-truth" — is exactly right and
     * is kept. What changed is WHERE the names live. Which parts were asked is a
     * fact about US and belongs in `tried`, where an operator can read it. What
     * she reads is a fact about HER QUESTION.
     *
     * This is the one licence this repository grants for changing a passing
     * expectation, and it is being used deliberately rather than quietly: the
     * assertion below is STRONGER, because it pins both halves — every rung is
     * still accounted for, AND none of their names is shown to her. The old
     * version could not have caught a regression that started printing them
     * again, since that was what it demanded. */
    /* LEARNER-FACING REASONS, as real resolvers write. The default fixture
     * reason embeds the rung's name, which would make the assertion below
     * measure this file's shorthand instead of the product. */
    const result = await askChain(DOUBT, LESSON, [
      refuser('lesson', [], 'I could not find an answer to that in what you are reading.'),
      refuser('web', [], 'I did not find anything usable when I went looking.'),
    ])
    if (result.resolution.kind !== 'refusal') throw new Error('expected a refusal')

    /* Every rung is accounted for, in the machine-readable record. */
    expect(result.tried.map((t) => t.name)).toEqual(['lesson', 'web'])

    /* And not one of those names is in what she reads. */
    for (const internalName of ['lesson', 'web', 'engine', 'model', 'resolver']) {
      expect(
        result.resolution.reason.toLowerCase(),
        `the learner was shown the internal name "${internalName}"`,
      ).not.toContain(internalName)
    }

    /* She is still told something she can act on. */
    expect(result.resolution.reason.length).toBeGreaterThan(20)
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
