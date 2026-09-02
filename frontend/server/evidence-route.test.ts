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
import { evidenceIn } from './memory/evidence.ts'
import { misconceptionsIn } from './memory/misconceptions.ts'
import { conceptsIn } from './memory/concepts.ts'
import { briefFor } from './prompt.ts'

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
  const evidence = evidenceIn(store)
  const misconceptions = misconceptionsIn(store)
  /* A stand-in for `nomic-embed-text` with the measured distances: the same
     question is 1.0, a rewording 0.889, a different subject 0.429. */
  const vectors: Record<string, readonly number[]> = {
    'what is a zero of a polynomial': [1, 0, 0],
    'explain what a zero of a polynomial is': [0.889, Math.sqrt(1 - 0.889 ** 2), 0],
    'what caused the french revolution': [0.429, 0, Math.sqrt(1 - 0.429 ** 2)],
  }
  const concepts = conceptsIn(store, async (text) => vectors[text.toLowerCase()] ?? null)
  const handler = createHandler({
    model,
    search,
    identitySecret: A_TEST_SECRET,
    explanations: explanationsIn(store),
    lessons: lessons ?? writtenLessons(store, RECIPE),
    aliases: subjectAliases(store, RECIPE),
    evidence,
    misconceptions,
    concepts,
  })
  return Object.assign(handler, { evidence, misconceptions, concepts })
}

/* The prelude above is the same fixture `speed.test.ts` starts from: one
   concept, one server, one in-memory store. Copied, not shared, so each file
   stays runnable on its own. */

describe('C3 — what the learner types becomes evidence', () => {
  /* Decided 2026-09-02: questions are rare; a question is the system's move
     only when the learner did not understand, and the evidence of that is what
     they typed. Every later decision -- the eight-way diagnosis, the
     misconception hypotheses -- reasons from this record. */
  const model: ModelPort = {
    lesson: async () => A_CONCEPT,
    chat: async () => JSON.stringify(A_CONCEPT),
  }

  it('a statement and a plea are filed under the topic, in order, as what they are', async () => {
    const handler = aServer(model)
    const first = await handler({
      method: 'POST',
      path: '/api/evidence',
      body: { topicId: 'polynomials--zeros', said: 'so the zeros are where the graph crosses the x axis', beat: 'b1' },
    })
    expect(first.status).toBe(200)
    const second = await handler({
      ...{ method: 'POST', path: '/api/evidence', body: { topicId: 'polynomials--zeros', said: 'i still dont get why there are two', beat: 'b2' } },
      cookie: cookieFrom(first),
    })
    expect(second.status).toBe(200)
    expect((second.body as { kind?: string }).kind).toBe('plea')
    const studentId = (second.body as { studentId: string }).studentId
    const kept = handler.evidence.recall({ studentId, tabId: 'any', lessonId: 'polynomials--zeros' }, 'polynomials--zeros')
    expect(kept.map((e) => [e.kind, e.beat])).toEqual([
      ['answer', 'b1'],
      ['plea', 'b2'],
    ])
    expect(kept[1]?.said).toBe('i still dont get why there are two')
  })

  it('refuses a turn with no topic to file it under', async () => {
    const handler = aServer(model)
    const reply = await handler({ method: 'POST', path: '/api/evidence', body: { said: 'hello' } })
    expect(reply.status).toBe(400)
  })
})

