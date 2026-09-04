// @vitest-environment jsdom

/* A server that never answers must not lock her out of her own canvas.
 *
 * WHY THIS TEST EXISTS
 *   Not one of the canvas's three calls to `/api/ask` carried a deadline. A
 *   `fetch` whose promise never settles never rejects, so the `catch` that
 *   reports trouble never runs, `askedForATopic` stays true, and the one
 *   control that promises to teach stays disabled -- for as long as the tab is
 *   open. No error, no message, no way back: the learner is simply locked out,
 *   watching "Writing this for you now" forever.
 *
 *   This is not hypothetical for a product that talks to a hosted model: a
 *   dropped connection on a mobile network, a proxy that holds the socket, or
 *   a vendor stalling under load all produce exactly this -- a request that is
 *   neither answered nor refused. `src/almanac/client.ts` already treats it as
 *   real and carries `LONGEST_WAIT_MS`; the canvas did not.
 *
 * WHAT IT TESTS
 *   Her way out, through the real interface. The component, the gate and the
 *   beats are real; only `globalThis.fetch` is replaced, with a server that
 *   accepts the request and then says nothing at all -- while honouring the
 *   abort signal, as a real network does. Time is moved forward rather than
 *   waited out, so the test is fast and states the deadline it relies on.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import CanvasRoute from './CanvasRoute'
import { resetTeachProgress } from './teach/teachStore'

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

/** How many times a request was started, so a silent server can be told from one never asked. */
let asks: number

beforeEach(() => {
  asks = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit): Promise<Response> => {
      const url = String(input)
      if (url.startsWith('/api/canvas?')) {
        return jsonResponse(200, { artifacts: [], needsAnotherLook: [], student: 'a-student' })
      }
      if (url === '/api/canvas') return jsonResponse(200, { appended: { seq: 1 } })
      if (url === '/api/ask') {
        asks += 1
        /* THE SERVER THAT SAYS NOTHING. It never resolves; it only rejects if
           the caller gives up, which is what a real abort signal does. If the
           product carries no deadline, nothing here ever settles. */
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal
          if (signal == null) return
          signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          })
        })
      }
      throw new Error(`nothing in this test should reach ${url}`)
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  resetTeachProgress()
})

function openTheCanvas() {
  return render(
    <MemoryRouter>
      <CanvasRoute />
    </MemoryRouter>,
  )
}

function onScreenText(): string {
  return document.body.textContent ?? ''
}

function topicBox(): HTMLInputElement {
  return screen.getByLabelText('A topic to be taught') as HTMLInputElement
}

describe('a server that never answers', () => {
  it('gives her the canvas back instead of leaving the box dead forever', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    openTheCanvas()
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    fireEvent.change(topicBox(), { target: { value: 'how a snake sheds its skin' } })
    fireEvent.click(screen.getByRole('button', { name: /Teach me|Writing/ }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    /* Evidence first: the request really was made, so what follows is about a
       silent server and not about a button that never fired. */
    expect(asks, 'no request was ever made, so this proves nothing about waiting').toBe(1)

    /* Long enough that no real answer is still coming. The product's own
       deadline is what must fire inside this window. */
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000) })

    expect(
      topicBox().disabled,
      'two minutes after a server went silent, the one control that promises to teach is still dead',
    ).toBe(false)
    expect(
      onScreenText(),
      'she is left with no word at all about why nothing arrived',
    ).toMatch(/could not|not written|try again|too long|took too long/i)
  })
})
