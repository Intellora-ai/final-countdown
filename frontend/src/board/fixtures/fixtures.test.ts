/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest'
import { FIXTURES, REQUIRED_SCENARIOS, type FixtureEntry } from './index'
import { validateBoard } from '../renderer/validateBoard'
import { planFromBoard } from '../teaching/plan'
import { resolve, registeredTypes } from '../renderer/blockRegistry'

/* THE SCENARIO GALLERY, CHECKED AGAINST ITSELF.
 *
 * The claim this file defends is the Phase 4 gate: at least 24 scenarios
 * exist, every valid one validates with ZERO notices, every invalid one fails
 * safely or repairs visibly, and all of them reach the screen through the same
 * renderer.
 *
 * It iterates the MANIFEST rather than a list written here. The previous
 * version of this check hard-coded five fixtures inside the validator's test
 * file, which meant a sixth fixture could be added and cover nothing — the
 * test would still pass while the coverage claim quietly became false. Every
 * assertion below is therefore driven by what the manifest declares about
 * each fixture, so adding a fixture without declaring it fails a test.
 */

/* Source text is read through Vite's own raw glob rather than node:fs. Two
 * reasons, both practical: this file lives under src/ and is therefore
 * typechecked by `tsc -b`, which has no node type declarations — and adding
 * @types/node to read a few files in a test is a dependency bought for very
 * little. The glob also asks the bundler the same question the bundler
 * answers at build time, which is exactly what these scans are about.
 *
 * import.meta.glob is a COMPILE-TIME transform, so it has to appear literally.
 * Assigning it to a variable first and calling that produces "glob is not a
 * function" at runtime, because by then there is nothing left to transform. */
