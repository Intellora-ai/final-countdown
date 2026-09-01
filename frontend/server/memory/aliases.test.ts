/*
 * THE MEMO OF WHAT A PHRASING MEANT, ON ITS OWN.
 *
 * `speed.test.ts` proves what this BUYS -- a second learner served with no
 * model call. These prove what it must never do: invent a subject, read a row
 * it did not write, or let one context answer for another.
 */
import { describe, expect, it } from 'vitest'

import { subjectAliases } from './aliases.ts'
import { inMemoryStore as aStore } from './inMemory.spec.ts'

const AT = '2026-09-01T10:00:00.000Z'
const RECIPE = 'r1'

describe('what a phrasing was decided to mean', () => {
  it('hands back the subject the controller named', () => {
    const memo = subjectAliases(aStore(), RECIPE)
    memo.learn('ask', 'wat is fotosynthesis', 'photosynthesis', AT)
    expect(memo.subjectFor('ask', 'wat is fotosynthesis')).toBe('photosynthesis')
  })

  it('knows nothing about a phrasing nobody has decided', () => {
    const memo = subjectAliases(aStore(), RECIPE)
    expect(memo.subjectFor('ask', 'what is a limit')).toBeNull()
  })

  it('matches however it was typed', () => {
    /* Case and runs of whitespace carry no meaning in a typed question. */
    const memo = subjectAliases(aStore(), RECIPE)
    memo.learn('ask', 'What is Photosynthesis?', 'photosynthesis', AT)
    expect(memo.subjectFor('ask', '  what  is  photosynthesis? ')).toBe('photosynthesis')
  })

  it('does not let one lesson answer for another', () => {
    /*
     * "solve this" means the thing on screen, and the thing on screen differs
     * by lesson. A memo shared across contexts would teach a learner in one
     * lesson the subject of a different one.
     */
    const memo = subjectAliases(aStore(), RECIPE)
    memo.learn('lesson-a', 'solve this', 'quadratic equations', AT)
    expect(memo.subjectFor('lesson-b', 'solve this')).toBeNull()
    expect(memo.subjectFor('ask', 'solve this')).toBeNull()
  })

  it('cannot be confused by a context that contains the separator', () => {
    /* Both halves are encoded before they are joined, so `a:b` + `c` and `a` +
       `b:c` are two keys and not one. */
    const memo = subjectAliases(aStore(), RECIPE)
    memo.learn('a:b', 'c', 'first', AT)
    expect(memo.subjectFor('a', 'b:c')).toBeNull()
    expect(memo.subjectFor('a:b', 'c')).toBe('first')
  })

  it('refuses to remember nothing', () => {
    const store = aStore()
    const memo = subjectAliases(store, RECIPE)
    memo.learn('ask', '   ', 'photosynthesis', AT)
    memo.learn('ask', 'what is pi', '   ', AT)
    expect(store.rows.size, 'an empty phrasing or subject was written down').toBe(0)
    expect(memo.subjectFor('ask', '   ')).toBeNull()
  })

  it('reads a row it did not write as no alias at all', () => {
    /*
     * A row this module cannot read is not a reason to refuse to teach: the
     * caller asks the controller, which is where it was before this existed.
     */
    const store = aStore()
    const memo = subjectAliases(store, RECIPE)
    memo.learn('ask', 'what is pi', 'pi', AT)
    const key = [...store.rows.keys()][0] as string

    for (const junk of ['not json at all', 'null', '[]', '{}', '{"subject":""}', '{"subject":"pi"}']) {
      store.rows.set(key, junk)
      expect(memo.subjectFor('ask', 'what is pi'), junk).toBeNull()
    }
  })

  it('keeps the newer reading when the same phrasing is decided again', () => {
    /* Two learners get the same subject from the same controller, so a race has
       nothing to lose -- and a model that reads a sentence differently on a
       later day is the reading worth keeping. */
    const memo = subjectAliases(aStore(), RECIPE)
    memo.learn('ask', 'rate of change', 'rates', AT)
    memo.learn('ask', 'rate of change', 'derivatives', '2026-09-02T10:00:00.000Z')
    expect(memo.subjectFor('ask', 'rate of change')).toBe('derivatives')
  })

  it('forgets a reading the current controller did not make', () => {
    /*
     * A reading is the CONTROLLER'S, and the controller reads through a prompt.
     * `lessons.ts` retires a lesson whose recipe changed for the same reason,
     * and without this an entry had no expiry of any kind -- so a reading the
     * model would no longer give was served for ever, and the fast path, which
     * never re-learns, guaranteed nothing would go back and ask again.
     */
    const store = aStore()
    subjectAliases(store, 'old-prompt').learn('ask', 'rate of change', 'rates', AT)
    expect(subjectAliases(store, 'new-prompt').subjectFor('ask', 'rate of change')).toBeNull()
    expect(subjectAliases(store, 'old-prompt').subjectFor('ask', 'rate of change')).toBe('rates')
  })

  it('reads a row written before recipes existed as no alias at all', () => {
    const store = aStore()
    const memo = subjectAliases(store, RECIPE)
    memo.learn('ask', 'what is pi', 'pi', AT)
    const key = [...store.rows.keys()][0] as string
    store.rows.set(key, JSON.stringify({ subject: 'pi', at: AT }))
    expect(memo.subjectFor('ask', 'what is pi')).toBeNull()
  })
})