describe('C3 — a plea inside a lesson is answered with a question, a statement is not', () => {
  const question = 'Which of the two zeros is the one that puzzles you?'
  function tutor(seen: { notUnderstood?: string }[], withCheckpoint: boolean): ModelPort {
    return {
      lesson: async (request) => {
        seen.push({ ...(request.notUnderstood === undefined ? {} : { notUnderstood: request.notUnderstood }) })
        return withCheckpoint ? { ...A_CONCEPT, checkpoint: question } : A_CONCEPT
      },
      chat: async () => JSON.stringify(A_CONCEPT),
    }
  }
  const inside = {
    question: 'What is a base case?',
    askedInside: 'What is a base case?',
    taught: 'A base case is the branch that returns without calling itself.',
    topicId: 'recursion--base-case',
  }

  it('a plea tells the tutor what was not understood, files it, and comes back with one question', async () => {
    const seen: { notUnderstood?: string }[] = []
    const handler = aServer(tutor(seen, true))
    const reply = await handler(ask({ ...inside, justSaid: 'i still dont get why it stops' }))
    expect(reply.status).toBe(200)
    expect(seen[0]?.notUnderstood, 'the tutor was not told').toBe('i still dont get why it stops')
    expect((reply.body as { checkpoint?: string }).checkpoint, 'the question was dropped on the way out').toBe(question)
    const studentId = (reply.body as { studentId?: string }).studentId ?? ''
    const kept = handler.evidence.recall({ studentId, tabId: 'any', lessonId: inside.topicId }, inside.topicId)
    expect(kept.map((e) => e.kind)).toEqual(['plea'])
  })

  it('a statement is filed as an answer and the tutor is not told anything went wrong', async () => {
    const seen: { notUnderstood?: string }[] = []
    const handler = aServer(tutor(seen, false))
    const reply = await handler(ask({ ...inside, justSaid: 'so it stops when there is nothing left to split' }))
    expect(reply.status).toBe(200)
    expect(seen[0]?.notUnderstood).toBeUndefined()
    expect((reply.body as { checkpoint?: string }).checkpoint).toBeUndefined()
    const studentId = (reply.body as { studentId?: string }).studentId ?? ''
    const kept = handler.evidence.recall({ studentId, tabId: 'any', lessonId: inside.topicId }, inside.topicId)
    expect(kept.map((e) => e.kind)).toEqual(['answer'])
  })

  it('the brief says it plainly and asks for exactly one question', () => {
    const text = briefFor({ question: 'What is a base case?', taught: 'A base case stops the recursion.', justSaid: 'i dont get it', notUnderstood: 'i dont get it' })
    expect(text).toMatch(/not understood/i)
    expect(text).toMatch(/checkpoint/)
    expect(text).toMatch(/one (short )?question/i)
  })
})

describe('C4 — a misconception is a hypothesis with the plea as its evidence', () => {
  /* Decided 2026-09-02. The lesson warned her, at a beat she has read, that
     "heavier objects fall faster" is wrong; then she pleads. That is a low-
     confidence hypothesis that she holds it -- observable, revisable -- and
     the tutor is told, so the next part states the wrong belief plainly and
     shows where it fails. A statement observes nothing: only a plea does. */
  const inside = {
    question: 'Why do all objects fall at the same rate?',
    askedInside: 'Why do all objects fall at the same rate?',
    taught: 'In a vacuum a feather and a hammer land together.',
    topicId: 'gravitation--free-fall',
    suspects: ['heavier objects fall faster'],
  }
  function tutor(seen: { mayHold?: readonly string[] }[]): ModelPort {
    return {
      lesson: async (request) => {
        seen.push({ ...(request.mayHold === undefined ? {} : { mayHold: request.mayHold }) })
        return A_CONCEPT
      },
      chat: async () => JSON.stringify(A_CONCEPT),
    }
  }

  it('a plea observes the warned-against belief, a second plea strengthens it, and the tutor is told', async () => {
    const seen: { mayHold?: readonly string[] }[] = []
    const handler = aServer(tutor(seen))
    const first = await handler(ask({ ...inside, justSaid: 'i dont get why the hammer doesnt land first' }))
    expect(first.status).toBe(200)
    const studentId = (first.body as { studentId?: string }).studentId ?? ''
    const owner = { studentId, tabId: 'any', lessonId: 'anything' }
    let held = handler.misconceptions.recall(owner)
    expect(held.map((h) => [h.concept, h.observed, h.confidence, h.status])).toEqual([
      ['gravitation--free-fall', 'heavier objects fall faster', 'low', 'active'],
    ])
    expect(held[0]?.evidence[0]?.said).toBe('i dont get why the hammer doesnt land first')
    expect(seen[0]?.mayHold, 'the tutor was not told what she may hold').toEqual(['heavier objects fall faster'])

    await handler({ ...ask({ ...inside, justSaid: 'still confused, the heavy one should win' }), cookie: cookieFrom(first) })
    held = handler.misconceptions.recall(owner)
    expect(held).toHaveLength(1)
    expect(held[0]?.confidence).toBe('medium')
    expect(held[0]?.evidence).toHaveLength(2)
  })

  it('a statement with the same warning attached observes nothing', async () => {
    const seen: { mayHold?: readonly string[] }[] = []
    const handler = aServer(tutor(seen))
    const reply = await handler(ask({ ...inside, justSaid: 'so in a vacuum they land together' }))
    const studentId = (reply.body as { studentId?: string }).studentId ?? ''
    expect(handler.misconceptions.recall({ studentId, tabId: 'any', lessonId: 'anything' })).toEqual([])
    expect(seen[0]?.mayHold).toBeUndefined()
  })

  it('the brief states the wrong belief plainly and asks for the repair', () => {
    const text = briefFor({
      question: 'Why do all objects fall at the same rate?',
      taught: 'In a vacuum a feather and a hammer land together.',
      justSaid: 'i dont get it',
      notUnderstood: 'i dont get it',
      mayHold: ['heavier objects fall faster'],
    })
    expect(text).toMatch(/heavier objects fall faster/)
    expect(text).toMatch(/wrong belief/i)
    expect(text).toMatch(/correct rule/i)
  })
})

