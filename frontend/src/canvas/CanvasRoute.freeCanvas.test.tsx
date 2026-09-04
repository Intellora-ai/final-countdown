// @vitest-environment jsdom

/* The free canvas must survive a refresh.
 *
 * WHY THIS TEST EXISTS
 *   `/canvas` with no topic is the surface the front door opens onto — the box
 *   that says "What do you want to learn?". Every lesson written there IS sent
 *   to the server: `CanvasRoute` calls `appendToCanvas(topicId ?? '', …)`, so a
 *   free-canvas lesson is stored under the key `#canvas` and the server answers
 *   with the row it was given.
 *
 *   It was never read back. The effect that brings a canvas back as it was left
 *   began `if (topicId === null) return`, and `topicId` is null for exactly this
 *   surface. So the product saved a learner's work correctly and then refused to
 *   look for it.
 *
 *   MEASURED in a real browser on 2026-09-04, against the running dev server:
 *   two lessons were taught on `/canvas` (photosynthesis, then the Doppler
 *   effect), both were on screen, and `location.reload()` returned the page to
 *   "What do you want to learn?" with both gone. The rows were on the server the
 *   whole time.
 *
 * WHAT IT TESTS
 *   The learner's day, not a function: she is taught, the tab goes away, she
 *   opens it again, and her lesson is still there. The component, the gate and
 *   the memory client are all real; only `globalThis.fetch` is replaced, and the
 *   fake behind it is an append-only store that answers reads with what writes
 *   actually put in it — so a canvas that is never read back cannot pass by
 *   being handed its answer.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import CanvasRoute from './CanvasRoute'
import { resetTeachProgress } from './teach/teachStore'

const HER_QUESTION = 'How does a snake shed its skin?'
const HER_SENTENCE =
  'A snake sheds by growing a new skin underneath and crawling out of the old one.'
const HER_LESSON = {
  id: 'how-a-snake-sheds',
  question: HER_QUESTION,
  blocks: [
    {
      id: 'what-shedding-is',
      kind: 'prose',
      emphasis: 'primary',
      role: 'definition',
      body: HER_SENTENCE,
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

/**
 * The server, as far as this test is concerned: an append-only table of rows,
 * keyed by the `lessonId` the client actually sends.
 *
 * IT ANSWERS READS FROM WHAT WRITES PUT IN IT. A stub that returned a fixed
 * artifact list would pass even if the page asked for the wrong key, or never
 * asked at all — which is the entire defect under test.
 */
let stored: Map<string, { seq: number; createdAt: string; artifact: unknown }[]>
let readsFor: string[]

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

beforeEach(() => {
  stored = new Map()
  readsFor = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit): Promise<Response> => {
      const url = String(input)
      if (url === '/api/ask') return jsonResponse(200, { lesson: HER_LESSON })
      if (url.startsWith('/api/canvas?')) {
        const key = new URL(url, 'http://localhost').searchParams.get('lessonId') ?? ''
        readsFor.push(key)
        return jsonResponse(200, {
          artifacts: stored.get(key) ?? [],
          needsAnotherLook: [],
          student: 'a-student',
        })
      }
      if (url === '/api/canvas') {
        const body = JSON.parse(String(init?.body)) as { lessonId: string; artifact: unknown }
        const rows = stored.get(body.lessonId) ?? []
        /* The row shape the real server returns: the artifact NESTED, beside
           its own sequence number -- see `anArtifact` in memoryClient. */
        const row = { seq: rows.length + 1, createdAt: '2026-09-04T00:00:00.000Z', artifact: body.artifact }
        stored.set(body.lessonId, [...rows, row])
        return jsonResponse(200, { appended: { seq: row.seq } })
      }
      throw new Error(`nothing in this test should reach ${url}`)
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

async function askToBeTaught(topic: string): Promise<void> {
  fireEvent.change(screen.getByLabelText('A topic to be taught'), { target: { value: topic } })
  fireEvent.click(screen.getByRole('button', { name: /Teach me|Writing/ }))
  await settle()
  await settle()
}

describe('the free canvas keeps what it was given', () => {
  it('shows her lesson again after she closes the tab and opens it', async () => {
    openTheCanvas()
    await settle()
    await askToBeTaught('how a snake sheds its skin')

    /* Evidence first: she was actually taught, and the server actually holds it.
       Without this, a page that is blank in both halves would "pass". */
    expect(onScreenText(), 'she was never taught in the first place').toContain(HER_SENTENCE)
    expect(
      [...stored.keys()],
      'the free canvas never sent the lesson to the server at all',
    ).toContain('#canvas')

    /* The tab goes away, and she opens it again. */
    cleanup()
    openTheCanvas()
    await settle()
    await settle()

    expect(
      readsFor,
      'reopening the free canvas never asked the server for the key it had been writing to',
    ).toContain('#canvas')
    expect(
      onScreenText(),
      'her lesson was saved, and the reopened canvas does not show it',
    ).toContain(HER_SENTENCE)
  })
})
