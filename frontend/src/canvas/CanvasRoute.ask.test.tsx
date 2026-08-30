// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { TeachView } from './teach/TeachView'
import { classifierEvaluation } from './lessons/classifierEvaluation'
import { validateLesson } from './spec/validate'
import type { Lesson } from './spec/spec'

/*
 * THE SAME PRODUCT MUST NOT ANSWER DIFFERENTLY DEPENDING ON WHICH DOOR YOU
 * CAME IN.
 *
 * `/canvas` is a real user route, not a test fixture: `App.tsx:177` intercepts
 * the path before the router and renders `CanvasRoute` full-screen, and
 * `/canvas/gas` and `/canvas/lessons` both redirect into it so an old bookmark
 * still lands somewhere.
 *
 * `CanvasRoute.tsx:483` rendered `<TeachView>` with `resolvers` and NO `ask`
 * prop. `TeachView` falls back to
 *
 *     ask: askPort ?? (async () => ({ ok: false, reason: 'no question service is configured' }))
 *
 * so the chain's last rung could never escalate. A learner on `/canvas` who
 * asked something the lesson does not cover reached a dead end -- while the
 * identical question on `/learn/:conceptId` was answered, because `LearnView`
 * passes `ask={(question) => client.ask(question)}`.
 *
 * Same class as everything else found today -- a capability present on both
 * sides and not connected, like `sameAgain` being unimported and
 * `VITE_TUTOR_*` being unset -- and the only one of them a user meets.
 *
 * TESTED AT THE PROP, NOT THROUGH THE ROUTE. `CanvasRoute` lazy-loads three.js
 * scene renderers and reads a dozen environment variables; rendering it in
 * jsdom would test the mocking. What is in doubt is one prop and what happens
 * without it, so that is what these assert.
 */

afterEach(cleanup)

function fixture(): Lesson {
  const result = validateLesson(classifierEvaluation)
  if (!result.ok) throw new Error(`fixture does not validate: ${JSON.stringify(result.issues)}`)
  return result.lesson
}

/** A doubt this lesson genuinely cannot answer, so the chain must escalate.
 *  Asking it something it DOES cover would be answered by `lessonResolver` and
 *  the escalation would never be reached -- which is exactly how the first
 *  version of the journey test passed while crossing no boundary. */
const OUTSIDE_THE_LESSON = 'what is photosynthesis?'

async function askOutside(): Promise<void> {
  const field = screen.getByLabelText('Answer the question, or ask one of your own')
  const { fireEvent, act } = await import('@testing-library/react')
  fireEvent.change(field, { target: { value: OUTSIDE_THE_LESSON } })
  fireEvent.submit(field.closest('form') as HTMLFormElement)
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('the canvas can escalate a doubt its lesson cannot answer', () => {
  it('reaches the ask port when one is given', async () => {
    const ask = vi.fn(async () => ({ ok: true as const, text: 'Plants turn light into food.' }))
    render(<TeachView lesson={fixture()} mode="2d" ask={ask} />)
    await askOutside()

    expect(
      ask,
      'a question outside the lesson never reached the escalation port',
    ).toHaveBeenCalled()
  })

  it('tells the learner it is not configured when no port is given', async () => {
    /*
     * THE BUG, PINNED. Without a port the learner is told the service is not
     * configured -- which is true of the code and useless to them. This test
     * exists so the fallback stays a genuine last resort and never becomes the
     * normal path again.
     */
    const { container } = render(<TeachView lesson={fixture()} mode="2d" />)
    await askOutside()

    /* Asserted on what the LEARNER reads, not on the internal reason. The
       screen translates `no question service is configured` into "I could not
       reach the part of me that answers questions outside this lesson" -- which
       is the right thing to say and still a dead end. Quoting the internal
       string here would have pinned a layer the learner never sees, and would
       go red the day somebody improves the wording without changing anything
       that matters. */
    expect(container.textContent ?? '').toMatch(
      /could not reach the part of me that answers questions outside this lesson/i,
    )
  })

  it('does not reach for the port on a question the lesson already answers', async () => {
    /*
     * THE PAIR. Escalating everything would spend a network call on every doubt
     * and make the lesson rung pointless -- a cure that costs more than the
     * disease. The chain's whole design is that the offline answer comes first.
     */
    const ask = vi.fn(async () => ({ ok: true as const, text: 'unused' }))
    render(<TeachView lesson={fixture()} mode="2d" ask={ask} />)

    const field = screen.getByLabelText('Answer the question, or ask one of your own')
    const { fireEvent, act } = await import('@testing-library/react')
    fireEvent.change(field, { target: { value: 'what is a false positive?' } })
    fireEvent.submit(field.closest('form') as HTMLFormElement)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(ask, 'a question the lesson covers was escalated anyway').not.toHaveBeenCalled()
  })

  it('CanvasRoute actually hands TeachView an ask port', () => {
    /*
     * THE ASSERTION THAT PINS THE FIX, and the three above do not.
     *
     * Every other test in this file renders `TeachView` directly, so all of
     * them pass whether or not `CanvasRoute` passes the prop -- they describe
     * what `TeachView` does with a port, never whether the route gives it one.
     * The bug was entirely in the route. A test that cannot see the bug it was
     * written for is decoration.
     *
     * Read from source rather than by rendering, the way
     * `teach/ruleCensus.ts` reads `teaching.ts`: `CanvasRoute` lazy-loads
     * three.js scene renderers and reads a dozen environment variables, so
     * rendering it in jsdom would mostly test the mocking.
     */
    const here = dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(join(here, 'CanvasRoute.tsx'), 'utf8')

    const teachView = source.slice(source.indexOf('<TeachView'))
    const props = teachView.slice(0, teachView.indexOf('/>'))

    expect(
      /\bask=/.test(props),
      'CanvasRoute renders TeachView with no ask prop, so a learner on /canvas ' +
        'cannot have a question answered that the lesson does not cover -- while ' +
        'the same question on /learn/:conceptId is answered',
    ).toBe(true)
  })
})
