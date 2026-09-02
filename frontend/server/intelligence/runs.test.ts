import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { sqliteMemoryStore } from '../memory/sqliteStore.ts'
import { shadowRuns, type ShadowRun } from './runs.ts'

/**
 * SHADOW RUNS ARE A RECORD, NOT A LOG LINE. One row per observed request, in a
 * table of their own, append-only like the canvas, and they survive the
 * process that wrote them -- the exact promise the canvas table broke on
 * 2026-09-03, so it is proven here through a real file and a reopen.
 */

let scratch = ''
afterEach(() => { if (scratch !== '') rmSync(scratch, { recursive: true, force: true }) })

function aRun(n: number): ShadowRun {
  return {
    at: `2026-09-03T00:00:0${n}.000Z`,
    request: { question: `question ${n}`, topicId: null, classId: '10', examId: null, alreadyUsed: [], askedFrom: 'ask', studentId: 's' },
    live: { did: 'refused', status: 502 },
    candidate: { ok: true, proposal: { actions: [], unknowns: [], rationale: 'r', capabilities: { selected: [], rejected: [] }, cost: { ms: 1, modelCalls: 0 }, trace: {} }, adapted: [] },
    legacy: { ok: false, failed: 'no chooser' },
    ms: 12,
  }
}

describe('shadow runs', () => {
  it('are numbered in the order they happened and read back whole', () => {
    scratch = mkdtempSync(join(tmpdir(), 'shadow-runs-'))
    const store = sqliteMemoryStore(join(scratch, 'm.db'))
    try {
      const runs = shadowRuns(store)
      expect(runs.record(aRun(1))).toBe(1)
      expect(runs.record(aRun(2))).toBe(2)
      const listed = runs.list()
      expect(listed.map((r) => r.seq)).toEqual([1, 2])
      expect(listed[1]?.run).toEqual(aRun(2))
      expect(runs.list(1).map((r) => r.seq)).toEqual([2])
    } finally {
      store.close()
    }
  })

  it('survive the process that wrote them', () => {
    scratch = mkdtempSync(join(tmpdir(), 'shadow-runs-'))
    const path = join(scratch, 'm.db')
    const first = sqliteMemoryStore(path)
    shadowRuns(first).record(aRun(1))
    first.close()
    const second = sqliteMemoryStore(path)
    try {
      expect(shadowRuns(second).list().map((r) => r.run?.request.question)).toEqual(['question 1'])
    } finally {
      second.close()
    }
  })

  it('a row that is not a run any more is reported as unreadable, never dropped and never guessed', () => {
    scratch = mkdtempSync(join(tmpdir(), 'shadow-runs-'))
    const store = sqliteMemoryStore(join(scratch, 'm.db'))
    try {
      store.recordShadowRun('{not json', '2026-09-03T00:00:00.000Z')
      const listed = shadowRuns(store).list()
      expect(listed).toHaveLength(1)
      expect(listed[0]?.run).toBeUndefined()
      expect(listed[0]?.unreadable).toBeTruthy()
    } finally {
      store.close()
    }
  })
})
