/* A lesson written by a model running on this machine.
 *
 * WHY THIS EXISTS
 *   `/api/lesson` was the one path that could not be verified here: it needed
 *   an Anthropic key, and there is none. The teaching screen was built, tested
 *   and shipped against a port that had never once returned a real lesson.
 *   Ollama runs locally, needs no key, and honours a JSON schema, so the whole
 *   chain can be proved end to end on a laptop.
 *
 * WHAT IT DELIBERATELY IS NOT
 *   A second product. The prompt and the schema come from `prompt.ts`, shared
 *   with the Anthropic client; this file supplies the TRANSPORT and nothing
 *   else. A provider carrying its own prompt would describe a different lesson
 *   within a month -- the exact shape this project has already fixed three
 *   times in one session.
 */

import { LESSON_SCHEMA, SYSTEM, briefFor, type LessonBrief } from './prompt.ts'
import type { FetchLike } from './model.ts'

/** Where the daemon listens by default. Loopback: a model server that answers
 *  the local network is a model server anyone on it can spend. */
export const DEFAULT_OLLAMA_ENDPOINT = 'http://127.0.0.1:11434'

/**
 * The same schema, in a form Ollama's grammar compiler can actually accept.
 *
 * PROVEN BOTH WAYS AGAINST THE REAL DAEMON:
 *
 *     {"type":"string","maxLength":2000}  ->  400 failed to parse grammar
 *     {"type":"string","maxLength":120}   ->  200
 *
 * Ollama turns a JSON schema into a GBNF grammar, and a bounded repetition that
 * long blows its budget. On the full schema the ceiling lands near 1992
 * characters, which is not a clean limit -- it is a shared complexity budget
 * that one long string tips over.
 *
 * ONLY THE TWO KEYS THAT BREAK IT ARE REMOVED, and only from the grammar. The
 * bounds are still enforced twice: `validateLesson` in the handler, and again
 * in the canvas before a word reaches a student. The sampler stops shaping the
 * length; the product still refuses a lesson that breaks it.
 *
 * Strip more than this and the model is free to invent a block kind the canvas
 * cannot render, so `pattern`, `enum`, `required`, `additionalProperties`,
 * `minItems` and `maxItems` all stay.
 *
 * Copies rather than mutating: the same schema object goes to Anthropic, which
 * has no grammar problem and should keep its bounds.
 */
export function grammarSafe(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(grammarSafe)
  if (typeof schema !== 'object' || schema === null) return schema

  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === 'maxLength' || key === 'minLength') continue
    out[key] = grammarSafe(value)
  }
  return out
}

export interface OllamaOptions {
  /** A tag the daemon has already pulled, e.g. `qwen2.5:7b`. */
  readonly model: string
  readonly endpoint?: string
  readonly fetchImpl?: FetchLike
}

export interface ModelLike {
  lesson(brief: LessonBrief): Promise<unknown>
}

export function createOllamaModel(options: OllamaOptions): ModelLike {
  const endpoint = (options.endpoint ?? DEFAULT_OLLAMA_ENDPOINT).replace(/\/+$/, '')
  const doFetch: FetchLike = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike)

  return {
    async lesson(brief) {
      let response
      try {
        response = await doFetch(`${endpoint}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: options.model,
            /* One whole answer, not a stream. The handler validates a complete
               LessonSpec, and a half-parsed lesson is exactly what the
               validator exists to refuse. */
            stream: false,
            /* The SAME schema the Anthropic client sends. The shape of a lesson
               belongs to the product, not to whichever model wrote it. */
            /* The product's schema, minus the two keys Ollama cannot compile.
               `validateLesson` still enforces them, twice. */
            format: grammarSafe(LESSON_SCHEMA),
            messages: [
              { role: 'system', content: SYSTEM },
              { role: 'user', content: briefFor(brief) },
            ],
          }),
        })
      } catch {
        /* Assigns a result and throws: the failure changes what happens next
           rather than being noted and stepped over. The daemon being down is
           the overwhelmingly common cause and is named, because "fetch failed"
           tells a person nothing they can act on. */
        throw new Error(
          `Ollama could not be reached at ${endpoint}. Is it running? Start it with: ollama serve`,
        )
      }

      if (!response.ok) {
        if (response.status === 404) {
          /* The single most common setup mistake. A bare 404 does not tell you
             that pulling the model is the fix. */
          throw new Error(
            `Ollama does not have the model "${options.model}". Pull it first: ollama pull ${options.model}`,
          )
        }
        /* The status is kept because an outage and a bad request need different
           responses. The upstream body is not forwarded, for the same reason it
           is not forwarded from Anthropic. */
        throw new Error(`Ollama returned status ${response.status}`)
      }

      const payload: unknown = await response.json()
      const content = (payload as { message?: { content?: unknown } }).message?.content
      if (typeof content !== 'string' || content.trim() === '') {
        throw new Error('Ollama returned a reply with no content')
      }

      try {
        return JSON.parse(content)
      } catch {
        /* A small local model can ignore the schema and answer in prose. Better
           a clear failure naming the model than a validation error three layers
           away that blames the lesson. */
        throw new Error(
          `Ollama model "${options.model}" returned text that is not JSON. A larger model usually fixes this.`,
        )
      }
    },
  }
}
