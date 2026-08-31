/* PHASE 2 — WHAT MAKES A MEMORY TRUSTWORTHY, NOT MERELY STORED.
 *
 * Phase 1 made the store keep bytes: what goes in comes out, for the right
 * owner, after a crash. It takes NO view on what those bytes mean, and
 * `record.ts` argues that at length and is right to:
 *
 *     "A store that dictates the shape of what it holds is a store that has to
 *      be edited every time the thing it holds learns something new."
 *
 * Phase 2 asks for four things that are ALL about meaning -- order, monotonic
 * progress, one authoritative value per fact. None of them can live in
 * `record.ts` without destroying the property that makes it useful.
 *
 * SO THEY LIVE HERE, ONE LAYER UP, AND THE SPLIT IS THE DESIGN.
 *     record.ts   can this be stored and handed back unchanged?   (bytes)
 *     key.ts      whose is it?                                    (identity)
 *     store.ts    put it away, get it back                        (durability)
 *     progress.ts is this a SENSIBLE next state?                  (meaning)
 *
 * WHY THE RULES ONLY APPLY TO A DOCUMENT THAT DECLARES ITSELF ONE.
 *     The store still holds anything -- a number, a string, a shape nobody has
 *     invented yet -- and Phase 1's proofs depend on that. A record that is not
 *     canvas progress passes through untouched, because this module has nothing
 *     true to say about it. That is not a fallback; it is the boundary, and
 *     `isProgress` states exactly where it falls.
 *
 * THE SHAPE IS NOT INVENTED HERE. It is `TeachProgress` in
 * `src/canvas/teach/teachStore.ts`, which is what the canvas really keeps
 * across a reload. Read that file before changing this one.
 *
 * NOTE ON "MASTERY". The phase calls for "monotonic mastery -- a mastered
 * concept stays mastered". There is no `mastery` field in this product; the
 * `mastery: 0.4` that appears in a test fixture is invented data. The real fact
 * with that meaning is `revealed`: how much of the lesson she has uncovered. A
 * learner who has seen five steps has seen them, and no later save may claim
 * she has seen three. `questionsAsked` and `emptyAnswers` are counters of
 * things that HAPPENED and cannot un-happen, so they obey the same rule.
 */

/** Why a proposed save is not a sensible next state, in words a person could act on. */
export class NotConsistent extends Error {}

/**
 * One question the learner asked, as the canvas stores it.
 *
 * `at` is the ordering fact. Everything else is carried, not interpreted.
 */
export interface Asked {
  readonly at: number
  readonly [field: string]: unknown
}

/** What the canvas keeps for one lesson, in one tab, for one student. */
export interface Progress {
  readonly lessonId: string
  readonly revealed: number
  readonly asked: readonly Asked[]
  readonly questionsAsked: number
  readonly emptyAnswers: number
  readonly [field: string]: unknown
}

/**
 * Is this record canvas progress, or something this module must not touch?
 *
 * CHECKED BY THE FIELDS THE RULES ACTUALLY USE, not by a name or a version tag.
 * A record carrying `lessonId`, `revealed` and `asked` is one the rules below
 * have something true to say about; anything else is stored as sent.
 */
export function isProgress(value: unknown): value is Progress {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate['lessonId'] === 'string' &&
    typeof candidate['revealed'] === 'number' &&
    Array.isArray(candidate['asked'])
  )
}

/**
 * The counters that measure something that HAPPENED.
 *
 * Each one counts events in the past. The past does not shrink, so none of
 * these may ever be smaller than it was. `revealed` is the one the phase calls
 * "mastery": how much of the lesson she has uncovered.
 *
 * NAMED IN ONE PLACE so a new counter is added by adding it here, rather than
 * by remembering to write a fifth nearly-identical comparison below.
 */
const NEVER_GOES_BACKWARDS = ['revealed', 'questionsAsked', 'emptyAnswers'] as const

