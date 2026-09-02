import { describe, expect, it } from 'vitest'

import { createHandler, type ModelPort, type SearchPort } from '../handler.ts'
import { sqliteMemoryStore } from '../memory/sqliteStore.ts'
import { inCanary } from './canary.ts'
import type { LearningIntelligence, Proposal } from './LearningIntelligence.ts'
import { shadowRuns } from './runs.ts'

/**
 * CANARY. A student is consistently in or out, by a hash of who she is. In:
 * the candidate is asked FIRST; a verified lesson that passes the canvas's
 * own gate is served through the same reply the client already understands,
 * and the client appends it exactly as it appends every lesson -- the server
 * writes nothing. Anything less -- refused, unverified, failed, late -- and
 * the live brain answers inside the same request. Never a dead end.
 */

/* A real server always has `chat` (the failover port); a live model that is
   down is one whose chat THROWS. A port with no chat at all skips the whole
   fresh-question block, seam included -- which is where this fixture first
   went wrong. */
const liveThatRefuses: ModelPort = { lesson: async () => { throw new Error('the live model is down') }, chat: async () => { throw new Error('the model could not be reached') } }
const search: SearchPort = { search: async () => [] }
const SECRET = 'canary-test-secret-not-real'

function proposing(answer: string): LearningIntelligence & { asked: number } {
  const brain = {
    name: 'test-candidate',
    asked: 0,
    propose: async (): Promise<Proposal> => {
      brain.asked += 1
      return { actions: [{ kind: 'explain', because: 'test', risk: 0, evidence: [], payload: { answer, representations: ['prose'] } }], unknowns: [], rationale: 'test', capabilities: { selected: ['knowledge'], rejected: [] }, cost: { ms: 1, modelCalls: 1 }, trace: {} }
    },
  }
  return brain
}
const empty: LearningIntelligence = { name: 'legacy', propose: async () => ({ actions: [], unknowns: [], rationale: '', capabilities: { selected: [], rejected: [] }, cost: { ms: 0, modelCalls: 0 }, trace: {} }) }

async function inMode<T>(mode: string, percent: string | undefined, run: () => Promise<T>): Promise<T> {
  const before = { mode: process.env['INTELLIGENCE_MODE'], percent: process.env['INTELLIGENCE_CANARY_PERCENT'] }
  process.env['INTELLIGENCE_MODE'] = mode
  if (percent === undefined) delete process.env['INTELLIGENCE_CANARY_PERCENT']; else process.env['INTELLIGENCE_CANARY_PERCENT'] = percent
  try { return await run() } finally {
    if (before.mode === undefined) delete process.env['INTELLIGENCE_MODE']; else process.env['INTELLIGENCE_MODE'] = before.mode
    if (before.percent === undefined) delete process.env['INTELLIGENCE_CANARY_PERCENT']; else process.env['INTELLIGENCE_CANARY_PERCENT'] = before.percent
  }
}

const A_DEFINITION = 'A zero of a polynomial is a number that makes the polynomial equal zero when it is put in place of x.'
const A_DERIVATION = 'The sum of the zeros is -b/a, so for x^2 - 5x + 6 the sum is 5.'

describe('who is in the canary', () => {
  it('is stable for a student and proportional across students', () => {
    const ids = Array.from({ length: 2000 }, (_, i) => (i * 2654435761 >>> 0).toString(16).padStart(8, '0').repeat(4))
    for (const percent of [0, 10, 50, 100]) {
      const share = ids.filter((id) => inCanary(id, percent)).length / ids.length
      expect(Math.abs(share - percent / 100), `${percent}%: share ${share}`).toBeLessThan(0.06)
    }
    for (const id of ids.slice(0, 20)) expect(inCanary(id, 37)).toBe(inCanary(id, 37))
  })
})

describe('a canary student', () => {
  async function server(candidate: LearningIntelligence, log: string[] = []) {
    const store = sqliteMemoryStore(':memory:')
    const runs = shadowRuns(store)
    const handle = createHandler({ model: liveThatRefuses, search, identitySecret: SECRET, intelligence: { candidate, legacy: empty, log: (l) => { log.push(l) } }, shadowRuns: runs })
    const ask = (q: string) => handle({ method: 'POST', path: '/api/ask', body: { question: q, topicId: 'polynomials--zeros-of-a-polynomial', classId: '10' } })
    return { store, runs, ask }
  }

  it('is served the candidate s verified lesson through the same reply shape, and the live brain is never asked', async () => {
    const candidate = proposing(A_DEFINITION)
    const s = await server(candidate)
    try {
      const res = await inMode('canary', '100', () => s.ask('what is a zero of a polynomial'))
      expect(res.status).toBe(200)
      expect(res.body['canary']).toBe(true)
      expect((res.body['lesson'] as { blocks?: unknown[] })?.blocks?.length).toBeGreaterThan(0)
      expect(candidate.asked).toBe(1)
      await new Promise((r) => setTimeout(r, 20))
      expect(s.runs.list()[0]?.run?.served).toBe('candidate')
    } finally { s.store.close() }
  })

  it('out of the bucket, or in shadow mode, gets the live brain exactly as before', async () => {
    for (const [mode, percent] of [['canary', '0'], ['shadow', '100'], ['off', '100']] as const) {
      const candidate = proposing(A_DEFINITION)
      const s = await server(candidate)
      try {
        const res = await inMode(mode, percent, () => s.ask('what is a zero of a polynomial'))
        expect(res.status, `${mode} ${percent}`).toBe(502)
        expect(res.body['canary'], `${mode} ${percent}`).toBeUndefined()
      } finally { s.store.close() }
    }
  })

  it('an UNVERIFIED lesson is never served: a derivation with no critic falls back to the live brain inside the same request', async () => {
    const log: string[] = []
    const s = await server(proposing(A_DERIVATION), log)
    try {
      const res = await inMode('canary', '100', () => s.ask('what is the sum of the zeros'))
      expect(res.status).toBe(502)
      expect(log.some((l) => /\[canary\].*unverified|\[canary\].*not verified/i.test(l)), log.join('\n')).toBe(true)
    } finally { s.store.close() }
  })

  it('a candidate that throws or is late falls back inside the same request, with one log line', async () => {
    const log: string[] = []
    const throwing: LearningIntelligence = { name: 'c', propose: async () => { throw new Error('the reasoner fell over') } }
    const s = await server(throwing, log)
    try {
      const res = await inMode('canary', '100', () => s.ask('what is a zero of a polynomial'))
      expect(res.status).toBe(502)
      expect(log.filter((l) => /\[canary\].*fell over/.test(l))).toHaveLength(1)
    } finally { s.store.close() }
  })

  it('the server writes no artifact for a canary lesson: the client appends it, as it appends every lesson', async () => {
    const s = await server(proposing(A_DEFINITION))
    try {
      await inMode('canary', '100', () => s.ask('what is a zero of a polynomial'))
      expect(s.store.list('anything')).toEqual([])
    } finally { s.store.close() }
  })
})
