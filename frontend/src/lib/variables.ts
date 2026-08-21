/* VARIABLE STORE — one value, many representations.
 *
 * THE PROBLEM THIS EXISTS TO PREVENT. A board that shows temperature as a
 * slider, a particle field, a point on a graph and a term in an equation has
 * four chances to disagree with itself. Four copies is the usual way that
 * happens, and the failure is not a crash: the slider says 450 K, the graph
 * still plots 300 K, and the learner concludes the relationship is weaker than
 * it is. The lesson teaches the wrong thing while every component works.
 *
 * So there is exactly one number. Representations SUBSCRIBE; they never hold
 * their own copy. `set()` commits once and notifies every subscriber from that
 * single committed value, which is what makes acceptance test T4 — "100% of
 * dependent representations receive the same committed value in the same
 * commit" — a property of the design rather than a thing to remember.
 *
 * VALIDATION REFUSES RATHER THAN CLAMPS. A rejected write leaves the previous
 * value in place and returns why. Clamping an out-of-range temperature to the
 * maximum would show the learner a simulation running at a number they did not
 * ask for and cannot see, which is the same class of lie as the four copies.
 *
 * TIME IS INJECTED. `updatedAt` comes from a clock passed in, not from
 * `Date.now()` called here, because a replayed operation log must reproduce the
 * same records (DOD-6) and a wall clock guarantees it cannot.
 */

import type { SceneOperation } from './operations'

export type VariableSource = 'curriculum' | 'learner' | 'simulation' | 'ai_generated'
export type VariableValue = number | string | boolean

export interface VariableRecord {
  variableId: string
  chapterId: string
  conceptId: string
  name: string
  symbol?: string
  value: VariableValue
  unit?: string
  min?: number
  max?: number
  step?: number
  source: VariableSource
  updatedAt: number
}

/** What a variable is declared to be, before it holds a value. */
export type VariableDeclaration = Omit<VariableRecord, 'updatedAt'>

/* NOT a discriminated union on `ok`. The imported tsconfig ships `strict: false`,
 * and without strictNullChecks TypeScript will not narrow a boolean discriminant
 * — `if (!result.ok)` leaves `reason` unreachable at every call site. Turning
 * strict on would be a repo-wide change smuggled into a canvas changeset, so the
 * result carries optional fields instead and needs no narrowing at all. */
export interface SetResult {
  ok: boolean
  record?: VariableRecord
  reason?: string
}

export interface ValidationResult {
  ok: boolean
  reason?: string
}

export type Unsubscribe = () => void

/** Emitted for every accepted write, so the operation log can replay the scene. */
export interface VariableChangePayload {
  variableId: string
  from: VariableValue
  to: VariableValue
  source: VariableSource
}

export interface VariableStoreOptions {
  /** Injected so replay reproduces identical records. Defaults to the wall clock. */
  now?: () => number
  /** Where accepted writes are recorded. The canvas wires this to the operation log. */
  emit?: (op: Omit<SceneOperation, 'operationId' | 'sequence' | 'timestamp'>) => void
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Floating point makes `(v - min) % step` unreliable — 0.1 + 0.2 is the classic
 *  case. Compare in integer steps with a tolerance instead of trusting `%`. */
function onStep(value: number, min: number, step: number): boolean {
  if (step <= 0) return true
  const steps = (value - min) / step
  return Math.abs(steps - Math.round(steps)) < 1e-9
}

export class VariableStore {
  private records = new Map<string, VariableRecord>()
  private subscribers = new Set<(record: VariableRecord) => void>()
  private history: VariableRecord[] = []
  private initial = new Map<string, VariableRecord>()
  private now: () => number
  private emit?: VariableStoreOptions['emit']

  constructor(options: VariableStoreOptions = {}) {
    this.now = options.now ?? (() => Date.now())
    this.emit = options.emit
  }

  /** Declaring twice is a no-op, not an overwrite: a representation mounting a
   *  second time must not silently reset the learner's value to the default. */
  declare(declaration: VariableDeclaration): VariableRecord {
    const existing = this.records.get(declaration.variableId)
    if (existing) return existing
    const record: VariableRecord = { ...declaration, updatedAt: this.now() }
    this.records.set(record.variableId, record)
    this.initial.set(record.variableId, { ...record })
    return record
  }

  get(variableId: string): VariableRecord | undefined {
    return this.records.get(variableId)
  }

  all(): VariableRecord[] {
    return [...this.records.values()]
  }

  /** Every variable belonging to one concept — what a scene binds when it opens. */
  forConcept(chapterId: string, conceptId: string): VariableRecord[] {
    return this.all().filter((r) => r.chapterId === chapterId && r.conceptId === conceptId)
  }

