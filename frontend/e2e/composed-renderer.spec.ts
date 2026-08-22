import { test, expect, type Page } from '@playwright/test'
import { type as typeTokens } from '../src/canvas/design/tokens'

/* THE CHECK THAT DID NOT EXIST, AND WHY THAT MATTERED.
 *
 * `e2e/scene-regressions.spec.ts:16` pins `const SCENE = '/#/canvas/gas'`, and
 * every one of its seven tests goes there. A search of the whole repository
 * finds `renderer=v2` in exactly one file -- `LessonGallery.tsx`, where it is
 * defined -- and `canvas/lessons` in exactly one -- `App.tsx`, where the route
 * is declared. Neither string appears in any test.
 *
 * So the composed renderer, which is the entire point of this branch, had
 * never been rendered in a browser by any automated check. A census of 8,236
 * log lines across 19 CI jobs returned zero `##[error]` entries -- not because
 * nothing was broken, but because nothing looked. You cannot grep an error out
 * of a log for a test that never ran.
 *
 * The irony is that the flag was correct engineering. LessonGallery.tsx:55
 * states its purpose: "Default behaviour is unchanged, so the new path has to
 * be asked for and can be abandoned by removing a query parameter rather than
 * a revert." The safety mechanism and the blind spot are the same mechanism.
 *
 * WHAT THIS FILE ASSERTS is what a learner would notice: nothing crashes,
 * nothing is silently deleted, and nothing is too small to read. Every failure
 * is reported through Playwright's `github` reporter, which emits
 * `::error file=...,line=...` so the run annotates the exact source location
 * instead of burying it in a collapsed log group.
 */

const ROUTE = '/#/canvas/lessons?renderer=v2'

/** Sizes the product claims to support. */
const VIEWPORTS = [
  { name: '320', width: 320, height: 568 },
  { name: '375', width: 375, height: 812 },
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1024', width: 1024, height: 768 },
  { name: '1280', width: 1280, height: 800 },
  { name: '1440', width: 1440, height: 900 },
]

/* The smallest type role in tokens.ts is `micro` at 10.5px. This floor WAS 10,
 * which left the interval [10, 10.5) as a free dead zone: a container could
 * scale `micro` down to 10.01px and pass a check whose entire purpose is to
 * defend that token. The floor is the token. */
const MIN_READABLE_PX = typeTokens.micro.size

interface Collected {
  consoleErrors: string[]
  pageErrors: string[]
  failedRequests: string[]
}

function collect(page: Page): Collected {
  const c: Collected = { consoleErrors: [], pageErrors: [], failedRequests: [] }
  page.on('console', (m) => { if (m.type() === 'error') c.consoleErrors.push(m.text()) })
  page.on('pageerror', (e) => c.pageErrors.push(e.message))
  page.on('requestfailed', (r) => c.failedRequests.push(`${r.url()} ${r.failure()?.errorText ?? ''}`))
  page.on('response', (r) => { if (r.status() >= 400) c.failedRequests.push(`${r.status()} ${r.url()}`) })
  return c
}

/* THE READINESS CHECK IS A FLOOR, NOT A CEILING, AND THAT DISTINCTION IS THE
 * WHOLE GATE.
 *
 * The first version of this waited for `[data-canvas="block"]` to be non-empty
 * and claimed in a comment that this gave the lazy chunks time to land. That
 * was false. `data-canvas="block"` is on the outer <section> in
 * LessonRenderer.tsx, OUTSIDE both <Suspense> boundaries, so the wait was
 * satisfied by the first synchronous React commit -- before a single dynamic
 * import was even requested. The Suspense fallback is a text-free <div>,
 * invisible to every census in this file.
 *
 * Measured under an 8x CPU throttle with 220ms added per request:
 *
 *              warm      throttled
 *   blocks       25             25
 *   KaTeX         8              2
 *   tables        4              0
 *   CLIPPED      34              0
 *
 * Every assertion below is `toBe(0)` or `toEqual([])`. So a page that failed
 * to load scored PERFECT, and the gate did not merely degrade under CI load --
 * it INVERTED. Slower runner, better score. `retries: 1` compounded it: a
 * fast-red attempt got a second chance to be slow-green, and Playwright
 * reports flaky-then-passed as exit 0.
 *
 * So this now waits for CONTENT, not for scaffolding, and every wait is a
 * lower bound that a blank page cannot satisfy. */
