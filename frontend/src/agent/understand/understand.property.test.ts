import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import type { Turn } from '../kernel/contracts'
import { PATTERNS, understand } from './understand'

/*
 * POINTING FROM THE INPUT SPACE INWARD, WHICH ALMOST NOTHING HERE DOES.
 *
 * Across 8,860 tests the input box has seen eight distinct strings, every one a
 * well-formed question or answer. The tests were written from the code, so they
 * can only agree with it. `understand` is the widest free-text entry point in
 * the product and had no property test at all.
 *
 * WHY A COUNTER, AND WHY IT IS NOT OPTIONAL
 * -----------------------------------------
 * A property test fails silently in a way an example test cannot: if the
 * interesting branch is never reached, fast-check still reports 1,000 passing
 * runs and the suite goes green having proved nothing.
 *
 * That is not hypothetical here. The first version of the `unclear` test in
 * `TeachView.test.tsx` counted calls to `askPort` and PASSED before the fix --
 * not because the behaviour was right, but because `lessonResolver` answers
 * first and the escalation port is never reached at all. The precondition was
 * unsatisfiable, so the assertion was never evaluated.
 *
 * `scripts/check_vacuity.py` already names this and gates on it:
 *
 *     Gate: reject specs whose precondition is (almost) never satisfiable.
 *     FLOOR = 0.01
 *     ❌ vacuous — precondition holds for {rate:.2%} of inputs
 *
 * The same idea, in TypeScript: count how often the branch under test was
 * actually reached, print the rate, and fail below a floor. A property whose
 * precondition never holds is not a passing test; it is an untested claim.
 *
 * WHY `oneof` AND NOT `filter`
 * ---------------------------
 * A restrictive `.filter` makes fast-check discard nearly everything and still
 * report success -- the same vacuity by a different route. `fc.oneof` biases
 * toward known-nasty input while leaving true generation reachable, so the
 * tenth case nobody thought of can still appear. `constantFrom` alone would be
 * an enumeration wearing property-test clothes: nine hand-picked strings, which
 * is the eight-string problem one layer up.
 */

/**
 * Below this, the branch under test was effectively never reached. Copied from
 * `scripts/check_vacuity.py`, which uses the same floor for the same reason.
 *
 * MEASURED MARGIN, so nobody has to rediscover it: three runs of the confident-
 * intent property reached 3.20%, 2.70% and 1.70%. That is two to three times
 * the floor, not ten -- the rate is carried almost entirely by the handful of
 * NASTY entries that trip a pattern, since random unicode essentially never
 * does. If this ever fails at ~1%, the fix is MORE inputs that reach the branch,
 * never a lower floor: lowering it is how the guard stops guarding.
 */

/**
 * Law A's floor. NOT a vacuity floor -- it is a claim that the grammar still
 * speaks the classifier's language.
 *
 * THE WHOLE HISTORY OF THIS NUMBER, because every step of it was wrong in a way
 * the one before could not see:
 *
 *   noise only                                2.5% +/- 0.6   (3 runs)
 *   + hand-written phrases                    8.9% +/- 1.0   (4 runs)
 *   + vocabulary from the WRONG regexes      14.8%, then 10.3% when stacked
 *   + vocabulary imported from PATTERNS      57.8% +/- 1.3   (3 runs)
 *
 * The third row is the instructive one: stacking more of the wrong words made
 * the number go DOWN, which is what said the model behind it was wrong rather
 * than merely weak.
 *
 * 90% was the target and 58% is what this reaches. Going higher means removing
 * the random filler and the shuffled arrangement -- the two things that stop it
 * being a template -- so the honest figure is recorded instead of the intended
 * one. Set at 0.35: comfortably under 57.8 +/- 1.3, and four times the ~9% the
 * hand-written phrases managed, so a real collapse cannot hide inside variance.
 */
const VOCAB_FLOOR = 0.35

/**
 * Law B's CEILING, and a low number here is the RESULT rather than a weakness.
 *
 * Measured 2.0% / 2.0% / 2.0% over three runs -- mean 2.0% +/- 0.0. Junk almost
 * never talks this classifier into a confident reading, which is precisely what
 * "not credulous" looks like.
 *
 * Set at 0.15 with room, because the alarm is for a COLLAPSE and not for drift:
 * if random unicode ever starts claiming confidence at scale, the classifier
 * has broken open and begun agreeing with anything. Averaging this together
 * with Law A would have hidden that entirely -- one number cannot say both
 * "the grammar still works" and "noise still fails".
 */
