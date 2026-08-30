/* A lesson written by a large open model, served by Groq.
 *
 * WHY THIS EXISTS
 *   Ollama proved the chain end to end on a laptop, and that is all it can do.
 *   Measured 2026-08-31, `qwen2.5:3b` answering a real `/api/lesson` request:
 *
 *       HTTP 502 in 12.6s
 *       "the model returned a lesson that failed validation"
 *         blocks.0.progression  Required
 *         blocks.0.mentalModel  Required
 *         blocks.0              Unrecognized key(s) in object
 *
 *   The model was reachable and it answered. It simply could not hold the
 *   lesson schema: it dropped required fields and invented others, and
 *   `validateLesson` refused it -- correctly, because a half-shaped lesson is
 *   worse than none. A 3B model on a laptop is not going to hold that schema,
 *   and no amount of prompting changes the size of the model.
 *
 *   Groq serves models a laptop cannot run, behind an OpenAI-compatible API.
 *   That is the whole reason for this file.
 *
 * WHAT IT DELIBERATELY IS NOT
 *   A second product. The prompt and the schema come from `prompt.ts`, shared
 *   with the Anthropic and Ollama clients; this file supplies the TRANSPORT and
 *   nothing else. A provider carrying its own prompt would describe a different
 *   lesson within a month.
 *
 * WHY THE KEY NEVER APPEARS IN AN ERROR
 *   Every throw below names the status or the situation and never the
 *   credential. A key pasted into a log is a key that has leaked, and the log
 *   is the place people paste into an issue without reading it twice.
 */

import { LESSON_SCHEMA, SYSTEM, briefFor, type LessonBrief } from './prompt.ts'
import type { FetchLike } from './model.ts'
import type { ModelLike } from './ollama.ts'

/** Groq's OpenAI-compatible surface. The `/openai/` segment is not optional. */
export const DEFAULT_GROQ_ENDPOINT = 'https://api.groq.com/openai/v1'

export interface GroqOptions {
  readonly apiKey: string
  /** A model Groq serves, e.g. `openai/gpt-oss-120b`. */
  readonly model: string
  readonly endpoint?: string
  readonly fetchImpl?: FetchLike
}

