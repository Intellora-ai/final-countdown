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
  /**
   * ONE CONCEPT, WHICH IS THE ONLY PATH A LOCAL MODEL CAN ACTUALLY WALK.
   *
   * THE DEFECT THIS FIXES, MEASURED. `handler.ts` sends `/api/ask` down
   * `conceptFor` when the model has a `chat`, and down `authorLesson` when it
   * does not. This client had no `chat`, so every local request took the
   * whole-lesson path: an 8,737-character system prompt, a 2,534-character
   * schema, and `askWithinBudget`'s twenty-second ceiling around the call.
   *
   *   qwen3:8b, /api/ask, whole-lesson path   502 at 20.017s, every time
   *
   * That is not a slow model, it is a request no 8-billion-parameter model on a
   * laptop can finish in twenty seconds -- and the SAME machine answers a
   * concept request in about eleven. Groq was measured on the concept path and
   * local was measured on the lesson path, so "local is too slow" was a
   * comparison of two different requests.
   *
   * `groq.ts:473` is the shape this follows: system, an optional prior reply to
   * repair, then the user's turn. No schema is sent -- `concept.ts` carries a
   * worked example instead, and `handler.ts` validates every reply either way.
   */
  /* `budget` is accepted and ignored: a local model has no per-minute
     allowance to protect, and the parameter exists so one `chat` shape serves
     every client. See `groq.ts`. */
  chat(system: string, user: string, priorAssistant?: string, budget?: number): Promise<string>
  /** `chat`, with each piece handed over as it is written. See `Model.chatStream`. */
  chatStream?(system: string, user: string, onDelta: (text: string) => void, priorAssistant?: string): Promise<string>
}

/**
 * The longest one local `chat` call may take before it is abandoned.
 *
 * `fetch` HAS NO TIMEOUT OF ITS OWN, and this path had nothing else bounding
 * it. `groq.ts` grew `LONGEST_ONE_ATTEMPT_MS` and a whole-request deadline for
 * exactly this failure; `handler.ts` sends `/api/ask` and `/api/lesson` down
 * `conceptFor`, which is NOT wrapped in `askWithinBudget`, so a local model
 * that accepted the connection and then stopped writing left the promise
 * pending until the socket died. The browser sat on "Writing this lesson for
 * you..." for minutes, with no error and no way to tell whether anything was
 * still coming -- while the identical stall on the hosted path was abandoned at
 * twenty seconds.
 *
 * LONGER THAN THE HOSTED ONE, ON PURPOSE. A model on a laptop is genuinely
 * slower: the same machine that answers a concept in about eleven seconds can
 * take longer from cold while weights load into memory. Ninety seconds is well
 * past a slow honest answer and well short of a wait a person reads as
 * "nothing is happening".
 */
