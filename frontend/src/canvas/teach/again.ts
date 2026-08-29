import type { Lesson } from '../spec/spec'
import type { LessonModel } from './authorLesson'
import { authorConcept, type ConceptResult } from './concept'
import type { Source } from './grounding'
import { sameAgain } from './sameAgain'

/**
 * NEVER THE SAME EXPLANATION TWICE -- the piece that was missing.
 *
 * `route.ts` can come at one idea twelve ways. `sameAgain.ts` can tell a
 * reroute from a repeat. `authorConcept` already takes an `alreadyUsed` list.
 * All three worked, and the product still explained everything the same way
 * every time, because NOTHING REMEMBERED. `CanvasRoute` called `authorConcept`
 * with three arguments, so `alreadyUsed` was always empty, the seed always came
 * out of the same question, and the same question therefore always took the
 * same route; `sameAgain` was imported by nothing that ships at all.
 *
 * Built machinery that nothing calls is the exact orphan pattern this
 * repository keeps finding: the module measures well, the learner gets nothing.
 * This module is the wire, and it is deliberately the SMALLEST one -- a memory
 * value the caller holds and hands back, no store, no singleton, no hook.
 */

/** What this learner has already been given, for ONE topic. */
export interface Remembered {
  /** Route ids already spent, so `nextRoute` picks a fresh way in. */
  readonly routes: readonly string[]
  /** The lessons actually shown, so a repeat can be recognised as one. */
  readonly shown: readonly Lesson[]
}

/** A learner who has not asked about this topic yet. */
export const NOTHING_YET: Remembered = { routes: [], shown: [] }

export interface AgainResult {
  readonly written: ConceptResult
  /**
   * The memory to hold for the NEXT ask. Unchanged when the lesson was refused
   * -- a refusal put nothing on the learner's screen, so it retires no route
   * and it is not something they have read.
   */
  readonly memory: Remembered
}

/**
 * How many times to ask for a fresh explanation before shipping what came back.
 *
 * TWO, and the second one is not optional: a rerouted PROMPT is a request, and
 * a model is free to ignore it and hand back what it said before.
 *
 * NOT UNBOUNDED. A model that repeats itself on every axis would loop forever
 * and the learner would sit in front of a spinner. Shipping a repeat is a poor
 * answer; shipping nothing is not an answer at all, and this repository has
 * already paid for that mistake once -- "a learner who asked a fair question
 * and got silence".
 */
const TRIES = 2

/**
 * Teach this idea a way this learner has not been taught it.
 *
 * Pure in the sense that matters: the memory goes in as a value and comes back
 * as a value, so the same history gives the same answer and a test can hold a
 * learner's whole past in one object.
 */
export async function explainAgain(
  model: LessonModel,
  question: string,
  sources: readonly Source[] = [],
  memory: Remembered = NOTHING_YET,
): Promise<AgainResult> {
  let spent = memory.routes
  let written = await authorConcept(model, question, sources, spent)

  for (let attempt = 1; attempt < TRIES; attempt += 1) {
    if (!written.ok) break
    spent = spent.includes(written.route) ? spent : [...spent, written.route]
    if (!sameAgain(written.lesson, memory.shown).duplicate) break
    written = await authorConcept(model, question, sources, spent)
  }

  if (!written.ok) return { written, memory }

  return {
    written,
    memory: {
      routes: spent.includes(written.route) ? spent : [...spent, written.route],
      shown: [...memory.shown, written.lesson],
    },
  }
}
