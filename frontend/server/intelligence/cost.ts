/**
 * COST, MEASURED. A contract's cost is what recorded shadow runs measured
 * for it -- the median, so one slow run does not become the price -- and
 * 'unknown' until a run measured it. Nothing here is written by hand.
 *
 * What the runs measure today: the two brains, each with its own proposal
 * cost. The reasoner's call is counted inside the candidate's `modelCalls`
 * and its milliseconds are not yet timed on their own, so `reason` stays
 * unmeasured until they are. Every other contract is not executed in shadow
 * at all, and says unknown honestly.
 */
import type { Cost } from './LearningIntelligence.ts'
import type { ListedRun } from './runs.ts'

export interface MeasuredCost extends Cost {
  readonly samples: number
}

/** The middle value; for an even count the lower middle, so it is always a value that was measured. */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = sorted[Math.floor((sorted.length - 1) / 2)]
  if (middle === undefined) throw new Error('median of nothing')
  return middle
}

const BRAIN_OF = { candidate: 'candidate-agent', legacy: 'legacy-decision' } as const

export function costsFrom(runs: readonly ListedRun[]): ReadonlyMap<string, MeasuredCost> {
  const samples = new Map<string, Cost[]>()
  for (const listed of runs) {
    const run = listed.run
    if (run === undefined) continue
    for (const brain of ['candidate', 'legacy'] as const) {
      const outcome = run[brain]
      if (outcome.ok !== true) continue
      const name = BRAIN_OF[brain]
      samples.set(name, [...(samples.get(name) ?? []), outcome.proposal.cost])
    }
  }
  const measured = new Map<string, MeasuredCost>()
  for (const [name, costs] of samples) {
    measured.set(name, { ms: median(costs.map((c) => c.ms)), modelCalls: median(costs.map((c) => c.modelCalls)), samples: costs.length })
  }
  return measured
}
