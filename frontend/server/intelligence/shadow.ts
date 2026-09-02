/**
 * THE SHADOW BRIDGE -- the one call the live path makes, after its reply is
 * already formed, and the whole reason the candidate can run beside a real
 * student without her ever knowing.
 *
 * Three promises, each a test:
 *   OFF MEANS OFF   -- with the mode off, neither brain is even asked.
 *   NEVER WAITS     -- the observer returns before either brain has answered;
 *                      there is no promise for a caller to be tempted to await.
 *   NEVER SURFACES  -- a brain that throws, hangs or lies becomes one log line.
 *
 * What it records today is one line. M6 gives it a table of its own.
 */
import { toArtifact } from './canvasAdapter.ts'
import { learningAction } from './ir.ts'
import type { LearningIntelligence, Proposal, TeachingRequest } from './LearningIntelligence.ts'
import type { AdaptedInRun, Outcome, ShadowRun } from './runs.ts'
import { codeSuffices, type SufficiencyVerdict } from './sufficiency.ts'

export interface ShadowPorts {
  readonly candidate: LearningIntelligence
  readonly legacy: LearningIntelligence
  /** Read at call time, so the switch can be flipped on a running server. */
  readonly mode: () => string
  readonly log: (line: string) => void
  readonly now: () => number
  /** Where a run is kept. Absent, the log line is all there is. */
  readonly record?: (run: ShadowRun) => void
  /** The sufficiency gate. Absent, nothing is assumed and both brains are asked. */
  readonly sufficiency?: (request: TeachingRequest) => SufficiencyVerdict
}

export type ShadowObserver = (request: TeachingRequest, live: { readonly status: number; readonly body: Record<string, unknown> }) => void

export function shadowObserver(ports: ShadowPorts): ShadowObserver {
  return (request, live) => {
    if (ports.mode() !== 'shadow') return
    const startedAt = ports.now()
    const liveDid = 'lesson' in live.body ? 'taught' : 'clarify' in live.body ? 'asked' : 'refused'
    const gate: SufficiencyVerdict = ports.sufficiency?.(request) ?? { path: 5, because: 'no gate was given, so nothing is assumed' }
    if (codeSuffices(gate)) {
      /* CODE DECIDED. No brain is asked; the run records that this request
         needed none, which is a fact about the product worth counting. */
      const skipped: Outcome = { ok: 'skipped', because: gate.because }
      const run: ShadowRun = { at: new Date(startedAt).toISOString(), request, gate, live: { did: liveDid, status: live.status }, candidate: skipped, legacy: skipped, ms: ports.now() - startedAt }
      ports.log(`[shadow] code sufficed (path ${gate.path}): ${gate.because}; live ${liveDid}`)
      try {
        ports.record?.(run)
      } catch (error: unknown) {
        ports.log(`[shadow] could not record: ${error instanceof Error ? error.message : String(error)}`)
      }
      return
    }
    void Promise.allSettled([ports.candidate.propose(request), ports.legacy.propose(request)])
      .then(([candidate, legacy]) => {
        const ms = ports.now() - startedAt
        const run: ShadowRun = {
          at: new Date(startedAt).toISOString(),
          request,
          gate,
          live: { did: liveDid, status: live.status },
          candidate: outcomeOf(candidate, request),
          legacy: outcomeOf(legacy, request),
          ms,
        }
        ports.log(`[shadow] ${ms}ms live ${liveDid}; ${said('candidate', run.candidate)}; ${said('legacy', run.legacy)}`)
        ports.record?.(run)
      })
      .catch((error: unknown) => {
        ports.log(`[shadow] could not record: ${error instanceof Error ? error.message : String(error)}`)
      })
  }
}

function outcomeOf(settled: PromiseSettledResult<Proposal>, request: TeachingRequest): Outcome {
  if (settled.status === 'rejected') {
    const reason: unknown = settled.reason
    return { ok: false, failed: reason instanceof Error ? reason.message : String(reason) }
  }
  /* THE SYSTEM VALIDATES. A proposal is only a proposal if every action fits
     the IR; one that does not is recorded as malformed, in the IR's own words,
     and never counted as something the intelligence said. */
  const misfit = settled.value.actions.map((a) => learningAction.safeParse(a)).find((r) => !r.success)
  if (misfit !== undefined && !misfit.success) {
    return { ok: false, failed: `malformed: ${misfit.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(', ')}` }
  }
  /* DRY RUN through the canvas adapter: what the canvas would have been
     handed, or the gate's own reason it would not. Nothing is written. */
  const adapted: AdaptedInRun[] = settled.value.actions.map((a) => {
    const at = toArtifact(a, request)
    return at.ok ? { kind: a.kind, ok: true, artifact: at.artifact.kind } : { kind: a.kind, ok: false, issues: at.issues }
  })
  return { ok: true, proposal: settled.value, adapted }
}

function said(name: string, outcome: Outcome): string {
  if (outcome.ok === 'skipped') return `${name} skipped: ${outcome.because}`
  if (!outcome.ok) return `${name} ${outcome.failed.startsWith('malformed') ? outcome.failed : `failed: ${outcome.failed}`}`
  const kinds = outcome.adapted.map((a) => (a.ok ? `${a.kind}→${a.artifact ?? '?'}` : `${a.kind}→refused(${(a.issues ?? []).join('; ')})`)).join('+')
  return `${name} ${kinds.length > 0 ? kinds : 'nothing'} (${outcome.proposal.unknowns.length} unknown, ${outcome.proposal.cost.modelCalls} model calls)`
}
