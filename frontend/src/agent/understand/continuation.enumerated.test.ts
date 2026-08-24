/*
 * THE CONTINUATION SPACE, ENUMERATED RATHER THAN LISTED.
 *
 * WHY THIS FILE EXISTS AND `continuation.test.ts` IS NOT ENOUGH.
 *
 * That file holds fifteen phrasings I thought of. The stopword gap it was
 * written to close was found by ME, and the SECOND gap in the same list ---
 * `explain` present while `define` and `describe` were missing --- was not
 * found by thinking harder. It was found by a nested-detour test that pushed
 * eight interruptions and got seven, because the eighth detour happened to
 * reuse a word from the fourth. That is luck with a good outcome, and luck is
 * not a test strategy.
 *
 * A hand-written list of examples tests the cases its author already knows.
 * This file builds the space combinatorially --- verb x particle x politeness x
 * punctuation --- so a missing word is found by the machine rather than by
 * whoever next happens to write an unlucky test. It is the same move as
 * enumerating a bypass space instead of asserting on the three bypasses
 * somebody thought of first.
 *
 * WHEN THIS GOES RED, THE FIX IS THE STOPWORD LIST, NOT THIS FILE. A failure
 * here names the exact phrase and the exact word that leaked. Deleting the case
 * to get green would be removing the only thing that found it.
 */
import { describe, expect, it } from 'vitest'
import { extractEntities, termSpans, understand } from './understand'
import type { Turn } from '../kernel/contracts'

const ask = (content: string): Turn => ({ parts: [{ modality: 'text', content }], at: '2026-01-01T00:00:00.000Z' })

const convo = {
  entities: [{ id: 'quadratics', label: 'quadratics', kind: 'term', mentions: [1, 2] }],
  topic: 'quadratics',
  turnIndex: 5,
}

/* The generators. Each axis is a way a learner says "keep going" without naming
   a subject. Crossed, they are the space; individually, they are the words the
   extractor must not mistake for a subject. */
const VERBS = [
  'continue', 'carry on', 'keep going', 'go on', 'proceed', 'go ahead',
  'move on', 'go further', 'carry on', 'keep at it', 'press on',
]
const OPENERS = ['', 'ok ', 'okay ', 'yes ', 'yeah ', 'sure ', 'right ', 'alright ', 'please ']
const CLOSERS = ['', '.', '!', ' please', ' then', ' now', ' thanks']

function space(): string[] {
  const out: string[] = []
  for (const v of VERBS) {
    for (const o of OPENERS) {
      for (const c of CLOSERS) out.push(`${o}${v}${c}`)
    }
  }
  return [...new Set(out)]
}

describe('the continuation space, generated', () => {
  const PHRASES = space()

  it('is big enough to be worth generating', () => {
    /* If the crossing ever collapses to a handful, this file has stopped doing
       the thing it exists for and should fail loudly rather than pass fast. */
    expect(PHRASES.length).toBeGreaterThan(400)
  })

  it('no generated continuation names a subject', () => {
    const leaked: string[] = []
    for (const p of PHRASES) {
      const named = extractEntities(p, 1)
      if (named.length > 0) leaked.push(`${JSON.stringify(p)} -> ${named.map((e) => e.id).join(',')}`)
    }
    expect(leaked, `${leaked.length} phrasing(s) leaked a word into the subject extractor`).toEqual([])
  })

  it('no generated continuation shifts the topic', () => {
    const shifted = PHRASES.filter((p) => understand(ask(p), convo).topicShift)
    expect(shifted, `${shifted.length} phrasing(s) read as a change of subject`).toEqual([])
  })
})

/*
 * THE COUNTER-SPACE. A rule that suppresses every shift is the same bug with
 * the sign flipped, and the flipped version is worse: a lesson that drifts has
 * nothing to notice it. So the same generator runs with a subject appended, and
 * every one of those MUST shift.
 */
describe('the same space, with a subject named, still shifts', () => {
  const SUBJECTS = ['fractions', 'trigonometry', 'photosynthesis', 'tensors', 'inflation']
  const WITH_SUBJECT = VERBS.flatMap((v) => SUBJECTS.map((s) => `${v} with ${s}`))

  it('is a real crossing, not a token one', () => {
    expect(WITH_SUBJECT.length).toBeGreaterThanOrEqual(VERBS.length * SUBJECTS.length)
  })

  it('every one names its subject and shifts', () => {
    const missed: string[] = []
    for (const p of WITH_SUBJECT) {
      /* `keep at it` is excluded and the exclusion is documented below, not
         hidden. Dropping the phrase from the generator would delete the only
         thing that found the defect. */
      if (p.startsWith('keep at it')) continue
      const ids = extractEntities(p, 1).map((e) => e.id)
      const subject = SUBJECTS.find((s) => p.endsWith(s)) as string
      if (!ids.includes(subject)) missed.push(`${JSON.stringify(p)} lost its subject, got [${ids.join(',')}]`)
      else if (!understand(ask(p), convo).topicShift) missed.push(`${JSON.stringify(p)} named ${subject} and did not shift`)
    }
    expect(missed).toEqual([])
  })
})

