import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { test, expect, type Page, type TestInfo } from '@playwright/test'

import { tokens } from '../src/canvas/design/tokens'
import { attribute, RENDERER_FALLBACK, RENDERER_SOURCE } from './util/attribution'
import { LESSONS, bodyBlocks, open, teach } from './util/canvas'

/* WHAT A LEARNER WOULD NOTICE, ASSERTED IN A REAL BROWSER.
 *
 * Nothing crashes, nothing is silently unreachable, nothing is too small to
 * read, and no two controls sound the same to a screen reader. Every failure is
 * reported through `e2e/reporters/canvas-reporter.ts`, which emits
 * `::error file=...,line=...` against the RENDERER the failure came from rather
 * than against the assertion that found it.
 *
 * REPOINTED, NOT REWRITTEN.
 * -------------------------
 * This file used to pin `/#/canvas/lessons?renderer=v2` -- a gallery of eight
 * lessons behind a feature flag. That route now redirects to `/#/canvas`, which
 * teaches ONE lesson ONE beat at a time. Every assertion below survived the
 * move unchanged in substance, because none of them was ever about the gallery:
 * "no console errors", "no clipped text", "nothing below the smallest type
 * role", "no duplicate ids", "every control has its own name", "a scroller is
 * keyboard-reachable" are properties of any page this engine can produce.
 *
 * Three things about the move are worth writing down, because each of them
 * could have quietly hollowed the file out:
 *
 *   1. THE SWEEP REVEALS THE WHOLE LESSON. A gallery put eight compositions on
 *      one page; the teaching view opens with one block. Censusing the landing
 *      state would have measured a tenth of the product at full confidence. So
 *      `teach()` presses Continue to the end, and each viewport test walks all
 *      three lessons -- physics, civics and machine learning are deliberately
 *      unalike, and between them they exercise every block kind the engine has.
 *
 *   2. THE READABILITY FLOOR MOVED WITH THE TOKENS. It was read from
 *      `typeTokens.micro.size`, and `micro` no longer exists -- the type scale
 *      is seven roles now and the smallest is `label` at 11px. Left alone the
 *      import would have yielded `undefined`, `px < undefined` is false for
 *      every number, and the census would have found nothing, forever, while
 *      still reading like a check. It is derived from the scale instead of
 *      named, and the last test in this file pins that derivation.
 *
 *   3. THE CENSUS SCOPE WIDENED FROM A BLOCK TO THE TEACHING SURFACE. The old
 *      scope was `[data-canvas="block"] *`, which no longer exists. `.lc-teach *`
 *      is its successor plus the checkpoint, and the checkpoint deserves to be
 *      in: a Continue button clipped off the right edge is exactly as fatal to
 *      a learner as a clipped table cell.
 */

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

/* THE FLOOR IS THE TOKEN, NOT A NUMBER BESIDE IT.
 *
 * It was once hardcoded to 10 while the smallest role was 10.5, which left the
 * interval [10, 10.5) free: a container could scale the smallest role down by
 * 5% and pass the check whose entire purpose is to defend it. A hardcoded floor
 * is invisible to every test, because the floor IS the assertion -- lowering it
 * cannot fail a test that uses it. So it is computed from the scale, and the
 * scale is allowed to change without anyone editing this line.
 *
 * `parseFloat` because a token carries a CSS length ('11px'), not a number. */
const MIN_READABLE_PX = Math.min(
  ...Object.values(tokens.type).map((role) => Number.parseFloat(role.size)),
)

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

/** Open the canvas at a size and teach every lesson through to its end. */
async function sweep(
  page: Page,
  testInfo: TestInfo,
  size: { width: number; height: number },
  each: (label: string) => Promise<void>,
): Promise<void> {
  await page.setViewportSize(size)
  await open(page, testInfo)
  /* No settle() here: the landing is blank by design, and settle refuses an
   * empty page -- it would spin its full 30s against zero blocks. teach()
   * below stages each lesson and settles it once blocks actually exist. */
  for (const lesson of LESSONS) {
    await teach(page, lesson.label)
    await each(lesson.label)
  }
}

test.describe('the canvas runs clean', () => {
  for (const vp of VIEWPORTS) {
    test(`no runtime errors at ${vp.name}px`, async ({ page }, testInfo) => {
      const c = collect(page)
      await sweep(page, testInfo, vp, async () => {})
      expect(c.pageErrors, 'uncaught exceptions').toEqual([])
      expect(c.consoleErrors, 'console errors').toEqual([])
      expect(c.failedRequests, 'failed network requests').toEqual([])
    })
  }
})

