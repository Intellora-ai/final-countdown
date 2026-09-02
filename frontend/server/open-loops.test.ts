/**
 * The open-loop ledger: a promise recorded, kept exactly once, and released.
 *
 * Both directions throughout, because a ledger has two ways to lie: forgetting
 * a promise it should hold, and holding one it should have released.
 */
import { describe, expect, it } from 'vitest'

import { createHandler, type ModelPort, type SearchPort } from './handler.ts'
import { MAX_LOOPS, openLoops } from './openLoops.ts'
import { sqliteMemoryStore } from './memory/sqliteStore.ts'

const A_TEST_SECRET = 'open-loops-test-secret-0123456789abcdef'

const model: ModelPort = { lesson: async () => ({}) }
const search: SearchPort = { search: async () => [] }

function freshLoops() {
  return openLoops(sqliteMemoryStore(':memory:'))
}

describe('the ledger itself', () => {
  it('holds a recorded question and releases it when closed', () => {
    const loops = freshLoops()
    loops.open('ada', { question: 'why is the sky blue?', lesson: 'gas', stalled: 'refused' }, '2026-09-02T00:00:00Z')
    expect(loops.list('ada')).toHaveLength(1)
    expect(loops.list('ada')[0]?.question).toBe('why is the sky blue?')

    loops.close('ada', 'why is the sky blue?')
    expect(loops.list('ada')).toEqual([])
  })

  it('re-asking refreshes the one entry rather than duplicating it', () => {
    const loops = freshLoops()
    loops.open('ada', { question: 'What is entropy?', lesson: 'gas', stalled: 'failed' }, 't1')
    loops.open('ada', { question: '  what is entropy?  ', lesson: 'gas', stalled: 'refused' }, 't2')
    const held = loops.list('ada')
    expect(held).toHaveLength(1)
    expect(held[0]?.at).toBe('t2')
    expect(held[0]?.stalled).toBe('refused')
  })

  it('drops the OLDEST promise past the cap, never the newest', () => {
    const loops = freshLoops()
    for (let i = 0; i < MAX_LOOPS + 3; i++) {
      loops.open('ada', { question: `question ${i}`, lesson: '', stalled: 'refused' }, `t${i}`)
    }
    const held = loops.list('ada')
    expect(held).toHaveLength(MAX_LOOPS)
    expect(held[0]?.question).toBe('question 3')
    expect(held[held.length - 1]?.question).toBe(`question ${MAX_LOOPS + 2}`)
  })

  it('one student cannot see or shed another student\'s loops', () => {
    const loops = freshLoops()
    loops.open('ada', { question: 'hers', lesson: '', stalled: 'refused' }, 't')
    loops.open('sam', { question: 'his', lesson: '', stalled: 'refused' }, 't')
    loops.close('sam', 'hers')
    expect(loops.list('ada').map((l) => l.question)).toEqual(['hers'])
    expect(loops.list('sam').map((l) => l.question)).toEqual(['his'])
  })

  it('a corrupt stored row degrades to no loops, never to a crash', () => {
    const store = sqliteMemoryStore(':memory:')
    store.write('open-loops/ada', 'not json at all {', 't')
    expect(openLoops(store).list('ada')).toEqual([])
  })

  it('closing a question that never stalled writes nothing', () => {
    const store = sqliteMemoryStore(':memory:')
    const loops = openLoops(store)
    loops.close('ada', 'never asked')
    expect(store.read('open-loops/ada')).toBeUndefined()
  })
})

describe('GET and PUT /api/situation', () => {
  const handlerWith = (loops = freshLoops()) =>
    createHandler({ model, search, loops, identitySecret: A_TEST_SECRET })

  it('answers 503 when no ledger is wired, never a fake empty list', async () => {
    const bare = createHandler({ model, search, identitySecret: A_TEST_SECRET })
    const res = await bare({ method: 'GET', path: '/api/situation' })
    expect(res.status).toBe(503)
  })

  it('records an unanswered question and serves it back to the same identity', async () => {
    const handle = handlerWith()
    const first = await handle({
      method: 'PUT', path: '/api/situation',
      body: { question: 'why is the sky blue?', lesson: 'gas', stalled: 'refused' },
    })
    expect(first.status).toBe(200)
    /* The minted identity travels in the cookie; the read must present it. */
    const cookie = first.setCookie?.split(';')[0] ?? ''

    const read = await handle({ method: 'GET', path: '/api/situation', cookie })
    expect(read.status).toBe(200)
    const held = read.body['openLoops'] as Array<{ question: string }>
    expect(held.map((l) => l.question)).toEqual(['why is the sky blue?'])
  })

  it('a resolved question disappears from the next read', async () => {
    const handle = handlerWith()
    const first = await handle({
      method: 'PUT', path: '/api/situation',
      body: { question: 'what is entropy?', lesson: 'gas', stalled: 'failed' },
    })
    const cookie = first.setCookie?.split(';')[0] ?? ''

    const close = await handle({
      method: 'PUT', path: '/api/situation', cookie,
      body: { question: 'what is entropy?', resolved: true },
    })
    expect(close.status).toBe(200)
    expect(close.body['closed']).toBe(true)

    const read = await handle({ method: 'GET', path: '/api/situation', cookie })
    expect(read.body['openLoops']).toEqual([])
  })

  it('refuses a loop with no question or an invented stall reason', async () => {
    const handle = handlerWith()
    const empty = await handle({
      method: 'PUT', path: '/api/situation', body: { question: '  ', stalled: 'refused' },
    })
    expect(empty.status).toBe(400)

    const invented = await handle({
      method: 'PUT', path: '/api/situation', body: { question: 'x', stalled: 'bored' },
    })
    expect(invented.status).toBe(400)
  })

  it('two identities hold two separate situations', async () => {
    const handle = handlerWith()
    const hers = await handle({
      method: 'PUT', path: '/api/situation',
      body: { question: 'hers alone', lesson: '', stalled: 'refused' },
    })
    const herCookie = hers.setCookie?.split(';')[0] ?? ''

    /* A second caller with NO cookie is a new person and gets a new identity. */
    const his = await handle({ method: 'GET', path: '/api/situation' })
    expect(his.body['openLoops']).toEqual([])

    const herRead = await handle({ method: 'GET', path: '/api/situation', cookie: herCookie })
    expect((herRead.body['openLoops'] as unknown[]).length).toBe(1)
  })
})
