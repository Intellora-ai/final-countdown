import { describe, expect, it } from 'vitest'

import { createHandler, type ModelPort, type SearchPort } from '../handler.ts'
import { sqliteMemoryStore } from '../memory/sqliteStore.ts'
import { shadowRuns, type ShadowRun } from './runs.ts'
import liveRun2 from './__fixtures__/live-run-2.json'

/**
 * THE REPORT ROUTE. It exists only while the shadow is on -- off, it is not
 * a route at all -- and what it returns is the evaluation: counts, never a
 * student's words.
 */

const model: ModelPort = { lesson: async () => { throw new Error('no') } }
const search: SearchPort = { search: async () => [] }

async function inMode<T>(mode: string | undefined, run: () => Promise<T>): Promise<T> {
  const before = process.env['INTELLIGENCE_MODE']
  if (mode === undefined) delete process.env['INTELLIGENCE_MODE']; else process.env['INTELLIGENCE_MODE'] = mode
  try { return await run() } finally { if (before === undefined) delete process.env['INTELLIGENCE_MODE']; else process.env['INTELLIGENCE_MODE'] = before }
}

describe('GET /api/intelligence/report', () => {
  it('is not a route while the shadow is off', async () => {
    const store = sqliteMemoryStore(':memory:')
    try {
      const handle = createHandler({ model, search, identitySecret: 'report-test-secret-not-real', shadowRuns: shadowRuns(store) })
      for (const mode of [undefined, 'off']) {
        const res = await inMode(mode, () => handle({ method: 'GET', path: '/api/intelligence/report' }))
        expect(res.status, String(mode)).toBe(404)
      }
    } finally { store.close() }
  })

  it('reports the runs while the shadow is on, and carries no student s words', async () => {
    const store = sqliteMemoryStore(':memory:')
    try {
      const runs = shadowRuns(store)
      runs.record(liveRun2 as ShadowRun)
      runs.record(liveRun2 as ShadowRun)
      const handle = createHandler({ model, search, identitySecret: 'report-test-secret-not-real', shadowRuns: runs })
      const res = await inMode('shadow', () => handle({ method: 'GET', path: '/api/intelligence/report' }))
      expect(res.status).toBe(200)
      expect(res.body['runs']).toBe(2)
      expect(res.body['promotion']).toBe('never automatic')
      const text = JSON.stringify(res.body)
      expect(text).not.toContain((liveRun2 as ShadowRun).request.question)
      expect(text).not.toContain((liveRun2 as ShadowRun).request.studentId)
      const posted = await inMode('shadow', () => handle({ method: 'POST', path: '/api/intelligence/report', body: {} }))
      expect(posted.status).toBe(405)
    } finally { store.close() }
  })
})
