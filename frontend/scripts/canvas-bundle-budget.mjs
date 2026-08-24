#!/usr/bin/env node
/* INITIAL CANVAS JAVASCRIPT BUDGET — measured, printed, enforced.
 *
 * The milestone targets ≤150KB gzip of JavaScript for the canvas's initial
 * load. "Initial" means what a browser must execute before the board can show
 * its first step: the entry chunk plus anything the entry statically pulls in.
 * Block components, fixtures and the scripted lesson are dynamic imports and
 * arrive later, so counting them here would measure a page nobody loads.
 *
 * Run after `npm run build`. Exits non-zero when the budget is exceeded, and
 * prints exact byte counts either way — a budget that only speaks up when it
 * fails leaves you guessing how much room was left.
 */
import { gzipSync } from 'node:zlib'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BUDGET_BYTES = 150 * 1024

const here = dirname(fileURLToPath(import.meta.url))
/* `CANVAS_BUDGET_DIST` exists so this gate can be pointed at a fixture. It had
 * no test for one reason: a hardcoded dist path and a top-level `process.exit`
 * left nowhere to stand. Untestable by construction is how a gate stays
 * untested while its four siblings are covered thoroughly. Unset in CI and in
 * every real run, where the default below applies unchanged. */
const distDir = process.env.CANVAS_BUDGET_DIST
  ? resolve(process.env.CANVAS_BUDGET_DIST)
  : resolve(here, '..', 'dist')
const assetsDir = join(distDir, 'assets')

function fail(message) {
  console.error(`canvas-bundle-budget: ${message}`)
  process.exit(1)
}

let indexHtml
try {
  indexHtml = readFileSync(join(distDir, 'index.html'), 'utf8')
} catch {
  fail('dist/index.html not found — run `npm run build` first.')
}

/* The entry is everything index.html tells the browser to fetch BEFORE anything
 * runs. That is two tags, not one:
 *
 *   <script type="module" src>          the entry chunk
 *   <link rel="modulepreload" href>     chunks Vite hoists out of it
 *
 * This scan used to match `<script src>` alone, under a comment asserting that
 * everything else in assets/ "is reached through a dynamic import, by
 * definition." That phrase was the defect. It is an assumption about how Vite
 * emits HTML, written as though it were a fact about browsers -- and a
 * modulepreload is fetched up front and is not a dynamic import. A preloaded
 * chunk was therefore reported as "deferred, not counted" and the gate returned
 * PASS on a page whose real pre-paint JavaScript was more than twice the budget.
 *
 * It sat one build-config change away from firing: Vite's own output recommends
 * `build.rollupOptions.output.manualChunks` as chunks grow, so following the
 * build tool's advice would have blinded the budget silently.
 *
 * Attribute order is not fixed, so the link tags are matched whole and filtered,
 * rather than assuming rel comes before href. */
const scriptSrcs = [...indexHtml.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((m) => m[1])

const preloadSrcs = [...indexHtml.matchAll(/<link[^>]*>/g)]
  .map((m) => m[0])
  .filter((tag) => /rel="modulepreload"/.test(tag))
  .map((tag) => /href="([^"]+\.js)"/.exec(tag)?.[1])
  .filter((href) => href !== undefined)

/* A chunk named by both tags is one download, so it is counted once. */
const entryMatches = [...new Set([...scriptSrcs, ...preloadSrcs])]
if (entryMatches.length === 0) fail('no module script found in dist/index.html')

const rows = []
let totalGzip = 0

for (const src of entryMatches) {
  const rel = src.replace(/^\//, '')
  const abs = join(distDir, rel)
  let raw
  try {
    raw = readFileSync(abs)
  } catch {
    fail(`entry chunk referenced by index.html is missing: ${rel}`)
  }
  const gzip = gzipSync(raw).length
  totalGzip += gzip
  rows.push({ file: rel, raw: raw.length, gzip })
}

/* Report the largest deferred chunks too. They do not count against the
 * budget, but a 400KB block component that "isn't initial" is still going to
 * be somebody's first interaction, and hiding it would be convenient rather
 * than honest. */
const deferred = []
try {
  for (const name of readdirSync(assetsDir)) {
    if (!name.endsWith('.js')) continue
    const rel = join('assets', name)
    if (rows.some((r) => r.file === rel)) continue
    const abs = join(assetsDir, name)
    if (!statSync(abs).isFile()) continue
    const raw = readFileSync(abs)
    deferred.push({ file: rel, raw: raw.length, gzip: gzipSync(raw).length })
  }
} catch {
  /* No assets dir is not a budget failure. */
}
deferred.sort((a, b) => b.gzip - a.gzip)

const kb = (n) => `${(n / 1024).toFixed(2)} KB`

console.log('\nInitial canvas JavaScript (executed before the first step can show):')
for (const r of rows) console.log(`  ${r.file}  raw ${kb(r.raw)}  gzip ${kb(r.gzip)}`)
console.log(`  TOTAL gzip ${kb(totalGzip)} (${totalGzip} bytes) — budget ${kb(BUDGET_BYTES)}`)

if (deferred.length) {
  console.log('\nLargest deferred chunks (dynamic imports, not counted):')
  for (const d of deferred.slice(0, 5)) console.log(`  ${d.file}  gzip ${kb(d.gzip)}`)
}

if (totalGzip > BUDGET_BYTES) {
  console.error(
    `\ncanvas-bundle-budget: FAIL — initial JavaScript is ${kb(totalGzip)}, over the ${kb(BUDGET_BYTES)} budget by ${kb(totalGzip - BUDGET_BYTES)}.`,
  )
  process.exit(1)
}

console.log(
  `\ncanvas-bundle-budget: PASS — ${kb(totalGzip)} of ${kb(BUDGET_BYTES)} used, ${kb(BUDGET_BYTES - totalGzip)} to spare.\n`,
)
