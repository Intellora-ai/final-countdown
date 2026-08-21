/* SCENE OPERATION LOG — the board is a fold over this list.
 *
 * WHY A LOG AND NOT A SCENE OBJECT. "Step by step" is the product's core claim,
 * and as an adjective it is unfalsifiable — every animated interface can be
 * described that way. As a log it becomes countable: a step is an entry, the
 * reference lesson must contain at least eight of them, and a fade-in that
 * introduces nothing appends nothing. The acceptance criterion stops being a
 * matter of opinion.
 *
 * It also buys replay for free. If the finished board is the last frame of a
 * fold, then re-running the fold reconstructs it exactly — same objects, same
 * ids, same variable values, same camera. That is DOD-6, and it is also how the
 * learner gets an undo that does not lie.
 *
 * APPEND-ONLY. Entries are never edited or removed. A correction is a new
 * `correct` operation that references what it corrects; rewriting the earlier
 * entry would erase the mistake from a record whose purpose is to show that
 * mistakes happened.
 *
 * RANDOMNESS CARRIES A SEED. The particle simulation is stochastic. An
 * operation that consumed randomness records the seed it used, because a replay
 * that produces different particles has not reproduced the scene.
 */

export type SceneOperationType =
  | 'write'                   // handwriting appears, stroke by stroke
  | 'draw'                    // a mark, arrow, or diagram is drawn
  | 'erase'                   // something is deliberately removed
  | 'reveal'                  // existing but hidden detail becomes visible
  | 'transform'               // one representation becomes another in place
  | 'annotate'                // a note, circle, or underline is added
  | 'simulate'                // a simulation starts, steps, or stops
  | 'ask'                     // the board asks the learner something
  | 'answer'                  // the learner answers
  | 'predict'                 // the learner commits to a prediction
  | 'correct'                 // a prediction or drawing is corrected
  | 'change_representation'   // the learner asks to see it another way
  | 'set_parameter'           // a variable moves
  | 'camera_change'           // pan, zoom, or focus moves

export type OperationSource = 'learner' | 'ai' | 'system'

export interface SceneOperation {
  operationId: string
  sequence: number
  chapterId: string
  conceptId: string
  type: SceneOperationType
  payload: unknown
  source: OperationSource
  timestamp: string
  randomSeed?: string
}

/** What a caller supplies. Identity, order and time are the log's to assign. */
export type SceneOperationInput = Omit<
  SceneOperation,
  'operationId' | 'sequence' | 'timestamp'
>

/* Operation types that introduce or change a primary learning object. DOD-2
 * caps the board at one of these per learner action; `set_parameter` and
 * `camera_change` are excluded because moving a slider or panning is the
 * learner exploring what is already there, not the board teaching something
 * new. `reveal` counts: hidden detail becoming visible is a new idea arriving,
 * whatever the implementation did to make it appear. */
const SEMANTIC_TYPES: ReadonlySet<SceneOperationType> = new Set<SceneOperationType>([
  'write', 'draw', 'erase', 'reveal', 'transform', 'annotate',
  'simulate', 'ask', 'answer', 'predict', 'correct', 'change_representation',
])

export function isSemanticStep(op: SceneOperation): boolean {
  return SEMANTIC_TYPES.has(op.type)
}

export interface OperationLogOptions {
  /** Injected so a replayed log reproduces identical timestamps. */
  now?: () => number
  /** Injected so operation ids are deterministic under replay. */
  idFor?: (sequence: number, input: SceneOperationInput) => string
}

/** Deterministic by construction: identity is position plus kind, never a
 *  random uuid, so the same log replayed twice yields the same ids. */
function defaultId(sequence: number, input: SceneOperationInput): string {
  return `op-${String(sequence).padStart(4, '0')}-${input.type}`
}

export class OperationLog {
  private entries: SceneOperation[] = []
  private now: () => number
  private idFor: NonNullable<OperationLogOptions['idFor']>

  constructor(options: OperationLogOptions = {}) {
    this.now = options.now ?? (() => Date.now())
    this.idFor = options.idFor ?? defaultId
  }

  append(input: SceneOperationInput): SceneOperation {
    const sequence = this.entries.length + 1
    const op: SceneOperation = {
      ...input,
      operationId: this.idFor(sequence, input),
      sequence,
      timestamp: new Date(this.now()).toISOString(),
    }
    this.entries.push(op)
    return op
  }

  /** A copy. Handing out the array would let a caller edit an append-only log. */
  list(): SceneOperation[] {
    return [...this.entries]
  }

  at(sequence: number): SceneOperation | undefined {
    return this.entries[sequence - 1]
  }

  get length(): number {
    return this.entries.length
  }

  /** The number acceptance test T2 measures. Not `length`: a log of fourteen
   *  entries where six are camera moves contains eight teaching steps. */
  semanticStepCount(): number {
    return this.entries.filter(isSemanticStep).length
  }

  forConcept(chapterId: string, conceptId: string): SceneOperation[] {
    return this.entries.filter((o) => o.chapterId === chapterId && o.conceptId === conceptId)
  }

  /** Every variable change in order — what `VariableStore.replay` consumes. */
  parameterChanges(): unknown[] {
    return this.entries.filter((o) => o.type === 'set_parameter').map((o) => o.payload)
  }

  /** Serialises for persistence. */
  toJSON(): SceneOperation[] {
    return this.list()
  }

  /** Rebuilds a log from persisted entries without re-deriving ids, so a
   *  restored session keeps the identities its objects already reference. */
  static from(entries: SceneOperation[], options: OperationLogOptions = {}): OperationLog {
    const log = new OperationLog(options)
    log.entries = [...entries]
    return log
  }
}
