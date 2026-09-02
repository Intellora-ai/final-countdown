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

export interface ShadowPorts {
  readonly candidate: LearningIntelligence
  readonly legacy: LearningIntelligence
  /** Read at call time, so the switch can be flipped on a running server. */
  readonly mode: () => string
  readonly log: (line: string) => void
  readonly now: () => number
}

export type ShadowObserver = (request: TeachingRequest, live: Record<string, unknown>) => void

export function shadowObserver(ports: ShadowPorts): ShadowObserver {
  return (request, live) => {
    if (ports.mode() !== 'shadow') return
    const startedAt = ports.now()
    const liveDid = 'lesson' in live ? 'taught' : 'clarify' in live ? 'asked' : 'refused'
    void Promise.allSettled([ports.candidate.propose(request), ports.legacy.propose(request)])
      .then(([candidate, legacy]) => {
        const ms = ports.now() - startedAt
        ports.log(`[shadow] ${ms}ms live ${liveDid}; ${said('candidate', candidate, request)}; ${said('legacy', legacy, request)}`)
      })
      .catch((error: unknown) => {
        ports.log(`[shadow] could not record: ${error instanceof Error ? error.message : String(error)}`)
      })
  }
}

function said(name: string, outcome: PromiseSettledResult<Proposal>, request: TeachingRequest): string {
  if (outcome.status === 'rejected') {
    const reason: unknown = outcome.reason
    return `${name} failed: ${reason instanceof Error ? reason.message : String(reason)}`
  }
  /* THE SYSTEM VALIDATES. A proposal is only a proposal if every action fits
     the IR; one that does not is recorded as malformed, in the IR's own words,
     and never counted as something the intelligence said. */
  const misfit = outcome.value.actions.map((a) => learningAction.safeParse(a)).find((r) => !r.success)
  if (misfit !== undefined && !misfit.success) {
    return `${name} malformed: ${misfit.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(', ')}`
  }
  /* DRY RUN through the canvas adapter: what the canvas would have been
     handed, or the gate's own reason it would not. Nothing is written. */
  const kinds = outcome.value.actions
    .map((a) => {
      const adapted = toArtifact(a, request)
      return adapted.ok ? `${a.kind}→${adapted.artifact.kind}` : `${a.kind}→refused(${adapted.issues.join('; ')})`
    })
    .join('+')
  return `${name} ${kinds.length > 0 ? kinds : 'nothing'} (${outcome.value.unknowns.length} unknown, ${outcome.value.cost.modelCalls} model calls)`
}
