/**
 * F4 — WHAT A REAL PERSON TYPES, INCLUDING THE THINGS NOBODY PLANS FOR.
 *
 * Every case below is something a student can put in the box in ten seconds.
 * None of them may produce a spinner that never ends, a stack trace, a blank
 * screen, or a 500. The system may refuse, and must say something a person can
 * read -- but it must always ANSWER.
 */
import { describe, expect, it } from 'vitest'
import { createHandler, type ModelPort } from './handler.ts'
import { inMemoryStore as aStore } from './memory/inMemory.spec.ts'
import { explanationsIn } from './memory/explanations.ts'
import { writtenLessons } from './memory/lessons.ts'
import { subjectAliases } from './memory/aliases.ts'
import { evidenceIn } from './memory/evidence.ts'

const A_TEST_SECRET = 'a'.repeat(64)
const RECIPE = 'recipe-under-test'
const A_CONCEPT = {
  id: 'base-case',
  question: 'What is a base case?',
  technicalTerms: [],
  blocks: [
    { id: 'says-what', kind: 'prose', emphasis: 'primary', role: 'definition', body: 'A base case is the branch that returns without calling itself.', terms: [{ text: 'branch', mark: 'key' }] },
    { id: 'shown', kind: 'table', role: 'example', columns: [{ key: 'call', label: 'Call' }, { key: 'returns', label: 'Returns' }], rows: [{ call: 'f(0)', returns: '1' }, { call: 'f(1)', returns: 'f(0)' }] },
    { id: 'closing', kind: 'summary', role: 'summary', progression: ['it returns without recursing', 'so the chain ends'], mentalModel: 'The base case is where the chain stops.' },
  ],
  relations: [],
}

function aServer(model: ModelPort) {
  const store = aStore()
  return createHandler({
    model,
    search: { search: async () => [] },
    identitySecret: A_TEST_SECRET,
    explanations: explanationsIn(store),
    lessons: writtenLessons(store, RECIPE),
    aliases: subjectAliases(store, RECIPE),
    evidence: evidenceIn(store),
  })
}

const answers: ModelPort = { lesson: async () => A_CONCEPT, chat: async () => JSON.stringify(A_CONCEPT) }
const dead: ModelPort = {
  lesson: async () => { throw new Error('ECONNREFUSED') },
  chat: async () => { throw new Error('ECONNREFUSED') },
}

/** Everything a person can type in ten seconds. */
const TYPED: readonly [string, string][] = [
  ['nothing at all', ''],
  ['one space', ' '],
  ['one letter', 'a'],
  ['one letter and a question mark', 'a?'],
  ['keyboard mash', 'asdkjhasd'],
  ['emoji only', '😀😀😀'],
  ['another script', 'गुरुत्वाकर्षण क्या है'],
  ['mixed script', 'gravity kya hai bhai'],
  ['rude', 'this app is rubbish, teach me something'],
  ['five thousand characters', 'why '.repeat(1250)],
  ['a newline storm', '\n'.repeat(200)],
  ['html', '<script>alert(1)</script>'],
  ['json', '{"question":"nested"}'],
  ['a url', 'https://example.com/what-is-a-zero'],
  ['sql', "'; DROP TABLE students; --"],
  ['numbers only', '123456'],
  ['off-syllabus', 'what is inside a black hole'],
]

describe('nothing a person can type breaks it', () => {
  it.each(TYPED)('%s: answers, never a crash and never a hang', async (_name, question) => {
    const handler = aServer(answers)
    const reply = await Promise.race([
      handler({ method: 'POST', path: '/api/ask', body: { question } }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('it hung')), 4_000)),
    ])
    expect([200, 400, 413, 422]).toContain(reply.status)
    const body = reply.body as Record<string, unknown>
    const said = JSON.stringify(body)
    expect(said).not.toMatch(/ECONNREFUSED|at Object\.|node_modules|\bstack\b/i)
    /* Something a person can read: a lesson, a question back, or a reason. */
    expect(
      body['lesson'] !== undefined || typeof body['question'] === 'string' || typeof body['error'] === 'string',
      `nothing readable came back: ${said.slice(0, 200)}`,
    ).toBe(true)
  })

  it.each(TYPED)('%s: with the model down, still answers in words', async (_name, question) => {
    const handler = aServer(dead)
    const reply = await Promise.race([
      handler({ method: 'POST', path: '/api/ask', body: { question } }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('it hung')), 4_000)),
    ])
    expect([200, 400, 413, 422, 502, 503]).toContain(reply.status)
    const said = JSON.stringify(reply.body)
    expect(said).not.toMatch(/at Object\.|node_modules/i)
    expect(said.length).toBeGreaterThan(2)
  })

  it('a salvaged lesson is still remembered, so the next ask is not the same again', async () => {
    /* MEASURED 2026-09-02: the model's first draft is imperfect most of the
       time, so most answers come back `partial: true` -- salvaged. That path
       returned 200 with a route and wrote NOTHING to her history, so the same
       question returned the same way in forever. The shared shelf must stay
       clean (a salvaged lesson is not worth handing to a second learner) but
       HER history is a different thing, and it is what stops the repeat. */
    const handler = aServer(answers)
    const first = await handler({ method: 'POST', path: '/api/ask', body: { question: 'what is a base case' } })
    expect((first.body as { partial?: boolean }).partial, 'this fixture no longer salvages; pick one that does').toBe(true)
    const cookie = (first.setCookie ?? '').split(';')[0] ?? ''
    const second = await handler({ method: 'POST', path: '/api/ask', body: { question: 'what is a base case' }, cookie })
    expect((second.body as { route?: string }).route).not.toBe((first.body as { route?: string }).route)
  })

  it('the same question twice never comes back word for word the same', async () => {
    const handler = aServer(answers)
    const first = await handler({ method: 'POST', path: '/api/ask', body: { question: 'what is a base case' } })
    const cookie = (first.setCookie ?? '').split(';')[0] ?? ''
    const second = await handler({ method: 'POST', path: '/api/ask', body: { question: 'what is a base case' }, cookie })
    expect(second.status).toBe(200)
    const a = (first.body as { route?: string }).route
    const b = (second.body as { route?: string }).route
    if (a !== undefined && b !== undefined) expect(b).not.toBe(a)
  })
})
