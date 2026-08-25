/* Every question gets an answer. That is the whole rule.
 *
 * WHY THE EXISTING RESOLVER IS NOT ENOUGH ON ITS OWN
 *   `doubt.ts` answers only out of the lesson already on screen: it finds a
 *   block, a caption, two rows of a table, and re-presents them. It cannot
 *   write a sentence about the subject, which is exactly why it cannot write a
 *   WRONG one. So it refuses whenever the answer is not already there -- and
 *   for a learner who has just admitted confusion, a refusal is the worst
 *   possible reply.
 *
 * SO A REFUSAL ESCALATES INSTEAD OF ENDING THE CONVERSATION.
 *   The fast path stays first because it is instant, cannot invent, and is
 *   right for most doubts, which are about something the lesson already said.
 *
 * WHY THIS IS NOT INSIDE `DoubtResolver`
 *   That interface is synchronous ON PURPOSE -- an async one would let the
 *   lesson advance while an answer was in flight, the one thing the feature
 *   exists to prevent. Its own comment says a networked resolver belongs
 *   behind an explicit pending state. This is that pending state.
 */

import type { Lesson } from '../spec/spec'
import type { Doubt, DoubtResolver } from './contract'

/** The single soft line that invites the learner back. Never a reprimand, and
 *  never more than once. */
export const RETURN_LINE = 'Shall we get back to it?'

export type AnswerSource = 'lesson' | 'model' | 'unavailable'

export interface Answered {
  readonly from: AnswerSource
  /** Always non-empty. A blank answer is a refusal wearing better manners. */
  readonly text: string
  /** The lesson resolver's own answer, when the lesson supplied it. Carried
   *  through untouched so it renders by the same machinery as the lesson. */
  readonly resolution?: unknown
}

/** Asks the server a free question. Kept narrow so a double is two lines. */
export type AskPort = (question: string) => Promise<{ ok?: boolean; text?: string; reason?: string }>

/* Said when the model cannot be reached. It still ANSWERS in the only honest
 * way left -- by saying what happened and what will be done about it. The
 * learner's question is not thrown away, and the wording says so, because the
 * failure a learner cannot see is the one that makes them stop asking. */
const UNAVAILABLE = [
  'I could not reach the part of me that answers questions outside this lesson,',
  'so I cannot answer that one properly yet. Your question is saved — ask me',
  'again in a moment and I will come back to it.',
].join(' ')

export function createAnswering(options: { resolver: DoubtResolver; ask: AskPort }) {
  return {
    async answer(doubt: Doubt, lesson: Lesson): Promise<Answered> {
      const resolution = options.resolver.resolve(doubt, lesson) as {
        kind?: string
        blocks?: unknown
        text?: string
      }

      /* The lesson answered it. No come-back line: we never left. */
      if (resolution.kind === 'answer') {
        return { from: 'lesson', text: '', resolution }
      }

      let reply: Awaited<ReturnType<AskPort>>
      try {
        reply = await options.ask(doubt.text)
      } catch {
        /* Assigns a result and returns: the failure changes what the learner
         * sees rather than being noted and stepped over. */
        return { from: 'unavailable', text: UNAVAILABLE }
      }

      const text = typeof reply?.text === 'string' ? reply.text.trim() : ''
      if (reply?.ok !== true || text === '') {
        return { from: 'unavailable', text: UNAVAILABLE }
      }

      /* Exactly one come-back line, appended rather than woven in, so it can
       * never read as part of the answer. */
      return { from: 'model', text: `${text}\n\n${RETURN_LINE}` }
    },
  }
}
