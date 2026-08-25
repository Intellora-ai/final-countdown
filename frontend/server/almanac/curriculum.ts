/**
 * LOADING THE CURRICULUM THE SERVER PLANS AGAINST.
 *
 * The four class files under `src/data/curriculum/` are generated from the
 * official CBSE documents recorded in `data/curriculum-sources.lock.json`, and
 * every concept in them carries the pdf and page it was read from.
 *
 * WHY THE CLASSES ARE LOADED LAZILY
 *     Together they are close to a megabyte. A student is in one class, so only
 *     one is ever needed, and importing all four up front would load three
 *     class-years of a syllabus nobody asked for on every boot.
 *
 * WHY AN UNKNOWN CLASS THROWS RATHER THAN RETURNING NOTHING
 *     An empty subject list and an unrecognised class look identical to the
 *     planner and mean opposite things: "you have finished everything" versus
 *     "we do not know what you are studying". A student shown an empty day for
 *     the second reason would think they were done.
 */

import type { SubjectLike } from './plan.ts'

export const SUPPORTED_CLASSES = [9, 10, 11, 12] as const
export type SchoolClass = (typeof SUPPORTED_CLASSES)[number]

function isSupported(cls: number): cls is SchoolClass {
  return (SUPPORTED_CLASSES as readonly number[]).includes(cls)
}

export async function loadClass(cls: SchoolClass): Promise<readonly SubjectLike[]> {
  if (!isSupported(cls)) {
    throw new Error(`class ${cls} is not one this app has a curriculum for`)
  }

  switch (cls) {
    case 9:
      return (await import('../../src/data/curriculum/class9.ts')).CLASS_9
    case 10:
      return (await import('../../src/data/curriculum/class10.ts')).CLASS_10
    case 11:
      return (await import('../../src/data/curriculum/class11.ts')).CLASS_11
    default:
      return (await import('../../src/data/curriculum/class12.ts')).CLASS_12
  }
}

/**
 * The subjects a student actually chose, in the curriculum's own order.
 *
 * An id the class does not have is dropped rather than guessed at: a typo or a
 * stale saved setting must not silently become a different subject.
 */
export async function subjectsFor(
  cls: SchoolClass,
  chosen: readonly string[],
): Promise<readonly SubjectLike[]> {
  const all = await loadClass(cls)
  const wanted = new Set(chosen)
  return all.filter((subject) => wanted.has(subject.id))
}
