import { describe, expect, it } from 'vitest'

import { costsFrom, median } from './cost.ts'
import { capabilityRegistry, type Has } from './registry.ts'
import type { ListedRun, ShadowRun } from './runs.ts'
import liveRun1 from './__fixtures__/live-run-1.json'
import liveRun2 from './__fixtures__/live-run-2.json'

/**
 * COST IS MEASURED, NEVER WRITTEN. A contract's cost is 'unknown' until a
 * recorded run measured it; after that it is the median of what was
 * measured, so one slow run does not become the price. The two fixtures are
 * the first two live shadow runs, verbatim.
 */

const EVERYTHING: Has = { model: 'chat-and-decide', search: true, aliases: true, lessons: true, evidence: true, misconceptions: true, concepts: true, verifiedTopics: 3 }
const real: ListedRun[] = [
  { seq: 1, at: (liveRun1 as ShadowRun).at, run: liveRun1 as ShadowRun },
  { seq: 2, at: (liveRun2 as ShadowRun).at, run: liveRun2 as ShadowRun },
]

function costOf(run: ShadowRun, brain: 'candidate' | 'legacy'): { ms: number; modelCalls: number } {
  const outcome = run[brain]
  if (outcome.ok !== true) throw new Error(`${brain} did not propose in this fixture`)
  return outcome.proposal.cost
}

describe('measured cost', () => {
  it('measures exactly the brains the runs ran, and nothing else', () => {
    const costs = costsFrom(real)
    const candidate = costs.get('candidate-agent')
    expect(candidate).toEqual({
      ms: median(real.map((r) => costOf(r.run as ShadowRun, 'candidate').ms)),
      modelCalls: median(real.map((r) => costOf(r.run as ShadowRun, 'candidate').modelCalls)),
      samples: 2,
    })
    expect(costs.get('legacy-decision')?.samples).toBe(2)
    expect(costs.has('diagnose'), 'a capability no run executed was given a cost').toBe(false)
  })

  it('a run that is unreadable, a brain that failed, and a brain that was skipped contribute no sample', () => {
    const skipped: ShadowRun = { ...(liveRun2 as ShadowRun), candidate: { ok: 'skipped', because: 'code sufficed' }, legacy: { ok: false, failed: 'no chooser' } }
    const costs = costsFrom([{ seq: 1, at: 'x', unreadable: 'not json' }, { seq: 2, at: 'x', run: skipped }])
    expect(costs.size).toBe(0)
  })

  it('is the median, so one slow run does not become the price', () => {
    expect(median([2269, 7672, 100000])).toBe(7672)
    expect(median([7672, 2269])).toBe(2269)
    expect(median([5])).toBe(5)
  })

  it('the registry says unknown until measured, then the measurement, and never a number written by hand', () => {
    const unmeasured = capabilityRegistry(EVERYTHING).get('candidate-agent')
    expect(unmeasured?.cost).toBe('unknown')
    const measured = capabilityRegistry(EVERYTHING, () => costsFrom(real)).get('candidate-agent')
    expect(measured?.cost).toEqual(costsFrom(real).get('candidate-agent'))

    const sources = import.meta.glob('./registry.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const text = Object.values(sources)[0] ?? ''
    expect(text.length).toBeGreaterThan(0)
    expect(text, 'a cost number is written into a contract').not.toMatch(/cost:\s*\{[^}]*\d/)
  })
})
