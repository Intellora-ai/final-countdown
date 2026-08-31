/* P1 — WHO THIS MEMORY BELONGS TO.
 *
 * One memory belongs to one student, in one tab, for one lesson. All three, or
 * it belongs to nobody and must not be stored.
 *
 * WHAT WENT WRONG WITHOUT THIS, IN THE SHIPPED CODE.
 *   `teachStore.ts:44` keeps canvas memory under a single browser key --
 *   `TEACH_STORAGE_KEY = 'canvas-teach'` -- for every lesson there is. Switch
 *   from physics to civics and the physics memory is gone. There is no tab
 *   identity anywhere in `src/canvas/`, so two tabs overwrite each other, and
 *   the canvas never reads `studentId`, so two students on one machine share
 *   one memory. Three leaks, one cause: nothing said who a memory was for.
 *
 * REJECT, NEVER COERCE.
 *   A missing student id quietly becoming `""` is how every student in a school
 *   ends up sharing one row. There is no default, no fallback, no "anonymous".
 *   A key that cannot be built is a write that must not happen.
 */

export interface MemoryOwner {
  readonly studentId: string
  readonly tabId: string
  readonly lessonId: string
}

/** Why a key could not be built, in words a person could act on. */
export class BadMemoryKey extends Error {}

function part(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadMemoryKey(`${name} is required and must not be empty`)
  }
  /* TRIMMED IDS WERE SILENTLY MERGED, AND THAT WAS CROSS-CONTAMINATION.
   *
   * This used to `return value.trim()`, so tab "x" and tab "x " were ONE box.
   * MEASURED through the real product: write to "x", then write to "x ", then
   * read "x" -- the first tab's work is gone, with a 200 for both writes and
   * nothing anywhere reporting a loss.
   *
   * Two different ids the caller supplied sharing one drawer is exactly what
   * the tab and lesson parts exist to prevent, and this file's own header
   * already gave the rule: "REJECT, NEVER COERCE. A missing student id quietly
   * becoming `""` is how every student in a school ends up sharing one row."
   * Trimming IS coercion; it was the header's own rule being broken one line
   * below where it was written.
   *
   * Refusing is safe for real callers: an id with a space glued to its edge is
   * a bug at the caller, and being told so beats losing an afternoon's work. */
  if (value !== value.trim()) {
    throw new BadMemoryKey(
      `${name} must not begin or end with spaces, tabs or line breaks`,
    )
  }
  if (value.length > MAX_PART) {
    throw new BadMemoryKey(`${name} is longer than ${MAX_PART} characters`)
  }
  return value
}

/** Long enough for any real id, short enough that nothing can be smuggled in. */
const MAX_PART = 200

/**
 * The one string this memory is stored under.
 *
 * SEPARATED BY A CHARACTER THE PARTS CANNOT CONTAIN. A plain join on ":" lets
 * a student called `a` in tab `b:c` collide with a student called `a:b` in tab
 * `c` -- two different people, one row. Each part is percent-encoded first, so
 * the separator can never appear inside a part and the mapping is one-to-one.
 */
export function memoryKey(owner: MemoryOwner): string {
  const student = encodeURIComponent(part(owner.studentId, 'studentId'))
  const tab = encodeURIComponent(part(owner.tabId, 'tabId'))
  const lesson = encodeURIComponent(part(owner.lessonId, 'lessonId'))
  return `${student}:${tab}:${lesson}`
}
