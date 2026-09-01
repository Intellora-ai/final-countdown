import { describe, expect, it } from 'vitest'

import { billBecomesLaw } from '../lessons/billBecomesLaw'
import { classifierEvaluation } from '../lessons/classifierEvaluation'
import { gasPressure } from '../lessons/gasPressure'
import type { Block, Lesson } from '../spec/spec'
import { validateLesson } from '../spec/validate'
import type { Doubt, DoubtAnswer, Resolution } from './contract'
import { lessonResolver } from './doubt'

/**
 * What this file is guarding.
 *
 * The easy half is that the resolver answers. The half that matters is that it
 * REFUSES — a resolver which always produces something is a resolver that
 * invents things, and the tests below spend more effort on the questions it
 * must not answer than on the ones it must.
 *
 * Every doubt is written the way a school student types one: lower case, no
 * punctuation, half a sentence. A test suite written in careful English would
 * pass while the real thing refused everybody.
 */

function lessonOf(spec: unknown): Lesson {
  const result = validateLesson(spec)
  if (!result.ok) throw new Error(`fixture does not validate: ${JSON.stringify(result.issues)}`)
  return result.lesson
}

const GAS = lessonOf(gasPressure)
const BILL = lessonOf(billBecomesLaw)
const ML = lessonOf(classifierEvaluation)

/** The learner is always somewhere. Answering must never depend on where. */
function ask(lesson: Lesson, text: string): Resolution {
  const doubt: Doubt = { text, atBeatId: lesson.blocks[0]?.id ?? 'unknown' }
  return lessonResolver.resolve(doubt, lesson)
}

/**
 * Assert an answer, and re-run the gate on it.
 *
 * The resolver already validates what it builds, so re-validating here looks
 * redundant — it is not. It is the difference between trusting the resolver's
 * own claim and checking it, and if the resolver ever grows a path that hands
 * back an unvalidated lesson this is what notices.
 */
function answerTo(lesson: Lesson, text: string): DoubtAnswer {
  const resolution = ask(lesson, text)
  if (resolution.kind !== 'answer')
    throw new Error(`expected an answer to "${text}", got a refusal: ${resolution.reason}`)

  /* At `'answer'`, which is the level the resolver itself builds against
     (`doubt.ts`). Re-checking at `'lesson'` would demand an opening definition
     and a closing summary from a reply to one question -- a contract the
     resolver never makes and production never applies, so a failure there
     would say nothing about whether the resolver is correct. */
  const revalidated = validateLesson(resolution.lesson, { teaching: 'answer' })
  expect(
    revalidated.ok,
    revalidated.ok ? '' : `answer to "${text}" does not validate: ${JSON.stringify(revalidated.issues)}`,
  ).toBe(true)

  return resolution
}

function kinds(answer: DoubtAnswer): string[] {
  return answer.lesson.blocks.map((block: Block) => block.kind)
}

/* -------------------------------------------------------------------------- */

describe('the doubt names a block', () => {
  it('shows the causal chain when the learner cannot follow what happens', () => {
    const answer = answerTo(GAS, 'i dont understand what actually happens')

    expect(answer.drawnFrom).toEqual(['causal-chain'])
    expect(kinds(answer)).toContain('flow')
  })

  it('promotes the caption so the author sentence becomes the explanation', () => {
    const answer = answerTo(GAS, 'i dont understand what actually happens')

    const prose = answer.lesson.blocks.find((block: Block) => block.kind === 'prose')
    expect(prose && prose.kind === 'prose' ? prose.body : '').toBe(
      'Each step is a consequence of the one before it, not a coincidence.',
    )

    // And not twice over: the caption came OFF the block it was promoted from.
    const flow = answer.lesson.blocks.find((block: Block) => block.kind === 'flow')
    expect(flow && 'caption' in flow ? flow.caption : undefined).toBeUndefined()
  })

  it('finds a block by the name of the representation the author chose', () => {
    const answer = answerTo(ML, 'what does the confusion matrix show')

    expect(answer.drawnFrom).toEqual(['confusion'])
  })
})

