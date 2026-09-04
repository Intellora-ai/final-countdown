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

/** The sequence the default canvas store hands out, one per append. A fixed
 *  number here made two lessons share a seq, and the canvas is ordered by it. */
let appendedSeq: number

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
  appendedSeq = 0
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
      /* THE FREE CANVAS READS ITS OWN KEY ON MOUNT, and this default router
         did not model that because it never used to. `CanvasRoute` appends
         every free-canvas lesson under `#canvas`; the effect that brings a
         canvas back now reads the same key instead of returning early on a
         null topic, so a router that throws here turns every default test into
         one where the canvas is unreachable -- and "the canvas could not be
         reached just now" then appears on screen in tests about something
         else entirely. An empty canvas is the truthful answer for a test that
         has taught nothing yet, and it is what every other router in this file
         already answers. Assertions are unchanged: the tests that are ABOUT an
         unreachable canvas still stub their own failing router below. */
      if (url.startsWith('/api/canvas?')) return jsonResponse(200, { artifacts: [] })
      if (url === '/api/canvas') return jsonResponse(200, { appended: { seq: (appendedSeq += 1) } })
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

  it('takes the writing screen down when the ask fails, and puts no lesson in its place', async () => {
    /* MEASURED in a real browser on 2026-09-02: the server answered 502, the
       refusal rendered, and the "Writing this for you now" screen stayed on
       top of it with its bar still moving, permanently. `stage` never left
       'writing' because it read `authored === null` and never `authorFailed`.
       The screen-reader region already said "No lesson is being shown" -- the
       sighted learner was the only one not told. */
    answersWith = () => {
      throw new TypeError('fetch failed: ECONNREFUSED 127.0.0.1:8787')
    }
    canvas()
    await askToBeTaught(HER_TOPIC)

    const said = onScreenText()
    expect(said, 'she was told nothing at all').toContain('That lesson was refused')
    expect(
      said,
      'the ask failed and the screen still says it is being written -- a refusal under a spinner that never stops',
    ).not.toContain('Writing this for you now')
    expect(
      document.querySelector('.lc-writing-bar'),
      'the moving bar is still moving after the ask has already failed',
    ).toBeNull()
    expect(
      said,
      "the ask failed and the picker's logarithm lesson was shown in place of hers",
    ).not.toContain('What is a logarithm')
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

  it('holds a pasted paragraph down to the length a lesson can carry', async () => {
    /*
     * A TOPIC LONGER THAN A LESSON'S OWN QUESTION FIELD COSTS HER THE SOURCES.
     *
     * The box had no cap at all (`maxLength` read -1 in the running page) while
     * `spec.ts` caps a lesson's question at 200. What the extra characters
     * actually break is grounding: the question is searched verbatim.
     *
     * MEASURED live 2026-09-04, a 475-character paste beginning "photosynthesis
     * and also please explain in great detail...":
     *
     *   [controller] START_LESSON target="photosynthesis"          <- narrowed fine
     *   [grounding] no sources for "photosynthesis and also please explain in great detail the e"
     *   [grounding] 0 source(s) from 0 domain(s)
     *
     * The controller read her real topic correctly, and the search still went
     * out as the whole paragraph and came back with nothing. So a learner who
     * pastes a question gets a lesson written from the model's memory alone --
     * silently, and in a product whose rule is never to answer without a real
     * source.
     */
    canvas()
    const pasted = `photosynthesis ${'and also every detail of botany '.repeat(20)}`
    expect(pasted.length, 'this paste is not long enough to test anything').toBeGreaterThan(300)
    fireEvent.change(topicBox(), { target: { value: pasted } })

    expect(
      topicBox().value.length,
      'a pasted paragraph is carried into the question verbatim, and the search comes back empty',
    ).toBeLessThanOrEqual(200)
    expect(
      topicBox().value,
      'the beginning of what she typed -- the part that names her topic -- was not kept',
    ).toContain('photosynthesis')
  })

  it('says the server answered, rather than that it could not be reached', async () => {
    /*
     * A SERVER THAT ANSWERED IS NOT A SERVER THAT WAS NEVER REACHED.
     *
     * `askTheServer` uses the same '(server)' issue for two opposite things:
     * a reply with a status it cannot use (line ~427) and a request that threw
     * (the catch below it, which also sets `unreachable`). The banner branches
     * only on the token, so a 400, a 413 or a content refusal all wore the
     * outage's sentence -- "The model could not be reached, so nothing was
     * written."
     *
     * The comment three lines above that branch says exactly why it matters:
     * each wrong sentence sends her to do a different wrong thing. Told the
     * server is down she gives up and waits, when the truth is that it answered
     * in a fifth of a second and told her the question was too long -- which
     * she could act on immediately.
     */
    answersWith = () => jsonResponse(413, { error: 'that question is longer than this server accepts' })
    canvas()
    await askToBeTaught(HER_TOPIC)

    const said = onScreenText()
    expect(said, 'she was told nothing at all').toContain('That lesson was refused')
    expect(
      said,
      'a server that answered in words was reported as an outage, so she gives up instead of shortening the question',
    ).not.toContain('could not be reached')
    expect(
      said,
      "the server's own words were thrown away, leaving nothing to act on",
    ).toContain('longer than this server accepts')
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

describe('a canvas opened for one topic', () => {
  it('names the topic, offers the box, and shows no picked lesson', () => {
    render(
      <MemoryRouter>
        <CanvasRoute topic={{ id: 'sav-1', name: 'Surface Areas and Volumes' }} />
      </MemoryRouter>,
    )
    expect(onScreenText()).toContain('Surface Areas and Volumes')
    expect(topicBox()).toBeTruthy()
    expect(onScreenText(), "the picker's logarithms were shown on a topic's blank canvas").not.toContain('What is a logarithm')
  })

  it('says so when the device does not know the topic -- never nothing', () => {
    /* `ChapterView` answered an unknown address with `return null`, and a
       learner reported a truly empty page. A topic canvas must never do that. */
    render(
      <MemoryRouter>
        <CanvasRoute topic={{ id: 'no-such-topic', name: null }} />
      </MemoryRouter>,
    )
    expect(onScreenText()).toContain('does not know a topic called no-such-topic')
    expect(topicBox()).toBeTruthy()
  })
})

describe('no pre-made lessons, anywhere', () => {
  /* YOUR DECISION, 2026-09-02: nothing is written in advance. The canvas
     shipped with a row of eight built-in demo lessons -- Maths, English,
     Physics, Civics, Machine learning, two engine fixtures and one written by
     hand -- and the flagship law drove them. A student types anything and it
     is written for them; nothing else is offered. */
  it('offers no built-in lesson on the free canvas', () => {
    canvas()
    expect(screen.queryByRole('group', { name: /lesson/i }), 'the demo-lesson picker is still on screen').toBeNull()
    for (const label of ['Maths', 'English', 'Physics', 'Civics', 'Machine learning']) {
      expect(screen.queryByRole('button', { name: label }), `a built-in "${label}" lesson is still offered`).toBeNull()
    }
    expect(topicBox(), 'the box to ask for anything is gone with the picker').toBeTruthy()
  })

  it("offers no built-in lesson on a topic's canvas either", () => {
    render(
      <MemoryRouter>
        <CanvasRoute topic={{ id: 'sav-1', name: 'Surface Areas and Volumes' }} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('group', { name: /lesson/i })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Maths' })).toBeNull()
  })
})

describe('words appear as they are written', () => {
  /* THE OWNER'S DECISION, 2026-09-02: never all at once. The server can answer
     /api/ask as an event stream; the canvas asks for one and shows the words of
     the first block while the rest is still being written. A server that
     answers plain JSON instead -- every other test in this file -- is handled
     exactly as before. */
  function eventStream(frames: string[], gate: Promise<void>): Response {
    const encoder = new TextEncoder()
    return {
      ok: true,
      status: 200,
      headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'text/event-stream' : null) },
      body: new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode(frames[0] ?? ''))
          await gate
          for (const frame of frames.slice(1)) controller.enqueue(encoder.encode(frame))
          controller.close()
        },
      }),
      json: async () => {
        throw new Error('a stream is not read as JSON')
      },
    } as unknown as Response
  }

  it('shows the first words while the lesson is still being written, then the lesson', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    answersWith = () =>
      eventStream(
        [
          'event: text\ndata: {"type":"text","blockIndex":0,"text":"A snake sheds by growing"}\n\n',
          `event: done\ndata: ${JSON.stringify({ type: 'done', reply: { status: 200, body: { lesson: HER_LESSON } } })}\n\n`,
        ],
        gate,
      )
    canvas()
    await askToBeTaught(HER_TOPIC)
    await settle()
    await settle()

    expect(onScreenText(), 'nothing appeared while the lesson was being written').toContain('A snake sheds by growing')
    expect(
      document.querySelector('.lc-writing-bar'),
      'the words arrived but the page no longer says it is still writing',
    ).not.toBeNull()
    expect(wentTo.some((went) => went.url === '/api/ask'), 'the server was never asked').toBe(true)

    release()
    await settle()
    await settle()
    await settle()
    expect(onScreenText()).toContain(HER_QUESTION)
    expect(document.querySelector('.lc-writing-bar'), 'the lesson landed and the page still says it is writing').toBeNull()
  })

  /*
   * A BLOCK NUMBER THAT CANNOT EXIST MUST NOT COST ANYTHING.
   *
   * The words arriving from the stream are filed by index into an array:
   * `next[index] = (next[index] ?? '') + text`. Nothing checked the index, and
   * a lesson has at most 24 blocks (`spec.ts`, `blocks: z.array(Block).max(24)`).
   * One frame naming block 9,000,000 therefore allocated an array of nine
   * million holes, and every frame after it copied all nine million with
   * `[...prev]` -- on the main thread, between the learner and her own tab.
   *
   * A stream is the one input here that is neither the learner's typing nor
   * this build's own gate: it is whatever the server, a proxy, or a half-open
   * connection actually wrote.
   *
   * MEASURED on this machine, one stray frame followed by three ordinary ones:
   *
   *     blockIndex 9,000,000     237ms
   *     blockIndex 50,000,000  1,348ms
   *     blockIndex 200,000,000 FATAL: invalid array length, heap out of memory
   *
   * So the top of the range is not a slow tab, it is a dead one. TIME IS THE
   * ASSERTION because time is the symptom: to somebody waiting, "slow" and
   * "broken" are the same thing, and the margin here is three orders of
   * magnitude -- the mended path never allocates at all.
   */
  it('does not freeze the tab when the stream names a block that cannot exist', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    answersWith = () =>
      eventStream(
        [
          'event: text\ndata: {"type":"text","blockIndex":0,"text":"A snake sheds by growing"}\n\n',
          'event: text\ndata: {"type":"text","blockIndex":50000000,"text":"a block that cannot exist"}\n\n',
          'event: text\ndata: {"type":"text","blockIndex":0,"text":" a new skin"}\n\n',
          `event: done\ndata: ${JSON.stringify({ type: 'done', reply: { status: 200, body: { lesson: HER_LESSON } } })}\n\n`,
        ],
        gate,
      )
    canvas()
    await askToBeTaught(HER_TOPIC)
    const startedAt = Date.now()
    release()
    await settle()
    await settle()
    await settle()
    const took = Date.now() - startedAt

    expect(onScreenText(), 'the lesson never arrived at all').toContain(HER_QUESTION)
    expect(
      onScreenText(),
      'a block number no lesson can have was rendered as if it were part of one',
    ).not.toContain('a block that cannot exist')
    expect(
      took,
      `one stray frame cost ${took}ms of the learner's own main thread; at a larger index the same frame kills the tab`,
    ).toBeLessThan(800)
  }, 5000)
})

