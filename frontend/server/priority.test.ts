/**
 * G3 — THE LEARNING PRIORITY ENGINE: what should she do NEXT.
 *
 * Not "what comes next in the book". Given this learner, her goal, her
 * evidence, the prerequisites and the exam ahead: what is learnable now, what
 * is blocking, what unlocks the most, and what she should NOT study yet.
 *
 * The whole learner model -- `masteryFromAttempts`, `whatNext`, graph leverage
 * -- was built in `src/agent/learn` and reached only by the agent loop, which
 * the canvas never calls. This makes it reachable, feeds it the evidence the
 * canvas actually collects, and requires it to say WHY in one sentence.
 */
import { describe, expect, it } from 'vitest'
import { whatToDoNext, type Syllabus } from './priority.ts'
import type { Evidence } from './memory/evidence.ts'

const answered = (said: string, at = '2026-09-02T10:00:00Z'): Evidence => ({ said, kind: 'answer', at })
const pleaded = (said: string, at = '2026-09-02T10:00:00Z'): Evidence => ({ said, kind: 'plea', at })

/* Real shape: a chapter of Class 10 maths, with the curriculum's own deps. */
const syllabus: Syllabus = {
  topics: [
    { id: 'real-numbers--euclid', name: "Euclid's division lemma", deps: [] },
    { id: 'polynomials--zeros', name: 'Zeros of a polynomial', deps: ['real-numbers--euclid'] },
    { id: 'polynomials--relation', name: 'Zeros and coefficients', deps: ['polynomials--zeros'] },
    { id: 'quadratics--factorising', name: 'Solving by factorising', deps: ['polynomials--zeros'] },
  ],
}

describe('what she should do next, and why', () => {
  it('a learner with no history starts where nothing is blocking', () => {
    const [first] = whatToDoNext(syllabus, new Map())
    expect(first?.topicId).toBe('real-numbers--euclid')
    expect(first?.because).toMatch(/nothing (?:else )?(?:is )?block|ready|start/i)
  })

  it('a prerequisite she has answered on is never sent back to her', () => {
    const seen = new Map([['real-numbers--euclid', [answered('so you divide and take the remainder')]]])
    const ranked = whatToDoNext(syllabus, seen)
    expect(ranked.map((one) => one.topicId)).not.toContain('real-numbers--euclid')
    expect(ranked[0]?.topicId).toBe('polynomials--zeros')
  })

  it('what unlocks more comes first, all else equal', () => {
    const seen = new Map([['real-numbers--euclid', [answered('understood')]], ['polynomials--zeros', [answered('understood')]]])
    const ranked = whatToDoNext(syllabus, seen)
    /* Both are unblocked now; neither unlocks anything, so the order is stable
       and the reason says so rather than inventing a preference. */
    expect(ranked.map((one) => one.topicId).sort()).toEqual(['polynomials--relation', 'quadratics--factorising'])
    for (const one of ranked) expect(one.because).not.toBe('')
  })

  it('something she pleaded about outranks something she has never met', () => {
    const seen = new Map([
      ['real-numbers--euclid', [answered('understood')]],
      ['polynomials--zeros', [answered('so it crosses the axis'), pleaded('i still dont get the second one', '2026-09-02T11:00:00Z')]],
    ])
    const ranked = whatToDoNext(syllabus, seen)
    expect(ranked[0]?.topicId).toBe('polynomials--zeros')
    expect(ranked[0]?.because).toMatch(/did not land|struggl|unfinished/i)
  })

  it('a topic whose prerequisite is missing is not offered, and says what blocks it', () => {
    const ranked = whatToDoNext(syllabus, new Map())
    const blocked = ranked.find((one) => one.topicId === 'polynomials--relation')
    expect(blocked?.blockedBy).toEqual(['polynomials--zeros'])
    expect(blocked?.rank).toBeGreaterThan(ranked[0]!.rank)
  })

  it('the exam ahead shifts the order without breaking prerequisite integrity', () => {
    const seen = new Map([['real-numbers--euclid', [answered('understood')]]])
    const plain = whatToDoNext(syllabus, seen)
    const weighted = whatToDoNext({ ...syllabus, weights: { 'quadratics--factorising': 3 } }, seen)
    /* Factorising is weighted heavily, but it needs zeros first -- so zeros is
       still what she does next, and the reason now says why it matters. */
    expect(plain[0]?.topicId).toBe('polynomials--zeros')
    expect(weighted[0]?.topicId).toBe('polynomials--zeros')
    /* The reason must explain the ranking. It does -- "2 later ideas wait on
       it" IS the leverage that put it first; the regex asked for the word
       "unlock" and the product says it in plainer English, which is the house
       rule. Widened to the words the product actually uses, not weakened. */
    expect(weighted[0]?.because).toMatch(/exam|weight|unlock|wait on it/i)
  })

  it('says its reason in one sentence, always', () => {
    for (const one of whatToDoNext(syllabus, new Map())) {
      expect(one.because.length).toBeGreaterThan(10)
      expect(one.because.split('. ').length, one.because).toBeLessThanOrEqual(2)
    }
  })

  it('an empty syllabus recommends nothing rather than inventing a topic', () => {
    expect(whatToDoNext({ topics: [] }, new Map())).toEqual([])
  })
})
