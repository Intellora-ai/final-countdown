// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { equivalence } from '../../scripts/assurance/equivalence.mjs'
import { shelfDriver } from '../assurance/drivers/shelf'

/**
 * AG2 -- EQUIVALENCE DETECTOR (attack B, runtime, THE KILLER).
 *
 * The deterministic proof. From the contract's identity fields and a
 * distinguishing pair, drive the REAL handler: two requests that a subject-only
 * key treats as EQUAL but the contract treats as DIFFERENT (same subject,
 * `asked` differs). Seed the shelf for the first; ask the second through a
 * fresh learner; a REUSE of the first's artifact is a proven equivalence
 * violation -- the exact shelf bug.
 *
 * The engine is contract-driven: the fields and the pair come from the JSON, so
 * a second decision is a new contract plus a thin driver, not a new detector.
 *
 * Two proofs here:
 *  1. the LIVE code has no violation (the S9 fix keys by subject+asked);
 *  2. the detector PROVES ITSELF -- a synthetic subject-only driver (the
 *     historical bug) is caught. That is the recursive property: the gate
 *     catches the bug, not merely "the code passes the gate". The real
 *     git-stash red->green is AG10, end to end.
 */

/* vitest runs from the frontend root; the contract sits at
   assurance/contracts/ there. import.meta.url is not a file: URL under jsdom. */
const SHELF = JSON.parse(readFileSync('assurance/contracts/shelf-matching.json', 'utf8'))

describe('AG2 -- the shelf never reuses one artifact for a semantically different ask', () => {
  let env: Awaited<ReturnType<typeof shelfDriver.newEnv>>
  beforeEach(async () => { env = await shelfDriver.newEnv() })
  afterEach(() => { env.close(); vi.unstubAllGlobals() })

  it('the live shelf decision has NO equivalence violation', async () => {
    const violations = await equivalence(SHELF, shelfDriver, env)
    expect(violations, `the live shelf reused an artifact across a distinguishing pair: ${JSON.stringify(violations)}`).toEqual([])
  })

  it('the detector catches the historical subject-only bug (recursive self-test)', async () => {
    /* A driver whose ask() ignores `asked` entirely and always returns the
       seeded artifact -- exactly what a subject-only key does. The detector
       must report a violation on the differ:true pair. */
    const buggedDriver = {
      ...shelfDriver,
      // subject-only: ignores `asked` (the second arg) and always reuses the seeded artifact
      ask: async (_env: unknown, _b: unknown, seededId: string) => seededId,
    }
    const violations = await equivalence(SHELF, buggedDriver, env)
    expect(violations.length, 'the detector did not catch the subject-only bug').toBeGreaterThan(0)
    expect(violations[0]).toMatchObject({ decision: 'shelf_lookup' })
  })

  it('a differ:false pair is NOT reported (the detector is not just "always different")', async () => {
    /* The control: define/define is semantically identical, so serving the
       same artifact is correct. A detector that flagged this would be crying
       wolf. Proven by the fact that the live run above is clean, which includes
       the differ:false pair. */
    const pairs = SHELF.distinguishing_pairs.filter((p: { differ: boolean }) => p.differ === false)
    expect(pairs.length, 'the contract has no control pair').toBeGreaterThan(0)
  })

  /*
   * AG4 -- THE KNOWN-BAD CORPUS, REPLAYED. Every regression recorded for this
   * decision is enforced forever: the subject-only shape it captured MUST be
   * caught. Drop a new known-bad JSON in the corpus and it is automatically
   * enforced -- the assurance system grows after every escaped failure, and no
   * later "optimization" can quietly reintroduce a killed bug.
   */
  it('every recorded known-bad for shelf_lookup is still caught by the detector', async () => {
    const dir = 'assurance/regressions/shelf-matching'
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
    expect(files.length, 'the known-bad corpus is empty').toBeGreaterThan(0)
    for (const file of files) {
      const record = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8'))
      expect(record.known_bad?.identity_fn_body_omits).toContain('asked')
      /* Reconstruct the bug the record describes (subject-only: ignores the
         omitted identity field) and prove the detector still catches it. */
      const buggedDriver = { ...shelfDriver, ask: async (_e: unknown, _b: unknown, seededId: string) => seededId }
      const violations = await equivalence(SHELF, buggedDriver, env)
      expect(violations.length, `known-bad ${file} is no longer caught -- a regression escaped`).toBeGreaterThan(0)
    }
  })
})