/*
 * THE OTHER DIRECTION, NOW FIXED --- AND WHAT THE FIX COST.
 *
 * The stopword list keeps words OUT of the subject extractor. A separate
 * session probing `reason` found the same function failing the opposite way:
 * it split compound nouns, so "what is a transformation graph" produced two
 * unrelated `term`s and `reason` found no relation between them.
 *
 * These were pinned as a KNOWN DEFECT and are now `termSpans`. The block below
 * is what the pins turned into once the tokeniser landed --- kept as tests
 * rather than deleted, because the behaviours they describe are exactly the
 * ones a later "simplification" would undo.
 *
 * The collision that forced the design is still the clearest statement of why
 * a list could never have worked: `right` is filler in "right, continue" and
 * half the subject in "right triangle". Same token, same spelling, decided by
 * position and by nothing else.
 */
describe('compound nouns survive as spans, and their parts survive with them', () => {
  it('the compound is offered first, because that is what names the concept', () => {
    /* `wire.ts` takes the teaching concept from `entities[0].id`. Before the
       tokeniser, "what is a transformation graph" made the concept
       `transformation`, and the whole session was then taught against the wrong
       subject. Order is load bearing, not cosmetic. */
    for (const [text, head] of [
      ['what is a transformation graph', 'transformation graph'],
      ['explain the quadratic formula', 'quadratic formula'],
      ['what is machine learning', 'machine learning'],
      ['explain natural selection', 'natural selection'],
      ['what is a right triangle', 'right triangle'],
    ] as const) {
      expect(extractEntities(text, 0)[0]?.id, text).toBe(head)
    }
  })

  it('the parts are still there, because continuity matches ids exactly', () => {
    const ids = extractEntities('what is a transformation graph', 0).map((e) => e.id)
    expect(ids).toEqual(['transformation graph', 'transformation', 'graph'])
  })

  it('a noun followed by a verb keeps the noun addressable', () => {
    /* The over-join the span-only version caused. "inflation measured" is not a
       compound, and if the span were the ONLY entity then a follow-up about
       inflation would overlap nothing and read as a change of subject. */
    expect(extractEntities('And how is inflation measured?', 0).map((e) => e.id)).toContain('inflation')
    expect(extractEntities('and how do quadratics factor?', 0).map((e) => e.id)).toContain('quadratics')
  })

  it('an attachable word is never emitted on its own', () => {
    /* `right` rides along in front of `triangle` and appears nowhere by itself,
       which is the whole reason position beats membership here. */
    const ids = extractEntities('what is a right triangle', 0).map((e) => e.id)
    expect(ids).toEqual(['right triangle', 'triangle'])
    expect(ids).not.toContain('right')
    /* And the discourse use of the identical token still yields nothing. */
    expect(extractEntities('right, continue', 0)).toEqual([])
    expect(extractEntities('right continue', 0)).toEqual([])
  })

  /*
   * THE ADJACENCY RULE ITSELF, PINNED BY MUTATION RATHER THAN BY TASTE.
   *
   * Eight mutations were applied to `termSpans` after the suite went green.
   * Five died. Three survived, and every test below exists because one of them
   * lived --- not because the behaviour looked worth asserting.
   *
   * One of the three taught me something about my own method: I labelled a
   * mutant "adjacency ignores punctuation" and it survived, which I read as a
   * hole in these tests. It was not. The mutant was `.trim() === ''`, and
   * `", ".trim()` is `","`, not the empty string, so it never affected a comma
   * at all --- it only made multi-space and newline gaps join. A WEAK MUTANT
   * READS EXACTLY LIKE A MISSING TEST, and the only thing that separated them
   * was tracing the actual gap value instead of trusting the label I had
   * written on it.
   */
  it('a comma ends a span --- this is what separates the two uses of `right`', () => {
    expect(termSpans('a graph, transformation of it')).toEqual(['graph', 'transformation'])
    expect(termSpans('fractions, algebra')).toEqual(['fractions', 'algebra'])
  })

  it('only a single space joins --- not a newline, a tab, or two spaces', () => {
    /* SURVIVING MUTANT 1. The rule is `=== " "`, and nothing asserted that the
       strictness was deliberate. A line break between two nouns is a sentence
       boundary far more often than it is a compound. */
    expect(termSpans('transformation  graph')).toEqual(['transformation', 'graph'])
    expect(termSpans('transformation\ngraph')).toEqual(['transformation', 'graph'])
    expect(termSpans('transformation\tgraph')).toEqual(['transformation', 'graph'])
  })

  it('an attachable word only ever joins forwards', () => {
    /* SURVIVING MUTANT 2. Dropping `&& !hasContent` let a trailing attachable
       glue itself to the end of a span, so "the triangle right" became a
       subject called `triangle right`. Attachables qualify what FOLLOWS them;
       nothing licenses reading them backwards. */
    expect(termSpans('the triangle right')).toEqual(['triangle'])
    expect(termSpans('a graph next')).toEqual(['graph'])
    expect(termSpans('right triangle')).toEqual(['right triangle'])
  })

  it('the four-character floor is a rule, not an accident', () => {
    /* SURVIVING MUTANT 3. Lowering it to three changed nothing any test could
       see, and the floor is load bearing: `go on` escapes being read as a
       subject ONLY because both its words are under it. That was luck when it
       was discovered and it should not be luck now. */
    expect(termSpans('go on')).toEqual([])
    expect(termSpans('add two and sin')).toEqual([])
    /* And the boundary itself, so a later change has to face the tradeoff:
       four characters admits `sine` and refuses `sin`. */
    expect(termSpans('what is sine')).toEqual(['sine'])
  })
})

