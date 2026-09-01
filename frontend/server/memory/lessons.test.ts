/*
 * A CLASSROOM ASKS THE SAME FORTY CONCEPTS.
 *
 * The scenario is a school, not a wrapper. Forty students work one syllabus, so
 * they ask the same things; the account paying for it has 200,000 tokens a day
 * and reached `Used 198032` in a single afternoon of one person testing. Every
 * test below is written from what a learner did and what it cost.
 *
 * The rule that must survive all of it: a learner is never handed an
 * explanation they have already been given. Cheapness is worth nothing if it
 * buys a repeat.
 */
import { describe, expect, it } from 'vitest'

import { writtenLessons, type Written } from './lessons.ts'
import { inMemoryStore as aStore } from './inMemory.spec.ts'

const RECIPE = 'r1'

const lesson = (id: string): Written => ({
  recipe: RECIPE,
  route: id,
  lesson: { id, question: 'What is photosynthesis?', blocks: [{ id: 'a', body: id }] },
  checkpoint: `checkpoint for ${id}`,
  next: [{ id: 'x', label: 'deeper' }],
  at: `2026-09-01T10:0${id.length % 10}:00.000Z`,
})

describe('the second student to ask a question does not pay for it', () => {
  it('hands back a lesson written for somebody else', () => {
    const shelf = writtenLessons(aStore(), RECIPE)
    shelf.keep('photosynthesis', lesson('numbers-first'))

    const found = shelf.findUnseen('photosynthesis', [])
    expect(found?.route).toBe('numbers-first')
    expect(found?.checkpoint).toBe('checkpoint for numbers-first')
    expect(found?.next).toEqual([{ id: 'x', label: 'deeper' }])
  })

  it('matches however they typed it', () => {
    /* "What is photosynthesis?" and "what  is  photosynthesis?" are one
       question. Case and runs of whitespace carry no meaning. */
    const shelf = writtenLessons(aStore(), RECIPE)
    shelf.keep('What is Photosynthesis?', lesson('contrast'))
    expect(shelf.findUnseen('what  is  photosynthesis?', [])?.route).toBe('contrast')
  })

  it('has nothing to say about a concept nobody has asked yet', () => {
    expect(writtenLessons(aStore(), RECIPE).findUnseen('quantum tunnelling', [])).toBeNull()
  })
})

describe('cheap must never mean repeated', () => {
  it('never returns a way in this learner has already had', () => {
    const shelf = writtenLessons(aStore(), RECIPE)
    shelf.keep('photosynthesis', lesson('numbers-first'))

    /* The learner who paid for that one asks again. */
    expect(shelf.findUnseen('photosynthesis', ['numbers-first'])).toBeNull()
  })

  it('offers the other ways in that they have not had', () => {
    const shelf = writtenLessons(aStore(), RECIPE)
    shelf.keep('photosynthesis', lesson('numbers-first'))
    shelf.keep('photosynthesis', lesson('sequence'))

    expect(shelf.findUnseen('photosynthesis', ['numbers-first'])?.route).toBe('sequence')
    expect(shelf.findUnseen('photosynthesis', ['numbers-first', 'sequence'])).toBeNull()
  })

  it('gives two learners at the same point the same lesson', () => {
    /* This is what makes a classroom cheap: stable order, not most-recent. */
    const shelf = writtenLessons(aStore(), RECIPE)
    shelf.keep('photosynthesis', lesson('sequence'))
    shelf.keep('photosynthesis', lesson('numbers-first'))

    const arya = shelf.findUnseen('photosynthesis', [])
    const ishan = shelf.findUnseen('photosynthesis', [])
    expect(arya?.route).toBe(ishan?.route)
  })
})

