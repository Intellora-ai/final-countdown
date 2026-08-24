import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const GATE = join(HERE, 'canvas-bundle-budget.mjs')
const FIXTURE = resolve(HERE, '..', '.budget-fixture')

/*
 * THE ONLY GATE IN THIS DIRECTORY THAT HAD NO TEST.
 *
 * `gh-annotate`, `mutation-gate`, `mutation-verdict` and `reachability-gate`
 * all plant a fault and require the gate to fail on it. This one had nothing,
 * and it was not an oversight of discipline -- the script had no seam. `distDir`
 * was a hardcoded `resolve(here, '..', 'dist')` and the failure path was a
 * top-level `process.exit`, so there was no way to point it at a fixture. It
 * was untestable by construction, which is how it stayed untested while its
 * four siblings were tested thoroughly.
 *
 * WHAT THAT COST, measured rather than argued. The entry scan matched only
 * `<script src>`. A chunk the browser is told to fetch via
 * `<link rel="modulepreload">` was reported under "deferred, not counted" and
 * the gate returned PASS -- on a page whose real pre-paint JavaScript was more
 * than twice the budget.
 *
 * The gate's own header promises "the entry chunk plus anything the entry
 * statically pulls in." The implementation delivered `<script src>` alone, and
 * the comment on the scan asserted that everything else "is reached through a
 * dynamic import, by definition." That phrase was the bug: it is an assumption
 * about how Vite emits HTML, written as though it were a fact about browsers.
 * A modulepreload is fetched before anything runs and is not a dynamic import.
 *
 * It was one build-config change away from firing. Vite's own build output
 * recommends `build.rollupOptions.output.manualChunks` when a chunk grows --
 * so taking the build tool's advice would have silently blinded the budget.
 *
 * Every case below therefore comes in a pair: an input that must FAIL and an
 * input that must PASS. A budget asserted only to fail is satisfied by
 * `exit 1`, exactly as one asserted only to pass is satisfied by `exit 0`.
 */

const BUDGET_BYTES = 150 * 1024

/** Incompressible bytes, so gzip size tracks raw size and a fixture can be
 *  reliably pushed over or kept under the budget. Random data is the point:
 *  repeated filler would gzip to almost nothing and every fixture would pass. */
function heavy(bytes) {
  return randomBytes(bytes)
}

function fixture({ scripts = [], preloads = [], files = {} }) {
  rmSync(FIXTURE, { recursive: true, force: true })
  mkdirSync(join(FIXTURE, 'assets'), { recursive: true })

  const tags = [
    ...scripts.map((s) => `<script type="module" crossorigin src="${s}"></script>`),
    ...preloads.map((p) => `<link rel="modulepreload" crossorigin href="${p}">`),
  ].join('\n    ')

  writeFileSync(
    join(FIXTURE, 'index.html'),
    `<!doctype html>\n<html>\n  <head>\n    ${tags}\n  </head>\n  <body><div id="root"></div></body>\n</html>\n`,
  )
  for (const [rel, content] of Object.entries(files)) {
    writeFileSync(join(FIXTURE, rel), content)
  }
  return FIXTURE
}

/** Run the REAL gate as a subprocess and return its true exit code.
 *
 *  Deliberately execFileSync rather than a pipeline. Two sessions were caught
 *  tonight by `node gate.mjs | tail -8; echo $?`, which reports the exit status
 *  of `tail` -- one of them briefly believed they had found a gate that prints
 *  FAIL and exits clean. The status asserted here is the gate's own. */
function runGate(distDir) {
  try {
    const stdout = execFileSync(process.execPath, [GATE], {
      env: { ...process.env, CANVAS_BUDGET_DIST: distDir },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, out: stdout }
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

afterEach(() => rmSync(FIXTURE, { recursive: true, force: true }))

describe('the budget gate can fail', () => {
  it('PASSES a small entry, so the gate is not just `exit 1`', () => {
    const dist = fixture({
      scripts: ['/assets/entry.js'],
      files: { 'assets/entry.js': heavy(4 * 1024) },
    })
    const { code, out } = runGate(dist)
    expect(out).toContain('PASS')
    expect(code).toBe(0)
  })

  it('FAILS an entry over the budget, so the gate is not just `exit 0`', () => {
    const dist = fixture({
      scripts: ['/assets/entry.js'],
      files: { 'assets/entry.js': heavy(BUDGET_BYTES + 40 * 1024) },
    })
    const { code, out } = runGate(dist)
    expect(out).toContain('FAIL')
    expect(code).toBe(1)
  })
})

describe('a modulepreload is initial JavaScript', () => {
  it('COUNTS a preloaded chunk, and fails when it blows the budget', () => {
    /* The real defect. Before the fix this reported:
         PASS -- 67.84 KB of 150.00 KB used, 82.16 KB to spare
       while listing the preloaded chunk under "deferred, not counted", on a
       page whose actual pre-paint JavaScript was over 2x the budget. */
    const dist = fixture({
      scripts: ['/assets/entry.js'],
      preloads: ['/assets/vendor.js'],
      files: {
        'assets/entry.js': heavy(4 * 1024),
        'assets/vendor.js': heavy(BUDGET_BYTES + 40 * 1024),
      },
    })
    const { code, out } = runGate(dist)
    expect(out).toContain('FAIL')
    expect(code).toBe(1)
  })

  it('still PASSES when the preloaded chunk fits, so the fix is not a blanket fail', () => {
    const dist = fixture({
      scripts: ['/assets/entry.js'],
      preloads: ['/assets/vendor.js'],
      files: {
        'assets/entry.js': heavy(4 * 1024),
        'assets/vendor.js': heavy(8 * 1024),
      },
    })
    const { code, out } = runGate(dist)
    expect(out).toContain('PASS')
    expect(code).toBe(0)
  })

  it('counts the preloaded chunk rather than merely noticing it', () => {
    /* Guards the weakest plausible "fix": listing the chunk in the report
       without adding its bytes to the total. The gate would still say PASS. */
    const dist = fixture({
      scripts: ['/assets/entry.js'],
      preloads: ['/assets/vendor.js'],
      files: {
        'assets/entry.js': heavy(4 * 1024),
        'assets/vendor.js': heavy(60 * 1024),
      },
    })
    const { out } = runGate(dist)
    expect(out).toContain('vendor.js')
    /* 4KB + 60KB of incompressible bytes: the total must reflect both, so it
       cannot still be reading as the entry alone. */
    const total = /TOTAL gzip ([\d.]+) KB/.exec(out)
    expect(total).not.toBeNull()
    expect(Number(total[1])).toBeGreaterThan(50)
  })
})

describe('the harness is not vacuous', () => {
  it('fails loudly when dist does not exist, rather than passing on nothing', () => {
    /* A gate that measures an empty directory reports PASS with total
       confidence -- the same shape as every other finding in this repo today. */
    const { code, out } = runGate(join(FIXTURE, 'does-not-exist'))
    expect(code).toBe(1)
    expect(out).toContain('not found')
  })

  it('fails when index.html names a chunk that is not on disk', () => {
    const dist = fixture({ scripts: ['/assets/missing.js'], files: {} })
    const { code } = runGate(dist)
    expect(code).toBe(1)
  })
})
