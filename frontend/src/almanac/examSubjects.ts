/**
 * G1 — AN ENTRANCE-EXAM STUDENT HAS A WAY INTO LEARNING.
 *
 * `src/data/exams/` holds four syllabi, each traced to an official PDF, and
 * until now exactly one file loaded them: the practice screen. The canvas only
 * ever saw `plannedSubjects(cls)`, so a student sitting JEE -- who may not be
 * in any CBSE class this app knows -- could not open one topic to learn.
 *
 * The exam's subjects arrive in the SAME `Subject[]` shape a class's do, so
 * the sidebar, `topicNamed` and `prerequisitesOf` need no special case. That
 * is the point: one code path for every topic, which is what makes "all of it
 * works" checkable rather than aspirational.
 *
 * The same sync-with-a-ready-flag shape as `plannedCurriculum.ts`, and for the
 * same reason: a component cannot await, and an empty list must be honestly
 * "not loaded yet" rather than "this exam has no topics".
 */
import type { Subject } from '../types'
import type { Subject as PracticeSubject } from '../practice/curriculum'
import { withUniqueTopicIds } from './uniqueTopics'

/**
 * ONE SHAPE FOR EVERY TOPIC. The exam syllabi call a chapter's contents
 * `topics`; the class curriculum calls them `concepts` and gives each one
 * `minutes` and `deps`. The difference is historical, and leaving it in place
 * would mean every consumer -- the sidebar, `topicNamed`, `prerequisitesOf`,
 * the priority engine -- carrying a special case for exam students. It is
 * translated once, here, at the edge.
 *
 * `deps` is empty because the exam syllabi carry no dependency edges: an
 * honest empty list, not a guess at what an official PDF did not say.
 */
function asCurriculum(subjects: readonly PracticeSubject[]): readonly Subject[] {
  return subjects.map((subject) => ({
    id: subject.id,
    name: subject.name,
    chapters: subject.chapters.map((chapter) => ({
      id: chapter.id,
      name: chapter.name,
      concepts: chapter.topics.map((topic) => ({
        id: topic.id,
        name: topic.name,
        minutes: 25,
        deps: [],
      })),
    })),
  }))
}

const CACHE = new Map<string, readonly Subject[]>()
const IN_FLIGHT = new Map<string, Promise<void>>()
/* Why an exam has no topics -- IPMAT publishes a pattern and no syllabus, and
   a student is owed that sentence rather than a blank screen. */
const WHY_EMPTY = new Map<string, string>()
const EMPTY: readonly Subject[] = []

/** Start loading one exam's syllabus. Safe to call from a render. */
export function primeExamCurriculum(examId: string | null): Promise<void> {
  if (examId === null || examId === '' || CACHE.has(examId)) return Promise.resolve()
  const existing = IN_FLIGHT.get(examId)
  if (existing !== undefined) return existing

  const loading = import('../practice/mapSource')
    .then(({ examSyllabusFor }) => examSyllabusFor(examId))
    .then(({ subjects, reason }) => {
      /* The same guarantee for an exam's syllabus; see `uniqueTopics.ts`. */
      CACHE.set(examId, withUniqueTopicIds(asCurriculum(subjects)))
      if (subjects.length === 0 && reason !== '') WHY_EMPTY.set(examId, reason)
      IN_FLIGHT.delete(examId)
    })
    .catch(() => {
      /* A syllabus that will not load is an empty one, not a broken screen. */
      CACHE.set(examId, EMPTY)
      IN_FLIGHT.delete(examId)
    })
  IN_FLIGHT.set(examId, loading)
  return loading
}

export function examSubjects(examId: string | null): readonly Subject[] {
  return examId === null ? EMPTY : (CACHE.get(examId) ?? EMPTY)
}

export function isExamCurriculumReady(examId: string | null): boolean {
  return examId !== null && CACHE.has(examId)
}

/** Why this exam has no topics, in a sentence; empty when it has some. */
export function whyExamIsEmpty(examId: string | null): string {
  return examId === null ? '' : (WHY_EMPTY.get(examId) ?? '')
}

/** Tests only: forget what was loaded. */
export function resetExamCurriculum(): void {
  CACHE.clear()
  IN_FLIGHT.clear()
  WHY_EMPTY.clear()
}