describe('the canvas builds up; it is not a chat', () => {
  /* THE OWNER'S DECISION, 2026-09-02: everything learned on a topic stays on
     that topic's canvas and accumulates. Today `setAuthored` REPLACES the
     lesson on every ask, so the second question erases the first -- a chat
     that forgets, on a screen that is meant to be a map of what she knows. */
  const SECOND_QUESTION = 'Why does a snake shed all at once?'
  /* The same blocks under a different question: block ids are kept as they
     are, because `technicalTerms`, `relations` and `terms` all point at them
     and a renamed id is a refused lesson, not a second one. */
  const SECOND_LESSON = {
    ...HER_LESSON,
    id: 'why-all-at-once',
    question: SECOND_QUESTION,
    blocks: HER_LESSON.blocks.map((block) =>
      block.kind === 'prose' && 'body' in block
        ? { ...block, body: 'The old skin loosens everywhere at once, so the snake sheds it in one piece.' }
        : block,
    ),
  }

  it('keeps the first lesson on the canvas when a second is asked for', async () => {
    render(
      <MemoryRouter>
        <CanvasRoute topic={{ id: 'snakes', name: 'Snakes' }} />
      </MemoryRouter>,
    )
    await askToBeTaught(HER_TOPIC)
    await settle()
    expect(onScreenText()).toContain(HER_QUESTION)

    answersWith = () => jsonResponse(200, { lesson: SECOND_LESSON })
    await askToBeTaught('why all at once')
    await settle()
    await settle()

    /* An earlier entry is headed by what SHE TYPED, not by the lesson's own
       title: it is her question that stays on her canvas. */
    const FIRST_SENTENCE = 'A snake sheds by growing a new skin underneath'
    const text = onScreenText()
    expect(text, 'the second lesson never arrived').toContain(SECOND_QUESTION)
    expect(text, 'the first lesson was erased by the second').toContain(FIRST_SENTENCE)
    expect(text, "her first question is no longer on her canvas").toContain(HER_TOPIC)
    expect(text.indexOf(FIRST_SENTENCE), 'the newer lesson is not below the older one').toBeLessThan(text.indexOf(SECOND_QUESTION))
  })

  it('comes back exactly as it was left, with nothing added', async () => {
    /* Decided 2026-09-02: save every single thing; on return, the canvas is
       as she left it and nothing is added until she asks. The topic's canvas
       is kept on the server under `<topic>#canvas`. */
    /* One row per artifact, with the place the server gave it. The canvas is
       read from /api/canvas, which has no PUT -- see the durability laws. */
    const artifacts = [
      { seq: 1, createdAt: 'then', artifact: { kind: 'lesson', question: HER_QUESTION, payload: HER_LESSON, teaching: 'lesson' } },
      { seq: 2, createdAt: 'then', artifact: { kind: 'lesson', question: SECOND_QUESTION, payload: SECOND_LESSON, teaching: 'lesson' } },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown): Promise<Response> => {
        const url = String(input)
        if (url.startsWith('/api/canvas?')) return jsonResponse(200, { artifacts })
        if (url.startsWith('/api/memory?')) return jsonResponse(200, { record: null })
        if (url === '/api/situation') return jsonResponse(200, { openLoops: [] })
        return jsonResponse(200, {})
      }),
    )
    render(
      <MemoryRouter>
        <CanvasRoute topic={{ id: 'snakes', name: 'Snakes' }} />
      </MemoryRouter>,
    )
    await settle()
    await settle()
    const text = onScreenText()
    expect(text, 'the first lesson did not come back').toContain(HER_QUESTION)
    expect(text, 'the second lesson did not come back').toContain(SECOND_QUESTION)
    expect(document.querySelector('.lc-writing-bar'), 'coming back started writing something new').toBeNull()
  })
})

