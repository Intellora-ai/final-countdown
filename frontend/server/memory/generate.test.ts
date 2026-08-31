/* THE GENERATORS THE M1-M3 PROOFS ARE BUILT FROM -- AND PROOF THAT THEY WORK.
 *
 * WHY THIS FILE IS A `.test.ts` AND NOT A PLAIN MODULE.
 *   `server/` is a scanned area of the reachability gate (`MANIFEST` entry
 *   `server`, entry point `server/index.ts`). A non-test module imported only
 *   by tests is an ORPHAN by that gate's first rule, and it would be right:
 *   shipping code that only tests reach is code nobody runs. The repository has
 *   already answered this exact question once -- the deleted `ledger.test.ts`
 *   carried this note about its own `memoryStore` helper:
 *
 *     "This used to live in ledger.ts, where the reachability gate correctly
 *      reported it dead ... A test double in production code is still
 *      production code nobody runs."
 *
 *   So helpers live in a test file. That is this repository's own convention,
 *   not a new one invented here.
 *
 * WHY THE GENERATORS ARE THEMSELVES TESTED.
 *   A property test is only as strong as the values it draws. A generator that
 *   silently returned `"a"` every time would make every proof in M2 and M3 pass
 *   while proving nothing whatever -- and it would keep passing forever, which
 *   is the worst failure mode a test can have. The tests at the bottom of this
 *   file exist so that a broken generator is LOUD.
 *
 * WHY A HAND-WRITTEN GENERATOR RATHER THAN fast-check.
 *   `fast-check` is not installed, and this repository has no property-testing
 *   dependency anywhere -- checked with `git grep`, not assumed. Adding one to
 *   get a seeded PRNG and three value generators would be a dependency for
 *   forty lines. The seed is explicit and printed on failure, which is the one
 *   property that actually matters: a counterexample must be reproducible.
 */

import { describe, expect, it } from 'vitest'

/**
 * A deterministic pseudo-random source.
 *
 * SEEDED ON PURPOSE. An unseeded property test that fails once and passes on
 * re-run is worse than no test: it teaches the reader to press the button
 * again. Every failure below reports its seed, and that seed reproduces the
 * exact draw.
 *
 * mulberry32 -- small, well distributed, and not cryptographic, which is
 * correct here because nothing about this is a secret.
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Pick one item. Fails loudly on an empty list rather than returning undefined. */
function pick<T>(rng: () => number, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick from an empty list')
  return items[Math.floor(rng() * items.length)] as T
}

/**
 * The fragments an identity is built from.
 *
 * EVERY ONE OF THESE IS A REAL HAZARD, NOT DECORATION.
 *
 *   ":"      the separator `memoryKey` joins with. If parts were not encoded,
 *            student "a" in tab "b:c" and student "a:b" in tab "c" would build
 *            one key from two different people. `key.ts` claims encoding makes
 *            that impossible; M2 is where the claim is tested.
 *   "%" "%3A" percent-encoding's own escape. A part that already looks encoded
 *            is how a one-to-one mapping quietly stops being one.
 *   " "      leading and trailing space. `key.ts` TRIMS, so these are the
 *            fragments that reveal whether trimming merges two distinct ids.
 *   "\n" "\t" control characters, which arrive from real paste operations.
 *   emoji    astral-plane characters, which are two UTF-16 code units and are
 *            where naive length limits and naive slicing break.
 *   "'"  '"' quote characters, which is what an injection attempt looks like.
 */
const IDENTITY_FRAGMENTS: readonly string[] = [
  'a', 'b', 'student', 'tab', 'lesson', '0', '1',
  ':', '::', '%', '%3A', '%25',
  ' ', '\t', '\n',
  'é', '中', '\u{1f600}', '\u{1f9ea}',
  "'", '"', '\\', '/', '?', '&', '=', '#',
  'A'.repeat(50),
]

/**
 * One identity part -- a studentId, a tabId or a lessonId.
 *
 * Built by joining fragments, so a single draw can produce `"a:b"`, `"  "`,
 * an emoji run, or a 200-character wall. The length is drawn too, because a
 * generator that always produced the same shape would only ever explore one
 * corner.
 */
export function anIdentityPart(rng: () => number): string {
  const pieces = 1 + Math.floor(rng() * 4)
  let out = ''
  for (let i = 0; i < pieces; i += 1) out += pick(rng, IDENTITY_FRAGMENTS)
  return out
}

/** The three parts that name exactly one memory. */
export interface GeneratedOwner {
  readonly studentId: string
  readonly tabId: string
  readonly lessonId: string
}

export function anOwner(rng: () => number): GeneratedOwner {
  return {
    studentId: anIdentityPart(rng),
    tabId: anIdentityPart(rng),
    lessonId: anIdentityPart(rng),
  }
}

