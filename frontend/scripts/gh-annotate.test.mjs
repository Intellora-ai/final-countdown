import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * THE ANNOTATOR HAD NO TESTS, WHICH IS WHY ITS OWN FAILURE MODE WAS INVISIBLE.
 *
 * `gh-annotate.mjs` exists because a census of 8,236 CI log lines returned zero
 * error entries and nothing distinguished "nothing was wrong" from "nothing was
 * looking". It answers that with a contradiction check: a failed step that
 * produces no annotations is itself reported as a defect.
 *
 * That check counts annotations EMITTED. GitHub decides which ones LAND. The
 * two are not the same number, and every case below is a way for the gap
 * between them to swallow a real failure while the annotator reports success.
 *
 * These are adversarial in the sense the Python suite uses: each one feeds the
 * real script the real shape of a real tool's output and requires a location a
 * human could click. Asserting the script exists proves nothing.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(HERE, 'gh-annotate.mjs')

/** Run the annotator on `input`, returning stdout. Never throws on exit 1. */
function annotate(mode, input, env = {}) {
  try {
    return execFileSync('node', [SCRIPT, mode], {
      input,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    })
  } catch (e) {
    /* Exit 1 is a real outcome here — the contradiction check uses it. The
     * stdout is the verdict, so it is returned rather than the throw. */
    return String(e.stdout ?? '')
  }
}

