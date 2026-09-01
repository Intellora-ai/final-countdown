import { describe, expect, it } from 'vitest'

import { notGreenEvidence } from './suite-report.mjs'

/*
 * THE MESSAGE THAT NAMED NOTHING.
 *
 * `mutation-gate.mjs` runs the whole unit suite once before it mutates
 * anything, and refuses to go on if that baseline is red. The refusal was one
 * sentence -- "The suite is not green before mutating. Fix the suite first." --
 * and it carried no test name, no file, no message and no exit status, because
 * the baseline is run with `stdio: 'ignore'`.
 *
 * MEASURED, run 33470632438 on this branch: shard 1 of 4 stopped there while
 * shards 2, 3 and 4 ran the SAME baseline on the same commit and found it
 * green. So whatever went red was intermittent -- and the single shard that saw
 * it printed nothing that could be used to chase it. An intermittent failure
 * with no evidence is one that cannot be fixed at all, which is why this
 * function exists and why it is tested rather than trusted.
 *
 * It is a pure function over the two things the run leaves behind -- vitest's
 * JSON report and its console output -- so every shape below can be decided
 * here, in milliseconds, without running a suite. `mutation-gate.test.mjs`
 * cannot host these: importing or reaching the gate's baseline path starts a
 * suite that contains that file, which starts the gate again, forever. A
 * separate module is what makes the evidence testable at all.
 */

/** The shape vitest's JSON reporter writes for a file with failing tests. */
function fileWithFailures(name, failures) {
  return {
    name,
    status: 'failed',
    assertionResults: failures.map((f) => ({
      title: f.title,
      fullName: f.title,
      status: 'failed',
      failureMessages: [f.message],
    })),
  }
}

describe('the evidence a red baseline leaves behind', () => {
  it('names every failing test, with its file and the first line of its message', () => {
    const report = {
      numTotalTests: 9127,
      numFailedTests: 2,
      testResults: [
        fileWithFailures('/w/src/a.test.ts', [
          { title: 'a > holds under contention', message: 'AssertionError: expected 1 to be 2\n  at a.test.ts:9' },
        ]),
        { name: '/w/src/ok.test.ts', status: 'passed', assertionResults: [
          { title: 'a > passes', fullName: 'a > passes', status: 'passed', failureMessages: [] },
        ] },
        fileWithFailures('/w/src/b.test.ts', [
          { title: 'b > survives a restart', message: 'Error: timed out after 5000ms' },
        ]),
      ],
    }

    const said = notGreenEvidence(report, '')

    /* TWO, and counted as TESTS rather than as printed lines. A summary that
       says "4" because each failure takes a name line and a message line reads
       as twice as much breakage as there is, and the first number a person sees
       in a red run must be the true one. */
    expect(said).toContain('2 failing tests')
    expect(said).toContain('src/a.test.ts')
    expect(said).toContain('a > holds under contention')
    expect(said).toContain('AssertionError: expected 1 to be 2')
    expect(said).toContain('src/b.test.ts')
    expect(said).toContain('b > survives a restart')
    expect(said).toContain('timed out after 5000ms')
    /* The one that PASSED must not be reported as a failure. A list that names
       innocent tests sends the next reader to the wrong file. */
    expect(said).not.toContain('src/ok.test.ts')
    expect(said).not.toContain('a > passes')
  })

  it('does not repeat the suite log once it has named the failing tests', () => {
    /* MEASURED, and the reason this rule exists: the tail of a full run of this
       suite is `lesson refused by validation` forty times over, because
       `server/m8-response.test.ts` feeds the validator deliberately bad input
       thousands of times and the validator says so on stderr. Printing that
       under a named failure buries the one line a reader needs. When the report
       says WHICH test failed and WHY, that is the finding, and the log is
       noise. */
    const report = {
      numTotalTests: 3,
      numFailedTests: 1,
      testResults: [
        fileWithFailures('/w/src/a.test.ts', [
          { title: 'a > holds', message: 'AssertionError: expected 1 to be 2' },
        ]),
      ],
    }

    const said = notGreenEvidence(report, 'lesson refused by validation\n'.repeat(50))

    expect(said).toContain('1 failing test')
    expect(said).not.toContain('1 failing tests')
    expect(said).toContain('a > holds')
    expect(said).not.toContain('lesson refused by validation')
  })

  it('reports a file that never got as far as having tests, which has no assertion to name', () => {
    /* A collection error -- a bad import, a module that throws at load -- comes
       back as a failed FILE with an empty `assertionResults`. Walking only
       assertions would report "0 failing tests" for a suite that could not even
       be read. */
    const report = {
      numTotalTests: 0,
      numFailedTests: 0,
      testResults: [
        {
          name: '/w/src/broken.test.ts',
          status: 'failed',
          message: 'Error: Cannot find module ./gone',
          assertionResults: [],
        },
      ],
    }

    const said = notGreenEvidence(report, '')

    expect(said).toContain('src/broken.test.ts')
    expect(said).toContain('Cannot find module ./gone')
  })

  it('says plainly when vitest wrote no report at all, and hands over what it did print', () => {
    const said = notGreenEvidence(null, 'FATAL ERROR: Reached heap limit Allocation failed')

    expect(said).toMatch(/no .*report/i)
    expect(said).toContain('Reached heap limit')
  })

  it('still says something when there is no report AND nothing was printed', () => {
    /* The worst case, and the one that actually happened: nothing to go on. The
       function must not answer that with an empty string, because an empty
       string prints as a blank line and reads as "the gate had nothing to say"
       rather than "the run left nothing behind". */
    const said = notGreenEvidence(null, '')

    expect(said.trim()).not.toBe('')
    expect(said).toMatch(/no .*report/i)
  })

  it('does not invent a failing test when the report says none failed', () => {
    /* vitest exited non-zero with every test green: an unhandled rejection
       after the run, or a reporter that threw. Naming a test here would be a
       lie, and the honest finding is that the suite reported no failure. */
    const report = {
      numTotalTests: 12,
      numFailedTests: 0,
      testResults: [
        { name: '/w/src/a.test.ts', status: 'passed', assertionResults: [] },
      ],
    }

    const said = notGreenEvidence(report, 'Unhandled Rejection')

    expect(said).toMatch(/no failing test/i)
    expect(said).toContain('Unhandled Rejection')
    expect(said).not.toContain('src/a.test.ts')
  })

  it('caps the console output it repeats, and says it did', () => {
    /* A whole suite's stdout is tens of thousands of lines. Pasting all of it
       into a workflow annotation buries the finding it was added to surface. */
    const noise = Array.from({ length: 400 }, (_, i) => `line ${i}`).join('\n')

    const said = notGreenEvidence(null, `${noise}\nthe last line`)

    expect(said).toContain('the last line')
    expect(said).not.toContain('line 0\n')
    expect(said.split('\n').length).toBeLessThan(80)
  })
})
