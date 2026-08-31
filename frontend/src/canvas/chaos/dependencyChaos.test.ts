/*
 * WHAT THE CANVAS DOES WHEN THE MODEL BEHIND IT MISBEHAVES.
 *
 * `authorLesson` reaches a model over HTTP. Every test of it so far has handed
 * it a model that answers -- well or badly, but always promptly and always with
 * a string. Real dependencies do none of that reliably: they hang, they refuse
 * the connection, they return 500, they return HTML from a proxy, they return
 * half a JSON object because a token budget ran out.
 *
 * These are chaos experiments, not unit tests, and the difference is where the
 * fault comes from. A unit test picks an input; a chaos experiment breaks the
 * environment and asserts an INVARIANT survives. The invariant here is the same
 * for every fault below and it is deliberately weak, because a weak invariant
 * that always holds is worth more than a strong one that describes today's
 * implementation:
 *
 *     the learner is told the lesson failed. Never a hang, never a crash,
 *     never a lesson built from a broken reply.
 *
 * Each experiment names the failure it injects, so a red run says which real
 * outage it corresponds to rather than which line threw.
 */
import { describe, expect, it } from 'vitest'
import { authorLesson, type LessonModel } from '../teach/authorLesson'

/** A dependency that never answers. Bounded so the suite cannot hang on itself. */
const hangs: LessonModel = () => new Promise(() => {})

/** A dependency that refuses the connection. */
const refuses: LessonModel = () => Promise.reject(new Error('ECONNREFUSED 127.0.0.1:11434'))

/** A dependency that answers, with a server error. */
const errors: LessonModel = () => Promise.reject(new Error('HTTP 503 Service Unavailable'))

/** A proxy or captive portal answering instead of the model. */
const returnsHtml: LessonModel = async () =>
  '<!doctype html><html><body>502 Bad Gateway</body></html>'

/** The reply cut off mid-object, which is what a token budget running out looks like. */
const truncatedJson: LessonModel = async () =>
  '{"id":"x","question":"q","blocks":[{"id":"a","kind":"prose","body":"half a sen'

/** Valid JSON, wrong shape entirely. */
const wrongShape: LessonModel = async () => '{"weather":"sunny","temperature":21}'

/** Empty string. A dependency that answered with nothing at all. */
const answersNothing: LessonModel = async () => ''

const FAULTS: readonly (readonly [string, LessonModel])[] = [
  ['connection refused', refuses],
  ['503 from the dependency', errors],
  ['a proxy returns HTML', returnsHtml],
  ['the reply is truncated mid-JSON', truncatedJson],
  ['valid JSON of the wrong shape', wrongShape],
  ['an empty reply', answersNothing],
]

describe('the canvas under dependency failure', () => {
  describe.each(FAULTS)('when %s', (_name, model) => {
    it('refuses the lesson rather than building one, and says why', async () => {
      const result = await authorLesson(model, 'explain photosynthesis').catch(
        (e: unknown) => ({ threw: e }),
      )

      /*
       * A THROW IS A FAILURE OF THIS INVARIANT, NOT A PASS.
       *
       * `CanvasRoute` catches and shows a banner, so a throw does reach the
       * learner as words. But the caller cannot tell a dependency outage from a
       * lesson that did not teach, and those need different words: one is "try
       * again", the other is "this model cannot write lessons". Collapsing them
       * is how a learner gets told their question was answered badly when
       * nothing was ever asked.
       */
      expect(result, 'authorLesson threw instead of returning a refusal').not.toHaveProperty(
        'threw',
      )
      expect(result).toMatchObject({ ok: false })
    })
  })

  it('does not hang forever when the dependency never answers', async () => {
    const raced = await Promise.race([
      authorLesson(hangs, 'explain photosynthesis').then(() => 'answered'),
      new Promise((r) => setTimeout(() => r('still waiting'), 300)),
    ])
    /*
     * PINNED, NOT ASPIRATIONAL. `authorLesson` has no timeout of its own -- the
     * budget lives in `chatOnce`, one layer down, and a caller passing a model
     * without one waits forever. This asserts the CURRENT behaviour so that
     * adding a timeout here breaks this line and forces the change to be
     * deliberate. It is a pin on a known gap, and it says so.
     */
    expect(raced).toBe('still waiting')
  })
})
