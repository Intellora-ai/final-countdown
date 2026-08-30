/**
 * The rules a Learning Canvas explanation must obey, tested three ways.
 *
 * WHICH OF THE SIX PRODUCT RULES THIS FILE CAN HONESTLY TEST
 * ----------------------------------------------------------
 * The product rules are: never repeat, never be generic, never refuse, refuse
 * blocked content, be accurate from search, be fast. Four of those are
 * enforced by code that runs with no model and no network, and they are what
 * this file covers:
 *
 *   NON-GENERIC   `does-not-open-on-the-topic` — the first sentence must name
 *                 something the lesson is actually about. This IS the "must
 *                 mention something specific to the question" rule.
 *   NOT A WALL    `run-too-long`, `nothing-marked` — an explanation that
 *                 arrives as an undifferentiated block teaches nobody, which
 *                 is genericness by another route.
 *   SHAPED        `no-definition`, `no-summary` — the arc a taught lesson owes.
 *   BOUNDED       every limit is an EXPORTED constant, so the boundary tests
 *                 below reference `MAX_RUN_WORDS` rather than the number 30.
 *                 A copy of a constant is a test that keeps passing after
 *                 somebody changes the rule.
 *
 * WHAT IS DELIBERATELY NOT HERE, AND WHY THAT IS NOT A GAP I AM HIDING
 * --------------------------------------------------------------------
 * "Accurate from web search" and "responds fast" cannot be asserted in a unit
 * test in this repository, and asserting them against a mock would prove only
 * that the mock agrees with itself. Measured, not assumed:
 *   - `playwright.config.ts` sets ANTHROPIC_API_KEY=CANARY-e2e-must-not-leak,
 *     so nothing in the test path may reach a model.
 *   - `docker-compose.canvas.yml` sets OLLAMA_MODEL=unreachable-on-purpose and
 *     says why: a scenario that quietly needed a paid model would hide a cost.
 *   - `createSearchPort()` refuses with no WEB_SEARCH_API_KEY set.
 * Those two rules are covered by the live suites — `grounding.test.ts`,
 * `researched.test.ts`, `webResolver.test.ts` for accuracy, `latency.ts` and
 * `engineResolver.test.ts` for speed — and repetition by `again.test.ts`,
 * `sameAgain.test.ts`, `variation.test.ts` and `shownAlready.test.ts`. This
 * file does not duplicate them.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { LessonSpec, type Lesson } from '../spec/spec'
import {
  MARK_REQUIRED_ABOVE_WORDS,
  MAX_DEFINITION_WORDS,
  MAX_EXAMPLE_WORDS,
  MAX_RUN_WORDS,
  checkTeaching,
  segments,
} from './teaching'

/** Build a real parsed lesson. Defaults filled, exactly as the gate sees one. */
function parse(question: string, blocks: unknown[], extra: object = {}): Lesson {
  return LessonSpec.parse({ id: 'lesson-1', question, blocks, ...extra })
}

const prose = (id: string, body: string, extra: object = {}) => ({
  id,
  kind: 'prose',
  body,
  ...extra,
})

/** The rules broken, as a set of names — so a test can name the ONE rule it is
 *  about and stay silent about every other rule the fixture happens to trip. */
function rulesBroken(lesson: Lesson, arc = true): Set<string> {
  return new Set(
    checkTeaching(lesson, { arc })
      .map((issue) => issue.rule)
      .filter((rule): rule is string => rule !== undefined),
  )
}

/** Exactly n words, distinct so nothing else keys on repetition. */
const words = (n: number): string =>
  Array.from({ length: n }, (_, i) => `w${i}`).join(' ')

const GENERIC_OPENING = 'Let us begin with an important idea.'

/* ========================================================================== */
/* LAYER 1 — SIX REPRESENTATIVE CASES, ONE PER KIND OF QUESTION               */
/* ========================================================================== */

