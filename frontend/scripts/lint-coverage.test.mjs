import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * A DIRECTORY THAT IS NOT LINTED MUST SAY SO OUT LOUD.
 *
 * WHY THIS EXISTS: THE SAME BUG, FOUR TIMES.
 *
 * ESLint's flat config lints a path only when some config object has a matching
 * `files:` entry. A directory with no matching entry is not an error --- ESLint
 * prints "ignored because no matching configuration was supplied" and EXITS 0.
 * So the gate stays green while reading none of the files.
 *
 * That has now happened to four directories in this repository:
 *
 *     src/practice     caught, block added
 *     src/agent        caught, block added
 *     src/websearch    caught, block added
 *     src/tutor        caught 2026-08-25, block added --- it ships, it is what
 *                      makes the whole of src/agent reachable from the product,
 *                      and `npx eslint src/tutor` exited 0 having read nothing
 *
 * `eslint.config.js` already carries a comment warning about exactly this. The
 * comment was written after the third occurrence and did not prevent the
 * fourth, which is the entire argument for this file: prose asks, a test
 * refuses.
 *
 * WHAT IT CHECKS
 *
 *   1. Every directory the `lint` script passes to ESLint has a matching
 *      `files:` block. Without this, adding a directory to the script looks
 *      like coverage and delivers none.
 *   2. Every `files:` block is actually reached by the `lint` script. A block
 *      nobody invokes is configuration that never runs.
 *   3. Every directory under `src/` is either linted or listed below with a
 *      written reason. This is the one that catches the FIFTH occurrence,
 *      before it happens.
 *
 * DECLARED, NEVER INFERRED.
 *
 * Rule 3 could have been "lint everything under src/". It is not, because the
 * dashboard is deliberately out of scope --- CLAUDE.md's protection rule names
 * `src/components`, `src/data` and `src/styles` and forbids touching them --- and
 * a check that demanded they be linted would be demanding a tripwire be
 * crossed. So exemptions are explicit, each with a reason, and a directory in
 * neither list fails. Same rule the reachability gate learned: a gate that
 * infers its own scope is satisfied by the input it exists to catch.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const FRONTEND = join(HERE, '..')

/**
 * Directories under `src/` that are deliberately not linted.
 *
 * A reason is required. "We never got to it" is a reason and an honest one; an
 * empty string is not, and the test refuses it.
 */
const EXEMPT = {
  components:
    'Original dashboard. CLAUDE.md protection rule: out of scope, do not migrate ' +
    'or restyle. Linting it would invite the edits that rule forbids.',
  data:
    'Original dashboard. Same protection rule. Note curriculum.smoke.test.ts here ' +
    'IS collected by vitest, so the tree is tested but not linted.',
  styles:
    'Original dashboard, and ESLint does not lint standalone .css in any case.',
  hooks:
    'Shared between the dashboard and the canvas via App.tsx. Linting it means ' +
    'ruling on dashboard code, which the protection rule reserves to the owner.',
  lib: 'Shared with the dashboard, same reason as hooks.',
  ui: 'Shared with the dashboard, same reason as hooks.',
}

/**
 * Directories at the TOP LEVEL of `frontend/` that are deliberately not linted.
 *
 * Same contract as `EXEMPT`: a reason is required, and a directory in neither
 * list fails.
 */
const TOP_EXEMPT = {
  src: 'Handled directory by directory above, which is finer-grained than this check.',
  reference:
    'Captured reference material -- a saved HTML page and a domain description ' +
    'kept for reading, not built, imported or shipped. Linting a snapshot of ' +
    'somebody else\'s output would report on a document, not on this codebase.',
  data: 'Data files. No lintable source at all; kept here so its absence is a decision.',
}

/**
 * Build products and dependencies. Not exemptions -- these are not source, and
 * listing them beside real exemptions would dilute what an exemption means.
 */