describe('the doubt asks to compare two things', () => {
  it('turns two slices of a pie into a table of the two', () => {
    const answer = answerTo(GAS, 'whats the difference between rotational and vibrational')

    expect(answer.drawnFrom).toEqual(['energy-split'])

    const table = answer.lesson.blocks.find((block: Block) => block.kind === 'table')
    if (!table || table.kind !== 'table') throw new Error('expected a table')
    expect(table.rows).toEqual([
      { item: 'Rotational', value: 25 },
      { item: 'Vibrational', value: 15 },
    ])
  })

  it('pulls two rows out of a table and drops the rows nobody asked about', () => {
    const answer = answerTo(GAS, 'difference between pressure and volume')

    expect(answer.drawnFrom).toEqual(['what-changes'])

    const table = answer.lesson.blocks.find((block: Block) => block.kind === 'table')
    if (!table || table.kind !== 'table') throw new Error('expected a table')
    expect(table.rows).toHaveLength(2)
    expect(table.rows.map((row) => row.quantity)).toEqual(['Pressure (kPa)', 'Volume (L)'])
    // Every column survives: the comparison is the numbers, not the row names.
    expect(table.columns).toHaveLength(4)
  })

  it('compares two columns and keeps the column that names the rows', () => {
    const answer = answerTo(BILL, 'difference between lok sabha and rajya sabha')

    expect(answer.drawnFrom).toEqual(['chambers'])

    const table = answer.lesson.blocks.find((block: Block) => block.kind === 'table')
    if (!table || table.kind !== 'table') throw new Error('expected a table')
    expect(table.columns.map((column) => column.key)).toEqual(['power', 'lok', 'rajya'])
    expect(table.rows).toHaveLength(5)
    expect(table.rows[0]).toEqual({ power: 'Introduce a money bill', lok: 'Yes', rajya: 'No' })
  })

  it('does not treat a bare "and" as a comparison', () => {
    // "pressure and temperature" is a relationship, not a request for a table.
    const answer = answerTo(GAS, 'whats the link between pressure and temperature')
    expect(kinds(answer)).not.toContain('table')
  })
})

describe('the doubt asks why, and a relation already recorded the reason', () => {
  it('answers a why about the headline number with the block that supports it', () => {
    const answer = answerTo(ML, 'why is the reported accuracy wrong')

    // The author wrote `confusion supports headline`. That IS the answer, and
    // re-showing the metric the learner just told us they do not believe is not.
    expect(answer.drawnFrom).toEqual(['confusion'])
    expect(kinds(answer)).toContain('figure')
  })

  it('shows the block itself when the doubt names something inside it', () => {
    // "Pressure" labels something inside four different blocks and is nobody's
    // title, so the relation strategy stays out of it. Which of the four wins
    // is a tie-break on position and nothing more — but it must not be the
    // callout that merely contrasts with the chain.
    const answer = answerTo(GAS, 'why does the pressure go up')
    expect(answer.drawnFrom).not.toEqual(['misconception'])
  })
})

describe('the answer is in a caption the author already wrote', () => {
  it('answers a doubt about the crossing curves with the block whose caption explains it', () => {
    // "The two curves cross near 0.45. That crossing, not the accuracy, is
    // where the threshold belongs." — nothing in that block's title or labels
    // says "curves" or "cross", and the answer is still sitting right there.
    const answer = answerTo(ML, 'why do the two curves cross')

    expect(answer.drawnFrom).toEqual(['threshold-cost'])
    expect(answer.lesson.blocks[0]?.kind).toBe('figure')

    const prose = answer.lesson.blocks.find((block: Block) => block.kind === 'prose')
    expect(prose && prose.kind === 'prose' ? prose.body : '').toContain('cross near 0.45')
  })

  it('does not let a caption outrank a name', () => {
    // "Precision" is an axis label on `pr`; the word also appears in the
    // summary paragraph. The label must win, or every specific question ends
    // up answered by whichever paragraph rambled longest.
    expect(answerTo(ML, 'what does precision mean').drawnFrom).toEqual(['pr'])
  })
})

