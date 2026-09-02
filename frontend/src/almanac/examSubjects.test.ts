/**
 * G1 — AN ENTRANCE-EXAM STUDENT HAS A WAY INTO LEARNING.
 *
 * `src/data/exams/` holds four syllabi traced to official PDFs, and they are
 * loaded by exactly one file: the practice screen's `mapSource.ts`. The canvas
 * only ever sees `plannedSubjects(cls)`. So a JEE student -- who may not be in
 * any CBSE class this app knows -- could not open a single topic to learn.
 *
 * The exam's subjects arrive in the SAME shape as a class's, so the sidebar,
 * `topicNamed` and `prerequisitesOf` need no special case: one code path, which
 * is what makes "all of it works" checkable rather than aspirational.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { whyExamIsEmpty, examSubjects, isExamCurriculumReady, primeExamCurriculum, resetExamCurriculum } from './examSubjects'
import { topicNamed } from './topic'

beforeEach(() => {
  resetExamCurriculum()
})

describe('the exam a student is sitting is a curriculum like any other', () => {
  it('is empty and honest before it has loaded, never a guess', () => {
    expect(examSubjects('jee-main-2026')).toEqual([])
    expect(isExamCurriculumReady('jee-main-2026')).toBe(false)
  })

  it('loads JEE and hands back subjects with chapters and topics', async () => {
    await primeExamCurriculum('jee-main-2026')
    const subjects = examSubjects('jee-main-2026')
    expect(isExamCurriculumReady('jee-main-2026')).toBe(true)
    expect(subjects.length).toBeGreaterThan(0)
    expect(subjects.some((one) => /physics|chemistry|math/i.test(one.name))).toBe(true)
    const withTopics = subjects.flatMap((one) => one.chapters).flatMap((one) => one.concepts)
    expect(withTopics.length).toBeGreaterThan(20)
  })

  it('the three exams with a published syllabus name real topics', async () => {
    /* MEASURED: JEE Main 433+, NEET UG 433, CLAT 15 topics. */
    for (const exam of ['jee-main-2026', 'neet-ug-2026', 'clat-2027']) {
      await primeExamCurriculum(exam)
      const topics = examSubjects(exam).flatMap((one) => one.chapters).flatMap((one) => one.concepts)
      expect(topics.length, `${exam} has no topics`).toBeGreaterThan(0)
      expect(topics.every((one) => one.id !== '' && one.name !== ''), `${exam} has a nameless topic`).toBe(true)
    }
  })

  it('IPMAT has no topics because none are published, and says so rather than looking broken', async () => {
    /* IPMAT Rohtak publishes an exam PATTERN -- section names and question
       counts -- and no syllabus at any level. `fromPatternPaper` refuses to
       generate topics from it, which is right: inventing a syllabus would be
       worse than an empty one. What a student must not get is a blank screen
       with no explanation. */
    await primeExamCurriculum('ipmat-2026-rohtak')
    expect(examSubjects('ipmat-2026-rohtak')).toEqual([])
    expect(whyExamIsEmpty('ipmat-2026-rohtak')).toMatch(/pattern|no topics|syllabus/i)
    expect(whyExamIsEmpty('jee-main-2026')).toBe('')
  })

  it('an exam topic resolves by the same resolver a class topic does', async () => {
    await primeExamCurriculum('jee-main-2026')
    const subjects = examSubjects('jee-main-2026')
    const topic = subjects.flatMap((one) => one.chapters).flatMap((one) => one.concepts)[0]!
    const found = topicNamed(subjects, topic.id)
    expect(found?.name).toBe(topic.name)
    expect(found?.subject).not.toBe('')
  })

  it('an exam nobody has heard of is empty, not an exception', async () => {
    await primeExamCurriculum('no-such-exam')
    expect(examSubjects('no-such-exam')).toEqual([])
  })

  it('loading twice does not download twice', async () => {
    const first = primeExamCurriculum('clat-2027')
    const second = primeExamCurriculum('clat-2027')
    expect(second).toBe(first)
    await first
    expect(isExamCurriculumReady('clat-2027')).toBe(true)
  })
})
