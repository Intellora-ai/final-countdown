import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * THE GUARD THAT HAD NEVER RUN.
 *
 * `mutation-gate.mjs` refuses a shard that selects no mutants, because without
 * that refusal `--shard=99/100` printed `0/0 killed (0%)`, then
 * `PASS — every curated mutant was killed`, and exited 0. A gate reporting
 * success on work it never did is the exact defect the gate exists to catch,
 * occurring inside the gate.
 *
 * That refusal shipped without ever executing. The workflow calls
 * `npm run test:mutation` with no `--shard` at all, so `shardCount` is 1,
 * `MINE` is the whole catalogue, and the guard is unreachable in CI. This file
 * is what turns "correct by inspection" into "executed on every run of the
 * suite".
 *
 *
 * WHY THIS FILE CAN ONLY TEST THE FAILING PATHS, AND WHY THAT IS NOT A GAP.
 *
 * The mutation gate RUNS VITEST. A test that spawned the gate down a path
 * reaching its baseline run would start a suite that includes this file, which
 * would spawn the gate again, forever. That is not hypothetical — it is the
 * default outcome of testing this script naively.
 *
 * The reason these tests are safe is the hoist that accompanies them. The
 * `--shard` parse, the bad-value check and the empty-shard guard now sit ABOVE
 * `const base = vitest(out)`, so every case below exits before the first
 * vitest call and before the temp directory is even created. Verified by line
 * order at the time of writing: bad-value exit 572, guard exit 596, tmpdir
 * 604, first vitest call 608.
 *
 * So the hoist is not merely a performance fix that happens to be testable.
 * It is the precondition for this file existing. If someone later moves the
 * validation back below the baseline run, these tests do not fail — they hang,
 * recursing. Anyone making that move should delete this file in the same
 * commit, and at that point should ask why they are removing the only
 * execution the guard has ever had.
 *
 * COROLLARY, for whoever adds the next case here: every invocation must exit
 * before line ~604. Do not add a test that runs a VALID shard. `--shard=1/4`
 * is a legitimate configuration and it will recurse.
 *
 *
 * THE BOUNDARY IS PROVEN, NOT SAMPLED.
 *
 * Selection is `MUTANTS.filter((_, at) => at % shardCount === shardIndex - 1)`.
 * The parser already constrains `1 <= i <= n`, so `i - 1 <= n - 1` and
 * therefore `(i - 1) % n === i - 1` exactly. So `at = i - 1` is always a member
 * whenever `i - 1 < CATALOGUE`. Shard `i` is empty if and only if
 * `i >= CATALOGUE + 1`, which requires `n >= CATALOGUE + 1`.
 *
 * So the cases below sit exactly on that boundary rather than at a comfortable
 * distance from it.
 *
 *
 * WHY THE SIZE IS MEASURED HERE AND NOT WRITTEN DOWN.
 *
 * This constant was a literal `39` for exactly as long as the catalogue had 39
 * entries in it. A branch that added eleven mutants took it to 50, at which
 * point `--shard=40/40` stopped being the empty shard this file assumes and
 * became an ORDINARY, POPULATED one. An ordinary shard does not exit at the
 * guard. It runs the baseline suite -- which contains this file -- which spawns
 * the gate again. The suite did not fail. It recursed until the runner was
 * killed, 15 minutes for a job that takes 70 seconds.
 *
 * That is the corollary above, arriving by accident instead of by edit: a
 * pinned size does not merely go stale, it silently converts every case in this
 * file into the one kind of invocation the file forbids. The boundary is a
 * function of the catalogue, so it is computed from the catalogue.
 */

/* Parsed rather than imported, because importing the gate RUNS it. This is the
 * same anchor `gate_integrity.py` counts for the ratchet, so the two agree on
 * what a mutant is by construction. */
