import type { Block, Lesson } from '../spec/spec'

/**
 * TEACHING ONE PART AT A TIME.
 *
 * The canvas until now painted a whole lesson at once. That is a lecture: the
 * learner meets nine blocks simultaneously and has no moment where the software
 * pauses to find out whether any of it landed. This module is the model that
 * replaces it — the lesson is delivered in BEATS, and between beats the learner
 * is asked whether to go on.
 *
 * Two requirements are encoded in the TYPES below rather than left to
 * discipline, because both are the kind of rule that erodes silently.
 */

/* -------------------------------------------------------------------------- */
/* Beats                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One teachable part of a lesson.
 *
 * REQUIREMENT 1 — THE LEARNER NEVER SEES A STEP COUNT.
 *
 * There is no `index`, no `total`, no `stepNumber` on this type, and that is
 * deliberate. "Step 3 of 9" turns a lesson into a queue to be drained: it
 * invites the learner to measure how much is left instead of whether they
 * followed the last part, and a learner who is told there are six more steps
 * says "continue" to get through them. A field that does not exist cannot be
 * rendered by accident, cannot be added to a tooltip by a later change, and
 * cannot leak into an aria-label. Deriving the count from `beats.length` is of
 * course still possible — this makes it a deliberate act rather than the path
 * of least resistance.
 *
 * REQUIREMENT 2 — REVEALING A BEAT MUST NOT MOVE WHAT IS ALREADY ON SCREEN.
 *
 * If the third beat arriving nudges the first beat's diagram half a column
 * left, the learner's eye is dragged back to re-find something they had already
 * read, and the pause we just took to check their understanding is spent on
 * re-orientation instead. `blockIds` is therefore a CONTIGUOUS slice of
 * `lesson.blocks` in render order, never a scattered selection. Because the
 * frame is planned once from the whole lesson and the grid places blocks in
 * order, showing the first N blocks puts each of them exactly where it will
 * still be when all of them are shown. Stability is a consequence of the data
 * shape, not something the renderer has to be careful about.
 */
export interface Beat {
  /** Stable across re-derivation — it is the id of the beat's lead block. */
  id: string
  /**
   * A contiguous run of `lesson.blocks`, in render order. See requirement 2.
   * Never empty.
   */
  blockIds: readonly string[]
  /**
   * What the learner is asked once this beat has been read.
   *
   * Written fresh per beat rather than a constant "Shall I continue?", because
   * the same six words repeated nine times stop being a question and become a
   * button legend. Where a following beat exists, this names what is coming —
   * "Clear so far? Next: where the errors actually fall." — which lets the
   * learner judge whether to go on WITHOUT telling them how many parts remain.
   */
  checkpoint: string
  /**
   * True for the last beat, where the question is "does anything still need
   * clearing up" rather than "shall I continue". The renderer needs to know;
   * it must not find out by comparing against a length.
   */
  isLast: boolean
}

/**
 * The whole lesson, cut into beats.
 *
 * A partition, not a selection: every block of the lesson belongs to exactly
 * one beat, and concatenating `blockIds` in order reproduces `lesson.blocks`
 * exactly. `checkBeats` below is the assertion of that, and it is worth
 * asserting — a derivation that quietly drops a block would present a lesson
 * missing its conclusion, and nothing else in the system would notice.
 */
export type Beats = readonly Beat[]

/* -------------------------------------------------------------------------- */
/* Doubts                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What the learner typed, and where they were when they typed it.
 *
 * The position is carried WITH the doubt rather than left in the caller,
 * because the entire point of the feature is that answering a question must not
 * cost the learner their place. Holding both in one value makes "resolve the
 * doubt" an operation that cannot advance the lesson: there is no route from a
 * `Doubt` to the next beat.
 */
export interface Doubt {
  text: string
  /** The beat the learner was on. Answering does not change it. */
  atBeatId: string
}

/**
 * The answer to a doubt — which is itself a lesson.
 *
 * THE ANSWER IS NOT NECESSARILY TEXT, AND THE TYPE SAYS SO.
 *
 * The obvious implementation of "learner asks a question" is a paragraph of
 * prose, and it is the wrong one. If a learner cannot see why two lines cross,
 * the answer is the two lines drawn again with the crossing marked — not
 * sentences about them. So a resolution carries a `Lesson`, the same structure
 * the main content uses, which means an answer may be a chart, a table, a
 * process diagram, a simulation, or any of the other named representations in
 * the registry. It goes through the same validator, the same layout planner and
 * the same renderer as everything else. Nothing about answering a doubt is a
 * special case, so nothing about it can drift from the rest of the system.
 */
