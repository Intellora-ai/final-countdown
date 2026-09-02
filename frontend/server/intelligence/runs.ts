/**
 * SHADOW RUNS -- one row per observed request, in a table of their own.
 *
 * Append-only like the canvas: INSERT and SELECT, nothing that rewrites a
 * run. A row that no longer parses is reported as unreadable, in its place,
 * never dropped and never guessed at -- the same rule the canvas keeps for a
 * lesson it cannot draw. This is what M7's evaluation reads.
 */
import { z } from 'zod'

import type { MemoryStore } from '../memory/sqliteStore.ts'
import { learningAction } from './ir.ts'
import type { Proposal, TeachingRequest } from './LearningIntelligence.ts'
import type { Checked, Risk } from './risk.ts'
import type { SufficiencyVerdict } from './sufficiency.ts'

/** What became of one learning action at the canvas adapter, in dry mode. */
export interface AdaptedInRun {
  readonly kind: string
  readonly ok: boolean
  readonly artifact?: string
  readonly issues?: readonly string[]
  /** M9: the tier read from the content, the checks made, and whether every one said sound. Absent on runs before M9. */
  readonly risk?: Risk
  readonly verdicts?: readonly Checked[]
  readonly verified?: boolean
}

export type Outcome =
  | { readonly ok: true; readonly proposal: Proposal; readonly adapted: readonly AdaptedInRun[] }
  | { readonly ok: false; readonly failed: string }
  /** Not asked, because the gate said code sufficed. Not a failure. */
  | { readonly ok: 'skipped'; readonly because: string }

export interface ShadowRun {
  readonly at: string
  readonly request: TeachingRequest
  /** What the sufficiency gate said before any brain was asked. Absent on runs recorded before the gate existed (M3). */
  readonly gate?: SufficiencyVerdict
  readonly live: { readonly did: string; readonly status: number }
  readonly candidate: Outcome
  readonly legacy: Outcome
  readonly ms: number
}

const proposalShape = z.object({
  actions: z.array(learningAction),
  unknowns: z.array(z.object({ what: z.string(), because: z.string(), blocking: z.boolean() })),
  rationale: z.string(),
  capabilities: z.object({ selected: z.array(z.string()), rejected: z.array(z.object({ capability: z.string(), why: z.string() })) }),
  cost: z.object({ ms: z.number(), modelCalls: z.number() }),
  trace: z.unknown(),
})
const outcomeShape = z.union([
  z.object({ ok: z.literal(true), proposal: proposalShape, adapted: z.array(z.object({ kind: z.string(), ok: z.boolean(), artifact: z.string().optional(), issues: z.array(z.string()).optional(), risk: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(), verdicts: z.array(z.object({ check: z.enum(['arithmetic', 'claim', 'critic']), verdict: z.enum(['sound', 'unsound', 'could-not-check']), because: z.string() })).optional(), verified: z.boolean().optional() })) }),
  z.object({ ok: z.literal(false), failed: z.string() }),
  z.object({ ok: z.literal('skipped'), because: z.string() }),
])
const runShape = z.object({
  at: z.string(),
  request: z.object({
    question: z.string(),
    topicId: z.string().nullable(),
    classId: z.string().nullable(),
    examId: z.string().nullable(),
    alreadyUsed: z.array(z.string()),
    askedFrom: z.string(),
    studentId: z.string(),
    topicName: z.string().optional(),
    experience: z.object({
      artifacts: z.array(z.object({ seq: z.number(), pleas: z.number(), answers: z.number(), questions: z.number(), empties: z.number(), movesSpent: z.array(z.string()), outcome: z.enum(['pleaded', 'answered', 'asked', 'silent', 'unknown']) })),
      unplaced: z.number(),
    }).optional(),
  }),
  gate: z.object({ path: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]), because: z.string() }).optional(),
  live: z.object({ did: z.string(), status: z.number() }),
  candidate: outcomeShape,
  legacy: outcomeShape,
  ms: z.number(),
})

export interface ListedRun {
  readonly seq: number
  readonly at: string
  readonly run?: ShadowRun
  /** Why the row could not be read as a run. Present exactly when `run` is absent. */
  readonly unreadable?: string
}

export interface ShadowRuns {
  record(run: ShadowRun): number
  list(after?: number): readonly ListedRun[]
}

export function shadowRuns(store: MemoryStore): ShadowRuns {
  return {
    record(run) {
      return store.recordShadowRun(JSON.stringify(run), run.at)
    },
    list(after = 0) {
      return store.listShadowRuns(after).map((row) => {
        let parsed: unknown
        try {
          parsed = JSON.parse(row.text)
        } catch (error: unknown) {
          return { seq: row.seq, at: row.createdAt, unreadable: error instanceof Error ? error.message : String(error) }
        }
        const read = runShape.safeParse(parsed)
        if (!read.success) return { seq: row.seq, at: row.createdAt, unreadable: read.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ') }
        /* zod makes a key of unknown type optional in what it infers; the shape
           above is the whole run, so the read-back is the interface. */
        return { seq: row.seq, at: row.createdAt, run: read.data as ShadowRun }
      })
    },
  }
}