describe('what comes next is typed, never clicked', () => {
  /* Decided 2026-09-02: no buttons on the canvas. Whatever the tutor
     suggests she could ask next is shown as words; she types it, or anything
     else, in the same box as always. */
  it('shows the offered branches as words, not buttons', async () => {
    const BRANCH = 'Why the old skin goes dull'
    answersWith = () =>
      jsonResponse(200, {
        lesson: HER_LESSON,
        checkpoint: '',
        next: [
          { id: 'dull', label: BRANCH },
          { id: 'often', label: 'How often a snake sheds' },
        ],
      })
    canvas()
    await askToBeTaught(HER_TOPIC)
    expect(onScreenText(), 'the suggestion vanished with the button').toContain(BRANCH)
    expect(screen.queryByRole('button', { name: BRANCH }), 'a branch is still a button').toBeNull()
  })
})

describe('memory is written when something changed, not on every word', () => {
  /* Measured live 2026-09-02 on a topic canvas: while the third lesson was
     streaming, the server logged the canvas record written about five times a
     second and the progress record every second. A shared server would be
     hammered by every open canvas in a classroom. A streamed lesson must write
     the canvas memory once -- when the lesson lands -- and nothing while the
     words are still arriving. */
  function eventStream(frames: string[]): Response {
    const encoder = new TextEncoder()
    return {
      ok: true,
      status: 200,
      headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'text/event-stream' : null) },
      body: new ReadableStream<Uint8Array>({
        async start(controller) {
          for (const frame of frames) {
            controller.enqueue(encoder.encode(frame))
            await new Promise((resolve) => setTimeout(resolve, 0))
          }
          controller.close()
        },
      }),
      json: async () => {
        throw new Error('a stream is not read as JSON')
      },
      text: async () => '',
    } as unknown as Response
  }

  it('a streamed lesson writes the canvas memory once and the progress record once', async () => {
    const puts: string[] = []
    const words = 'A snake sheds by growing a new skin underneath and crawling out of the old one.'.split(' ')
    const frames = [
      ...words.map((word, i) => `event: text\ndata: ${JSON.stringify({ type: 'text', blockIndex: 0, text: (i ? ' ' : '') + word })}\n\n`),
      `event: done\ndata: ${JSON.stringify({ type: 'done', reply: { status: 200, body: { lesson: HER_LESSON } } })}\n\n`,
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        if (url === '/api/ask') return eventStream(frames)
        if (url.startsWith('/api/canvas?')) return jsonResponse(200, { artifacts: [] })
        if (url.startsWith('/api/memory?')) return jsonResponse(200, { record: null })
        if (url === '/api/canvas' && init?.method === 'POST') {
          puts.push(`POST ${String((JSON.parse(String(init.body)) as { lessonId: string }).lessonId)}`)
          return jsonResponse(200, { appended: { seq: puts.length, createdAt: 'now', artifact: {} } })
        }
        if (url === '/api/memory' && init?.method === 'PUT') {
          puts.push(`PUT ${String((JSON.parse(String(init.body)) as { lessonId: string }).lessonId)}`)
          return jsonResponse(200, { ok: true })
        }
        throw new Error(`nothing in this test should reach ${url} (${init?.method ?? 'GET'})`)
      }),
    )
    render(
      <MemoryRouter>
        <CanvasRoute topic={{ id: 'snakes', name: 'Snakes' }} />
      </MemoryRouter>,
    )
    await askToBeTaught(HER_TOPIC)
    for (let i = 0; i < words.length + 5; i += 1) await settle()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700))
    })
    expect(onScreenText()).toContain('A snake sheds by growing')
    const canvasWrites = puts.filter((line) => line === 'POST snakes#canvas').length
    const progressWrites = puts.filter((line) => line === 'PUT snakes').length
    expect(canvasWrites, `the canvas was appended to ${canvasWrites} times: ${puts.join(', ')}`).toBe(1)
    expect(progressWrites, `the progress record was written ${progressWrites} times`).toBeLessThanOrEqual(1)
    /* STRONGER THAN BEFORE, AND THIS IS THE POINT OF THE WHOLE CHANGE: one
       lesson costs one APPEND, and there is no request in the run that could
       replace or shorten the canvas. The old shape PUT the entire canvas back,
       so every save was a chance to destroy it. */
    expect(puts.filter((line) => line.endsWith('snakes#canvas') && line.startsWith('PUT'))).toEqual([])
  })
})