const LONGEST_LOCAL_CHAT_MS = 90_000

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

    /* WORDS AS THEY ARE WRITTEN. `/api/chat` with `stream: true` answers one
       JSON object per line, each carrying the next piece of the assistant's
       text and a `done` flag. Same request, same refusals as `chat` below, in
       the same words; the one difference is that the deadline is measured
       from the LAST piece rather than the first byte -- a model that is still
       writing is not a model that has stopped answering. */
    async chatStream(system, user, onDelta, priorAssistant) {
      const messages: { role: string; content: string }[] = [{ role: 'system', content: system }]
      if (priorAssistant !== undefined && priorAssistant !== '') {
        messages.push({ role: 'assistant', content: priorAssistant })
      }
      messages.push({ role: 'user', content: user })
      const stopWaiting = new AbortController()
      let abandon = setTimeout(() => { stopWaiting.abort() }, LONGEST_LOCAL_CHAT_MS)
      const stillWriting = (): void => {
        clearTimeout(abandon)
        abandon = setTimeout(() => { stopWaiting.abort() }, LONGEST_LOCAL_CHAT_MS)
      }
      const tooSlow = (): Error =>
        new Error(
          `the model could not be reached: Ollama at ${endpoint} did not answer within ` +
            `${Math.round(LONGEST_LOCAL_CHAT_MS / 1000)}s. The model "${options.model}" may be ` +
            `too large for this machine, or still loading.`,
        )
      let response
      try {
        response = await doFetch(`${endpoint}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: stopWaiting.signal,
          body: JSON.stringify({
            model: options.model,
            stream: true,
            format: 'json',
            options: { temperature: 0 },
            messages,
          }),
        })
      } catch {
        clearTimeout(abandon)
        if (stopWaiting.signal.aborted) throw tooSlow()
        throw new Error(
          `the model could not be reached: Ollama is not answering at ${endpoint}. ` +
            `Is it running? Start it with: ollama serve`,
        )
      }
      if (!response.ok) {
        clearTimeout(abandon)
        if (response.status === 404) {
          throw new Error(
            `Ollama does not have the model "${options.model}". Pull it first: ollama pull ${options.model}`,
          )
        }
        throw new Error(`Ollama returned status ${response.status}`)
      }
      const body = response.body
      if (body === undefined || body === null) {
        clearTimeout(abandon)
        throw new Error('Ollama returned a reply with no content')
      }
      const reader = body.getReader()
      const decoder = new TextDecoder()
      let pending = ''
      let whole = ''
      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          stillWriting()
          pending += decoder.decode(value, { stream: true })
          let newline = pending.indexOf('\n')
          while (newline >= 0) {
            const line = pending.slice(0, newline).trim()
            pending = pending.slice(newline + 1)
            newline = pending.indexOf('\n')
            if (line === '') continue
            const parsed = JSON.parse(line) as { message?: { content?: unknown }; done?: unknown }
            const piece = parsed.message?.content
            if (typeof piece === 'string' && piece !== '') {
              whole += piece
              onDelta(piece)
            }
            if (parsed.done === true) break
          }
        }
      } catch {
        if (stopWaiting.signal.aborted) throw tooSlow()
        throw new Error('the model could not be reached: the reply from Ollama stopped part-way')
      } finally {
        clearTimeout(abandon)
      }
      if (whole.trim() === '') throw new Error('Ollama returned a reply with no content')
      return whole
    },
    async chat(system, user, priorAssistant) {
      const messages: { role: string; content: string }[] = [{ role: 'system', content: system }]
      /* The repair turn. `concept.ts` sends the model's own rejected reply back
         so a second attempt is a correction of a document it can see, rather
         than a complaint about something it has never read. */
      if (priorAssistant !== undefined && priorAssistant !== '') {
        messages.push({ role: 'assistant', content: priorAssistant })
      }
      messages.push({ role: 'user', content: user })

      let response
      /* See `LONGEST_LOCAL_CHAT_MS`. The signal has to reach the transport: a
         timer above this layer stops the LEARNER waiting but leaves the request
         itself in flight, holding a connection to a model that is not
         answering. */
      const stopWaiting = new AbortController()
      const abandon = setTimeout(() => { stopWaiting.abort() }, LONGEST_LOCAL_CHAT_MS)
      try {
        response = await doFetch(`${endpoint}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: stopWaiting.signal,
          body: JSON.stringify({
            model: options.model,
            stream: false,
            /*
             * `format: 'json'` AND NOT THE SCHEMA, which is the whole reason
             * this path is affordable.
             *
             * Ollama's `format` accepts either the word `json` -- meaning "emit
             * a JSON object" -- or a full JSON-Schema it must compile into a
             * grammar. `lesson` above sends the schema, and compiling 2,534
             * characters of it is a large part of what made the whole-lesson
             * call miss a twenty-second deadline. The concept prompt carries a
             * worked example of the shape instead, and `handler.ts` runs every
             * reply through `validateLesson` regardless, so the grammar was
             * never the gate.
             */
            format: 'json',
            options: {
              /* The routes in `route.ts` are the variation. Sampling on top of
                 them makes a measurement unrepeatable without making a lesson
                 any better -- the same reason `groq.ts` sends temperature 0. */
              temperature: 0,
            },
            messages,
          }),
        })
      } catch {
        /*
         * PREFIXED WITH THE PHRASE `handler.ts` FORWARDS.
         *
         * `conceptFor` keeps `unreachable` only when it startsWith "the model
         * could not be reached", and replaces anything else with that bare
         * sentence -- a deliberate rule, because a vendor's own prose can quote
         * the request. But these messages are not a vendor's prose: they are
         * written in this file, from a constant and an endpoint, with no
         * credential and no request in them.
         *
         * MEASURED: a real 90-second local timeout reached the caller as
         * `{"error":"the model could not be reached"}` and the sentence saying
         * the model was too large for this machine was discarded one layer up.
         * The operator was told nothing they could act on, which is exactly
         * what that rule exists to prevent for the groq path.
         */
        /* THE TWO FAILURES DO NOT WEAR EACH OTHER'S SENTENCE. "Is it running?"
           is the wrong thing to tell someone whose model IS running and is
           simply too slow -- they would restart a healthy server instead of
           choosing a smaller model. `aborted` is the only thing that can tell
           the two apart, so it is read before the message is chosen. */
        if (stopWaiting.signal.aborted) {
          throw new Error(
            `the model could not be reached: Ollama at ${endpoint} did not answer within ` +
              `${Math.round(LONGEST_LOCAL_CHAT_MS / 1000)}s. The model "${options.model}" may be ` +
              `too large for this machine, or still loading.`,
          )
        }
        throw new Error(
          `the model could not be reached: Ollama is not answering at ${endpoint}. ` +
            `Is it running? Start it with: ollama serve`,
        )
      } finally {
        clearTimeout(abandon)
      }

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(
            `Ollama does not have the model "${options.model}". Pull it first: ollama pull ${options.model}`,
          )
        }
        throw new Error(`Ollama returned status ${response.status}`)
      }

      const payload: unknown = await response.json()
      const content = (payload as { message?: { content?: unknown } }).message?.content
      /*
       * A REPLY WITH NO TEXT IS A FAILURE, AND IT IS THROWN.
       *
       * `groq.ts` returned `''` here for months and the empty string travelled
       * into `authorConcept`, was judged as a lesson, and reached a learner as
       * "that lesson was refused" -- blaming the teaching for an outage. The
       * same mistake is not repeated on this side.
       */
      if (typeof content !== 'string' || content.trim() === '') {
        throw new Error('Ollama returned a reply with no content')
      }
      return content
    },
  }
}
