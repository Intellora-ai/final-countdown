import { describe, expect, it, vi } from 'vitest'

import { engineResolver } from './engineResolver'
import type { Doubt } from './contract'
import type { Lesson } from '../spec/spec'
import { validateLesson } from '../spec/validate'

/**
 * The rung that reaches the engine.
 *
 * WHAT MAKES THIS ONE DIFFERENT FROM THE WEB RUNG
 * -----------------------------------------------
 * The web rung quotes strangers. This one asks the system that already knows
 * the syllabus, the learner's history, and what has already failed on them. It
 * is the only rung that can produce a NEW explanation rather than find an
 * existing one — and therefore the only one where a model is involved at all.
 *
 * That is also why it sits between the lesson and the web rather than last: an
 * explanation written for this learner, inside the contract the validator
 * enforces, beats a correct paragraph written for nobody.
 *
 * WHAT IT MUST NOT DO
 * -------------------
 * Turn the engine's refusal into an answer. `UNMAPPABLE` is the engine saying
 * "I would rather not guess", and it is a first-class outcome that the whole
 * design exists to protect. This rung passes it on as a refusal so the chain
 * can try the next source — it never dresses it up as content.
 *
 * Every test injects `fetch`. Nothing here touches a network.
 */

const LESSON: Lesson = (() => {
  const result = validateLesson({
    id: 'engine-fixture',
    question: 'Why does a recursive function need a base case?',
    blocks: [
      {
        id: 'intro',
        kind: 'prose',
        title: 'Base case',
        body: 'A base case is the branch that returns without recursing.',
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
  if (!result.ok) throw new Error('fixture invalid')
  return result.lesson
})()

const DOUBT: Doubt = { text: 'what is a base case', atBeatId: 'beat-3' }

const ANSWER_LESSON = {
  id: 'python-recursion-identify-base-case',
  question: 'what is a base case',
  blocks: [
    {
      id: 'prose-0',
      kind: 'prose',
      emphasis: 'primary',
      body: 'A base case is the branch that stops the recursion.',
    },
  ],
  relations: [],
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) } as Response
}

function resolverFor(body: unknown, ok = true, status = 200) {
  return engineResolver({ fetchImpl: (async () => jsonResponse(body, ok, status)) as typeof fetch })
}

/* -------------------------------------------------------------------------- */
/* It answers                                                                 */
/* -------------------------------------------------------------------------- */

describe('an answer from the engine reaches the learner', () => {
  it('renders the lesson the engine emitted', async () => {
    const r = await resolverFor({
      outcome: 'answered',
      resume_at: 'beat-3',
      provider: 'fake',
      lesson: ANSWER_LESSON,
    }).resolve(DOUBT, LESSON)

    if (r.kind !== 'answer') throw new Error('expected an answer')
    expect(JSON.stringify(r.lesson)).toContain('stops the recursion')
  })

  it('the answer passes the same validator as an authored lesson', async () => {
    /* The engine and the canvas agree on `LessonInput` only because both sides
       run the same check. A payload trusted on arrival would surface as a
       broken frame in a browser instead of a refusal here. */
    const r = await resolverFor({
      outcome: 'answered',
      resume_at: 'beat-3',
      lesson: ANSWER_LESSON,
    }).resolve(DOUBT, LESSON)

    if (r.kind !== 'answer') throw new Error('expected an answer')
    /* `'answer'`, matching `engineResolver.ts` itself. */
    expect(validateLesson(r.lesson, { teaching: 'answer' }).ok).toBe(true)
  })

  it('a payload the canvas refuses becomes a refusal, not a broken frame', async () => {
    const r = await resolverFor({
      outcome: 'answered',
      resume_at: 'beat-3',
      lesson: { id: 'x', question: 'q', blocks: [{ kind: 'nonsense' }], relations: [] },
    }).resolve(DOUBT, LESSON)
    expect(r.kind).toBe('refusal')
  })

  it('drawnFrom is empty, because the engine drew on nothing in this lesson', async () => {
    const r = await resolverFor({
      outcome: 'answered',
      resume_at: 'beat-3',
      lesson: ANSWER_LESSON,
    }).resolve(DOUBT, LESSON)
    if (r.kind !== 'answer') throw new Error('expected an answer')
    expect(r.drawnFrom).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */
/* A refusal is passed on as a refusal                                        */
/* -------------------------------------------------------------------------- */

describe('the engine declining is carried through honestly', () => {
  it('unmappable becomes a refusal carrying the engine’s own wording', async () => {
    const r = await resolverFor({
      outcome: 'unmappable',
      resume_at: 'beat-3',
      refusal: 'That is not something this lesson covers, so I would rather not guess at it.',
    }).resolve(DOUBT, LESSON)

    if (r.kind !== 'refusal') throw new Error('expected a refusal')
    expect(r.reason).toContain('would rather not guess')
  })

  it('never turns a refusal into an empty answer', async () => {
    /* The failure this guards against renders as a heading with nothing under
       it, which reads to a learner as the software breaking rather than
       declining. */
    const r = await resolverFor({ outcome: 'unmappable', resume_at: 'b', refusal: '' }).resolve(
      DOUBT,
      LESSON,
    )
    expect(r.kind).toBe('refusal')
  })

  it('an answered outcome with no lesson is a refusal, not a crash', async () => {
    const r = await resolverFor({ outcome: 'answered', resume_at: 'b' }).resolve(DOUBT, LESSON)
    expect(r.kind).toBe('refusal')
  })
})

/* -------------------------------------------------------------------------- */
/* Outage is told apart from refusal                                          */
/* -------------------------------------------------------------------------- */

describe('a broken bridge is reported as broken', () => {
  it('a 503 from the middleware throws, so the chain records a FAILURE', async () => {
    /* Throwing rather than refusing is deliberate. `askChain` records a throw as
       `failed` and a refusal as `refused`, and the learner's final message says
       which happened. A resolver that refused on an outage would flatten "the
       engine is not running" into "the engine has nothing to say". */
    const resolver = resolverFor({ outcome: 'unavailable', refusal: 'no venv' }, false, 503)
    await expect(resolver.resolve(DOUBT, LESSON)).rejects.toThrow(/engine/i)
  })

  it('a network failure throws rather than refusing', async () => {
    const resolver = engineResolver({
      fetchImpl: (async () => {
        throw new Error('connection refused')
      }) as typeof fetch,
    })
    await expect(resolver.resolve(DOUBT, LESSON)).rejects.toThrow(/connection refused/)
  })

  it('a non-JSON body throws rather than refusing', async () => {
    const resolver = engineResolver({
      fetchImpl: (async () =>
        ({
          ok: true,
          status: 200,
          json: async () => {
            throw new Error('not json')
          },
        }) as unknown as Response) as typeof fetch,
    })
    await expect(resolver.resolve(DOUBT, LESSON)).rejects.toThrow()
  })
})

/* -------------------------------------------------------------------------- */
/* What it sends                                                              */
/* -------------------------------------------------------------------------- */

describe('the request it makes', () => {
  it('sends the question and the place to come back to', async () => {
    /* `resume_at` is why answering does not cost the learner their place. The
       engine echoes it back, and dropping it here would break the round trip the
       Python type was shaped to protect. */
    const spy = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ outcome: 'unmappable', resume_at: 'beat-3' }),
    )
    await engineResolver({ fetchImpl: spy as unknown as typeof fetch }).resolve(DOUBT, LESSON)

    const init = spy.mock.calls[0]?.[1]
    const body = JSON.parse(String(init?.body))
    expect(body.text).toBe('what is a base case')
    expect(body.resume_at).toBe('beat-3')
  })

  it('posts to a relative path, so it cannot leak a key it never has', async () => {
    const spy = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ outcome: 'unmappable', resume_at: 'b' }),
    )
    await engineResolver({ fetchImpl: spy as unknown as typeof fetch }).resolve(DOUBT, LESSON)
    expect(String(spy.mock.calls[0]?.[0] ?? '')).toMatch(/^\//)
  })

  it('leaving stops the work: aborting the caller aborts the request', async () => {
    /*
     * THIS ASSERTION CHANGED, AND WHY IS PART OF THE TEST.
     *
     * It used to require the signal handed to fetch to BE the caller's own
     * object. That became unsatisfiable when the deadline landed, because there
     * are now two things that can stop this request -- the learner leaving, and
     * the engine running out of time -- and one object cannot be both.
     *
     * The requirement did not change. The name of this test is the requirement,
     * and it still holds. What changed is that it is now checked by EFFECT
     * rather than by identity, which is strictly harder: handing an object to
     * fetch never proved that aborting it stopped anything. Deleting the
     * forwarding line in `engineResolver.ts` leaves the old assertion GREEN and
     * turns this one RED.
     */
    /*
     * WHILE THE REQUEST IS STILL RUNNING, which is the only moment the claim
     * means anything. Checked after it had already finished, the request is
     * over and there is nothing left to stop -- and the rung has correctly let
     * go of the listener by then, so a late abort proves nothing either way.
     */
    let seen: AbortSignal | undefined
    const inFlight = vi.fn((_url: string, init?: RequestInit) => {
      seen = init?.signal ?? undefined
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        })
      })
    })
    const controller = new AbortController()
    const resolver = engineResolver({
      fetchImpl: inFlight as unknown as typeof fetch,
      /* Far longer than this test takes, so the DEADLINE cannot be what stops
         the request. Only the learner leaving can, which is the claim. */
      timeoutMs: 60_000,
    })
    const pending = resolver.resolve(DOUBT, LESSON, controller.signal)

    /* Not yet. The learner is still reading. A request aborted before they left
       is the opposite bug, and a one-sided check would never catch it. */
    expect(seen?.aborted).toBe(false)

    controller.abort()
    expect(seen?.aborted).toBe(true)

    /* And the withdrawal is not dressed up as a broken bridge. */
    await expect(pending).rejects.toThrow(/aborted/i)
  })

  it('an already-aborted signal means no request at all', async () => {
    const spy = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ outcome: 'unmappable', resume_at: 'b' }),
    )
    const controller = new AbortController()
    controller.abort()
    const r = await engineResolver({ fetchImpl: spy as unknown as typeof fetch }).resolve(
      DOUBT,
      LESSON,
      controller.signal,
    )
    expect(spy).not.toHaveBeenCalled()
    expect(r.kind).toBe('refusal')
  })

  it('has a name, so an odd answer is traceable', () => {
    expect(engineResolver({}).name).toBe('engine')
  })
})