describe('D1/D2 — the diagnosis reaches the prompt, and never repeats a failed move', () => {
  /* The audit's one sentence: the teaching strategy is computed on every
     lesson and lands only in the reply JSON, never in a prompt -- so a learner
     meeting an idea and one who has failed it three times get the identical
     lesson. On the canvas path the diagnosis now chooses the strategy and the
     strategy is what the tutor is told to do. */
  const inside = {
    question: 'Why do all objects fall at the same rate?',
    askedInside: 'Why do all objects fall at the same rate?',
    taught: 'In a vacuum a feather and a hammer land together.',
    topicId: 'gravitation--free-fall',
  }
  function tutor(seen: { strategy?: string }[]): ModelPort {
    return {
      lesson: async (request) => {
        seen.push({ ...(request.strategy === undefined ? {} : { strategy: request.strategy }) })
        return A_CONCEPT
      },
      chat: async () => JSON.stringify(A_CONCEPT),
    }
  }

  it('a belief she may hold repairs the misconception; a missing earlier idea repairs that instead', async () => {
    const held: { strategy?: string }[] = []
    const wrong = aServer(tutor(held))
    await wrong(ask({ ...inside, justSaid: 'i dont get why the hammer doesnt land first', suspects: ['heavier objects fall faster'] }))
    expect(held[0]?.strategy).toBe('misconception_repair')

    const missing: { strategy?: string }[] = []
    const gap = aServer(tutor(missing))
    await gap(ask({ ...inside, justSaid: 'what is mass? i never learnt that' }))
    expect(missing[0]?.strategy).toBe('prerequisite_repair')
    expect(missing[0]?.strategy).not.toBe(held[0]?.strategy)
  })

  it('the reply says what was decided, so it can be read back and argued with', async () => {
    const handler = aServer(tutor([]))
    const reply = await handler(ask({ ...inside, justSaid: 'the diagram makes no sense to me' }))
    expect(reply.status).toBe(200)
    const body = reply.body as { diagnosis?: string; strategy?: string }
    expect(body.diagnosis).toBe('representation_failure')
    expect(body.strategy).toBe('change_representation')
  })

  it('a second plea after the same move never gets that move again', async () => {
    const seen: { strategy?: string }[] = []
    const handler = aServer(tutor(seen))
    const first = await handler(ask({ ...inside, justSaid: 'i dont get it' }))
    const again = { ...ask({ ...inside, justSaid: 'i still dont get it' }), cookie: cookieFrom(first) }
    await handler(again)
    await handler({ ...ask({ ...inside, justSaid: 'still lost' }), cookie: cookieFrom(first) })
    expect(new Set(seen.map((one) => one.strategy)).size, `the same move was served twice: ${seen.map((s) => s.strategy).join(', ')}`).toBe(seen.length)
  })

  it('a statement is diagnosed with nothing, and the tutor is told no strategy', async () => {
    const seen: { strategy?: string }[] = []
    const handler = aServer(tutor(seen))
    const reply = await handler(ask({ ...inside, justSaid: 'so in a vacuum they land together' }))
    expect((reply.body as { diagnosis?: string }).diagnosis).toBeUndefined()
    expect(seen[0]?.strategy).toBeUndefined()
  })
})