describe('the shelf survives the things that break shelves', () => {
  it('re-authoring the same way in replaces rather than duplicates', () => {
    const shelf = writtenLessons(aStore(), RECIPE)
    shelf.keep('photosynthesis', lesson('sequence'))
    shelf.keep('photosynthesis', { ...lesson('sequence'), lesson: { id: 'newer' } })

    expect(shelf.findUnseen('photosynthesis', [])?.lesson).toEqual({ id: 'newer' })
    expect(shelf.findUnseen('photosynthesis', ['sequence'])).toBeNull()
  })

  it('reads a corrupt row as an empty shelf rather than refusing to teach', () => {
    const store = aStore()
    const shelf = writtenLessons(store, RECIPE)
    shelf.keep('photosynthesis', lesson('sequence'))
    for (const key of store.rows.keys()) store.rows.set(key, 'not json at all')

    expect(() => shelf.findUnseen('photosynthesis', [])).not.toThrow()
    expect(shelf.findUnseen('photosynthesis', [])).toBeNull()
  })

  it('ignores entries that are not lessons', () => {
    const store = aStore()
    const shelf = writtenLessons(store, RECIPE)
    shelf.keep('photosynthesis', lesson('sequence'))
    for (const key of store.rows.keys()) {
      store.rows.set(key, JSON.stringify({ sequence: { route: 'sequence' } }))
    }
    /* No `lesson`, no `at` -- nothing to serve. */
    expect(shelf.findUnseen('photosynthesis', [])).toBeNull()
  })

  it('refuses to file a lesson with no route, which could never be matched', () => {
    const shelf = writtenLessons(aStore(), RECIPE)
    shelf.keep('photosynthesis', { ...lesson('x'), route: '' })
    expect(shelf.findUnseen('photosynthesis', [])).toBeNull()
  })

  it('keeps at most one entry per route axis', () => {
    const store = aStore()
    const shelf = writtenLessons(store, RECIPE)
    for (let i = 0; i < 20; i += 1) {
      shelf.keep('photosynthesis', { ...lesson(`route-${i}`), at: `2026-09-01T10:${String(i).padStart(2, '0')}:00.000Z` })
    }
    const row = JSON.parse([...store.rows.values()][0]!)
    expect(Object.keys(row).length).toBeLessThanOrEqual(12)
  })

  it('keeps one concept out of another concept’s shelf', () => {
    const shelf = writtenLessons(aStore(), RECIPE)
    shelf.keep('photosynthesis', lesson('sequence'))
    expect(shelf.findUnseen('respiration', [])).toBeNull()
  })
})

describe('a lesson written by different rules is not this product’s lesson', () => {
  /*
   * MEASURED, and the reason this exists: after the target bug was fixed, the
   * shelf served the lessons written BEFORE the fix -- one titled
   * "wat is fotosynthesis" -- in 11ms. A stored lesson has no idea the rules
   * changed underneath it, and the fix that landed did nothing for the copies
   * already on the shelf.
   */
  it('does not serve a lesson written by an older recipe', () => {
    const store = aStore()
    writtenLessons(store, 'before-the-fix').keep('photosynthesis', lesson('sequence'))

    /* Same store, same concept, same unspent route -- and a changed recipe. */
    expect(writtenLessons(store, 'after-the-fix').findUnseen('photosynthesis', [])).toBeNull()
  })

  it('serves it again once the recipe matches', () => {
    const store = aStore()
    writtenLessons(store, 'r2').keep('photosynthesis', lesson('sequence'))
    expect(writtenLessons(store, 'r2').findUnseen('photosynthesis', [])?.route).toBe('sequence')
  })

  it('ignores rows written before recipes existed', () => {
    /* An unstamped row cannot be vouched for, so it reads as absent rather
       than being trusted by default. */
    const store = aStore()
    const shelf = writtenLessons(store, RECIPE)
    shelf.keep('photosynthesis', lesson('sequence'))
    for (const key of store.rows.keys()) {
      const row = JSON.parse(store.rows.get(key)!)
      for (const entry of Object.values(row) as Record<string, unknown>[]) delete entry['recipe']
      store.rows.set(key, JSON.stringify(row))
    }
    expect(shelf.findUnseen('photosynthesis', [])).toBeNull()
  })

  it('stamps the current recipe on write, whatever the caller passed', () => {
    const store = aStore()
    const shelf = writtenLessons(store, 'current')
    shelf.keep('photosynthesis', { ...lesson('sequence'), recipe: 'stale-claim' } as never)
    expect(shelf.findUnseen('photosynthesis', [])?.recipe).toBe('current')
  })
})

describe('the same subject named two ways is one entry', () => {
  /*
   * MEASURED: a comparison asked one way was named `mass and weight` and the
   * other way `weight and mass`, so the second learner missed a lesson already
   * on the shelf and paid to have it written again. Both name one subject.
   */
  it('finds a lesson filed under the other word order', () => {
    const shelf = writtenLessons(aStore(), RECIPE)
    shelf.keep('mass and weight', lesson('contrast'))
    expect(shelf.findUnseen('weight and mass', [])?.route).toBe('contrast')
  })

  it('still keeps genuinely different subjects apart', () => {
    const shelf = writtenLessons(aStore(), RECIPE)
    shelf.keep('mass and weight', lesson('contrast'))
    expect(shelf.findUnseen('mass and energy', [])).toBeNull()
  })

  it('does not collapse two subjects made of the same words in a different relation', () => {
    /*
     * ORDER IS ARBITRARY IN A COMPARISON AND MEANINGFUL IN A RELATION, and
     * sorting every target treated them alike: `rate of change` and `change of
     * rate` sorted identically, as did `work done by a force` and `force done
     * by a work`, so the first learner's lesson was served to the second under
     * a key that no longer told them apart.
     */
    const shelf = writtenLessons(aStore(), RECIPE)
    shelf.keep('rate of change', lesson('sequence'))
    expect(shelf.findUnseen('change of rate', [])).toBeNull()

    shelf.keep('work done by a force', lesson('contrast'))
    expect(shelf.findUnseen('force done by a work', [])).toBeNull()
  })
})
