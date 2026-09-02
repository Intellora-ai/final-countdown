import { describe, expect, it } from 'vitest'

import { KnowledgeModel } from './schema'

/**
 * THE CONTRACT FOR WHAT IS INSIDE A TOPIC.
 *
 * Every case here is a way this layer could lie to a student, written as the
 * lie. The schema's job is to make each one impossible to store.
 */

const SYLLABUS = {
  kind: 'syllabus' as const,
  pdf: 'maths-x',
  page: 3,
  quote: 'Proofs of irrationality of √2, √3, √5',
}

function model(over: Record<string, unknown> = {}): unknown {
  return {
    topicId: 'real-numbers--proofs-of-irrationality-of',
    topicName: 'Proofs of irrationality of √2, √3, √5',
    curriculum: 'cbse-class-10',
    subjectId: 'mathematics',
    chapterId: 'real-numbers',
    version: 1,
    status: 'candidate',
    shape: 'flat',
    concepts: [
      { id: 'root-two', name: 'Irrationality of √2', evidence: [SYLLABUS] },
      { id: 'root-three', name: 'Irrationality of √3', evidence: [SYLLABUS] },
    ],
    generatedBy: 'syllabus-extraction',
    ...over,
  }
}

describe('a topic that is genuinely one idea', () => {
  it('is allowed to have nothing inside it', () => {
    const parsed = KnowledgeModel.safeParse(model({ shape: 'atomic', concepts: [] }))
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
  })

  it('cannot be given invented parts to fill the screen', () => {
    /* The exact hallucination this whole layer exists to stop: a template that
       expects three bullets, so three bullets are produced. */
    expect(KnowledgeModel.safeParse(model({ shape: 'atomic' })).success).toBe(false)
  })

  it('cannot be called flat while having nothing in it', () => {
    expect(KnowledgeModel.safeParse(model({ shape: 'flat', concepts: [] })).success).toBe(false)
  })
})

describe('nothing is stored without saying where it came from', () => {
  it('refuses a concept with no evidence at all', () => {
    expect(
      KnowledgeModel.safeParse(model({ concepts: [{ id: 'x', name: 'Something', evidence: [] }] })).success,
      'a concept nobody can trace was accepted',
    ).toBe(false)
  })

  it('refuses a concept with no evidence field', () => {
    expect(KnowledgeModel.safeParse(model({ concepts: [{ id: 'x', name: 'Something' }] })).success).toBe(false)
  })

  it('refuses web evidence with no quote to check', () => {
    const noQuote = { kind: 'web', url: 'https://en.wikipedia.org/wiki/X', title: 'X', retrievedAt: 'now' }
    expect(
      KnowledgeModel.safeParse(model({ concepts: [{ id: 'x', name: 'X', evidence: [noQuote] }] })).success,
      'a citation nobody can check was accepted as evidence',
    ).toBe(false)
  })
})

describe('a model that has not been checked cannot claim it has', () => {
  it('refuses "verified" with no record of when', () => {
    expect(KnowledgeModel.safeParse(model({ status: 'verified' })).success).toBe(false)
  })

  it('accepts verified when it says when', () => {
    const parsed = KnowledgeModel.safeParse(model({ status: 'verified', verifiedAt: '2026-09-03T00:00:00Z' }))
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
  })
})

describe('the shape has to match what is actually there', () => {
  it('refuses "flat" when a concept has sub-concepts', () => {
    expect(
      KnowledgeModel.safeParse(
        model({
          shape: 'flat',
          concepts: [{ id: 'a', name: 'A', evidence: [SYLLABUS], subConcepts: [{ id: 'a1', name: 'A one', evidence: [SYLLABUS] }] }],
        }),
      ).success,
    ).toBe(false)
  })

  it('refuses "hierarchical" when nothing actually has sub-concepts', () => {
    expect(KnowledgeModel.safeParse(model({ shape: 'hierarchical' })).success).toBe(false)
  })
})

describe('two things that are the same thing', () => {
  it('refuses two concepts sharing an id', () => {
    expect(
      KnowledgeModel.safeParse(
        model({ concepts: [{ id: 'sine', name: 'Sine', evidence: [SYLLABUS] }, { id: 'sine', name: 'sin θ', evidence: [SYLLABUS] }] }),
      ).success,
      'the same concept was stored twice under one id',
    ).toBe(false)
  })
})

describe('nothing unexpected is smuggled in', () => {
  it('refuses a field the schema never had', () => {
    /* A newer generator inventing `mastery` or `difficulty` must fail loudly
       rather than have it silently dropped and read back as absent. */
    expect(KnowledgeModel.safeParse(model({ difficulty: 'hard' })).success).toBe(false)
  })

  it('refuses an id that is not an id', () => {
    expect(
      KnowledgeModel.safeParse(model({ concepts: [{ id: 'Root Two', name: 'Irrationality of √2', evidence: [SYLLABUS] }] })).success,
    ).toBe(false)
  })
})