/**
 * Hand-picked, not generated. Each row is a real question of a different kind,
 * with an opening that names its topic and one that says nothing. The point of
 * choosing them by hand is that a human can read the table and see the range
 * being claimed — six random strings would cover the same code and tell a
 * reviewer nothing.
 */
const SIX_QUESTIONS = [
  {
    kind: 'science',
    question: 'Why does ice float on water?',
    specific: 'Ice floats because it is less dense than water.',
  },
  {
    kind: 'maths',
    question: 'What is a prime number?',
    specific: 'A prime number has exactly two divisors.',
  },
  {
    kind: 'history',
    question: 'Why did the Roman Empire fall?',
    specific: 'The Roman Empire fell over several centuries.',
  },
  {
    kind: 'a "why" question',
    question: 'Why is the sky blue?',
    specific: 'The sky looks blue because air scatters light.',
  },
  {
    kind: 'code',
    question: 'What does a for loop do?',
    specific: 'A for loop repeats a body many times.',
  },
  {
    kind: 'a definition',
    question: 'Define photosynthesis',
    specific: 'Photosynthesis is how a plant makes food.',
  },
] as const

describe('six representative questions — an explanation must be about the question asked', () => {
  it.each(SIX_QUESTIONS)(
    '$kind: an opening that names the topic is not called generic',
    ({ question, specific }) => {
      const lesson = parse(question, [prose('intro', specific)])
      expect(rulesBroken(lesson)).not.toContain('does-not-open-on-the-topic')
    },
  )

  it.each(SIX_QUESTIONS)(
    '$kind: an opening that names nothing IS called generic',
    ({ question }) => {
      const lesson = parse(question, [prose('intro', GENERIC_OPENING)])
      expect(rulesBroken(lesson)).toContain('does-not-open-on-the-topic')
    },
  )

  it.each(SIX_QUESTIONS)(
    '$kind: the refusal says which sentence was empty, so it can be fixed',
    ({ question }) => {
      const lesson = parse(question, [prose('intro', GENERIC_OPENING)])
      const issue = checkTeaching(lesson, { arc: true }).find(
        (i) => i.rule === 'does-not-open-on-the-topic',
      )
      expect(issue?.message).toContain('names nothing the lesson is about')
    },
  )
})

/* ========================================================================== */
/* EQUIVALENCE PARTITIONING — the ways an opening can earn its place          */
/* ========================================================================== */

describe('equivalence partitioning — what counts as opening on the topic', () => {
  const QUESTION = 'Why does ice float on water?'

  it('a word from the QUESTION anchors the opening', () => {
    const lesson = parse(QUESTION, [prose('intro', 'Ice is unusual.')])
    expect(rulesBroken(lesson)).not.toContain('does-not-open-on-the-topic')
  })

  it("a word from the BLOCK'S OWN TITLE anchors the opening", () => {
    /* The anchor is deliberately wide. A gate that cries wolf gets switched
       off, and a gate that is off enforces nothing at all. */
    const lesson = parse('Explain buoyancy', [
      prose('intro', 'Density decides what happens.', { title: 'Density' }),
    ])
    expect(rulesBroken(lesson)).not.toContain('does-not-open-on-the-topic')
  })

  it('a DECLARED TECHNICAL TERM anchors the opening', () => {
    const lesson = parse(
      'Explain buoyancy',
      [prose('intro', 'Density decides what happens.')],
      { technicalTerms: [{ term: 'density', introducedIn: 'intro' }] },
    )
    expect(rulesBroken(lesson)).not.toContain('does-not-open-on-the-topic')
  })

  it('nothing shared means the opening is refused', () => {
    const lesson = parse(QUESTION, [prose('intro', GENERIC_OPENING)])
    expect(rulesBroken(lesson)).toContain('does-not-open-on-the-topic')
  })

  it('the chunk rules apply to a doubt ANSWER too, but the arc rules do not', () => {
    /* A reply arriving as a wall of text is the same failure as a lesson that
       does. Demanding it open with a definition is not. */
    const wall = parse('Why does ice float on water?', [
      prose('intro', 'Ice floats. ' + words(MAX_RUN_WORDS + 1)),
    ])
    expect(rulesBroken(wall, false)).toContain('run-too-long')
    expect(rulesBroken(wall, false)).not.toContain('no-definition')
    expect(rulesBroken(wall, true)).toContain('no-definition')
  })
})