/** A number, or undefined when the field is absent or is not one. */
function numberAt(record: Progress | undefined, field: string): number | undefined {
  if (record === undefined) return undefined
  const value = record[field]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Decide what may be stored, given what is already there.
 *
 * Returns the record to store, or throws `NotConsistent` naming the rule that
 * was broken AND the numbers involved. Never returns a partly-applied record:
 * a save is the old state or the new one, and this is where that is decided.
 *
 * THE MESSAGE MATTERS AS MUCH AS THE REFUSAL. "invalid record" tells a caller
 * nothing it can act on, and the caller here is a browser holding a child's
 * afternoon of work. Every throw below says which fact, which direction, and
 * which two values.
 */
export function reconcile(
  lessonIdFromKey: string,
  previous: unknown,
  proposed: unknown,
): unknown {
  const before = isProgress(previous) ? previous : undefined

  /* NOT CANVAS PROGRESS, SO THIS MODULE HAS NOTHING TRUE TO SAY -- UNLESS
   * PROGRESS IS ALREADY STORED HERE.
   *
   * The store holds anything, and Phase 1's proofs depend on that staying true,
   * so an empty lesson still accepts any shape at all.
   *
   * BUT A LESSON THAT ALREADY HOLDS PROGRESS IS DIFFERENT, AND THIS WAS A REAL
   * HOLE. Measured through the real server over real HTTP: save `revealed: 9`,
   * then save a record with NO `revealed` -- which stops being progress by
   * `isProgress`, so every rule was skipped -- then save `revealed: 0`. All
   * three answered 200 and mastery ended at nothing.
   *
   * The same door bypassed the lessonId rule, because skipping "is this
   * progress" skips ALL of it. Overwriting a lesson's progress with a shape
   * that has none is not a new kind of memory; it is losing the old one. */
  if (!isProgress(proposed)) {
    if (before !== undefined) {
      throw new NotConsistent(
        'this lesson already holds progress, so it cannot be replaced by ' +
          'something that is not progress -- that would drop what she has done',
      )
    }
    return proposed
  }

  /* ONE FACT, ONE AUTHORITATIVE VALUE.
   *
   * `lessonId` is written in TWO places: the storage key, and inside the
   * record. When two places disagree there is no way to tell which is right,
   * so the disagreement itself is the bug and it is refused rather than
   * resolved. THE KEY WINS BY CONSTRUCTION -- it is what the read will use, so
   * a record stored under a key it contradicts could never be found by the id
   * it claims. Silently rewriting the record's copy to match would hide a
   * caller bug that is about to lose somebody's work in a different lesson. */
  if (proposed.lessonId !== lessonIdFromKey) {
    throw new NotConsistent(
      `this record says it belongs to lesson "${proposed.lessonId}" but it is ` +
        `being saved under "${lessonIdFromKey}"`,
    )
  }

  /* EVENTS ARE STORED IN REAL ORDER.
   *
   * EQUAL TIMESTAMPS ARE ALLOWED, and that is a decision rather than an
   * oversight: `at` is milliseconds, two questions can genuinely land in the
   * same millisecond, and refusing that would reject a true history. Only a
   * timestamp that goes BACKWARDS is out of order. */
  for (let index = 1; index < proposed.asked.length; index += 1) {
    const before = proposed.asked[index - 1]
    const after = proposed.asked[index]
    if (typeof before?.at !== 'number' || typeof after?.at !== 'number') {
      throw new NotConsistent(
        `every remembered question needs a numeric "at"; item ${index} does not have one`,
      )
    }
    if (after.at < before.at) {
      throw new NotConsistent(
        `remembered questions are out of order: item ${index} happened at ` +
          `${after.at}, which is before item ${index - 1} at ${before.at}`,
      )
    }
  }

  /* WHAT HAPPENED CANNOT UN-HAPPEN.
   *
   * Only compared when there IS a previous progress record. A first save has
   * nothing to contradict, and inventing a floor of zero would refuse a
   * perfectly good restore from another device. */
  for (const field of NEVER_GOES_BACKWARDS) {
    const was = numberAt(before, field)
    /* Nothing stored for this counter yet, so there is nothing to contradict.
     * A first save, or a restore from another device, may start anywhere. */
    if (was === undefined) continue

    const now = numberAt(proposed, field)

    /* OMITTING A COUNTER IS NOT A CHEAPER WAY TO LOWER IT.
     *
     * This used to `continue` when the new record simply did not carry the
     * field, which made "leave it out" a way past the very rule below.
     * Measured over real HTTP: `questionsAsked: 7` -> a save without it -> a
     * save with `0`, all three accepted, ending at zero.
     *
     * A save that carries no value for something already recorded is not
     * saying "unchanged" -- it is saying nothing, and this layer must not
     * guess which was meant. */
    if (now === undefined) {
      throw new NotConsistent(
        `"${field}" is ${was} in what is already stored, and this save does not ` +
          `carry it at all. Send it as it was, or higher`,
      )
    }

    if (now < was) {
      throw new NotConsistent(
        `"${field}" would go backwards, from ${was} to ${now}. ` +
          `That counts something that already happened, so it cannot get smaller`,
      )
    }
  }

  return proposed
}