const RAW_FIXTURES = import.meta.glob('./*.ts', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

const RAW_CONSUMERS = import.meta.glob('../{BoardView.tsx,hooks/useBoardSource.ts}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1)

/** Fixture module sources, keyed by file name, excluding the manifest and tests. */
const FIXTURE_SOURCES: Array<[string, string]> = Object.entries(RAW_FIXTURES)
  .map(([path, src]) => [basename(path), src] as [string, string])
  .filter(([name]) => name !== 'index.ts' && !name.endsWith('.test.ts'))

const MANIFEST_SRC: string =
  Object.entries(RAW_FIXTURES).find(([p]) => basename(p) === 'index.ts')?.[1] ?? ''

async function load(entry: FixtureEntry) {
  return validateBoard(await entry.load())
}

describe('the fixture manifest covers the required scenarios', () => {
  it('declares at least 24 fixtures', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(24)
  })

  it('claims every required scenario at least once', () => {
    const claimed = new Set(FIXTURES.flatMap((f) => f.scenarios))
    const missing = REQUIRED_SCENARIOS.filter((s) => !claimed.has(s))
    expect(missing, `scenarios with no fixture: ${missing.join(', ')}`).toEqual([])
  })

  it('gives every fixture a unique id', () => {
    const ids = FIXTURES.map((f) => f.id)
    expect(ids).toHaveLength(new Set(ids).size)
  })

  it('covers all eight subjects the milestone names', () => {
    const subjects = new Set(FIXTURES.map((f) => f.subject))
    for (const s of ['mathematics', 'physics', 'chemistry', 'biology', 'history', 'geography', 'economics', 'data']) {
      expect(subjects.has(s as never), `no fixture for ${s}`).toBe(true)
    }
  })

  it('does not claim a scenario twice as a primary', () => {
    /* Two fixtures may both mention a scenario, but the FIRST tag is the one
     * the gallery presents as what this board is for. Two boards claiming the
     * same primary means one of them is unlabelled in practice. */
    const primaries = FIXTURES.map((f) => f.scenarios[0]).filter(Boolean)
    expect(primaries).toHaveLength(new Set(primaries).size)
  })
})

describe('every fixture validates exactly as the manifest declares', () => {
  it.each(FIXTURES.map((f) => [f.id, f] as const))(
    '%s',
    async (_id, entry) => {
      const r = await load(entry)
      expect(r.status).toBe(entry.expect)

      if (entry.expect === 'ok') {
        /* The whole point of the 'ok' declaration: nothing was repaired,
         * truncated, dropped or downgraded. If 'repaired' is ever allowed to
         * pass as clean, 'repaired' stops meaning anything. */
        expect(r.notices, `${entry.id} should validate silently`).toEqual([])
      } else {
        /* A repair or a refusal the learner cannot see is a silent failure. */
        expect(r.notices.length, `${entry.id} must say what it changed`).toBeGreaterThan(0)
      }

      if (r.status === 'failed') {
        expect(r.error.trim().length).toBeGreaterThan(0)
      } else {
        expect(r.board.metadata?.source).toBe('fixture')
      }
    },
  )
})

describe('every fixture reaches the screen through the same renderer', () => {
  const renderable = FIXTURES.filter((f) => f.expect !== 'failed')

  it.each(renderable.map((f) => [f.id, f] as const))(
    '%s compiles into steps whose every block the registry can draw',
    async (_id, entry) => {
      const r = await load(entry)
      if (r.status === 'failed') throw new Error('unexpected fail')
      if (r.board.blocks.length === 0) return // the empty board is a valid state

      const plan = planFromBoard(r.board)
      const known = new Set(registeredTypes())
      let steps = 0
      let blocks = 0

      /* Drain the plan the way the session does — one step at a time, until
       * it says there are no more. A plan that never ends would hang here,
       * which is a failure worth having. */
      for (let guard = 0; guard < 200; guard += 1) {
        const step = await plan.nextStep()
        if (!step) break
        steps += 1
        expect(step.blocks.length, `${entry.id} step ${steps} had no blocks`).toBeGreaterThan(0)
        for (const b of step.blocks) {
          blocks += 1
          /* 'unknown' is a real, registered outcome — the placeholder for a
           * type this build cannot draw. Anything else outside the registry
           * would mean content chose a component.
           *
           * The comparison goes through String() because TeachingStep declares
           * its blocks as Block[], which does not include the unknown
           * placeholder even though a validated board can genuinely carry one.
           * The runtime is wider than the type here; the test checks the
           * runtime. */
          const type = String(b.type)
          expect(known.has(type as never) || type === 'unknown',
            `${entry.id} block ${b.id} has type ${type}, which the registry cannot draw`).toBe(true)
          expect(resolve(b.type).Component).toBeTruthy()
        }
      }

      expect(steps, `${entry.id} produced no teaching steps`).toBeGreaterThan(0)
      expect(blocks).toBeGreaterThan(0)
    },
  )
})

describe('no fixture is loaded before it is asked for', () => {
  it('sees the fixture modules on disk at all', () => {
    /* If the glob ever returns nothing, every scan below would pass while
     * checking nothing. Assert the instrument works before trusting it. */
    expect(FIXTURE_SOURCES.length).toBeGreaterThan(20)
    expect(MANIFEST_SRC.length).toBeGreaterThan(0)
  })

  it('imports nothing but types at the top of the manifest', () => {
    /* A single static `import { X } from './some-fixture'` would pull every
     * transitively reachable fixture into the entry chunk, and the loading
     * boundary the picker shows would become theatre. */
    const staticImports = MANIFEST_SRC
      .split('\n')
      .filter((line) => /^import\s/.test(line.trim()))
    expect(staticImports.length).toBeGreaterThan(0)
    for (const line of staticImports) {
      expect(line.trim().startsWith('import type '), `manifest static import: ${line.trim()}`).toBe(true)
    }
  })

  it('reaches every fixture module through a dynamic import thunk', () => {
    for (const [file] of FIXTURE_SOURCES) {
      const mod = file.replace(/\.ts$/, '')
      expect(MANIFEST_SRC.includes(`import('./${mod}')`),
        `${mod} is on disk but the manifest never dynamically imports it`).toBe(true)
    }
  })

  it('has exactly as many entries as there are fixture modules', () => {
    /* Catches both directions: an orphaned file nobody can reach, and a
     * manifest entry pointing at a module that no longer exists. */
    expect(FIXTURES.length).toBe(FIXTURE_SOURCES.length)
  })

  it('keeps the app off the fixture modules — the manifest is the only door', () => {
    const consumers = Object.entries(RAW_CONSUMERS)
    expect(consumers.length).toBe(2)
    for (const [path, src] of consumers) {
      expect(/from ['"][^'"]*fixtures\/[a-z0-9-]+['"]/i.test(src),
        `${path} imports a fixture module directly instead of going through the manifest`).toBe(false)
    }
  })

  it('keeps fixtures as data — no fixture module imports React', () => {
    for (const [file, src] of FIXTURE_SOURCES) {
      expect(/from ['"]react['"]/.test(src), `${file} imports React`).toBe(false)
      /* A fixture is content. If one ever needs a component, the block type is
       * missing from the catalogue and that is the thing to fix. */
      expect(src.includes('React.createElement'), `${file} builds elements`).toBe(false)
    }
  })
})

describe('fixtures are deterministic', () => {
  it('uses no clock and no randomness', () => {
    /* A fixture that varies between runs makes every comparison downstream —
     * layout determinism, snapshot, zero-notice — untrustworthy.
     *
     * The patterns match a CALL, not a mention: a comment explaining that a
     * fixture deliberately avoids Math.random is the opposite of a violation,
     * and a scan that failed on it would train people to stop writing the
     * explanation. */
    for (const [file, src] of FIXTURE_SOURCES) {
      expect(/Math\.random\s*\(/.test(src), `${file} calls Math.random`).toBe(false)
      expect(/new Date\s*\(|Date\.now\s*\(/.test(src), `${file} reads the clock`).toBe(false)
    }
  })

  it('produces identical validation output when loaded twice', async () => {
    for (const entry of FIXTURES) {
      const [a, b] = [await load(entry), await load(entry)]
      expect(JSON.stringify(a), `${entry.id} differs between loads`).toBe(JSON.stringify(b))
    }
  })
})