test.describe('no content is clipped where a learner cannot reach it', () => {
  for (const vp of VIEWPORTS) {
    test(`content stays reachable at ${vp.name}px`, async ({ page }, testInfo) => {
      const lost: Array<{ text: string; clippedBy: number; kind: string | null; lesson: string }> = []

      await sweep(page, testInfo, vp, async (lesson) => {
        const found = await page.evaluate(() => {
          /* An element is LOST when it extends past the right edge of an
           * ancestor that clips without scrolling. Content inside an
           * `overflow-x: auto` box is reachable and is not a fault -- that is
           * the table's disclosure plan working as designed. */
          const out: Array<{ text: string; clippedBy: number; kind: string | null }> = []
          for (const el of Array.from(document.querySelectorAll('.lc-teach *'))) {
            const r = el.getBoundingClientRect()
            if (r.width === 0 || r.height === 0) continue

            /* Only TEXT-BEARING elements count. KaTeX draws its radical tail as
             * a 13000px-wide <path> inside `span.hide-tail { overflow: hidden }`;
             * it is stock glyph geometry, invisible on screen, and reporting it
             * would put a 12952px "loss" on every viewport including desktop --
             * drowning the real finding. A learner loses words, not path data. */
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
                out.push({
                  text: own.slice(0, 40),
                  clippedBy: Math.round(r.right - box.right),
                  kind: el.closest('.lc-block')?.getAttribute('data-kind') ?? null,
                })
                break
              }
              node = node.parentElement
            }
          }
          return out
        })
        for (const item of found) lost.push({ ...item, lesson })
      })

      /* BEFORE the assertion, never after: a failed expect throws, and an
       * attribution added below it would never run. Attributing on a passing
       * test costs nothing -- the reporter only reads it from failures. */
      attribute(testInfo, lost.map((l) => l.kind))

      const worst = [...lost].sort((a, b) => b.clippedBy - a.clippedBy).slice(0, 5)
      expect(
        lost.length,
        `${lost.length} element(s) clipped and unreachable. Worst: `
        + worst.map((l) => `[${l.lesson}/${l.kind}] "${l.text}" cut by ${l.clippedBy}px`).join(' | '),
      ).toBe(0)
    })
  }
})

/* THE DOCUMENT ITSELF NEVER SCROLLS SIDEWAYS.
 *
 * The guard above and the keyboard guard below both have the same blind spot,
 * and it is not a small one: the first only counts elements inside an ancestor
 * that CLIPS, and the second only inspects elements that ALREADY scroll. An
 * element that simply pushes the whole document wider is invisible to both.
 *
 * That blind spot shipped a real defect. Giving `.lc-chart` a minimum width so
 * echarts had room for its labels fixed a 2px clip in one lesson and, at the
 * same time, put the physics lesson's two chart blocks at 480px inside a 320px
 * column with nothing to scroll — `documentElement.scrollWidth` 544 against
 * `clientWidth` 320. Every gate stayed green. It was found by hand.
 *
 * A page that scrolls sideways is a broken frame, and on a phone it is the
 * failure a reader notices first: the text column drifts under the thumb and
 * every line needs a horizontal scrub to finish. So it is asserted directly,
 * on the document, where no ancestor's overflow setting can hide it.
 */
test.describe('the page never scrolls sideways', () => {
  for (const vp of VIEWPORTS) {
    test(`the document fits its own width at ${vp.name}px`, async ({ page }, testInfo) => {
      const overflowing: string[] = []

      await sweep(page, testInfo, vp, async (lesson) => {
        const over = await page.evaluate(() => {
          const de = document.documentElement
          /* `+1` absorbs sub-pixel rounding: a fractional layout width reports
           * a scrollWidth one larger than clientWidth on some zoom levels, and
           * a guard that fires on that is a guard people learn to ignore. */
          if (de.scrollWidth <= de.clientWidth + 1) return null

          /* Name the widest offender, or the report says only "something is too
           * wide" and the next reader starts the same hunt over again.
           *
           * ELEMENTS INSIDE A HORIZONTAL SCROLLER ARE SKIPPED, and that is the
           * difference between a useful name and a misleading one. A figure is
           * SUPPOSED to be wider than its column -- that is the disclosure plan
           * working -- and it does not add a pixel to `documentElement`, because
           * its scroller clips it. Reporting it anyway is how this check first
           * blamed a 908px `<svg>` sitting happily inside `.lc-figure-scroll`
           * while the real cause was a 313px KaTeX span with no scroller at all.
           * The widest overflowing element and the element causing the overflow
           * are different questions; this asks the second one. */
          let worst: { sel: string; right: number } | null = null
          for (const el of Array.from(document.querySelectorAll('.lc-teach *'))) {
            const r = el.getBoundingClientRect()
            if (r.width === 0 || r.height === 0) continue
            if (r.right <= de.clientWidth + 1) continue

            let node: Element | null = el.parentElement
            let scrolled = false
            while (node && node !== document.body) {
              const ox = getComputedStyle(node).overflowX
              if (ox === 'auto' || ox === 'scroll') { scrolled = true; break }
              node = node.parentElement
            }
            if (scrolled) continue

            if (worst === null || r.right > worst.right) {
              const cls = typeof el.className === 'string' ? el.className : ''
              worst = { sel: `${el.tagName.toLowerCase()}.${cls}`.trim(), right: Math.round(r.right) }
            }
          }
          return {
            by: de.scrollWidth - de.clientWidth,
            scrollWidth: de.scrollWidth,
            clientWidth: de.clientWidth,
            worst,
          }
        })
        if (over !== null) {
          overflowing.push(
            `${lesson}: document is ${over.by}px too wide `
            + `(scrollWidth ${over.scrollWidth} vs clientWidth ${over.clientWidth})`
            + (over.worst ? `, widest: ${over.worst.sel} reaching ${over.worst.right}px` : ''),
          )
        }
      })

      expect(
        overflowing,
        'the whole page scrolls sideways, so the text column drifts under the '
        + 'reader and no ancestor overflow setting reports it',
      ).toEqual([])
    })
  }
})