const NOT_SOURCE = new Set([
  'node_modules',
  'dist',
  'dist-server',
  'coverage',
  'test-results',
  'playwright-report',
  'public',
  /* Written by a Sauce Labs cloud run: the HTML report from
     playwright.sauce.config.ts, and the artefacts .sauce/config.yml downloads
     when a suite fails. Both are gitignored, but this check reads the
     FILESYSTEM rather than git -- so a developer who has run the cloud suite
     once would otherwise see this gate fail on directories that are not
     source. They belong here and not in TOP_EXEMPT: an exemption means
     "source we chose not to lint", and listing a run product there would
     dilute what an exemption means. */
  'playwright-report-sauce',
  'artifacts',
])

const lintScript = () => {
  const pkg = JSON.parse(readFileSync(join(FRONTEND, 'package.json'), 'utf8'))
  const script = pkg.scripts?.lint
  expect(script, 'package.json has no `lint` script at all').toBeTruthy()
  return script
}

/**
 * Every path argument the lint script hands to ESLint.
 *
 * Parsed by position rather than by pattern: a flag and the VALUE after it are
 * both dropped, which is what stops `--max-warnings 0` contributing a directory
 * called `0`. It did, in the first version of this helper.
 */
const lintArgs = () => {
  const words = lintScript().trim().split(/\s+/).slice(1)
  return words.filter(
    (word, index) => !word.startsWith('-') && !(words[index - 1] ?? '').startsWith('-'),
  )
}

/** The `src/<dir>` arguments the lint script hands to ESLint. */
const lintedDirs = () =>
  lintArgs()
    .filter((arg) => arg.startsWith('src/'))
    .map((arg) => arg.slice('src/'.length))
    .sort()

/** The non-`src` directory arguments. */
const topLevelLintedDirs = () => lintArgs().filter((arg) => !arg.startsWith('src/')).sort()

/**
 * Every directory prefix named by a glob anywhere in the flat config.
 *
 * Scanned over the WHOLE file rather than anchored to `files:`, because a
 * `files:` array may hold several globs and an anchored pattern reads only the
 * first. It did, and three configured directories were reported as unconfigured.
 */
