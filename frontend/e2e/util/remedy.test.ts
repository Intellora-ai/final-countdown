import { describe, expect, test } from 'vitest'
import { classify, remedy, type FailureShape } from './remedy'

/* WHAT THESE TESTS ARE FOR.
 *
 * A remedy line is advice printed next to somebody's broken build. Advice that
 * is wrong is worse than no advice: it sends the reader to the wrong file with
 * confidence. So the hardest test here is not that a known failure produces a
 * line -- it is that an UNKNOWN one produces the empty string, and keeps
 * producing it as rules are added.
 */

const base: FailureShape = {
  message: '', status: 'failed', attempts: 1, causes: [], where: 'frontend/src/a.tsx',
}
const shape = (over: Partial<FailureShape>): FailureShape => ({ ...base, ...over })

const COUNT_ZERO =
  'Error: expect(locator).toHaveCount(expected) | Expected: 1 | Received: 0'

describe('classify', () => {
  test('a page error outranks everything: the DOM died before the assertion', () => {
    expect(classify(shape({
      message: COUNT_ZERO,
      causes: ["TypeError: Cannot read properties of undefined (reading 'columns')"],
    }))).toBe('crashed')
  })

  test('toHaveCount receiving 0 is a thing that never rendered', () => {
    expect(classify(shape({ message: COUNT_ZERO }))).toBe('never-rendered')
  })

  test('never-rendered outranks timed-out: expect.poll reports both', () => {
    expect(classify(shape({
      status: 'timedOut',
      message: `Timed out 10000ms waiting for expect(locator) | ${COUNT_ZERO}`,
    }))).toBe('never-rendered')
  })

  test('a timeout carrying no expected value is a timeout', () => {
    expect(classify(shape({
      status: 'timedOut',
      message: 'Test timeout of 90000ms exceeded.',
    }))).toBe('timed-out')
  })

  test('a value mismatch that is not a count is a wrong value', () => {
    expect(classify(shape({
      message: 'Error: expect(received).toBe(expected) | Expected: "a" | Received: "b"',
    }))).toBe('wrong-value')
  })

  test('flaky is reported as timing, never as a defect', () => {
    expect(classify(shape({ status: 'flaky', attempts: 2, message: COUNT_ZERO })))
      .toBe('flaky-on-retry')
  })

  test('a failure matching no rule is unknown, not guessed into a bucket', () => {
    expect(classify(shape({ message: 'browserType.launch: Executable does not exist' })))
      .toBe('unknown')
  })
})

describe('remedy', () => {
  test('a crash points at the error, explicitly not at the assertion', () => {
    const f = shape({ message: COUNT_ZERO, causes: ['TypeError: boom'] })
    expect(remedy(f, classify(f)))
      .toBe('the page threw before the assertion ran — fix the error under WHY, not the assertion')
  })

  test('a thing that never rendered names the attributed file', () => {
    const f = shape({ message: COUNT_ZERO, where: 'frontend/src/canvas/teach/TeachView.tsx' })
    expect(remedy(f, classify(f)))
      .toBe('element never rendered — check the conditional that gates it in frontend/src/canvas/teach/TeachView.tsx')
  })

  test('a timeout points at the pending state', () => {
    const f = shape({ status: 'timedOut', message: 'Test timeout of 90000ms exceeded.' })
    expect(remedy(f, classify(f)))
      .toBe('nothing settled in time — check the pending state and the promise it waits on')
  })

  test('a wrong value points at the producer, not the test', () => {
    const f = shape({ message: 'Expected: "a" | Received: "b"', where: 'frontend/src/b.ts' })
    expect(remedy(f, classify(f)))
      .toBe('value differs — check the producer in frontend/src/b.ts, not the assertion')
  })

  test('flaky says so in those words', () => {
    const f = shape({ status: 'flaky', attempts: 2, message: COUNT_ZERO })
    expect(remedy(f, classify(f))).toBe('passed on retry — treat as timing, not a defect')
  })

  /* THE LOAD-BEARING ONE. Every rule added must leave this true. A reporter
     that always has something to say is a reporter that invents. */
  test('an unrecognised failure produces NO advice at all', () => {
    const f = shape({ message: 'browserType.launch: Executable does not exist' })
    expect(remedy(f, classify(f))).toBe('')
  })
})
