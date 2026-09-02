import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import { islands } from './islands.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const FRONTEND = resolve(HERE, '..')

/*
 * THE INVENTORY OF MODULES NOTHING SHIPS, PINNED.
 *
 * Twice now this repository has carried code that was built, tested, and
 * imported by nothing: `/api/memory` sat with no browser caller through a whole
 * PR, and `server/offSyllabus.ts` shipped as an orphan on 2026-09-02 — caught
 * by the reachability gate, which only looks inside three declared areas and
 * never at `src/canvas` or `src/practice`.
 *
 * Every name below is deliberate and says so in its own header: entry points,
 * test fixtures, measuring instruments, and one client that exists to make a
 * Pact contract real. The list is pinned as an exact SET, in both directions:
 *
 *   - a NEW island breaks this test, which is the whole point — product code
 *     that reaches nobody is the failure, and it is silent by nature;
 *   - a name that stops being an island also breaks it, because something was
 *     wired up and the reason recorded here is now stale.
 *
 * If you trip this: wire the module, or delete it, or add it here WITH the
 * sentence that says why it is meant to be reached only by tests. Updating the
 * list with a reason is obeying the test; updating it without one is how the
 * inventory becomes a list of things nobody has thought about.
 */
const ONLY_TESTS_IMPORT_THEM = {
  'server/index.ts': 'the server’s entry point; nothing imports an entry point',
  'src/api/client.ts': 'a real consumer so the Pact contract describes calls somebody makes; its own header says the canvas does not call it yet',
  'src/canvas/lessons/billBecomesLaw.ts': 'a demo lesson, kept as a test fixture when the pre-made lessons came off the canvas',
  'src/canvas/lessons/classifierEvaluation.ts': 'a demo lesson, kept as a test fixture',
  'src/canvas/lessons/gasPressure.ts': 'a demo lesson, kept as a test fixture',
  'src/canvas/lessons/logarithms.ts': 'a demo lesson, kept as a test fixture',
  'src/canvas/lessons/tenses.ts': 'a demo lesson, kept as a test fixture',
  'src/canvas/teach/matrix.ts': 'the any-topic measurement instrument; it reports a measurement, not a score',
  'src/canvas/teach/repliesExpected.ts': 'the captured-reply corpus’s expected verdicts',
  'src/canvas/teach/ruleCensus.ts': 'the census that proves no teaching rule is dead',
  'src/canvas/teach/rulePairs.ts': 'one accept/refuse pair per rule, for that census',
  'src/practice/engine/representation.ts': 'practice-screen engine; the practice screen is out of scope for the canvas work',
  'src/websearch/bench.ts': 'the benchmark’s doorway, which is a command and not a bundle',
}

const NOTHING_IMPORTS_THEM = {
  'src/main.tsx': 'the browser entry point; the HTML imports it, not another module',
  'src/practice/ollamaRate.probe.ts': 'a probe, run by hand against a live model',
  'src/practice/topicFit.probe.ts': 'a probe, run by hand against a live model',
}

const PLANTED = join(FRONTEND, 'src', 'canvas', '__island_under_test__.ts')

afterEach(() => {
  rmSync(PLANTED, { force: true })
})

describe('code that ships to nobody', () => {
  it('is exactly the list below, and every name on it has a reason', () => {
    const found = islands()
    expect(found.islands).toEqual(Object.keys(ONLY_TESTS_IMPORT_THEM).sort())
    expect(found.unimported).toEqual(Object.keys(NOTHING_IMPORTS_THEM).sort())
    for (const reason of [...Object.values(ONLY_TESTS_IMPORT_THEM), ...Object.values(NOTHING_IMPORTS_THEM)]) {
      expect(reason.length, 'a name was added with no reason').toBeGreaterThan(20)
    }
  })

  it('sees a new orphan the moment one appears, which is the only reason it exists', () => {
    /* The proof that this test has teeth: plant a module nothing imports and
       require it to be caught. `offSyllabus.ts` was exactly this shape. */
    mkdirSync(dirname(PLANTED), { recursive: true })
    writeFileSync(PLANTED, 'export const nothingImportsThis = true\n', 'utf8')
    expect(islands().unimported).toContain('src/canvas/__island_under_test__.ts')
  })

  it('counts the modules it walked, so an empty answer can never look like a clean one', () => {
    /* A walker that finds nothing would report no islands and read as health.
       The count is what tells the two apart. */
    expect(islands().modules).toBeGreaterThan(200)
  })
})