/** Exit status, which for this script carries meaning of its own. */
function status(mode, input, env = {}) {
  try {
    execFileSync('node', [SCRIPT, mode], {
      input,
      encoding: 'utf8',
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return 0
  } catch (e) {
    return e.status ?? 1
  }
}

/** One failing vitest test whose stack leads with a library frame. */
function vitestReport(failureMessage) {
  return JSON.stringify({
    numTotalTests: 1,
    numFailedTests: 1,
    testResults: [
      {
        name: '/w/final-countdown/frontend/src/canvas/layout/layout.test.ts',
        assertionResults: [
          {
            status: 'failed',
            title: 'reports overlapping blocks',
            ancestorTitles: ['noCollision'],
            failureMessages: [failureMessage],
          },
        ],
      },
    ],
  })
}

describe('vitest stack frames', () => {
  /*
   * THE FIRST FRAME IS ALMOST NEVER THE USER'S CODE.
   *
   * An assertion library throws from inside itself, so the top of the stack is
   * chai, vitest's own expect, or node internals. Annotating that path produces
   * a `file=` under node_modules/, which is not in the diff and not in the
   * repository GitHub is annotating — so GitHub DROPS the annotation without
   * saying so. The failure is then locationless, which is the exact state this
   * script exists to prevent, reached from the other side: the contradiction
   * check sees a count above zero and stays quiet.
   */
  it('skips node_modules frames and annotates the repository file', () => {
    const out = annotate(
      'vitest',
      vitestReport(
        'AssertionError: expected false to be true\n'
        + '    at Proxy.<anonymous> (/w/final-countdown/frontend/node_modules/chai/chai.js:9203:13)\n'
        + '    at /w/final-countdown/frontend/src/canvas/layout/layout.test.ts:117:24',
      ),
    )
    expect(out).toContain('file=frontend/src/canvas/layout/layout.test.ts')
    expect(out).toContain('line=117')
    /* Only the `file=` field is asserted, not the whole line: the annotation
     * MESSAGE quotes the stack trace, and that trace names chai legitimately.
     * What must never be a dependency is the location GitHub resolves. */
    expect(out).not.toContain('file=frontend/node_modules')
  })

  it('still uses a parenthesised frame when it is the repository file', () => {
    const out = annotate(
      'vitest',
      vitestReport(
        'Error: boom\n'
        + '    at run (/w/final-countdown/frontend/src/canvas/layout/layout.ts:42:9)',
      ),
    )
    expect(out).toContain('file=frontend/src/canvas/layout/layout.ts')
    expect(out).toContain('line=42')
  })

  it('falls back to the spec file rather than annotating a dependency', () => {
    /* Every frame is library code. There is no user line to point at, so the
     * spec itself is the most specific honest location — never node_modules. */
    const out = annotate(
      'vitest',
      vitestReport(
        'AssertionError: nope\n'
        + '    at Proxy.<anonymous> (/w/final-countdown/frontend/node_modules/chai/chai.js:9203:13)\n'
        + '    at node:internal/process/task_queues:95:5',
      ),
    )
    expect(out).toContain('file=frontend/src/canvas/layout/layout.test.ts')
    expect(out).not.toContain('file=frontend/node_modules')
    /* And no line, because none of the frames named a line in this repository.
     * Inventing one would be worse than omitting it. */
    expect(out).not.toContain('line=9203')
  })
})

describe('the contradiction check', () => {
  /*
   * THE GUARD HAS A DOOR ROUND THE SIDE.
   *
   * `if (!handler) { ...; process.exit(0) }` sits ABOVE the STEP_OUTCOME check,
   * so an unrecognised mode returns 0 with no annotations and the guard never
   * executes. A renamed handler or a typo in the workflow then produces exactly
   * the state the script was written to make impossible: a red step, no
   * locations anywhere, and nothing saying the annotator is the reason.
   */
  it('fails when the step failed and the mode was not recognised', () => {
    expect(status('vitests', '{}', { STEP_OUTCOME: 'failure' })).toBe(1)
  })

  it('stays quiet about an unknown mode when the step passed', () => {
    expect(status('vitests', '{}', { STEP_OUTCOME: 'success' })).toBe(0)
  })

  it('names itself when a failed step produced no annotations', () => {
    const green = JSON.stringify({
      numTotalTests: 1,
      numFailedTests: 0,
      testResults: [],
    })
    const out = annotate('vitest', green, { STEP_OUTCOME: 'failure' })
    expect(out).toContain('gh-annotate.mjs')
    expect(status('vitest', green, { STEP_OUTCOME: 'failure' })).toBe(1)
  })
})

describe('paths that would be dropped', () => {
  /*
   * A `file=` GitHub cannot resolve is worse than no `file=`: the annotation
   * silently disappears, and the count the contradiction check trusts still
   * went up. `prefix()` turns any absolute path into a repo-relative one by
   * stripping the leading slash, which manufactures paths like `tmp/x.ts` for
   * anything outside the checkout.
   */
  it('never emits an absolute path', () => {
    const out = annotate(
      'tsc',
      '/w/final-countdown/frontend/src/canvas/spec/figure.ts(12,5): error TS2345: Argument of type X\n',
    )
    expect(out).toContain('file=frontend/src/canvas/spec/figure.ts')
    expect(out).not.toMatch(/file=\//)
  })

  it('parses the dash form tsc also emits', () => {
    const out = annotate(
      'tsc',
      'frontend/src/canvas/spec/figure.ts:31:9 - error TS2554: Expected 2 arguments\n',
    )
    expect(out).toContain('file=frontend/src/canvas/spec/figure.ts')
    expect(out).toContain('line=31')
    expect(out).toContain('col=9')
  })
})

/*
 * A SKIPPED TEST IS NOT A FAILING TEST.
 *
 * Found on `main`, in the GitHub annotations rather than in any local run.
 * Commit 06f78c3: the `frontend` job finished `success` with `8773 passed |
 * 2 skipped`, and carried two FAILURE annotations:
 *
 *   [failure] frontend/src/canvas/teach/anyTopic.test.ts      vitest: any topic -- failed
 *   [failure] frontend/src/canvas/teach/conceptProbe.test.ts  vitest: the per-concept unit -- failed
 *
 * Neither test failed. Both are `describe.skipIf(...)` blocks that correctly
 * skip when no model endpoint is configured, which is every CI run.
 *
 * The cause is one line: the loop skipped `passed` and `pending` and annotated
 * EVERYTHING ELSE. Vitest reports a skipped test as `skipped`, not `pending`,
 * so it fell through to the failure branch -- and with no `failureMessages` to
 * quote, the annotation's whole message was the word `failed`, with no line
 * number. `ci_findings.reconcile` then flagged both as
 * `unlocatable failure: annotation-without-a-line`.
 *
 * A denylist of "states that are fine" fails silently every time a new state
 * appears. Exactly one status means a test failed, so that is what is matched.
 */
describe('states that are not failures', () => {
  /** A vitest report holding a single test in `status`. */
  function reportWithStatus(status) {
    return JSON.stringify({
      numTotalTests: 1,
      numFailedTests: 0,
      testResults: [
        {
          name: '/w/final-countdown/frontend/src/canvas/teach/anyTopic.test.ts',
          assertionResults: [
            {
              status,
              title: 'teaches across the whole matrix',
              ancestorTitles: ['any topic, not six topics'],
              failureMessages: [],
            },
          ],
        },
      ],
    })
  }

  it('does not annotate a skipped test as a failure', () => {
    const out = annotate('vitest', reportWithStatus('skipped'))
    expect(out, 'a skipped test was reported to GitHub as a failure').not.toContain('::error')
  })

  it('does not annotate a todo test as a failure', () => {
    /* Same class, different spelling. A denylist that learned `skipped` and
       not `todo` would still be a denylist. */
    const out = annotate('vitest', reportWithStatus('todo'))
    expect(out, 'a todo test was reported to GitHub as a failure').not.toContain('::error')
  })

  it('still annotates a genuinely failed test', () => {
    /*
     * THE PAIR. Without this, `return` satisfies the two above and the
     * annotator stops reporting anything at all -- which is worse than the bug,
     * because a real failure would then reach nobody.
     */
    const out = annotate('vitest', reportWithStatus('failed'))
    expect(out, 'a real failure stopped being annotated').toContain('::error')
    expect(out).toContain('anyTopic.test.ts')
  })
})
