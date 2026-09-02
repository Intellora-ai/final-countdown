import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import type { Doubt, Resolution } from './contract'

/**
 * What the learner had done, kept across a reload.
 *
 * WHY THIS IS A STORE AND NOT A `useState` THE VIEW OWNS
 * -----------------------------------------------------
 * `TeachView` still owns every value it renders. This holds ONE thing — the
 * copy that outlives the tab — and the view reads it exactly once, when it
 * mounts, and writes to it as things change. Two sources of truth that both
 * feed the render would drift; a source of truth and a sink do not.
 *
 * WHY THE SHAPE COMES FROM `practice/sessionStore.ts`
 * ---------------------------------------------------
 * That file has already done the hard thinking and the repository should have
 * one answer to this, not two: `zustand/middleware` `persist` over
 * `createJSONStorage`, with a probe that refuses `localStorage` rather than
 * assuming it. This is the same shape, extended in one place — see below.
 *
 * WHERE IT DELIBERATELY GOES FURTHER THAN `sessionStore`
 * ------------------------------------------------------
 * `sessionStore` probes storage ONCE, at import, and then trusts it. That
 * answers "is storage there" and not "will this write succeed", and those come
 * apart exactly where it matters: a quota filled halfway through a lesson
 * throws on a write that the import-time probe already blessed. So every read
 * and every write here is guarded individually, and a failed write turns
 * storage OFF for the rest of the session rather than throwing again on the
 * next keystroke.
 *
 * A LESSON'S PROGRESS BELONGS TO THAT LESSON
 * -------------------------------------------
 * One record is kept, and it carries the id of the lesson it came from.
 * `loadTeachProgress` hands back nothing when the ids disagree, so opening a
 * different lesson can never show the last one's conversation. This mirrors the
 * rule the view already enforces in memory: a different lesson is a different
 * session.
 */

/** Where a lesson's progress lives. One key, because one lesson is taught at a
 *  time and a per-lesson key would grow `localStorage` without bound. */
export const TEACH_STORAGE_KEY = 'canvas-teach'
const KEY = TEACH_STORAGE_KEY

/**
 * Said in place of an answer that never arrived.
 *
 * A question that was in flight when the tab closed has no answer and never
 * will — the promise that would have delivered it died with the page. The
 * record is kept, because the learner typed it and nothing typed is lost, and
 * it says what actually happened. Writing a plausible answer here instead would
 * be the one thing a restore may never do: invent.
 */
export const ANSWER_LOST =
  'The answer to this was still on its way when the page closed, so it never arrived. Ask again and I will have another go.'

export interface StoredAsked {
  at: number
  beatId: string
  doubt: Doubt
  pending: boolean
  resolution?: Resolution
  prose?: string
}

/**
 * Everything worth carrying across a reload — and nothing that could do harm
 * on the way back.
 *
 * `answerInFlight` IS ABSENT ON PURPOSE, and its absence is asserted by a test.
 * It is released by the promise that set it, so a persisted `true` would come
 * back with nothing on its way to release it and the learner would find a box
 * that is disabled for good. A field that can only be wrong when restored is
 * not persisted.
 */
export interface TeachProgress {
  lessonId: string
  revealed: number
  asked: StoredAsked[]
  draft: string
  questionsAsked: number
  emptyAnswers: number
  /** Whether `strugglingAfter` has ALREADY fired for this session. Carried
   *  because the view's own guard is a ref that a reload resets, and a restored
   *  session that fires it a second time deepens a lesson twice. */
  struggleReported: boolean
}

/**
 * Storage that cannot throw at the caller, in either direction.
 *
 * A read that fails yields `null`, which every caller already handles as "no
 * saved session". A write that fails turns writing OFF for the rest of the
 * session and returns: the restore is lost, the lesson is not, and the next
 * keystroke does not throw all over again. Both branches change what happens
 * next rather than swallowing the failure quietly.
 */
let writable = true

function guardedStorage() {
  return {
    getItem(name: string): string | null {
      const raw = backing()
      if (raw === undefined) return null
      let stored: string | null
      try {
        stored = raw.getItem(name)
      } catch {
        /* Private mode and locked-down profiles throw on ACCESS, not just on
           write. Treated as "nothing saved", which is exactly true. */
        return null
      }
      if (stored === null) return null
      try {
        JSON.parse(stored)
      } catch {
        /* A half-written or hand-edited record. Refused rather than handed on,
           so a corrupt save cannot take the lesson down with it. */
        return null
      }
      return stored
    },
    setItem(name: string, value: string): void {
      const raw = backing()
      if (raw === undefined || !writable) return
      try {
        raw.setItem(name, value)
      } catch {
        /* Quota, or a profile that allows reads and refuses writes. The
           learner loses the restore and keeps the lesson; writing is switched
           off so the next keystroke does not throw again. */
        writable = false
      }
    },
    removeItem(name: string): void {
      const raw = backing()
      if (raw === undefined) return
      try {
        raw.removeItem(name)
      } catch {
        writable = false
      }
    },
  }
}

