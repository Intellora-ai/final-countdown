/**
 * WHAT A RED SUITE LEFT BEHIND, TURNED INTO SOMETHING A READER CAN ACT ON.
 *
 * `mutation-gate.mjs` runs the unit suite once before it mutates anything, and
 * stops if that baseline is not green. It has to: mutating on top of a suite
 * that is already failing makes every later verdict meaningless, because a
 * "killed" mutant cannot be told from a test that was red before it.
 *
 * The stop was correct and its MESSAGE was useless. One sentence, naming no
 * test, no file, no message and no exit status -- because the baseline is run
 * with `stdio: 'ignore'`, which is right for a mutant (seven hundred lines of
 * console per mutant, and the verdict is in the JSON) and wrong for the one run
 * whose failure a person has to diagnose.
 *
 * MEASURED, run 33470632438: shard 1 of 4 stopped at the baseline while shards
 * 2, 3 and 4 ran the same baseline on the same commit and found it green. So
 * something intermittent went red on one runner, and the only shard that saw it
 * reported nothing that could be used to find it. That is the failure this
 * module exists to prevent happening a second time.
 *
 * A PURE FUNCTION, AND THAT IS WHY IT IS TESTED.
 *
 * It takes the two artefacts a run leaves -- vitest's JSON report and whatever
 * the process printed -- and returns text. No filesystem, no subprocess, no
 * clock. `mutation-gate.test.mjs` cannot hold these cases: reaching the gate's
 * baseline path starts a suite that contains that file, which starts the gate
 * again, forever. Living here is what makes the evidence assertable at all.
 */

/** Console output beyond this many lines is a suite log, not a finding. */
const MAX_OUTPUT_LINES = 40

/** Repeat the END of what was printed: a crash says why on its last lines. */
function tail(output) {
  const lines = String(output ?? '').replace(/\s+$/, '').split('\n')
  if (lines.length <= MAX_OUTPUT_LINES) return lines.join('\n')
  const dropped = lines.length - MAX_OUTPUT_LINES
  return [
    `  … ${dropped} earlier line${dropped === 1 ? '' : 's'} not repeated here`,
    ...lines.slice(-MAX_OUTPUT_LINES),
  ].join('\n')
}

/** The first line of a failure, which is the assertion; the rest is a stack. */
function headline(message) {
  const first = String(message ?? '').split('\n').find((line) => line.trim() !== '')
  return first === undefined ? '(no message)' : first.trim()
}

/** Repository-relative where possible: an absolute runner path is noise. */
function shorten(name) {
  const path = String(name ?? '(unnamed file)')
  const at = path.lastIndexOf('/src/')
  if (at !== -1) return path.slice(at + 1)
  const scripts = path.lastIndexOf('/scripts/')
  if (scripts !== -1) return path.slice(scripts + 1)
  return path
}

/**
 * Every failure the report actually names.
 *
 * BOTH SHAPES, because vitest has two and only one of them has assertions in
 * it. A test that ran and failed appears as an entry in `assertionResults`. A
 * file that could not even be COLLECTED -- a bad import, a module that throws
 * at load -- appears as a failed file with an empty `assertionResults` and its
 * reason on the file. Walking only assertions reports "nothing failed" for a
 * suite that could not be read, which is the most misleading answer available.
 */
function failures(report) {
  const out = []
  for (const file of report.testResults ?? []) {
    const where = shorten(file.name)
    const assertions = file.assertionResults ?? []
    let named = 0
    for (const assertion of assertions) {
      if (assertion.status !== 'failed') continue
      named += 1
      out.push({
        what: `${where}: ${assertion.fullName ?? assertion.title ?? '(unnamed test)'}`,
        why: (assertion.failureMessages ?? []).map(headline),
      })
    }
    if (named === 0 && file.status === 'failed') {
      out.push({
        what: `${where}: the file failed before any test in it ran`,
        why: [headline(file.message)],
      })
    }
  }
  return out
}

/**
 * Why the suite is not green, said in full.
 *
 * Never returns an empty string. A blank line under an `::error` reads as "the
 * gate had nothing to say", which is a different and much worse claim than
 * "the run left nothing behind" -- and the second one is a finding.
 */
export function notGreenEvidence(report, output) {
  const printed = tail(output)
  const said = printed === '' ? '' : `\nwhat the run printed:\n${printed}\n`

  if (report === null || report === undefined) {
    return (
      'vitest produced no JSON report, so it did not finish: the run was killed, '
      + 'or it died before a reporter could write.'
      + (said === '' ? ' It printed nothing either.\n' : said)
    )
  }

  const named = failures(report)
  if (named.length === 0) {
    return (
      'The run reported no failing test, so the suite was refused for something '
      + 'other than an assertion — an unhandled rejection, or a reporter that '
      + 'threw after the tests had passed.'
      + (said === '' ? '\n' : said)
    )
  }

  /* THE LOG IS NOT REPEATED HERE, AND THAT IS DELIBERATE. Above, it is the only
     evidence there is. Here the report has already named the test, the file and
     the assertion, and a suite log appended under that is thousands of lines
     that bury the answer -- measured on this repository, the tail of a full run
     is `lesson refused by validation` over and over, written on purpose by a
     test feeding the validator bad input. */
  /* COUNTED AS TESTS, NOT AS LINES. Each failure takes a name line and one or
     more message lines, so counting the rendered lines would announce twice as
     much breakage as there is -- and the first number in a red run is the one
     everybody quotes. */
  const lines = []
  for (const failure of named) {
    lines.push(`  ${failure.what}`)
    for (const why of failure.why) lines.push(`      ${why}`)
  }
  const count = named.length === 1 ? '1 failing test' : `${named.length} failing tests`
  return [`${count} in the baseline:`, ...lines].join('\n') + '\n'
}
