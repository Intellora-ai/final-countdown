/*
 * A QUESTION ASKED INSIDE A LESSON IS NOT ASKED IN A VACUUM.
 *
 * MEASURED IN A REAL BROWSER, not reasoned about. A learner on the logarithms
 * lesson typed "what is the base" -- an ordinary, on-topic question -- and the
 * canvas answered:
 *
 *     "BASE jumping is the activity of jumping from fixed objects, using a
 *      parachute to descend to the ground."
 *
 * with links to BASE_jumping, Base_pair, Free_base and The_Base.
 *
 * The cause is one line: the query was `contentTokens(doubt.text).join(' ')`,
 * so "what is the base" became the single word "base" and the lesson -- which
 * `resolve` receives and named `_lesson` to say it ignores -- was never
 * consulted. "base" alone is ambiguous; "base" inside a logarithms lesson is
 * not, and the disambiguating word was sitting in the argument list.
 *
 * The file already defended the EMPTY query, with a comment warning that a
 * wrong article wearing a citation is the worst thing this rung can produce.
 * An AMBIGUOUS query is that same failure one step further along, and it was
 * not defended.
 *
 * What must be true:
 *
 *   1. The query carries something from the lesson, so the search can tell
 *      which "base" is meant.
 *   2. The learner's own words survive. Context that replaces the question
 *      answers a question nobody asked.
 *   3. THE PAIR: a doubt that is already unambiguous is not made worse, and an
 *      empty doubt still refuses rather than searching the lesson alone.
 */
import { describe, expect, it, vi } from 'vitest'

import { webResolver } from './webResolver'
import { validateLesson } from '../spec/validate'
import type { Lesson } from '../spec/spec'

const LOGARITHMS: Lesson = (() => {
  const result = validateLesson(
    {
      id: 'logs-fixture',
      question: 'What is a logarithm, and how do I use one?',
      subject: 'Mathematics',
      blocks: [
        /*
         * THE WORD "BASE" IS IN HERE BECAUSE IT IS IN THE REAL LESSON.
         *
         * The first draft of this fixture never said "base", and the test
         * failed against a correct implementation -- the rule asks whether the
         * lesson uses the learner's word, and this lesson did not. That is a
         * fixture inventing a world the product does not have: the shipped
         * logarithms lesson has a "Base" row in its three-parts table, which is
         * exactly why a learner reading it types "what is the base".
         */
        {
          id: 'intro',
          kind: 'prose',
          title: 'The missing count',
          body: 'A logarithm is the missing count. The base is the number doing the multiplying.',
          emphasis: 'primary',
          tone: 'neutral',
        },
      ],
      relations: [],
    },
    { teaching: 'off' },
  )
  if (!result.ok) throw new Error(`fixture does not validate: ${JSON.stringify(result.issues)}`)
  return result.lesson
})()

/** A search that records its query and then reports finding nothing. */
function spyingSearch() {
  return vi.fn(async (_query: string, _options: Record<string, unknown>) => ({
    engineFailed: true as const,
    engineError: 'no engine in this test',
    results: [],
  }))
}

const at = (text: string) => ({ text, atBeatId: 'intro' })

