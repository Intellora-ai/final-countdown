/**
 * A typed client for the Learning OS HTTP API.
 *
 * WHY THIS EXISTS NOW AND NOT IN PHASE 4
 * --------------------------------------
 * Phase 4 added `VITE_API_BASE` as a configuration seam and said plainly that
 * nothing used it. Pact changes that requirement: a consumer contract records
 * what the frontend ACTUALLY NEEDS from each endpoint, and a contract written
 * for a consumer that does not exist is fiction. It would pass provider
 * verification forever while describing calls nobody makes.
 *
 * So this is a real client, and the contract in `pacts/` is generated from
 * exercising it.
 *
 * WHAT IS DELIBERATELY NOT CLAIMED
 * --------------------------------
 * The canvas does not call this yet. `CanvasRoute` is synchronous and renders
 * imported JSON; making it load a lesson over HTTP is a change to how the
 * canvas renders, with its own tests, and it is not this phase. What this file
 * gives Phase 8 is a consumer whose needs are real and checkable.
 *
 * WHY ONLY FIVE OPERATIONS
 * ------------------------
 * These are the ones a CANVAS needs: what exists, what this learner knows, what
 * to teach next, and a lesson to render. Creating learners and recording
 * attempts belong to a tutor runtime, not to a rendering surface. Pact records
 * what a consumer needs, so writing contracts for calls this consumer never
 * makes would over-constrain the provider -- the API could not then change
 * those endpoints without breaking a contract nobody depends on.
 */

import { apiBase } from '../canvas/api/config'

/** Thrown when the API is reachable and answers with a failure. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`learning-os API ${status}: ${detail}`)
    this.name = 'ApiError'
  }
}

/** Thrown when no `VITE_API_BASE` is configured. */
export class ApiNotConfigured extends Error {
  constructor() {
    super(
      'VITE_API_BASE is not set, so there is no Learning OS API to call. ' +
        'This is the default: the canvas renders committed lessons unless an ' +
        'API is configured.',
    )
    this.name = 'ApiNotConfigured'
  }
}

export interface Health {
  readonly status: 'ok' | 'degraded'
  readonly database: 'up' | 'down' | 'not_configured'
  readonly knowledge_version: string
}

export interface ConceptSummary {
  readonly concept_id: string
  readonly name: string
  readonly definition: string
  readonly subskill_count: number
  readonly prerequisites: readonly string[]
}

export interface ConceptPage {
  readonly items: readonly ConceptSummary[]
  readonly total: number
  readonly limit: number
  readonly offset: number
}

export interface SkillMastery {
  readonly skill_id: string
  readonly estimate: number
  readonly confidence: number
  readonly evidence_count: number
  readonly evidence_diversity: number
  readonly state: 'unknown' | 'developing' | 'competent' | 'mastered'
  readonly last_updated: string
}

export interface MasteryReport {
  readonly learner_id: string
  readonly skills: readonly SkillMastery[]
}

export interface NextAction {
  readonly learner_id: string
  readonly action: string
  readonly skill_id: string | null
  readonly reason: string
}

export interface LessonEmitted {
  readonly lesson_id: string
  readonly target_skill: string
  readonly question: string
  readonly blocks: readonly Record<string, unknown>[]
  readonly relations: readonly Record<string, string>[]
  readonly subject?: string
}

export interface ClientOptions {
  /** Overridden in tests, where Pact stands up a mock provider on a real port. */
  readonly baseUrl?: string
  /** Overridden in tests. Defaults to the global fetch. */
  readonly fetchImpl?: typeof fetch
}

function resolveBase(options: ClientOptions): string {
  const base = options.baseUrl ?? apiBase()
  if (base === null) throw new ApiNotConfigured()
  return base
}

/**
 * One request, with the error handling every caller would otherwise repeat.
 *
 * THE FAILURE THIS SHAPE PREVENTS: a helper that returned `null` on a non-2xx
 * would make "the learner knows nothing" and "the request failed" the same
 * value at every call site. That is the masked-error bug the database tests
 * exist to catch, arriving from the other direction.
 */
async function request<T>(path: string, options: ClientOptions): Promise<T> {
  const doFetch = options.fetchImpl ?? fetch
  const response = await doFetch(`${resolveBase(options)}${path}`, {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    // The API declares `{"detail": string}` for every deliberate refusal and
    // `{"detail": [...]}` for its own validation errors. Both are read here so
    // a caller gets something useful either way, rather than "[object Object]".
    let detail = response.statusText
    try {
      const body: unknown = await response.json()
      const raw = (body as { detail?: unknown }).detail
      detail = typeof raw === 'string' ? raw : JSON.stringify(raw)
    } catch {
      // A non-JSON error body is itself information; the status line stands.
      // Deliberately not rethrown: the useful error is the one below, carrying
      // the status code, not a parse failure about the error document.
      detail = response.statusText
    }
    throw new ApiError(response.status, detail)
  }

  return (await response.json()) as T
}

export function getHealth(options: ClientOptions = {}): Promise<Health> {
  return request<Health>('/health', options)
}

export function listConcepts(
  { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {},
  options: ClientOptions = {},
): Promise<ConceptPage> {
  return request<ConceptPage>(`/concepts?limit=${limit}&offset=${offset}`, options)
}

export function getMastery(
  learnerId: string,
  options: ClientOptions = {},
): Promise<MasteryReport> {
  return request<MasteryReport>(
    `/learners/${encodeURIComponent(learnerId)}/mastery`,
    options,
  )
}

export function getNextAction(
  learnerId: string,
  options: ClientOptions = {},
): Promise<NextAction> {
  return request<NextAction>(
    `/learners/${encodeURIComponent(learnerId)}/next`,
    options,
  )
}

export async function requestLesson(
  body: { skill_id: string; question: string },
  options: ClientOptions = {},
): Promise<LessonEmitted> {
  const doFetch = options.fetchImpl ?? fetch
  const response = await doFetch(`${resolveBase(options)}/lessons`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    let detail = response.statusText
    try {
      const parsed: unknown = await response.json()
      const raw = (parsed as { detail?: unknown }).detail
      detail = typeof raw === 'string' ? raw : JSON.stringify(raw)
    } catch {
      detail = response.statusText
    }
    throw new ApiError(response.status, detail)
  }

  return (await response.json()) as LessonEmitted
}
