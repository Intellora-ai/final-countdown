/**
 * CANARY -- the first time the candidate reaches a student, and only her.
 *
 * WHO: a student is in or out by a hash of who she is, so she is in every
 * time or never, and the share is the percentage the owner set.
 *
 * WHAT: the candidate is asked FIRST, within a budget. Its proposal goes
 * through the canvas adapter -- the same gate the live path uses -- and is
 * served ONLY if the lesson is verified by its risk tier. Anything less
 * (refused, unverified, late, failed) and the live brain answers inside the
 * same request. The reply has the shape the client already understands, and
 * the client appends the lesson exactly as it appends every lesson: the
 * server writes nothing.
 *
 * Promotion is a person setting INTELLIGENCE_MODE and the percentage. Nothing
 * here changes either.
 */
import { toArtifact } from './canvasAdapter.ts'
import type { LearningIntelligence, Proposal, TeachingRequest } from './LearningIntelligence.ts'
import { verify, type Critic, type Risk } from './risk.ts'

export type Mode = 'off' | 'shadow' | 'canary' | 'primary'

export function modeFrom(env: Readonly<Record<string, string | undefined>>): { mode: Mode; percent: number } {
  const raw = env['INTELLIGENCE_MODE'] ?? 'off'
  const mode: Mode = raw === 'shadow' || raw === 'canary' || raw === 'primary' ? raw : 'off'
  const percent = Number(env['INTELLIGENCE_CANARY_PERCENT'] ?? '0')
  return { mode, percent: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0 }
}

/** Stable per student: the first 32 bits of her id, or a fold of it, against the percentage. */
export function inCanary(studentId: string, percent: number): boolean {
  if (percent <= 0) return false
  if (percent >= 100) return true
  const head = /^[0-9a-f]{8}/i.exec(studentId)?.[0]
  const bucket = head !== undefined ? parseInt(head, 16) % 100 : [...studentId].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 100, 0)
  return bucket < percent
}

/** The candidate takes the request when the mode says so and she is in. */
export function candidateTakes(env: Readonly<Record<string, string | undefined>>, studentId: string): boolean {
  const { mode, percent } = modeFrom(env)
  return mode === 'primary' || (mode === 'canary' && inCanary(studentId, percent))
}

export interface ServePorts {
  readonly candidate: LearningIntelligence
  readonly critic?: Critic
  readonly budgetMs: number
  readonly now: () => number
}

export type Served =
  | { readonly served: true; readonly body: Record<string, unknown>; readonly proposal: Proposal }
  | { readonly served: false; readonly because: string; readonly proposal?: Proposal }

export async function serveFromCandidate(request: TeachingRequest, ports: ServePorts): Promise<Served> {
  let proposal: Proposal
  try {
    proposal = await Promise.race([
      ports.candidate.propose(request),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`the candidate took longer than ${ports.budgetMs} ms`)), ports.budgetMs)),
    ])
  } catch (error: unknown) {
    return { served: false, because: error instanceof Error ? error.message : String(error) }
  }
  const reasons: string[] = []
  for (const action of proposal.actions) {
    const adapted = toArtifact(action, request)
    if (!adapted.ok) { reasons.push(`${action.kind} refused by the gate: ${adapted.issues.join('; ')}`); continue }
    if (action.kind === 'ask') {
      const question = adapted.artifact.payload as { question: string }
      return { served: true, body: { clarify: true, question: question.question, canary: true }, proposal }
    }
    const answer = action.payload?.['answer']
    if (action.kind !== 'explain' || typeof answer !== 'string') { reasons.push(`${action.kind} has no canvas form to serve`); continue }
    const checked = await verify({ answer, sources: action.evidence, declared: action.risk as Risk }, { classId: request.classId, ...(ports.critic === undefined ? {} : { critic: ports.critic }) })
    if (!checked.verified) {
      reasons.push(`explain not verified at risk ${checked.risk}: ${checked.verdicts.filter((v) => v.verdict !== 'sound').map((v) => `${v.check} ${v.verdict} (${v.because})`).join('; ')}`)
      continue
    }
    /* `route` is what tells the client to judge the lesson at the answer
       level, the level the adapter judged it at; without it the client's own
       gate would refuse a prose-only lesson on arrival. */
    return { served: true, body: { lesson: adapted.artifact.payload, route: 'candidate', teaching: adapted.artifact.teaching, sources: [], canary: true, verified: checked.verdicts }, proposal }
  }
  return { served: false, because: reasons.length > 0 ? reasons.join(' | ') : 'the candidate proposed nothing to serve', proposal }
}
