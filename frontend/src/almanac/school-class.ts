/* Reading the class a student actually has stored.
 *
 * `SetupFlow` writes whatever `CURRICULUM.classes` holds, and that is
 * "Class 9", not "9". Code that did `Number(student.cls)` got `NaN` and refused
 * to plan anything -- for every real student, while every test passed on a
 * fixture that said "9".
 *
 * One reader, used by everything that needs the number, so there is one place
 * to be right and one place to fix.
 */

export const SUPPORTED_CLASS_NUMBERS = [9, 10, 11, 12] as const

export type SchoolClassNumber = (typeof SUPPORTED_CLASS_NUMBERS)[number]

/* Anchored at both ends. "Class 9 dropout" and "room 9b" are not classes, and
 * accepting them would put a student into a curriculum on a stray digit. The
 * optional word covers "Class 9", "class 9", "Grade 10" and a bare "9". */
const CLASS_TEXT = /^(?:class|grade|std|standard)?\s*(\d{1,2})$/i

/** The class number, or null when this is not a class Almanac can plan for. */
export function schoolClassOf(value: string | null | undefined): SchoolClassNumber | null {
  if (typeof value !== 'string') return null
  const match = CLASS_TEXT.exec(value.trim())
  if (match === null) return null
  const parsed = Number(match[1])
  return (SUPPORTED_CLASS_NUMBERS as readonly number[]).includes(parsed)
    ? (parsed as SchoolClassNumber)
    : null
}