describe('the learner asks the lesson its own question', () => {
  it('answers the headline question with the parts that carry it', () => {
    // `lesson.question` is "Why is 97% accuracy a bad way to judge this model?"
    // Refusing this one would be the single worst failure in the set: it is
    // what a lost learner types, and the whole lesson is the answer.
    const answer = answerTo(ML, 'why is 97% bad')

    /* Re-pinned in this change. The strategy shows the first three blocks the
       AUTHOR marked `primary`, and the ML lesson's primaries moved: it gained
       an opening definition, and the 97.1% headline became `supporting` —
       it is the number the lesson takes apart, not the thing it teaches. The
       definition, the class balance and the confusion matrix are what now
       carry the answer, which is the same claim this assertion always made. */
    expect(answer.drawnFrom).toEqual(['what-accuracy-is', 'imbalance', 'confusion'])
    // Short enough to be an answer rather than the lesson played again.
    expect(answer.drawnFrom.length).toBeLessThanOrEqual(3)

    const lead = answer.lesson.blocks[0]
    expect(lead?.kind).toBe('callout')
    expect(lead && lead.kind === 'callout' ? lead.body : '').toContain('whole lesson')
  })

  it('prefers the block whose title is nothing but the thing asked about', () => {
    // "Powers of the two Houses" and "Why two Houses at all" both contain the
    // learner's two words. The second is ENTIRELY those two words once the
    // function words are gone, and that is the one to show.
    expect(answerTo(BILL, 'why are there two houses').drawnFrom).toEqual(['why-two-houses'])
  })

  it('does the same for the other two lessons', () => {
    expect(answerTo(GAS, 'why does temperature increase pressure').drawnFrom.length).toBeGreaterThan(0)
    expect(answerTo(BILL, 'how does a bill become law').drawnFrom.length).toBeGreaterThan(0)
  })
})

describe('the doubt names a quantity that is derived from something', () => {
  it('shows the relationship together with the law it comes from', () => {
    const answer = answerTo(GAS, 'whats the relationship')

    expect(answer.drawnFrom).toEqual(['proportionality', 'ideal-gas-law'])
    expect(kinds(answer).filter((kind) => kind === 'equation')).toHaveLength(2)
    // The edge survives, so the answer still says which one derives which.
    expect(answer.lesson.relations).toEqual([
      { from: 'ideal-gas-law', to: 'proportionality', kind: 'derives' },
    ])
  })
})

/* -------------------------------------------------------------------------- */
/* Refusal                                                                    */
/* -------------------------------------------------------------------------- */

describe('refusing something the lesson is not about', () => {
  it('refuses a question from another world entirely', () => {
    for (const lesson of [GAS, BILL, ML]) {
      const resolution = ask(lesson, 'who won the world cup')
      expect(resolution.kind).toBe('refusal')
      if (resolution.kind !== 'refusal') throw new Error('unreachable')
      expect(resolution.nearest).toEqual([])
      expect(resolution.reason.length).toBeGreaterThan(20)
    }
  })

  it('refuses an empty doubt rather than answering with whatever is first', () => {
    const resolution = ask(GAS, '   ')
    expect(resolution.kind).toBe('refusal')
  })
})

