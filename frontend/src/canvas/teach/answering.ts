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
import type { AnyResolver, Doubt } from './contract'
import { askChain } from './chain'

/** The single soft line that invites the learner back. Never a reprimand, and
 *  never more than once. */
export const RETURN_LINE = 'Shall we get back to it?'

export type AnswerSource = 'lesson' | 'model' | 'unavailable'

export interface Answered {
  readonly from: AnswerSource
  /** Always non-empty. A blank answer is a refusal wearing better manners. */
  readonly text: string
  /** The chain's own answer, when a resolver supplied one. Carried through
   *  untouched so it renders by the same machinery as the lesson. */
  readonly resolution?: unknown
  /** WHICH resolver answered. A learner reading sentences deserves to know
   *  whether a page, an engine or a model wrote them; this project already
   *  labels the hand-written lesson for exactly that reason. */
  readonly answeredBy?: string
}

/** Asks the server a free question. Kept narrow so a double is two lines. */
export type AskPort = (question: string) => Promise<{ ok?: boolean; text?: string; reason?: string }>

/*
 * Said when the model cannot be reached.
 *
 * IT PROMISES NOTHING, BECAUSE NOTHING HERE PERFORMS A PROMISE.
 *
 * It used to end: "Your question is saved — ask me again in a moment and I will
 * come back to it." Both halves were false. There is no queue, no retry and no
 * pending list in this file; a grep for save/retry/queue found only that
 * sentence. And asking again returns this identical text, so the advice fails
 * the moment a learner follows it -- which is exactly when they are told it.
 *
 * Measured in a browser: a learner asked "who is the president of india", was
 * told their question was saved, asked again as instructed, and got the same
 * message back word for word.
 *
 * This is the refusal banner defect again, one level along: a sentence that is
 * kind and untrue, which is worse than a blunt one that is true, because the
 * learner acts on it and is let down a second time. The failure a learner
 * cannot see is what makes them stop asking -- and so is the reassurance that
 * turns out to be empty.
 *
 * What it says now is only what is true: what broke, and that it is this end's
 * problem rather than their question's.
 */
const UNAVAILABLE = [
  'I could not reach the part of me that answers questions outside this lesson,',
  'so I cannot answer that one yet. That is a problem on this end, not with your',
  'question. The lesson below still works, and anything in it I can still answer.',
].join(' ')

export function createAnswering(options: { resolvers: readonly AnyResolver[]; ask: AskPort }) {
  return {
    async answer(doubt: Doubt, lesson: Lesson): Promise<Answered> {
      /* THE CHAIN FIRST, then escalation.
       *
       * Two branches built this independently: a chain of resolvers that tries
       * each in order and records what each one did, and a two-step
       * lesson-then-model escalation. The chain is the better structure -- it
       * tolerates a resolver that throws, keeps the evidence, and is the
       * injection point `CanvasRoute` already depends on -- so the escalation
       * became its LAST rung rather than a second mechanism beside it.
       *
       * Neither idea was discarded to settle a merge. */
      const chained = await askChain(doubt, lesson, options.resolvers)
      const resolution = chained.resolution as { kind?: string; text?: string }

      /* Something in the chain answered it. No come-back line: we never left. */
      if (resolution.kind === 'answer') {
        return {
          from: 'lesson',
          text: '',
          resolution,
          ...(chained.answeredBy === null ? {} : { answeredBy: chained.answeredBy }),
        }
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