export interface DoubtAnswer {
  kind: 'answer'
  /** Already validated. Renderers can trust every field. */
  lesson: Lesson
  /**
   * Which blocks of the ORIGINAL lesson this drew on, so the interface can
   * point back at them. Empty when the answer stands alone.
   */
  drawnFrom: readonly string[]
}

/**
 * The resolver could not answer, and says so.
 *
 * A FIRST-CLASS OUTCOME, NOT AN ERROR.
 *
 * A resolver that always produces something is a resolver that invents things,
 * and a confident wrong answer to a learner who has just admitted confusion is
 * the worst output this software can produce. Refusing is therefore a normal
 * return value with a normal renderer, on the same footing as an answer. The
 * `reason` is shown to the learner as written, so it is phrased for them.
 */
export interface DoubtRefusal {
  kind: 'refusal'
  reason: string
  /** Blocks that looked closest, offered as "did you mean". May be empty. */
  nearest: readonly string[]
}

export type Resolution = DoubtAnswer | DoubtRefusal

/**
 * How a doubt becomes an answer.
 *
 * THIS IS THE SEAM.
 *
 * Today the only implementation reads the lesson the learner is already looking
 * at (see `doubt.ts`). A model-backed one would sit here instead, and the Four
 * Laws are what make that swap safe: a model returns a SPEC, which this
 * signature already requires, and the engine keeps sole responsibility for
 * drawing, positioning and styling it. A model cannot place a box on this
 * canvas because there is no field in which to express one.
 *
 * Synchronous on purpose. An async signature would let the lesson advance while
 * an answer was in flight, which is the one thing the feature exists to
 * prevent; a networked resolver belongs behind an explicit pending state, not
 * behind a promise this contract silently allows.
 */
export interface DoubtResolver {
  /** A short name, shown in diagnostics so an odd answer is traceable. */
  readonly name: string
  resolve(doubt: Doubt, lesson: Lesson): Resolution
}

/* -------------------------------------------------------------------------- */
/* The invariant                                                              */
/* -------------------------------------------------------------------------- */

export interface BeatIssue {
  message: string
}

/**
 * Every rule stated above, checked.
 *
 * Called by the view before it teaches anything, in the same spirit as
 * `checkFrame`: a lesson that cannot be cut into honest beats is not taught at
 * all, because a lesson silently missing its last block looks exactly like a
 * lesson that ended.
 */
export function checkBeats(beats: Beats, lesson: Lesson): BeatIssue[] {
  const issues: BeatIssue[] = []
  const order = lesson.blocks.map((b: Block) => b.id)

  if (beats.length === 0) {
    issues.push({ message: 'a lesson was cut into no beats at all' })
    return issues
  }

  const flat = beats.flatMap((b) => [...b.blockIds])

  if (flat.length !== order.length || flat.some((id, i) => id !== order[i])) {
    /* Concatenation must reproduce the block array exactly. This catches a
       dropped block, a duplicated one, and a beat built from a non-contiguous
       selection — all three break requirement 2, and the first also loses
       content outright. */
    issues.push({
      message:
        'beats do not reproduce the lesson: concatenating them gave ' +
        `[${flat.join(', ')}] but the lesson is [${order.join(', ')}]`,
    })
  }

  for (const beat of beats) {
    if (beat.blockIds.length === 0) {
      issues.push({ message: `beat "${beat.id}" contains no blocks` })
    }
    if (beat.checkpoint.trim().length === 0) {
      issues.push({ message: `beat "${beat.id}" asks the learner nothing` })
    }
    /* Requirement 1, enforced rather than trusted. A checkpoint that says
       "step 3 of 9" reintroduces exactly the counting the Beat type was shaped
       to prevent, and it would be an easy thing to write by hand. */
    if (/\b(step|part)\s*\d|\b\d+\s*(of|\/)\s*\d/i.test(beat.checkpoint)) {
      issues.push({
        message: `beat "${beat.id}" tells the learner a step number: "${beat.checkpoint}"`,
      })
    }
  }

  const lastFlags = beats.map((b) => b.isLast)
  if (lastFlags.filter(Boolean).length !== 1 || !lastFlags[lastFlags.length - 1]) {
    issues.push({ message: 'exactly one beat must be marked last, and it must be the final one' })
  }

  return issues
}
