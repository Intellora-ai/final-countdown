import type { AsyncDoubtResolver, Doubt, Resolution } from './contract'
import type { Lesson } from '../spec/spec'
import { validateLesson } from '../spec/validate'

/**
 * The rung that reaches the engine.
 *
 * WHAT IT CONNECTS
 * ----------------
 * `learning-os/.../session/doubt.py` is the engine's own catch for a question
 * the canvas cannot answer. It was written, tested, and unreachable: nothing in
 * `api/` imported it, and the canvas is TypeScript, so it could not have called
 * it in any case. This is the client half of the bridge that changed that. The
 * server half is `frontend/vite-plugin-engine.ts`, which spawns the engine and
 * hands back its JSON.
 *
 * WHY IT SITS BETWEEN THE LESSON AND THE WEB
 * ------------------------------------------
 * It is the only rung that can produce a NEW explanation rather than find an
 * existing one — it knows the syllabus, the learner's history, and which
 * mechanisms have already failed on this person. An explanation written for
 * this learner inside a contract the validator enforces beats a correct
 * paragraph written for nobody, so it goes ahead of the web. It goes behind the
 * lesson for the same reason everything does: a block the author wrote about
 * the exact thing being asked is the one the learner can connect to the page in
 * front of them.
 *
 * WHY A REFUSAL IS PASSED ON AND AN OUTAGE IS THROWN
 * --------------------------------------------------
 * `askChain` records a returned refusal as `refused` and a thrown error as
 * `failed`, and the sentence the learner finally reads says which happened. So
 * the engine declining — `UNMAPPABLE`, "I would rather not guess at that" — is
 * returned, and the bridge being broken is thrown. Collapsing the two would
 * tell a learner their question was unanswerable when the truth is that a
 * subprocess could not start.
 *
 * THE KEY NEVER COMES NEAR THIS FILE
 * ----------------------------------
 * It posts to a relative path on its own origin. The middleware holds whatever
 * credential the engine needs and passes it to a child process. A key that
 * reaches a browser is a key you have published, and this is the shape that
 * makes that impossible rather than unlikely.
 */

/** Relative on purpose. A relative path cannot leak a key it never has. */
const ENDPOINT = '/api/doubt'

export interface EngineResolverOptions {
  /** Overridden only in tests. Defaults to the global fetch. */
  readonly fetchImpl?: typeof fetch
  /** Overridden only if the middleware is mounted somewhere else. */
  readonly endpoint?: string
  /**
   * How long the engine gets before the bridge is declared broken.
   *
   * There is deliberately no way to ask for "wait forever". That was the
   * previous behaviour, and it is the defect this closes.
   */
  readonly timeoutMs?: number
}

/**
 * The deadline, and why there has to be one.
 *
 * This rung had none. When the middleware is absent the POST hangs rather than
 * failing fast, so the doubt chain never reaches the rung behind it and the
 * learner is shown nothing -- the single outcome the chain exists to prevent.
 *
 * It surfaced as `scene-regressions.spec.ts:454` failing on CI and passing on a
 * re-run, and it was written off as flake. It was never flake. Whether it
 * passed depended on how quickly the host refused the connection, which is a
 * property of the machine and not of this code.
 *
 * Ten seconds because the engine is a local subprocess answering ONE question,
 * not a model writing a whole lesson -- `chatOnce` is given 240s for that, and
 * it is a different kind of wait. A rung slower than this has already failed
 * whether or not it eventually replies, because the learner has spent that time
 * looking at nothing.
 */
const DEFAULT_TIMEOUT_MS = 10_000

/** What `api/ask.py` returns. Read defensively: it crossed a process boundary. */
interface EngineReply {
  outcome?: unknown
  refusal?: unknown
  lesson?: unknown
  provider?: unknown
}

function refuse(reason: string): Resolution {
  return { kind: 'refusal', reason, nearest: [] }
}

export function engineResolver(options: EngineResolverOptions = {}): AsyncDoubtResolver {
  const endpoint = options.endpoint ?? ENDPOINT
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return {
    name: 'engine',

    async resolve(doubt: Doubt, lesson: Lesson, signal?: AbortSignal): Promise<Resolution> {
      if (signal?.aborted) return refuse('The question was withdrawn before it was asked.')

      const doFetch = options.fetchImpl ?? globalThis.fetch
      if (typeof doFetch !== 'function') {
        throw new Error('engine: no fetch available in this environment')
      }

      /*
       * TWO WAYS TO STOP, AND THEY MEAN DIFFERENT THINGS.
       *
       * The learner withdrawing is a refusal; the deadline expiring is an
       * outage. Both abort the same request, and once the fetch has rejected an
       * `AbortError` looks identical either way -- so which one fired is
       * recorded here, while it is still known. Collapsing them would tell a
       * learner who navigated away that the bridge was broken, or a learner
       * facing a dead subprocess that their question was unanswerable.
       */
      const controller = new AbortController()
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, timeoutMs)
      /* The caller keeps its own power to stop this. Without this the learner's
         withdrawal would be ignored for the whole of the timeout. */
      const stopOnWithdrawal = (): void => controller.abort()
      signal?.addEventListener('abort', stopOnWithdrawal)

      let response: Response
      try {
        response = await doFetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            text: doubt.text,
            /* The way back. The engine echoes it, and dropping it here would
               break the round trip the Python type was shaped to protect. */
            resume_at: doubt.atBeatId,
            /* Which lesson this was asked during. The engine uses it only to
               break a tie toward a nearby skill; a nudge, never an override. */
            lesson_skill: lesson.id,
          }),
        })
      } catch (error) {
        /* The deadline is the ONLY failure this rung reinterprets. A refused
           connection or a DNS failure already carries the honest outage
           message, and is re-thrown untouched rather than relabelled. */
        if (timedOut) throw new Error(`engine timed out after ${timeoutMs}ms`)
        throw error
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', stopOnWithdrawal)
      }

      if (!response.ok) {
        /* Thrown, not refused. A 503 means the middleware could not start the
           engine — usually a missing venv — and the learner must not be told
           their question has no answer because a subprocess did not run. */
        throw new Error(`engine unavailable (${response.status})`)
      }

      const reply = (await response.json()) as EngineReply

      if (reply.outcome !== 'answered') {
        const reason =
          typeof reply.refusal === 'string' && reply.refusal.trim().length > 0
            ? reply.refusal
            : 'The engine had nothing to add about that.'
        return refuse(reason)
      }

      /* Validated, never trusted. The engine and the canvas agree on
         `LessonInput` only because both sides run this check; a payload trusted
         on arrival surfaces as a broken frame in a browser rather than as a
         refusal here, and it looks like the canvas's fault. */
      const checked = validateLesson(reply.lesson, { teaching: 'answer' })
      if (!checked.ok) {
        return refuse('The engine sent back an answer this canvas could not render.')
      }

      /* Read defensively and never invented. A reply with no provider leaves
         this undefined rather than guessing "fake", because the label exists
         precisely to stop unearned claims about authorship -- and a non-string
         that crossed a process boundary would render as `[object Object]` under
         a lesson, which is worse than rendering nothing. */
      const writtenBy = typeof reply.provider === 'string' ? reply.provider : undefined

      /* `drawnFrom` empty on purpose: the engine drew on the knowledge graph,
         not on the lesson in front of the learner, and pointing at a block here
         would send them to something unrelated. */
      return {
        kind: 'answer',
        lesson: checked.lesson,
        drawnFrom: [],
        ...(writtenBy === undefined ? {} : { writtenBy }),
      }
    },
  }
}
