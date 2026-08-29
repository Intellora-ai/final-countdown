/*
 * THE LEARNER'S WAIT IS ONE WAIT, NOT TWO.
 *
 * Measured in a real browser: "Teach me anything" sat on "Writing…" for over
 * ten minutes with no error, no progress and no way to tell it was stuck.
 *
 * The cause is not a missing timeout. `chatOnce` has one, and `CanvasRoute`
 * passes `timeoutMs: 240_000`. The cause is that the budget is PER CALL and
 * `authorLesson` makes TWO -- the first attempt and the repair -- so a value
 * chosen as "four minutes" is really eight. Nobody setting that number expects
 * that, and a person watching a blank button does not care which of the two
 * calls they are waiting on.
 *
 * What must be true:
 *
 *   1. A total budget is honoured for the WHOLE operation, not per attempt.
 *   2. A model that never answers still produces a RESULT, inside the budget.
 *   3. That result is `unreachable` -- "nothing answered" -- and never
 *      "the model answered and what it wrote does not teach". A learner told
 *      the wrong one of those debugs the wrong thing.
 *   4. The repair does not start when the budget is already gone. Two attempts
 *      inside one budget is the whole point; two budgets is the bug.
 *   5. THE PAIR: a model that answers promptly is untouched. A deadline that
 *      also breaks the working path is not a fix.
 */
import { describe, expect, it } from 'vitest'

import { authorLesson, type LessonModel } from './authorLesson'

/** Never answers. This is what a stalled local model looks like from here. */
const hangs: LessonModel = () => new Promise(() => {})

/** Answers instantly, with something the gate will refuse, forcing a repair. */
const alwaysRefused: LessonModel = async () => '{"not":"a lesson"}'

/** Counts its calls, so "did the repair run" is a fact rather than a guess. */
function counting(inner: LessonModel): LessonModel & { calls: () => number } {
  let n = 0
  const fn = ((system: string, user: string, prior?: string) => {
    n += 1
    return inner(system, user, prior)
  }) as LessonModel & { calls: () => number }
  fn.calls = () => n
  return fn
}

const BUDGET = 300

describe('the whole authoring attempt has one deadline', () => {
  it('gives up on a model that never answers, inside the budget', async () => {
    const started = Date.now()
    const result = await authorLesson(hangs, 'explain photosynthesis', [], {
      deadlineMs: BUDGET,
    })
    const took = Date.now() - started

    expect(result.ok).toBe(false)
    /* Generous upper bound: the assertion is "it returned", not a stopwatch
       reading, and a loaded machine must not make this flaky. It is still far
       below the 240s that shipped. */
    expect(took, `took ${took}ms, budget was ${BUDGET}ms`).toBeLessThan(BUDGET * 8)
  })

  it('says nothing answered, rather than blaming the lesson', async () => {
    const result = await authorLesson(hangs, 'explain photosynthesis', [], {
      deadlineMs: BUDGET,
    })
    if (result.ok) throw new Error('a model that never answers must not produce a lesson')
    expect(result.unreachable, 'a timeout must be reported as unreachable').toBeTruthy()
  })

  /* The one that makes it ONE budget instead of two. */
  it('does not start the repair once the budget is gone', async () => {
    const model = counting(hangs)
    await authorLesson(model, 'explain photosynthesis', [], { deadlineMs: BUDGET })
    expect(model.calls(), 'the repair ran after the deadline had already passed').toBe(1)
  })

  /* THE PAIR. Without it, "return a failure immediately" passes everything above. */
  it('leaves a model that answers promptly alone, and still repairs', async () => {
    const model = counting(alwaysRefused)
    const result = await authorLesson(model, 'explain photosynthesis', [], {
      deadlineMs: 10_000,
    })
    expect(result.ok).toBe(false)
    expect(model.calls(), 'a prompt model must still get its repair attempt').toBe(2)
    if (result.ok) return
    expect(result.unreachable, 'a model that answered is not unreachable').toBeFalsy()
  })

  /* No deadline given means behave exactly as before this parameter existed. */
  it('is optional, and absent means no deadline of its own', async () => {
    const model = counting(alwaysRefused)
    const result = await authorLesson(model, 'explain photosynthesis')
    expect(result.ok).toBe(false)
    expect(model.calls()).toBe(2)
  })
})
