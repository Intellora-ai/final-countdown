// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import CanvasRoute from './CanvasRoute'
import { resetTeachProgress } from './teach/teachStore'

/**
 * The canvas's half of the open-loop ledger, driven the way a learner drives it.
 *
 * WHY THIS FILE EXISTS. Law G ("her unfinished question is waiting when she
 * returns") went red in four browsers on four consecutive CI runs while every
 * SERVER test of `/api/situation` stayed green -- the route, the ledger, the
 * identity cookie, all proven. What nobody had ever tested was the browser's
 * side of the same contract: that an ask which ends without an answer actually
 * SENDS the ledger write, and that a loop the server hands back on arrival
 * actually BECOMES the return card. Each of those is a join that existed only
 * in `CanvasRoute.tsx`, rendered by no test that also stubbed the route.
 *
 * WHAT IS FAKED: only the network, at the seam the product already has. The
 * real component, the real client (`situation.ts`), the real classification
 * of endings. Both directions are asserted, because a ledger client has two
 * ways to lie: sending nothing, and painting a card nobody owes.
 */

const HER_QUESTION = 'how do i knit a woollen scarf for winter'

/** What every call to `fetch` saw. */
let wentTo: { url: string; method: string; body: unknown }[]
/** What the arrival read of the ledger answers with. */
let herOpenLoops: unknown[]
/** What the ask answers with. */
let theAskAnswers: () => Response

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

beforeEach(() => {
  wentTo = []
  herOpenLoops = []
  theAskAnswers = () => jsonResponse(503, { error: 'the tutor is not configured on this server' })
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
      if (url === '/api/situation' && method === 'GET') return jsonResponse(200, { openLoops: herOpenLoops })
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

function topicBox(): HTMLInputElement {
  return screen.getByLabelText('A topic to be taught') as HTMLInputElement
}

async function sheAsks(question: string): Promise<void> {
  fireEvent.change(topicBox(), { target: { value: question } })
  fireEvent.click(screen.getByRole('button', { name: /^(send|teach me)$/i }))
  await settle()
  await settle()
}

function ledgerWrites() {
  return wentTo.filter((call) => call.url === '/api/situation' && call.method === 'PUT')
}

describe('an ask that ends without an answer is written to the ledger', () => {
  it('records the debt when the server refuses her question', async () => {
    canvas()
    await settle()
    await sheAsks(HER_QUESTION)

    const writes = ledgerWrites()
    expect(writes, 'the refusal left no trace in the ledger').toHaveLength(1)
    expect(writes[0]?.body).toEqual({ question: HER_QUESTION, lesson: '', stalled: 'refused' })
  })

  it('records the debt as a question back too, since that is still no answer', async () => {
    theAskAnswers = () => jsonResponse(200, { clarify: 'Which subject is that for?' })
    canvas()
    await settle()
    await sheAsks(HER_QUESTION)

    const writes = ledgerWrites()
    expect(writes, 'a clarifying question back was not recorded as a debt').toHaveLength(1)
    expect(writes[0]?.body).toMatchObject({ question: HER_QUESTION, stalled: 'refused' })
  })

  it('records nothing reachable as "failed", never as "refused"', async () => {
    theAskAnswers = () => {
      throw new TypeError('fetch failed: ECONNREFUSED 127.0.0.1:8787')
    }
    canvas()
    await settle()
    await sheAsks(HER_QUESTION)

    const writes = ledgerWrites()
    expect(writes, 'a dead server left no trace in the ledger').toHaveLength(1)
    expect(writes[0]?.body).toMatchObject({ question: HER_QUESTION, stalled: 'failed' })
  })
})

describe('a loop the server hands back on arrival becomes the return card', () => {
  it('paints one card carrying her own words, and pressing it asks again', async () => {
    herOpenLoops = [{ question: HER_QUESTION, lesson: '', stalled: 'refused', at: '2026-09-02T00:00:00Z' }]
    const { container } = canvas()
    await settle()
    await settle()

    const card = container.querySelector('.lc-return-card')
    expect(card, 'her unfinished question is not waiting for her').not.toBeNull()
    expect(card?.textContent ?? '').toContain(HER_QUESTION)

    fireEvent.click(screen.getByRole('button', { name: /ask it again/i }))
    await settle()
    expect(topicBox().value, 'pressing the card did not carry her words into the box').toBe(HER_QUESTION)
    expect(container.querySelector('.lc-return-card'), 'the card nags after being pressed').toBeNull()
  })

  it('paints nothing when the server owes her nothing', async () => {
    herOpenLoops = []
    const { container } = canvas()
    await settle()
    await settle()
    expect(container.querySelector('.lc-return-card'), 'a card was painted for a debt nobody owes').toBeNull()
  })
})