const GATE = readFileSync(new URL('./mutation-gate.mjs', import.meta.url), 'utf8')
const CATALOGUE = (GATE.match(/^\s*id: '[^']+',$/gm) ?? []).length

/* An UNDERCOUNT is the dangerous direction, and zero is its limit: it makes
 * `--shard=1/1` the "empty" case, which is the entire catalogue, which recurses.
 * Throwing at module scope fails collection in a second with this sentence
 * attached. Never let a broken measurement fall through to a valid shard. */
if (CATALOGUE < 2) {
  throw new Error(
    `Counted ${CATALOGUE} mutants in mutation-gate.mjs, which cannot be right. `
    + 'The `id:` anchor these tests parse has moved or changed shape. Fix the '
    + 'pattern before trusting anything below: a wrong count here does not fail '
    + 'these tests, it makes them run a real shard and recurse into themselves.',
  )
}

/* Non-zero exit makes execFileSync throw, and the throw carries what we need.
 * Returning a plain shape keeps each assertion about the gate rather than
 * about exception handling. */
function runGate(...args) {
  try {
    const stdout = execFileSync('node', ['scripts/mutation-gate.mjs', ...args], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { status: 0, stdout }
  } catch (e) {
    return { status: e.status, stdout: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

/* A lock file from a killed run makes the gate refuse before it reads argv,
 * which would fail every case below with a message about the wrong thing.
 * Naming it explicitly costs one line and saves the next person the hour. */
function assertNotLockFailure(out) {
  if (out.includes('mutation gate did not clean up')) {
    throw new Error(
      'A stale frontend/.mutation-lock is present, so the gate exited before '
      + 'parsing --shard. Remove the lock and re-run; these tests say nothing '
      + 'about sharding until it is gone.',
    )
  }
}

describe('mutation gate, empty-shard guard', () => {
  it(`refuses shard ${CATALOGUE + 1}/${CATALOGUE + 1}, the smallest count that can select nothing`, () => {
    const { status, stdout } = runGate(`--shard=${CATALOGUE + 1}/${CATALOGUE + 1}`)
    assertNotLockFailure(stdout)

    expect(status).toBe(1)
    expect(stdout).toContain('A shard with nothing to run cannot pass')
    expect(stdout).toContain(`shard ${CATALOGUE + 1}/${CATALOGUE + 1}`)
    expect(stdout).toContain(`catalogue of ${CATALOGUE}`)
  })

  it('refuses the empty index when a larger count leaves earlier shards populated', () => {
    /* At n = CATALOGUE + 2, indices 1..CATALOGUE are populated and
     * CATALOGUE+1, CATALOGUE+2 are empty. Picking an empty index here proves
     * the guard keys on the SELECTION being empty, not on the shard count
     * exceeding the catalogue in the abstract. */
    const { status, stdout } = runGate(`--shard=${CATALOGUE + 1}/${CATALOGUE + 2}`)
    assertNotLockFailure(stdout)

    expect(status).toBe(1)
    expect(stdout).toContain('A shard with nothing to run cannot pass')
  })

  it('never reports PASS on a shard it refused', () => {
    /* The original defect was not the empty selection. It was that the empty
     * selection printed PASS and exited 0. Asserting the absence of that word
     * is asserting the actual regression, which a status check alone does
     * not. */
    const { status, stdout } = runGate(`--shard=${CATALOGUE + 1}/${CATALOGUE + 1}`)
    assertNotLockFailure(stdout)

    expect(status).not.toBe(0)
    expect(stdout).not.toContain('every curated mutant was killed')
  })
})

describe('mutation gate, --shard argument validation', () => {
  /* Each of these exits at the bad-value check, above the baseline run. */
  const rejected = [
    ['--shard=abc', 'not a pair of numbers'],
    ['--shard=0/4', 'index below 1'],
    ['--shard=5/4', 'index above the count'],
    ['--shard=1/0', 'count below 1'],
  ]

  for (const [arg, why] of rejected) {
    it(`rejects ${arg} (${why})`, () => {
      const { status, stdout } = runGate(arg)
      assertNotLockFailure(stdout)

      expect(status).toBe(1)
      expect(stdout).toContain('bad --shard value')
    })
  }

  it('rejects a bad value without paying for the baseline suite', () => {
    /* THE HOIST, ASSERTED. Before it, this invocation ran ~950 tests and only
     * then complained about an argument it could reject in microseconds --
     * once per shard in the matrix. The gate announces the baseline as it
     * starts it, so the absence of that line is the evidence that no suite
     * ran. This assertion is what fails if the validation is ever moved back
     * down. */
    const { stdout } = runGate('--shard=abc')
    assertNotLockFailure(stdout)

    expect(stdout).not.toContain('establishing the baseline')
  })
})