describe('a lesson the canvas has put a question mark over', () => {
  /* MONITOR AFTER. A canvas is permanent, so a mistake that slipped past the
     checks made before a lesson was drawn stays in front of her for months.
     When something real questions a lesson -- she has been lost at the same
     point of it three times -- she is TOLD, on that lesson, quietly. Nothing is
     rewritten and nothing is hidden: the lesson keeps every word it had. */

  const artifacts = [
    { seq: 1, createdAt: 'then', artifact: { kind: 'lesson', question: 'the doubtful one', payload: HER_LESSON, teaching: 'lesson' } },
    { seq: 2, createdAt: 'then', artifact: { kind: 'lesson', question: 'the fine one', payload: { ...HER_LESSON, id: 'snake-two' }, teaching: 'lesson' } },
  ]

  async function open(needsAnotherLook: unknown[]): Promise<string> {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown): Promise<Response> => {
        const url = String(input)
        if (url.startsWith('/api/canvas?')) return jsonResponse(200, { artifacts, needsAnotherLook })
        if (url.startsWith('/api/memory?')) return jsonResponse(200, { record: null })
        return jsonResponse(200, {})
      }),
    )
    render(
      <MemoryRouter>
        <CanvasRoute topic={{ id: 'snakes', name: 'Snakes' }} />
      </MemoryRouter>,
    )
    for (let i = 0; i < 5; i += 1) await settle()
    return onScreenText()
  }

  it('says so on the lesson in question, in her words, and keeps the lesson', async () => {
    const text = await open([
      { artifactSeq: 1, kind: 'repeated-confusion', why: 'she has said she does not follow the same part of this lesson 3 times; the teaching may be at fault rather than the idea' },
    ])
    expect(text.toLowerCase(), 'nothing on screen says this lesson is being questioned').toContain('looking at this one again')
    expect(text, 'the lesson was hidden instead of marked').toContain('the doubtful one')
    expect(text, 'the lesson lost its words').toContain('A snake sheds by growing')
  })

  it('leaves every other lesson alone', async () => {
    const text = await open([{ artifactSeq: 1, kind: 'repeated-confusion', why: 'lost three times' }])
    const marks = text.toLowerCase().split('looking at this one again').length - 1
    expect(marks, 'a lesson nothing was said about was marked too').toBe(1)
  })

  it('says nothing at all when nothing is in question', async () => {
    const text = await open([])
    expect(text.toLowerCase()).not.toContain('looking at this one again')
    expect(text).toContain('the doubtful one')
  })
})

