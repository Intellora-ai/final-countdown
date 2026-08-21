/* CS-1 / DOD-1 — the board always knows which concept it is about.
 *
 * The case worth guarding is the third one: a URL that names a concept the
 * learner does not have. Falling back to `lastTouched` there would open a
 * DIFFERENT concept than the address bar says, and nothing on screen would
 * reveal the substitution. It is reported instead.
 */

import { describe, it, expect } from 'vitest'
import CURRICULUM from '../data/curriculum'
import { resolveCanvasIdentity, canvasPath } from './canvas-identity'

/* The reference concept lives in Class 9 chemistry — curriculum.ts:98 puts
 * "Matter in Our Surroundings" in C9, not C10. */
const subjects = CURRICULUM.subjectsFor('Class 9', null)
const chemistry = subjects.find((s) => s.id === 'chemistry')!
const chapter = chemistry.chapters.find((c) => c.id === 'matter-in-our-surroundings')!
const concept = chapter.concepts.find((c) => c.id === 'change-of-state')!

describe('CS-1 canvas identity', () => {
  it('resolves an explicit chapter and concept from the route', () => {
    const r = resolveCanvasIdentity({
      chapterId: chapter.id,
      conceptId: concept.id,
      subjects,
      lastTouched: null,
    })
    expect(r.kind).toBe('resolved')
    if (r.kind === 'resolved') {
      expect(r.identity.concept.id).toBe('change-of-state')
      expect(r.identity.chapter.id).toBe('matter-in-our-surroundings')
      expect(r.identity.subject.id).toBe('chemistry')
      expect(r.canonicalPath).toBe('/canvas/matter-in-our-surroundings/change-of-state')
    }
  })

  it('resolves a bare /canvas through what the learner last touched', () => {
    const r = resolveCanvasIdentity({
      subjects,
      lastTouched: { chapterId: chapter.id, conceptId: concept.id },
    })
    expect(r.kind).toBe('resolved')
    if (r.kind === 'resolved') expect(r.canonicalPath).toBe(canvasPath(chapter.id, concept.id))
  })

  it('reports an unresolvable explicit id instead of quietly opening something else', () => {
    const r = resolveCanvasIdentity({
      chapterId: chapter.id,
      conceptId: 'not-a-real-concept',
      subjects,
      // A fallback IS available. It must not be used: the URL named something
      // specific, and substituting silently would mislead.
      lastTouched: { chapterId: chapter.id, conceptId: concept.id },
    })
    expect(r.kind).toBe('needs-selection')
    if (r.kind === 'needs-selection') expect(r.reason).toContain('not-a-real-concept')
  })

  it('reports a stale lastTouched pointing outside the learner subjects', () => {
    const r = resolveCanvasIdentity({
      subjects: subjects.filter((s) => s.id !== 'chemistry'),
      lastTouched: { chapterId: chapter.id, conceptId: concept.id },
    })
    expect(r.kind).toBe('needs-selection')
    if (r.kind === 'needs-selection') expect(r.reason).toMatch(/no longer in your subjects/)
  })

  it('asks for a selection when nothing has ever been started', () => {
    const r = resolveCanvasIdentity({ subjects, lastTouched: null })
    expect(r.kind).toBe('needs-selection')
    if (r.kind === 'needs-selection') expect(r.reason).toMatch(/nothing has been started/i)
  })

  it('builds the same path the router matches', () => {
    expect(canvasPath('a-chapter', 'a-concept')).toBe('/canvas/a-chapter/a-concept')
  })
})
