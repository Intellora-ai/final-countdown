/**
 * What a failure WAS, and what to check next — by rule, never by invention.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * A CI annotation used to carry one thing: the assertion that failed. A reader
 * got `Expected: 1 / Received: 0` and a filename somebody had typed by hand,
 * and everything else -- whether the page had crashed, whether it was a timing
 * flake, which file to open -- was rediscovered by hand every time.
 *
 * The information was already in the run. `firstUsefulLine` kept three lines of
 * it and dropped the rest on the floor.
 *
 * WHY IT IS A RULE TABLE AND NOT A SENTENCE GENERATOR
 * --------------------------------------------------
 * This prints advice next to somebody's broken build. Advice that is wrong is
 * strictly worse than no advice: it sends the reader to the wrong file with
 * confidence, which is the exact defect that motivated the change -- an
 * annotation blamed `doubt.ts`, a pure text matcher with no viewport and no
 * clock, for a failure that only happened at one viewport.
 *
 * So `remedy` returns the EMPTY STRING whenever no rule matches, and the test
 * that pins that is the load-bearing one in `remedy.test.ts`. Every rule added
 * has to leave it true. A reporter that always has something to say is a
 * reporter that is guessing.
 */

/**
 * The closed set of things a failure can be.
 *
 * `unknown` is a real member, not a gap. A classifier with no honest "I do not
 * know" is forced to file every unfamiliar failure under its nearest neighbour,
 * and a mislabelled failure costs more than an unlabelled one.
 */
export type Classification =
  | 'crashed'
  | 'never-rendered'
  | 'wrong-value'
  | 'timed-out'
  | 'flaky-on-retry'
  | 'unknown'

/** Everything the rules are allowed to read. Deliberately small. */
export interface FailureShape {
  /** The cleaned error text: matcher, expected and received. */
  readonly message: string
  readonly status: 'failed' | 'timedOut' | 'interrupted' | 'flaky'
  /** How many times the test ran. >1 means a retry happened. */
  readonly attempts: number
  /** Errors the PAGE raised — `pageerror`, console errors. Usually empty. */
  readonly causes: readonly string[]
  /** The source file the test attributed. Named in the advice, so it must be
   *  the attributed path and not the spec. */
  readonly where: string
}

/** `toHaveCount` reporting nothing found. The count is read, not assumed. */
const COUNT_RECEIVED = /toHaveCount[\s\S]*?Received:\s*(\d+)/
/** Any matcher that printed a concrete expected value. */
const HAS_EXPECTED = /Expected:/

export function classify(f: FailureShape): Classification {
  /* A PAGE ERROR OUTRANKS EVERY OTHER SIGNAL, and the ordering is the whole
     point. When React throws, the subtree unmounts, so the assertion that runs
     next reports a perfectly accurate `Received: 0` about a page that no longer
     exists. Classifying that as "never rendered" would send the reader to the
     conditional that gates the element, which is innocent. The crash is the
     story; the count is a consequence of it. */
  if (f.causes.length > 0) return 'crashed'

  /* Playwright marks a test flaky when a retry passed. That is timing
     information, and reporting it as a defect trains people to ignore it. */
  if (f.status === 'flaky') return 'flaky-on-retry'

  /* BEFORE the timeout branch, deliberately. `expect.poll` and auto-retrying
     matchers print BOTH "Timed out 10000ms" and the expected/received pair, so
     a timeout-first ordering would swallow every count assertion in the suite
     and report the least specific answer available. */
  const count = COUNT_RECEIVED.exec(f.message)
  if (count !== null && count[1] === '0') return 'never-rendered'

  /* A timeout with no expected value: nothing was being compared, the run just
     ran out of clock. */
  if (f.status === 'timedOut' && !HAS_EXPECTED.test(f.message)) return 'timed-out'

  if (HAS_EXPECTED.test(f.message)) return 'wrong-value'

  return 'unknown'
}

/**
 * One imperative line, or nothing.
 *
 * Every line names WHAT to look at. "Check the code" would satisfy the type and
 * help nobody, so each rule points at a specific place: the error above, the
 * conditional in the attributed file, the promise behind a pending state.
 */
export function remedy(f: FailureShape, c: Classification): string {
  switch (c) {
    case 'crashed':
      return 'the page threw before the assertion ran — fix the error under WHY, not the assertion'
    case 'never-rendered':
      return `element never rendered — check the conditional that gates it in ${f.where}`
    case 'timed-out':
      return 'nothing settled in time — check the pending state and the promise it waits on'
    case 'wrong-value':
      return `value differs — check the producer in ${f.where}, not the assertion`
    case 'flaky-on-retry':
      return 'passed on retry — treat as timing, not a defect'
    /* NO DEFAULT ARM WITH A GUESS IN IT. An unrecognised failure gets silence,
       and `remedy.test.ts` pins that so it survives the next rule added. */
    case 'unknown':
      return ''
  }
}
