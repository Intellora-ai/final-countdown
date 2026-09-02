/**
 * A QUESTION LONGER THAN A MEMORY KEY CAN HOLD.
 *
 * Measured 2026-09-02 by the gibberish law: a student who pastes a paragraph
 * -- 5,000 characters, one screenful of a textbook -- got
 * `BadMemoryKey: lessonId is longer than 200 characters` thrown out through
 * the API. Long is not invalid; a key is our problem, not hers.
 */
import { describe, expect, it } from 'vitest'
import { explanationsIn } from './explanations.ts'
import { inMemoryStore } from './inMemory.spec.ts'

const her = { studentId: 'stu-1', tabId: 'any', lessonId: 'anything' }
const paragraph = 'why does a polynomial have zeros '.repeat(160)

describe('a question longer than a memory key can hold', () => {
  it('is filed, not thrown on', () => {
    const store = explanationsIn(inMemoryStore())
    expect(() =>
      store.remember(her, paragraph, { route: 'contrast', text: 'Because...', at: '2026-09-02T10:00:00Z' }),
    ).not.toThrow()
    expect(store.routesSpent(her, paragraph)).toEqual(['contrast'])
  })

  it('two different long questions are two different memories', () => {
    const store = explanationsIn(inMemoryStore())
    const other = `${paragraph} and what is a coefficient`
    store.remember(her, paragraph, { route: 'contrast', text: 'A', at: '2026-09-02T10:00:00Z' })
    store.remember(her, other, { route: 'analogy', text: 'B', at: '2026-09-02T10:01:00Z' })
    expect(store.routesSpent(her, paragraph)).toEqual(['contrast'])
    expect(store.routesSpent(her, other)).toEqual(['analogy'])
  })

  it('a question short enough to print is still printed in the key, unhashed', () => {
    /* The hash is a fallback, not the rule: a readable row is worth keeping for
       the ninety-nine questions in a hundred that fit. */
    const store = explanationsIn(inMemoryStore())
    store.remember(her, 'what is a zero', { route: 'contrast', text: 'A', at: '2026-09-02T10:00:00Z' })
    expect(store.routesSpent(her, 'what is a zero')).toEqual(['contrast'])
    expect(store.routesSpent(her, 'WHAT IS A ZERO'), 'the key stopped being case-insensitive').toEqual(['contrast'])
  })
})
