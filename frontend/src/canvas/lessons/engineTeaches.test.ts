import { describe, expect, it } from 'vitest'

import { checkTeaching } from '../teach/teaching'
import { validateLesson } from '../spec/validate'
import learnerA from './generated/learner-a-first-attempt.json'
import learnerB from './generated/learner-b-preferred-mechanism-failed.json'

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
 * THE ENGINE'S OWN OUTPUT, AND ONLY THAT.
 *
 * `contract-honoured-by-hand.json` is deliberately absent. It is a HUMAN
 * meeting the same contract -- the comparison is the point of the pair -- so it
 * is not evidence about what `emit` can build, which is what this file
 * measures. Its prose does not meet the arc either (its definition is 54 words
 * against a 30-word cap, and it is split across two sentences), and fixing that
 * is AUTHORING rather than a change to the output contract.
 *
 * Recorded in `.agent/deferred.md` rather than fixed here, per Scope Lock: the
 * current task can be completed and verified without touching it.
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
