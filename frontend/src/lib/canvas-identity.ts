/* CANVAS IDENTITY — what the board is about, resolved once, before it draws.
 *
 * INVARIANT: no canvas object may exist without a chapterId and a conceptId.
 *
 * That is not bookkeeping. An object anchored only to screen coordinates cannot
 * be replayed, cannot be restored after a refresh, cannot have its camera
 * remembered, and cannot be reasoned about when the learner asks "why is this
 * arrow here?". The identity is what makes every later guarantee possible, so
 * it is resolved at the door and refused if absent.
 *
 * THREE WAYS IN, ONE RESULT.
 *   1. `/canvas/:chapterId/:conceptId`  — a Start action; identity is explicit.
 *   2. `/canvas`                        — a returning learner; the store knows
 *                                         what they last touched.
 *   3. neither resolves                 — a real, accessible selection state.
 *
 * The third is deliberately NOT a redirect to /today. Bouncing a learner who
 * typed a URL, or whose progress was cleared in another tab, teaches them the
 * app is broken. It says what happened and offers the way forward.
 */

import type { Chapter, Concept, Subject } from '../types'

export interface CanvasIdentity {
  subject: Subject
  chapter: Chapter
  concept: Concept
}

export type IdentityResolution =
  | { kind: 'resolved'; identity: CanvasIdentity; canonicalPath: string }
  | { kind: 'needs-selection'; reason: string }

export interface ResolveInput {
  chapterId?: string
  conceptId?: string
  /** The learner's enrolled subjects, already filtered. */
  subjects: Subject[]
  /** `store.lastTouched()`; null when nothing has been started yet. */
  lastTouched: { chapterId: string; conceptId: string } | null
}

function find(subjects: Subject[], chapterId: string, conceptId: string): CanvasIdentity | null {
  for (const subject of subjects) {
    for (const chapter of subject.chapters) {
      if (chapter.id !== chapterId) continue
      const concept = chapter.concepts.find((c) => c.id === conceptId)
      if (concept) return { subject, chapter, concept }
    }
  }
  return null
}

export function resolveCanvasIdentity(input: ResolveInput): IdentityResolution {
  const { subjects, chapterId, conceptId, lastTouched } = input

  if (chapterId && conceptId) {
    const identity = find(subjects, chapterId, conceptId)
    if (identity) {
      return { kind: 'resolved', identity, canonicalPath: `/canvas/${chapterId}/${conceptId}` }
    }
    // An explicit id that does not resolve is reported as itself. Silently
    // falling back to lastTouched would open a different concept than the URL
    // names, and the learner would have no way to know.
    return {
      kind: 'needs-selection',
      reason: `No concept "${conceptId}" in chapter "${chapterId}" among your subjects.`,
    }
  }

  if (lastTouched) {
    const identity = find(subjects, lastTouched.chapterId, lastTouched.conceptId)
    if (identity) {
      return {
        kind: 'resolved',
        identity,
        canonicalPath: `/canvas/${lastTouched.chapterId}/${lastTouched.conceptId}`,
      }
    }
    return {
      kind: 'needs-selection',
      reason: 'The concept you last opened is no longer in your subjects.',
    }
  }

  return {
    kind: 'needs-selection',
    reason: 'Nothing has been started yet, so there is no concept to open here.',
  }
}

/** The single place a Start action builds its destination, so the route shape
 *  lives in one file rather than at every call site. */
export function canvasPath(chapterId: string, conceptId: string): string {
  return `/canvas/${chapterId}/${conceptId}`
}
