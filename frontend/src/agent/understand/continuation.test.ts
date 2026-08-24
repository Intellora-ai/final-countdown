/*
 * "CONTINUE" MUST NOT MEAN "NEW TOPIC".
 *
 * MEASURED, on the shipping loop, with a conversation already about quadratics:
 *
 *     "continue"     intent=continuation  shift=Y  entities=[quadratics,continue]
 *     "carry on"     intent=continuation  shift=Y  entities=[quadratics,carry]
 *     "keep going"   intent=conversation  shift=Y  entities=[quadratics,keep,going]
 *     "next"         intent=conversation  shift=Y  entities=[quadratics,next]
 *     "go on"        intent=conversation  shift=n  entities=[quadratics]
 *
 * The single word whose entire meaning is "do not change the subject" was read
 * as changing the subject, and `go on` escaped only by accident --- both its
 * words are too short for the term pattern.
 *
 * ROOT CAUSE, and it is not the shift rule. `extractEntities` admitted
 * `continue`, `carry`, `keep`, `going` and `next` as ENTITIES. `topicShift`
 * then fired correctly on its own terms: a fresh entity, no overlap with the
 * carried topic, no pronoun. Feeding a navigation verb into the subject
 * extractor is the defect; the shift rule was reading what it was given.
 *
 * WHY NOT "A CONTINUATION INTENT IS NEVER A SHIFT". It was the first fix
 * considered and it is wrong: "continue with fractions" IS a continuation
 * intent AND a genuine change of subject, and an override would force it to
 * false and silently teach the wrong concept. The word-list fix gets that case
 * right for the same reason it gets `continue` right --- it asks whether a
 * SUBJECT was named, which is the actual question. It also errs in the
 * recoverable direction: a navigation word nobody listed reads as a shift, the
 * bug we already had, rather than a real shift reading as a continuation, which
 * would drift the lesson with nothing to notice it.
 */
import { describe, expect, it } from 'vitest'
import { extractEntities, understand } from './understand'
import type { Entity, Turn } from '../kernel/contracts'

const ask = (content: string): Turn => ({ parts: [{ modality: 'text', content }], at: '2026-01-01T00:00:00.000Z' })

/* A conversation already under way. `turnIndex > 0` is required for the shift
   rule to be live at all, so a fresh conversation proves nothing here. */
const convo = {
  entities: [{ id: 'quadratics', label: 'quadratics', kind: 'term', mentions: [1, 2] }],
  topic: 'quadratics',
  turnIndex: 5,
}

const CONTINUATIONS = [
  'continue', 'Continue', 'ok continue', 'carry on', 'keep going', 'go on',
  'next', 'proceed', 'go ahead', 'carry on then', 'keep going please',
  'continue.', 'yes continue', 'go further', 'onwards',
]

describe('a continuation is not a topic shift', () => {
  for (const text of CONTINUATIONS) {
    it(`"${text}" does not shift the topic`, () => {
      expect(understand(ask(text), convo).topicShift).toBe(false)
    })
  }

  it('none of them are extracted as entities', () => {
    for (const text of CONTINUATIONS) {
      expect(extractEntities(text, 1)).toEqual([])
    }
  })

  it('a hundred continuations do not accumulate junk entities', () => {
    /* The second cost of admitting navigation verbs: they enter
       `conversation.entities`, where they are carried forward for the rest of
       the session and offered to memory retrieval as things the lesson is
       about. Measured before the fix: 22 entities after 14 turns. */
    let carried: readonly Entity[] = convo.entities
    for (let i = 0; i < 100; i++) {
      const u = understand(ask(CONTINUATIONS[i % CONTINUATIONS.length] ?? 'continue'), {
        entities: carried,
        topic: 'quadratics',
        turnIndex: 5 + i,
      })
      carried = u.entities
    }
    expect(carried.map((e) => e.id)).toEqual(['quadratics'])
  })
})

describe('a real change of subject still shifts', () => {
  /* The regression that matters. A fix that suppresses every shift is not a
     fix, it is the same bug pointing the other way --- and the other way is
     worse, because a lesson that drifts has nothing to notice it. */
  it('an unrelated question shifts', () => {
    expect(understand(ask('Who won the 1998 World Cup?'), convo).topicShift).toBe(true)
  })

  it('a continuation that NAMES a new subject shifts', () => {
    expect(understand(ask('continue with fractions'), convo).topicShift).toBe(true)
    expect(understand(ask('next, teach me fractions'), convo).topicShift).toBe(true)
  })

  it('the new subject is still extracted when a navigation word sits beside it', () => {
    expect(extractEntities('continue with fractions', 1).map((e) => e.id)).toEqual(['fractions'])
  })

  it('staying on the subject does not shift', () => {
    expect(understand(ask('and how do quadratics factor?'), convo).topicShift).toBe(false)
  })
})
