// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import CanvasRoute from './CanvasRoute'
import { resetTeachProgress } from './teach/teachStore'

/**
 * A LEARNER WHO CANNOT GET IN, WHICH IS THE ONLY FAILURE THAT COSTS EVERYTHING.
 *
 * WHY THIS FILE EXISTS, AND WHAT IT COST TO LEARN.
 *
 * A person opened this canvas on a real machine, typed "hi", was asked what he
 * wanted; typed "no", was asked the SAME sentence again; and reported the
 * product broken. The server log for that sitting shows eleven consecutive
 * `ASK_CLARIFICATION` decisions. Every one of them was CORRECT -- a tutor must
 * not teach "hi" -- and every one of them rendered a screen that was
 * character-for-character the previous screen, with no control for any of the
 * four things its own sentence offered to do.
 *
 * Nothing anywhere caught it. Not the unit suites, which asked with real
 * topics; not the laws, which prove a REFUSAL is honest and a lesson teaches;
 * not the e2e scenes, which drive a learner who already knows what to type.
 * Every one of them tests a person who succeeds. The failure lives entirely in
 * the second, third and eleventh try of a person who is failing, and no test
 * had ever pressed that path.
 *
 * So this file is written from the chair, not from the code:
 *
 *   1. The FIRST question back is left exactly as the tutor phrased it. The
 *      product is allowed to ask, and this must not become a test that forbids
 *      it -- an over-eager fix that dumped help on the first ask would be
 *      noise for everyone who simply mistyped once.
 *   2. The SECOND question back must LOOK DIFFERENT, because two identical
 *      screens is what a person reads as a dead page.
 *   3. There must be a door that works. Pressing it must ask for a lesson --
 *      not open a canned one, which is the failure mode this product exists to
 *      refuse.
 *   4. Once a lesson arrives, the extra help goes away, and a later stumble
 *      starts the count again. Help that never leaves is furniture.
 *
 * WHAT IS FAKED: only `fetch`, at the seam the product already has. The real
 * component, the real state machine, the real decision to ask back.
 */

/** What every call to `fetch` saw. */
let wentTo: { url: string; method: string; body: unknown }[]
/** What the ask answers with, decided per call so a run can change mid-sitting. */
let theAskAnswers: () => Response

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

/** The shape `handler.ts` returns for ASK_CLARIFICATION: not an error, a question. */
function aQuestionBack(): Response {
  return jsonResponse(200, {
    clarify: true,
    question:
      'I want to get this right — what would you like me to do? Teach you something new, '
      + 'go over something again, answer a question, or give you problems to practise?',
  })
}

/**
 * A lesson that really passes `validateLesson`, so the success path is the
 * product's own and not a shape only this file believes in. Shaped after the
 * fixture in `CanvasRoute.test.tsx`, with the question swapped per call.
 */
function aRealLesson(question: string): Response {
  return jsonResponse(200, {
    lesson: {
      id: `lesson-${question.replace(/\s+/g, '-')}`,
      question,
      blocks: [
        {
          id: 'what-it-is',
          kind: 'prose',
          emphasis: 'primary',
          role: 'definition',
          body: `${question} is explained here, in a sentence a learner can hold on to.`,
          terms: [{ text: 'explained', mark: 'key' }],
        },
        {
          id: 'the-steps',
          kind: 'flow',
          emphasis: 'supporting',
          role: 'framework',
          caption: 'The same idea, laid out rather than described.',
          nodes: [
            { id: 'one', label: 'the first thing that happens' },
            { id: 'two', label: 'the second thing that happens' },
            { id: 'three', label: 'what is true at the end' },
          ],
          links: [
            { from: 'one', to: 'two' },
            { from: 'two', to: 'three' },
          ],
        },
        {
          id: 'worth-keeping',
          kind: 'summary',
          emphasis: 'supporting',
          role: 'summary',
          mentalModel: 'One sentence to carry away from this.',
          progression: ['the first thing', 'the second thing', 'what is true at the end'],
        },
      ],
      relations: [
        { from: 'the-steps', kind: 'supports', to: 'what-it-is' },
        { from: 'worth-keeping', kind: 'supports', to: 'what-it-is' },
      ],
    },
  })
}

beforeEach(() => {
  wentTo = []
  theAskAnswers = aQuestionBack
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit): Promise<Response> => {
      const url = String(input)
      const method = (init?.method ?? 'GET').toUpperCase()
      wentTo.push({
        url,
        method,
        body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      })
      if (url === '/api/situation' && method === 'GET') return jsonResponse(200, { openLoops: [] })
      if (url === '/api/situation' && method === 'PUT') return jsonResponse(200, { opened: true })
      if (url === '/api/ask') return theAskAnswers()
      throw new Error(`nothing in this test should reach ${method} ${url}`)
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  resetTeachProgress()
})

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function canvas() {
  return render(
    <MemoryRouter>
      <CanvasRoute />
    </MemoryRouter>,
  )
}

