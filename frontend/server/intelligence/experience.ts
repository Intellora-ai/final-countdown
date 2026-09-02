/**
 * EXPERIENCE -- what followed each piece of teaching, from the evidence
 * store alone: what she typed after it, as what it observably was. Never a
 * mark, never a score. An artifact nothing followed is 'unknown', never a
 * success. Derived every time from the evidence; nothing here is stored.
 *
 * This is the "learn" stage the brief ends on. In shadow it is READ: the
 * candidate and the reasoner are told what followed earlier teaching on the
 * topic, and the run records it. In canary the same derivation will judge
 * the candidate's own artifacts, by their seq, the same way.
 */
import type { Evidence } from '../memory/evidence.ts'

export type Followed = 'pleaded' | 'answered' | 'asked' | 'silent' | 'unknown'

export interface ArtifactExperience {
  readonly seq: number
  readonly pleas: number
  readonly answers: number
  readonly questions: number
  readonly empties: number
  /** Teaching moves already spent on this artifact, in order, once each. */
  readonly movesSpent: readonly string[]
  readonly outcome: Followed
}

export interface Experience {
  readonly artifacts: readonly ArtifactExperience[]
  /** Evidence that named no artifact. Counted, never dropped. */
  readonly unplaced: number
}

export function experienceOf(evidence: readonly Evidence[], knownSeqs: readonly number[] = []): Experience {
  const bySeq = new Map<number, { pleas: number; answers: number; questions: number; empties: number; moves: string[] }>()
  const fresh = () => ({ pleas: 0, answers: 0, questions: 0, empties: 0, moves: [] as string[] })
  for (const seq of knownSeqs) if (!bySeq.has(seq)) bySeq.set(seq, fresh())
  let unplaced = 0
  for (const e of [...evidence].sort((a, b) => a.at.localeCompare(b.at))) {
    if (e.artifactSeq === undefined) { unplaced += 1; continue }
    const tally = bySeq.get(e.artifactSeq) ?? fresh()
    bySeq.set(e.artifactSeq, tally)
    if (e.kind === 'plea') tally.pleas += 1
    else if (e.kind === 'answer') tally.answers += 1
    else if (e.kind === 'question') tally.questions += 1
    else tally.empties += 1
    if (e.strategy !== undefined && !tally.moves.includes(e.strategy)) tally.moves.push(e.strategy)
  }
  const artifacts = [...bySeq.entries()]
    .sort(([a], [b]) => a - b)
    .map(([seq, t]) => ({
      seq,
      pleas: t.pleas,
      answers: t.answers,
      questions: t.questions,
      empties: t.empties,
      movesSpent: t.moves,
      /* A plea is the signal, whatever else was said. */
      outcome: (t.pleas > 0 ? 'pleaded' : t.answers > 0 ? 'answered' : t.questions > 0 ? 'asked' : t.empties > 0 ? 'silent' : 'unknown') as Followed,
    }))
  return { artifacts, unplaced }
}