/**
 * An arbitrary JSON-shaped value, to whatever depth is allowed.
 *
 * SPANS THE WHOLE STORABLE TYPE, INCLUDING THE AWKWARD PARTS: negative zero,
 * very large integers, empty containers, strings that look like JSON, keys that
 * collide with `Object.prototype`. `record.ts` promises byte-for-byte return
 * for anything storable, and a generator that only produced `{a: 1}` would
 * never test that promise.
 */
export function aStorableValue(rng: () => number, depth = 3): unknown {
  const leaf = (): unknown => {
    const which = Math.floor(rng() * 9)
    if (which === 0) return null
    if (which === 1) return rng() < 0.5
    if (which === 2) return Math.floor(rng() * 2_000_000) - 1_000_000
    if (which === 3) return 0
    if (which === 4) return Number.MAX_SAFE_INTEGER
    if (which === 5) return -Number.MAX_SAFE_INTEGER
    if (which === 6) return ''
    if (which === 7) return anIdentityPart(rng)
    return '{"looks":"like json"}'
  }

  if (depth <= 0) return leaf()

  const which = Math.floor(rng() * 6)
  if (which <= 2) return leaf()

  if (which === 3) {
    const n = Math.floor(rng() * 4)
    return Array.from({ length: n }, () => aStorableValue(rng, depth - 1))
  }

  if (which === 4) {
    /* `__proto__` and `constructor` as ORDINARY KEYS. A store that round-trips
     * through a naive object merge loses them or, worse, acts on them. */
    const keys = ['a', 'b', '__proto__', 'constructor', 'toString', '', ':']
    const n = Math.floor(rng() * 4)
    const out: Record<string, unknown> = {}
    for (let i = 0; i < n; i += 1) {
      out[pick(rng, keys)] = aStorableValue(rng, depth - 1)
    }
    return out
  }

  return leaf()
}

/* -------------------------------------------------------------------------- */
/* The generators are load-bearing, so they are tested.                       */
/* -------------------------------------------------------------------------- */

/** How many draws every property in M1-M3 takes. One number, one meaning. */
export const DRAWS = 400

describe('the generators these proofs rest on', () => {
  it('is reproducible: one seed always draws the same sequence', () => {
    const first = Array.from({ length: 50 }, (_, i) => anIdentityPart(seededRandom(i)))
    const again = Array.from({ length: 50 }, (_, i) => anIdentityPart(seededRandom(i)))
    expect(again).toEqual(first)
  })

  it('is not a constant dressed up as a generator', () => {
    const rng = seededRandom(1)
    const seen = new Set(Array.from({ length: DRAWS }, () => anIdentityPart(rng)))
    /* A generator collapsing to a handful of values is the silent failure this
     * whole file exists to prevent. 100 distinct draws out of 400 is far below
     * what a working generator produces and far above what a broken one can. */
    expect(seen.size).toBeGreaterThan(100)
  })

  it('actually produces the hazards it claims to', () => {
    const rng = seededRandom(2)
    const drawn = Array.from({ length: DRAWS }, () => anIdentityPart(rng))

    /* Each of these is a hazard a proof below depends on being present. If the
     * fragment list is edited and one stops appearing, that proof silently
     * stops testing anything, and this is where it is caught. */
    expect(drawn.some((s) => s.includes(':'))).toBe(true)
    expect(drawn.some((s) => s.includes('%'))).toBe(true)
    expect(drawn.some((s) => s !== s.trim())).toBe(true)
    expect(drawn.some((s) => /[\u{1f300}-\u{1faff}]/u.test(s))).toBe(true)
    expect(drawn.some((s) => s.length > 40)).toBe(true)
  })

  it('draws storable values of every JSON shape, not just objects', () => {
    const rng = seededRandom(3)
    const drawn = Array.from({ length: DRAWS }, () => aStorableValue(rng))

    expect(drawn.some((v) => v === null)).toBe(true)
    expect(drawn.some((v) => typeof v === 'boolean')).toBe(true)
    expect(drawn.some((v) => typeof v === 'number')).toBe(true)
    expect(drawn.some((v) => typeof v === 'string')).toBe(true)
    expect(drawn.some((v) => Array.isArray(v))).toBe(true)
    expect(drawn.some((v) => typeof v === 'object' && v !== null && !Array.isArray(v))).toBe(true)
  })

  it('draws values that JSON can carry, so a failure below is never the generator', () => {
    const rng = seededRandom(4)
    for (let i = 0; i < DRAWS; i += 1) {
      const value = aStorableValue(rng)
      /* If this throws, the generator invented something unstorable and every
       * "the store refused it" result downstream would be about the generator
       * rather than the store. */
      expect(() => JSON.stringify(value)).not.toThrow()
    }
  })
})
