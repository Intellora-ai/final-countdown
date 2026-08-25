/* The class a student actually has stored, not the one the tests invented.
 *
 * THE DEFECT THIS FILE EXISTS FOR
 *   `SetupFlow` writes whatever `CURRICULUM.classes` contains, and that is
 *   `["Class 9", "Class 10", "Class 11", "Class 12"]` -- not `"9"`.
 *
 *   `dayRequestFor` did `Number(student.cls)`, which is `NaN` for "Class 9", so
 *   it refused. `loadPlannedSubjects` compared against `['9','10','11','12']`,
 *   so it returned nothing. For EVERY REAL STUDENT the dashboard said "Choose a
 *   class first" and the teaching screen could never name a concept.
 *
 *   Every test of that chain passed, because every one of them seeded `'9'` --
 *   a value the application does not produce anywhere. A fixture that does not
 *   match reality is a test that proves the code works on the fixture.
 *
 * SO THE CASES BELOW ARE SOURCED FROM THE APPLICATION'S OWN CONSTANT.
 *   Hard-coding "Class 9" here would repeat the original mistake one level up:
 *   the day someone renames the option, this file would still pass and the
 *   product would break again.
 */

import { describe, expect, it } from 'vitest'
import CURRICULUM from '../data/curriculum'
import { schoolClassOf, SUPPORTED_CLASS_NUMBERS } from './school-class'

describe('reading a stored class', () => {
  it('has real options to check, so this file is not vacuous', () => {
    expect(CURRICULUM.classes.length).toBeGreaterThan(0)
  })

  it('understands EVERY option the setup screen actually offers', () => {
    /* The check that would have caught this. Nothing here is written by hand. */
    for (const option of CURRICULUM.classes) {
      const parsed = schoolClassOf(option)
      expect(parsed, `setup offers "${option}" and Almanac cannot read it`).not.toBeNull()
      expect(SUPPORTED_CLASS_NUMBERS).toContain(parsed)
    }
  })

  it('maps each option to the number the planner uses', () => {
    expect(schoolClassOf('Class 9')).toBe(9)
    expect(schoolClassOf('Class 10')).toBe(10)
    expect(schoolClassOf('Class 11')).toBe(11)
    expect(schoolClassOf('Class 12')).toBe(12)
  })

  it('still reads a bare number, which older records hold', () => {
    /* A student set up before this existed has "9" on their device. Refusing it
     * now would break exactly the people the fix is for. */
    expect(schoolClassOf('9')).toBe(9)
    expect(schoolClassOf('12')).toBe(12)
  })

  it('tolerates the spellings a record can pick up over time', () => {
    expect(schoolClassOf('  Class 10  ')).toBe(10)
    expect(schoolClassOf('class 10')).toBe(10)
    expect(schoolClassOf('CLASS 10')).toBe(10)
    expect(schoolClassOf('Grade 10')).toBe(10)
  })

  it('refuses a class Almanac has no curriculum for', () => {
    /* Silence would be worse: the student would get an empty day and no reason. */
    for (const value of ['Class 8', 'Class 13', '8', '13', 'Class', '', '   ', null, undefined]) {
      expect(schoolClassOf(value as string | null), String(value)).toBeNull()
    }
  })

  it('does not read a number out of the middle of unrelated text', () => {
    /* "Class 9 dropout" is not a class. Accepting it would put a student into a
     * curriculum on the strength of a stray digit. */
    for (const value of ['I am in 9 different clubs', 'room 9b', '9th', 'Class 9 and 10']) {
      expect(schoolClassOf(value), value).toBeNull()
    }
  })
})