/**
 * The box she is actually looking at.
 *
 * There are two in the document once the canvas is open -- one in the header
 * strip and one in the middle of the empty stage -- and the middle one is the
 * only one on screen in the state this file is about. `getByLabelText` throws
 * on the pair, which is itself worth knowing: any test that says "the box"
 * without saying WHICH is describing a screen it has not looked at.
 */
function topicBox(): HTMLInputElement {
  const boxes = screen.getAllByLabelText('A topic to be taught') as HTMLInputElement[]
  return boxes[boxes.length - 1] as HTMLInputElement
}

/** Type it and press the button beside it, the way a person does. */
async function sheTypes(what: string): Promise<void> {
  const box = topicBox()
  fireEvent.change(box, { target: { value: what } })
  fireEvent.submit(box.closest('form') as HTMLFormElement)
  await settle()
  await settle()
}

/** Everything the ask was ever sent, in order. */
function questionsAsked(): string[] {
  return wentTo
    .filter((call) => call.url === '/api/ask')
    .map((call) => (call.body as { question?: string } | undefined)?.question ?? '')
}

/** The pressable examples, if the screen is offering any. */
function doorsOut(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll('.lc-ask-examples button'))
}

describe('she types something that is not a subject, twice', () => {
  it('asks back plainly the first time, and adds nothing she did not need', async () => {
    canvas()
    await settle()
    await sheTypes('hi')

    /* The tutor's own sentence, untouched. */
    expect(
      screen.queryByText(/what would you like me to do/i),
      'the question the tutor asked was not shown',
    ).not.toBeNull()
    expect(
      doorsOut(),
      'one mistype was met with a pile of help nobody asked for',
    ).toHaveLength(0)
  })

  it('changes the screen the second time, instead of repeating itself', async () => {
    canvas()
    await settle()
    await sheTypes('hi')
    const afterFirst = document.body.textContent ?? ''
    await sheTypes('no')
    const afterSecond = document.body.textContent ?? ''

    /* THE ASSERTION THAT WOULD HAVE CAUGHT IT. Two identical screens is the
       whole bug: nothing on the second one proves her words arrived. */
    expect(
      afterSecond,
      'the second refusal was word-for-word the first -- a frozen page, from the chair',
    ).not.toBe(afterFirst)
    expect(
      screen.queryByText(/waiting for a subject/i),
      'nothing on screen said what it was actually waiting for',
    ).not.toBeNull()
  })

  it('offers a door, and the door asks for a lesson rather than opening a canned one', async () => {
    canvas()
    await settle()
    await sheTypes('hi')
    await sheTypes('no')

    const doors = doorsOut()
    expect(doors.length, 'she was left with prose and no way through').toBeGreaterThan(0)

    /* Unrelated subjects, so the screen cannot be read as "this is all it knows". */
    const labels = doors.map((b) => b.textContent?.trim() ?? '')
    expect(new Set(labels).size, 'the examples repeat themselves').toBe(labels.length)

    theAskAnswers = () => aRealLesson(labels[0] ?? '')
    const asksBefore = questionsAsked().length
    fireEvent.click(doors[0] as HTMLButtonElement)
    await settle()
    await settle()

    /* PRESSED MEANS ASKED. A button that opened a lesson already sitting in the
       bundle would be the one thing this product refuses to do: hand back
       something nobody wrote for her. */
    const asked = questionsAsked()
    expect(asked.length, 'the example was opened without ever asking for a lesson').toBe(asksBefore + 1)
    expect(asked[asked.length - 1], 'the button asked for something other than its own label').toBe(labels[0])
  })

  it('takes the help away once a lesson arrives, and offers it again only if she gets stuck again', async () => {
    canvas()
    await settle()
    await sheTypes('hi')
    await sheTypes('no')
    expect(doorsOut().length, 'the setup for this test did not get stuck').toBeGreaterThan(0)

    theAskAnswers = () => aRealLesson('photosynthesis')
    await sheTypes('photosynthesis')
    expect(
      doorsOut(),
      'the stuck help stayed on screen after she was taught -- help that never leaves is furniture',
    ).toHaveLength(0)

    /* And the count really restarted: ONE question back after a lesson is a
       first stumble again, not a continuation of the old run. */
    theAskAnswers = aQuestionBack
    await sheTypes('hmm')
    expect(
      doorsOut(),
      'one stumble after a good lesson was treated as if she had been stuck all along',
    ).toHaveLength(0)
    await sheTypes('ok')
    expect(doorsOut().length, 'stuck twice again, and this time nothing helped').toBeGreaterThan(0)
  })
})
