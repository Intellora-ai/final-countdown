// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { logarithms } from '../canvas/lessons/logarithms'
import type { Lesson } from '../canvas/spec/spec'
import { validateLesson } from '../canvas/spec/validate'
import { TeachView } from '../canvas/teach/TeachView'
import { resetTeachProgress } from '../canvas/teach/teachStore'

/**
 * S4 -- "NEVER THE WHOLE LESSON AT ONCE", THE HALF THAT WAS NOT YET PINNED
 * AT THE SCREEN: DEEPER MATERIAL IS OFFERED BY NAME AND SHOWN ONLY ON A YES.
 *
 * `TeachView.test.tsx` already proves, on the real view, that a lesson
 * arrives one beat at a time and that earlier beats stay. What it could not
 * prove -- its fixture has no `deeper` block -- is the rule stated in the
 * authoring prompt: "Everything you could go on to … is depth 'deeper' …
 * The learner is asked by name before any of it is shown." `beats.ts` ends a
 * beat at the core/deeper boundary and phrases the offer ("I can go further
 * into <name> — shall I?"); `teaching.ts` refuses a lesson whose deeper
 * material sits before the summary. This law asks the screen.
 *
 * THE LOGARITHMS LESSON is the one reference with deeper blocks: eight of
 * them, from "The product law" to "The mistake almost everyone makes", all
 * after the summary.
 */

afterEach(cleanup)
afterEach(() => { resetTeachProgress() })

function fixture(): Lesson {
  const result = validateLesson(logarithms)
  if (!result.ok) throw new Error(`the logarithms reference does not validate: ${JSON.stringify(result.issues)}`)
  return result.lesson
}

const DEEPER_TITLES = ['The product law', 'Why that is true', 'Check it with numbers', 'Where a logarithm stops working', 'So these are not logarithms', 'Now solve one', 'The mistake almost everyone makes']

async function settle(): Promise<void> {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
}

async function teach() {
  const view = render(<TeachView lesson={fixture()} mode="2d" />)
  await settle()
  return view
}

async function say(text: string): Promise<void> {
  const field = screen.getByLabelText('Answer the question, or ask one of your own')
  fireEvent.change(field, { target: { value: text } })
  fireEvent.submit(field.closest('form') as HTMLFormElement)
  await settle()
}

function deeperOnScreen(): string[] {
  return DEEPER_TITLES.filter((title) => screen.queryByText(title) !== null)
}

/** Answer core beats until the view offers to go further, bounded. */
async function reachTheOffer(): Promise<string> {
  for (let guard = 0; guard < 30; guard += 1) {
    const question = document.querySelector('.lc-teach__question')?.textContent ?? ''
    if (/go further|go on|shall I/i.test(question)) return question
    expect(deeperOnScreen(), `deeper material appeared before it was offered (after ${guard} answers)`).toEqual([])
    await say('a logarithm is the power you raise the base to')
  }
  throw new Error('the core never ended with an offer to go further')
}

describe('LAW S4 -- deeper material is offered by name, and shown only when she says yes', () => {
  it('first paint shows no deeper block', async () => {
    await teach()
    expect(deeperOnScreen()).toEqual([])
  })

  it('the core ends with an offer that names what comes next', async () => {
    await teach()
    const offer = await reachTheOffer()
    expect(offer.toLowerCase()).toContain('product law')
    expect(deeperOnScreen()).toEqual([])
  })

  it('saying no keeps the deeper material off the screen', async () => {
    await teach()
    await reachTheOffer()
    await say('no thanks')
    expect(deeperOnScreen(), 'she said no and was shown it anyway').toEqual([])
  })

  it('saying yes brings the deeper material, gated behind the yes and never before it', async () => {
    await teach()
    await reachTheOffer()
    await say('yes')
    expect(deeperOnScreen(), 'yes did not bring the named part').toContain('The product law')
  })

  /*
   * A KNOWN GAP, PINNED HONESTLY RATHER THAN HIDDEN.
   *
   * The offer names ONE thing -- "I can go further into the product law" --
   * and a single yes reveals the WHOLE deeper section: the product law, and
   * "now solve one", and "the mistake almost everyone makes", all at once.
   * That is because logarithms carries one figure across its seven deeper
   * blocks, and `checkBeats` requires every beat to show something, so the
   * seven are structurally one beat.
   *
   * This is a real shortfall against "offered by name, one part at a time":
   * the name promises less than the yes delivers. It is asserted here as the
   * CURRENT behaviour, deliberately, so the day the deeper section is cut into
   * named parts this test goes red and is updated on purpose -- not so anyone
   * mistakes today's behaviour for the goal. The general guarantee that DOES
   * hold for every lesson (first paint is core; nothing deeper before the
   * offer; a no keeps it off) is the block of tests above.
   */
  it('KNOWN GAP: the offer names one part, but one yes reveals the whole deeper section (single-picture deeper section)', async () => {
    await teach()
    await reachTheOffer()
    await say('yes')
    /* The named part AND parts well past it are on screen after ONE yes. When
       the deeper section is cut into named parts, only "The product law" will
       be here and this goes red -- update it on purpose then. */
    const shown = deeperOnScreen()
    expect(shown, 'the named part is missing').toContain('The product law')
    expect(shown.length, 'if only the named part shows, the gap is closed -- update this test on purpose').toBeGreaterThan(1)
    expect(shown, 'the last, unnamed part came on the same single yes').toContain('The mistake almost everyone makes')
  })
})