describe('what this topic is about, on the screen, before anything is asked', () => {
  /*
   * THE OWNER'S DECISION, 2026-09-03: "its not a map, its like a text only like
   * u display + persisting of same font, display, design, layout tht appears on
   * start of blank canvas". So it is prose at the top of the canvas, in the
   * canvas's own type, and it stays there while she learns.
   *
   * WHERE IT COMES FROM MATTERS MORE THAN HOW IT LOOKS. It is read from a
   * committed, checked knowledge file -- never asked of a model at the moment
   * she opens the topic, which would give a different answer to every student
   * and could not be argued with. `src/knowledge/load.ts` is read-only for
   * exactly this reason.
   *
   * These three topics are real Class 10 Mathematics topics with real models
   * built from the published CBSE syllabus page.
   */

  const FLAT = 'introduction-to-trigonometry--trigonometric-ratios-of-an-acute-angle-of-a-right-angled-triangle-proof-of-their'
  const NESTED = 'introduction-to-trigonometry--motivate-the-ratios-whichever-are-defined-at-0-and-90-values-of-the-trigonometri'
  const ONE_IDEA = 'introduction-to-trigonometry--relationships-between-the-ratios'

  async function openTopic(id: string, name: string): Promise<string> {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown): Promise<Response> => {
        const url = String(input)
        if (url.startsWith('/api/canvas?')) return jsonResponse(200, { artifacts: [] })
        if (url.startsWith('/api/memory?')) return jsonResponse(200, { record: null })
        return jsonResponse(200, {})
      }),
    )
    render(
      <MemoryRouter>
        <CanvasRoute topic={{ id, name }} classId="10" />
      </MemoryRouter>,
    )
    for (let i = 0; i < 4; i += 1) await settle()
    return onScreenText()
  }

  it('shows what is inside the topic, from the syllabus, the moment she arrives', async () => {
    const text = await openTopic(FLAT, 'Trigonometric ratios of an acute angle of a right-angled triangle')
    expect(text, 'she was shown nothing about what this topic contains').toContain('The sine function')
    expect(text).toContain('The cosine function')
    expect(text, 'the scope is not there before she asks anything').toContain('Why the ratios exist')
  })

  it('shows the parts inside a part, when the syllabus names them', async () => {
    const text = await openTopic(NESTED, 'Motivate the ratios whichever are defined at 0° and 90°')
    expect(text).toContain('The values at the standard angles')
    expect(text, 'a sub-concept the syllabus names was not shown').toContain('The ratios at 45°')
  })

  it('says a one-idea topic is one idea, and invents nothing to fill the space', async () => {
    const text = await openTopic(ONE_IDEA, 'Relationships between the ratios')
    expect(text.toLowerCase(), 'a topic with one idea was not described as one').toContain('one central idea')
    /* The failure this guards is the whole reason the layer exists: a template
       that expects a list, so a list is manufactured. */
    expect(text).not.toContain('The sine function')
  })

  it('says plainly when the thing she opened is not something to learn', async () => {
    /* REAL, from the curriculum: the 37 official PDFs were read into 3,995
       "topics" and about nine in a hundred are not topics at all -- apparatus
       lists, instructions, a book's authors. A student can click one, because
       the sidebar shows everything and hiding a topic is worse than an ugly
       one. What she must NOT get is a canvas quietly trying to teach a shopping
       list, or a scope invented for one. See `src/knowledge/teachable.ts`. */
    const text = await openTopic(
      'science--collect-the-following-items',
      'Collect the following items: A spring, a stand, a weight hanger, slotted weights, a ruler',
    )
    expect(text.toLowerCase(), 'she was told nothing about why this is not a lesson')
      .toContain('not something to learn')
    expect(text, 'she was left with no way to ask about anything else').toContain('Teach me')
  })

  it('says nothing at all about a topic nothing is known about', async () => {
    /* Most of the 3,995 topics have no model yet. A canvas for one of them must
       open and teach exactly as it always did. A placeholder saying "no scope
       available" would read as something failing to load, which is worse than
       silence. */
    const text = await openTopic('a-topic-with-no-knowledge-model', 'Some Topic')
    expect(text.toLowerCase()).not.toContain('one central idea')
    expect(text.toLowerCase()).not.toContain('what we')
    expect(text, 'the ask box is gone, so she cannot learn anything at all').toContain('Teach me')
  })

  it('is still on the canvas after she has been taught, not only before', async () => {
    /* "persisting": it is the canvas's heading, not a splash screen. */
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown): Promise<Response> => {
        const url = String(input)
        if (url === '/api/ask') return jsonResponse(200, { lesson: HER_LESSON })
        if (url.startsWith('/api/canvas?')) return jsonResponse(200, { artifacts: [] })
        if (url.startsWith('/api/memory?')) return jsonResponse(200, { record: null })
        if (url === '/api/canvas') return jsonResponse(200, { appended: { seq: 1, createdAt: 'now', artifact: {} } })
        return jsonResponse(200, {})
      }),
    )
    render(
      <MemoryRouter>
        <CanvasRoute topic={{ id: FLAT, name: 'Trigonometric ratios' }} classId="10" />
      </MemoryRouter>,
    )
    await askToBeTaught('what is a sine')
    for (let i = 0; i < 4; i += 1) await settle()
    const text = onScreenText()
    expect(text, 'the lesson was never taught, so this proves nothing').toContain('A snake sheds by growing')
    expect(text, 'the scope vanished the moment she was taught something').toContain('The sine function')
  })
})

