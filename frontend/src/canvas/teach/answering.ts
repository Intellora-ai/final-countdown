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
import { readableText } from '../spec/readable'

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
/**
 * WHAT A QUESTION CARRIES BESIDES ITS WORDS.
 *
 * This took a bare string, and the caller that fills it -- `answerWithin`
 * below -- is holding the lesson the whole time. So the one function that
 * knew where the question came from had no way to say it, and a doubt reached
 * the server as five words with no lesson attached. `/api/ask` answers a
 * question with no `taught` by AUTHORING A NEW CONCEPT, so "so is that where
 * the oxygen comes from?" came back as a fresh lesson about oxygen instead of
 * an answer about the paragraph on screen.
 *
 * `modelResolver` already passes exactly this shape to its own port, and has
 * since it was written. The two are now the same shape for the same reason.
 */
export interface AskedInside {
  /** The question the lesson she is reading answers. */
  readonly askedInside?: string
  /** What she has already been shown of it, in reading order. */
  readonly taught?: string
}

export type AskPort = (
  question: string,
  context?: AskedInside,
) => Promise<{ ok?: boolean; text?: string; reason?: string }>

/* Said when the model cannot be reached. It still ANSWERS in the only honest
 * way left -- by saying what happened and what will be done about it. The
 * learner's question is not thrown away, and the wording says so, because the
 * failure a learner cannot see is the one that makes them stop asking. */
const UNAVAILABLE = [
  'I could not reach the part of me that answers questions outside this lesson,',
  'so I cannot answer that one properly yet. Your question is saved — ask me',
  'again in a moment and I will come back to it.',
].join(' ')

/*
 * HOW LONG A LEARNER IS MADE TO WAIT BEFORE SHE IS TOLD SOMETHING.
 *
 * Not a network timeout -- `engineResolver` already has one of those, at three
 * seconds, and the model rung has its own. This is the deadline on the WHOLE
 * answer, and it exists because the rungs cannot provide it between them: a
 * resolver that ignores the signal it was handed, or a port that accepts a
 * socket and never writes to it, leaves an `await` that no rung's own timeout
 * can reach.
 *
 * Sixty seconds is deliberately far longer than any measured answer. It is not
 * tuned for speed. It is the point past which "still working" has stopped being
 * true, and the honest sentence is worth more than continuing to wait.
 */
const DEFAULT_ANSWER_TIMEOUT_MS = 60_000

/** Returned in place of the work when the deadline won the race. */
const TIMED_OUT = Symbol('the answer deadline expired')

/*
 * A DEADLINE THAT WORKS EVEN ON A PROMISE THAT NEVER SETTLES.
 *
 * WHY THE SIGNAL ALONE IS NOT ENOUGH, and this is the whole point of the
 * function. `askChain` is handed the signal and checks it between rungs, and
 * `engineResolver` and `modelResolver` honour it inside a rung -- so for every
 * well-behaved resolver the signal is what stops the work, and it stops it
 * properly, cancelling the request rather than abandoning it. This race does
 * not replace that. It covers the one case the signal cannot: a resolver that
 * never looks at it. `await` on a promise that never settles is not
 * interruptible by anything, so the only way to get an answer to the learner is
 * to stop waiting for that promise and return without it.
 *
 * `Promise.race` attaches a handler to `work`, so a rejection arriving after
 * the deadline has already won is delivered to that handler and is NOT an
 * unhandled rejection. The abandoned work is left running; it cannot reach the
 * screen, because the record it would have filled has already been written.
 */
function beforeDeadline<T>(work: Promise<T>, signal: AbortSignal): Promise<T | typeof TIMED_OUT> {
  if (signal.aborted) return Promise.resolve(TIMED_OUT)
  return Promise.race([
    work,
    new Promise<typeof TIMED_OUT>((resolve) => {
      signal.addEventListener('abort', () => resolve(TIMED_OUT), { once: true })
    }),
  ])
}

