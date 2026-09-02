/**
 * THE BROWSER'S SIDE OF /api/memory. See `memoryClient.test.ts` for why this
 * file exists at all: the server's memory was built, tested and exposed, and
 * nothing in the browser had ever called it.
 *
 * It reads on open and writes after every change, and it NEVER throws: a
 * memory that cannot be reached is a memory that is not there, and the lesson
 * goes on from the local copy. The server is the truth; this is how the truth
 * gets written.
 */

import type { TeachProgress } from '../teach/teachStore'

const BROWSER_ID_KEY = 'canvas-browser-id'

/** A stand-in for when storage refuses; stable for this page's life only. */
let fallbackId: string | null = null

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes)
  crypto.getRandomValues(buffer)
  return Array.from(buffer, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * WHICH `tabId` THE SERVER IS TOLD. A per-tab id would mean closing the tab
 * loses the topic's memory -- the opposite of what was asked for. So it is
 * per BROWSER: minted once, kept in localStorage, the same across reloads and
 * tabs. Two tabs on one topic therefore share one memory, and different
 * topics stay entirely apart. (Decided 2026-09-02.)
 */
export function browserId(): string {
  try {
    const existing = window.localStorage.getItem(BROWSER_ID_KEY)
    if (existing !== null && /^[0-9a-f]{16,}$/.test(existing)) return existing
    const minted = randomHex(16)
    window.localStorage.setItem(BROWSER_ID_KEY, minted)
    return minted
  } catch {
    fallbackId ??= randomHex(16)
    return fallbackId
  }
}

function looksLikeProgress(value: unknown, lessonId: string): value is TeachProgress {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    record['lessonId'] === lessonId &&
    typeof record['revealed'] === 'number' &&
    Array.isArray(record['asked']) &&
    typeof record['questionsAsked'] === 'number' &&
    typeof record['emptyAnswers'] === 'number'
  )
}

/** What the server remembers for this lesson in this browser, or null. */
export async function readProgress(lessonId: string): Promise<TeachProgress | null> {
  try {
    const query = new URLSearchParams({ tabId: browserId(), lessonId })
    const response = await fetch(`/api/memory?${query.toString()}`)
    if (!response.ok) return null
    const body = (await response.json()) as { record?: unknown }
    const record = body?.record
    if (!looksLikeProgress(record, lessonId)) return null
    return {
      ...record,
      draft: typeof record.draft === 'string' ? record.draft : '',
      struggleReported: record.struggleReported === true,
    }
  } catch {
    return null
  }
}

/** Tell the server. A refusal or an outage changes nothing here. */
export async function writeProgress(progress: TeachProgress): Promise<void> {
  try {
    const response = await fetch('/api/memory', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tabId: browserId(), lessonId: progress.lessonId, record: progress }),
    })
    if (response.status === 409) {
      /* The server holds something further along than this. Said, not hidden:
         the next read adopts it. */
      console.warn('[memory] the server remembers more than this browser; keeping the server')
    }
  } catch {
    /* Offline, or memory is off. The local copy carries on. */
  }
}

/* ---------------------------------------------------------------------- */
/* A topic's canvas: everything learned on it, in order                    */
/* ---------------------------------------------------------------------- */

/**
 * ONE THING ON A CANVAS: a lesson, a correction, a note she made.
 *
 * WHAT CHANGED, AND WHY IT HAD TO. This used to be `{question, lesson,
 * teaching}` -- no id, no time, no position -- and the whole canvas was one
 * array PUT back in full on every save. An audit found sixteen ways that lost
 * a term of work, and they came down to three: a failed read became an empty
 * canvas, every save replaced everything, and a cap of forty deleted lesson
 * one when lesson forty-one arrived.
 *
 * So an artifact now has an identity the server gave it. `seq` is its place in
 * the canvas, assigned by the database, unique and permanent -- ordering is a
 * fact rather than an index in whatever array this page happens to hold.
 */
export interface CanvasArtifact {
  /** Its place in this canvas. Assigned by the server, never by the browser. */
  readonly seq: number
  /** When it landed, on the server's clock. */
  readonly createdAt: string
  readonly kind: ArtifactKind
  /** What she typed to bring it about. */
  readonly question: string
  /** The validated lesson, or whatever this kind of artifact carries. */
  readonly payload: unknown
  readonly teaching: string
  /** For a correction: the `seq` of the artifact it corrects. */
  readonly corrects?: number
}

