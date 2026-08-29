/**
 * THE RIGHT LEVEL, BY CONSTRUCTION RATHER THAN BY CHECKING AFTERWARDS.
 *
 *   subjects + entrance exam the student picked  ->  level
 *   level                                        ->  scopes the WEB SEARCH
 *   scoped sources                               ->  the lesson is at the right
 *                                                    level because wrong-level
 *                                                    material never arrived
 *
 * `grounding.ts` already states this principle for TRUTH -- "the fix belongs
 * BEFORE the sentence exists" -- and it carries to level unchanged. A level
 * check applied to a finished lesson would reject good lessons and still pass a
 * badly-pitched one that happened to score in band. Scoping the query means the
 * model never sees material written for the wrong reader.
 *
 * WHERE THIS DEPARTS FROM THE WRITTEN PLAN, DELIBERATELY
 * ------------------------------------------------------
 * The plan said: "No silent default. A missing profile REFUSES."
 *
 * Overruled, by a later and more important instruction: a valid educational
 * request must never be refused because configuration is missing. Refusing a
 * lesson because nobody picked an exam is precisely the curriculum lock this
 * product must not have -- missing setup is a CONTENT GAP, not a user error.
 *
 * The plan's actual worry still holds and is still honoured. An unset profile
 * does not get an invented default either. It gets NO scoping, which leaves the
 * search exactly as it behaved before this module existed. Unscoped is honest.
 * Wrongly-scoped is not.
 *
 * WHY THE IDS ARE DECLARED HERE AND NOT IMPORTED
 * ----------------------------------------------
 * `src/practice/examChoice.ts` owns the list the student picks from. This file
 * does not import it, for the reason `webResolver.ts` records about the
 * retrieval area: `tsconfig.canvas.json` checks `src/canvas` under
 * `noUncheckedIndexedAccess`, a flag the rest of the package is not written
 * against, and importing across drags a whole directory into the stricter
 * project.
 *
 * The sibling directory is deliberately NOT named here. `island.test.ts` pins
 * an exact inventory of the files that reference the retrieval area, by
 * scanning source text -- so a comment that merely MENTIONS it makes this file
 * look wired to something it does not import, and the tripwire fires on a file
 * that wires nothing. The test is right and this comment was wrong; naming the
 * directory in prose was a false signal, not a missing entry in the list.
 *
 * The drift that opens is real and named: an exam added to `examChoice.ts` and
 * not here would silently get no scoping. `level.test.ts` drives its coverage
 * check off `EXAM_LEVELS` itself, so a new id arrives unscoped and the suite
 * says so by name -- the same technique `ruleCensus` uses on teaching rules.
 */

/**
 * What each exam means for the READING LEVEL of a source, in the words a search
 * engine can act on.
 *
 * Phrased as the audience, never as the exam name alone. "JEE Main" as a query
 * returns pages about the exam -- syllabus PDFs, coaching adverts, cutoffs.
 * "class 11 12 physics chemistry maths" returns the material a student at that
 * level can actually read, which is the thing being scoped for.
 */
export const EXAM_LEVELS: Record<string, string> = {
  'jee-main-2026': 'physics chemistry mathematics',
  'neet-ug-2026': 'biology physics chemistry',
  'clat-2027': 'legal reasoning english logical reasoning',
  'ipmat-2026-rohtak': 'quantitative aptitude verbal ability logical reasoning',
}

/**
 * The class the student is in. The other half of the level, and without it the
 * exam is far too coarse.
 *
 * A class 9 student and a class 12 student both preparing for JEE are YEARS
 * apart. Handing them the same sources is the exact harm the plan warned about:
 * "a class-10 student gets an MIT-level explanation."
 *
 *   the EXAM says which SUBJECTS matter
 *   the CLASS says HOW FAR ALONG the student is
 *
 * Neither alone is the level, and either alone is better than nothing.
 */
export const CLASS_LEVELS: Record<string, string> = {
  '9': 'class 9 school level, simple language',
  '10': 'class 10 school level, simple language',
  '11': 'class 11 school level',
  '12': 'class 12 school level',
}

/**
 * The scope for an exam id, or '' when there is none.
 *
 * An unknown id returns '' rather than throwing. A stale id in local storage,
 * or one from a newer build, must never be able to stop a lesson.
 */
export function levelScope(examId: string | null, classId: string | null = null): string {
  const subjects = examId === null ? '' : (EXAM_LEVELS[examId] ?? '')
  const depth = classId === null ? '' : (CLASS_LEVELS[classId] ?? '')
  /* Class first, because it is the harder constraint. A source pitched at the
     wrong depth is unusable whatever subject it covers, while a source at the
     right depth in an adjacent subject is often still worth reading. */
  return [depth, subjects].filter((part) => part !== '').join(' ')
}

/**
 * The query the search actually receives.
 *
 * THE LEARNER'S QUESTION COMES FIRST, and the order is not cosmetic. A query
 * that leads with the exam returns pages ABOUT the exam rather than about the
 * thing asked, and the learner gets a syllabus PDF instead of an explanation.
 * The scope is a qualifier on the subject, never the subject.
 */
export function scopedQuery(
  question: string,
  examId: string | null,
  classId: string | null = null,
): string {
  const scope = levelScope(examId, classId)
  return scope === '' ? question : `${question} ${scope}`
}
