/**
 * THE SUFFICIENCY GATE -- "code decides when intelligence is unnecessary".
 *
 * The live path already decides this in four places: small talk answers
 * itself; a phrasing already decided (the alias shelf) with an unseen lesson
 * on the shelf is one SQLite row; inside a lesson, anything that is not a
 * plea goes to the deterministic in-lesson answerer; everything else needs
 * a model. This names those decisions as ONE verdict with a reason, so the
 * shadow can record on every request whether any brain was needed.
 *
 * It moves none of the live logic. It looks where the live path looks,
 * through the looks it is given, and it never treats "could not look" as
 * "nothing there" (Law D, one layer over): a shelf that throws is path 5.
 */
import { readTheAsk, type Ask } from '../../src/canvas/teach/intent.ts'
import type { SmallTalk } from '../smallTalk.ts'
import type { TeachingRequest } from './LearningIntelligence.ts'

export type SufficientPath = 0 | 1 | 2 | 3 | 4 | 5

export interface SufficiencyVerdict {
  readonly path: SufficientPath
  readonly because: string
}

export interface Looks {
  smallTalk(said: string): SmallTalk | null
  isPlea(said: string): boolean
  subjectFor(context: string, said: string): string | null
  /** The shape the model memoed for this phrasing, if any -- the live path
      asks the shelf for it before falling back to the rules, and so does the
      gate (`handler.ts`: one `shape`, both lookups). Optional so a stub that
      never memoes reads as "nothing memoed". */
  readingFor?(context: string, said: string): { readonly asked?: Ask } | null
  /** A lesson of the shape asked for, unseen by her. The live path asks the
      same question with the same shape (`handler.ts`), so the gate cannot
      say "one row" about a shelf the live path would not serve. */
  unseenOnShelf(subject: string, spent: readonly string[], ask: Ask): boolean
}

/** The paths on which no model is called at all. */
const CODE_SUFFICES: ReadonlySet<SufficientPath> = new Set<SufficientPath>([0, 1, 3])

export function codeSuffices(verdict: SufficiencyVerdict): boolean {
  return CODE_SUFFICES.has(verdict.path)
}

export function sufficientPath(request: TeachingRequest, looks: Looks): SufficiencyVerdict {
  const said = request.question.trim()
  if (request.askedFrom !== 'ask') {
    if (looks.isPlea(said)) return { path: 4, because: 'a plea inside a lesson: diagnosis, then the writer' }
    return { path: 3, because: 'inside a lesson and not a plea: the in-lesson answerer, no model' }
  }
  const talk = looks.smallTalk(said)
  if (talk !== null) return { path: 0, because: `"${said}" is ${talk}: code answers it, no model` }

  let subject: string | null
  try {
    subject = looks.subjectFor(request.askedFrom, said)
  } catch (error: unknown) {
    return { path: 5, because: `the alias shelf could not be looked at (${reasonOf(error)}), so nothing is assumed` }
  }
  if (subject === null) return { path: 5, because: 'no phrasing on record decides what this means: the chooser and the writer' }

  let unseen: boolean
  try {
    unseen = looks.unseenOnShelf(subject, request.alreadyUsed, looks.readingFor?.(request.askedFrom, said)?.asked ?? readTheAsk(said).ask)
  } catch (error: unknown) {
    return { path: 5, because: `the lesson shelf could not be looked at (${reasonOf(error)}), so nothing is assumed` }
  }
  if (unseen) return { path: 1, because: `"${said}" was decided to mean ${subject}, and an unseen lesson is on the shelf: one row, no model` }
  return { path: 2, because: `"${said}" means ${subject}, but every lesson on the shelf has been seen: the writer` }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
