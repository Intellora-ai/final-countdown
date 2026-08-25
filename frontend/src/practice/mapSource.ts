import { CURRICULUM, type Subject } from './curriculum'
import { toPracticeCurriculum } from './officialCurriculum'
import type { Subject as OfficialSubject } from '../types'

/**
 * WHICH CURRICULUM THE PRACTICE MAP DRAWS.
 *
 * Three curricula exist here and they describe different worlds:
 *
 *   src/data/curriculum/class{9..12}.ts   official CBSE, 50,504 generated lines
 *                                         from 37 hash-locked syllabus PDFs
 *   src/practice/curriculum.ts            hand-written, class-12 commerce only
 *   src/data/curriculum.ts                a mock the dashboard still reads
 *
 * The map drew the SECOND. A class-10 student opening Practice was shown
 * Accountancy and Business Studies -- subjects they do not take -- because the
 * commerce seed was the only curriculum wired in.
 *
 * `officialCurriculum.ts` converts the first into the shape the map needs. It
 * was written, fully tested, and had ZERO non-test importers until this file.
 */

export interface MapSource {
  readonly subjects: readonly Subject[]
  /**
   * Which curriculum this came from.
   *
   * Reported rather than inferred, because "this class has no data yet" and
   * "this class has data and it is empty" look identical on screen and need
   * completely different fixes.
   */
  readonly source: 'official' | 'seed' | 'empty'
  readonly reason?: string
}

/** `Class 9` -> `9`. Returns null for anything that is not one of the four. */
function classNumber(cls: string | null): 9 | 10 | 11 | 12 | null {
  const found = /(\d{1,2})/.exec(cls ?? '')
  const n = found ? Number(found[1]) : NaN
  return n === 9 || n === 10 || n === 11 || n === 12 ? n : null
}

/**
 * The curriculum for this student's class, filtered to what can be practised.
 *
 * LAZY, because each generated class file is 240-560 KB and a student has
 * exactly one class. Loading all four to draw one map would put a megabyte of
 * syllabus into the initial bundle for no reader.
 */
export async function practiceCurriculumFor(cls: string | null): Promise<MapSource> {
  const n = classNumber(cls)

  /*
   * No class chosen yet -- onboarding has not finished. The seed keeps the map
   * from being blank while that is true, and `source` says so.
   */
  if (n === null) return { subjects: CURRICULUM, source: 'seed' }

  const loaders: Record<number, () => Promise<{ default?: unknown; [k: string]: unknown }>> = {
    9: () => import('../data/curriculum/class9'),
    10: () => import('../data/curriculum/class10'),
    11: () => import('../data/curriculum/class11'),
    12: () => import('../data/curriculum/class12'),
  }

  const loaded = await loaders[n]!()
  const official = (loaded[`CLASS_${n}`] ?? loaded.default) as OfficialSubject[] | undefined

  if (!official) {
    return {
      subjects: CURRICULUM,
      source: 'seed',
      reason: `class${n}.ts exported no CLASS_${n}`,
    }
  }

  const subjects = toPracticeCurriculum(official)

  if (subjects.length === 0) {
    /*
     * Every subject was dropped by the quality filter. That is a real state and
     * it is NOT the seed: falling back here would hide a broken extraction
     * behind a map that looks fine.
     */
    return {
      subjects: [],
      source: 'empty',
      reason: `every subject in class ${n} failed the topic-quality filter`,
    }
  }

  return { subjects, source: 'official' }
}