describe('D3 — the prerequisite is verified against what she did, not assumed', () => {
  /* The curriculum lists what comes first. This learner's evidence decides
     whether it is what is stopping her. A prerequisite she answered on is
     never retaught; one she never met is what the tutor teaches first. */
  const inside = {
    question: 'How do I solve a quadratic by factorising?',
    askedInside: 'How do I solve a quadratic by factorising?',
    taught: 'A quadratic is zero when either bracket is zero.',
    topicId: 'quadratics--solving-by-factorisation',
    prerequisites: [
      { id: 'polynomials--factorisation', name: 'Factorisation of polynomials' },
      { id: 'algebra--like-terms', name: 'Collecting like terms' },
    ],
  }
  function tutor(seen: { teachFirst?: unknown; strategy?: string }[]): ModelPort {
    return {
      lesson: async (request) => {
        seen.push({
          ...(request.teachFirst === undefined ? {} : { teachFirst: request.teachFirst }),
          ...(request.strategy === undefined ? {} : { strategy: request.strategy }),
        })
        return A_CONCEPT
      },
      chat: async () => JSON.stringify(A_CONCEPT),
    }
  }

  it('names the prerequisite she has never met, and tells the tutor to teach that first', async () => {
    const seen: { teachFirst?: unknown; strategy?: string }[] = []
    const handler = aServer(tutor(seen))
    const reply = await handler(ask({ ...inside, justSaid: 'i never learnt factorisation' }))
    expect(reply.status).toBe(200)
    expect(seen[0]?.strategy).toBe('prerequisite_repair')
    /* ONE AT A TIME (decided 2026-09-02): the tutor is told the single hardest
       blocker, never a list to get through. The reply carries every blocker,
       so a person can see what else was in the way. */
    expect(seen[0]?.teachFirst).toEqual([{ id: 'polynomials--factorisation', name: 'Factorisation of polynomials' }])
    const named = (reply.body as { teachFirst?: { id: string }[] }).teachFirst ?? []
    expect(named.map((one) => one.id)).toEqual(['polynomials--factorisation', 'algebra--like-terms'])
  })

  it('a prerequisite she has already answered on is never retaught', async () => {
    const seen: { teachFirst?: unknown }[] = []
    const handler = aServer(tutor(seen))
    /* She answered on factorisation on its own canvas, earlier in the term. */
    const owner = { studentId: 'stu-known', tabId: 'any', lessonId: 'polynomials--factorisation' }
    handler.evidence.record(owner, 'polynomials--factorisation', { said: 'so you split the middle term', kind: 'answer', at: '2026-09-01T09:00:00Z' })
    const first = await handler(ask({ ...inside, justSaid: 'i never learnt factorisation' }))
    const studentId = (first.body as { studentId?: string }).studentId ?? ''
    handler.evidence.record({ studentId, tabId: 'any', lessonId: 'polynomials--factorisation' }, 'polynomials--factorisation', { said: 'so you split the middle term', kind: 'answer', at: '2026-09-01T09:00:00Z' })
    const again = await handler({ ...ask({ ...inside, justSaid: 'i still never learnt factorisation' }), cookie: cookieFrom(first) })
    expect(again.status).toBe(200)
    const named = (again.body as { teachFirst?: { id: string }[] }).teachFirst ?? []
    expect(named.map((one) => one.id), 'a prerequisite she has answered on was queued for reteaching').not.toContain('polynomials--factorisation')
  })

  it('the brief names what to teach first, in words', () => {
    const text = briefFor({
      question: 'How do I solve a quadratic by factorising?',
      taught: 'A quadratic is zero when either bracket is zero.',
      justSaid: 'i never learnt factorisation',
      notUnderstood: 'i never learnt factorisation',
      teachFirst: [{ id: 'polynomials--factorisation', name: 'Factorisation of polynomials' }],
    })
    expect(text).toMatch(/Factorisation of polynomials/)
    expect(text).toMatch(/first/i)
  })
})

describe('D4 — a rephrased question is the same concept, and is answered from what was written', () => {
  /* Every lookup in this system is an exact key match, so the same learner
     asking the same thing in her own words was taught from nothing. Measured
     on `nomic-embed-text`: a rewording sits at 0.889, a different subject at
     0.429, and the cut between them is not close. */
  const model: ModelPort = {
    lesson: async () => A_CONCEPT,
    chat: async () => JSON.stringify(A_CONCEPT),
  }

  it('the reply names the concept it resolved to, and a rewording resolves to the same one', async () => {
    const handler = aServer(model)
    const first = await handler(ask({ question: 'what is a zero of a polynomial' }))
    expect(first.status).toBe(200)
    const made = (first.body as { concept?: { id: string; how: string } }).concept
    expect(made?.how).toBe('new')
    expect(made?.id).not.toBe('')

    const again = await handler({ ...ask({ question: 'explain what a zero of a polynomial is' }), cookie: cookieFrom(first) })
    const found = (again.body as { concept?: { id: string; how: string } }).concept
    expect(found?.id, 'a rewording made a second concept').toBe(made?.id)
    expect(found?.how).toBe('same')
  })

  it('a different subject is its own concept and borrows nothing', async () => {
    const handler = aServer(model)
    const first = await handler(ask({ question: 'what is a zero of a polynomial' }))
    const other = await handler({ ...ask({ question: 'what caused the french revolution' }), cookie: cookieFrom(first) })
    const found = (other.body as { concept?: { id: string; how: string } }).concept
    expect(found?.how).toBe('new')
    expect(found?.id).not.toBe((first.body as { concept?: { id: string } }).concept?.id)
  })

  it('with no embeddings model the answer is exactly what it was before', async () => {
    const store = aStore()
    const handler = createHandler({
      model,
      search: noSearch,
      identitySecret: A_TEST_SECRET,
      explanations: explanationsIn(store),
      lessons: writtenLessons(store, RECIPE),
      aliases: subjectAliases(store, RECIPE),
      concepts: conceptsIn(store, async () => null),
    })
    const reply = await handler(ask({ question: 'what is a zero of a polynomial' }))
    expect(reply.status).toBe(200)
    expect((reply.body as { concept?: unknown }).concept).toBeUndefined()
  })
})

