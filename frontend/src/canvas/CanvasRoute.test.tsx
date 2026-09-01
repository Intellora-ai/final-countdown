// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import CanvasRoute from './CanvasRoute'
import { resetTeachProgress } from './teach/teachStore'

/**
 * The canvas route, driven the way a learner drives it.
 *
 * WHY THIS FILE HAD TO EXIST BEFORE ANYTHING HERE COULD BE TRUSTED
 * ----------------------------------------------------------------
 * `CanvasRoute.tsx` was rendered by ZERO tests. Every part it wires together —
 * the author, the gate, the teaching view — had tests of its own and all of
 * them passed, while the one control on the page that promises to teach
 * anything was disabled for every person who had ever cloned this repository.
 * A defect that lives in the joins is invisible to a suite that only tests the
 * parts.
 *
 * WHAT IS FAKED, AND WHAT IS DELIBERATELY NOT
 * -------------------------------------------
 * Only the NETWORK. `globalThis.fetch` is replaced, which is the seam the
 * product already has. Everything between the learner and that seam is the real
 * thing — the real component, the real `validateLesson`, the real beats, the
 * real teaching view. A test that mocked the author or the gate would prove the
 * fake agrees with itself.
 *
 * NO `VITE_*` VARIABLE IS SET ANYWHERE IN THIS FILE, and that is the condition
 * under test rather than an oversight: there is no `.env` in this repository, so
 * an unset endpoint is what everybody actually has.
 */

/**
 * The lesson the server writes back.
 *
 * Written to clear BOTH gates it meets: `CanvasRoute` re-checks whatever arrives
 * at `'answer'` level, and `TeachView` re-checks whatever it is handed at
 * `'lesson'` level. Its shape follows
 * `lessons/generated/learner-a-first-attempt.json`, engine output that already
 * clears both.
 */
const HER_TOPIC = 'how a snake sheds its skin'
const HER_QUESTION = 'How does a snake shed its skin?'
const HER_LESSON = {
  id: 'how-a-snake-sheds',
  question: HER_QUESTION,
  blocks: [
    {
      id: 'what-shedding-is',
      kind: 'prose',
      emphasis: 'primary',
      role: 'definition',
      body: 'A snake sheds by growing a new skin underneath and crawling out of the old one.',
      terms: [{ text: 'sheds', mark: 'key' }],
    },
    {
      id: 'the-three-steps',
      kind: 'flow',
      emphasis: 'supporting',
      role: 'framework',
      caption: 'The same three steps, laid out rather than described.',
      nodes: [
        { id: 'dull', label: 'the old skin goes dull' },
        { id: 'rub', label: 'the snake rubs its nose on a rock' },
        { id: 'out', label: 'it crawls out and leaves the skin behind' },
      ],
      links: [
        { from: 'dull', to: 'rub' },
        { from: 'rub', to: 'out' },
      ],
    },
    {
      id: 'worth-keeping',
      kind: 'summary',
      emphasis: 'supporting',
      role: 'summary',
      mentalModel: 'The new skin is ready before the old one leaves.',
      progression: [
        'the old skin goes dull',
        'the snake rubs it loose at the nose',
        'it crawls out of the old skin',
      ],
    },
  ],
  relations: [
    { from: 'the-three-steps', kind: 'supports', to: 'what-shedding-is' },
    { from: 'worth-keeping', kind: 'supports', to: 'what-shedding-is' },
  ],
}

/** What every call to `fetch` saw, so a test can say where a request went. */
let wentTo: { url: string; body: unknown }[]

/** What the next `/api/ask` answers with. Set per test. */
let answersWith: () => Response | Promise<Response>

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

/** A 200 whose body is not JSON at all — a proxy's HTML error page, typically. */
function notJson(status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON at position 0')
    },
    text: async () => '<html>gateway</html>',
  } as unknown as Response
}

beforeEach(() => {
  wentTo = []
  answersWith = () => jsonResponse(200, { lesson: HER_LESSON })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit): Promise<Response> => {
      const url = String(input)
      wentTo.push({
        url,
        body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      })
      if (url === '/api/ask') return answersWith()
      throw new Error(`nothing in this test should reach ${url}`)
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  resetTeachProgress()
})

/** Let the lazily imported shape renderers and the pending promises settle. */
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
 * Every word currently on the page, run together.
 *
 * `queryByText` matches one ELEMENT's text, and a marked term is its own
 * element — so a sentence with a key term in it is never one node, and a lookup
 * for the whole sentence finds nothing even while the learner is plainly reading
 * it. Reading the page's text asks the question actually being asked: is this on
 * her screen.
 */
function onScreenText(): string {
  return document.body.textContent ?? ''
}

function topicBox(): HTMLInputElement {
  return screen.getByLabelText('A topic to be taught') as HTMLInputElement
}

function teachButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /Teach me|Writing/ }) as HTMLButtonElement
}

