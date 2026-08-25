/* Stored lessons, used only when the server cannot be reached.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE
 *   A fallback lesson for a DIFFERENT concept is worse than no lesson at all.
 *   The student would be taught the wrong topic, believe they had covered the
 *   right one, and mark it done -- and Almanac would never show it again.
 *
 *   So the lookup matches by id and returns null otherwise. Three lessons are
 *   stored. Everything else gets an honest failure.
 */

import type { Lesson } from '../canvas/spec/spec'
import { validateLesson } from '../canvas/spec/validate'
import { gasPressure } from '../canvas/lessons/gasPressure'
import { billBecomesLaw } from '../canvas/lessons/billBecomesLaw'
import { classifierEvaluation } from '../canvas/lessons/classifierEvaluation'

/* Held as written, then VALIDATED on the way out.
 *
 * Two reasons, and the second is the one that matters. A lesson file is the
 * schema's INPUT shape -- `emphasis` and `tone` are optional there and filled
 * in by the parser -- so returning one directly is not a `Lesson` at all.
 *
 * And a stored lesson that failed validation would render the canvas's refusal
 * screen, which is the exact thing a fallback exists to avoid. Validating here
 * means the fallback either teaches or honestly does not exist. */
const STORED: Record<string, unknown> = {
  'gas-pressure': gasPressure,
  'bill-becomes-law': billBecomesLaw,
  'classifier-evaluation': classifierEvaluation,
}

/** The stored lesson for this concept id, or null. Exact match only: a near
 *  match is still the wrong topic. */
export function storedLessonFor(conceptId: string): Lesson | null {
  if (!Object.prototype.hasOwnProperty.call(STORED, conceptId)) return null
  const checked = validateLesson(STORED[conceptId])
  return checked.ok ? checked.lesson : null
}
