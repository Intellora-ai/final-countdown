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

  it('passes the abort signal through, so leaving stops the work', async () => {
    const spy = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ outcome: 'unmappable', resume_at: 'b' }),
    )
    const controller = new AbortController()
    await engineResolver({ fetchImpl: spy as unknown as typeof fetch }).resolve(
      DOUBT,
      LESSON,
      controller.signal,
    )
    expect(spy.mock.calls[0]?.[1]?.signal).toBe(controller.signal)
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
