import { describe, expect, it } from 'vitest'

import { createHandler, type ModelPort, type SearchPort } from './handler.ts'
import { evidenceIn } from './memory/evidence.ts'
import { canvasMemory } from './memory/store.ts'
import { sqliteMemoryStore } from './memory/sqliteStore.ts'

/**
 * THE CANVAS SAYS WHICH OF ITS OWN LESSONS DESERVE ANOTHER LOOK.
 *
 * End to end over the real handler, the real evidence store and a real SQLite
 * database. The rules themselves are proven in `assurance.test.ts`; what this
 * file proves is that they are actually WIRED -- that real pleas, filed the way
 * the product files them, reach the rules and come back on the canvas read.
 *
 * An unwired rule is the exact defect this repository's reachability gate
 * exists to catch, and it has caught one before.
 */

const A_TEST_SECRET = 'assurance-secret-not-used-anywhere-real'
const search: SearchPort = { search: async () => [] }
const model: ModelPort = {
  lesson: async () => { throw new Error('not used') },
  chat: async () => { throw new Error('not used') },
}

const A_LESSON = {
  id: 'zeros', question: 'what is a zero',
  blocks: [{ id: 'says', kind: 'prose', body: 'A zero of a polynomial makes it equal to nought.' }],
}

function server() {
  const store = sqliteMemoryStore(':memory:')
  const handle = createHandler({
    model,
    search,
    memory: canvasMemory({ store, log: () => {} }),
    evidence: evidenceIn(store),
    identitySecret: A_TEST_SECRET,
  })
  let cookie = ''
  const call = async (req: Parameters<typeof handle>[0]) => {
    const res = await handle({ ...req, ...(cookie === '' ? {} : { cookie }) })
    if (res.setCookie !== undefined) cookie = res.setCookie.split(';')[0] ?? ''
    return res
  }
  return { call, close: () => store.close() }
}

const TOPIC = 'polynomials--zeros-of-a-polynomial'
const TAB = 'a-browser'

async function put(s: ReturnType<typeof server>, times: number): Promise<void> {
  for (let n = 0; n < times; n += 1) {
    await s.call({
      method: 'POST', path: '/api/canvas',
      body: { tabId: TAB, lessonId: `${TOPIC}#canvas`, artifact: { kind: 'lesson', question: `q${n}`, payload: A_LESSON, teaching: 'lesson' } },
    })
  }
}

async function plea(s: ReturnType<typeof server>, artifactSeq: number, beat: string): Promise<void> {
  await s.call({
    method: 'POST', path: '/api/evidence',
    body: { topicId: TOPIC, said: 'i still do not get this bit', beat, artifactSeq },
  })
}

async function look(s: ReturnType<typeof server>): Promise<{ artifactSeq: number; kind: string }[]> {
  const res = await s.call({
    method: 'GET', path: '/api/canvas',
    query: `tabId=${TAB}&lessonId=${encodeURIComponent(`${TOPIC}#canvas`)}`,
  })
  expect(res.status).toBe(200)
  return (res.body['needsAnotherLook'] ?? []) as { artifactSeq: number; kind: string }[]
}

describe('reading a canvas says what deserves another look', () => {
  it('says nothing about a canvas she has not struggled with', async () => {
    const s = server()
    try {
      await put(s, 3)
      expect(await look(s), 'lessons were queued with no evidence behind them').toEqual([])
    } finally { s.close() }
  })

  it('does not raise anything on one moment of confusion', async () => {
    const s = server()
    try {
      await put(s, 1)
      await plea(s, 1, 'says')
      expect(await look(s)).toEqual([])
    } finally { s.close() }
  })

  it('raises the lesson she has been lost in three times at the same point', async () => {
    const s = server()
    try {
      await put(s, 2)
      for (let n = 0; n < 3; n += 1) await plea(s, 1, 'says')
      const found = await look(s)
      expect(found.map((f) => f.artifactSeq), 'the lesson she is stuck on was not raised').toEqual([1])
      expect(found[0]?.kind).toBe('repeated-confusion')
    } finally { s.close() }
  })

  it('does not raise a lesson she was lost in once each across three lessons', async () => {
    const s = server()
    try {
      await put(s, 3)
      await plea(s, 1, 'says')
      await plea(s, 2, 'says')
      await plea(s, 3, 'says')
      expect(await look(s), 'a hard week was mistaken for three wrong lessons').toEqual([])
    } finally { s.close() }
  })
})