const CREDULITY_CEILING = 0.15

/** Known-nasty, as a BIAS only -- `oneof` still draws true strings most of the
 *  time. Never the sole source, or this stops being a property. */
const NASTY = fc.constantFrom(
  'hi',
  'ok',
  'asdf',
  '???',
  '👍',
  'مرحبا',
  '',
  '   ',
  'a'.repeat(5_000),
  'search for',
  'what',
  '\u0000', // NUL, escaped: `extreme.test.ts` refuses a raw control byte in source
)

/*
 * `fc.fullUnicodeString()` DOES NOT EXIST IN fast-check 4.4.0 -- it was removed
 * in v4, and reaching for it fails at collection time with
 * `default.fullUnicodeString is not a function`, which reports as "no tests"
 * rather than as an error. The v4 spelling is `string({ unit })`:
 *
 *   grapheme  what a person types -- emoji, combining marks, real clusters
 *   binary    hostile -- lone surrogates and astral-plane code points
 *
 * Both, plus the nasty bias. Sampled to confirm before use rather than trusted
 * from memory.
 */
/*
 * A GRAMMAR OVER THE CODE'S OWN VOCABULARY, NOT A LIST OF SENTENCES.
 *
 * THE HISTORY OF THIS NUMBER, because it is the whole story of the file:
 *
 *   noise only                    2.5% +/- 0.6   (3 runs)
 *   + hand-written phrases        8.9% +/- 1.0   (4 runs)
 *   + this grammar                see VOCAB REACH below
 *
 * The middle step was still an enumeration wearing a costume: the reach was
 * carried by a handful of phrases a person typed, so the law was being proved
 * by them and by nothing else. Weighting cannot fix that -- weighting only
 * changes how often you draw from a generator that reaches a third of the time.
 *
 * So the TOKENS come from the product and the ARRANGEMENT is generated. They
 * are read out of `understand.ts` at test time rather than copied, exactly as
 * `canvas/teach/ruleCensus.ts` reads `teaching.ts` for its rule names: a mirror
 * would drift the first time somebody edits a pattern, and drift here is
 * silent -- the generator would keep passing while testing vocabulary the
 * product no longer recognises.
 *
 * Nobody wrote any individual case. The bugs live in the arrangements, not in
 * the words.
 */
/**
 * The word alternatives out of one pattern's regex, cleaned of regex syntax.
 *
 * `\b` is stripped FIRST and as a unit. Removing backslashes before it turns
 * `\bwhat is` into `bwhat is` -- a token that matches nothing, inside a
 * generator that would still have looked like it was working.
 */