export type ArtifactKind = 'scope' | 'lesson' | 'answer' | 'correction' | 'note'

/** What the browser knows about a new artifact. The server adds the rest. */
export interface NewArtifact {
  readonly kind: ArtifactKind
  readonly question: string
  readonly payload: unknown
  readonly teaching: string
  readonly corrects?: number
  /**
   * The pages this lesson was written from.
   *
   * Recorded so a lesson can be found again when one of them changes. A lesson
   * about a statistic, a policy or a record was true when it was written and
   * may not be now, and nothing about the lesson itself shows that. See
   * `server/assurance.ts`.
   */
  readonly sources?: readonly string[]
}

/**
 * The answer to "what is on this canvas".
 *
 * THREE STATES, NOT TWO, AND THIS IS LAW D. "I read it and there is nothing"
 * and "I could not read it" are different facts about the world, and the
 * shipped client returned `[]` for both. One dropped connection then looked
 * exactly like a new student, and the next save wrote that emptiness back over
 * everything she had. A type that cannot express the difference is a type that
 * guarantees the bug.
 */
/**
 * A lesson on this canvas that something real has put in question.
 *
 * MONITOR AFTER: a canvas is permanent, so a mistake that slipped past the
 * checks made before a lesson was drawn stays in front of her for months. The
 * server works these out from what she has actually said -- never from a
 * model's second thoughts. See `server/assurance.ts`.
 */
export interface Questioned {
  readonly artifactSeq: number
  readonly kind: string
  readonly why: string
}

export type CanvasRead =
  | { readonly ok: true; readonly artifacts: readonly CanvasArtifact[]; readonly questioned: readonly Questioned[] }
  | { readonly ok: false; readonly reason: string }

/** The answer to "did that get saved". Never silently discarded. */
export type CanvasAppend =
  | { readonly ok: true; readonly seq: number }
  | { readonly ok: false; readonly reason: string }

/* THE CANVAS BUILDS UP (decided 2026-09-02) and NOTHING ON IT IS EVER REPLACED
   (decided 2026-09-03): everything learned on a topic stays on that topic's
   canvas. It lives under `<topic>#canvas`, one database row per artifact,
   behind /api/canvas -- a route with no PUT and no DELETE, so the only thing
   that can happen to a canvas is that it gets longer. */
const canvasKey = (topicId: string): string => `${topicId}#canvas`

function anArtifact(row: unknown, seq: number, createdAt: string): CanvasArtifact {
  const kept = (typeof row === 'object' && row !== null ? row : {}) as Record<string, unknown>
  const kind = kept['kind']
  return {
    seq,
    createdAt,
    /* A kind nobody recognises is read as a lesson rather than dropped. An
       artifact from a newer build is still HER work, and Law C says it stays. */
    kind: KINDS.has(kind as ArtifactKind) ? (kind as ArtifactKind) : 'lesson',
    question: typeof kept['question'] === 'string' ? kept['question'] : '',
    payload: kept['payload'],
    teaching: typeof kept['teaching'] === 'string' ? kept['teaching'] : 'lesson',
    ...(typeof kept['corrects'] === 'number' ? { corrects: kept['corrects'] } : {}),
  }
}

const KINDS = new Set<ArtifactKind>(['scope', 'lesson', 'answer', 'correction', 'note'])

/**
 * What this topic's canvas holds. A failure says so; it never says "empty".
 *
 * There is no catch that turns an outage into a value here, and that absence
 * is the point: see `CanvasRead`.
 */
