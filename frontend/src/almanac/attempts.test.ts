/* How many times this learner has opened this concept.
 *
 * WHY IT MATTERS
 *   The server's teaching policy escalates on the attempt count: a worked
 *   example the first time, a different representation the third, an analogy
 *   after that. Without a count that survives leaving the page, every visit is
 *   the first visit and the policy never escalates -- it would look adaptive in
 *   its tests and be fixed in front of a student.
 *
 * WHY LOCAL STORAGE AND NOT THE LEDGER
 *   The ledger records what a student FINISHED, and only the student writes it.
 *   This is a count of visits, which is not an achievement and must never be
 *   confused with one. Keeping it on the device also means a failed network
 *   call cannot silently reset the teaching back to lesson one.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { attemptsFor, recordAttempt, ATTEMPTS_KEY } from './attempts'

const store = () => {
  let data: Record<string, string> = {}
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => { data[k] = v },
    removeItem: (k: string) => { delete data[k] },
    clear: () => { data = {} },
    corrupt: (v: string) => { data[ATTEMPTS_KEY] = v },
  }
}

let memory: ReturnType<typeof store>
beforeEach(() => { memory = store() })

describe('counting attempts', () => {
  it('starts every concept at zero', () => {
    expect(attemptsFor('c1', memory)).toBe(0)
  })

  it('counts each opening, per concept, independently', () => {
    recordAttempt('c1', memory)
    recordAttempt('c1', memory)
    recordAttempt('c2', memory)

    expect(attemptsFor('c1', memory)).toBe(2)
    expect(attemptsFor('c2', memory)).toBe(1)
    expect(attemptsFor('c3', memory)).toBe(0)
  })

  it('survives being read back from storage, which is the entire point', () => {
    recordAttempt('c1', memory)
    recordAttempt('c1', memory)
    recordAttempt('c1', memory)
    /* A fresh reader over the same bytes -- what a page reload actually is. */
    expect(attemptsFor('c1', { ...memory })).toBe(3)
  })

  it('returns the count AFTER recording, so a caller cannot be off by one', () => {
    expect(recordAttempt('c1', memory)).toBe(1)
    expect(recordAttempt('c1', memory)).toBe(2)
  })
})

describe('when storage misbehaves', () => {
  it('treats corrupt data as no history rather than throwing at a learner', () => {
    /* A student cannot fix a broken JSON blob, and a thrown error here would
     * take down the teaching screen for a counter. */
    for (const junk of ['not json{', '[]', 'null', '3', '{"c1":"lots"}', '{"c1":-4}']) {
      memory.corrupt(junk)
      expect(attemptsFor('c1', memory), junk).toBe(0)
    }
  })

  it('still records after corrupt data, starting again from one', () => {
    memory.corrupt('not json{')
    expect(recordAttempt('c1', memory)).toBe(1)
    expect(attemptsFor('c1', memory)).toBe(1)
  })

  it('does not throw when storage refuses to write', () => {
    /* Private browsing, a full quota, a locked-down device. The lesson must
     * still be taught; only the escalation is lost. */
    const readonlyStore = {
      getItem: () => null,
      setItem: () => { throw new Error('quota exceeded') },
      removeItem: () => {},
    }
    expect(() => recordAttempt('c1', readonlyStore)).not.toThrow()
    expect(recordAttempt('c1', readonlyStore)).toBe(1)
  })

  it('does not throw when there is no storage at all', () => {
    expect(attemptsFor('c1', undefined)).toBe(0)
    expect(() => recordAttempt('c1', undefined)).not.toThrow()
  })
})
