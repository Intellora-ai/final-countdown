import { describe, expect, it } from 'vitest'

import { evaluateRuns, HOLDOUT_SIZE } from './evaluate.ts'
import type { ListedRun, ShadowRun } from './runs.ts'
import liveRun1 from './__fixtures__/live-run-1.json'
import liveRun2 from './__fixtures__/live-run-2.json'

/**
 * THE EVALUATION reads the runs and says, in numbers a person can check,
 * how the candidate did beside the live brain. It never decides promotion:
 * that is a person flipping a switch. Its hard floors are stated with the
 * measurement that backs them, or as UNMEASURED -- an unknown is never a
 * pass. The holdout is the first HOLDOUT_SIZE runs, frozen: anything tuned
 * later is tuned on the rest and checked against these.
 */

const r1 = liveRun1 as ShadowRun
const r2 = liveRun2 as ShadowRun
const real: ListedRun[] = [{ seq: 1, at: r1.at, run: r1 }, { seq: 2, at: r2.at, run: r2 }]

function variant(seq: number, change: Partial<ShadowRun>): ListedRun {
  return { seq, at: r2.at, run: { ...r2, ...change } }
}

describe('the evaluation', () => {
  it('counts what the real runs show: live refused, the candidate proposed and the adapter refused, the legacy agreed with live', () => {
    const report = evaluateRuns(real)
    expect(report.runs).toBe(2)
    expect(report.live).toEqual({ taught: 0, asked: 0, refused: 2 })
    expect(report.candidate.proposed).toBe(2)
    expect(report.candidate.adapterAccepted).toBe(0)
    expect(report.candidate.failed).toBe(0)
    expect(report.candidate.skipped).toBe(0)
    expect(report.candidate.unknownRate).toBeCloseTo(1, 5)
    expect(report.legacy.proposed).toBe(2)
    /* Derived from the fixtures themselves: a run from before the gate (M3)
       is 'unrecorded', a later one is its path. */
    const expected: Record<string, number> = {}
    for (const r of [r1, r2]) { const k = r.gate === undefined ? 'unrecorded' : String(r.gate.path); expected[k] = (expected[k] ?? 0) + 1 }
    expect(report.sufficiency).toEqual(expected)
  })

  it('splits the holdout from the rest at HOLDOUT_SIZE, and the holdout is never the rest', () => {
    const many: ListedRun[] = Array.from({ length: HOLDOUT_SIZE + 3 }, (_, i) => variant(i + 1, {}))
    const report = evaluateRuns(many)
    expect(report.holdout.runs).toBe(HOLDOUT_SIZE)
    expect(report.recent.runs).toBe(3)
    expect(report.holdout.runs + report.recent.runs).toBe(report.runs)
  })

  it('states each hard floor with its measurement, and an unmeasured floor is never a pass', () => {
    const report = evaluateRuns(real)
    expect(report.floors.gatePassRate.holds).toBe(false)
    expect(report.floors.gatePassRate.candidate).toBe(0)
    expect(report.floors.fabricatedFacts.holds).toBe('unmeasured')
    expect(report.floors.fabricatedFacts.measured).toBe(0)
    expect(report.floors.durability.holds).toBe('see the laws suite')
    expect(typeof report.floors.latencyP95.candidate).toBe('number')
    expect(typeof report.floors.latencyP95.legacy).toBe('number')
    expect(report.promotion).toBe('never automatic')
  })

  it('the fabricated-facts floor is measured from verdicts: unmeasured with none, false on any unverified risk-1/2 artifact, true only when every one is verified', () => {
    expect(evaluateRuns(real).floors.fabricatedFacts).toEqual({ holds: 'unmeasured', measured: 0, verified: 0 })
    const withVerdicts = (verified: boolean): ListedRun => variant(9, { candidate: r2.candidate.ok === true ? { ...r2.candidate, adapted: [{ kind: 'explain', ok: true, artifact: 'lesson', risk: 2, verified, verdicts: [{ check: 'critic', verdict: verified ? 'sound' : 'could-not-check', because: 'x' }] }] } : r2.candidate })
    expect(evaluateRuns([withVerdicts(true)]).floors.fabricatedFacts).toEqual({ holds: true, measured: 1, verified: 1 })
    expect(evaluateRuns([withVerdicts(true), withVerdicts(false)]).floors.fabricatedFacts).toEqual({ holds: false, measured: 2, verified: 1 })
  })

  it('a candidate that the adapter accepted more often than live taught passes the gate floor, and no more than that', () => {
    const accepted = variant(3, { live: { did: 'refused', status: 502 }, candidate: r2.candidate.ok === true ? { ...r2.candidate, adapted: [{ kind: 'explain', ok: true, artifact: 'lesson' }] } : r2.candidate })
    const report = evaluateRuns([...real, accepted])
    expect(report.candidate.adapterAccepted).toBe(1)
    expect(report.floors.gatePassRate.candidate).toBeCloseTo(1 / 3, 5)
    expect(report.floors.gatePassRate.live).toBe(0)
    expect(report.floors.gatePassRate.holds).toBe(true)
  })

  it('unreadable, skipped and failed runs are counted as what they are, never folded into a rate', () => {
    const runs: ListedRun[] = [
      { seq: 1, at: 'x', unreadable: 'not json' },
      variant(2, { candidate: { ok: 'skipped', because: 'code sufficed' }, legacy: { ok: 'skipped', because: 'code sufficed' }, gate: { path: 0, because: 'small talk' } }),
      variant(3, { candidate: { ok: false, failed: 'the reasoner fell over' }, gate: { path: 5, because: 'fresh' } }),
    ]
    const report = evaluateRuns(runs)
    expect(report.unreadable).toBe(1)
    expect(report.candidate.skipped).toBe(1)
    expect(report.candidate.failed).toBe(1)
    expect(report.candidate.proposed).toBe(0)
    expect(report.sufficiency).toEqual({ '0': 1, '5': 1 })
  })

  it('carries no student s words: only counts and numbers', () => {
    const text = JSON.stringify(evaluateRuns(real))
    expect(text).not.toContain(r2.request.question)
    expect(text).not.toContain(r2.request.studentId)
  })
})