export async function readCanvas(topicId: string): Promise<CanvasRead> {
  const query = new URLSearchParams({ tabId: browserId(), lessonId: canvasKey(topicId) })
  let response: Response
  try {
    response = await fetch(`/api/canvas?${query.toString()}`)
  } catch {
    return { ok: false, reason: 'the canvas could not be reached just now' }
  }
  if (!response.ok) {
    return { ok: false, reason: `the canvas could not be read (${response.status})` }
  }
  let body: { artifacts?: unknown; needsAnotherLook?: unknown }
  try {
    body = (await response.json()) as { artifacts?: unknown; needsAnotherLook?: unknown }
  } catch {
    return { ok: false, reason: 'the canvas came back in a shape this page could not read' }
  }
  const rows = body?.artifacts
  if (!Array.isArray(rows)) {
    return { ok: false, reason: 'the canvas came back without its artifacts' }
  }
  /* EVERY ROW IS KEPT, INCLUDING ONE THAT MAKES NO SENSE. The shipped client
     ran `.every()` over the list and discarded ALL of it for one bad entry,
     then wrote the loss back. One damaged lesson is one damaged lesson. */
  const raised = Array.isArray(body?.['needsAnotherLook'] as unknown) ? (body['needsAnotherLook'] as unknown[]) : []
  return {
    ok: true,
    questioned: raised.flatMap((row) => {
      const kept = (typeof row === 'object' && row !== null ? row : {}) as Record<string, unknown>
      return typeof kept['artifactSeq'] === 'number'
        ? [{ artifactSeq: kept['artifactSeq'], kind: String(kept['kind'] ?? ''), why: String(kept['why'] ?? '') }]
        : []
    }),
    artifacts: rows.map((row, at) => {
      const kept = (typeof row === 'object' && row !== null ? row : {}) as Record<string, unknown>
      return anArtifact(
        kept['artifact'],
        typeof kept['seq'] === 'number' ? kept['seq'] : at + 1,
        typeof kept['createdAt'] === 'string' ? kept['createdAt'] : '',
      )
    }),
  }
}

/**
 * Add one thing to the end of this canvas.
 *
 * It cannot replace and it cannot shorten: there is no request this function
 * could make that would do either. A failure is RETURNED rather than swallowed
 * -- the shipped version never even looked at the response status, so past the
 * old size ceiling every save failed forever and nothing on screen ever said so.
 */
export async function appendToCanvas(topicId: string, artifact: NewArtifact): Promise<CanvasAppend> {
  let response: Response
  try {
    response = await fetch('/api/canvas', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tabId: browserId(), lessonId: canvasKey(topicId), artifact }),
    })
  } catch {
    return { ok: false, reason: 'this could not be saved just now' }
  }
  if (!response.ok) {
    return { ok: false, reason: `this could not be saved (${response.status})` }
  }
  try {
    const body = (await response.json()) as { appended?: { seq?: unknown } }
    const seq = body?.appended?.seq
    if (typeof seq !== 'number') {
      return { ok: false, reason: 'the server did not say where this was saved' }
    }
    return { ok: true, seq }
  } catch {
    return { ok: false, reason: 'the server answered in a shape this page could not read' }
  }
}

/**
 * MOVE A PRE-STAGE-H CANVAS FORWARD, ONCE.
 *
 * Before the append-only store, a topic's canvas was ONE record at
 * `<topic>#canvas` holding an array of entries, replaced whole on every save.
 * Those records exist on real machines right now, holding real lessons, and a
 * change that silently stranded them would be the very failure this whole
 * stage is about.
 *
 * So the entries are appended as artifacts, in their original order, and the
 * old record is LEFT EXACTLY WHERE IT IS. Keeping it costs a few kilobytes and
 * means this can be run again, or not run at all, without anything being lost.
 *
 * Returns how many were moved. Zero for "there was nothing", and zero for "the
 * old record could not be read" -- because in both cases nothing was moved,
 * and the caller's next step is the same: read the artifacts and carry on.
 * A read it could not make must never become an append it should not do.
 */
export async function bringForwardTheOldCanvas(topicId: string): Promise<number> {
  let entries: unknown
  try {
    const query = new URLSearchParams({ tabId: browserId(), lessonId: canvasKey(topicId) })
    const response = await fetch(`/api/memory?${query.toString()}`)
    if (!response.ok) return 0
    const body = (await response.json()) as { record?: { entries?: unknown } | null }
    entries = body?.record?.entries
  } catch {
    return 0
  }
  if (!Array.isArray(entries) || entries.length === 0) return 0

  let moved = 0
  for (const entry of entries) {
    const kept = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>
    /* ONE AT A TIME AND IN ORDER, not in parallel: `seq` is assigned in the
       order the appends arrive, and her lessons must come back in the order
       she learnt them. */
    const saved = await appendToCanvas(topicId, {
      kind: 'lesson',
      question: typeof kept['question'] === 'string' ? kept['question'] : '',
      payload: kept['lesson'],
      teaching: typeof kept['teaching'] === 'string' ? kept['teaching'] : 'lesson',
    })
    /* A move that failed halfway stops rather than skipping ahead: appending
       the rest would put her lessons back in the wrong order, and the old
       record is still there for the next attempt. */
    if (!saved.ok) break
    moved += 1
  }
  return moved
}
