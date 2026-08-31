import type { AsyncDoubtResolver, Doubt, Resolution } from './contract'
import type { Lesson } from '../spec/spec'
import { validateLesson } from '../spec/validate'

/**
 * THE RUNG WHERE THE MODEL DECIDES.
 *
 * WHY IT EXISTS, AND WHAT IT TAKES BACK FROM THE SOFTWARE.
 *
 * Before this file, the canvas had no model in the answering path at all.
 * `CanvasRoute` rendered `<TeachView lesson resolvers mode />` and never passed
 * an `ask` port, so `TeachView`'s fallback -- "no question service is
 * configured" -- was the only thing that branch ever produced. Every word a
 * learner read as an answer had been chosen by deterministic code: keyword
 * matching over the author's text, a Python process, or a quoted web page.
 *
 * That code cannot judge. So it guessed, and it guessed in both directions at
 * once: it answered "what is kinetic energy" by handing back a diagram that
 * merely contained the words, and a word-overlap gate added later refused
 * anything with no vocabulary in common -- which would refuse "how do I bake a
 * cake" inside a chemistry lesson about heat, where the question is fair.
 *
 * Neither mistake is fixable with a better rule, because both are judgements.
 * They now belong to the model, and the four it is asked to make are written
 * out in `server/prompt.ts` under "WHEN A STUDENT ASKS YOU SOMETHING". This
 * file is only the wire.
 *
 * WHAT THE SOFTWARE STILL KEEPS, AND WHY THOSE ARE NOT THE SAME KIND OF RULE.
 * The lesson it produces is validated before a learner sees it, exactly like
 * every other lesson: `validateLesson` refuses appearance fields, so Laws 1-3
 * in CLAUDE.md hold whoever wrote the lesson. That is a structural floor, not a
 * judgement about a question, and it is the kind software should keep.
 *
 * WHY IT SITS AHEAD OF THE WEB RUNG. A model that knows the subject can answer
 * from what it knows, and can say "that is not what we are doing here" in its
 * own words. Reaching the open web should be what happens when that fails, not
 * before it is tried.
 */

/** POSTs a question and gets a lesson back. Narrow so a double is three lines. */
export type AskModel = (request: {
  question: string
  askedInside?: string
  /** What she has already been shown, so the next part follows on from it. */
  taught?: string
  /** What she typed just now, so the next part can answer it. */
  justSaid?: string
}) => Promise<{ lesson?: unknown; error?: string }>

/**
 * The default wire to this app's own origin.
 *
 * A relative path on purpose: the browser never learns which vendor answered
 * and never holds a credential, which is the same reason `vite-plugin-search`
 * exists for the web rung.
 */
export const ENDPOINT = '/api/ask'

async function postToOwnOrigin(
  request: { question: string; askedInside?: string },
  signal?: AbortSignal,
): Promise<{ lesson?: unknown; error?: string }> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    ...(signal ? { signal } : {}),
  })
  if (!response.ok) {
    return { error: `the model could not be reached (${response.status})` }
  }
  return (await response.json()) as { lesson?: unknown; error?: string }
}

function refuse(reason: string): Resolution {
  return { kind: 'refusal', reason, nearest: [] }
}

export function modelResolver(
  options: {
    ask?: AskModel
    /**
     * Told whether the model could be reached at all, on every question.
     *
     * NOT LOGGING. The web rung consults it, because reaching the open web
     * without anything that can judge is how a physics lesson came to answer a
     * question about baking with a Wikipedia article. See `CanvasRoute`.
     */
    onReached?: (reached: boolean) => void
  } = {},
): AsyncDoubtResolver {
  const ask = options.ask ?? postToOwnOrigin
  const reached = (yes: boolean): void => options.onReached?.(yes)

  return {
    name: 'model',

    async resolve(doubt: Doubt, lesson: Lesson, signal?: AbortSignal): Promise<Resolution> {
      if (signal?.aborted) return refuse('The question was stopped before it was sent.')

      let replied: { lesson?: unknown; error?: string }
      try {
        /* THE LESSON GOES WITH THE QUESTION, AND THAT IS THE WHOLE POINT.
         *
         * Judgement 1 in the system prompt asks the model whether the question
         * belongs to what it is teaching. It cannot decide that from the
         * question alone. Sending the question bare and then wrapping the
         * answer in software rules when it comes back wrong is exactly how the
         * word-overlap gate came to exist. */
        replied = await ask({ question: doubt.text, askedInside: lesson.question })
      } catch {
        reached(false)
        return refuse('I could not reach the part of me that answers questions like that.')
      }

      if (replied.lesson === undefined) {
        reached(false)
        return refuse('I could not reach the part of me that answers questions like that.')
      }
      reached(true)

      /* VALIDATED LIKE ANY OTHER LESSON. A model answer is not trusted more
       * than an authored one: appearance fields are refused here, so Laws 1-3
       * hold no matter who wrote it. */
      const checked = validateLesson(replied.lesson)
      if (!checked.ok) {
        return refuse('I wrote an answer to that but could not render it safely.')
      }

      /* `drawnFrom` is empty on purpose: this answer did not come out of the
         blocks she is looking at, and claiming otherwise would point her at a
         part of the page that has nothing to do with it. */
      return { kind: 'answer', lesson: checked.lesson, drawnFrom: [] }
    },
  }
}
