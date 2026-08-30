// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import TutorView from './TutorView'

/**
 * THE VIEW, WITH A PUBLISHED KEY SITTING IN ITS ENVIRONMENT.
 *
 * `backendModel.test.ts` proves the PORT sends no credential. This proves the
 * VIEW reaches for that port by default -- which is the half a unit test of the
 * port cannot cover, and the half that was actually broken. `TutorView` used to
 * read `VITE_TUTOR_KEY` and hand it to `httpModel`, so the key travelled
 * whenever the endpoint was local, and the bundle carried it either way.
 *
 * THE ORACLE IS THE NETWORK, NOT A SPY ON THE PORT. Every request the component
 * makes while answering one question is captured, and the assertions are made
 * over the bytes: where they went, what headers they carried, and whether the
 * key appears anywhere in them. A spy on `backendModel` would pass against a
 * component that also called a provider directly.
 */

/* This project's jsdom environment provides no localStorage; TutorView reads it
 * unguarded on mount. A real in-memory Storage, not a spy, so the save path
 * behaves as it does in a browser. */
function installMemoryStorage(): void {
  const map = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => {
      map.delete(k)
    },
    setItem: (k, v) => {
      map.set(k, String(v))
    },
  }
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage })
}

const PUBLISHED_KEY = 'sk-ant-THIS-MUST-NEVER-REACH-THE-WIRE'

const ANSWER = 'The discriminant tells you how many real roots a quadratic has.'

const LESSON = {
  lesson: {
    id: 'discriminant',
    question: 'explain the discriminant',
    blocks: [{ id: 'b1', kind: 'prose', body: ANSWER }],
    relations: [],
    technicalTerms: [],
  },
}

interface Sent {
  url: string
  init: RequestInit
}

let sent: Sent[]

beforeEach(() => {
  installMemoryStorage()
  Element.prototype.scrollIntoView = () => {}

  /* A key in the environment, exactly as a careless `.env` would leave it.
     The point of the test is that setting this changes nothing on the wire. */
  vi.stubEnv('VITE_TUTOR_KEY', PUBLISHED_KEY)
  vi.stubEnv('VITE_TUTOR_MODEL', 'claude-opus-5')

  sent = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    sent.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify(LESSON), { status: 200 })
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

async function askOnce(text: string): Promise<void> {
  const input = screen.getByLabelText(/ask the tutor/i)
  fireEvent.change(input, { target: { value: text } })
  const button = screen.getByRole('button', { name: /ask|thinking/i })
  await act(async () => {
    fireEvent.click(button)
    await Promise.resolve()
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
}

describe('the tutor with no endpoint configured', () => {
  it('asks this project own backend, not a model provider', async () => {
    render(<TutorView />)
    await askOnce('explain the discriminant')

    expect(sent.map((s) => s.url)).toEqual(['/api/ask'])
  })

  it('sends no credential, even though VITE_TUTOR_KEY is set', async () => {
    render(<TutorView />)
    await askOnce('explain the discriminant')

    /* NON-VACUITY FIRST. A "does not contain" assertion over an empty list
       passes against a component that made no request at all -- which is
       exactly the state this test was written in, and it went green. */
    expect(sent).toHaveLength(1)

    const everything = sent
      .map((s) => `${s.url} ${JSON.stringify(s.init.headers)} ${String(s.init.body)}`)
      .join(' ')
    expect(everything).not.toContain(PUBLISHED_KEY)
    expect(everything.toLowerCase()).not.toContain('authorization')
  })

  it('shows the answer the backend wrote, so the route is proved end to end', async () => {
    render(<TutorView />)
    await askOnce('explain the discriminant')

    expect(screen.getByText(ANSWER)).toBeInTheDocument()
  })

  it('no longer tells the student that no model is configured', async () => {
    render(<TutorView />)

    /* The old banner said "No model is configured, so every answer below will
       say it could not be produced." With the backend as the default that
       sentence is false, and a false warning trains people to ignore warnings. */
    expect(screen.queryByText(/No model is configured/i)).toBeNull()
  })
})
