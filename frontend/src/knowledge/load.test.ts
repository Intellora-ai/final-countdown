import { describe, expect, it } from 'vitest'

import { CLASS_10 } from '../data/curriculum/class10'
import { brokenKnowledgeFiles, knowledgeFor, knownTopicCount } from './load'
import { KnowledgeModel } from './schema'

/**
 * WHAT THE PRODUCT ACTUALLY KNOWS ABOUT ITS OWN TOPICS.
 *
 * Every assertion here runs against the real committed knowledge files and the
 * real generated curriculum. Nothing is stubbed: the one thing worth proving is
 * that the knowledge layer and the curriculum agree about which topics exist,
 * and a fixture cannot prove that about the shipped data.
 */

describe('the committed knowledge files', () => {
  it('all parse, and any that do not are named', () => {
    expect(brokenKnowledgeFiles(), 'a knowledge file on disk does not match the schema').toEqual([])
  })

  it('describe at least one topic, so this suite is looking at something', () => {
    expect(knownTopicCount()).toBeGreaterThan(0)
  })
})

describe('every knowledge model points at a topic that really exists', () => {
  /* THE FAILURE THIS CATCHES IS THE WORST ONE AVAILABLE HERE: a model written
     against a topic id that the curriculum does not have. It would parse, pass
     every schema check, sit in the repository looking complete, and never once
     appear on a student's screen -- because nothing would ever ask for that id.
     A silent no-op is far harder to notice than a crash. */
  const realIds = new Set(
    CLASS_10.flatMap((s) => s.chapters.flatMap((ch) => ch.concepts.map((c) => c.id))),
  )

  it('the curriculum loaded, so the check below means something', () => {
    expect(realIds.size).toBeGreaterThan(500)
  })

  it('resolves each described class 10 topic against the curriculum', () => {
    const described = [...realIds].filter((id) => knowledgeFor(id) !== null)
    expect(described.length, 'not one class 10 topic has a model, so nothing here is exercised').toBeGreaterThan(0)
    for (const id of described) {
      const model = knowledgeFor(id)!
      expect(model.topicId).toBe(id)
      expect(KnowledgeModel.safeParse(model).success).toBe(true)
    }
  })

  it('names a topic the same way the curriculum names it', () => {
    /* A model whose `topicName` has drifted from the curriculum's is a model
       describing something else, and the student would be shown a scope for a
       topic she is not on. Compared on the first sixty characters because the
       curriculum's own names carry trailing punctuation from the PDF. */
    for (const subject of CLASS_10) {
      for (const chapter of subject.chapters) {
        for (const concept of chapter.concepts) {
          const model = knowledgeFor(concept.id)
          if (model === null) continue
          expect(
            model.topicName.slice(0, 60).toLowerCase(),
            `the model for ${concept.id} calls it something else`,
          ).toBe(concept.name.slice(0, 60).toLowerCase())
        }
      }
    }
  })
})

describe('a topic nothing is known about', () => {
  it('answers null rather than inventing a scope', () => {
    expect(knowledgeFor('a-topic-with-no-model-at-all')).toBeNull()
  })

  it('answers null for the empty string, rather than matching something', () => {
    expect(knowledgeFor('')).toBeNull()
  })
})

describe('an unchecked model never reaches a student', () => {
  it('every model the loader hands out has been verified by a person', () => {
    /* `candidate` means a model produced it and nobody has read it. The whole
       reason this layer exists is that no component, a model included, is the
       sole source of truth for what a topic contains. */
    const realIds = CLASS_10.flatMap((s) => s.chapters.flatMap((ch) => ch.concepts.map((c) => c.id)))
    for (const id of realIds) {
      const model = knowledgeFor(id)
      if (model === null) continue
      expect(model.status, `${id} was handed out unchecked`).toBe('verified')
      expect(typeof model.verifiedAt).toBe('string')
    }
  })
})

describe('what the syllabus actually published', () => {
  it('keeps a topic that is one idea as one idea, with nothing invented inside it', () => {
    const atomic = knowledgeFor('introduction-to-trigonometry--relationships-between-the-ratios')
    expect(atomic, 'the atomic example is missing, so this claim is untested').not.toBeNull()
    expect(atomic!.shape).toBe('atomic')
    expect(atomic!.concepts, 'parts were invented for a topic that has none').toEqual([])
  })

  it('carries a real quotation from the real syllabus page behind every concept', () => {
    const model = knowledgeFor(
      'introduction-to-trigonometry--motivate-the-ratios-whichever-are-defined-at-0-and-90-values-of-the-trigonometri',
    )
    expect(model).not.toBeNull()
    const everyEvidence = model!.concepts.flatMap((c) => [...c.evidence, ...(c.subConcepts ?? []).flatMap((s) => s.evidence)])
    expect(everyEvidence.length).toBeGreaterThan(0)
    for (const e of everyEvidence) {
      expect(e.kind, 'this came from somewhere other than the published syllabus').toBe('syllabus')
      if (e.kind !== 'syllabus') continue
      expect(e.pdf).toBe('maths-x')
      /* Page 6, confirmed by searching the locked PDF for "UNIT V: TRIGONOMETRY"
         and by the page the curriculum itself recorded for these topics. */
      expect(e.page).toBe(6)
      expect(e.quote.length, 'the quotation is too short to check against the page').toBeGreaterThan(20)
    }
  })
})