describe('every teaching request says which canvas it is for', () => {
  /* MEASURED 2026-09-03: `/api/ask` was sent `{question, alreadyUsed}` and
     NOTHING ELSE. The topic id and name that `App.tsx` had already resolved,
     and the class the student is in, never left the browser -- so the server
     could not scope a search to her class, could not file evidence against the
     topic she was actually on, and could not tell one canvas from another. The
     canvas was anonymous to the thing teaching it.

     The plea path already sent `topicId`; the ordinary ask did not, which is
     the worst shape: it looked wired. */

  async function askOn(props: Record<string, unknown>): Promise<Record<string, unknown>> {
    let sent: Record<string, unknown> = {}
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        if (url === '/api/ask') {
          sent = JSON.parse(String(init?.body)) as Record<string, unknown>
          return jsonResponse(200, { lesson: HER_LESSON })
        }
        if (url.startsWith('/api/canvas?')) return jsonResponse(200, { artifacts: [] })
        if (url.startsWith('/api/memory?')) return jsonResponse(200, { record: null })
        return jsonResponse(200, {})
      }),
    )
    render(
      <MemoryRouter>
        <CanvasRoute {...props} />
      </MemoryRouter>,
    )
    await askToBeTaught(HER_TOPIC)
    for (let i = 0; i < 3; i += 1) await settle()
    return sent
  }

  it('sends the topic, its name, the class and the exam', async () => {
    const sent = await askOn({ topic: { id: 'snakes', name: 'Snakes' }, classId: '10', examId: 'jee-main' })
    expect(sent['topicId'], 'the server was never told which topic this canvas is').toBe('snakes')
    expect(sent['topicName'], 'the server was told an id and never the name behind it').toBe('Snakes')
    expect(sent['classId'], 'the server cannot pitch a lesson at a class it was not told').toBe('10')
    expect(sent['examId']).toBe('jee-main')
  })

  it('sends nothing it does not know, rather than a guess', async () => {
    /* A canvas opened with no topic at all -- typed straight into the box.
       Empty strings and invented ids are worse than absence: the server
       records evidence under whatever it is given. */
    const sent = await askOn({})
    expect(sent).not.toHaveProperty('topicId')
    expect(sent).not.toHaveProperty('classId')
    expect(sent['question']).toBe(HER_TOPIC)
  })
})

describe('an artifact this build cannot draw is still on her canvas', () => {
  /* FOUND LIVE, 2026-09-03, with a damaged row planted in the real database.
     The list rendered above the stage was `entries.slice(0, -1)` -- drop the
     last, because the last is the one on stage. That stopped being true the
     moment the stage began showing the last DRAWABLE lesson: a damaged row at
     the end was sliced off and appeared NOWHERE, which is a silent deletion on
     screen even though the row was safe in the database. Law C is about what
     she can see as much as what is stored. */

  const damagedLast = [
    { seq: 1, createdAt: 'then', artifact: { kind: 'lesson', question: 'the good one', payload: HER_LESSON, teaching: 'lesson' } },
    { seq: 2, createdAt: 'then', artifact: { kind: 'lesson', question: 'the damaged one', payload: { nonsense: true }, teaching: 'lesson' } },
  ]

  it('shows the damaged one AND the lesson on stage, when the damaged one is last', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown): Promise<Response> => {
        const url = String(input)
        if (url.startsWith('/api/canvas?')) return jsonResponse(200, { artifacts: damagedLast })
        if (url.startsWith('/api/memory?')) return jsonResponse(200, { record: null })
        return jsonResponse(200, {})
      }),
    )
    render(
      <MemoryRouter>
        <CanvasRoute topic={{ id: 'snakes', name: 'Snakes' }} />
      </MemoryRouter>,
    )
    for (let i = 0; i < 5; i += 1) await settle()
    const text = onScreenText()
    expect(text, 'the damaged artifact vanished from the screen entirely').toContain('the damaged one')
    expect(text, 'the good lesson is not being taught').toContain('A snake sheds by growing')
  })

  it('never shows the same lesson twice: the one on stage is not also listed above', async () => {
    /* The other half of the same slice. Dropping "the last" was also the only
       thing stopping the staged lesson appearing twice, so a fix that simply
       stopped slicing would duplicate every lesson she is reading. */
    const twoGood = [
      { seq: 1, createdAt: 'then', artifact: { kind: 'lesson', question: 'the first', payload: HER_LESSON, teaching: 'lesson' } },
      { seq: 2, createdAt: 'then', artifact: { kind: 'lesson', question: 'the second', payload: { ...HER_LESSON, id: 'snake-second' }, teaching: 'lesson' } },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown): Promise<Response> => {
        const url = String(input)
        if (url.startsWith('/api/canvas?')) return jsonResponse(200, { artifacts: twoGood })
        if (url.startsWith('/api/memory?')) return jsonResponse(200, { record: null })
        return jsonResponse(200, {})
      }),
    )
    render(
      <MemoryRouter>
        <CanvasRoute topic={{ id: 'snakes', name: 'Snakes' }} />
      </MemoryRouter>,
    )
    for (let i = 0; i < 5; i += 1) await settle()
    expect(document.querySelectorAll('.lc-entry').length, 'the staged lesson is listed above itself').toBe(1)
  })
})