/*
 * A KNOWN DEFECT, PINNED RATHER THAN PAPERED OVER.
 *
 * The generator found this and it is NOT the stopword list. `topicShift`
 * requires `!PRONOUN.test(text)`, so any turn containing a pronoun is exempt
 * from being a change of subject. The rationale is sound on its own terms ---
 * "and how is IT measured" refers to what is already in play. But it is the
 * same shape as the bug this whole file exists for: a membership test standing
 * in for a property. It asks "does the text contain a pronoun" when the
 * question is "does the text refer to the current topic INSTEAD OF naming a new
 * one", and "keep at it with fractions" does both.
 *
 * Not fixed here, deliberately. The pronoun rule predates this work, it is load
 * bearing for reference resolution, and changing it at the end of an unrelated
 * change is how a small fix becomes an incident. It is recorded instead, with
 * the exact input, so the next person meets it as a known thing rather than
 * rediscovering it.
 *
 * THIS TEST ASSERTS THE WRONG BEHAVIOUR ON PURPOSE. When someone fixes the
 * pronoun rule it will go red, and the failure message is the instruction:
 * delete this block and remove the `keep at it` exclusion above.
 */
describe('KNOWN DEFECT: a pronoun suppresses a genuine change of subject', () => {
  it('"keep at it with fractions" names fractions and still does not shift', () => {
    const p = 'keep at it with fractions'
    expect(extractEntities(p, 1).map((e) => e.id)).toContain('fractions')
    expect(
      understand(ask(p), convo).topicShift,
      'if this is now true, the pronoun rule was fixed --- delete this block and the exclusion above',
    ).toBe(false)
  })

  it('the same phrase without the pronoun shifts correctly', () => {
    /* The control. It proves the defect is the pronoun and not the phrasing,
       which is the difference between a diagnosis and a guess. */
    expect(understand(ask('keep going with fractions'), convo).topicShift).toBe(true)
  })
})

/*
 * THE INSTRUCTION-VERB SPACE, for the same reason. `explain` was listed and
 * `define` was not, and nothing structural distinguished them --- both are
 * imperatives a learner puts in front of the thing they actually want. The
 * crossing below is what would have caught that on the day it was written.
 */
describe('instruction verbs are never the subject of the request', () => {
  const VERBS_I = [
    'explain', 'define', 'describe', 'clarify', 'elaborate', 'summarise',
    'summarize', 'compare', 'list', 'outline', 'derive', 'prove', 'tell me',
    'show me', 'give me',
  ]
  const OBJECTS = ['fractions', 'the discriminant', 'a polynomial', 'exponents']

  it('the verb never appears among the named subjects', () => {
    const leaked: string[] = []
    for (const v of VERBS_I) {
      for (const o of OBJECTS) {
        const ids = extractEntities(`${v} ${o}`, 1).map((e) => e.id)
        const head = v.split(' ')[0] as string
        if (ids.includes(head)) leaked.push(`"${v} ${o}" -> [${ids.join(',')}]`)
      }
    }
    expect(leaked, `${leaked.length} instruction verb(s) reached the subject extractor`).toEqual([])
  })

  it('two different objects behind the SAME verb are two different subjects', () => {
    /* This is the assertion that would have caught `define` directly, and it is
       the shape of the original failure: two "define X" turns shared the entity
       `define`, the overlap was one, and the second question did not register as
       a change of subject at all. */
    for (const v of VERBS_I) {
      const first = understand(ask(`${v} fractions`), convo)
      const second = understand(ask(`${v} exponents`), {
        entities: first.entities, topic: 'fractions', turnIndex: 6,
      })
      expect(second.topicShift, `"${v} exponents" after "${v} fractions"`).toBe(true)
    }
  })
})
