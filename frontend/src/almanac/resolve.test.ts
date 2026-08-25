/* Turning Almanac's ids into something a person can read.
 *
 * Almanac plans in IDS -- conceptId, subjectId, chapterId -- because a plan
 * must stay stable when a name is corrected. The dashboard shows NAMES, so
 * something has to join the two, and the interesting part is what happens when
 * the join fails.
 *
 * WHY A MISS IS NOT ALLOWED TO RENDER AS BLANK
 *   The server's curriculum and the browser's copy are two builds and can
 *   differ -- a rebuild dropped 569 concepts in this project only yesterday. A
 *   view that renders an unknown id as an empty row shows a student a blank
 *   line with a Start button on it. Goal 2 forbids silently dropping content,
 *   so a miss is REPORTED and stays visible with the id it could not resolve.
 */

import { describe, expect, it } from 'vitest'
import { resolveItems } from './resolve'

const SUBJECTS = [
  {
    id: 'science', name: 'Science',
    chapters: [
      { id: 'ch1', name: 'Life Processes', concepts: [{ id: 'c1', name: 'Nutrition in plants' }] },
      { id: 'ch2', name: 'Light', concepts: [{ id: 'c2', name: 'Reflection' }] },
    ],
  },
  {
    id: 'maths', name: 'Mathematics',
    chapters: [{ id: 'ch9', name: 'Polynomials', concepts: [{ id: 'c9', name: 'Zeroes of a polynomial' }] }],
  },
]

const item = (over = {}) => ({ conceptId: 'c1', subjectId: 'science', chapterId: 'ch1', minutes: 15, ...over })

describe('resolving a planned item to names', () => {
  it('finds the subject, chapter and concept names', () => {
    expect(resolveItems([item()], SUBJECTS)).toEqual([
      {
        item: item(),
        subjectName: 'Science',
        chapterName: 'Life Processes',
        conceptName: 'Nutrition in plants',
        backlog: false,
        resolved: true,
      },
    ])
  })

  it('marks an item carried from an earlier day as backlog', () => {
    const carried = item({ conceptId: 'c2', chapterId: 'ch2', carriedFrom: '2026-08-24' })
    const [row] = resolveItems([carried], SUBJECTS)

    expect(row.backlog).toBe(true)
    expect(row.item.carriedFrom).toBe('2026-08-24')
  })

  it('does not call today\'s own work backlog', () => {
    expect(resolveItems([item()], SUBJECTS)[0].backlog).toBe(false)
  })

  it('keeps an unknown concept VISIBLE, naming the id it could not resolve', () => {
    /* Dropping it would hide work the planner scheduled. Rendering it blank
     * would put an unlabelled row with a Start button in front of a student. */
    const unknown = item({ conceptId: 'c-not-here' })
    const [row] = resolveItems([unknown], SUBJECTS)

    expect(row.resolved).toBe(false)
    expect(row.conceptName).toContain('c-not-here')
    expect(row.subjectName).toBe('Science')
  })

  it('survives a subject the browser has never heard of', () => {
    const [row] = resolveItems([item({ subjectId: 'astrology', chapterId: 'x', conceptId: 'y' })], SUBJECTS)

    expect(row.resolved).toBe(false)
    expect(row.subjectName).toContain('astrology')
    expect(row.conceptName).toContain('y')
  })

  it('keeps the planner\'s order exactly', () => {
    /* The order is a decision Almanac made about what to do first. Re-sorting
     * here would quietly override the plan. */
    const items = [
      item({ conceptId: 'c9', subjectId: 'maths', chapterId: 'ch9' }),
      item({ conceptId: 'c2', chapterId: 'ch2' }),
      item(),
    ]
    expect(resolveItems(items, SUBJECTS).map((r) => r.item.conceptId)).toEqual(['c9', 'c2', 'c1'])
  })

  it('returns nothing for an empty day, without inventing a row', () => {
    expect(resolveItems([], SUBJECTS)).toEqual([])
  })

  it('does not fall over when the browser has no curriculum loaded', () => {
    const [row] = resolveItems([item()], [])
    expect(row.resolved).toBe(false)
    expect(row.conceptName).toContain('c1')
  })
})
