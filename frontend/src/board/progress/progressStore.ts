/* WHERE THE BOARD'S MEMORY LIVES.
 *
 * Board-owned, deliberately. The dashboard has its own store and its own
 * Adapter, and this could have been a subtree inside it — but that store
 * commits the WHOLE database on every write with no debounce, and a board that
 * saves camera position would turn every settled pan into a full-tree write
 * broadcast to every open tab. Rather than make the dashboard's store worse to
 * borrow it, the board keeps its own key and the boundary is written down.
 *
 * FOUR PROPERTIES THE MILESTONE ASKS FOR, AND HOW EACH IS MET:
 *
 *   idempotent   A write that would store what is already stored does not
 *                happen. Compared on content, with updatedAt excluded — two
 *                saves differing only in when they occurred are one save.
 *   debounced    Writes coalesce on a trailing timer, so a burst of changes
 *                costs one write. The timer is flushed synchronously when the
 *                page is hidden, because localStorage is synchronous and a
 *                pending write at that moment is a lost one.
 *   recoverable  Unreadable or unknown-version storage is discarded, not
 *                thrown. A learner with a corrupt record starts the lesson;
 *                they do not meet a crash.
 *   versioned    The version is inside the envelope, so a future shape can
 *                read this one rather than orphan it.
 *
 * Storage is injected so the behaviour above is testable without a browser.
 */
import {
  PROGRESS_VERSION,
  emptyEnvelope,
  progressKey,
  sameProgress,
  type LearnerProgress,
  type ProgressEnvelope,
} from './types'

export const STORAGE_KEY = 'learning-canvas/progress/v1'
export const DEBOUNCE_MS = 300

/** The slice of the Storage API this needs. Injected so tests need no DOM. */
export interface ProgressStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface ProgressStoreOptions {
  storage?: ProgressStorage | null
  debounceMs?: number
  /** Reported when storage cannot be read or written. The board turns this
   *  into a visible notice rather than swallowing it. */
  onProblem?: (message: string) => void
}

export interface ProgressStore {
  read(scope: string, boardId: string): LearnerProgress | null
  /** Queue a write. Returns true if it was queued, false if it was recognised
   *  as a duplicate and dropped. */
  save(scope: string, progress: LearnerProgress): boolean
  /** Write any pending change immediately. */
  flush(): void
  clear(scope: string, boardId: string): void
  /** Writes actually performed. The duplicate-write invariant reads this. */
  writeCount(): number
  dispose(): void
}

function defaultStorage(): ProgressStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    /* Safari in private mode has localStorage and throws on setItem. Finding
     * that out at save time means finding out when it is too late to say so. */
    const probe = '__canvas_probe__'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return localStorage
  } catch {
    return null
  }
}