describe('refusing a plausible term the lesson does not contain', () => {
  /*
   * THE ANTI-HALLUCINATION TESTS.
   *
   * Each doubt below shares real words with the lesson and asks about something
   * the lesson genuinely never covers. Every one of them is a case where a
   * looser matcher produces a confident, wrong, well-rendered answer — which is
   * strictly worse than saying nothing, because the learner has no way to tell.
   */

  it('refuses "precision" in a physics lesson even though "mean" is in it', () => {
    const resolution = ask(GAS, 'what does precision mean')

    expect(resolution.kind).toBe('refusal')
    if (resolution.kind !== 'refusal') throw new Error('unreachable')

    // The overlap is real and the refusal happens anyway: "Mean particle speed"
    // is the row a one-word match would have answered with.
    expect(resolution.nearest).toContain('what-changes')
  })

  it('answers the same doubt in the lesson that does define the word', () => {
    // The contrast is the point. The refusal above is not the matcher being
    // blunt — it is the matcher knowing the difference between the two lessons.
    const answer = answerTo(ML, 'what does precision mean')
    expect(answer.drawnFrom).toEqual(['pr'])
  })

  it('refuses cross validation even though a caption contains the word "cross"', () => {
    const resolution = ask(ML, 'explain how cross validation works')

    expect(resolution.kind).toBe('refusal')
    if (resolution.kind !== 'refusal') throw new Error('unreachable')
    // Proof the word was there to be grabbed at: the block whose caption says
    // "the two curves cross near 0.45" is offered as somewhere to look, and is
    // still not offered as an answer.
    expect(resolution.nearest).toContain('threshold-cost')
  })

  it('refuses a real term from the neighbouring subject', () => {
    for (const text of [
      'what does entropy mean',
      'how does humidity change this',
      'is this the same as osmosis',
    ]) {
      const resolution = ask(GAS, text)
      expect(resolution.kind, `"${text}" was answered`).toBe('refusal')
    }
  })

  it('refuses a plausible civics term the bill lesson never mentions', () => {
    for (const text of [
      'what is a quorum',
      'how does impeachment work',
      'whats the difference between a writ and an ordinance',
    ]) {
      const resolution = ask(BILL, text)
      expect(resolution.kind, `"${text}" was answered`).toBe('refusal')
    }
  })

  it('still refuses after captions and the lesson question became matchable', () => {
    /*
     * THE REGRESSION GUARD.
     *
     * Matching captions, and matching the lesson's own question, are both far
     * looser than matching a name. Every doubt below has to keep refusing, or
     * those two additions have quietly turned the resolver into a search box
     * that always finds something.
     */
    for (const text of [
      'whats a support vector machine',
      'explain gradient descent',
      'how do you do k fold',
      'is this the same as a random forest',
      'explain how cross validation works',
      'who won the world cup',
    ]) {
      const resolution = ask(ML, text)
      expect(resolution.kind, `"${text}" was answered`).toBe('refusal')
    }
  })

  it('never invents a block id when it refuses', () => {
    const ids = new Set(GAS.blocks.map((block: Block) => block.id))
    const resolution = ask(GAS, 'what does entropy mean')
    if (resolution.kind !== 'refusal') throw new Error('expected a refusal')
    for (const id of resolution.nearest) expect(ids.has(id)).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* A definition ask, from both sides                                          */
/* -------------------------------------------------------------------------- */

describe('a definition ask is answered only by a block that says the word itself', () => {
  /*
   * THE PAIR, AND WHY IT HAD TO BE WRITTEN.
   *
   * `answersADefinition` in `doubt.ts` was carrying this rule with NOTHING
   * holding its loose end. MEASURED: replacing its whole body with `return
   * true` -- letting any block at all answer a definition ask -- turned not one
   * test in `src/canvas` red. The rule could have been deleted and the suite
   * would have called it an improvement, because deleting it also fixes the
   * five tests its over-application was breaking.
   *
   * Both halves below are the same rule seen from opposite sides, and either
   * one alone is vacuous. A resolver that refuses every definition ask passes
   * the first. A resolver that answers every definition ask passes the second.
   *
   * THE FIRST HALF WAS MEASURED IN A BROWSER, and is recorded in
   * `answersADefinition`: a learner on the gas lesson typed "what is kinetic
   * energy? i dont understand it" and was handed the causal chain -- the
   * diagram already on her screen -- under the heading "IN ANSWER TO YOUR
   * QUESTION". `kinetic` and `energy` are the text of ONE NODE of it. The chain
   * calls itself "What actually happens" and its caption says "Each step is a
   * consequence of the one before it". Neither says anything about what kinetic
   * energy IS. Words gained: zero.
   */

  it('refuses a definition ask that only echoes a label back', () => {
    const answer = answerTo(GAS, 'what is kinetic energy i dont understand it')

    // Not the diagram she was already looking at.
    expect(answer.drawnFrom).not.toContain('causal-chain')

    /* The one paragraph in the lesson that says what the words mean:
       "Temperature is a measure of the average kinetic energy of the particles."

       ITS ID, NOT A LOOSER ASSERTION. This read `['summary']` until the merge
       that brought main into codex renamed that very block -- same title "In
       one paragraph", same body, same `terms` -- to `wall-collisions`, because
       `technicalTerms` pins "force" and "kinetic energy" to it by id. There is
       no block called `summary` in the fixture any more, so the line could only
       ever be red; `git show b3cc2023:frontend/src/canvas/lessons/gasPressure.ts`
       is the rename. The assertion is still exact, still one id, and still goes
       red the moment any block is allowed to answer a definition ask --
       MEASURED, with `answersADefinition` replaced by `return true` AND the
       line above it silenced so this one was carrying the test on its own:
       "expected [ 'causal-chain' ] to deeply equal [ 'wall-collisions' ]". */
    expect(answer.drawnFrom).toEqual(['wall-collisions'])
    const prose = answer.lesson.blocks.find((block: Block) => block.kind === 'prose')
    expect(prose && prose.kind === 'prose' ? prose.body : '').toContain('average kinetic energy')
  })

  it('answers when the block itself is what the author wrote about the term', () => {
    /* `Precision` is only an AXIS LABEL on `pr` -- not a title. What makes it
       answerable is that the block is TITLED "Precision-recall tells the truth"
       and captioned with a sentence about the tradeoff precision buys. */
    expect(answerTo(ML, 'what does precision mean').drawnFrom).toEqual(['pr'])

    /* And here the block declares itself to BE the thing asked about: the
       author chose `as: 'featureImportance'`. Its title says "What the model is
       leaning on" and never uses either word. */
    expect(answerTo(ML, 'what is feature importance').drawnFrom).toEqual(['features'])
  })
})

/* -------------------------------------------------------------------------- */
/* Properties that hold across everything                                     */
/* -------------------------------------------------------------------------- */

const EVERY_DOUBT: { lesson: Lesson; text: string }[] = [
  { lesson: GAS, text: 'i dont understand what actually happens' },
  { lesson: GAS, text: 'whats the difference between rotational and vibrational' },
  { lesson: GAS, text: 'difference between pressure and volume' },
  { lesson: GAS, text: 'whats the relationship' },
  { lesson: GAS, text: 'why does the pressure go up' },
  { lesson: GAS, text: 'what does precision mean' },
  { lesson: GAS, text: 'who won the world cup' },
  { lesson: BILL, text: 'difference between lok sabha and rajya sabha' },
  { lesson: BILL, text: 'what happens at the committee scrutiny stage' },
  { lesson: BILL, text: 'what is a quorum' },
  { lesson: ML, text: 'what does the confusion matrix show' },
  { lesson: ML, text: 'why is the reported accuracy wrong' },
  { lesson: ML, text: 'what does precision mean' },
  { lesson: ML, text: 'why do the two curves cross' },
  { lesson: ML, text: 'why is 97% bad' },
  { lesson: ML, text: 'explain how cross validation works' },
  { lesson: ML, text: 'whats a support vector machine' },
]

describe('properties that must hold for every doubt', () => {
  it('every answer it gives passes the gate the resolver builds against', () => {
    /*
     * RENAMED, BECAUSE THE OLD NAME NAMED THE WRONG GATE. It read "the same
     * gate an authored lesson does", and checked at `'lesson'` — the full
     * teaching arc. `doubt.ts` builds at `'answer'`, and it must: a reply to
     * one question owes no opening definition and no closing progression, and
     * `captionNote` assembles blocks out of the author's own caption without
     * inventing text, so it cannot mark a term either. Checking at `'lesson'`
     * asserted a contract production never makes and the resolver cannot meet.
     *
     * The assertion itself is unchanged and still exact: every answer must
     * pass, at the level it was built for.
     */
    for (const { lesson, text } of EVERY_DOUBT) {
      const resolution = ask(lesson, text)
      if (resolution.kind !== 'answer') continue

      const result = validateLesson(resolution.lesson, { teaching: 'answer' })
      expect(result.ok, result.ok ? '' : `"${text}": ${JSON.stringify(result.issues)}`).toBe(true)
    }
  })

  it('only ever names blocks that exist in the lesson it was given', () => {
    for (const { lesson, text } of EVERY_DOUBT) {
      const ids = new Set(lesson.blocks.map((block: Block) => block.id))
      const resolution = ask(lesson, text)
      const named = resolution.kind === 'answer' ? resolution.drawnFrom : resolution.nearest

      for (const id of named) expect(ids.has(id), `"${text}" named a block "${id}"`).toBe(true)
      // An answer that drew on nothing would be an answer it made up.
      if (resolution.kind === 'answer') expect(named.length).toBeGreaterThan(0)
    }
  })

  it('gives the same resolution twice for the same doubt', () => {
    for (const { lesson, text } of EVERY_DOUBT) {
      expect(ask(lesson, text)).toEqual(ask(lesson, text))
    }
  })

  it('never carries a step count into an answer', () => {
    // The answer is a lesson like any other, and the beat contract forbids
    // telling the learner how much is left. An answer is the easiest place for
    // that to leak back in.
    for (const { lesson, text } of EVERY_DOUBT) {
      const resolution = ask(lesson, text)
      if (resolution.kind !== 'answer') continue
      expect(/\b\d+\s*(of|\/)\s*\d/.test(resolution.lesson.question)).toBe(false)
    }
  })
})

describe('the answer is not always prose', () => {
  /*
   * THE REQUIREMENT MOST LIKELY TO REGRESS SILENTLY.
   *
   * Nothing breaks if every answer quietly collapses to a paragraph — the tests
   * still pass, the page still renders, and the feature stops being the thing
   * it was built to be. So it is asserted directly.
   */

  it('answers a doubt about a chart with the chart', () => {
    const answer = answerTo(ML, 'what does the confusion matrix show')

    const leading = answer.lesson.blocks[0]
    expect(leading?.kind).toBe('figure')
    expect(leading?.emphasis).toBe('primary')
  })

  it('answers a comparison with a table rather than a sentence about it', () => {
    const answer = answerTo(ML, 'whats the difference between legitimate and fraudulent')

    expect(answer.drawnFrom).toEqual(['imbalance'])
    expect(answer.lesson.blocks[0]?.kind).toBe('table')
  })

  it('reaches representations across all three lessons, not one favourite', () => {
    const led = [
      answerTo(GAS, 'i dont understand what actually happens'),
      answerTo(GAS, 'difference between pressure and volume'),
      answerTo(GAS, 'whats the relationship'),
      answerTo(BILL, 'difference between lok sabha and rajya sabha'),
      answerTo(ML, 'what does the confusion matrix show'),
    ].map((answer) => answer.lesson.blocks[0]?.kind)

    expect(led).toEqual(['flow', 'table', 'equation', 'table', 'figure'])
    // None of them opened with a paragraph.
    expect(led).not.toContain('prose')
  })
})

