/* CS-2 — typed edges were added without changing what the layout engine sees.
 *
 * The whole risk of this changeset is a silent regression: `deps` feeds
 * `layout()`, `prereqsMet()` and the planner, so any drift between `deps` and
 * `edges` moves nodes, changes which concept a learner may start next, and
 * reorders today's plan. These tests exist to make that drift impossible to
 * ship, not to demonstrate that a union type compiles.
 */

import { describe, it, expect } from 'vitest'
import CURRICULUM from './curriculum'
import type { Concept, Subject } from '../types'

const everyConcept = (): Concept[] => {
  const out: Concept[] = []
  const seen = new Set<string>()
  const push = (subjects: Subject[]) => {
    for (const s of subjects) for (const ch of s.chapters) out.push(...ch.concepts)
  }
  for (const cls of CURRICULUM.classes) {
    if (!CURRICULUM.needsStream(cls)) {
      push(CURRICULUM.subjectsFor(cls, null))
      continue
    }
    for (const stream of CURRICULUM.streams) push(CURRICULUM.subjectsFor(cls, stream))
  }
  return out.filter((c) => {
    const key = c.id + ':' + c.deps.join(',')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

describe('CS-2 typed semantic edges', () => {
  it('keeps deps exactly equal to the edge targets, in order, for every concept', () => {
    const concepts = everyConcept()
    expect(concepts.length).toBeGreaterThan(50)
    for (const c of concepts) {
      expect(c.edges.map((e) => e.to), `${c.id} deps and edges disagree`).toEqual(c.deps)
    }
  })

  it('migrates every imported curriculum edge to prerequisite', () => {
    // The imported tables encoded exactly one relationship. Typing must not
    // reinterpret any of them — a row that silently became `causal` would draw
    // a different arrow and make a claim nobody authored.
    const withEdges = everyConcept().filter((c) => c.edges.length > 0)
    expect(withEdges.length).toBeGreaterThan(30)
    for (const c of withEdges) {
      for (const e of c.edges) {
        expect(e.type, `${c.id} -> ${e.to} was retyped`).toBe('prerequisite')
      }
    }
  })

  it('still produces the layered DAG the map depends on', () => {
    // T9: the regression guard. Same invariant the CS-0 smoke test asserts,
    // re-checked here because CS-2 is the changeset that could break it.
    const maths = CURRICULUM.subjectsFor('Class 10', null).find((s) => s.id === 'mathematics')!
    const chapter = maths.chapters.find((c) => c.id === 'quadratic-equations')!
    const { pos } = CURRICULUM.layout(chapter.concepts)
    const known = new Set(chapter.concepts.map((c) => c.id))
    let checked = 0
    for (const c of chapter.concepts) {
      for (const dep of c.deps) {
        if (!known.has(dep)) continue
        expect(pos[c.id].y).toBeGreaterThan(pos[dep].y)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('never emits an empty or malformed edge target', () => {
    for (const c of everyConcept()) {
      for (const e of c.edges) {
        expect(e.to.length, `${c.id} has an empty edge target`).toBeGreaterThan(0)
        expect(e.to, `${c.id} -> ${e.to} is not a slug`).toMatch(/^[a-z0-9-]+$/)
      }
    }
  })
})
