/**
 * G2 — ONE CODE PATH FOR EVERY TOPIC, IN EVERY CLASS AND EVERY EXAM.
 *
 * A topic id from Class 9 English and one from NEET Biology must travel the
 * identical route: resolved by the same resolver, given prerequisites by the
 * same reader, filed under a key the same memory accepts. No subject, class or
 * exam may be special-cased -- that is what makes "all of it works" a thing
 * anyone can check rather than a thing somebody hopes.
 *
 * This walks the REAL curricula: 3,995 concepts across four classes and 881
 * across the three exams that publish a syllabus. Every topic is checked for
 * the properties a canvas needs; a spread of them is opened for real.
 */
import { describe, expect, it } from 'vitest'

import { examSubjects, primeExamCurriculum, resetExamCurriculum, whyExamIsEmpty } from './examSubjects'
import { plannedSubjects, primePlannedCurriculum } from './plannedCurriculum'
import { prerequisitesOf, topicNamed } from './topic'
import type { Subject } from '../types'

const CLASSES = ['9', '10', '11', '12'] as const
const EXAMS_WITH_A_SYLLABUS = ['jee-main-2026', 'neet-ug-2026', 'clat-2027'] as const

/** The memory key's own rule, from `server/memory/key.ts`: no spaces, no colons. */
const A_USABLE_KEY = /^[^\s:]{1,200}$/

function everyTopic(subjects: readonly Subject[]) {
  return subjects.flatMap((subject) =>
    subject.chapters.flatMap((chapter) =>
      chapter.concepts.map((concept) => ({ subject, chapter, concept })),
    ),
  )
}

/** A spread rather than the first three: the front of a list is the best-tended part. */
function spread<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items]
  const step = Math.floor(items.length / count)
  return Array.from({ length: count }, (_, i) => items[i * step]!)
}

async function subjectsFor(source: string): Promise<readonly Subject[]> {
  if ((CLASSES as readonly string[]).includes(source)) {
    await primePlannedCurriculum(source)
    return plannedSubjects(source)
  }
  await primeExamCurriculum(source)
  return examSubjects(source)
}

const EVERY_SOURCE = [...CLASSES, ...EXAMS_WITH_A_SYLLABUS]

