import { useCallback, useSyncExternalStore } from 'react'

/**
 * WHICH ENTRANCE EXAM THE STUDENT IS SITTING.
 *
 * Exactly one, or none. A student sits JEE or NEET or CLAT or IPMAT; nobody
 * sits two, and modelling it as a list would put a state on screen that no real
 * student is in.
 *
 * WHY THIS LIVES IN `practice/` AND NOT IN THE DASHBOARD PROFILE
 * -------------------------------------------------------------
 * It belongs on the profile, and onboarding is where it will be asked. That is
 * a later step and it changes the dashboard, which this change is not allowed
 * to touch. Keeping the choice here means the exam is REACHABLE now -- four
 * generated syllabus files that had zero importers are drawn on the map today
 * -- and moving it onto the profile later is a change of source, not a
 * rewrite: everything downstream already takes the id as an argument.
 *
 * PERSISTED, because a student picks their exam once and the map has to look
 * the same tomorrow. Same storage key convention as the rest of practice.
 */
export const EXAM_CHOICES = [
  { id: 'jee-main-2026', label: 'JEE Main' },
  { id: 'neet-ug-2026', label: 'NEET UG' },
  { id: 'clat-2027', label: 'CLAT' },
  { id: 'ipmat-2026-rohtak', label: 'IPMAT' },
] as const

export type ExamChoiceId = (typeof EXAM_CHOICES)[number]['id']

const KEY = 'practice-exam'

const listeners = new Set<() => void>()

/**
 * `localStorage` is absent on the server, blocked in some private modes, and
 * throws when a quota is full. None of those is a reason to break the map, and
 * none of them is silently swallowed either -- the read falls back to "no exam
 * chosen", which is a real state the UI already renders.
 */
function read(): ExamChoiceId | null {
  let raw: string | null = null
  try {
    raw = globalThis.localStorage?.getItem(KEY) ?? null
  } catch {
    return null
  }
  return EXAM_CHOICES.some((choice) => choice.id === raw) ? (raw as ExamChoiceId) : null
}

export function setExamChoice(id: ExamChoiceId | null): void {
  try {
    if (id === null) globalThis.localStorage?.removeItem(KEY)
    else globalThis.localStorage?.setItem(KEY, id)
  } catch {
    /*
     * The write failed and the choice will not survive a reload. The in-memory
     * value below is still updated, so the map the student is looking at
     * changes immediately -- a refusal to update the screen because storage is
     * full would be a worse answer than a choice that does not persist.
     */
  }
  for (const listener of listeners) listener()
}

export function useExamChoice(): [ExamChoiceId | null, (id: ExamChoiceId | null) => void] {
  const value = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    read,
    () => null,
  )

  return [value, useCallback(setExamChoice, [])]
}