/**
 * The chain's "did you mean" list, turned into something a learner can read.
 *
 * `DoubtRefusal.nearest` holds BLOCK IDS -- `pr`, `features`, `threshold-cost`
 * -- which are names for us and noise for her. Titled the same way
 * `TeachView`'s answer footer titles `drawnFrom`, and by id only where a block
 * has no title, because an id is worse to read than a title and far better than
 * a silent gap.
 *
 * WHY THIS IS WORTH CARRYING AT ALL. It is the only CONCRETE help a refusal
 * contains. Measured on the machine-learning lesson: "what is feature
 * importance" refuses with `nearest: ['features']` -- the block whose caption
 * is the answer she wanted. Until now that list was computed on every refusal
 * and read by nobody.
 */
function nearestLine(nearest: readonly string[], lesson: Lesson): string {
  const titles = nearest
    .map((id) => lesson.blocks.find((block) => block.id === id)?.title ?? id)
    .filter((title) => title.trim() !== '')
  if (titles.length === 0) return ''
  return `The closest parts of this lesson are: ${titles.join(' · ')}.`
}

/** Paragraphs, joined the way `TeachView` splits them again. Blank parts are
 *  dropped so an absent "did you mean" list cannot leave a trailing gap. */
function paragraphs(...parts: readonly string[]): string {
  return parts.map((part) => part.trim()).filter((part) => part !== '').join('\n\n')
}