  /** Returns why it refused rather than throwing: a learner dragging a slider
   *  past its limit is ordinary, not exceptional, and the board explains it. */
  validate(variableId: string, value: VariableValue): ValidationResult {
    const record = this.records.get(variableId)
    if (!record) return { ok: false, reason: `unknown variable: ${variableId}` }
    if (typeof value !== typeof record.value) {
      return {
        ok: false,
        reason: `${variableId} is ${typeof record.value}, received ${typeof value}`,
      }
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return { ok: false, reason: `${variableId} must be finite` }
      if (isNum(record.min) && value < record.min) {
        return { ok: false, reason: `${variableId} below minimum ${record.min}${record.unit ?? ''}` }
      }
      if (isNum(record.max) && value > record.max) {
        return { ok: false, reason: `${variableId} above maximum ${record.max}${record.unit ?? ''}` }
      }
      if (isNum(record.step) && isNum(record.min) && !onStep(value, record.min, record.step)) {
        return { ok: false, reason: `${variableId} must move in steps of ${record.step}` }
      }
    }
    return { ok: true }
  }

  set(variableId: string, value: VariableValue, source: VariableSource): SetResult {
    const record = this.records.get(variableId)
    if (!record) return { ok: false, reason: `unknown variable: ${variableId}` }

    const check = this.validate(variableId, value)
    if (!check.ok) return { ok: false, reason: check.reason }

    // A no-op write is accepted but produces no operation and no notification:
    // an unchanged value is not a learning step and must not inflate the log.
    if (record.value === value) return { ok: true, record }

    const from = record.value
    this.history.push({ ...record })

    const next: VariableRecord = { ...record, value, source, updatedAt: this.now() }
    this.records.set(variableId, next)

    this.emit?.({
      chapterId: next.chapterId,
      conceptId: next.conceptId,
      type: 'set_parameter',
      source: source === 'learner' ? 'learner' : source === 'ai_generated' ? 'ai' : 'system',
      payload: { variableId, from, to: value, source } satisfies VariableChangePayload,
    })

    this.notify(next)
    return { ok: true, record: next }
  }

  /** Restores the value before the last accepted write. Undo is itself a write,
   *  so dependents update the same way they did going forward. */
  undo(): SetResult {
    const previous = this.history.pop()
    if (!previous) return { ok: false, reason: 'nothing to undo' }
    const current = this.records.get(previous.variableId)
    const restored: VariableRecord = { ...previous, updatedAt: this.now() }
    this.records.set(previous.variableId, restored)

    if (current && current.value !== restored.value) {
      this.emit?.({
        chapterId: restored.chapterId,
        conceptId: restored.conceptId,
        type: 'set_parameter',
        source: 'learner',
        payload: {
          variableId: restored.variableId,
          from: current.value,
          to: restored.value,
          source: restored.source,
        } satisfies VariableChangePayload,
      })
    }
    this.notify(restored)
    return { ok: true, record: restored }
  }

  /** Back to declared values. Clears history so a later undo cannot walk past
   *  the reset into a scene the learner has already left. */
  reset(variableId?: string): void {
    const ids = variableId ? [variableId] : [...this.initial.keys()]
    for (const id of ids) {
      const start = this.initial.get(id)
      if (!start) continue
      const restored: VariableRecord = { ...start, updatedAt: this.now() }
      this.records.set(id, restored)
      this.notify(restored)
    }
    this.history = variableId ? this.history.filter((h) => h.variableId !== variableId) : []
  }

  subscribe(listener: (record: VariableRecord) => void): Unsubscribe {
    this.subscribers.add(listener)
    return () => {
      this.subscribers.delete(listener)
    }
  }

  /** Count of live dependents. The synchronisation test asserts against this
   *  rather than a number it hard-codes, so it cannot pass vacuously. */
  subscriberCount(): number {
    return this.subscribers.size
  }

  /** Applies recorded changes in order. Replay must not emit: the operations
   *  already exist, and re-emitting them would double the log it replays from. */
  replay(changes: VariableChangePayload[]): void {
    const emit = this.emit
    this.emit = undefined
    try {
      for (const change of changes) this.set(change.variableId, change.to, change.source)
    } finally {
      this.emit = emit
    }
  }

  /** One subscriber throwing must not stop the others from receiving the value —
   *  a half-updated board is exactly the disagreement this store exists to
   *  prevent. The failure is reported, not swallowed. */
  private notify(record: VariableRecord): void {
    for (const listener of this.subscribers) {
      try {
        listener(record)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`[variables] subscriber threw for ${record.variableId}: ${message}`)
      }
    }
  }
}