test.describe('text stays readable', () => {
  for (const vp of VIEWPORTS) {
    test(`no text below ${MIN_READABLE_PX}px at ${vp.name}px`, async ({ page }, testInfo) => {
      const tiny: Array<{ text: string; px: number; kind: string | null; lesson: string }> = []

      await sweep(page, testInfo, vp, async (lesson) => {
        const found = await page.evaluate((floor) => {
          const out: Array<{ text: string; px: number; kind: string | null }> = []
          const selector = [
            'text', 'tspan', 'p', 'span', 'td', 'th', 'li', 'h1', 'h2', 'h3',
          ].map((tag) => `.lc-teach ${tag}`).join(', ')

          for (const el of Array.from(document.querySelectorAll(selector))) {
            /* Strip zero-width characters: KaTeX struts are not readable text
             * and would otherwise dominate this census as false positives. */
            const t = (el.textContent ?? '').replace(/[​-‍﻿]/g, '').trim()
            if (t.length < 2) continue
            if (el.getClientRects().length === 0) continue
            const cs = getComputedStyle(el)
            if (cs.visibility === 'hidden' || cs.display === 'none') continue

            let px = Number.parseFloat(cs.fontSize)
            /* An SVG declares its type in USER UNITS, and the element is then
             * scaled by whatever ratio its viewBox has to its rendered width.
             * Reading `font-size` alone reports the intent; multiplying by that
             * ratio reports what the eye actually gets. */
            const svg = (el as SVGElement).ownerSVGElement
            if (svg) {
              const vb = svg.viewBox.baseVal
              if (vb && vb.width) px *= svg.getBoundingClientRect().width / vb.width
            }

            if (px > 0 && px < floor) {
              out.push({
                text: t.slice(0, 30),
                px: Math.round(px * 100) / 100,
                kind: el.closest('.lc-block')?.getAttribute('data-kind') ?? null,
              })
            }
          }
          return out
        }, MIN_READABLE_PX)
        for (const item of found) tiny.push({ ...item, lesson })
      })

      attribute(testInfo, tiny.map((t) => t.kind))

      const worst = [...tiny].sort((a, b) => a.px - b.px).slice(0, 5)
      expect(
        tiny.length,
        `${tiny.length} text node(s) below ${MIN_READABLE_PX}px. Smallest: `
        + worst.map((t) => `[${t.lesson}/${t.kind}] "${t.text}" at ${t.px}px`).join(' | '),
      ).toBe(0)
    })
  }
})