export function createAnswering(options: {
  resolvers: readonly AnyResolver[]
  ask: AskPort
  /** The whole-answer deadline. See `DEFAULT_ANSWER_TIMEOUT_MS`. */
  askTimeoutMs?: number
}) {
  const deadlineMs = options.askTimeoutMs ?? DEFAULT_ANSWER_TIMEOUT_MS

  return {
    async answer(doubt: Doubt, lesson: Lesson): Promise<Answered> {
      /*
       * THE PROMISE `TeachView` WAITS ON IS THE ONE THAT MUST SETTLE.
       *
       * `TeachView` disables the ask box before this call and re-enables it in
       * `.finally()`. `.finally()` runs when a promise SETTLES, so a promise
       * that never settles disables the box for the rest of the session: she
       * asks one question and can never ask another. Its own comment feared
       * exactly that -- "one refactor away from locking a learner out of the
       * box for good" -- and guarded the two endings it could see, a resolve
       * and a reject. A wait that simply never ends is the third, and it is the
       * one a learner with no model configured meets first.
       *
       * The bound is here rather than in `TeachView` because this is the
       * function that promises an answer. A guard in the caller would re-enable
       * the box while this call was still running, which is the double-submit
       * the flag exists to prevent.
       */
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), deadlineMs)
      try {
        return await answerWithin(doubt, lesson, controller.signal)
      } finally {
        /* On every path, including a throw. A live timer would keep the process
           awake and, in a test, outlive the case that created it. */
        clearTimeout(timer)
      }
    },
  }

  async function answerWithin(
    doubt: Doubt,
    lesson: Lesson,
    signal: AbortSignal,
  ): Promise<Answered> {
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
      const chained = await beforeDeadline(
        askChain(doubt, lesson, options.resolvers, { signal }),
        signal,
      )

      /* The chain never came back. Nothing is known about the lesson's own
         answer, so there is no "did you mean" list to offer -- only the honest
         sentence, which is still an answer and still unblocks the box. */
      if (chained === TIMED_OUT) return { from: 'unavailable', text: UNAVAILABLE }
      /*
       * THE RESOLUTION IS READ, NOT STEPPED OVER.
       *
       * This line used to be `chained.resolution as { kind?: string; text?:
       * string }`, and that cast is where the defect lived. `Resolution` is
       * `DoubtAnswer | DoubtRefusal`; the cast flattened it to a shape with no
       * `reason` and no `nearest`, so the only branch the rest of this function
       * could see was `kind === 'answer'`. Everything the chain writes when it
       * CANNOT answer became unreadable one line after it arrived -- every
       * `refuse(...)` in `chain.ts`, `modelResolver.ts` and `webResolver.ts`,
       * dead the moment it was written.
       *
       * The union is used as declared instead. `kind` narrows it, so the
       * refusal branch below has `reason` and `nearest` without a cast, and a
       * future third member of the union becomes a type error here rather than
       * another silently discarded sentence.
       */
      const resolution = chained.resolution

      /* Something in the chain answered it. No come-back line: we never left. */
      if (resolution.kind === 'answer') {
        return {
          from: 'lesson',
          text: '',
          resolution,
          ...(chained.answeredBy === null ? {} : { answeredBy: chained.answeredBy }),
        }
      }

      /* The chain refused. It already wrote the sentence for this -- phrased
       * for the learner, and composed from what actually happened to every rung
       * (`chain.ts`'s `refusalFrom` tells "nothing was reachable" apart from
       * "nothing had an answer"). Below, that sentence is USED. */
      const closest = nearestLine(resolution.nearest, lesson)

      /*
       * WHY A REFUSAL IS RETURNED AS `text` AND NEVER AS `resolution`.
       *
       * `TeachView`'s `Outcome` renders `record.resolution` only when it is an
       * ANSWER, and the record it builds is
       * `resolution !== undefined ? { resolution } : { prose }` -- so handing
       * back a refusal here would set `resolution`, suppress `prose`, and paint
       * the learner's own question with nothing under it. That exact screen was
       * measured in a browser and is written up at `TeachView.tsx`'s
       * "RENDER WHAT CAME BACK, NOT WHO SENT IT". Carrying the sentence in
       * `text` is what makes it reach her.
       */
      let reply: Awaited<ReturnType<AskPort>>
      try {
        /* THE LESSON GOES WITH THE QUESTION. It has been in scope here all
           along; there was simply no parameter to put it in. */
        const answered = await beforeDeadline(
          options.ask(doubt.text, {
            askedInside: lesson.question,
            taught: readableText(lesson),
          }),
          signal,
        )

        /* SILENCE IS TREATED AS THE UNREACHABILITY IT IS. The port was called
           and never answered, so "I could not reach the part of me that answers
           questions outside this lesson" is true in the only sense that matters
           to her: nothing came back. The `closest` list still goes with it,
           because that much IS known. */
        if (answered === TIMED_OUT) {
          return { from: 'unavailable', text: paragraphs(UNAVAILABLE, closest) }
        }
        reply = answered
      } catch {
        /* Assigns a result and returns: the failure changes what the learner
         * sees rather than being noted and stepped over. */
        return { from: 'unavailable', text: paragraphs(UNAVAILABLE, closest) }
      }

      const text = typeof reply?.text === 'string' ? reply.text.trim() : ''

      /*
       * NOTHING OUTSIDE THE LESSON WAS REACHED, AND `UNAVAILABLE` SAYS SO.
       *
       * Kept for exactly this case, because here it is TRUE: the port threw, or
       * came back not-ok, so the escalation never happened. What is added is
       * the "did you mean" list, which is the one concrete thing a refusal
       * carries and which nothing has ever shown her.
       */
      if (reply?.ok !== true) {
        return { from: 'unavailable', text: paragraphs(UNAVAILABLE, closest) }
      }

      if (text === '') {
        /*
         * REACHED, AND STILL NO ANSWER -- SO IT IS NOT AN "I COULD NOT REACH".
         *
         * `ok: true` means the port answered. Saying "I could not reach the
         * part of me that answers questions outside this lesson" here tells the
         * learner a network failure happened when none did, which is worse than
         * saying nothing: it points her at a cause she cannot check and invites
         * her to retry something that will fail the same way. The chain's own
         * sentence is the true one, so it is the one she gets.
         *
         * `from: 'lesson'` because that sentence was written by the resolver
         * chain, which is what `'lesson'` already means on the answer branch
         * above. It is not `'unavailable'`, because nothing was unavailable.
         *
         * A blank reason falls back to `UNAVAILABLE` rather than to silence --
         * a blank answer is a refusal wearing better manners, and the rule that
         * `text` is never empty is older than this branch.
         */
        const said = paragraphs(resolution.reason, closest)
        return said === ''
          ? { from: 'unavailable', text: UNAVAILABLE }
          : { from: 'lesson', text: said }
      }

      /* Exactly one come-back line, appended rather than woven in, so it can
       * never read as part of the answer. */
      return { from: 'model', text: `${text}\n\n${RETURN_LINE}` }
  }
}