describe('when her work cannot be reached, she is told', () => {
  /* THE SILENT HALF OF THE SIXTEEN LOSS RISKS. The shipped client never read
     a write's status and turned every failed read into an empty canvas, so a
     student whose work was unreachable saw a blank page that looked exactly
     like a topic she had never opened -- and asking one more question then
     overwrote everything. She is told instead, in words, and nothing is
     written on the back of a read that failed. */

  it('says the canvas could not be read, instead of showing a blank one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown): Promise<Response> => {
        const url = String(input)
        if (url.startsWith('/api/canvas?')) throw new TypeError('Failed to fetch')
        if (url.startsWith('/api/memory?')) return jsonResponse(200, { record: null })
        return jsonResponse(200, {})
      }),
    )
    render(
      <MemoryRouter>
        <CanvasRoute topic={{ id: 'snakes', name: 'Snakes' }} />
      </MemoryRouter>,
    )
    for (let i = 0; i < 4; i += 1) await settle()
    const text = onScreenText()
    expect(text.toLowerCase(), 'nothing on screen says her work could not be reached').toContain('could not be')
    expect(text.toLowerCase(), 'she is not told her work is safe').toContain('nothing is lost')
  })

  it('says a lesson was not saved, rather than looking as though it was', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        if (url.startsWith('/api/canvas?')) return jsonResponse(200, { artifacts: [] })
        if (url.startsWith('/api/memory?')) return jsonResponse(200, { record: null })
        if (url === '/api/canvas' && init?.method === 'POST') return jsonResponse(503, { error: 'the disk is full' })
        if (url === '/api/ask') return jsonResponse(200, { lesson: HER_LESSON })
        return jsonResponse(200, {})
      }),
    )
    render(
      <MemoryRouter>
        <CanvasRoute topic={{ id: 'snakes', name: 'Snakes' }} />
      </MemoryRouter>,
    )
    await askToBeTaught(HER_TOPIC)
    for (let i = 0; i < 4; i += 1) await settle()
    /* The lesson is still taught -- a save that failed must never cost her the
       teaching -- and the page says plainly where it does and does not exist. */
    expect(onScreenText(), 'the lesson was not taught').toContain('A snake sheds by growing')
    expect(onScreenText().toLowerCase(), 'a failed save was hidden').toContain('not yet on the server')
  })
})

describe('coming back writes nothing', () => {
  /* Measured live 2026-09-02: the burst of canvas-memory writes landed in the
     25 s after a page reload, not while words were streaming. Coming back to a
     canvas changes nothing, so it must write nothing -- the server already
     holds exactly what it just handed over. */
  it('restoring two lessons from the server sends no PUT at all', async () => {
    const puts: string[] = []
    const artifacts = [
      { seq: 1, createdAt: 'then', artifact: { kind: 'lesson', question: HER_TOPIC, payload: HER_LESSON, teaching: 'lesson' } },
      { seq: 2, createdAt: 'then', artifact: { kind: 'lesson', question: 'why all at once', payload: { ...HER_LESSON, id: 'snake-all-at-once' }, teaching: 'lesson' } },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        if (url.startsWith('/api/canvas?')) return jsonResponse(200, { artifacts })
        if (url.startsWith('/api/memory?')) return jsonResponse(200, { record: null })
        if (init?.method === 'POST' || init?.method === 'PUT') {
          puts.push(`${init.method} ${url}`)
          return jsonResponse(200, { ok: true })
        }
        throw new Error(`nothing in this test should reach ${url}`)
      }),
    )
    render(
      <MemoryRouter>
        <CanvasRoute topic={{ id: 'snakes', name: 'Snakes' }} />
      </MemoryRouter>,
    )
    for (let i = 0; i < 6; i += 1) await settle()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 900))
    })
    /* The entry above is headed by what she typed; the last lesson is on stage. */
    expect(onScreenText()).toContain(HER_TOPIC)
    expect(document.querySelectorAll('.lc-entry').length).toBe(1)
    /* Not one write of any kind. A page that "restores" by writing back what
       it thinks it read is a page that can overwrite what it did not read --
       which is exactly how one dropped connection erased a term of work. */
    expect(puts, `coming back wrote: ${puts.join(', ') || 'nothing'}`).toEqual([])
  })
})