/** Type a topic into the one box and press the button, as she would. */
async function askToBeTaught(topic: string): Promise<void> {
  fireEvent.change(topicBox(), { target: { value: topic } })
  fireEvent.click(teachButton())
  await settle()
}

describe('the button that promises to teach can reach something that teaches', () => {
  it('teaches a learner who has no .env at all — which is everybody who clones this', async () => {
    /* Asserted rather than assumed. If some future setup file quietly set this,
       every test in this file would be exercising the configured path and the
       one they were written for would not be covered at all. */
    expect(
      (import.meta.env as Record<string, string | undefined>)['VITE_TUTOR_ENDPOINT'] ?? '',
      'a tutor endpoint is configured, so this test is not testing what it says',
    ).toBe('')

    canvas()

    expect(
      topicBox().disabled,
      'the one control that promises to teach anything is dead before she can even type in it',
    ).toBe(false)

    await askToBeTaught(HER_TOPIC)

    expect(
      wentTo.map((call) => call.url),
      'nothing was asked to write the lesson',
    ).toContain('/api/ask')
    expect(
      onScreenText(),
      'she asked to be taught and was taught nothing',
    ).toContain(HER_QUESTION)
    expect(
      onScreenText(),
      'the refusal banner is up even though a good lesson came back',
    ).not.toContain('That lesson was refused')
  })

  it('sends her actual question to the server', async () => {
    canvas()
    await askToBeTaught(HER_TOPIC)

    const ask = wentTo.find((call) => call.url === '/api/ask')
    expect(ask, 'the lesson was never commissioned').toBeDefined()
    expect(
      (ask?.body as { question?: unknown } | undefined)?.question,
      'the server was asked about something other than what she typed',
    ).toBe(HER_TOPIC)
  })

  it('says the model could not be reached when the server is not running', async () => {
    answersWith = () => {
      throw new TypeError('fetch failed: ECONNREFUSED 127.0.0.1:8787')
    }
    canvas()
    await askToBeTaught(HER_TOPIC)

    expect(onScreenText(), 'she was told nothing at all').toContain('That lesson was refused')
    expect(
      onScreenText(),
      'a server that is not running was reported as a lesson that does not teach — she is being blamed for a question nobody read',
    ).toContain('could not be reached')
    expect(
      onScreenText(),
      'nothing was written, and she was told her question does not teach',
    ).not.toContain('what it produced does not teach')
  })

  it('tells her it is busy on a 429, rather than blaming her question', async () => {
    answersWith = () => jsonResponse(429, { error: 'rate limited' })
    canvas()
    await askToBeTaught(HER_TOPIC)

    const said = onScreenText()
    expect(said, 'she was told nothing at all').toContain('That lesson was refused')
    expect(said, 'a rate limit was not reported as one, so she has no reason to wait').toContain(
      'busy',
    )
    expect(
      said,
      'being rate limited was reported as her question failing to teach',
    ).not.toContain('what it produced does not teach')
    expect(
      said,
      'being rate limited was reported as an outage, so she will not try again in a minute',
    ).not.toContain('could not be reached')
  })

  it('shows the gate’s own refusal when a 200 carries no lesson', async () => {
    answersWith = () => jsonResponse(200, { nothing: 'useful' })
    canvas()
    await askToBeTaught(HER_TOPIC)

    expect(onScreenText(), 'a 200 with no lesson in it was taken as a lesson').toContain(
      'That lesson was refused',
    )
    expect(
      onScreenText(),
      'a body that is not a lesson was reported as an unreachable model',
    ).toContain('what it produced does not teach')
  })

  it('survives a 200 that is not JSON at all', async () => {
    answersWith = () => notJson()
    canvas()
    await askToBeTaught(HER_TOPIC)

    /* The whole page is still standing. A thrown parse error inside the author
       would take the route down and she would be looking at a blank window. */
    expect(topicBox(), 'the canvas came down when the reply would not parse').toBeTruthy()
    expect(onScreenText(), 'she was told nothing at all').toContain('That lesson was refused')
  })

  it('refuses a lesson from our own server when it does not teach', async () => {
    /* Structurally a lesson, and all words: no representation, no summary. Our
       own server having produced it buys it nothing — the gate is the gate. */
    answersWith = () =>
      jsonResponse(200, {
        lesson: {
          id: 'all-words',
          question: HER_QUESTION,
          blocks: [
            {
              id: 'just-talking',
              kind: 'prose',
              emphasis: 'primary',
              role: 'definition',
              body: 'A snake sheds its skin, which is a thing that snakes do fairly often.',
              terms: [{ text: 'sheds', mark: 'key' }],
            },
          ],
          relations: [],
        },
      })
    canvas()
    await askToBeTaught(HER_TOPIC)

    expect(
      onScreenText(),
      'a lesson that does not teach was shown because it came from our own server',
    ).toContain('That lesson was refused')
    expect(
      onScreenText(),
      'the gate’s own reason was swallowed, so she cannot tell what went wrong',
    ).toContain('what it produced does not teach')
  })
})
