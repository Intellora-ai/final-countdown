/* One curriculum for the whole product, readable synchronously.
 *
 * The dashboard read `data/curriculum.ts` while Almanac planned from the
 * generated CBSE data. For class 9 the two share exactly one subject id, so
 * once setup started storing the planner's ids the sidebar and chapter browser
 * -- which filter the old list by those ids -- would have found one subject out
 * of nine.
 *
 * The generated classes are ~100k lines and load as one chunk per class, but
 * the sidebar, the chapter view and the store's planner all read the curriculum
 * DURING RENDER. So it is primed once, when the student's class is known, and
 * read synchronously afterwards.
 *
 * BEFORE PRIMING IT RETURNS EMPTY, never the old list. Falling back to the
 * wrong curriculum is exactly how two sources of truth survive: the screen
 * looks populated while quietly describing a different syllabus. An empty
 * sidebar is a visible problem; a sidebar full of the wrong subjects is not.
 */

import type { Subject } from '../types'
import { loadPlannedSubjects } from './curriculum'
import { schoolClassOf } from './school-class'

const CACHE = new Map<number, readonly Subject[]>()
const IN_FLIGHT = new Map<number, Promise<void>>()

/** Load a class's curriculum, once. Safe to call on every render. */
export async function primePlannedCurriculum(cls: string | null): Promise<void> {
  const number = schoolClassOf(cls)
  if (number === null || CACHE.has(number)) return

  /* De-duplicated: React can call this from several effects in the same tick,
     and three parallel imports of a 300 KB chunk is three downloads. */
  const existing = IN_FLIGHT.get(number)
  if (existing !== undefined) return existing

  const loading = loadPlannedSubjects(cls).then((subjects) => {
    CACHE.set(number, subjects as readonly Subject[])
    IN_FLIGHT.delete(number)
  })
  IN_FLIGHT.set(number, loading)
  return loading
}

/** The subjects for a class, or `[]` when it has not been primed. */
export function plannedSubjects(cls: string | null): readonly Subject[] {
  const number = schoolClassOf(cls)
  if (number === null) return []
  return CACHE.get(number) ?? EMPTY
}

/* One shared instance. Returning a fresh `[]` each call would give every
   render a new array identity and re-render anything memoised on it. */
const EMPTY: readonly Subject[] = []

export function isPlannedCurriculumReady(cls: string | null): boolean {
  const number = schoolClassOf(cls)
  return number !== null && CACHE.has(number)
}

/** Tests only. Module state that no test can clear is module state that makes
 *  the next test depend on the last one. */
export function resetPlannedCurriculum(): void {
  CACHE.clear()
  IN_FLIGHT.clear()
}
