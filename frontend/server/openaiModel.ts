/* A model behind an OpenAI-compatible chat-completions endpoint.
 *
 * WHY THIS IS NOT `ollama.ts` WITH A HEADER ADDED.
 *
 * Ollama speaks its own `/api/chat`: the schema goes in `format`, and the reply
 * comes back at `message.content`. The OpenAI shape puts the schema request in
 * `response_format` and the reply at `choices[0].message.content`. Reusing the
 * ollama parser would read `undefined` out of a completely good answer and
 * blame the model for it.
 *
 * WHY IT EXISTS AT ALL.
 *
 * `/api/lesson` returned 502 for a reason that had nothing to do with teaching:
 * this server accepted `ANTHROPIC_API_KEY` or `OLLAMA_MODEL` and nothing else,
 * so the only working credential on the machine could not write a lesson. The
 * browser had a model configured. The server had none, and nothing said so.
 *
 * EVERY FAILURE NAMES WHAT TO DO ABOUT IT, for the reason `ollama.ts` gives:
 * "fetch failed" tells a person nothing they can act on. The 404 case is the
 * sharpest because it is the one that has actually happened -- a model id
 * withdrawn by its provider, reported for hours as a teaching failure.
 */

import { LESSON_SCHEMA, SYSTEM, briefFor, type LessonBrief } from './prompt.ts'
import type { FetchLike } from './model.ts'

export interface OpenAIModelOptions {
  readonly apiKey: string
  readonly model: string
  readonly endpoint: string
  readonly fetchImpl?: FetchLike
}

export interface OpenAIModel {
  lesson(brief: LessonBrief): Promise<unknown>
}

export function createOpenAIModel(options: OpenAIModelOptions): OpenAIModel {
  const doFetch: FetchLike = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike)

  return {
    async lesson(brief) {
      let response
      try {
        response = await doFetch(options.endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            /* Lowercase deliberately: the header name is case-insensitive on
               the wire, and a test that reads it back should not have to guess
               which casing this file happened to choose. */
            authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify({
            model: options.model,
            /* One whole answer, not a stream. The handler validates a complete
               LessonSpec, and a half-parsed lesson is exactly what the
               validator exists to refuse. */
            stream: false,
            /* Ask for JSON at generation time rather than validating prose
               afterwards. Constraining the output is cheaper and more reliable
               than refusing it, and the schema still runs downstream -- twice,
               as it does for every other provider. */
            response_format: { type: 'json_object' },
            /* Deterministic, so the same brief twice is the same lesson twice
               and a bug in one is reproducible. */
            temperature: 0,
            messages: [
              { role: 'system', content: `${SYSTEM}\n\nReply with JSON matching this schema:\n${JSON.stringify(LESSON_SCHEMA)}` },
              { role: 'user', content: briefFor(brief) },
            ],
          }),
        })
      } catch {
        /* Assigns nothing and throws: the failure changes what happens next
           rather than being noted and stepped over. The upstream error text is
           not forwarded, because it is the one place a URL with a token in it
           could surface. */
        throw new Error(
          `The model endpoint could not be reached at ${options.endpoint}. ` +
            `Check the URL and that this machine has network access.`,
        )
      }

      if (!response.ok) {
        if (response.status === 404) {
          /* THE CASE THAT HAS ACTUALLY HAPPENED. A provider retires a model id
             without notice; every call 404s; and a bare status sends the reader
             hunting a network fault for what is a dead string in a config
             file. */
          throw new Error(
            `The model "${options.model}" does not exist at ${options.endpoint}, or this ` +
              `key cannot reach it. Model ids are withdrawn without notice -- list the ` +
              `models the key can see and set one that is there.`,
          )
        }
        if (response.status === 401 || response.status === 403) {
          /* The key is NOT quoted. Naming the variable is actionable; echoing
             the credential would put it in every log that catches this. */
          throw new Error(
            `The model endpoint rejected the credential (status ${response.status}). ` +
              `The key in GROQ_API_KEY is missing, expired, or not valid for this endpoint.`,
          )
        }
        if (response.status === 429) {
          throw new Error(
            `The model endpoint is rate limiting this key (status 429). Wait, or use a ` +
              `local model with OLLAMA_MODEL.`,
          )
        }
        /* The status is kept because an outage and a bad request need different
           responses. The upstream body is not forwarded, for the same reason it
           is not forwarded from Anthropic. */
        throw new Error(`The model endpoint returned status ${response.status}`)
      }

      const payload: unknown = await response.json()
      const content = (payload as { choices?: { message?: { content?: unknown } }[] }).choices?.[0]
        ?.message?.content
      if (typeof content !== 'string' || content.trim() === '') {
        throw new Error(`The model "${options.model}" returned a reply with no content`)
      }

      try {
        return JSON.parse(content)
      } catch {
        /* A model can ignore the schema and answer in prose. Better a clear
           failure naming the model than a validation error three layers away
           that blames the lesson. */
        throw new Error(
          `The model "${options.model}" returned text that is not JSON. A model that ` +
            `honours response_format usually fixes this.`,
        )
      }
    },
  }
}
