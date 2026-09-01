import { describe, expect, it } from 'vitest'

import { checkTeaching } from '../teach/teaching'
import { validateLesson } from '../spec/validate'
import learnerA from './generated/learner-a-first-attempt.json'
import learnerB from './generated/learner-b-preferred-mechanism-failed.json'
import byHand from './handwritten/contract-honoured-by-hand.json'
import { deriveBeats } from '../teach/beats'
import { checkBeats } from '../teach/contract'

/*
 * BATCH 4: THE ENGINE'S OUTPUT CONTRACT.
 *
 * `CanvasRoute` holds these three at `'answer'` level, not `'lesson'`, and
 * `lessons.test.ts` excludes them for the same stated reason: the engine's
 * `emit` builds only `prose` and `callout`, so it cannot open with a
 * definition, cannot close with a progression, and cannot show anything.
 *
 * That is a real limit of `learning-os/src/learning_os/api/emit.py`, not of
 * the canvas. `TEXT_BLOCK_KINDS` is `{prose, callout}` because
 * `GeneratedContent.blocks` is a `(kind, text)` pair -- a sentence is not
 * enough to build a `summary`'s ordered progression or a `table`'s rows, and
 * emitting one anyway would fabricate structure the model never supplied.
 *
 * So the engine is honest and the lessons are thin. This file is the red that
 * says so in the canvas's own words rather than in a comment, and it stays
 * afterwards as the guard: if the emitter ever regresses to prose-only, these
 * three go red instead of being quietly re-labelled `'answer'` again.
 */
/*
 * THE ENGINE'S OWN OUTPUT, AND ONLY THAT, IN THE LIST BELOW.
 *
 * `contract-honoured-by-hand.json` is not in `ENGINE_LESSONS`, and it never
 * will be: it is a HUMAN meeting the same contract -- the comparison is the
 * point of the pair -- so it is not evidence about what `emit` can build, which
 * is what this file measures. It has its own describe block at the bottom
 * instead, because the claim its filename makes needs a gate of its own.
 */
const ENGINE_LESSONS = [
  { name: 'engine: first attempt', spec: learnerA },
  { name: 'engine: preferred mechanism failed', spec: learnerB },
] as const

describe('the engine emits lessons, not just answers', () => {
  for (const { name, spec } of ENGINE_LESSONS) {
    it(`${name} teaches at lesson level`, () => {
      const parsed = validateLesson(spec)
      expect(parsed.ok, parsed.ok ? '' : JSON.stringify(parsed.issues, null, 1)).toBe(true)
      if (!parsed.ok) return

      /* arc:true is the strictest setting -- the whole teaching arc, not just
         the chunk rules a doubt answer owes. That is exactly the level the
         five authored lessons are held to, and holding the engine to a lower
         one is what let this gap sit unmeasured. */
      const issues = checkTeaching(parsed.lesson, { arc: true })
      expect(
        issues.map((i) => i.rule),
        `engine lesson does not teach: ${JSON.stringify(issues, null, 1)}`,
      ).toEqual([])
    })
  }
})

/*
 * THE HAND-WRITTEN COMPANION, AND WHY IT NEEDED A TEST RATHER THAN A NOTE.
 *
 * The file is called `contract-honoured-by-hand.json` and `CanvasRoute` labels
 * its button "Same contract, written by hand". For as long as this repository
 * has had it, that claim was FALSE: its definition ran to 54 words against a
 * 30-word cap and across two sentences, it marked no term, it showed nothing
 * and it had no summary. Seven issues at `'lesson'` level.
 *
 * WHAT THAT COST A LEARNER, MEASURED IN FOUR BROWSERS. `TeachView` refuses a
 * lesson that fails the gate and paints the reasons instead, which is the right
 * behaviour. So pressing that button -- one of eight this app offers -- landed
 * her on `blocks[0] — this block marks no important word` four times over, with
 * no lesson, no checkpoint and no box to ask a question in. Law A and Law B
 * both timed out there waiting for a Send button that a refused lesson never
 * draws (`getByRole('button', { name: /^send$/i })`, 15s, on
 * a-person-on-a-laptop and a-person-on-a-phone alike).
 *
 * The prose was rewritten to honour the contract -- the human's own sentences,
 * re-ordered so the definition comes first, with the two branches drawn as a
 * flow and the closing progression written down. This test is what stops it
 * drifting back: the claim in the filename is now checked on every run rather
 * than believed.
 */
describe('the hand-written companion honours the same contract', () => {
  it('validates and teaches at lesson level, exactly like the engine\'s two', () => {
    const parsed = validateLesson(byHand)
    expect(parsed.ok, parsed.ok ? '' : JSON.stringify(parsed.issues, null, 1)).toBe(true)
    if (!parsed.ok) return

    const issues = checkTeaching(parsed.lesson, { arc: true })
    expect(
      issues.map((i) => i.rule),
      `the hand-written lesson does not teach: ${JSON.stringify(issues, null, 1)}`,
    ).toEqual([])
  })

  it('can be cut into beats that each show her something', () => {
    /* THE SECOND GATE, AND IT IS NOT THE SAME AS THE FIRST. `validateLesson`
       can pass while `checkBeats` refuses: the earlier version of this lesson
       cleared `'answer'` level and was still refused with "beat "prose-0" shows
       the learner nothing — it is all words". A lesson that validates and
       cannot be cut is still a dead end. */
    const parsed = validateLesson(byHand)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const beats = deriveBeats(parsed.lesson)
    expect(beats.length, 'the lesson was cut into no beats at all').toBeGreaterThan(0)
    expect(
      checkBeats(beats, parsed.lesson).map((i) => i.message),
      'the lesson validates but cannot be taught, which is a refusal a learner still meets',
    ).toEqual([])
  })
})
