import { describe, expect, it } from 'vitest'

import { notGreenAnnotations, notGreenEvidence } from './suite-report.mjs'

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

describe('the same evidence as workflow-command annotations', () => {
  /* WHY THESE EXIST. Four red mutation shards showed a reader without the job
     log exactly one sentence. The annotations are the second channel for the
     names `notGreenEvidence` already had; these prove the channel carries
     them, and carries them intact past GitHub's own escaping rules. */

  /** Where GitHub's runner checks the repository out, as vitest writes it. */
  const root = '/home/runner/work/final-countdown/final-countdown/frontend'

  /** The `file=` property of one annotation, read the way GitHub reads it. */
  function fileProperty(line) {
    /* The title now carries the failure's envelope -- fingerprint and kind --
       after the fixed words; the file property is what this helper reads. */
    const found = line.match(/^::error file=([^,]*),title=baseline not green(?: \[FP-[0-9a-f]{6} [A-Z]+\])?::/)
    return found === null ? null : found[1]
  }

  /** A report with exactly one failing test, in the named file. */
  function reportFor(name) {
    return {
      numFailedTests: 1,
      testResults: [fileWithFailures(name, [{ title: 't > fails', message: 'Error: no' }])],
    }
  }

  const report = {
    numFailedTests: 2,
    testResults: [
      {
        name: `${root}/server/memory/m4-consistency.test.ts`,
        status: 'failed',
        assertionResults: [
          {
            status: 'failed',
            fullName: 'M4 · a busy database is a queue > stores the next student\'s work',
            failureMessages: ['AssertionError: expected 1 to be greater than or equal to 500\n    at x.ts:1'],
          },
          { status: 'passed', fullName: 'M4 · something fine', failureMessages: [] },
        ],
      },
      {
        name: `${root}/src/canvas/teach/anyTopic.test.ts`,
        status: 'failed',
        assertionResults: [
          {
            status: 'failed',
            fullName: 'any topic, with a comma: colon',
            failureMessages: ['Error: 100% wrong, twice\n    at Object.<anonymous> (stack.ts:4:2)'],
          },
        ],
      },
    ],
  }

  it('emits one ::error per failing test, on its repository-relative file, with the test name and the first line', () => {
    const lines = notGreenAnnotations(report, '')

    expect(lines).toHaveLength(2)
    /* `server/` is the root `shorten` does not know, so this is the path that
       came out as `frontend//home/runner/...` -- a file GitHub cannot find. */
    expect(fileProperty(lines[0])).toBe('frontend/server/memory/m4-consistency.test.ts')
    expect(lines[0]).toContain('stores the next student\'s work')
    expect(lines[0]).toContain('expected 1 to be greater than or equal to 500')
    /* First line only: the stack frame is the log's business. */
    expect(lines[0]).not.toContain('at x.ts')
    /* The test that PASSED in the same file is not an annotation. */
    expect(lines[0]).not.toContain('something fine')
  })

  it('escapes what would otherwise truncate or break the command', () => {
    const [, second] = notGreenAnnotations(report, '')

    /* One command is one line. A raw newline anywhere ends it early. */
    expect(second).not.toMatch(/[\r\n]/)
    /* `%` first, or the escapes themselves get decoded twice. */
    expect(second).toContain('Error: 100%25 wrong, twice')
    expect(second).not.toContain('100% wrong')
    /* The stack frame is not the first line, so it is not here. */
    expect(second).not.toContain('stack.ts')
    /* In the MESSAGE a comma and a colon mean nothing, and escaping them there
       would show a reader `%2C` in the name of the test. */
    expect(second).toContain('any topic, with a comma: colon')
    /* In the PROPERTY they would end it. */
    expect(fileProperty(second)).toBe('frontend/src/canvas/teach/anyTopic.test.ts')
  })

  it('escapes a comma, a colon or a percent inside the file property, and a newline in a name', () => {
    const [odd] = notGreenAnnotations(reportFor(`${root}/src/a,b:c%.test.ts`), '')
    expect(fileProperty(odd)).toBe('frontend/src/a%2Cb%3Ac%25.test.ts')

    /* A template-literal title can hold a newline; encoded, it stays on the line. */
    const tall = {
      numFailedTests: 1,
      testResults: [fileWithFailures(`${root}/src/a.test.ts`, [{ title: 'first\nsecond', message: 'Error: no' }])],
    }
    const [named] = notGreenAnnotations(tall, '')
    expect(named).not.toMatch(/\n/)
    expect(named).toContain('first%0Asecond')
  })

  it('puts the file where GitHub can find it, from wherever the runner checked out', () => {
    const at = (name) => fileProperty(notGreenAnnotations(reportFor(name), '')[0])

    /* The runner's absolute path, which is what vitest's reporter writes. */
    expect(at(`${root}/server/memory/m4-consistency.test.ts`)).toBe('frontend/server/memory/m4-consistency.test.ts')
    expect(at(`${root}/src/canvas/teach/anyTopic.test.ts`)).toBe('frontend/src/canvas/teach/anyTopic.test.ts')
    expect(at(`${root}/scripts/mutation-gate.test.mjs`)).toBe('frontend/scripts/mutation-gate.test.mjs')
    /* Already short, as a report written from inside `frontend/` names them. */
    expect(at('src/a.test.ts')).toBe('frontend/src/a.test.ts')
    expect(at('server/x.test.ts')).toBe('frontend/server/x.test.ts')
    expect(at('scripts/y.test.mjs')).toBe('frontend/scripts/y.test.mjs')
    /* Anything else passes through: a guessed prefix names a file that is not there. */
    expect(at('elsewhere/z.test.ts')).toBe('elsewhere/z.test.ts')
  })

  it('attaches a file that failed before any test in it ran to that file', () => {
    const broken = {
      numFailedTests: 0,
      testResults: [{
        name: `${root}/server/broken.test.ts`,
        status: 'failed',
        message: 'Error: Cannot find module ./gone\n    at load',
        assertionResults: [],
      }],
    }
    const [only] = notGreenAnnotations(broken, '')

    expect(fileProperty(only)).toBe('frontend/server/broken.test.ts')
    expect(only).toContain('failed before any test in it ran')
    expect(only).toContain('Cannot find module ./gone')
    expect(only).not.toContain('at load')
  })

  it('still says something, on one line, when vitest wrote no report at all', () => {
    const [only] = notGreenAnnotations(null, 'some noise\r\nthe last line')

    expect(only).toMatch(/^::error title=baseline not green::/)
    expect(only).toContain('no JSON report')
    /* What was printed has many lines; the command that repeats it has one.
       This is the branch where `\r` and `\n` actually reach the encoder: a
       failure's first line never holds one, the console tail always does. */
    expect(only).not.toMatch(/[\r\n]/)
    expect(only).toContain('some noise%0D%0Athe last line')
  })

  it('names the one shape that has no failing test to name', () => {
    const green = { numFailedTests: 0, testResults: [{ name: `${root}/src/a.test.ts`, status: 'passed', assertionResults: [] }] }
    const [only] = notGreenAnnotations(green, 'Unhandled Rejection')

    expect(only).toMatch(/^::error title=baseline not green::/)
    expect(only).toMatch(/no failing test/i)
    expect(only).not.toContain('a.test.ts')
  })
})
