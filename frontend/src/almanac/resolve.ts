/* Joining Almanac's ids to the names a person reads.
 *
 * Almanac plans in IDS so a plan stays stable when a name is corrected. The
 * dashboard shows NAMES. This is the join, and the whole reason it is a tested
 * function rather than three lines inside the view is what happens when it
 * fails: the server's curriculum and the browser's are two separate builds and
 * CAN differ. A rebuild dropped 569 concepts from this project's data
 * yesterday.
 *
 * A miss is reported and stays VISIBLE. Dropping the row hides work the
 * planner scheduled; rendering it blank puts an unlabelled row with a Start
 * button in front of a student. Goal 2: never clip, distort, or silently
 * delete content.
 */

import type { PlannedItem } from './client'

/** `minutes` is optional because this join only needs an id and a name; the
 *  generated curriculum carries it and callers that want it should not have to
 *  cast to reach it. */
export interface ConceptLike {
  readonly id: string
  readonly name: string
  readonly minutes?: number
}
export interface ChapterLike { readonly id: string; readonly name: string; readonly concepts: readonly ConceptLike[] }
export interface SubjectLike { readonly id: string; readonly name: string; readonly chapters: readonly ChapterLike[] }

export interface ResolvedRow {
  readonly item: PlannedItem
  readonly subjectName: string
  readonly chapterName: string
  readonly conceptName: string
  /** Carried over from an earlier day and still not done. */
  readonly backlog: boolean
  /** False when the browser's curriculum could not name every part of it. */
  readonly resolved: boolean
}

/** What to show instead of a blank: the id itself, marked as unrecognised. */
function unknown(id: string): string {
  return `Unknown (${id})`
}

export function resolveItems(
  items: readonly PlannedItem[],
  subjects: readonly SubjectLike[],
): ResolvedRow[] {
  /* Order is preserved throughout: it is a decision Almanac made about what to
   * do first, and re-sorting here would quietly override the plan. */
  return items.map((item) => {
    const subject = subjects.find((s) => s.id === item.subjectId)
    const chapter = subject?.chapters.find((c) => c.id === item.chapterId)
    const concept = chapter?.concepts.find((c) => c.id === item.conceptId)

    return {
      item,
      subjectName: subject?.name ?? unknown(item.subjectId),
      chapterName: chapter?.name ?? unknown(item.chapterId),
      conceptName: concept?.name ?? unknown(item.conceptId),
      backlog: item.carriedFrom !== undefined,
      resolved: concept !== undefined && chapter !== undefined && subject !== undefined,
    }
  })
}