test.describe('the document is well formed', () => {
  test('no duplicate element ids', async ({ page }, testInfo) => {
    const dupes: string[] = []
    await sweep(page, testInfo, { width: 1280, height: 800 }, async (lesson) => {
      const found = await page.evaluate(() => {
        const seen = new Map<string, number>()
        for (const el of Array.from(document.querySelectorAll('[id]'))) {
          seen.set(el.id, (seen.get(el.id) ?? 0) + 1)
        }
        return [...seen.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id} x${n}`)
      })
      for (const d of found) dupes.push(`${lesson}: ${d}`)
    })
    expect(dupes, 'duplicate ids break every aria and url(#) reference').toEqual([])
  })

  test('every control has a distinguishable accessible name', async ({ page }, testInfo) => {
    const collisions: string[] = []
    await sweep(page, testInfo, { width: 1280, height: 800 }, async (lesson) => {
      const names = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button, a[href], input, select')).map(
          (el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim(),
        ).filter(Boolean),
      )
      const dupes = names.filter((n, i) => names.indexOf(n) !== i)
      for (const d of new Set(dupes)) collisions.push(`${lesson}: "${d}"`)
    })
    expect(
      collisions,
      'controls sharing one name cannot be told apart from a screen-reader list',
    ).toEqual([])
  })

  test('a horizontally scrollable region is reachable by keyboard', async ({ page }, testInfo) => {
    const unreachable: string[] = []
    await sweep(page, testInfo, { width: 375, height: 812 }, async (lesson) => {
      const found = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.lc-teach *'))
          .filter((el) => {
            const cs = getComputedStyle(el)
            if (cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') return false
            return el.scrollWidth > el.clientWidth + 1
          })
          .filter((el) => el.getAttribute('tabindex') === null && el.getAttribute('role') === null)
          .map((el) => `${el.tagName.toLowerCase()}.${el.className}`),
      )
      for (const f of found) unreachable.push(`${lesson}: ${f}`)
    })
    expect(
      unreachable,
      'a scroll container with no tabindex and no role cannot be scrolled without a mouse (WCAG 2.1.1)',
    ).toEqual([])
  })
})

test.describe('the harness can still point at the defect', () => {
  /* THE ATTRIBUTION MAP IS THE ONE PIECE OF THIS HARNESS THAT FAILS SILENTLY.
   *
   * `sourceForRenderer` falls back rather than throwing, by design: a failure
   * that cannot be attributed should still be reported. The cost is that a map
   * full of dead paths degrades to the fallback and nothing says so -- which is
   * exactly what happened when `src/canvas/panels/` was deleted and all six
   * entries kept pointing at it. Two checks, both cheap, close that hole. */

  test('every path the attribution map names exists', () => {
    const missing = [...new Set([...Object.values(RENDERER_SOURCE), RENDERER_FALLBACK])]
      /* Paths are repo-root relative, because that is what a GitHub annotation
       * needs. Playwright runs from `frontend/`, so both spellings are tried:
       * whichever directory the runner started in, a real file resolves. */
      .filter((p) => !existsSync(resolve(process.cwd(), '..', p))
        && !existsSync(resolve(process.cwd(), p.replace(/^frontend\//, ''))))
    expect(missing, 'attribution paths that no longer exist').toEqual([])
  })

  test('every block kind the canvas emits has an entry', async ({ page }, testInfo) => {
    const kinds = new Set<string>()
    await sweep(page, testInfo, { width: 1440, height: 900 }, async () => {
      const found = await bodyBlocks(page).evaluateAll((els) =>
        els.map((el) => el.getAttribute('data-kind')).filter((k): k is string => k !== null),
      )
      for (const k of found) kinds.add(k)
    })
    expect(kinds.size, 'block kinds observed in the DOM').toBeGreaterThan(0)
    const unmapped = [...kinds].filter((k) => RENDERER_SOURCE[k] === undefined).sort()
    expect(
      unmapped,
      'a kind with no entry attributes every one of its failures to the spec instead of the renderer',
    ).toEqual([])
  })
})

test.describe('the readability floor is the token, not a number beside it', () => {
  test('MIN_READABLE_PX is the smallest type role, read from tokens.ts', () => {
    const sizes = Object.values(tokens.type).map((role) => Number.parseFloat(role.size))

    /* THIS IS THE ASSERTION THAT WOULD HAVE CAUGHT THE LAST BREAKAGE.
     *
     * The floor was read from `typeTokens.micro.size`. When the type scale was
     * rebuilt without a `micro` role that expression became `undefined`, and
     * `px < undefined` is false for every number on earth -- so the census
     * found nothing, reported zero, and passed. A floor that is not a finite
     * number is not a floor. */
    expect(Number.isFinite(MIN_READABLE_PX), 'the floor resolved to a real number').toBe(true)
    expect(MIN_READABLE_PX).toBeGreaterThan(0)

    /* Every role must parse, or the minimum is taken over a set with a hole in
     * it and the smallest role could be the one that silently dropped out. */
    expect(sizes.every((s) => Number.isFinite(s)), 'every type role carries a px length').toBe(true)

    /* Pinned to the SMALLEST role rather than to any role that happens to be
     * convenient, and not to a role NAME: naming one would have to be edited
     * the next time the scale is rebuilt, which is the edit that broke it. */
    expect(MIN_READABLE_PX).toBe(Math.min(...sizes))
  })
})
