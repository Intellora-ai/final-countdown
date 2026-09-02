/**
 * G4 — OFF-SYLLABUS IS TAUGHT, KEPT, AND NEVER COUNTED.
 *
 * A Class 10 student asks about black holes. She is taught properly, on the
 * canvas she was already on, and it stays there -- nothing is deleted and she
 * never sees a refusal. The separation is in the BACKEND: that answer must not
 * enter mastery, prerequisites, exam weighting or the priority engine, because
 * mixing them corrupts both the progress picture and every later decision
 * about what she is ready for.
 */
import { describe, expect, it } from 'vitest'
import { isOffSyllabus } from './offSyllabus.ts'
import { whatToDoNext, type Syllabus } from './priority.ts'
import type { Evidence } from './memory/evidence.ts'

const syllabus: Syllabus = {
  topics: [
    { id: 'real-numbers--euclid', name: "Euclid's division lemma", deps: [] },
    { id: 'polynomials--zeros', name: 'Zeros of a polynomial', deps: ['real-numbers--euclid'] },
  ],
}

describe('telling on-syllabus from off', () => {
  it('a topic the curriculum names is on it', () => {
    expect(isOffSyllabus('polynomials--zeros', syllabus)).toBe(false)
  })

  it('a topic it does not name is off it', () => {
    expect(isOffSyllabus('black-holes', syllabus)).toBe(true)
  })

  it('the free canvas -- no topic at all -- is off it, and never counted', () => {
    expect(isOffSyllabus('', syllabus)).toBe(true)
    expect(isOffSyllabus(null, syllabus)).toBe(true)
  })
})

describe('what off-syllabus work does to her progress', () => {
  const answered = (said: string): Evidence => ({ said, kind: 'answer', at: '2026-09-02T10:00:00Z' })

  it('nothing: the next thing to do is exactly what it was', () => {
    const before = whatToDoNext(syllabus, new Map())
    const after = whatToDoNext(syllabus, new Map([['black-holes', [answered('so gravity wins')]]]))
    expect(after).toEqual(before)
  })

  it('and a topic she really did answer on still counts', () => {
    const after = whatToDoNext(
      syllabus,
      new Map([
        ['black-holes', [answered('so gravity wins')]],
        ['real-numbers--euclid', [answered('so you take the remainder')]],
      ]),
    )
    expect(after.map((one) => one.topicId)).not.toContain('real-numbers--euclid')
    expect(after[0]?.topicId).toBe('polynomials--zeros')
  })
})
