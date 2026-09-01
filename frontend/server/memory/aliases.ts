/* WHAT A PHRASING WAS DECIDED TO MEAN, SO IT IS NEVER DECIDED TWICE.
 *
 * THE COST THIS REMOVES, AND IT IS THE PRODUCT'S WHOLE LATENCY STORY.
 *
 * `lessons.ts` makes a repeat FREE -- the lesson is already written, the read
 * is a single row, and serving it was measured at 11ms. But that shelf is keyed
 * by the SUBJECT, and only the controller can turn "wat is fotosynthesis" into
 * `photosynthesis`. So the cheapest answer the product can give still sat
 * behind a model round trip: measured 6-10s on `gemini-2.5-flash-lite`, 15-30s
 * on `gemini-2.5-flash`, and longer whenever a 429 bought a retry pause.
 *
 * A cache that costs a network call is not a cache. That was the bottleneck.
 *
 * WHY THIS IS NOT THE FAST PATH THAT WAS REMOVED, AND THE DIFFERENCE IS THE
 * WHOLE JUSTIFICATION. `handler.ts` used to build a decision itself when a word
 * list said the message named a subject, and that was the application deciding
 * from text -- it hardcoded START_LESSON and mislabelled `quiz me on tenses`.
 * Nothing here reads a message or judges what it means. It stores the answer
 * THE MODEL ALREADY GAVE for this exact phrasing and hands the same answer back
 * for the same phrasing. A memo of a decision is not a second decision-maker.
 *
 * AND IT CANNOT INVENT A SUBJECT FOR SOMETHING THAT NAMED NONE. An entry is
 * only written where `handler.ts` files a lesson on the shared shelf -- which
 * happens only when the decision was not guessed and reported a subject. A
 * greeting never files a lesson, so a greeting never gets an alias, so the veto
 * still sees every message it has ever had to refuse.
 *
 * SHARED, LIKE THE SHELF. Two learners typing the same words at the same point
 * are asking about the same thing, and the subject a message names is a fact
 * about the message rather than about who typed it. What stays per-learner is
 * the only thing that is per-learner: which ways in they have already spent,
 * which `explanations.ts` holds and every read here is still filtered by.
 *
 * PER CONTEXT, THOUGH. "solve this" means the thing on screen, and the thing on
 * screen differs by lesson -- so the lesson the learner is inside is part of
 * the key. A phrasing at the door and the same phrasing mid-lesson are two
 * different questions and get two different entries.
 *
 * THE SAME STORE EVERYTHING ELSE LIVES IN. No new engine: `sqliteMemoryStore`
 * from Phase 1 and `memoryKey` from Phase 1.
 */

import { memoryKey } from './key.ts'
import type { MemoryStore } from './sqliteStore.ts'

/** One phrasing, and the subject the controller decided it meant. */
interface Meant {
  readonly subject: string
  /** ISO 8601. Kept so a row reads in order without a clock. */
  readonly at: string
  /**
   * WHICH RECIPE'S CONTROLLER READ IT THAT WAY. See `subjectAliases`.
   *
   * `lessons.ts` stamps a lesson because a stored lesson has no idea the rules
   * changed underneath it. The same is true one layer up and was missed: what a
   * sentence MEANS is the controller's reading of it, and the controller's
   * reading is a product of the prompt. Without this an entry had no expiry of
   * any kind and no way to clear one, so a reading the model would no longer
   * give was served for ever -- and the fast path, which deliberately does not
   * re-learn, guaranteed nothing would ever go back and ask again.
   */
  readonly recipe: string
}

export interface SubjectAliases {
  /**
   * The subject this phrasing was decided to mean, or nothing.
   *
   * Nothing is the normal answer the first time anybody types a sentence, and
   * it is never an error: the caller asks the controller, exactly as it did
   * before this existed.
   */
  subjectFor(context: string, said: string): string | null
  /** Remember that the controller read this phrasing as this subject. */
  learn(context: string, said: string, subject: string, at: string): void
}

/**
 * The phrasing, normalised the same way `lessons.ts` normalises a concept.
 *
 * Case and runs of whitespace carry no meaning in a typed question, and
 * "What is photosynthesis?" typed twice is one phrasing. NOTHING ELSE IS
 * STRIPPED -- this is a memo, not a classifier, and two sentences that differ
 * by a word are two sentences. Being too narrow costs one controller call and
 * is invisible; being too wide would hand back the wrong subject.
 */
function phrasing(said: string): string {
  return said.trim().toLowerCase().replace(/\s+/g, ' ')
}

function keyFor(context: string, said: string): string {
  return memoryKey({
    studentId: 'shared',
    tabId: 'any',
    /* Both parts encoded before joining, so a context containing the separator
       cannot be read back as a different context plus a different phrasing. */
    lessonId: `meant:${encodeURIComponent(context)}:${encodeURIComponent(phrasing(said))}`,
  })
}

/** Only the shape this module wrote. Anything else reads as no alias at all. */
function meantFrom(stored: string | undefined): Meant | null {
  if (stored === undefined) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(stored)
  } catch {
    /* A row this module cannot read is not a reason to refuse to teach: the
       caller asks the controller, which is where it was before this existed. */
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const it = parsed as Record<string, unknown>
  if (typeof it['subject'] !== 'string' || it['subject'].trim() === '') return null
  if (typeof it['at'] !== 'string') return null
  /* A row written before recipes existed cannot be vouched for and reads as
     absent -- the same rule `lessons.ts` applies to a lesson with no recipe. */
  if (typeof it['recipe'] !== 'string') return null
  return { subject: it['subject'], at: it['at'], recipe: it['recipe'] }
}

/**
 * `recipe` IS THE SAME FINGERPRINT `writtenLessons` TAKES, and it is passed
 * here for the same reason it is passed there: a reading is only reusable while
 * the thing that produced it has not changed. A prompt edit costs one
 * controller call per phrasing and then the memo is warm again -- which is the
 * price of being able to correct a wrong reading at all.
 */
export function subjectAliases(store: MemoryStore, recipe: string): SubjectAliases {
  return {
    subjectFor(context, said) {
      if (phrasing(said) === '') return null
      const meant = meantFrom(store.read(keyFor(context, said)))
      /* Decided by a different controller, so it is not this product's reading
         of the sentence any more however good it was. */
      return meant === null || meant.recipe !== recipe ? null : meant.subject
    },

    learn(context, said, subject, at) {
      /* Nothing to key by, or nothing to remember. Both are the caller having
         no decision worth memoing, and neither is an error. */
      if (phrasing(said) === '' || subject.trim() === '') return
      /*
       * LAST WRITER WINS, ON PURPOSE. Two learners typing the same words get
       * the same subject from the same controller, so a race here has nothing
       * to lose -- and when the model DOES read a sentence differently on a
       * later day, the newer reading is the one worth keeping. `update` is used
       * rather than `write` only so this shares the store's transaction with
       * every other writer.
       */
      store.update(keyFor(context, said), at, () =>
        JSON.stringify({ subject: subject.trim(), at, recipe } satisfies Meant),
      )
    },
  }
}