describe('a doubt is searched with the lesson it was asked in', () => {
  /* THE BUG, VERBATIM. "base" alone is BASE jumping. */
  it('disambiguates a word that means something else outside the lesson', async () => {
    const spy = spyingSearch()
    await webResolver({ search: spy }).resolve(at('what is the base'), LOGARITHMS)

    expect(spy).toHaveBeenCalled()
    const query = String(spy.mock.calls[0]![0]).toLowerCase()
    expect(
      /logarithm|mathematics/.test(query),
      `the query was "${query}" — nothing in it says which "base" is meant, so a ` +
        `search engine is free to answer with BASE jumping`,
    ).toBe(true)
  })

  /* Context must ADD, never replace. */
  it('still carries the learner’s own words', async () => {
    const spy = spyingSearch()
    await webResolver({ search: spy }).resolve(at('what is the base'), LOGARITHMS)
    const query = String(spy.mock.calls[0]![0]).toLowerCase()
    expect(query, `the query was "${query}" and lost the word the learner typed`).toContain('base')
  })

  /* THE PAIR, half one. An already-specific doubt must not be harmed. */
  it('leaves an unambiguous doubt still recognisable', async () => {
    const spy = spyingSearch()
    await webResolver({ search: spy }).resolve(at('what is photosynthesis'), LOGARITHMS)
    const query = String(spy.mock.calls[0]![0]).toLowerCase()
    expect(query).toContain('photosynthesis')
  })

  /*
   * A MUTANT SURVIVED HERE, WHICH MEANT NOTHING COULD SEE THE CAP.
   *
   * Deleting `if (context.length === MAX_CONTEXT_TERMS) break` turned no test
   * red, because the fixture above has a short question and the cap never
   * bound. A limit no test can reach is a limit that quietly stops existing.
   */
  it('adds at most two lesson words, however long the lesson question is', async () => {
    const wordy = validateLesson(
      {
        id: 'wordy-fixture',
        question:
          'How does exponential growth compare against polynomial growth across large populations?',
        blocks: [
          {
            id: 'intro',
            kind: 'prose',
            title: 'Growth',
            body: 'The base of an exponential decides how fast it climbs.',
            emphasis: 'primary',
            tone: 'neutral',
          },
        ],
        relations: [],
      },
      { teaching: 'off' },
    )
    if (!wordy.ok) throw new Error('wordy fixture does not validate')

    const spy = spyingSearch()
    await webResolver({ search: spy }).resolve(at('what is the base'), wordy.lesson)
    const words = String(spy.mock.calls[0]![0]).split(' ')
    expect(
      words.length,
      `the query was "${words.join(' ')}" — the learner typed one word and got ${words.length}`,
    ).toBeLessThanOrEqual(3)
  })

  /*
   * A SECOND SURVIVING MUTANT. Removing the "have I said this already" check
   * changed no result, because no fixture had the doubt's word in the lesson
   * QUESTION as well as its body. A learner asking about the very thing the
   * lesson is named after is not an edge case, it is the common case.
   */
  it('does not repeat a word the learner already typed', async () => {
    const spy = spyingSearch()
    await webResolver({ search: spy }).resolve(at('logarithm'), LOGARITHMS)
    const words = String(spy.mock.calls[0]![0]).toLowerCase().split(' ')
    const repeats = words.filter((w) => w === 'logarithm').length
    expect(repeats, `the query was "${words.join(' ')}"`).toBe(1)
  })

  /*
   * THE GATE THAT SAID PASS.
   *
   * Fixing the query alone is half a fix. `usablePages` asks "is this page
   * about what was asked", and it was handed the doubt's words only -- so the
   * BASE jumping article, which contains the word "base", was judged to be
   * about it and shown. A wrong page can still come back from any search
   * engine; the aboutness check is the thing that must refuse it, and it could
   * not, because it was looking at the same ambiguous word.
   *
   * This is defence in depth: the query stops most wrong pages arriving, and
   * this stops the ones that arrive anyway.
   */
  it('refuses a page that matches the ambiguous word but not the lesson', async () => {
    const baseJumping = async () => ({
      engineFailed: false as const,
      results: [
        {
          ok: true as const,
          suspicious: false,
          title: 'BASE jumping',
          finalUrl: 'https://en.wikipedia.org/wiki/BASE_jumping',
          hit: { url: 'https://en.wikipedia.org/wiki/BASE_jumping', title: 'BASE jumping' },
          readerText:
            'BASE jumping is the activity of jumping from fixed objects such as buildings, ' +
            'antennas, spans and earth, using a parachute to descend safely to the ground. ' +
            'The base of the object is where the jumper begins.',
        },
      ],
    })

    const result = await webResolver({ search: baseJumping }).resolve(
      at('what is the base'),
      LOGARITHMS,
    )

    const shown = result.kind === 'answer' ? JSON.stringify(result.lesson) : ''
    expect(
      /parachute|jumping/i.test(shown),
      'a BASE jumping article was shown to a learner reading a logarithms lesson',
    ).toBe(false)

    /*
     * AND REFUSED FOR THE RIGHT REASON.
     *
     * Without this line the test passed on its first run -- a smell, and it was
     * one. A probe showed the article sailed through the aboutness check and
     * was refused further down by "could not render them safely", which is luck
     * about this fixture's shape, not the gate doing its job. A real article
     * that happened to render would have been shown.
     *
     * Asserting the REASON is what makes this test about the gate rather than
     * about the outcome.
     */
    expect(result.kind).toBe('refusal')
    if (result.kind !== 'refusal') return
    expect(
      result.reason,
      `refused, but for the wrong reason: "${result.reason}". The aboutness check ` +
        `is what must reject this page.`,
    ).toMatch(/not about what you asked/i)
  })

  /* THE PAIR, half two. Context must not rescue a doubt that names nothing --
     otherwise every filler question searches the lesson title and gets an
     article that reads like an answer. */
  it('still refuses a doubt made entirely of filler', async () => {
    const spy = spyingSearch()
    const result = await webResolver({ search: spy }).resolve(at('can you please'), LOGARITHMS)
    expect(spy, 'a doubt naming nothing must not reach the search at all').not.toHaveBeenCalled()
    expect(result.kind).toBe('refusal')
  })
})