/** `localStorage`, or nothing. Reached through `window` on every call rather
 *  than captured once, so a test that replaces it is actually seen. */
function backing(): Storage | undefined {
  try {
    if (typeof window === 'undefined') return undefined
    return window.localStorage ?? undefined
  } catch {
    return undefined
  }
}

/*
 * A storage object is always handed to `persist`, and it resolves
 * `window.localStorage` on EVERY call rather than once.
 *
 * `createJSONStorage` invokes this factory exactly once, when the module is
 * imported (zustand `middleware.mjs`, `createJSONStorage`). Capturing
 * `window.localStorage` here would therefore freeze one import-time answer for
 * the whole session -- and that answer is `undefined` in this repository's test
 * environment, where jsdom provides no `localStorage` at all. Every read and
 * write below looks it up again, so the store is honest about storage that
 * appears late, disappears, or was never there.
 */
const teachStorage = createJSONStorage(guardedStorage)

/* ONE MEMORY PER LESSON, IN THIS BROWSER TOO.
 *
 * This held ONE record: learn physics, then civics, and the physics progress
 * was gone -- the defect `server/memory/key.ts` names as the reason the server
 * store exists. The browser copy keeps the same promise now: a record per
 * lesson, under the same storage key, capped at the most recently studied so
 * storage cannot grow without bound (which was this file's own reason for
 * keeping one). Older persisted state -- version 1, one `progress` -- is
 * carried across, not dropped. */
export const MOST_LESSONS_KEPT = 40

interface Kept extends TeachProgress {
  /** Ever-increasing, so two saves in one millisecond still have an order. */
  updatedAt: number
}
let lastStamp = 0
const stamp = (): number => {
  lastStamp = Math.max(lastStamp + 1, Date.now())
  return lastStamp
}
interface TeachStore {
  byLesson: Record<string, Kept>
  save(progress: TeachProgress): void
  clear(): void
}

export const useTeachStore = create<TeachStore>()(
  persist(
    (set, get) => ({
      byLesson: {},
      save(progress) {
        const next: Record<string, Kept> = {
          ...get().byLesson,
          [progress.lessonId]: { ...progress, updatedAt: stamp() },
        }
        const kept = Object.values(next)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, MOST_LESSONS_KEPT)
        set({ byLesson: Object.fromEntries(kept.map((record) => [record.lessonId, record])) })
      },
      clear() {
        set({ byLesson: {} })
      },
    }),
    {
      name: KEY,
      storage: teachStorage,
      version: 2,
      migrate: (persisted, version) => {
        if (version < 2) {
          const old = (persisted as { progress?: TeachProgress | null } | undefined)?.progress ?? null
          return { byLesson: old === null ? {} : { [old.lessonId]: { ...old, updatedAt: 0 } } } as TeachStore
        }
        return persisted as TeachStore
      },
    },
  ),
)

/**
 * The saved session for this lesson, or nothing.
 *
 * Two things are refused rather than handed back:
 *   - a record belonging to a DIFFERENT lesson, so opening physics never shows
 *     the machine-learning conversation;
 *   - any record still marked `pending`, which is rewritten to say the answer
 *     never arrived. Left as it was, the view would render "working on it"
 *     forever with nothing working on it.
 */
export function loadTeachProgress(lessonId: string): TeachProgress | null {
  const kept = useTeachStore.getState().byLesson[lessonId]
  if (kept === undefined || kept.lessonId !== lessonId) return null
  if (typeof kept.draft !== 'string' || !Array.isArray(kept.asked)) return null
  /* Handed back WITHOUT the store's own stamp: the caller gets a
     `TeachProgress`, nothing more, so a record can round-trip to the server
     and back unchanged. */
  const saved: TeachProgress = {
    lessonId: kept.lessonId,
    revealed: kept.revealed,
    asked: kept.asked,
    draft: kept.draft,
    questionsAsked: kept.questionsAsked,
    emptyAnswers: kept.emptyAnswers,
    struggleReported: kept.struggleReported,
  }
  return {
    ...saved,
    asked: saved.asked.map((record) =>
      record.pending ? { ...record, pending: false, prose: ANSWER_LOST } : record,
    ),
  }
}

export function saveTeachProgress(progress: TeachProgress): void {
  useTeachStore.getState().save(progress)
}

/**
 * Drop the in-memory copy.
 *
 * `keepStorage` is what makes a reload testable: it leaves what is on disk
 * alone and pulls it back in, which is the only route a real refresh has. A
 * test that merely re-rendered would restore out of memory and prove nothing
 * about storage at all.
 */
/** Forget this lesson's progress, in memory and on disk. */
export function resetTeachProgress(): void {
  /* A write that failed switched writing off for the session. A reset is a new
     session, so the question is asked again rather than assumed. */
  writable = true
  useTeachStore.getState().clear()
  const raw = backing()
  if (raw === undefined) return
  try {
    raw.removeItem(KEY)
  } catch {
    /* Nothing left to clear that this session can reach. */
    return
  }
}
