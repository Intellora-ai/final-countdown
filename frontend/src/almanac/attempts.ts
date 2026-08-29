/* How many times this learner has opened this concept.
 *
 * The server's teaching policy escalates on this count -- worked example, then
 * a different representation, then an analogy. Without a count that survives
 * leaving the page every visit is the first visit, and the policy would look
 * adaptive in its tests while being fixed in front of a student.
 *
 * NOT THE LEDGER, DELIBERATELY. The ledger records what a student FINISHED and
 * only the student writes it. This is a count of visits, which is not an
 * achievement and must never be mistaken for one. Keeping it on the device
 * also means a failed network call cannot quietly reset the teaching to
 * lesson one.
 */

export const ATTEMPTS_KEY = 'almanac/attempts/v1'

/** Only the three members used, so a test double is four lines. */
export interface AttemptStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function defaultStore(): AttemptStore | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    /* Accessing localStorage THROWS on some locked-down configurations rather
     * than being absent. Returning undefined puts it on the no-storage path. */
    return undefined
  }
}

/** Every count, or an empty map when the stored value is anything else.
 *
 * Corrupt data is treated as no history rather than as an error: a student
 * cannot fix a broken JSON blob, and throwing here would take down the
 * teaching screen over a counter. */
function readAll(store: AttemptStore | undefined): Record<string, number> {
  if (store === undefined) return {}
  let raw: string | null
  try {
    raw = store.getItem(ATTEMPTS_KEY)
  } catch {
    return {}
  }
  if (raw === null) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}

  const counts: Record<string, number> = {}
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) counts[id] = value
  }
  return counts
}

export function attemptsFor(conceptId: string, store = defaultStore()): number {
  return readAll(store)[conceptId] ?? 0
}

/** Record one opening and return the NEW count, so a caller cannot be off by
 *  one by reading it separately. */
export function recordAttempt(conceptId: string, store = defaultStore()): number {
  const counts = readAll(store)
  const next = (counts[conceptId] ?? 0) + 1
  counts[conceptId] = next
  try {
    store?.setItem(ATTEMPTS_KEY, JSON.stringify(counts))
  } catch {
    /* Private browsing, a full quota, a locked-down device. The lesson is still
     * taught; only the escalation is lost, and losing it silently is better
     * than refusing to teach. The count is still returned so this visit is
     * correct even when the next one will not be. */
  }
  return next
}