const globDirs = () => {
  const config = readFileSync(join(FRONTEND, 'eslint.config.js'), 'utf8')
  const found = new Set()
  for (const m of config.matchAll(/'([A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)?)\/\*\*/g)) {
    found.add(m[1])
  }
  return found
}

/** The `src/<dir>` prefixes named by a `files:` glob in the flat config. */
const configuredDirs = () =>
  [...globDirs()]
    .filter((dir) => dir.startsWith('src/'))
    .map((dir) => dir.slice('src/'.length))
    .sort()

/** Top-level directory prefixes named by a glob in the flat config. */
const topLevelConfiguredDirs = () => [...globDirs()].filter((dir) => !dir.includes('/')).sort()

/** Top-level directories that hold source ESLint could read. */
const topLevelSourceDirs = () =>
  readdirSync(FRONTEND, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !NOT_SOURCE.has(e.name))
    .map((e) => e.name)
    .sort()

/** Directories directly under `src/`, ignoring anything that is not a directory. */
const srcDirs = () =>
  readdirSync(join(FRONTEND, 'src'), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()

describe('every source directory is linted or declared unlinted', () => {
  it('every directory in the lint script has a matching files: block', () => {
    const configured = new Set(configuredDirs())
    const missing = lintedDirs().filter((d) => !configured.has(d))
    expect(
      missing,
      `these directories are passed to ESLint but have no matching \`files:\` ` +
        `block, so ESLint reads none of their files and still exits 0: ` +
        `${missing.join(', ')}`,
    ).toEqual([])
  })

  it('every files: block is reached by the lint script', () => {
    const linted = new Set(lintedDirs())
    const orphaned = configuredDirs().filter((d) => !linted.has(d))
    expect(
      orphaned,
      `these directories are configured in eslint.config.js but the \`lint\` ` +
        `script never passes them, so the rules never run: ${orphaned.join(', ')}`,
    ).toEqual([])
  })

  it('every directory under src/ is either linted or exempt with a reason', () => {
    const linted = new Set(lintedDirs())
    const undeclared = srcDirs().filter((d) => !linted.has(d) && !(d in EXEMPT))
    expect(
      undeclared,
      `these directories under src/ are neither linted nor listed as exempt: ` +
        `${undeclared.join(', ')}. Add a \`files:\` block and put it in the lint ` +
        `script, or add it to EXEMPT in this file with the reason it is not linted. ` +
        `A directory in neither list is the silent exemption this test exists for.`,
    ).toEqual([])
  })

  it('no exemption is recorded without a reason', () => {
    const blank = Object.entries(EXEMPT)
      .filter(([, why]) => typeof why !== 'string' || why.trim().length < 20)
      .map(([dir]) => dir)
    expect(
      blank,
      `these exemptions carry no usable reason: ${blank.join(', ')}. An ` +
        `unexplained exemption is how "not yet" becomes permanent.`,
    ).toEqual([])
  })

  it('no exemption names a directory that no longer exists', () => {
    /* A stale exemption makes this file read as more considered than it is:
       a line about a directory nobody has looked at since it was deleted. */
    const present = new Set(srcDirs())
    const stale = Object.keys(EXEMPT).filter((d) => !present.has(d))
    expect(stale, `exemptions for directories that are gone: ${stale.join(', ')}`).toEqual([])
  })

  /*
   * THE SCOPE THIS GATE COULD NOT SEE.
   *
   * Every check above reads `src/`, and that is where the gate was pointed when
   * it was written -- five directories were caught there. Meanwhile four whole
   * trees OUTSIDE `src/` had never been matched by any block at all. Measured
   * 2026-08-30, before the blocks were added:
   *
   *     e2e            19 files   the browser harness, and every gate that
   *                               depends on it
   *     server         28 files   holds the API key
   *     scripts        43 files   every gate, the mutation runner, the
   *                               curriculum pipeline
   *     eslint-rules    1 file    the custom rule the canvas lint depends on
   *
   * `npx eslint e2e server scripts eslint-rules` answered "ignored because no
   * matching configuration was supplied" for all ninety-one files. A gate is
   * scoped by whoever wrote it, and its own scope is the one thing it cannot
   * report on -- so the scope is now asserted rather than assumed.
   */
  it('every top-level directory is either linted or exempt with a reason', () => {
    const linted = new Set(topLevelLintedDirs())
    const undeclared = topLevelSourceDirs().filter((d) => !linted.has(d) && !(d in TOP_EXEMPT))
    expect(
      undeclared,
      `these top-level directories are neither linted nor listed as exempt: ` +
        `${undeclared.join(', ')}. Add a \`files:\` block, put the directory in the ` +
        `lint script, or add it to TOP_EXEMPT here with the reason.`,
    ).toEqual([])
  })

  it('every top-level directory in the lint script has a matching files: block', () => {
    const configured = new Set(topLevelConfiguredDirs())
    const missing = topLevelLintedDirs().filter((d) => !configured.has(d))
    expect(
      missing,
      `passed to ESLint with no matching \`files:\` block, so ESLint reads none ` +
        `of their files and still exits 0: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('no top-level exemption is recorded without a reason', () => {
    const blank = Object.entries(TOP_EXEMPT)
      .filter(([, why]) => typeof why !== 'string' || why.trim().length < 20)
      .map(([dir]) => dir)
    expect(blank, `these exemptions carry no usable reason: ${blank.join(', ')}`).toEqual([])
  })

  it('e2e specifically is linted, because every gate rests on it', () => {
    /* The regression this half of the file was written for. The browser harness
       decides whether the canvas, the a11y baseline and the scene regressions
       pass, and nothing had ever read one line of it. */
    expect(topLevelLintedDirs()).toContain('e2e')
    expect(topLevelConfiguredDirs()).toContain('e2e')
  })

  it('src/tutor specifically is linted, because it ships', () => {
    /* The regression this file was written for. `App.tsx` routes
       /quick-question to TutorView, and that view is the only thing that makes
       src/agent reachable from the product. It was unlinted from the day it
       landed until 2026-08-25. */
    expect(lintedDirs()).toContain('tutor')
    expect(configuredDirs()).toContain('tutor')
  })
})
