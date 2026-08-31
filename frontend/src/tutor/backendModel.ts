/*
 * THE TUTOR'S MODEL PORT THAT HOLDS NO CREDENTIAL.
 *
 * WHAT WAS WRONG. `TutorView` built its model with
 * `httpModel({ endpoint: VITE_TUTOR_ENDPOINT, apiKey: VITE_TUTOR_KEY })`. Every
 * `VITE_*` value is compiled into the JavaScript a browser downloads, so
 * `VITE_TUTOR_KEY` was a PUBLISHED credential: readable by anyone who opened
 * the bundle, and repairable only by rotating it.
 *
 * WHAT THIS DOES INSTEAD. It posts the question to this project's own server at
 * `/api/ask`. The server already holds the key --- `server/provider.ts` reads it
 * from the process environment and `server/index.ts` lists it in the scrub set
 * --- so the browser sends a question and receives a lesson. It never sends a
 * key because it never has one.
 *
 * EVERY FAILURE PATH THROWS, and that is deliberate. `loop.ts` catches around
 * `ports.model.generate` and produces an answer that says it failed, with
 * `degraded` set, so the student sees an honest refusal. The one thing that
 * must never happen is returning a plausible empty string, because verification
 * downstream would then grade it as though it were an answer.
 */
/* THROUGH `../agent`, NOT `../agent/ports/httpModel`. `index.ts` is the agent
   area's only declared entry point, and a product file that reaches past it
   leaves the deep module unreachable from any entry — the reachability gate
   then calls it an orphan, and it is right to. */
import { buildPrompt } from '../agent'
import type { GenerateRequest, ModelPort } from '../agent/kernel/loop'

/** The one route this port talks to. Exported so a test cannot drift from it. */
export const ASK_PATH = '/api/ask'

const DEFAULT_TIMEOUT_MS = 60_000
/** Enough of the server's complaint to act on, not enough to fill a log. */
const BODY_SNIPPET = 300

export interface BackendModelOptions {
  /** Injected for tests. Defaults to the platform `fetch`. */
  readonly fetchImpl?: typeof fetch
  /** Injected for tests. Defaults to the build's own environment. */
  readonly env?: Record<string, string | undefined>
  readonly timeoutMs?: number
}

/** A block as `/api/ask` returns one. Only the readable parts are read. */
interface Block {
  readonly title?: unknown
  readonly body?: unknown
}

function buildEnv(): Record<string, string | undefined> {
  return import.meta.env as unknown as Record<string, string | undefined>
}

/**
 * Where the backend lives.
 *
 * Same origin by default, which is the normal case: the dev server proxies
 * `/api` and production serves both from one host. `VITE_API_BASE` exists for
 * the split deployment, and is a PUBLIC value --- an origin, never a secret.
 */
function askUrl(env: Record<string, string | undefined>): string {
  const base = (env['VITE_API_BASE'] ?? '').trim()
  return base ? `${base.replace(/\/+$/, '')}${ASK_PATH}` : ASK_PATH
}

/** The readable text of a lesson, in the order the server wrote it. */
function readableText(lesson: { blocks?: unknown }): string {
  const blocks = Array.isArray(lesson.blocks) ? (lesson.blocks as Block[]) : []
  return blocks
    .map((b) =>
      [b?.title, b?.body]
        .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
        .join('\n'),
    )
    .filter((text) => text !== '')
    .join('\n\n')
}

export function backendModel(options: BackendModelOptions = {}): ModelPort {
  const {
    fetchImpl,
    env = buildEnv(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options

  const url = askUrl(env)
  const doFetch = fetchImpl ?? globalThis.fetch

  return {
    async generate(req: GenerateRequest): Promise<string> {
      /* The agent's whole prompt travels as the question. `/api/ask` wraps it in
         its own teaching rules, so only the USER half is sent: the claims, the
         constraints and any repair notes. Dropping the claims would leave the
         model answering from its own weights while verification downstream
         grades it against sources it never saw. */
      const { user } = buildPrompt(req)

      const abort = new AbortController()
      const timer = setTimeout(() => abort.abort(), timeoutMs)

      let response: Response
      try {
        response = await doFetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ question: user }),
          signal: abort.signal,
        })
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') {
          throw new Error(`${url} did not answer within ${timeoutMs}ms.`)
        }
        throw new Error(`${url} is unreachable (${(error as Error)?.message ?? error}).`)
      } finally {
        clearTimeout(timer)
      }

      const raw = await response.text()
      let payload: { lesson?: { blocks?: unknown }; error?: unknown }
      try {
        payload = JSON.parse(raw) as typeof payload
      } catch {
        payload = {}
      }

      if (!response.ok) {
        const said = typeof payload.error === 'string' && payload.error
          ? payload.error
          : raw.slice(0, BODY_SNIPPET)
        throw new Error(`${url} refused with ${response.status}: ${said}`)
      }

      const lesson = payload.lesson
      if (!lesson || typeof lesson !== 'object') {
        throw new Error(`${url} answered ${response.status} but did not return a lesson.`)
      }

      const text = readableText(lesson)
      if (text === '') {
        /* A 200 whose lesson is all charts and no prose. Returning '' here would
           hand verification an empty answer to grade, and it would report on it
           as though the model had said nothing on purpose. */
        throw new Error(`${url} returned a lesson with no readable text in it.`)
      }
      return text
    },
  }
}
