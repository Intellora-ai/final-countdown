/* What the learner had typed, and where they were, so a reload loses nothing.
 *
 * WHAT WAS LOST BEFORE THIS
 *   Reload mid-typing  the box came back empty, with no record anything had
 *                      been typed at all.
 *   Reload mid-answer  the question vanished. The request died with the page,
 *                      so nothing would ever have answered it, and there was
 *                      no trace it had been asked.
 *   Reload mid-lesson  back to the first beat, however far in they were.
 *
 * A learner on a phone, on a train, does not choose when the tab is evicted.
 * Losing their words is the software's fault and they will read it as their
 * own.
 *
 * WHY THE PLACE IN THE LESSON IS HERE TOO, AND IS NOT SCOPE CREEP
 *   A question is remembered against the BEAT it was asked on, and `TeachView`
 *   renders a doubt's answer beside that beat. A lesson that reopens at beat
 *   one therefore renders a restored question NOWHERE. Restoring the place is
 *   what makes restoring the question mean anything.
 *
 * STORAGE MAY THROW, NOT MERELY BE ABSENT
 *   A private window, a browser set to block site data, a thumbnail capture:
 *   the accessor itself raises. Every read and every write below is wrapped,
 *   and every failure degrades to "remember nothing" — never to an exception
 *   that takes the lesson down. This mirrors `almanac/attempts.ts`, which
 *   learnt the same lesson first.
 */

/** One question that was still waiting for an answer when the page went away. */
export interface RememberedDoubt {
  readonly at: number
  readonly beatId: string
  readonly text: string
  readonly shown: readonly string[]
}

/** Everything a reload would otherwise have thrown away. */
export interface Remembered {
  readonly draft: string
  readonly revealed: number
  readonly pending: readonly RememberedDoubt[]
}

/** A fresh lesson. Returned for every unreadable, absent or malformed record,
 *  because a learner cannot repair a broken JSON blob and must never be shown
 *  one. */
export const NOTHING_REMEMBERED: Remembered = { draft: '', revealed: 1, pending: [] }

/** Only the three members used, so a test double is four lines. The same
 *  narrowing `AttemptStore` makes, for the same reason. */
export interface DraftStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/**
 * At most this many outstanding questions are restored.
 *
 * `TeachView` allows one at a time, so a record holding more came from a
 * different version, a hand edit, or corruption. A bound means none of those
 * can turn into a thousand re-issued model calls on the next mount.
 */
const MOST_PENDING = 8

function defaultStore(): DraftStore | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    /* Accessing localStorage THROWS on some locked-down configurations rather
     * than being absent. Returning undefined puts it on the no-storage path. */
    return undefined
  }
}

/** Namespaced by lesson: two lessons are two conversations, and restoring one
 *  learner's half-typed answer under the other lesson would be worse than
 *  losing it. */
export function keyFor(lessonId: string): string {
  return `lc.teach.${lessonId}`
}

function asDoubt(value: unknown): RememberedDoubt | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const { at, beatId, text } = record
  if (typeof at !== 'number' || !Number.isInteger(at) || at < 0) return null
  if (typeof beatId !== 'string' || beatId === '') return null
  if (typeof text !== 'string' || text.trim() === '') return null
  const shown = Array.isArray(record.shown)
    ? record.shown.filter((id): id is string => typeof id === 'string')
    : []
  return { at, beatId, text, shown }
}

/**
 * What was remembered for this lesson, or a fresh one.
 *
 * EVERY FIELD IS CHECKED SEPARATELY. Storage is shared with everything else on
 * the origin and survives a deploy, so the value read here may have been
 * written by another version of this code, by another tab, or by hand. A field
 * that fails falls back on its own rather than discarding the rest: a corrupt
 * `revealed` should not cost the learner the sentence they had typed.
 */
export function recall(lessonId: string, store = defaultStore()): Remembered {
  if (store === undefined || lessonId === '') return NOTHING_REMEMBERED

  let raw: string | null
  try {
    raw = store.getItem(keyFor(lessonId))
  } catch {
    return NOTHING_REMEMBERED
  }
  if (raw === null) return NOTHING_REMEMBERED

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return NOTHING_REMEMBERED
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return NOTHING_REMEMBERED
  }

  const record = parsed as Record<string, unknown>
  const draft = typeof record.draft === 'string' ? record.draft : ''
  const revealed =
    typeof record.revealed === 'number' && Number.isInteger(record.revealed) && record.revealed >= 1
      ? record.revealed
      : 1
  const pending = Array.isArray(record.pending)
    ? record.pending
        .map(asDoubt)
        .filter((doubt): doubt is RememberedDoubt => doubt !== null)
        .slice(0, MOST_PENDING)
    : []

  return { draft, revealed, pending }
}

/** Nothing worth remembering is not stored at all, so leaving a lesson tidily
 *  leaves no record behind. */
function isFresh(state: Remembered): boolean {
  return state.draft === '' && state.revealed <= 1 && state.pending.length === 0
}

export function remember(lessonId: string, state: Remembered, store = defaultStore()): void {
  if (store === undefined || lessonId === '') return
  if (isFresh(state)) {
    forget(lessonId, store)
    return
  }
  try {
    store.setItem(keyFor(lessonId), JSON.stringify(state))
  } catch {
    /* A full quota, a blocked origin, a private window. Remembering is a
       convenience; it may never be the reason a lesson stops working. */
  }
}

export function forget(lessonId: string, store = defaultStore()): void {
  if (store === undefined || lessonId === '') return
  try {
    store.removeItem(keyFor(lessonId))
  } catch {
    /* Same contract as `remember`: failing to forget is not worth an exception
       in front of a learner. */
  }
}
