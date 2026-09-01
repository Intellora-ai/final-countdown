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
import type { MemoryStore } from './sqliteStore.ts'

/** The store Phases 1 and 2 built, in memory, with the same update contract. */
function aStore(): MemoryStore & { rows: Map<string, string> } {
  const rows = new Map<string, string>()
  return {
    rows,
    read: (key: string) => rows.get(key),
    write: (key: string, value: string) => {
      rows.set(key, value)
    },
    update: (key: string, _at: string, change: (current: string | undefined) => string) => {
      rows.set(key, change(rows.get(key)))
    },
  } as unknown as MemoryStore & { rows: Map<string, string> }
}

const lesson = (id: string): Written => ({
  route: id,
  lesson: { id, question: 'What is photosynthesis?', blocks: [{ id: 'a', body: id }] },
  checkpoint: `checkpoint for ${id}`,
  next: [{ id: 'x', label: 'deeper' }],
  at: `2026-09-01T10:0${id.length % 10}:00.000Z`,
})

describe('the second student to ask a question does not pay for it', () => {
  it('hands back a lesson written for somebody else', () => {
    const shelf = writtenLessons(aStore())
    shelf.keep('photosynthesis', lesson('numbers-first'))

    const found = shelf.findUnseen('photosynthesis', [])
    expect(found?.route).toBe('numbers-first')
    expect(found?.checkpoint).toBe('checkpoint for numbers-first')
    expect(found?.next).toEqual([{ id: 'x', label: 'deeper' }])
  })

  it('matches however they typed it', () => {
    /* "What is photosynthesis?" and "what  is  photosynthesis?" are one
       question. Case and runs of whitespace carry no meaning. */
    const shelf = writtenLessons(aStore())
    shelf.keep('What is Photosynthesis?', lesson('contrast'))
    expect(shelf.findUnseen('what  is  photosynthesis?', [])?.route).toBe('contrast')
  })

  it('has nothing to say about a concept nobody has asked yet', () => {
    expect(writtenLessons(aStore()).findUnseen('quantum tunnelling', [])).toBeNull()
  })
})

describe('cheap must never mean repeated', () => {
  it('never returns a way in this learner has already had', () => {
    const shelf = writtenLessons(aStore())
    shelf.keep('photosynthesis', lesson('numbers-first'))

    /* The learner who paid for that one asks again. */
    expect(shelf.findUnseen('photosynthesis', ['numbers-first'])).toBeNull()
  })

  it('offers the other ways in that they have not had', () => {
    const shelf = writtenLessons(aStore())
    shelf.keep('photosynthesis', lesson('numbers-first'))
    shelf.keep('photosynthesis', lesson('sequence'))

    expect(shelf.findUnseen('photosynthesis', ['numbers-first'])?.route).toBe('sequence')
    expect(shelf.findUnseen('photosynthesis', ['numbers-first', 'sequence'])).toBeNull()
  })

  it('gives two learners at the same point the same lesson', () => {
    /* This is what makes a classroom cheap: stable order, not most-recent. */
    const shelf = writtenLessons(aStore())
    shelf.keep('photosynthesis', lesson('sequence'))
    shelf.keep('photosynthesis', lesson('numbers-first'))

    const arya = shelf.findUnseen('photosynthesis', [])
    const ishan = shelf.findUnseen('photosynthesis', [])
    expect(arya?.route).toBe(ishan?.route)
  })
})

describe('the shelf survives the things that break shelves', () => {
  it('re-authoring the same way in replaces rather than duplicates', () => {
    const shelf = writtenLessons(aStore())
    shelf.keep('photosynthesis', lesson('sequence'))
    shelf.keep('photosynthesis', { ...lesson('sequence'), lesson: { id: 'newer' } })

    expect(shelf.findUnseen('photosynthesis', [])?.lesson).toEqual({ id: 'newer' })
    expect(shelf.findUnseen('photosynthesis', ['sequence'])).toBeNull()
  })

  it('reads a corrupt row as an empty shelf rather than refusing to teach', () => {
    const store = aStore()
    const shelf = writtenLessons(store)
    shelf.keep('photosynthesis', lesson('sequence'))
    for (const key of store.rows.keys()) store.rows.set(key, 'not json at all')

    expect(() => shelf.findUnseen('photosynthesis', [])).not.toThrow()
    expect(shelf.findUnseen('photosynthesis', [])).toBeNull()
  })

  it('ignores entries that are not lessons', () => {
    const store = aStore()
    const shelf = writtenLessons(store)
    shelf.keep('photosynthesis', lesson('sequence'))
    for (const key of store.rows.keys()) {
      store.rows.set(key, JSON.stringify({ sequence: { route: 'sequence' } }))
    }
    /* No `lesson`, no `at` -- nothing to serve. */
    expect(shelf.findUnseen('photosynthesis', [])).toBeNull()
  })

  it('refuses to file a lesson with no route, which could never be matched', () => {
    const shelf = writtenLessons(aStore())
    shelf.keep('photosynthesis', { ...lesson('x'), route: '' })
    expect(shelf.findUnseen('photosynthesis', [])).toBeNull()
  })

  it('keeps at most one entry per route axis', () => {
    const store = aStore()
    const shelf = writtenLessons(store)
    for (let i = 0; i < 20; i += 1) {
      shelf.keep('photosynthesis', { ...lesson(`route-${i}`), at: `2026-09-01T10:${String(i).padStart(2, '0')}:00.000Z` })
    }
    const row = JSON.parse([...store.rows.values()][0]!)
    expect(Object.keys(row).length).toBeLessThanOrEqual(12)
  })

  it('keeps one concept out of another concept’s shelf', () => {
    const shelf = writtenLessons(aStore())
    shelf.keep('photosynthesis', lesson('sequence'))
    expect(shelf.findUnseen('respiration', [])).toBeNull()
  })
})