export function createProgressStore(opts: ProgressStoreOptions = {}): ProgressStore {
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage
  const debounceMs = opts.debounceMs ?? DEBOUNCE_MS
  const onProblem = opts.onProblem ?? (() => {})

  let envelope: ProgressEnvelope | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let dirty = false
  let writes = 0

  function load(): ProgressEnvelope {
    if (envelope) return envelope
    if (!storage) { envelope = emptyEnvelope(); return envelope }
    let raw: string | null = null
    try {
      raw = storage.getItem(STORAGE_KEY)
    } catch {
      onProblem('Saved progress could not be read, so this lesson starts fresh.')
      envelope = emptyEnvelope()
      return envelope
    }
    if (!raw) { envelope = emptyEnvelope(); return envelope }
    try {
      const parsed = JSON.parse(raw) as unknown
      envelope = adopt(parsed)
    } catch {
      onProblem('Saved progress was unreadable, so this lesson starts fresh.')
      envelope = emptyEnvelope()
    }
    return envelope
  }

  /* Decide what to do with whatever was in storage. Unknown shapes and future
   * versions are DISCARDED rather than guessed at: a record written by a later
   * build may mean something this build would misread, and misreading a
   * learner's position is worse than losing it. */
  function adopt(parsed: unknown): ProgressEnvelope {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      onProblem('Saved progress was not in the expected form, so this lesson starts fresh.')
      return emptyEnvelope()
    }
    const e = parsed as Partial<ProgressEnvelope>
    if (e.version !== PROGRESS_VERSION) {
      onProblem(
        e.version === undefined
          ? 'Saved progress had no version, so this lesson starts fresh.'
          : `Saved progress was written by a different version (${String(e.version)}), so this lesson starts fresh.`,
      )
      return emptyEnvelope()
    }
    if (!e.records || typeof e.records !== 'object' || Array.isArray(e.records)) {
      onProblem('Saved progress had no records, so this lesson starts fresh.')
      return emptyEnvelope()
    }
    /* Drop individual records that are not usable, keeping the rest: one bad
     * board should not cost a learner their position on every other board. */
    const records: Record<string, LearnerProgress> = {}
    for (const [key, value] of Object.entries(e.records)) {
      if (isProgress(value)) records[key] = value
    }
    return { version: PROGRESS_VERSION, records }
  }

  function isProgress(v: unknown): v is LearnerProgress {
    if (!v || typeof v !== 'object') return false
    const p = v as Partial<LearnerProgress>
    return (
      typeof p.sessionId === 'string' &&
      typeof p.boardId === 'string' &&
      typeof p.currentStepId === 'string' &&
      Array.isArray(p.completedStepIds) &&
      p.completedStepIds.every((s) => typeof s === 'string') &&
      typeof p.clarificationCount === 'number' &&
      typeof p.updatedAt === 'string' &&
      !!p.quizAnswers && typeof p.quizAnswers === 'object' && !Array.isArray(p.quizAnswers)
    )
  }

  function write(): void {
    timer = null
    if (!dirty || !storage || !envelope) return
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(envelope))
      writes += 1
      dirty = false
    } catch {
      /* Quota exceeded, or storage disabled mid-session. Said once, not on
       * every subsequent attempt: dirty stays true, so the next flush retries,
       * but the learner is not told the same thing repeatedly. */
      onProblem('Progress could not be saved. The lesson continues, but this position may not be restored.')
      dirty = false
    }
  }

  function schedule(): void {
    if (timer) return
    timer = setTimeout(write, debounceMs)
  }

  const flushNow = () => { if (dirty) { if (timer) { clearTimeout(timer); timer = null } ; write() } }

  return {
    read(scope, boardId) {
      const env = load()
      return env.records[progressKey(scope, boardId)] ?? null
    },

    save(scope, progress) {
      const env = load()
      const key = progressKey(scope, progress.boardId)
      /* THE IDEMPOTENCE GATE. One logical action produces one write, however
       * many times the caller reports it. */
      if (sameProgress(env.records[key], progress)) return false
      env.records[key] = progress
      dirty = true
      schedule()
      return true
    },

    flush: flushNow,

    clear(scope, boardId) {
      const env = load()
      delete env.records[progressKey(scope, boardId)]
      dirty = true
      schedule()
    },

    writeCount: () => writes,

    dispose() {
      flushNow()
      if (timer) { clearTimeout(timer); timer = null }
    },
  }
}

/* WRITING WHAT IS STILL PENDING WHEN THE PAGE GOES AWAY.
 *
 * localStorage is synchronous, so a debounced write can still be completed at
 * the moment of navigation — but only if something asks. pagehide fires for a
 * real navigation and for the bfcache; visibilitychange covers a tab switch on
 * mobile, where the process can be frozen before pagehide ever arrives.
 *
 * THIS IS SEPARATE FROM THE STORE ON PURPOSE. It used to be registered inside
 * createProgressStore and torn down by dispose(), which tied the listener's
 * life to the store's construction rather than to a component's. React 18
 * mounts, cleans up, and mounts again — so dispose() removed the listener
 * before the real mount, nothing re-registered it, and an answer given just
 * before a reload was lost. Attaching through an effect gives the listener the
 * same lifetime as the thing that needs it, and reattaches every time.
 */
export function attachFlushOnHide(store: Pick<ProgressStore, 'flush'>): () => void {
  if (typeof window === 'undefined') return () => {}
  const onPageHide = () => store.flush()
  const onVisibility = () => {
    if (typeof document === 'undefined' || document.visibilityState === 'hidden') store.flush()
  }
  window.addEventListener('pagehide', onPageHide)
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    window.removeEventListener('pagehide', onPageHide)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
