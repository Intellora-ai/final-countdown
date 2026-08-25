/* The browser's access to the curriculum Almanac plans from.
 *
 * WHY THIS IS NOT `src/data/curriculum.ts`
 *   That module is the older hand-written curriculum the rest of the dashboard
 *   still reads. Almanac plans from the GENERATED CBSE data in
 *   `src/data/curriculum/`, and the two do not describe the same subjects.
 *   Measured on class 9:
 *
 *       hand-written   mathematics · physics · chemistry · biology
 *       generated      mathematics · science · social-science · english-… (9)
 *
 *   CBSE class 9 has no separate physics subject; it has `science`. So the
 *   planner was naming concepts the dashboard could not look up, and every row
 *   would have rendered "Unknown (...)". A name has to come from the same
 *   curriculum the plan was built from or it is not a name of it.
 *
 * WHY LAZY
 *   The four generated classes are roughly 100k lines. Pulling them into the
 *   main bundle would ship every class to every student in order to label a
 *   handful of rows. A dynamic import per class becomes its own chunk, fetched
 *   only for the class that student is actually in. `server/almanac/
 *   curriculum.ts` loads them the same way for the same reason.
 */

import type { SubjectLike } from './resolve'
import { schoolClassOf } from './school-class'

/** Classes the generated curriculum covers. Strings, because that is how a
 *  student record stores `cls`. */
export const SUPPORTED_CLASSES = ['9', '10', '11', '12'] as const

export type SupportedClass = (typeof SUPPORTED_CLASSES)[number]

/* Reads the form a student record ACTUALLY stores. Comparing against
 * ['9','10','11','12'] returned nothing for every real student, because setup
 * writes "Class 9". */

/**
 * The subjects Almanac can plan for this class, or `[]` when it plans none.
 *
 * An empty array for an unknown class is deliberate and is not a silent
 * failure: `resolveItems` renders an unresolved row VISIBLY, carrying the id
 * it could not name, so nothing disappears from a student's day because a
 * lookup came back short.
 */
export async function loadPlannedSubjects(cls: string | null): Promise<readonly SubjectLike[]> {
  const number = schoolClassOf(cls)
  if (number === null) return []

  /* Written as a switch of literal specifiers rather than a template string.
   * A computed import path defeats the bundler's static analysis: Vite would
   * either fail to create the chunks or glob the whole directory back into
   * one, which is the cost this file exists to avoid. */
  switch (number) {
    case 9:
      return (await import('../data/curriculum/class9')).CLASS_9 as readonly SubjectLike[]
    case 10:
      return (await import('../data/curriculum/class10')).CLASS_10 as readonly SubjectLike[]
    case 11:
      return (await import('../data/curriculum/class11')).CLASS_11 as readonly SubjectLike[]
    case 12:
      return (await import('../data/curriculum/class12')).CLASS_12 as readonly SubjectLike[]
  }
}