/* -------------------------------------------------------------------------- */
/* Provenance: who wrote the sentences                                        */
/* -------------------------------------------------------------------------- */

describe('an answer says which provider wrote it', () => {
  it('carries the provider through as writtenBy', async () => {
    /*
     * THE RULE THIS SERVES, in the repository's own words.
     *
     * `llm/client.py`: "A convincing fake is worse than an obvious one — it
     * invites judging the system's teaching quality from output no model
     * produced." And `CanvasRoute.tsx` already labels the hand-written lesson
     * "so nobody reads it as a model's work".
     *
     * The doubt path is the one place that rule had lapsed: skeleton prose from
     * `FakeLLMClient` arrived looking exactly like teaching.
     */
    const r = await resolverFor({
      outcome: 'answered',
      resume_at: 'b',
      provider: 'gemini',
      lesson: ANSWER_LESSON,
    }).resolve(DOUBT, LESSON)

    if (r.kind !== 'answer') throw new Error('expected an answer')
    expect(r.writtenBy).toBe('gemini')
  })

  it('carries the fake through by name rather than hiding it', async () => {
    const r = await resolverFor({
      outcome: 'answered',
      resume_at: 'b',
      provider: 'fake',
      lesson: ANSWER_LESSON,
    }).resolve(DOUBT, LESSON)

    if (r.kind !== 'answer') throw new Error('expected an answer')
    expect(r.writtenBy).toBe('fake')
  })

  it('a reply with no provider field leaves writtenBy undefined, not guessed', async () => {
    /* Inventing "fake" here would claim knowledge the reply did not carry, and
       the label exists precisely to stop unearned claims about authorship. */
    const r = await resolverFor({
      outcome: 'answered',
      resume_at: 'b',
      lesson: ANSWER_LESSON,
    }).resolve(DOUBT, LESSON)

    if (r.kind !== 'answer') throw new Error('expected an answer')
    expect(r.writtenBy).toBeUndefined()
  })

  it('a non-string provider is ignored rather than rendered', async () => {
    /* It crossed a process boundary. Rendering `[object Object]` under a lesson
       is worse than rendering nothing. */
    const r = await resolverFor({
      outcome: 'answered',
      resume_at: 'b',
      provider: { name: 'gemini' },
      lesson: ANSWER_LESSON,
    }).resolve(DOUBT, LESSON)

    if (r.kind !== 'answer') throw new Error('expected an answer')
    expect(r.writtenBy).toBeUndefined()
  })
})

