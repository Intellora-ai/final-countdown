/*
 * THE SERVER REMEMBERS HOW SHE WAS TAUGHT, EVEN WHEN THE BROWSER DOES NOT.
 *
 * WHY THIS IS A SECOND FILE AND NOT MORE CASES IN `concept-rotation.test.ts`.
 *   That file proves the rotation works when the CALLER supplies the history:
 *   it sends `alreadyUsed: [firstRoute]` by hand, and the second telling comes
 *   at the idea differently. That was the right proof for the defect it was
 *   written for -- `/api/ask` was calling `authorConcept` with no history at
 *   all -- and it is still true.
 *
 *   It is also the whole of what was proven, and it hides the next defect
 *   exactly. The history it supplies came from `CanvasRoute.tsx:321`:
 *
 *       const alreadyTaught = useRef(new Map<string, Remembered>())
 *
 *   A Map inside one React component. So the guarantee, stated honestly, was
 *   "she is not taught the same way twice as long as she never reloads the
 *   page, never opens a second tab, never comes back tomorrow, and the caller
 *   chooses to send the list". Every one of those is a thing a real learner
 *   does on an ordinary afternoon.
 *
 *   THE TESTS BELOW SEND NO HISTORY AT ALL. That is the difference. If the
 *   second telling still takes a different route, the server remembered it --
 *   which is the only version of this guarantee a reload cannot erase.
 *
 * WHY THE MODEL IS A DOUBLE. Same two reasons `concept-rotation.test.ts` gives
 * and they have not changed: this account's ceiling is 200000 tokens a DAY and
 * was measured exhausted at 199591 during this very session, and a live model
 * makes the verdict depend on what a vendor felt like writing. The double
 * answers identically on purpose -- so any difference between two replies can
 * only have come from the route.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createHandler, type ModelPort, type SearchPort } from './handler.ts'
import { explanationsIn } from './memory/explanations.ts'
import { sqliteMemoryStore, type MemoryStore } from './memory/sqliteStore.ts'

/* The worked example `conceptRequest` itself puts in the prompt, so the shape
   is the prompt's own rather than one invented here. */
const A_CONCEPT = {
  id: 'base-case',
  question: 'What is a base case?',
  technicalTerms: [{ term: 'recursion', introducedIn: 'shown' }],
  blocks: [
    {
      id: 'says-what',
      kind: 'prose',
      emphasis: 'primary',
      tone: 'neutral',
      role: 'definition',
      depth: 'core',
      body: 'A base case is the branch that returns without calling itself.',
      terms: [{ text: 'branch', mark: 'key' }],
    },
    {
      id: 'shown',
      kind: 'table',
      emphasis: 'supporting',
      tone: 'neutral',
      role: 'framework',
      depth: 'core',
      columns: [
        { key: 'call', label: 'Call', type: 'text' },
        { key: 'does', label: 'What it does', type: 'text' },
      ],
      rows: [
        { call: 'fact(1)', does: 'returns 1, no recursion' },
        { call: 'fact(4)', does: 'calls fact(3)' },
      ],
    },
  ],
  relations: [{ kind: 'supports', from: 'says-what', to: 'shown' }],
  checkpoint: 'Which of those two calls is the base case, and how can you tell?',
  next: [
    { id: 'deeper', label: 'Why a missing base case never stops' },
    { id: 'related', label: 'How recursion builds the answer back up' },
  ],
}

const A_TEST_SECRET = 'test-secret-not-used-anywhere-real'
const noSearch: SearchPort = { search: async () => [] }
const QUESTION = 'Why does a chameleon change colour?'

function alwaysTheSame(): ModelPort {
  return {
    lesson: async () => {
      throw new Error('the whole-lesson path must not be taken for a fresh question')
    },
    chat: async () => JSON.stringify(A_CONCEPT),
  }
}

function ask(body: Record<string, unknown>) {
  return { method: 'POST', path: '/api/ask', body }
}

