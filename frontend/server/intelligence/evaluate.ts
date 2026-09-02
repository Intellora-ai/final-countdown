/**
 * THE EVALUATION -- what the recorded runs say about the candidate beside
 * the live brain, in counts a person can check. It decides nothing:
 * promotion is a person flipping a switch, and the report says so on every
 * reply. A hard floor is stated with the measurement behind it, or as
 * unmeasured -- an unknown is never a pass. It carries no student's words.
 *
 * THE HOLDOUT is the first HOLDOUT_SIZE runs, frozen: whatever is tuned
 * later is tuned on the rest and checked against these.
 */
import { median } from './cost.ts'
import type { ListedRun, Outcome, ShadowRun } from './runs.ts'

export const HOLDOUT_SIZE = 200

export interface BrainCounts {
  readonly proposed: number
  readonly adapterAccepted: number
  readonly failed: number
  readonly skipped: number
  /** Of the proposals, the share that carried at least one Unknown. */
  readonly unknownRate: number
}

export interface Slice {
  readonly runs: number
  readonly unreadable: number
  readonly live: { readonly taught: number; readonly asked: number; readonly refused: number }
  readonly candidate: BrainCounts
  readonly legacy: BrainCounts
  /** Runs per sufficiency path; 'unrecorded' for runs from before the gate existed. */
  readonly sufficiency: Readonly<Record<string, number>>
  /** Where both brains proposed: how often their first action was the same kind. */
  readonly agreement: { readonly decisions: number; readonly agreed: number }
  readonly latencyMs: { readonly candidate: number | null; readonly legacy: number | null }
}

export interface Floors {
  /** Floor 2: the candidate's artifacts pass the canvas gate at least as often as the live brain teaches -- and at least once. */
  readonly gatePassRate: { readonly candidate: number; readonly live: number; readonly holds: boolean | 'unmeasured' }
  /** Floor 4: the candidate's p95 proposal time is within the live decision's (the legacy wrapper IS that decision). */
  readonly latencyP95: { readonly candidate: number | null; readonly legacy: number | null; readonly holds: boolean | 'unmeasured' }
  /** Floor 3: every accepted risk-1/2 artifact is verified -- a claim check or a critic said sound, nothing could-not-check. Unmeasured until one such artifact was recorded. */
  readonly fabricatedFacts: { readonly holds: boolean | 'unmeasured'; readonly measured: number; readonly verified: number }
  /** Floors F1-F5 and the gibberish laws live in the test suite, not in runs. */
  readonly durability: { readonly holds: 'see the laws suite' }
}

export interface Report extends Slice {
  readonly holdout: Slice
  readonly recent: Slice
  readonly floors: Floors
  readonly promotion: 'never automatic'
}

function brainCounts(runs: readonly ShadowRun[], brain: 'candidate' | 'legacy'): BrainCounts {
  let proposed = 0
  let adapterAccepted = 0
  let failed = 0
  let skipped = 0
  let withUnknowns = 0
  for (const run of runs) {
    const o: Outcome = run[brain]
    if (o.ok === 'skipped') skipped += 1
    else if (o.ok === false) failed += 1
    else {
      proposed += 1
      if (o.adapted.some((a) => a.ok)) adapterAccepted += 1
      if (o.proposal.unknowns.length > 0) withUnknowns += 1
    }
  }
  return { proposed, adapterAccepted, failed, skipped, unknownRate: proposed === 0 ? 0 : withUnknowns / proposed }
}

function msOf(runs: readonly ShadowRun[], brain: 'candidate' | 'legacy'): number[] {
  return runs.flatMap((r) => { const o = r[brain]; return o.ok === true ? [o.proposal.cost.ms] : [] })
}

function p95(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(0.95 * sorted.length) - 1)] ?? null
}

function slice(listed: readonly ListedRun[]): Slice {
  const runs = listed.flatMap((l) => (l.run === undefined ? [] : [l.run]))
  const live = { taught: 0, asked: 0, refused: 0 }
  for (const r of runs) {
    if (r.live.did === 'taught') live.taught += 1
    else if (r.live.did === 'asked') live.asked += 1
    else live.refused += 1
  }
  const sufficiency: Record<string, number> = {}
  for (const r of runs) {
    const key = r.gate === undefined ? 'unrecorded' : String(r.gate.path)
    sufficiency[key] = (sufficiency[key] ?? 0) + 1
  }
  let decisions = 0
  let agreed = 0
  for (const r of runs) {
    if (r.candidate.ok !== true || r.legacy.ok !== true) continue
    const a = r.candidate.proposal.actions[0]?.kind
    const b = r.legacy.proposal.actions[0]?.kind
    if (a === undefined || b === undefined) continue
    decisions += 1
    if (a === b) agreed += 1
  }
  const cms = msOf(runs, 'candidate')
  const lms = msOf(runs, 'legacy')
  return {
    runs: listed.length,
    unreadable: listed.length - runs.length,
    live,
    candidate: brainCounts(runs, 'candidate'),
    legacy: brainCounts(runs, 'legacy'),
    sufficiency,
    agreement: { decisions, agreed },
    latencyMs: { candidate: cms.length === 0 ? null : median(cms), legacy: lms.length === 0 ? null : median(lms) },
  }
}

export function evaluateRuns(listed: readonly ListedRun[]): Report {
  const all = slice(listed)
  const holdout = slice(listed.filter((l) => l.seq <= HOLDOUT_SIZE))
  const recent = slice(listed.filter((l) => l.seq > HOLDOUT_SIZE))
  const runs = listed.flatMap((l) => (l.run === undefined ? [] : [l.run]))

  const attempts = all.live.taught + all.live.refused
  const liveRate = attempts === 0 ? 0 : all.live.taught / attempts
  const candidateTried = all.candidate.proposed + all.candidate.failed
  const candidateRate = candidateTried === 0 ? 0 : all.candidate.adapterAccepted / candidateTried
  const gatePassRate = {
    candidate: candidateRate,
    live: liveRate,
    /* A floor cannot be held by never being tested: the candidate must have
       passed at least once, and at least as often as live taught. */
    holds: candidateTried === 0 && attempts === 0 ? ('unmeasured' as const) : all.candidate.adapterAccepted > 0 && candidateRate >= liveRate,
  }
  const c95 = p95(msOf(runs, 'candidate'))
  const l95 = p95(msOf(runs, 'legacy'))
  const latencyP95 = { candidate: c95, legacy: l95, holds: c95 === null || l95 === null ? ('unmeasured' as const) : c95 <= l95 }

  let measured = 0
  let verifiedCount = 0
  for (const r of runs) {
    if (r.candidate.ok !== true) continue
    for (const a of r.candidate.adapted) {
      if (!a.ok || a.risk === undefined || a.risk < 1) continue
      measured += 1
      if (a.verified === true) verifiedCount += 1
    }
  }
  const fabricatedFacts = { holds: measured === 0 ? ('unmeasured' as const) : verifiedCount === measured, measured, verified: verifiedCount }

  return {
    ...all,
    holdout,
    recent,
    floors: { gatePassRate, latencyP95, fabricatedFacts, durability: { holds: 'see the laws suite' } },
    promotion: 'never automatic',
  }
}
