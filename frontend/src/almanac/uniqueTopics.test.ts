/**
 * TWO TOPICS, ONE ID, ONE CANVAS.
 *
 * MEASURED 2026-09-03 on the real Class 11 and Class 12 curricula: Accountancy
 * and Business Studies each carry a chapter "Theory" with a topic "20 marks",
 * and a chapter "Unit 1" with a topic "Objectives". The generated id is
 * `<chapter>--<topic>`, which is unique inside a subject and not across them,
 * so both pairs collide -- 1,402 distinct ids for 1,404 topics.
 *
 * Everything the canvas does is keyed by that id: the address
 * `#/canvas/<topicId>`, the memory row, the evidence, the misconceptions. So
 * the Accountancy student and the Business Studies student would share one
 * canvas, one memory and one another's lessons, and `topicNamed` would answer
 * with whichever subject happened to come first.
 */
import { describe, expect, it } from 'vitest'

import { withUniqueTopicIds } from './uniqueTopics'
import type { Subject } from '../types'

const topic = (id: string, name: string, deps: string[] = []) => ({ id, name, minutes: 25, deps })

const COLLIDING: Subject[] = [
  {
    id: 'accountancy',
    name: 'Accountancy',
    chapters: [{ id: 'theory', name: 'Theory', concepts: [topic('theory--20-marks', 'Theory - 20 marks')] }],
  },
  {
    id: 'business-studies',
    name: 'Business Studies',
    chapters: [{ id: 'theory', name: 'Theory', concepts: [topic('theory--20-marks', 'Theory - 20 marks')] }],
  },
]

describe('a topic id belongs to exactly one topic', () => {
  it('leaves a curriculum with no collision exactly as it was', () => {
    const fine: Subject[] = [
      { id: 'maths', name: 'Maths', chapters: [{ id: 'ch', name: 'Ch', concepts: [topic('ch--a', 'A'), topic('ch--b', 'B')] }] },
    ]
    expect(withUniqueTopicIds(fine)).toEqual(fine)
  })

  it('qualifies the second one by its subject, and leaves the first alone', () => {
    const fixed = withUniqueTopicIds(COLLIDING)
    expect(fixed[0]!.chapters[0]!.concepts[0]!.id).toBe('theory--20-marks')
    expect(fixed[1]!.chapters[0]!.concepts[0]!.id).toBe('business-studies--theory--20-marks')
  })

  it('keeps every name, so nothing a learner reads changes', () => {
    const fixed = withUniqueTopicIds(COLLIDING)
    expect(fixed.map((s) => s.chapters[0]!.concepts[0]!.name)).toEqual(['Theory - 20 marks', 'Theory - 20 marks'])
  })

  it('rewrites a prerequisite inside the same subject that pointed at the renamed topic', () => {
    const withADep: Subject[] = [
      COLLIDING[0]!,
      {
        id: 'business-studies',
        name: 'Business Studies',
        chapters: [{
          id: 'theory',
          name: 'Theory',
          concepts: [topic('theory--20-marks', 'Theory - 20 marks'), topic('theory--later', 'Later', ['theory--20-marks'])],
        }],
      },
    ]
    const fixed = withUniqueTopicIds(withADep)
    const later = fixed[1]!.chapters[0]!.concepts[1]!
    expect(later.deps, 'the prerequisite still points at the old id, which is now another subject’s topic').toEqual([
      'business-studies--theory--20-marks',
    ])
  })

  it('never lets the qualified id collide either', () => {
    const nasty: Subject[] = [
      COLLIDING[0]!,
      {
        id: 'business-studies',
        name: 'Business Studies',
        chapters: [{
          id: 'theory',
          name: 'Theory',
          concepts: [topic('theory--20-marks', 'A'), topic('business-studies--theory--20-marks', 'B')],
        }],
      },
    ]
    const ids = withUniqueTopicIds(nasty).flatMap((s) => s.chapters.flatMap((c) => c.concepts.map((t) => t.id)))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('is stable: running it twice changes nothing the second time', () => {
    const once = withUniqueTopicIds(COLLIDING)
    expect(withUniqueTopicIds(once)).toEqual(once)
  })
})
