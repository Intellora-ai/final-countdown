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
import { extractEntities, understand } from './understand'
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
/*
 * THE OTHER DIRECTION, AND THE PRICE OF THE FIX ABOVE.
 *
 * The stopword list keeps words OUT of the subject extractor. A separate
 * session probing `reason` found the same function failing the opposite way ---
 * it splits compound nouns, so "what is a transformation graph" yields two
 * unrelated `term`s, `reason` finds no relation between them, and reports
 * itself unmet on the most ordinary question shape there is.
 *
 * The two directions collide on a single word, and that collision is the
 * evidence that no list can settle this: `right` is filler in "right, continue"
 * and half the name of the subject in "right triangle". Adding it fixed the
 * first and cost the second.
 *
 * Pinned rather than argued about. If someone splits this into a tokeniser and
 * a vocabulary step --- see the long comment beside the list in
 * `understand.ts` --- these go green and the block should be deleted.
 */
describe('KNOWN DEFECT: one function, wrong in both directions', () => {
  it('compound nouns are split into unrelated parts', () => {
    for (const [text, parts] of [
      ['what is a transformation graph', ['transformation', 'graph']],
      ['explain the quadratic formula', ['quadratic', 'formula']],
      ['what is machine learning', ['machine', 'learning']],
      ['explain natural selection', ['natural', 'selection']],
    ] as const) {
      expect(
        extractEntities(text, 0).map((e) => e.id),
        `if this now yields one span, the tokeniser landed --- delete this block`,
      ).toEqual([...parts])
    }
  })

  it('stopwording `right` cost "right triangle" its qualifier', () => {
    /* The regression this change introduced, stated plainly rather than left
       for someone to find. It is bounded: the turn still names `triangle`, so
       a change of subject is still detected and only the precision of the
       entity identity is lost. */
    expect(extractEntities('what is a right triangle', 0).map((e) => e.id)).toEqual(['triangle'])
    /* And the thing it bought, which is why the trade was taken. */
    expect(extractEntities('right, continue', 0)).toEqual([])
  })
})

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