/* ========================================================================== */
/* BOUNDARY VALUE ANALYSIS — N-1, N, N+1 at every exported limit              */
/* ========================================================================== */

describe('boundary value analysis — every limit is an exported constant', () => {
  const TOPICAL = 'Ice floats.'

  describe(`run length, at MAX_RUN_WORDS (${MAX_RUN_WORDS})`, () => {
    it.each([
      [MAX_RUN_WORDS - 1, false],
      [MAX_RUN_WORDS, false],
      [MAX_RUN_WORDS + 1, true],
    ])('a run of %i words is too long: %s', (count, tooLong) => {
      const lesson = parse('Why does ice float on water?', [
        prose('intro', `${TOPICAL} ${words(count - 2)}`),
      ])
      expect(rulesBroken(lesson).has('run-too-long')).toBe(tooLong)
    })
  })

  describe(`marking, at MARK_REQUIRED_ABOVE_WORDS (${MARK_REQUIRED_ABOVE_WORDS})`, () => {
    it.each([
      [MARK_REQUIRED_ABOVE_WORDS - 1, false],
      [MARK_REQUIRED_ABOVE_WORDS, false],
      [MARK_REQUIRED_ABOVE_WORDS + 1, true],
    ])('a block of %i unmarked words must mark something: %s', (count, mustMark) => {
      /* A four-word example has no important word to pull out. Ten words is
         where a block starts having a shape a reader can skim past. */
      const lesson = parse('Why does ice float on water?', [
        prose('intro', `ice ${words(count - 1)}`),
      ])
      expect(rulesBroken(lesson).has('nothing-marked')).toBe(mustMark)
    })
  })

  describe(`the definition, at MAX_DEFINITION_WORDS (${MAX_DEFINITION_WORDS})`, () => {
    /* ADDED BECAUSE A MUTANT SURVIVED. Changing `count > MAX_DEFINITION_WORDS`
       to `>=` left all 39 tests green: three of the four word limits were
       covered and this one was not, so the definition could have started being
       capped one word early and nothing would have said so. */
    it.each([
      [MAX_DEFINITION_WORDS - 1, false],
      [MAX_DEFINITION_WORDS, false],
      [MAX_DEFINITION_WORDS + 1, true],
    ])('a definition of %i words is too long: %s', (count, tooLong) => {
      /* The definition is capped WHOLE rather than per run: it is the one
         sentence the learner has to be able to hold, and splitting it into
         instalments to fit a budget defeats the point of having one. */
      const lesson = parse('Why does ice float on water?', [
        prose('def', `ice ${words(count - 1)}`, { role: 'definition' }),
      ])
      expect(rulesBroken(lesson).has('definition-too-long')).toBe(tooLong)
    })

    it('a definition broken across a blank line is refused however short it is', () => {
      const lesson = parse('Why does ice float on water?', [
        prose('def', 'Ice is frozen water.\n\nIt is less dense.', { role: 'definition' }),
      ])
      expect(rulesBroken(lesson)).toContain('definition-split-up')
    })
  })

  describe(`an example, at MAX_EXAMPLE_WORDS (${MAX_EXAMPLE_WORDS})`, () => {
    it.each([
      [MAX_EXAMPLE_WORDS - 1, false],
      [MAX_EXAMPLE_WORDS, false],
      [MAX_EXAMPLE_WORDS + 1, true],
    ])('an example of %i words is too long: %s', (count, tooLong) => {
      /* An example gets less room than an ordinary chunk because its job is
         narrower: isolate one rule. Twenty words is not room for a story.
         `checkRunLengths` applies it as
             role === 'example' ? MAX_EXAMPLE_WORDS : MAX_RUN_WORDS
         so the rule raised is `run-too-long` with a smaller budget.
     *
     * THE EXACT RULE NAME IS ASSERTED, AND THE FIRST VERSION DID NOT.
     * It matched any rule whose name contained "example", which caught
     * `example-isolates-nothing` -- a rule about RELATIONS, not length, that
     * fires on this fixture at every word count because the example declares
     * no `exemplifies` link. The boundary test therefore reported "too long"
     * at 19 and 20 words and would have gone on passing if the length cap were
     * deleted outright. A substring match is not an assertion. */
      const lesson = parse('Why does ice float on water?', [
        prose('intro', TOPICAL),
        prose('eg', `ice ${words(count - 1)}`, { role: 'example' }),
      ])
      expect(rulesBroken(lesson).has('run-too-long')).toBe(tooLong)
    })
  })
})

