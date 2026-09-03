import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { classifyRisk } from './risk.mjs'

/**
 * AG5 -- THE RISK ROUTER keeps the gate fast: a typo must not trigger a
 * semantic investigation, while a change to a decision's identity site must.
 * The interface is {tier, reason, affected_decisions} so the gate can run the
 * full attack only where it can pay off.
 */

const POLICY = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../assurance/policies/risk.json', import.meta.url)), 'utf8'),
)

describe('AG5 -- classifyRisk', () => {
  it('a change to the shelf identity site is HIGH and names shelf_lookup', () => {
    const r = classifyRisk(['server/memory/lessons.ts'], POLICY)
    expect(r.tier).toBe('HIGH')
    expect(r.affected_decisions).toContain('shelf_lookup')
    expect(r.reason).toMatch(/lessons\.ts/)
  })

  it('a change under server/memory (not an identity site) is at least MEDIUM', () => {
    const r = classifyRisk(['server/memory/misconceptions.ts'], POLICY)
    expect(['MEDIUM', 'HIGH']).toContain(r.tier)
  })

  it('a docs/readme-only change is LOW with no affected decisions', () => {
    const r = classifyRisk(['README.md', 'docs/notes.md'], POLICY)
    expect(r.tier).toBe('LOW')
    expect(r.affected_decisions).toEqual([])
  })

  it('a high-risk keyword in a path (e.g. a new cache module) is HIGH even without a decision', () => {
    const r = classifyRisk(['src/canvas/render/tileCache.ts'], POLICY)
    expect(r.tier).toBe('HIGH')
  })

  it('an empty diff is LOW', () => {
    expect(classifyRisk([], POLICY).tier).toBe('LOW')
  })
})