/* -------------------------------------------------------------------------- */
/* A hung engine gives up                                                     */
/* -------------------------------------------------------------------------- */

/**
 * WHY THIS SECTION EXISTS, AND WHAT IT COST TO LEARN.
 *
 * `scene-regressions.spec.ts:454` -- "asking a doubt answers it without
 * advancing the lesson" -- failed on CI, passed on a re-run, and was written
 * off as flaky. It failed again. It was never flaky: this rung posted to the
 * engine with NO DEADLINE, so when the middleware is absent the POST hangs
 * instead of failing fast, the chain never reaches the rung behind it, and no
 * answer renders. Whether it passed depended on how quickly the host refused
 * the connection, which is a property of the machine and not of the code.
 *
 * A rung that can wait forever is a rung that can stop the whole chain, and the
 * learner is shown nothing at all -- the one outcome the chain was built to
 * make impossible.
 *
 * A TIMEOUT IS AN OUTAGE, NOT A REFUSAL. This file's own rule: the engine
 * declining is RETURNED so the chain records `refused`, the bridge being broken
 * is THROWN so it records `failed`. A hang is the bridge being broken. Telling
 * a learner their question was unanswerable because a subprocess never replied
 * would be the confident, wrong sentence this rung already refuses to say.
 */
describe('a hung engine does not stall the chain', () => {
  /** A fetch that never settles on its own -- only the signal can end it. */
  function hangingFetch(): { fetchImpl: typeof fetch; seenSignal: () => AbortSignal | undefined } {
    let seen: AbortSignal | undefined
    const fetchImpl = ((_url: string, init?: RequestInit) => {
      seen = init?.signal ?? undefined
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        })
      })
    }) as unknown as typeof fetch
    return { fetchImpl, seenSignal: () => seen }
  }

  it('gives up on a POST that never answers, and says the engine timed out', async () => {
    const { fetchImpl } = hangingFetch()
    const resolver = engineResolver({ fetchImpl, timeoutMs: 20 })

    /* The MESSAGE, not merely that something threw. A rung that threw for any
       other reason -- a missing export, a typo in the endpoint -- would satisfy
       a bare `rejects.toThrow()` while leaving the hang entirely in place. */
    await expect(resolver.resolve(DOUBT, LESSON)).rejects.toThrow(/engine timed out after 20ms/)
  })

  it('aborts the request itself, so the socket is not left open behind it', async () => {
    /* Rejecting the promise while the POST runs on would leak a connection per
       doubt asked. The effect that matters is on the REQUEST, so assert on the
       signal the rung handed to fetch, not on the promise it handed back. */
    const { fetchImpl, seenSignal } = hangingFetch()
    const resolver = engineResolver({ fetchImpl, timeoutMs: 20 })

    await expect(resolver.resolve(DOUBT, LESSON)).rejects.toThrow(/timed out/)
    expect(seenSignal()?.aborted).toBe(true)
  })

  it('an engine that answers in time is NOT cut off', async () => {
    /*
     * THE PAIRED POSITIVE, AND IT IS LOAD BEARING. A rung that threw
     * "engine timed out" unconditionally passes both tests above. This is the
     * one that kills it, and it is the case every real learner hits.
     */
    const resolver = engineResolver({
      fetchImpl: (async () =>
        jsonResponse({
          outcome: 'answered',
          resume_at: 'beat-3',
          lesson: ANSWER_LESSON,
        })) as typeof fetch,
      timeoutMs: 10_000,
    })

    const r = await resolver.resolve(DOUBT, LESSON)
    if (r.kind !== 'answer') throw new Error('expected an answer')
    expect(JSON.stringify(r.lesson)).toContain('stops the recursion')
  })

  it("the learner's own withdrawal is still a refusal, never an outage", async () => {
    /*
     * The two must not collapse into each other. A learner who navigated away
     * did not suffer a broken bridge, and `askChain` renders the difference.
     */
    const { fetchImpl } = hangingFetch()
    const resolver = engineResolver({ fetchImpl, timeoutMs: 20 })
    const withdrawn = AbortSignal.abort()

    const r = await resolver.resolve(DOUBT, LESSON, withdrawn)
    expect(r.kind).toBe('refusal')
    if (r.kind !== 'refusal') throw new Error('expected a refusal')
    expect(r.reason).toMatch(/withdrawn/)
  })
})
