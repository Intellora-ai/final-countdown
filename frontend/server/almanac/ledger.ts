/**
 * THE DAY LEDGER — Almanac's memory.
 *
 * One written record per student per date, plus the set of concepts the student
 * has marked done. Everything Almanac knows that outlives a request lives here.
 *
 * WHY A DAY IS WRITTEN DOWN AT ALL
 *     Before this, the plan was recomputed on every render. That is why nothing
 *     could remember yesterday, and why "never repeat" was impossible to state,
 *     let alone keep. A plan that exists only for as long as it is on screen has
 *     no history to be consistent with.
 *
 * FROZEN MEANS FROZEN
 *     `dayFor` returns the stored plan if there is one, and only plans when
 *     there is not. Finishing a topic, or changing subjects, does not reshuffle
 *     the day in progress — it changes tomorrow. A plan that rearranges itself
 *     while someone is working through it is not a plan.
 *
 * "YESTERDAY" IS THE MOST RECENT EARLIER DAY, NOT THE CALENDAR DAY BEFORE
 *     Students miss days. If Monday's work were only carried to Tuesday, a
 *     student who came back on Thursday would find it silently gone.
 *
 * ONLY THE STUDENT MARKS DONE
 *     `markDone` is the only writer of that set, and nothing in the planning
 *     path calls it. That is asserted directly, because it is the rule the rest
 *     of the design rests on.
 */

import { planDay, type DayPlan, type SubjectLike } from './plan.ts'

/** A stored day carries when it was set, on top of the plan itself. */
export interface StoredDay extends DayPlan {
  readonly plannedAt: string
}

export interface LedgerData {
  /** studentId -> date -> the day that was set. */
  days: Record<string, Record<string, StoredDay>>
  /** studentId -> concept ids the STUDENT marked done. */
  done: Record<string, string[]>
}

export interface LedgerStore {
  load(): Promise<LedgerData>
  save(data: LedgerData): Promise<void>
}

export interface DayRequest {
  readonly studentId: string
  readonly date: string
  readonly dailyMinutes: number
  readonly subjects: readonly SubjectLike[]
}

export interface Ledger {
  dayFor(request: DayRequest): Promise<StoredDay>
  read(studentId: string, date: string): Promise<StoredDay | undefined>
  markDone(studentId: string, conceptId: string): Promise<void>
  doneFor(studentId: string): Promise<ReadonlySet<string>>
}

export interface LedgerOptions {
  readonly now?: () => string
}

/**
 * The most recent day strictly BEFORE `date`. ISO dates sort correctly as text.
 *
 * Exported so the two rules inside it can be tested directly. From `dayFor`
 * they are invisible: it only asks when today has no stored plan, so a
 * strictly-earlier filter and an earlier-or-equal one behave identically there,
 * and a mutation run proved neither could be told apart.
 */
export function previousDayFor(
  data: LedgerData,
  studentId: string,
  date: string,
): StoredDay | undefined {
  const days = data.days[studentId]
  if (days === undefined) return undefined
  const earlier = Object.keys(days)
    .filter((d) => d < date)
    .sort()
  const last = earlier[earlier.length - 1]
  return last === undefined ? undefined : days[last]
}

export function createLedger(store: LedgerStore, options: LedgerOptions = {}): Ledger {
  const now = options.now ?? (() => new Date().toISOString())

  /**
   * Every write runs alone.
   *
   * The store's write is atomic; the read-modify-write around it was not. Two
   * requests arriving together both read the same state, both edited their own
   * copy, and the second save overwrote the first. Measured before this
   * existed: twenty-five concurrent marks, ONE survivor. A student's finished
   * work simply vanished, with nothing anywhere reporting it.
   *
   * A promise chain is the whole mechanism, and it is enough because this is
   * one process: each operation waits for the previous one to finish before it
   * reads. A failed operation must not break the chain for the next one, so the
   * tail swallows rejections while the caller still receives them.
   */
  let tail: Promise<unknown> = Promise.resolve()
  function alone<T>(work: () => Promise<T>): Promise<T> {
    const result = tail.then(work, work)
    tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  return {
    async read(studentId, date) {
      const data = await store.load()
      return data.days[studentId]?.[date]
    },

    async doneFor(studentId) {
      const data = await store.load()
      return new Set(data.done[studentId] ?? [])
    },

    markDone(studentId, conceptId) {
      return alone(async () => {
      const data = await store.load()
      const current = new Set(data.done[studentId] ?? [])
      current.add(conceptId)
      data.done[studentId] = [...current]
      await store.save(data)
      })
    },

    dayFor(request) {
      return alone(async () => {
      const data = await store.load()

      const existing = data.days[request.studentId]?.[request.date]
      if (existing !== undefined) return existing

      const yesterday = previousDayFor(data, request.studentId, request.date)
      const plan = planDay({
        date: request.date,
        dailyMinutes: request.dailyMinutes,
        subjects: request.subjects,
        done: new Set(data.done[request.studentId] ?? []),
        ...(yesterday === undefined ? {} : { yesterday }),
      })

      const stored: StoredDay = { ...plan, plannedAt: now() }
      data.days[request.studentId] ??= {}
      data.days[request.studentId][request.date] = stored
      await store.save(data)
      return stored
      })
    },
  }
}