async function open(page: Page) {
  await page.goto(ROUTE)
  await page.waitForSelector('[data-canvas="lesson"]')

  /* Every lesson root must report that the measure -> validate -> repair loop
   * in LessonRenderer settled. Reading geometry mid-repair is how the clipping
   * census gets a torn frame. */
  await page.waitForFunction(() => {
    const lessons = [...document.querySelectorAll('[data-canvas="lesson"]')]
    return lessons.length >= 8 && lessons.every((l) => l.getAttribute('data-validated') === 'true')
  }, undefined, { timeout: 30_000 })

  /* Every block must have resolved to real content. `blocks` counts sections;
   * `filled` counts sections that actually contain a table, an SVG, typeset
   * mathematics, or text. Equality is the floor: one unresolved Suspense
   * fallback and this never settles. */
  await page.waitForFunction(() => {
    const blocks = [...document.querySelectorAll('[data-canvas="block"]')]
    if (blocks.length === 0) return false
    return blocks.every((b) =>
      b.querySelector('table, svg, .katex') !== null
      || (b.textContent ?? '').replace(/[​-‍﻿]/g, '').trim().length > 0)
  }, undefined, { timeout: 30_000 })

  /* Font metrics decide every effective-size measurement in this file.
   * `document.fonts.ready` resolves with the FontFaceSet itself, which is not
   * serialisable across the CDP boundary -- returning it directly hangs the
   * evaluate. Resolve to undefined instead. */
  await page.evaluate(() => document.fonts.ready.then(() => undefined))

  /* Two consecutive frames with an unchanged layout signature. Cheaper and
   * more honest than a fixed sleep, and it cannot pass on a blank page
   * because the previous wait already demanded content. */
  await page.waitForFunction(() => {
    const sig = [...document.querySelectorAll('[data-canvas="block"]')]
      .map((b) => { const r = b.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}` })
      .join(',')
    const w = window as unknown as { __sig?: string; __same?: number }
    if (w.__sig === sig) { w.__same = (w.__same ?? 0) + 1 } else { w.__sig = sig; w.__same = 0 }
    return (w.__same ?? 0) >= 2
  }, undefined, { timeout: 30_000 })
}

test.describe('the composed renderer runs clean', () => {
  for (const vp of VIEWPORTS) {
    test(`no runtime errors at ${vp.name}px`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      const c = collect(page)
      await open(page)
      expect(c.pageErrors, 'uncaught exceptions').toEqual([])
      expect(c.consoleErrors, 'console errors').toEqual([])
      expect(c.failedRequests, 'failed network requests').toEqual([])
    })
  }
})

test.describe('no content is clipped where a learner cannot reach it', () => {
  for (const vp of VIEWPORTS) {
    test(`content stays reachable at ${vp.name}px`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await open(page)

      const lost = await page.evaluate(() => {
        /* An element is LOST when it extends past the right edge of an
         * ancestor that clips without scrolling. Content inside an
         * `overflow-x: auto` box is reachable and is not a fault -- that is
         * the table contract's disclosure plan working. */
        const out: Array<{ text: string; clippedBy: number; block: string }> = []
        for (const el of Array.from(document.querySelectorAll('[data-canvas="block"] *'))) {
          const r = el.getBoundingClientRect()
          if (r.width === 0 || r.height === 0) continue

          /* Only TEXT-BEARING elements count. KaTeX draws its radical tail as
           * a 13000px-wide <path> inside `span.hide-tail { overflow: hidden }`;
           * it is stock glyph geometry, invisible on screen, and reporting it
           * would put a 12952px "loss" on every viewport including desktop --
           * drowning the real finding, which is equation content genuinely
           * cut off below 390px. A learner loses words, not path data. */
          const own = (el.textContent ?? '').replace(/[​-‍﻿]/g, '').trim()
          if (own.length === 0) continue
          let node: Element | null = el.parentElement
          while (node && node !== document.body) {
            const cs = getComputedStyle(node)
            const box = node.getBoundingClientRect()
            const clipsX = cs.overflowX === 'hidden' || cs.overflowX === 'clip'
            const scrollsX = cs.overflowX === 'auto' || cs.overflowX === 'scroll'
            if (scrollsX) break
            if (clipsX && r.right > box.right + 1) {
              const block = el.closest('[data-canvas="block"]')
              out.push({
                text: own.slice(0, 40),
                clippedBy: Math.round(r.right - box.right),
                block: block?.getAttribute('data-kind') ?? '?',
              })
              break
            }
            node = node.parentElement
          }
        }
        return out
      })

      const worst = lost.sort((a, b) => b.clippedBy - a.clippedBy).slice(0, 5)
      expect(
        lost.length,
        `${lost.length} element(s) clipped and unreachable. Worst: `
        + worst.map((l) => `[${l.block}] "${l.text}" cut by ${l.clippedBy}px`).join(' | '),
      ).toBe(0)
    })
  }
})

test.describe('text stays readable', () => {
  for (const vp of VIEWPORTS) {
    test(`no text below ${MIN_READABLE_PX}px at ${vp.name}px`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await open(page)

      const tiny = await page.evaluate((floor) => {
        const out: Array<{ text: string; px: number }> = []
        for (const el of Array.from(document.querySelectorAll('[data-canvas="block"] text, [data-canvas="block"] p, [data-canvas="block"] span, [data-canvas="block"] td, [data-canvas="block"] th, [data-canvas="block"] h3'))) {
          /* Strip zero-width characters: KaTeX struts are not readable text
           * and would otherwise dominate this census as false positives. */
          const t = (el.textContent ?? '').replace(/[​-‍﻿]/g, '').trim()
          if (t.length < 2) continue
          if (el.getClientRects().length === 0) continue
          const cs = getComputedStyle(el)
          if (cs.visibility === 'hidden' || cs.display === 'none') continue
          let px = parseFloat(cs.fontSize)
          const svg = (el as SVGElement).ownerSVGElement
          if (svg) {
            const vb = svg.viewBox.baseVal
            if (vb && vb.width) px *= svg.getBoundingClientRect().width / vb.width
          }
          if (px > 0 && px < floor) out.push({ text: t.slice(0, 30), px: Math.round(px * 100) / 100 })
        }
        return out
      }, MIN_READABLE_PX)

      const worst = tiny.sort((a, b) => a.px - b.px).slice(0, 5)
      expect(
        tiny.length,
        `${tiny.length} text node(s) below ${MIN_READABLE_PX}px. Smallest: `
        + worst.map((t) => `"${t.text}" at ${t.px}px`).join(' | '),
      ).toBe(0)
    })
  }
})

test.describe('the document is well formed', () => {
  test('no duplicate element ids', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page)
    const dupes = await page.evaluate(() => {
      const seen = new Map<string, number>()
      for (const el of Array.from(document.querySelectorAll('[id]'))) {
        seen.set(el.id, (seen.get(el.id) ?? 0) + 1)
      }
      return [...seen.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id} x${n}`)
    })
    expect(dupes, 'duplicate ids break every aria and url(#) reference').toEqual([])
  })

  test('every control has a distinguishable accessible name', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page)
    const names = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button, a[href]')).map(
        (el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim(),
      ).filter(Boolean),
    )
    const dupes = names.filter((n, i) => names.indexOf(n) !== i)
    expect(
      [...new Set(dupes)],
      'controls sharing one name cannot be told apart from a screen-reader list',
    ).toEqual([])
  })

  test('a horizontally scrollable region is reachable by keyboard', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page)
    const unreachable = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-canvas="block"] *'))
        .filter((el) => {
          const cs = getComputedStyle(el)
          if (cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') return false
          return el.scrollWidth > el.clientWidth + 1
        })
        .filter((el) => el.getAttribute('tabindex') === null && el.getAttribute('role') === null)
        .map((el) => el.tagName.toLowerCase()),
    )
    expect(
      unreachable,
      'a scroll container with no tabindex and no role cannot be scrolled without a mouse (WCAG 2.1.1)',
    ).toEqual([])
  })
})


test.describe('the readability floor is the token, not a number beside it', () => {
  test('MIN_READABLE_PX is the smallest type role, read from tokens.ts', () => {
    /* This floor was hardcoded to 10 while `micro` is 10.5, leaving the
     * interval [10, 10.5) free: a container could scale the smallest role down
     * by 5% and pass the check whose whole purpose is to defend it. Reverting
     * that was invisible to every test, because the floor IS the assertion --
     * lowering it cannot fail a test that uses it. So the floor is now read
     * from the token, and this pins it to the SMALLEST role rather than to any
     * role that happens to be convenient. */
    const smallest = Math.min(...Object.values(typeTokens).map((r) => r.size))
    expect(MIN_READABLE_PX).toBe(smallest)
    expect(MIN_READABLE_PX).toBe(typeTokens.micro.size)
  })
})