describe('C3 — a plea on a topic canvas, and a statement', () => {
  /* Decided 2026-09-02: questions are rare; when she says it did not land,
     the tutor is told what it already said and comes back another way, ending
     with the ONE question that finds out what did not land. A statement is
     filed as what she said, under the topic. */
  async function taughtOnTopic(calls: { url: string; body: Record<string, unknown> }[], plea: boolean) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        const body = init?.body === undefined ? {} : (JSON.parse(String(init.body)) as Record<string, unknown>)
        calls.push({ url, body })
        if (url === '/api/ask') {
          if (typeof body['justSaid'] === 'string' && body['justSaid'] !== '') {
            /* The tutor's NEXT PART: new blocks with their own ids, as a real
               one has -- the same blocks again would be a duplicate lesson. */
            const nextPart = {
              id: 'snake-sheds-more',
              question: HER_LESSON.question,
              blocks: [
                { id: 'all-at-once', kind: 'prose', role: 'support', body: 'The new skin is finished everywhere at the same moment, so the old one comes away whole.', terms: [{ text: 'same moment', mark: 'key' }] },
              ],
              relations: [],
            }
            return jsonResponse(200, plea ? { lesson: nextPart, checkpoint: 'Which step lost you?' } : { lesson: nextPart })
          }
          /* A plain request for more, at the end: there is no more. */
          if (typeof body['justSaid'] === 'string') return jsonResponse(200, { lesson: { id: 'snake-sheds-end', question: HER_LESSON.question, blocks: [], relations: [] } })
          return jsonResponse(200, { lesson: HER_LESSON })
        }
        if (url === '/api/evidence') return jsonResponse(200, { kind: 'answer' })
        if (url.startsWith('/api/memory?')) return jsonResponse(200, { record: null })
        if (url === '/api/memory') return jsonResponse(200, { ok: true })
        throw new Error(`nothing in this test should reach ${url}`)
      }),
    )
    render(
      <MemoryRouter>
        <CanvasRoute topic={{ id: 'snakes', name: 'Snakes' }} />
      </MemoryRouter>,
    )
    await askToBeTaught(HER_TOPIC)
  }
  async function typeInside(text: string) {
    const box = screen.getByLabelText('Answer the question, or ask one of your own')
    fireEvent.change(box, { target: { value: text } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    for (let i = 0; i < 6; i += 1) await settle()
  }

  it('sends what the curriculum says comes first, so the server can check it against her', async () => {
    /* D3: the canvas knows the curriculum; the server knows what she did. The
       canvas sends the listed prerequisites, and the server decides which of
       them is actually blocking her. */
    const calls: { url: string; body: Record<string, unknown> }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        calls.push({ url, body: init?.body === undefined ? {} : (JSON.parse(String(init.body)) as Record<string, unknown>) })
        if (url === '/api/ask') return jsonResponse(200, { lesson: HER_LESSON })
        if (url === '/api/evidence') return jsonResponse(200, { kind: 'answer' })
        if (url.startsWith('/api/memory?')) return jsonResponse(200, { record: null })
        return jsonResponse(200, { ok: true })
      }),
    )
    render(
      <MemoryRouter>
        <CanvasRoute
          topic={{ id: 'snakes', name: 'Snakes' }}
          prerequisites={[{ id: 'skin--layers', name: 'The layers of skin' }]}
        />
      </MemoryRouter>,
    )
    await askToBeTaught(HER_TOPIC)
    const box = screen.getByLabelText('Answer the question, or ask one of your own')
    fireEvent.change(box, { target: { value: 'i still dont get it' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    for (let i = 0; i < 6; i += 1) await settle()
    const sent = calls.find((c) => c.url === '/api/ask' && typeof c.body['justSaid'] === 'string')
    expect(sent?.body['prerequisites']).toEqual([{ id: 'skin--layers', name: 'The layers of skin' }])
  })

  it('a plea reaches the server with the topic, and the one question comes back on screen', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = []
    await taughtOnTopic(calls, true)
    await typeInside('i still dont get why it sheds all at once')
    const sent = calls.find((c) => c.url === '/api/ask' && typeof c.body['justSaid'] === 'string')
    expect(sent, 'the plea never reached the server').toBeDefined()
    expect(calls.filter((c) => c.url === '/api/ask' && c.body['justSaid'] === 'i still dont get why it sheds all at once'), 'one plea, more than one request').toHaveLength(1)
    expect(sent?.body['topicId']).toBe('snakes')
    expect(sent?.body['justSaid']).toBe('i still dont get why it sheds all at once')
    expect(typeof sent?.body['taught']).toBe('string')
    expect(onScreenText(), 'the question was not shown').toContain('Which step lost you?')
    expect(screen.queryByRole('button', { name: 'Which step lost you?' })).toBeNull()
  })

  it('when the tutor writes no question, the canvas still asks one -- about what she was reading', async () => {
    /* The laptop model answered a live plea with a next part and no
       checkpoint, though it was told to end with one. A question is the
       software's guarantee: it names the parts of the beat she was on, so it
       is specific to what she read, never "what is confusing you?". */
    const calls: { url: string; body: Record<string, unknown> }[] = []
    await taughtOnTopic(calls, false)
    await typeInside('i still dont get why it sheds all at once')
    const check = document.querySelector('.lc-turn-check')?.textContent ?? ''
    expect(check, 'no question was asked').not.toBe('')
    /* HER_LESSON's blocks carry no titles, so a part is named by its opening words. */
    expect(check).toMatch(/A snake sheds by growing|the old skin/i)
    expect(check).toMatch(/\?$/)
  })

  it('a statement is filed as evidence under the topic, at the beat she was on', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = []
    await taughtOnTopic(calls, false)
    await typeInside('so the new skin is ready before the old one leaves')
    const filed = calls.find((c) => c.url === '/api/evidence')
    expect(filed, 'nothing was filed').toBeDefined()
    expect(filed?.body['topicId']).toBe('snakes')
    expect(filed?.body['said']).toBe('so the new skin is ready before the old one leaves')
    expect(typeof filed?.body['beat']).toBe('string')
  })
})
