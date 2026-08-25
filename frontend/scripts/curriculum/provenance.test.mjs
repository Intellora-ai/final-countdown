/* The provenance gate.
 *
 * DESIRED OUTCOME
 *   Every fact the app teaches can be traced to a page of an official document.
 *
 * WHY THIS RUNS AGAINST THE REAL BUILD OUTPUT
 *   The unit tests in build.test.mjs prove the builder behaves on fixtures. This
 *   one asserts the same things about the 2283 concepts actually shipping, so a
 *   document that starts producing untraceable or oversized concepts fails the
 *   build rather than reaching a student.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { buildClasses } from './build.mjs'
import { MANIFEST } from './manifest.mjs'

const extracted = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../data/curriculum-extracted.json', import.meta.url)), 'utf8'),
)
const classes = buildClasses(extracted, MANIFEST)
const everyConcept = Object.values(classes)
  .flat()
  .flatMap((s) => s.chapters.flatMap((c) => c.concepts))

describe('the shipped curriculum', () => {
  it('is not empty', () => {
    expect(everyConcept.length).toBeGreaterThan(1000)
  })

  it('covers classes 9, 10, 11 and 12', () => {
    expect(Object.keys(classes).sort()).toEqual(['10', '11', '12', '9'])
  })

  it('gives every concept a source document and page', () => {
    const untraceable = everyConcept.filter((c) => !c.source || typeof c.source.pdf !== 'string')
    expect(untraceable.map((c) => c.id)).toEqual([])
  })

  it('names a real manifest document as every concept’s source', () => {
    const known = new Set(MANIFEST.map((m) => m.slug))
    const strangers = everyConcept.filter((c) => !known.has(c.source.pdf))
    expect([...new Set(strangers.map((c) => c.source.pdf))]).toEqual([])
  })

  it('keeps every concept inside the ten to twenty-five minute band', () => {
    const outOfBand = everyConcept.filter((c) => c.minutes < 10 || c.minutes > 25)
    expect(outOfBand.map((c) => `${c.id}=${c.minutes}`)).toEqual([])
  })

  it('resolves every dependency to a concept that exists', () => {
    for (const subjects of Object.values(classes)) {
      for (const subject of subjects) {
        const ids = new Set(subject.chapters.flatMap((c) => c.concepts.map((x) => x.id)))
        const dangling = subject.chapters
          .flatMap((c) => c.concepts)
          .flatMap((c) => c.deps.filter((d) => !ids.has(d)))
        expect(dangling, subject.name).toEqual([])
      }
    }
  })

  it('gives every concept in a subject a unique id', () => {
    for (const subjects of Object.values(classes)) {
      for (const subject of subjects) {
        const ids = subject.chapters.flatMap((c) => c.concepts.map((x) => x.id))
        expect(new Set(ids).size, subject.name).toBe(ids.length)
      }
    }
  })

  it('contains no dependency cycle anywhere', () => {
    for (const subjects of Object.values(classes)) {
      for (const subject of subjects) {
        const deps = new Map()
        for (const ch of subject.chapters) for (const c of ch.concepts) deps.set(c.id, c.deps)
        const state = new Map()
        const cyclic = (id) => {
          if (state.get(id) === 'done') return false
          if (state.get(id) === 'open') return true
          state.set(id, 'open')
          for (const d of deps.get(id) ?? []) if (cyclic(d)) return true
          state.set(id, 'done')
          return false
        }
        for (const id of deps.keys()) expect(cyclic(id), `${subject.name}/${id}`).toBe(false)
      }
    }
  })

  it('gives every class subjects with distinct ids', () => {
    /* Two subjects sharing an id means the planner sees one of them and the
     * other's chapters are simply invisible to the student. */
    for (const [cls, subjects] of Object.entries(classes)) {
      const ids = subjects.map((s) => s.id)
      expect(ids.filter((v, i) => ids.indexOf(v) !== i), `class ${cls}`).toEqual([])
    }
  })

  it('does not ship Class 11 and Class 12 the same curriculum', () => {
    expect(JSON.stringify(classes['11'])).not.toBe(JSON.stringify(classes['12']))
  })

  it('gives no concept an empty name', () => {
    expect(everyConcept.filter((c) => !c.name || c.name.trim() === '').length).toBe(0)
  })
})
