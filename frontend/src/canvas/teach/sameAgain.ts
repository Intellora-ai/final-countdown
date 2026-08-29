/**
 * NEAR-DUPLICATE DETECTION -- the same lesson is never shipped twice.
 *
 * Shannon: a message the receiver could have predicted carries zero
 * information. A learner who has already read an explanation gains nothing from
 * reading it again, so re-shipping it is shipping nothing while charging the
 * learner for their attention.
 *
 * WHY THIS IS NOT A GATE RULE IN `teaching.ts`
 * -------------------------------------------
 * `CONSTRAINTS.md`: "a model optimising against a long rule list produces
 * output that passes and does not teach." Beyond that, the gate could not host
 * this check even if it were allowed to: `checkTeaching` is handed ONE lesson,
 * and duplication is a property of a PAIR. So this is a function the author
 * calls, and its answer is actionable -- if it says duplicate, re-author on a
 * fresh axis from `route.ts` rather than refuse.
 *
 * WHY IT MUST NOT FIRE ON A REROUTE
 * ---------------------------------
 * `route.ts` exists to teach the same truth twelve different ways. Flagging
 * that is not a false positive with a tuning fix, it is the mechanism working
 * backwards. A detector asserted only to reject is satisfied by `return true`,
 * so both directions are pinned in `sameAgain.test.ts`.
 *
 * PURE AND DETERMINISTIC, for the same reason `plan()` and `beats()` are: the
 * same inputs must give the same answer, or a learner re-asking a question gets
 * a different verdict for no reason anyone can name. No clock, no
 * `Math.random()`, no network, no embeddings.
 */

/**
 * Shingle width, in words.
 *
 * ONE is a bag of words: two lessons on the same topic share their whole
 * vocabulary, so every reroute scores as a duplicate. FIVE is nearly exact
 * matching: reordering a single clause breaks five shingles at once and a
 * lightly retouched copy walks straight through.
 *
 * THREE is the standard near-duplicate width and it is what the fixtures
 * measure at: reworded 0.75, rerouted 0.00. That is the gap the threshold sits
 * in, and it was measured, not assumed.
 */
const SHINGLE = 3

/**
 * How many permutations the MinHash signature carries.
 *
 * The signature is a fixed-size stand-in for the shingle set, so a learner's
 * history costs 64 numbers per lesson instead of a growing pile of text. The
 * standard error of the estimate is about 1/sqrt(64) = 0.125, which is far
 * inside the 0.75 gap the fixtures measured. More permutations would buy
 * precision nothing here needs.
 */
const HASHES = 64

/**
 * Above this, the new lesson is the old one again.
 *
 * Placed in the measured gap, not at a round number that happened to work:
 * reworded scores 0.75 and rerouted 0.00, so 0.5 has roughly a fifth of the
 * gap either side of it. Both fixtures would have to move a long way before
 * the verdict flipped.
 */
const THRESHOLD = 0.5

export interface Duplicate {
  /** True when the learner has effectively read this lesson before. */
  readonly duplicate: boolean
  /** Estimated Jaccard similarity against the closest lesson already shown. */
  readonly similarity: number
  /** Index into `shown` of the closest lesson, or -1 when nothing was shown. */
  readonly matched: number
}

/**
 * Keys that name STRUCTURE rather than anything a learner reads.
 *
 * `id` and `kind` are the load-bearing ones. If they reached the shingles,
 * every lesson would share the tokens `prose`, `summary`, `chart`, and the
 * similarity floor would drift upward with lesson length -- quietly, and worst
 * on exactly the long lessons where a duplicate costs the most.
 */
const STRUCTURAL = new Set(['id', 'kind', 'model', 'key', 'from', 'to', 'target'])

/**
 * Every readable word in the lesson, lowercased, in document order.
 *
 * Deliberately a structural walk rather than a typed switch over the twelve
 * block kinds. A typed reader has to be edited every time a block gains a
 * caption field, and the failure when nobody edits it is SILENT: the new text
 * is simply not compared, and duplicates slip through on the newest block kind.
 * The walk reads whatever is there.
 */
export function readableText(lesson: unknown): readonly string[] {
  const words: string[] = []

  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      for (const word of node.toLowerCase().split(/[^a-z0-9]+/)) {
        if (word.length > 0) words.push(word)
      }
      return
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    if (node !== null && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        if (STRUCTURAL.has(key)) continue
        walk(value)
      }
    }
  }

  walk(lesson)
  return words
}

/**
 * FNV-1a, 32 bits, in the >>> 0 arithmetic JavaScript can actually do
 * exactly. Chosen because it is a handful of lines with no dependency and no
 * platform variation: the same string gives the same number on every machine
 * and in every version, which is what "deterministic" has to mean here.
 */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/** The set of distinct word-triples, as hashes. Order within the set is lost. */
function shingles(lesson: unknown): Set<number> {
  const words = readableText(lesson)
  const set = new Set<number>()
  /*
   * A lesson shorter than one shingle would otherwise produce the EMPTY set,
   * and two empty sets compare as similarity 1 under any Jaccard convention
   * you pick -- so a pair of near-empty lessons would read as duplicates of
   * each other. Falling back to the whole text keeps every lesson signed.
   */
  if (words.length < SHINGLE) {
    if (words.length > 0) set.add(fnv1a(words.join(' ')))
    return set
  }
  for (let i = 0; i + SHINGLE <= words.length; i += 1) {
    set.add(fnv1a(words.slice(i, i + SHINGLE).join(' ')))
  }
  return set
}

/**
 * The MinHash signature: for each of 64 permutations, the smallest hash any
 * shingle takes under it.
 *
 * The permutations are `hash * a + b` with constants derived from the
 * permutation index, so the family is fixed in the source rather than seeded at
 * runtime. A seeded family would make yesterday's stored signatures
 * incomparable with today's, which is the same bug as having no memory at all.
 */
export function signature(lesson: unknown): readonly number[] {
  const set = shingles(lesson)
  const mins: number[] = []
  for (let h = 0; h < HASHES; h += 1) {
    const a = Math.imul(h, 0x9e3779b1) | 1
    const b = Math.imul(h + 1, 0x85ebca6b) >>> 0
    let min = 0xffffffff
    for (const shingle of set) {
      const permuted = (Math.imul(shingle, a) + b) >>> 0
      if (permuted < min) min = permuted
    }
    mins.push(min)
  }
  return mins
}

/** Fraction of permutations on which two signatures agree = estimated Jaccard. */
function agreement(left: readonly number[], right: readonly number[]): number {
  let same = 0
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] === right[i]) same += 1
  }
  return same / left.length
}

/**
 * Has this learner effectively read this lesson already?
 *
 * `shown` is the lessons they have been given, in any order; the verdict names
 * the CLOSEST one so the caller can say which explanation is being repeated
 * rather than only that something is.
 */
export function sameAgain(fresh: unknown, shown: readonly unknown[]): Duplicate {
  if (shown.length === 0) return { duplicate: false, similarity: 0, matched: -1 }

  const freshSignature = signature(fresh)
  let best = 0
  let matched = -1

  for (let i = 0; i < shown.length; i += 1) {
    const score = agreement(freshSignature, signature(shown[i]))
    if (score > best) {
      best = score
      matched = i
    }
  }

  return { duplicate: best >= THRESHOLD, similarity: best, matched: best >= THRESHOLD ? matched : -1 }
}