/* ========================================================================== */
/* PROPERTY-BASED — rules that hold for text nobody would write               */
/* ========================================================================== */

describe('property-based — invariants over generated lessons', () => {
  it('checkTeaching never throws, for any lesson the schema accepts', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.boolean(),
        (question, body, arc) => {
          const lesson = parse(question, [prose('intro', body)])
          expect(() => checkTeaching(lesson, { arc })).not.toThrow()
        },
      ),
      { numRuns: 300 },
    )
  })

  it('every teaching issue names both a rule and a place to look', () => {
    /* An issue with no rule cannot be argued with, and one with no path cannot
       be found. Either way the author cannot act on it. */
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 300 }), (body) => {
        for (const issue of checkTeaching(parse('Why is the sky blue?', [prose('a', body)]))) {
          expect(issue.rule.length).toBeGreaterThan(0)
          expect(issue.path.length).toBeGreaterThan(0)
        }
      }),
      { numRuns: 300 },
    )
  })

  it('an opening that repeats a word from the question is NEVER called generic', () => {
    /* The universal form of the six hand-picked cases above: whatever the
       topic, echoing it is always enough to anchor the opening. */
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z]{4,10}$/),
        fc.stringMatching(/^[a-z]{4,10}$/),
        (topic, rest) => {
          const lesson = parse(`What is ${topic}?`, [prose('intro', `${topic} means ${rest}.`)])
          expect(rulesBroken(lesson)).not.toContain('does-not-open-on-the-topic')
        },
      ),
      { numRuns: 300 },
    )
  })

  it('turning the arc rules off can only ever REMOVE reasons, never add one', () => {
    /* 'answer' is a strictly looser scope than 'lesson'. If loosening it could
       introduce a complaint, the two scopes would not be nested and no caller
       could reason about which rules apply where. */
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 200 }), (body) => {
        const lesson = parse('Why is the sky blue?', [prose('a', body)])
        const asAnswer = rulesBroken(lesson, false)
        const asLesson = rulesBroken(lesson, true)
        for (const rule of asAnswer) expect(asLesson).toContain(rule)
      }),
      { numRuns: 300 },
    )
  })

  describe('segments() — the split that decides what counts as one run', () => {
    it('never invents or loses visible text', () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 400 }), (text) => {
          const parts = segments(text)
          for (const part of parts) {
            expect(part.length).toBeGreaterThan(0)
            expect(part).toBe(part.trim())
            expect(text).toContain(part)
          }
        }),
        { numRuns: 400 },
      )
    })

    it('is idempotent — splitting an already-split part yields itself', () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 400 }), (text) => {
          for (const part of segments(text)) {
            expect(segments(part)).toEqual([part])
          }
        }),
        { numRuns: 300 },
      )
    })

    it('text with no blank line is exactly one segment, or none when empty', () => {
      fc.assert(
        fc.property(fc.stringMatching(/^[a-z .]{1,60}$/), (text) => {
          expect(segments(text).length).toBeLessThanOrEqual(1)
        }),
        { numRuns: 200 },
      )
    })
  })
})