/** The `Set-Cookie` a reply planted, as a browser would send it back. */
function cookieFrom(res: { setCookie?: string }): string {
  return (res.setCookie ?? '').split(';')[0] ?? ''
}

describe('the server’s own memory of how she was taught', () => {
  let folder: string
  let file: string
  const open: MemoryStore[] = []

  /** A handler with NO memory of its own, as a restarted process has none. */
  function serverOn(path: string) {
    const store = sqliteMemoryStore(path)
    open.push(store)
    return createHandler({
      model: alwaysTheSame(),
      search: noSearch,
      identitySecret: A_TEST_SECRET,
      explanations: explanationsIn(store),
    })
  }

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'remembers-'))
    file = join(folder, 'memory.db')
  })

  afterEach(() => {
    for (const store of open.splice(0)) {
      try {
        store.close()
      } catch {
        /* Already closed by a test proving something about being closed. */
      }
    }
    rmSync(folder, { recursive: true, force: true })
  })

  it('takes a different route the second time WITHOUT being told the first', async () => {
    /*
     * THE DEFECT THIS CATCHES, AND IT IS THE ONE `concept-rotation.test.ts`
     * cannot: that test hands the route back to the server itself. Here the
     * second request carries `alreadyUsed` nowhere -- no field, no empty array,
     * nothing -- which is exactly what a page that has just been reloaded
     * sends. If the server has no memory the two routes are identical.
     */
    const handler = serverOn(file)

    const first = await handler(ask({ question: QUESTION }))
    expect(first.status, 'the first ask did not produce a lesson').toBe(200)
    const firstRoute = (first.body as { route?: string }).route
    expect(firstRoute).toBeTruthy()

    /* The same learner: her cookie comes back, as a browser would send it. */
    const second = await handler({
      ...ask({ question: QUESTION }),
      cookie: cookieFrom(first),
    })
    expect(second.status).toBe(200)

    expect(
      (second.body as { route?: string }).route,
      'the server forgot how she was taught, so the second telling repeated the first',
    ).not.toBe(firstRoute)

  })

  it('still remembers after the process is replaced', async () => {
    /* A deploy, a crash, a laptop lid. The second handler shares nothing with
       the first except the file on disk -- which is the only thing that
       survives a restart, and therefore the only honest place for this. */
    const before = serverOn(file)
    const first = await before(ask({ question: QUESTION }))
    const firstRoute = (first.body as { route?: string }).route
    const hers = cookieFrom(first)
    for (const store of open.splice(0)) store.close()

    const after = serverOn(file)
    const second = await after({ ...ask({ question: QUESTION }), cookie: hers })

    expect(second.status).toBe(200)
    expect(
      (second.body as { route?: string }).route,
      'a restart erased what she had already been told',
    ).not.toBe(firstRoute)

  })

  it('does not spend one learner’s routes on another', async () => {
    /* The shared machine, at the level a learner meets it. Two children, one
       laptop. The second must be taught from the beginning, not told she has
       already had the first way in because somebody else did. */
    const handler = serverOn(file)

    const arya = await handler(ask({ question: QUESTION }))
    const aryaRoute = (arya.body as { route?: string }).route

    /* No cookie at all: the server mints a new identity, which is a different
       learner by construction. */
    const ishan = await handler(ask({ question: QUESTION }))

    expect(
      (ishan.body as { route?: string }).route,
      'the second learner was charged for the first learner’s explanation',
    ).toBe(aryaRoute)

  })

  it('teaches a learner with no history at all, and never refuses', async () => {
    /* Absent storage is not a refusal. A server configured without the history
       still answers -- it simply forgets, which is where everything was before
       this existed. Turning a missing nicety into a missing lesson would be the
       exact failure this repository keeps finding. */
    const handler = createHandler({
      model: alwaysTheSame(),
      search: noSearch,
      identitySecret: A_TEST_SECRET,
    })
    const res = await handler(ask({ question: QUESTION }))
    expect(res.status, 'a server without the history store refused to teach').toBe(200)
    expect((res.body as { route?: string }).route).toBeTruthy()
  })
})
