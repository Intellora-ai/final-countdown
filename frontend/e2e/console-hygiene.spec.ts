/**
 * NO PAGE MAY THROW OR LOG AN ERROR AND STAY GREEN.
 *
 * THE HOLE THIS CLOSES, MEASURED. The deep-qa harness once counted 180 console
 * errors from a single cause (the missing /api proxy), and nothing in CI went
 * red: no spec in this directory listened to `pageerror` or `console.error`, so
 * an uncaught exception in production code was invisible to every browser gate
 * unless it also broke a visible assertion. An app can render a plausible page
 * while its console reports it is broken -- that is precisely how UI defects
 * ship.
 *
 * WHAT COUNTS AS A VIOLATION. Two things only:
 *   - `pageerror`: an uncaught exception or unhandled rejection in page code.
 *   - `console.error`: the app or a library saying, itself, that something is
 *     wrong. React prints hook violations, key warnings and act() misuse here.
 * `console.warn` is deliberately excluded: warnings are advice, and a gate
 * that fails on advice gets switched off within a week.
 *
 * THE RATCHET, SAME AS a11y.spec.ts, SAME REASON. A first run on any real app
 * finds noise. Failing on ALL of it makes the gate red from day one, and a
 * gate that is always red stops being read. Failing on NEW entries records the
 * debt visibly in `ci/baselines/console.json` and lets the number only go
 * down: the staleness check fails when a recorded entry no longer occurs, so
 * fixed noise cannot silently stay permitted.
 *
 * FINGERPRINTS, NOT MESSAGES. A raw message carries ports, hashes, timings and
 * bundle chunk names, so it never matches twice. The first line, with digits
 * and URLs collapsed, is stable across runs and machines and still names the
 * defect well enough to grep for.
 */

import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { permittedFor, type Baseline } from './util/baseline'

/** The same routes the accessibility journey walks, for the same reason: a
    hash router serves index.html for every path, so paths must be hashes. */
const ROUTES: readonly { name: string; path: string }[] = [
  { name: 'canvas', path: '/#/canvas' },
  { name: 'practice', path: '/#/practice' },
  { name: 'today', path: '/#/today' },
]

const HERE = dirname(fileURLToPath(import.meta.url))
const BASELINE_PATH = resolve(HERE, '../../ci/baselines/console.json')

function baseline(): Baseline {
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline
}

/**
 * A stable name for one console finding.
 *
 * Digits collapse to `#` (ports, line numbers, ids), URLs to their path shape,
 * and only the first line survives (stacks differ per bundle). `slice(0, 160)`
 * keeps the baseline readable; a defect that needs more than 160 characters to
 * distinguish is two defects.
 */
function fingerprint(text: string): string {
  return text
    .split('\n')[0]!
    .replace(/https?:\/\/[^\s"']+/g, (url) => new URL(url).pathname.replace(/\d+/g, '#'))
    .replace(/\d+/g, '#')
    .trim()
    .slice(0, 160)
}

for (const route of ROUTES) {
  test(`${route.name}: the console reports nothing new`, async ({ page }, testInfo) => {
    const found = new Set<string>()
    page.on('pageerror', (error) => found.add(`pageerror: ${fingerprint(error.message)}`))
    page.on('console', (message) => {
      if (message.type() === 'error') found.add(`error: ${fingerprint(message.text())}`)
    })

    await page.goto(route.path)
    await page.waitForLoadState('networkidle')
    /* The same three states the a11y journey scans: loaded, after keyboard
       traversal, after a phone-width resize -- because the errors that hurt
       appear AFTER interaction, not on first paint. */
    for (let i = 0; i < 8; i += 1) await page.keyboard.press('Tab')
    await page.setViewportSize({ width: 375, height: 812 })
    await page.waitForTimeout(250)

    const permitted = new Set(permittedFor(baseline(), route.name, testInfo.project.name))
    const fresh = [...found].filter((one) => !permitted.has(one)).sort()
    expect(fresh, `new console errors on ${route.name}:\n  ${fresh.join('\n  ')}`).toEqual([])

    /* THE RATCHET'S OTHER JAW: an entry that no longer occurs must leave the
       baseline, or fixed noise stays permitted for ever. */
    const stale = [...permitted].filter((one) => !found.has(one)).sort()
    expect(
      stale,
      `recorded in ci/baselines/console.json and no longer occurring on ${route.name}:\n  ${stale.join('\n  ')}`,
    ).toEqual([])
  })
}
