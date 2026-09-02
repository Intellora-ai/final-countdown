import { CURRICULUM, type Subject } from './curriculum'
import { fromPatternPaper, fromSkillPaper, fromSyllabus } from './examCurriculum'
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
  /**
   * What happened to the entrance exam, when one was asked for.
   *
   * `pattern-only` is a real and correct outcome, not a failure: IPMAT
   * publishes section names and question counts and no topics at any level.
   * Absent means no exam was requested.
   */
  readonly exam?: {
    readonly id: string
    readonly source: 'official' | 'pattern-only' | 'unknown'
    readonly reason?: string
  }
}

/**
 * The entrance exams, and the three different shapes they publish.
 *
 * Lazy for the same reason the class files are: a student sits exactly one
 * exam, and NEET alone is 47 KB of syllabus.
 */
const EXAMS: Record<string, () => Promise<{ subjects: Subject[]; source: 'official' | 'pattern-only'; reason?: string }>> = {
  'jee-main-2026': async () => ({
    subjects: fromSyllabus((await import('../data/exams/jee-main-2026')).jee_main_2026),
    source: 'official',
  }),
  'neet-ug-2026': async () => ({
    subjects: fromSyllabus((await import('../data/exams/neet-ug-2026')).neet_ug_2026),
    source: 'official',
  }),
  'clat-2027': async () => ({
    subjects: fromSkillPaper((await import('../data/exams/clat-2027')).clat_2027),
    source: 'official',
  }),
  'ipmat-2026-rohtak': async () => {
    const result = fromPatternPaper((await import('../data/exams/ipmat-2026-rohtak')).ipmat_2026_rohtak)
    return { subjects: result.subjects, source: 'pattern-only', reason: result.reason }
  },
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
export async function practiceCurriculumFor(
  cls: string | null,
  examId: string | null = null,
): Promise<MapSource> {
  const n = classNumber(cls)

  /*
   * No class chosen yet -- onboarding has not finished. The seed keeps the map
   * from being blank while that is true, and `source` says so.
   */
  if (n === null) return withExam({ subjects: CURRICULUM, source: 'seed' }, await loadExam(examId))

  const loaders: Record<number, () => Promise<{ default?: unknown; [k: string]: unknown }>> = {
    9: () => import('../data/curriculum/class9'),
    10: () => import('../data/curriculum/class10'),
    11: () => import('../data/curriculum/class11'),
    12: () => import('../data/curriculum/class12'),
  }

  const loaded = await loaders[n]!()
  const official = (loaded[`CLASS_${n}`] ?? loaded.default) as OfficialSubject[] | undefined

  if (!official) {
    return withExam(
      { subjects: CURRICULUM, source: 'seed', reason: `class${n}.ts exported no CLASS_${n}` },
      await loadExam(examId),
    )
  }

  const subjects = toPracticeCurriculum(official)

  if (subjects.length === 0) {
    /*
     * Every subject was dropped by the quality filter. That is a real state and
     * it is NOT the seed: falling back here would hide a broken extraction
     * behind a map that looks fine.
     */
    return withExam(
      {
        subjects: [],
        source: 'empty',
        reason: `every subject in class ${n} failed the topic-quality filter`,
      },
      await loadExam(examId),
    )
  }

  return withExam({ subjects, source: 'official' }, await loadExam(examId))
}

type LoadedExam = MapSource['exam'] extends infer E ? (E & { subjects: readonly Subject[] }) | null : never

/**
 * An unknown exam id is REPORTED, never thrown and never ignored.
 *
 * A typo in a stored preference would otherwise empty the exam half of the map
 * with nothing on screen or in the state to say why.
 */
/**
 * G1: one exam's subjects, for anything that teaches rather than tests. The
 * four syllabi were reachable only through `practiceCurriculumFor`, which
 * needs a class and returns a practice map; the canvas needs neither.
 */
export async function examSyllabusFor(
  examId: string,
): Promise<{ readonly subjects: readonly Subject[]; readonly reason: string }> {
  const loader = EXAMS[examId]
  if (!loader) return { subjects: [], reason: `no exam named ${examId}` }
  const loaded = await loader()
  return { subjects: loaded.subjects, reason: loaded.reason ?? '' }
}

async function loadExam(examId: string | null): Promise<LoadedExam> {
  if (examId === null) return null

  const loader = EXAMS[examId]
  if (!loader) {
    return {
      id: examId,
      source: 'unknown',
      reason: `no exam named ${examId}; known exams are ${Object.keys(EXAMS).join(', ')}`,
      subjects: [],
    }
  }

  const loaded = await loader()
  return { id: examId, source: loaded.source, reason: loaded.reason, subjects: loaded.subjects }
}

/**
 * The exam is ADDED to the class, never substituted for it.
 *
 * A student sits both. Class 11 Physics and JEE Physics overlap and are not the
 * same scope, so replacing one with the other would hide half the syllabus the
 * student is actually examined on. Subject ids are namespaced by
 * `examCurriculum`, so the two trees cannot merge into one heading.
 */
function withExam(base: MapSource, exam: LoadedExam): MapSource {
  if (exam === null) return base

  const { subjects, ...meta } = exam
  return { ...base, subjects: [...base.subjects, ...subjects], exam: meta }
}
