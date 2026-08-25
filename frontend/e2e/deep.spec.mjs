// Deep-QA run. The implementation lives in the shared harness so every project
// gets fixes and new invariants without copying anything:
//
//     ~/.claude/harness/deep-qa
//
// Configure it with deep-qa.config.mjs at the project root. Run it with:
//     npx playwright test deep.spec.mjs
//     DEEP_QA_SEED=7 DEEP_QA_SESSIONS=30 npx playwright test deep.spec.mjs
//
// WHY THIS LOADS DEFENSIVELY, AND WHY THAT IS THE ACTUAL FIX
// ----------------------------------------------------------
// The previous version was `import '<harness>/playwright/deep.spec.mjs'` -- a
// file the harness has never shipped. It ships `run.mjs` and `adapter.mjs`; the
// README tells you to symlink a third name that does not exist.
//
// The cost was not one skipped test. Playwright fails to COLLECT a whole
// directory when any file in it has an unresolvable import, and reports that as
// `Total: 0 tests in 0 files` rather than as an error anyone would notice. One
// bad line hid 320 passing tests in three other files, and every `test:e2e`
// after it reported success while running nothing. Measured both ways: file
// present -> 0 tests; file moved aside -> 320 in 3 files.
//
// So the fix is not "use the right filename". A static import of an OPTIONAL,
// machine-local harness makes the entire suite depend on a directory outside the
// repository. This project is checked out on other machines and in CI, where
// ~/.claude does not exist, and there the correct behaviour is to skip ONE test
// rather than to silently delete the suite.
//
// Hence: resolve from the home directory rather than by counting `../` (the
// repo is not always three levels deep), load it inside a try, and on failure
// register a single skipped test that says exactly what is missing. A missing
// optional harness can no longer take anything else down with it.
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import * as pw from '@playwright/test'

const RUN = join(homedir(), '.claude', 'harness', 'deep-qa', 'playwright', 'run.mjs')

let defineDeepRun = null
let why = ''

if (!existsSync(RUN)) {
  why = `deep-qa harness not installed at ${RUN}`
} else {
  try {
    ;({ defineDeepRun } = await import(pathToFileURL(RUN).href))
    if (typeof defineDeepRun !== 'function') {
      defineDeepRun = null
      why = `${RUN} does not export defineDeepRun`
    }
  } catch (error) {
    why = `deep-qa harness failed to load: ${error.message}`
  }
}

if (defineDeepRun) {
  let cfg = {}
  try {
    cfg = (await import('../deep-qa.config.mjs')).default ?? {}
  } catch {
    // No project config is a supported state: the crash, leak, layout and
    // blank-page laws still run. Only the MEMORY laws need `readState`, and
    // their absence is reported by the run itself rather than hidden here.
    cfg = {}
  }
  defineDeepRun(pw, cfg)
} else {
  // A named, visible skip. Silence here is what produced the original bug.
  pw.test.skip(`deep-qa run — skipped: ${why}`, () => {})
}
