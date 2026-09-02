/**
 * THE ONE INTERFACE EVERY INTELLIGENCE MUST SATISFY.
 *
 * A `LearningIntelligence` is asked what should happen for one teaching
 * request and answers with a PROPOSAL: learning actions (the IR in `ir.ts`),
 * what it could not settle (Unknowns -- never guessed away), why it chose what
 * it chose, what it selected and what it turned down, what it cost, and its
 * own trace for a person to argue with.
 *
 * Two live implementations: `candidate.ts` wraps `src/agent` (the finished
 * engine the canvas never called) and `legacy.ts` wraps today's five-action
 * chooser. `shadow.ts` asks both the same question after the student has
 * already been answered, so neither can change what she sees.
 */
import type { LearningAction } from './ir.ts'

/** What `/api/ask` was asked, in the words it was asked. */
export interface TeachingRequest {
  readonly question: string
  readonly topicId: string | null
  readonly classId: string | null
  readonly examId: string | null
  /** Lessons already shown for this question, so nothing is repeated. */
  readonly alreadyUsed: readonly string[]
  /** `'ask'` for a fresh question, otherwise the id of the lesson she is inside. */
  readonly askedFrom: string
  readonly studentId: string
}

/** Something the intelligence could not settle. A first-class result, not an error. */
export interface Unknown {
  readonly what: string
  readonly because: string
  /** True when nothing sound can be proposed until it is settled. */
  readonly blocking: boolean
}

/** Measured, never estimated. A cost nobody measured is `modelCalls: 0, ms: 0` and says so in the trace. */
export interface Cost {
  readonly ms: number
  readonly modelCalls: number
}

export interface Proposal {
  readonly actions: readonly LearningAction[]
  readonly unknowns: readonly Unknown[]
  readonly rationale: string
  readonly capabilities: {
    readonly selected: readonly string[]
    readonly rejected: readonly { readonly capability: string; readonly why: string }[]
  }
  readonly cost: Cost
  /** The implementation's own record of how it got there. Opaque here, kept whole. */
  readonly trace: unknown
}

export interface LearningIntelligence {
  readonly name: string
  propose(request: TeachingRequest): Promise<Proposal>
}
