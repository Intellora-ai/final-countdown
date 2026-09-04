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

/** A lesson already on her canvas from an earlier day. */
const OLDER_SENTENCE = 'A lever turns a small push over a long way into a big push over a short way.'
const AN_OLDER_LESSON = {
  id: 'what-a-lever-is',
  question: 'What is a lever?',
  blocks: [
    {
      id: 'what-a-lever-does',
      kind: 'prose',
      emphasis: 'primary',
      role: 'definition',
      body: OLDER_SENTENCE,
      terms: [{ text: 'lever', mark: 'key' }],
    },
    {
      id: 'the-lever-steps',
      kind: 'flow',
      emphasis: 'supporting',
      role: 'framework',
      caption: 'The trade, laid out rather than described.',
      nodes: [
        { id: 'push-far', label: 'you push the long arm a long way' },
        { id: 'pivot', label: 'it turns on the pivot' },
        { id: 'lift', label: 'the short arm lifts hard, a little way' },
      ],
      links: [
        { from: 'push-far', to: 'pivot' },
        { from: 'pivot', to: 'lift' },
      ],
    },
    {
      id: 'worth-keeping-lever',
      kind: 'summary',
      emphasis: 'supporting',
      role: 'summary',
      mentalModel: 'Distance is traded for force.',
      progression: ['a long arm moves far', 'the short arm moves little', 'the push there is larger'],
    },
  ],
  relations: [
    { from: 'the-lever-steps', kind: 'supports', to: 'what-a-lever-does' },
    { from: 'worth-keeping-lever', kind: 'supports', to: 'what-a-lever-does' },
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
/** When set, the canvas READ waits on this before answering, so a test can put
 *  a lesson on the canvas while the mount read is still in flight. */
let holdTheRead: Promise<void> | null
/** When set, the canvas APPEND waits on this, so a test can let the mount read
 *  land in the window between the lesson appearing and its save coming back. */
let holdTheAppend: Promise<void> | null

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
  holdTheRead = null
  holdTheAppend = null
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit): Promise<Response> => {
      const url = String(input)
      if (url === '/api/ask') return jsonResponse(200, { lesson: HER_LESSON })
      if (url.startsWith('/api/canvas?')) {
        const key = new URL(url, 'http://localhost').searchParams.get('lessonId') ?? ''
        readsFor.push(key)
        /* SNAPSHOT AT REQUEST TIME, as a real query does. Reading the store
           after the wait would quietly include rows written during it, which is
           the very thing the race is about. */
        const snapshot = stored.get(key) ?? []
        if (holdTheRead !== null) await holdTheRead
        return jsonResponse(200, {
          artifacts: snapshot,
          needsAnotherLook: [],
          student: 'a-student',
        })
      }
      if (url === '/api/canvas') {
        if (holdTheAppend !== null) await holdTheAppend
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

  /*
   * THE READ MUST NOT UNDO A LESSON WRITTEN WHILE IT WAS IN FLIGHT.
   *
   * The mount read ends in `setEntries(brought)`, which REPLACES the list; the
   * append ends in `setEntries(previous => [...previous, one])`, which adds to
   * it. Whichever finishes second wins, and on the free canvas the two now race
   * for the first time -- it is the surface the front door opens onto, so
   * "arrive and immediately type" is the ordinary case, not the corner one. A
   * slow read that lands second silently erased a lesson she had just been
   * given and watched appear.
   */
  /*
   * THE WINDOW BETWEEN THE LESSON APPEARING AND ITS SAVE COMING BACK.
   *
   * The screen counts a lesson as "written here" only once the append has been
   * answered, but she can SEE it the moment it is authored -- the stage is set
   * before the request goes out. A read landing inside that window found the
   * counter still at zero and restored the stage to an older lesson, with hers
   * on screen a moment earlier. Found by coderabbit on the first fix for this
   * race; the counter has to be raised when the lesson is written, not when the
   * server acknowledges it.
   */
  it('keeps her lesson when the read lands before the save comes back', async () => {
    stored.set('#canvas', [
      {
        seq: 1,
        createdAt: '2026-09-03T00:00:00.000Z',
        artifact: { kind: 'lesson', question: 'What is a lever?', payload: AN_OLDER_LESSON, teaching: 'lesson' },
      },
    ])

    let letTheReadFinish = (): void => {}
    let letTheSaveFinish = (): void => {}
    holdTheRead = new Promise<void>((resolve) => { letTheReadFinish = () => resolve() })
    holdTheAppend = new Promise<void>((resolve) => { letTheSaveFinish = () => resolve() })

    openTheCanvas()
    await settle()
    await askToBeTaught('how a snake sheds its skin')
    expect(onScreenText(), 'she was never taught, so there is nothing to lose').toContain(HER_SENTENCE)

    /* The read comes back while her save is still in flight. */
    letTheReadFinish()
    await settle()
    await settle()

    expect(
      onScreenText(),
      'a read that landed before her save was acknowledged took her lesson off the screen',
    ).toContain(HER_SENTENCE)

    letTheSaveFinish()
    await settle()
    expect(onScreenText(), 'her lesson did not survive its own save').toContain(HER_SENTENCE)
  })

  it('keeps a lesson written while the canvas was still being read', async () => {
    /* ONE LESSON ALREADY ON THE CANVAS, so the read that lands second is not
       empty -- `show` returns early on an empty read, which is why the erasure
       needs a canvas that already has something on it. */
    stored.set('#canvas', [
      {
        seq: 1,
        createdAt: '2026-09-03T00:00:00.000Z',
        artifact: { kind: 'lesson', question: 'What is a lever?', payload: AN_OLDER_LESSON, teaching: 'lesson' },
      },
    ])

    let letTheReadFinish = (): void => {}
    holdTheRead = new Promise<void>((resolve) => { letTheReadFinish = () => resolve() })

    openTheCanvas()
    await settle()

    /* She is taught while the mount read is still open. */
    await askToBeTaught('how a snake sheds its skin')
    expect(onScreenText(), 'she was never taught, so there is nothing to lose').toContain(HER_SENTENCE)

    /* Now the canvas read comes back -- with nothing, because it started before
       she asked. It must not take her lesson away. */
    letTheReadFinish()
    await settle()
    await settle()

    expect(
      onScreenText(),
      'a canvas read that landed after her lesson erased it from the screen',
    ).toContain(HER_SENTENCE)
  })
})