export function createGroqModel(options: GroqOptions): ModelLike {
  const endpoint = (options.endpoint ?? DEFAULT_GROQ_ENDPOINT).replace(/\/+$/, '')
  const doFetch: FetchLike = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike)

  return {
    async lesson(brief: LessonBrief) {
      let response
      try {
        response = await doFetch(`${endpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify({
            model: options.model,
            /* One whole answer, not a stream. The handler validates a complete
               LessonSpec, and a half-parsed lesson is exactly what the
               validator exists to refuse. */
            stream: false,
            /* `json_object`, NOT `json_schema`, AND THAT WAS MEASURED.
             *
             * Sending the schema would be better: it constrains the sampler so
             * the model cannot return the wrong shape. Groq's structured mode
             * accepts only a restricted subset of JSON Schema, and LessonSpec
             * is a nine-way discriminated union with optional fields and string
             * bounds, which is outside it. Probed against the live API on
             * 2026-08-31 with the real key:
             *
             *     no response_format        HTTP 200
             *     json_object               HTTP 200
             *     json_schema (tiny, strict) HTTP 200
             *     json_schema (LessonSpec)   rejected
             *
             * So the shape is asked for in the prompt and ENFORCED after the
             * fact by `validateLesson`, which the handler already runs on every
             * lesson and which refuses a wrong one rather than repairing it.
             * That is the same guarantee, one layer later. */
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: SYSTEM },
              /* THE PROTOCOL REQUIRES THE WORD "JSON", AND THIS IS WHY IT IS
               * HERE RATHER THAN IN prompt.ts.
               *
               * OpenAI-compatible `json_object` mode refuses any request whose
               * messages never mention JSON. Measured against the live API on
               * 2026-08-31: the shared SYSTEM prompt contains the word zero
               * times, and every request came back HTTP 400 with no other
               * explanation reaching the browser.
               *
               * It is a fact about THIS TRANSPORT, not about how a lesson
               * should be taught, so it lives in the transport. Putting it in
               * `prompt.ts` would change what the Anthropic and Ollama clients
               * send in order to satisfy a third provider's wire format. */
              {
                role: 'system',
                content:
                  'Reply with a single JSON object and nothing else. It MUST validate ' +
                  'against this JSON Schema exactly — every required field present, no ' +
                  'extra keys, and "kind" only ever one of the listed literals:\n' +
                  JSON.stringify(LESSON_SCHEMA) +
                  /* THE TWO RULES THIS MODEL BREAKS, NAMED EXPLICITLY.
                   *
                   * `checkTeaching` refuses a lesson for either of these and
                   * the shared SYSTEM prompt mentions "exemplifies" exactly
                   * once, which measurably was not enough: gpt-oss-120b
                   * returned structurally perfect lessons whose every example
                   * pointed at nothing, three times running on 2026-08-31.
                   *
                   * Stated here rather than in prompt.ts because it is a
                   * weakness of this model, and rewriting the shared prompt
                   * would change what Anthropic and Ollama are told in order to
                   * compensate for a third one. */
                  '\n\nTWO RULES THAT WILL GET THE LESSON REJECTED IF BROKEN:\n' +
                  '1. EVERY block with "role":"example" MUST have a matching entry in ' +
                  '"relations" of the form {"from":"<that block id>","to":"<the block it ' +
                  'illustrates>","kind":"exemplifies"}. Exactly one, never zero.\n' +
                  '2. The lesson MUST contain exactly one block with "role":"definition" ' +
                  'first and exactly one with "role":"summary" last.',
              },
              { role: 'user', content: briefFor(brief) },
            ],
          }),
        })
      } catch (error) {
        /* LOGGED SERVER-SIDE, NEVER SENT TO THE CLIENT.
         *
         * `handler.ts` drops the upstream text on purpose, because it can carry
         * the credential that was rejected. That is right, and it also made
         * this failure impossible to diagnose: the browser said "the model
         * could not be reached" for a network outage, a bad key, a bad model
         * name and a malformed body alike. The operator needs the difference;
         * the student must not see any of it. So the reason goes to stderr,
         * where the process already scrubs known secrets, and the thrown
         * message stays generic. */
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`[groq] request to ${endpoint} failed: ${reason}`)
        throw new Error(
          `Groq could not be reached at ${endpoint}. Check the network connection.`,
        )
      }

      if (!response.ok) {
        /* Server-side only, same reasoning as the catch above: the operator
           needs to know WHICH refusal this was, and the student must not. */
        console.error(`[groq] ${options.model} returned HTTP ${response.status}`)
        if (response.status === 401 || response.status === 403) {
          /* The single most common setup mistake, and the one a bare 401 does
             not explain. The key itself is NOT echoed. */
          throw new Error(
            'Groq rejected the API key. Check GROQ_API_KEY is a current key from console.groq.com.',
          )
        }
        if (response.status === 404) {
          throw new Error(
            `Groq does not serve the model "${options.model}". Check GROQ_MODEL against console.groq.com/docs/models.`,
          )
        }
        if (response.status === 429) {
          /* A rate limit is temporary and a bad key is not; telling them apart
             is the difference between waiting and changing something. */
          throw new Error('Groq rate limit reached. Wait a moment and ask again.')
        }
        /* The status is kept because an outage and a bad request need different
           responses. The upstream body is not forwarded, for the same reason it
           is not forwarded from Anthropic: it can quote the request back. */
        throw new Error(`Groq returned status ${response.status}`)
      }

      const payload: unknown = await response.json()
      const content = (payload as { choices?: { message?: { content?: unknown } }[] })
        .choices?.[0]?.message?.content
      if (typeof content !== 'string' || content.trim() === '') {
        console.error(`[groq] reply had no content. keys: ${Object.keys(payload as object).join(',')}`)
        throw new Error('Groq returned a reply with no content')
      }

      try {
        return JSON.parse(content) as unknown
      } catch {
        console.error(`[groq] reply was not JSON. first 200 chars: ${content.slice(0, 200)}`)
        /* The model answered but not with JSON. Distinct from "no content":
           this one means the schema constraint did not hold, which is a fact
           about the model rather than about the connection. */
        throw new Error('Groq returned a reply that was not the JSON lesson shape')
      }
    },
  }
}
