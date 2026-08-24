/* CS-0 SMOKE TEST — proves the vendor-in landed a working module, not a folder of files.
 *
 * WHY THESE ASSERTIONS AND NOT `expect(true).toBe(true)`. A test that cannot fail proves the
 * runner is wired and nothing else, and the CS-0 gate explicitly rejects that. Each assertion
 * below is an invariant the imported design already relies on, so each one breaks if the
 * vendor-in dropped, truncated, or reordered a file:
 *
 *   - the module imports at all           -> the TS/ESM path through Vite resolves
 *   - Class 10 yields four subjects       -> the curriculum tables came across intact
 *   - every concept id is unique          -> no chapter was duplicated by the copy
 *   - layout() positions EVERY concept    -> the layered-DAG engine runs, not just parses
 *   - dependents sit strictly below deps  -> the depth computation is real, not a stub
 *   - layout() is referentially stable    -> the memoisation this repo measured is intact,
 *                                            which is also acceptance test T5's foundation
 *
 * No DOM is touched, so no jsdom dependency is added.
 */

import { describe, it, expect } from 'vitest'
import CURRICULUM from './curriculum'
import type { Concept } from '../types'

describe('CS-0 vendor-in smoke', () => {
  it('exposes the setup vocabulary the flow reads', () => {
    expect(CURRICULUM.classes).toContain('Class 10')
    expect(CURRICULUM.streams.length).toBeGreaterThan(0)
    expect(CURRICULUM.dayOptions.every((o) => o.minutes > 0)).toBe(true)
    expect(CURRICULUM.needsStream('Class 10')).toBe(false)
    expect(CURRICULUM.needsStream('Class 11')).toBe(true)
  })

  it('builds Class 10 with its four subjects and non-empty chapters', () => {
    const subjects = CURRICULUM.subjectsFor('Class 10', null)
    expect(subjects).toHaveLength(4)
    expect(subjects.map((s) => s.id).sort()).toEqual([
      'biology',
      'chemistry',
      'mathematics',
      'physics',
    ])
    for (const s of subjects) {
      expect(s.chapters.length).toBeGreaterThan(0)
      for (const ch of s.chapters) expect(ch.concepts.length).toBeGreaterThan(0)
    }
  })

  it('gives every concept in a chapter a unique id and a positive duration', () => {
    const subjects = CURRICULUM.subjectsFor('Class 10', null)
    for (const s of subjects) {
      for (const ch of s.chapters) {
        const ids = ch.concepts.map((c) => c.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const c of ch.concepts) expect(c.minutes).toBeGreaterThan(0)
      }
    }
  })

  it('lays out every concept, and puts each dependent strictly below its prerequisite', () => {
    const maths = CURRICULUM.subjectsFor('Class 10', null).find((s) => s.id === 'mathematics')!
    const chapter = maths.chapters.find((c) => c.id === 'quadratic-equations')!
    const concepts: Concept[] = chapter.concepts

    const { pos, width, height } = CURRICULUM.layout(concepts)

    // Every concept gets a finite position. A missing key renders an invisible node.
    for (const c of concepts) {
      expect(pos[c.id], `no position for ${c.id}`).toBeDefined()
      expect(Number.isFinite(pos[c.id].x)).toBe(true)
      expect(Number.isFinite(pos[c.id].y)).toBe(true)
    }
    expect(width).toBeGreaterThan(0)
    expect(height).toBeGreaterThan(0)

    // The graph is a layered DAG: a concept always sits below everything it depends on.
    // This is what makes the edges readable, and it fails if depth() ever returns a constant.
    const byId = new Map(concepts.map((c) => [c.id, c]))
    let checked = 0
    for (const c of concepts) {
      for (const dep of c.deps) {
        if (!byId.has(dep)) continue
        expect(pos[c.id].y, `${c.id} is not below its dependency ${dep}`).toBeGreaterThan(
          pos[dep].y,
        )
        checked++
      }
    }
    // Guard against a vacuous pass: this chapter genuinely has dependency edges.
    expect(checked).toBeGreaterThan(0)
  })

  it('memoises layout, so identical input returns the identical object', () => {
    const maths = CURRICULUM.subjectsFor('Class 10', null).find((s) => s.id === 'mathematics')!
    const concepts = maths.chapters[0].concepts
    expect(CURRICULUM.layout(concepts)).toBe(CURRICULUM.layout(concepts))
    expect(CURRICULUM.subjectsFor('Class 10', null)).toBe(CURRICULUM.subjectsFor('Class 10', null))
  })
})
