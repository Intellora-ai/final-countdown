import { test, expect } from '@playwright/test'
import { sheOpensTheApp, whatSheCanRead, thingsSheCanPress } from './person'

/**
 * LAW C -- A CHILD NEVER READS A MACHINE CODE.
 *
 * When something is not set up, the person in front of the screen is owed
 * words: what happened, and what to do about it. A number is not words. A
 * child who reads "the planner answered 500" learns that the app is broken and
 * that it is not going to tell her why.
 *
 * WHAT IT CATCHES, MEASURED BY HAND BEFORE THIS FILE EXISTED.
 *
 * `npm run dev`, open the front door, and the first thing on the screen is
 * "the planner answered 500". Meanwhile the server this app talks to exits
 * with a genuinely good message -- "almanac server: no model is configured, so
 * no lesson can be written. Set one: ANTHROPIC_API_KEY=... or OLLAMA_MODEL=..."
 * -- which goes to a terminal the child will never see. The right words already
 * exist. They just do not reach her.
 *
 * WHY THIS SUITE RUNS WITHOUT THAT SERVER. See the comment in
 * `playwright.reallife.config.ts`. Most people who open this app will not have
 * a key, so that state is real life, and a suite that only runs in the
 * everything-provided configuration cannot see this defect at all.
 */

/**
 * Text only a machine would write.
 *
 * CHOSEN NARROWLY, ON PURPOSE. A school app legitimately says "undefined" in
 * mathematics ("the gradient is undefined at x = 0") and "standard error" in
 * statistics. Matching those would make this law cry wolf, and a law that
 * cries wolf gets switched off. Every entry below is something no lesson would
 * ever say to a learner.
 */
const ONLY_A_MACHINE_WRITES_THIS: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  { pattern: /\b\w+\s+answered\s+\d{3}\b/i, why: 'an HTTP status shown as an answer' },
  { pattern: /\bHTTP\s*\d{3}\b/i, why: 'a raw HTTP status' },
  { pattern: /\bInternal Server Error\b/i, why: 'a server error phrase' },
  { pattern: /\[object Object\]/, why: 'an unrendered JavaScript object' },
  { pattern: /\b(TypeError|ReferenceError|SyntaxError|RangeError)\b/, why: 'a JavaScript exception name' },
  { pattern: /\bat\s+\S+\s*\([^)]*\.[jt]sx?:\d+/, why: 'a stack trace frame' },
  { pattern: /\bFailed to fetch\b/i, why: 'a raw network failure' },
  { pattern: /\bECONNREFUSED\b/i, why: 'a raw socket error' },
  { pattern: /\bNaN\b(?!\s*(is|means|stands))/, why: 'not-a-number leaking into the page' },
]

/** Words that mean the app is telling her what to do next. */
const TELLS_HER_WHAT_TO_DO = /\b(try|check|ask|set|open|press|start|need|install|configure|contact|again|meanwhile|instead)\b/i

test.describe('Law C -- every screen speaks to her in words, never in codes', () => {
  test('no screen she can reach shows her a machine code', async ({ page }) => {
    await sheOpensTheApp(page, '/')

    const visited = new Set<string>()
    const complaints: string[] = []

    /* Walk the app the way she would: from the front door, press the things
     * that look pressable, look at where you land. Two levels deep is enough
     * to reach every top-level area without walking forever. */
    const frontDoor = page.url()
    const doors = await thingsSheCanPress(page)
    const doorNames: string[] = []
    for (const door of doors) {
      const name = (await door.textContent().catch(() => ''))?.trim() ?? ''
      if (name) doorNames.push(name)
    }

    expect(doorNames.length, 'the front door offered her nothing to press')
      .toBeGreaterThan(0)

    const check = async (whereSheIs: string) => {
      const words = await whatSheCanRead(page)
      if (visited.has(words.slice(0, 200))) return
      visited.add(words.slice(0, 200))

      for (const { pattern, why } of ONLY_A_MACHINE_WRITES_THIS) {
        const hit = words.match(pattern)
        if (!hit) continue
        const around = words.slice(
          Math.max(0, words.indexOf(hit[0]) - 90),
          words.indexOf(hit[0]) + hit[0].length + 90,
        )
        complaints.push(
          `On "${whereSheIs}" she reads ${why}: "${hit[0]}"\n` +
          `    in context: "...${around}..."\n` +
          `    ${TELLS_HER_WHAT_TO_DO.test(around)
            ? 'It does at least suggest an action, but the code itself is still on her screen.'
            : 'It does not tell her what to do about it either.'}`,
        )
      }
    }

    await check('the front door')

    for (const name of doorNames) {
      await page.goto(frontDoor, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(800)
      const door = page.getByRole('button', { name, exact: true })
        .or(page.getByRole('link', { name, exact: true })).first()
      if (!(await door.isVisible().catch(() => false))) continue
      await door.click({ timeout: 5000 }).catch(() => { /* not every control navigates */ })
      await page.waitForTimeout(1500)
      await check(name)
    }

    expect(
      complaints,
      'A child was shown machine output instead of words:\n\n' + complaints.join('\n\n'),
    ).toEqual([])
  })

  test('when something is not set up, she is told what to do about it', async ({ page }) => {
    /* THE PAIR. The test above forbids a code. This one forbids the other
     * failure -- a blank space where the explanation should be. An app that
     * hid the number and said nothing at all would satisfy the first test and
     * still leave her stuck, so silence has to be illegal too. */
    await sheOpensTheApp(page, '/')
    const words = await whatSheCanRead(page)

    const somethingIsWrong =
      /\b(could ?n[o']t|cannot|can[o']t|unable|failed|not available|unavailable|no .* configured|error)\b/i
        .test(words)

    if (somethingIsWrong) {
      expect(
        TELLS_HER_WHAT_TO_DO.test(words),
        `The front door tells her something is wrong but never what to do:\n` +
        `"${words.slice(0, 400)}"`,
      ).toBe(true)
    }
  })
})