describe('G3 — the canvas can ask what to do next, and is told why', () => {
  /* The learner model was built in `src/agent/learn` and reached only by the
     agent loop, which the canvas never calls. This is the route that makes it
     reachable, fed by the evidence the canvas itself collects. */
  const model: ModelPort = { lesson: async () => A_CONCEPT, chat: async () => JSON.stringify(A_CONCEPT) }
  const syllabus = {
    topics: [
      { id: 'real-numbers--euclid', name: "Euclid's division lemma", deps: [] },
      { id: 'polynomials--zeros', name: 'Zeros of a polynomial', deps: ['real-numbers--euclid'] },
    ],
  }

  it('answers with the next best topic and a reason a person can argue with', async () => {
    const handler = aServer(model)
    const reply = await handler({ method: 'POST', path: '/api/next', body: { syllabus } })
    expect(reply.status).toBe(200)
    const next = (reply.body as { next?: { topicId: string; because: string }[] }).next ?? []
    expect(next[0]?.topicId).toBe('real-numbers--euclid')
    expect(next[0]?.because.length).toBeGreaterThan(10)
  })

  it('reads her own evidence, so what she has shown is never sent back', async () => {
    const handler = aServer(model)
    const first = await handler({ method: 'POST', path: '/api/next', body: { syllabus } })
    const studentId = (first.body as { studentId: string }).studentId
    handler.evidence.record(
      { studentId, tabId: 'any', lessonId: 'real-numbers--euclid' },
      'real-numbers--euclid',
      { said: 'so you divide and take the remainder', kind: 'answer', at: '2026-09-02T10:00:00Z' },
    )
    const again = await handler({ ...{ method: 'POST', path: '/api/next', body: { syllabus } }, cookie: cookieFrom(first) })
    const next = (again.body as { next?: { topicId: string }[] }).next ?? []
    expect(next.map((one) => one.topicId)).not.toContain('real-numbers--euclid')
    expect(next[0]?.topicId).toBe('polynomials--zeros')
  })

  it('refuses a request with no syllabus rather than inventing one', async () => {
    const handler = aServer(model)
    expect((await handler({ method: 'POST', path: '/api/next', body: {} })).status).toBe(400)
  })
})

describe('G4 — off-syllabus is taught and kept, and changes no progress', () => {
  /* A Class 10 student asks about black holes. She is taught, it stays on her
     canvas, and her progress picture is untouched -- because mixing the two
     would say she has covered ground she has not, and every later decision
     about what she is ready for would be made from that. */
  const model: ModelPort = { lesson: async () => A_CONCEPT, chat: async () => JSON.stringify(A_CONCEPT) }
  const syllabus = {
    topics: [
      { id: 'real-numbers--euclid', name: "Euclid's division lemma", deps: [] },
      { id: 'polynomials--zeros', name: 'Zeros of a polynomial', deps: ['real-numbers--euclid'] },
    ],
  }

  it('teaches it, files it, and leaves what to do next exactly as it was', async () => {
    const handler = aServer(model)
    const before = await handler({ method: 'POST', path: '/api/next', body: { syllabus } })
    const studentId = (before.body as { studentId: string }).studentId

    /* She asks about black holes on her canvas and answers about it. */
    const taught = await handler({
      ...{ method: 'POST', path: '/api/evidence', body: { topicId: 'black-holes', said: 'so gravity wins and light cannot leave', beat: 'b1' } },
      cookie: cookieFrom(before),
    })
    expect(taught.status, 'an off-syllabus question was refused').toBe(200)
    expect(handler.evidence.recall({ studentId, tabId: 'any', lessonId: 'black-holes' }, 'black-holes'), 'it was not kept').toHaveLength(1)

    const after = await handler({ ...{ method: 'POST', path: '/api/next', body: { syllabus } }, cookie: cookieFrom(before) })
    expect((after.body as { next: unknown }).next, 'off-syllabus work moved her progress').toEqual(
      (before.body as { next: unknown }).next,
    )
  })
})