describe('every class and every exam is one curriculum shape', () => {
  it.each(EVERY_SOURCE)('%s has subjects, chapters and named topics', async (source) => {
    const subjects = await subjectsFor(source)
    expect(subjects.length, `${source} has no subjects`).toBeGreaterThan(0)
    const topics = everyTopic(subjects)
    expect(topics.length, `${source} has no topics`).toBeGreaterThan(10)
    for (const { concept } of topics) {
      expect(concept.id, `${source} has a topic with no id`).not.toBe('')
      expect(concept.name.trim(), `${source} topic ${concept.id} has no name`).not.toBe('')
    }
  })

  it.each(EVERY_SOURCE)('%s: every topic id is one a canvas can open and a memory can hold', async (source) => {
    const subjects = await subjectsFor(source)
    const bad = everyTopic(subjects)
      .filter(({ concept }) => !A_USABLE_KEY.test(concept.id))
      .map(({ concept }) => concept.id)
    expect(bad.slice(0, 5), `${source} has topic ids the memory key would refuse`).toEqual([])
  })

  it.each(EVERY_SOURCE)('%s: every topic id is unique, so two canvases can never collide', async (source) => {
    const subjects = await subjectsFor(source)
    const ids = everyTopic(subjects).map(({ concept }) => concept.id)
    const seen = new Set<string>()
    const collisions = ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false)))
    expect(collisions.slice(0, 5), `${source} reuses a topic id`).toEqual([])
  })

  it.each(EVERY_SOURCE)('%s: a spread of topics each resolve by the one resolver', async (source) => {
    const subjects = await subjectsFor(source)
    for (const { concept, chapter, subject } of spread(everyTopic(subjects), 12)) {
      const found = topicNamed(subjects, concept.id)
      expect(found, `${source}: ${concept.id} does not resolve`).not.toBeNull()
      expect(found?.name).toBe(concept.name)
      expect(found?.chapter).toBe(chapter.name)
      expect(found?.subject).toBe(subject.name)
    }
  })

  it.each(EVERY_SOURCE)('%s: prerequisites are read by the one reader and never leave the subject', async (source) => {
    const subjects = await subjectsFor(source)
    const bySubject = new Map(
      subjects.map((subject) => [subject.id, new Set(subject.chapters.flatMap((c) => c.concepts.map((t) => t.id)))]),
    )
    for (const { concept, subject } of spread(everyTopic(subjects), 25)) {
      const listed = prerequisitesOf(subjects, concept.id)
      for (const one of listed) {
        expect(bySubject.get(subject.id)!.has(one.id), `${source}: ${concept.id} depends on ${one.id} from another subject`).toBe(true)
        expect(one.name.trim()).not.toBe('')
      }
    }
  })

  it.each(['11', '12'])('class %s: Accountancy and Business Studies keep their own Theory topic', async (cls) => {
    /* THE COLLISION THIS SUITE FOUND, pinned. Both subjects carry a chapter
       "Theory" with a topic "20 marks" and a chapter "Unit 1" with a topic
       "Objectives"; the generated id is `<chapter>--<topic>`, so all four
       shared two ids -- one canvas, one memory row, and whichever subject the
       loader listed first winning the name. */
    const subjects = await subjectsFor(cls)
    const named = (subjectId: string, chapterId: string) =>
      subjects.find((s) => s.id === subjectId)?.chapters.find((c) => c.id === chapterId)?.concepts ?? []
    for (const chapter of ['theory', 'unit-1']) {
      const accountancy = named('accountancy', chapter)
      const business = named('business-studies', chapter)
      expect(accountancy.length, `class ${cls} accountancy/${chapter} is missing`).toBeGreaterThan(0)
      expect(business.length, `class ${cls} business-studies/${chapter} is missing`).toBeGreaterThan(0)
      for (const one of business) {
        const found = topicNamed(subjects, one.id)
        expect(found?.subject, `${one.id} opens somebody else's canvas`).toBe('Business Studies')
      }
      for (const one of accountancy) {
        expect(topicNamed(subjects, one.id)?.subject).toBe('Accountancy')
      }
    }
  })

  it('a topic id from one curriculum never resolves inside another', async () => {
    /* The other half of "one code path": the same route, and no bleed. */
    const ten = await subjectsFor('10')
    const jee = await subjectsFor('jee-main-2026')
    const aTenTopic = everyTopic(ten)[0]!.concept
    const aJeeTopic = everyTopic(jee)[0]!.concept
    expect(topicNamed(jee, aTenTopic.id)).toBeNull()
    expect(topicNamed(ten, aJeeTopic.id)).toBeNull()
  })

  it('the exam that publishes no syllabus says so, and is not silently empty', async () => {
    resetExamCurriculum()
    await primeExamCurriculum('ipmat-2026-rohtak')
    expect(examSubjects('ipmat-2026-rohtak')).toEqual([])
    expect(whyExamIsEmpty('ipmat-2026-rohtak')).toMatch(/pattern|no topics|syllabus/i)
  })

  it('the four classes and three syllabi together are the scale this has to work at', async () => {
    let classes = 0
    for (const cls of CLASSES) classes += everyTopic(await subjectsFor(cls)).length
    let exams = 0
    for (const exam of EXAMS_WITH_A_SYLLABUS) exams += everyTopic(await subjectsFor(exam)).length
    /* Measured 2026-09-03: 3,995 across the classes, 881 across the exams.
       Pinned as a floor so a curriculum that silently stops loading is seen. */
    expect(classes).toBeGreaterThan(3_000)
    expect(exams).toBeGreaterThan(500)
  })
})
