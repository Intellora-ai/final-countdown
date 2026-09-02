import { describe, expect, it } from 'vitest'

import { validateLesson } from '../../src/canvas/spec/validate.ts'
import { toArtifact } from './canvasAdapter.ts'
import { learningAction, type LearningAction } from './ir.ts'
import liveRun2 from './__fixtures__/live-run-2.json'

/**
 * THE CANVAS ADAPTER turns a learning action into the one thing the canvas
 * stores: an artifact. It is pure. It never writes. And it never smooths a
 * proposal over: what the canvas's own gate refuses, the adapter refuses, in
 * the gate's words.
 */

const request = { question: 'what is a zero of a polynomial' }

function explain(answer: string): LearningAction {
  return { kind: 'explain', because: 'the loop answered', risk: 0, evidence: [], payload: { answer, representations: ['prose'] } }
}

describe('the canvas adapter', () => {
  it('turns an explanation into a lesson artifact that passes the canvas s own gate', () => {
    const adapted = toArtifact(explain('A zero of a polynomial is a number that makes the polynomial equal zero when it is put in place of x.'), request)
    expect(adapted.ok, JSON.stringify(adapted)).toBe(true)
    if (!adapted.ok) return
    expect(adapted.artifact.kind).toBe('lesson')
    expect(adapted.artifact.question).toBe(request.question)
    /* The same gate the live path uses, run again here, so the adapter cannot
       hand the canvas something the canvas would refuse to draw. */
    expect(validateLesson(adapted.artifact.payload, { teaching: 'answer' }).ok).toBe(true)
  })

  it('gives a real reasoner s answer room to breathe, so the canvas s own readability rule passes without a word changed', () => {
    /* `__fixtures__/live-run-2.json` is the second live shadow run, verbatim:
       the 7b's correct 150-word answer about the discriminant, which the
       gate refused for "150 words with no break, and the limit is 30". A
       break at a sentence end changes no word. A single sentence longer than
       the limit is still refused, in the gate's words. */
    const answer = (liveRun2 as { candidate: { proposal: { actions: { payload: { answer: string } }[] } } }).candidate.proposal.actions[0]?.payload.answer ?? ''
    expect(answer.split(/\s+/).length).toBeGreaterThan(100)
    const adapted = toArtifact(explain(answer), { question: 'why does a quadratic have at most two zeros' })
    expect(adapted.ok, JSON.stringify(adapted)).toBe(true)
    if (!adapted.ok) return
    const body = (adapted.artifact.payload as { blocks: { body: string }[] }).blocks[0]?.body ?? ''
    expect(body.replace(/\s+/g, ' ')).toBe(answer.replace(/\s+/g, ' '))
    const tooLong = 'a '.repeat(31).trim() + ' is one sentence with no end in sight and no place to breathe.'
    const refused = toArtifact(explain(tooLong), request)
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.issues.join(' ')).toMatch(/no break/)
  })

  it('refuses what the gate refuses, in the gate s own words, rather than smoothing it over', () => {
    const adapted = toArtifact(explain(''), request)
    expect(adapted.ok).toBe(false)
    if (adapted.ok) return
    expect(adapted.issues.length).toBeGreaterThan(0)
    for (const issue of adapted.issues) expect(issue.length).toBeGreaterThan(0)
  })

  it('turns a question for the student into a note carrying that question', () => {
    const adapted = toArtifact({ kind: 'ask', because: 'one thing first', risk: 0, evidence: [], payload: { question: 'Which power of two is eight?' } }, request)
    expect(adapted.ok).toBe(true)
    if (!adapted.ok) return
    expect(adapted.artifact.kind).toBe('note')
    expect(JSON.stringify(adapted.artifact.payload)).toContain('Which power of two is eight?')
  })

  it('names every kind it has no canvas form for yet, as a loud gap and never a stand-in', () => {
    for (const kind of learningAction.shape.kind.options) {
      if (kind === 'explain' || kind === 'ask') continue
      const adapted = toArtifact({ kind, because: 'r', risk: 0, evidence: [], payload: {} }, request)
      expect(adapted.ok, kind).toBe(false)
      if (adapted.ok) continue
      expect(adapted.issues.join(' '), kind).toContain(kind)
    }
  })
})