function wordsIn(source: string): readonly string[] {
  const out = new Set<string>()
  for (const piece of source.split('|')) {
    const word = piece
      .replace(/\\b/g, '')
      .replace(/[\\()[\]?:^$*+.]/g, '')
      .trim()
    if (/^[a-z][a-z' -]*$/i.test(word) && word.length > 2) out.add(word)
  }
  return [...out]
}

/**
 * The vocabulary that drives confidence, grouped by the intent it votes for.
 *
 * IMPORTED, NEVER COPIED. `PATTERNS` is read straight off the module, so the
 * day somebody edits a pattern this generator changes with it. A pasted list
 * would be a dead map -- the code's vocabulary moves, the copy does not, and
 * the test goes on passing against words nothing uses. That failure is silent,
 * which is what makes the export worth it.
 *
 * The tokens are derived from `test.source` rather than from a separate array.
 * Rewriting all 40 patterns into token lists cannot be done without changing
 * behaviour: several carry `\d`, lookarounds and nested groups a flat list
 * cannot express, and quietly altering how a turn is classified is a far worse
 * trade than deriving from the live object. The guarantee that matters -- no
 * copy, no drift -- holds either way.
 *
 * AND THE FIRST VERSION READ THE WRONG THING ENTIRELY. It took `FRESHNESS`,
 * `CODE`, `SIDE_EFFECT` and `HINGLISH`, which are flags used elsewhere and
 * contribute no score at all. Confidence is
 * `(score / total) * (1 - exp(-total / 6))`, and every point of `score` comes
 * from here. Generating from the others produced text the classifier
 * recognised and never grew confident about: 14.8%, then 10.3% when more of
 * the same was stacked. A number moving the wrong way is the signal that the
 * model behind it is wrong.
 *
 * Grouped BY KIND because of that formula: confidence needs one intent to
 * dominate the share AND the total to be large. Tokens from different intents
 * split the score and suppress both.
 */
const VOCABULARY: ReadonlyMap<string, readonly string[]> = (() => {
  const byKind = new Map<string, Set<string>>()
  for (const pattern of PATTERNS) {
    const existing = byKind.get(pattern.kind) ?? new Set<string>()
    for (const word of wordsIn(pattern.test.source)) existing.add(word)
    byKind.set(pattern.kind, existing)
  }
  return new Map([...byKind].map(([kind, words]) => [kind, [...words]]))
})()

/** Intents with enough vocabulary to compose from. */
const KINDS = [...VOCABULARY.entries()].filter(([, words]) => words.length >= 3)

/** Nouns to hang the vocabulary on. Generic on purpose: the pattern is what the
 *  classifier reads, and a topic word only has to be somewhere. */
const TOPIC = fc.constantFrom(
  'the notes', 'my file', 'this', 'the build', 'that error', 'it',
  'the graph', 'my session', 'recursion', 'the weather',
)

/** Filler and punctuation, generated, so no two cases arrive alike. */
const FILLER = fc.oneof(fc.constant(''), fc.string({ unit: 'grapheme', maxLength: 12 }))
const PUNCT = fc.constantFrom('', '?', '!', '...', '.', ' ??')

/*
 * COMPOSED FROM ONE INTENT'S VOCABULARY, WITH EVERYTHING ELSE GENERATED.
 *
 * Still a grammar, not a list: the intent is chosen, its tokens are chosen, how
 * many arrive, in what order, with which topic, filler and punctuation are all
 * generated. Nobody wrote any individual case. Enumeration is a fixed set of
 * complete inputs; this is a vocabulary the product owns and arrangements
 * nobody has seen.
 */
const VOCAB_ARM = fc
  .constantFrom(...(KINDS.length > 0 ? KINDS : ([['explanation', ['what is']]] as const)))
  .chain(([, words]) =>
    fc.tuple(
      fc.array(fc.constantFrom(...words), { minLength: 3, maxLength: 5 }),
      TOPIC,
      FILLER,
      PUNCT,
    ),
  )
  .map(
    ([tokens, topic, filler, punct]) =>
      `${[...tokens, topic, filler].join(' ').replace(/\s+/g, ' ').trim()}${punct}`,
  )

/*
 * `fc.fullUnicodeString()` does not exist in fast-check 4.4.0 -- removed in v4,
 * and it fails at COLLECTION time, which vitest reports as "no tests": a file
 * that silently never runs. `string({ unit })` is the v4 spelling.
 *
 * THE NOISE ARMS ARE KEPT SEPARATE AND UNWEIGHTED. They are the patrol -- they
 * are what found a lone Samaritan letter in the sibling file -- and their job
 * is Law B below, where a LOW reach is the correct result rather than a
 * weakness.
 */
const NOISE = fc.oneof(fc.string({ unit: 'grapheme' }), fc.string({ unit: 'binary' }), NASTY)

/** Everything, for the laws that have no precondition at all. */
const ANY_TEXT = fc.oneof(NOISE, VOCAB_ARM)

function turnOf(text: string): Turn {
  return { parts: [{ modality: 'text', content: text }], at: '2026-01-01T00:00:00.000Z' }
}


describe('understand, against input nobody wrote down', () => {
  it('never throws, whatever arrives', () => {
    /*
     * The widest law, and the cheapest. Everything downstream assumes this
     * returns; a throw here takes the turn down before any recovery path can
     * run. No precondition, so no vacuity counter is needed.
     */
    fc.assert(
      fc.property(ANY_TEXT, (text) => {
        expect(() => understand(turnOf(text))).not.toThrow()
      }),
      { numRuns: 1_000 },
    )
  })

  it('LAW A: when it claims confidence, there is always a reason', () => {
    /*
     * The law tested HARD, against input built from the product's own
     * vocabulary. `Intent.confidence` is documented as driving the uncertainty
     * layer -- "a low score is a reason to ask" -- so a high score with nothing
     * recorded behind it is a verdict with no evidence, which is the one thing
     * this whole plan is about.
     *
     * The floor here is not the vacuity floor. It is a claim that the GRAMMAR
     * still works: if this drops from ~90% to 40%, the patterns in
     * `understand.ts` moved and the generator is no longer speaking the same
     * language as the classifier. That is a real signal and it should go red.
     */
    let confident = 0
    let total = 0

    fc.assert(
      fc.property(VOCAB_ARM, (text) => {
        total += 1
        const top = understand(turnOf(text)).intents[0]
        if (top === undefined || top.confidence <= 0.5) return
        confident += 1
        expect(
          top.because.trim(),
          `claimed ${String(top.kind)} at ${String(top.confidence)} for ` +
            `${JSON.stringify(text.slice(0, 60))} with no reason recorded`,
        ).not.toBe('')
      }),
      { numRuns: 1_000 },
    )

    const rate = total === 0 ? 0 : confident / total
    console.log(`LAW A — vocabulary reached confidence in ${(rate * 100).toFixed(2)}% of inputs`)
    expect(
      rate,
      `the vocabulary grammar reached confidence for only ${(rate * 100).toFixed(2)}% of ` +
        `inputs. It is composed from the patterns in understand.ts, so a collapse ` +
        `here means those patterns moved and this generator is testing a language ` +
        `the classifier no longer speaks.`,
    ).toBeGreaterThanOrEqual(VOCAB_FLOOR)
  })

  it('LAW B: junk does not talk it into confidence', () => {
    /*
     * THE PATROL, and its low number is the RESULT rather than a weakness.
     *
     * Law A proves that a confident verdict always carries a reason. It cannot
     * prove the classifier is not credulous, because everything it feeds in is
     * built to be recognised. Only noise can answer that, and noise reaching
     * the branch rarely is exactly what "not credulous" looks like.
     *
     * SO THIS ASSERTS A CEILING, NOT A FLOOR. If random unicode ever starts
     * claiming confidence at scale, the classifier has broken open and begun
     * agreeing with anything -- an alarm that merging these two laws into one
     * average would have hidden completely.
     */
    let confident = 0
    let total = 0

    fc.assert(
      fc.property(NOISE, (text) => {
        total += 1
        const top = understand(turnOf(text)).intents[0]
        if (top === undefined || top.confidence <= 0.5) return
        confident += 1
        expect(
          top.because.trim(),
          `claimed ${String(top.kind)} at ${String(top.confidence)} for junk ` +
            `${JSON.stringify(text.slice(0, 60))} with no reason recorded`,
        ).not.toBe('')
      }),
      { numRuns: 1_000 },
    )

    const rate = total === 0 ? 0 : confident / total
    console.log(`LAW B — junk reached confidence in ${(rate * 100).toFixed(2)}% of inputs`)
    expect(
      rate,
      `random junk talked the classifier into a confident intent ` +
        `${(rate * 100).toFixed(2)}% of the time. It has become credulous: a ` +
        `confident reading of noise is a verdict with nothing behind it.`,
    ).toBeLessThanOrEqual(CREDULITY_CEILING)
  })

  it('does not claim research on "search for" with no reason -- regression', () => {
    /*
     * THE COUNTEREXAMPLE, PROMOTED. Mutating `understand.ts:665` to emit
     * `because: ""` was killed by the property above with:
     *
     *   Counterexample: ["search for"]
     *   claimed research at 0.5654017914929218 for "search for" with no reason
     *
     * The property proves the CLASS and will keep finding new members of it.
     * This proves THIS one never comes back, and it reads as a named failure in
     * a diff a year from now rather than as a seed nobody can reproduce.
     * Both, not either.
     */
    const top = understand(turnOf('search for')).intents[0]
    expect(top).toBeDefined()
    if (top === undefined) return
    expect(top.confidence, 'the fixture stopped reaching the branch it guards').toBeGreaterThan(0.5)
    expect(top.because.trim(), 'a confident intent carried no reason').not.toBe('')
  })

  it('always returns at least one intent, as its own contract promises', () => {
    /*
     * `contracts.ts` says of `intents`: "Ordered by confidence, highest first.
     * Never empty." An empty list would make `intents[0]` undefined for every
     * caller, and the type does not say optional -- so this is the contract
     * asserted rather than assumed.
     */
    fc.assert(
      fc.property(ANY_TEXT, (text) => {
        expect(understand(turnOf(text)).intents.length).toBeGreaterThan(0)
      }),
      { numRuns: 1_000 },
    )
  })
})
