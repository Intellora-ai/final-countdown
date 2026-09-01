/*
 * THE GATE READS SHAPE AND HAS NO OPINION ABOUT TRUTH.
 *
 * An invented lesson passes every check in this repository -- `validateLesson`
 * asks whether a definition is short and whether a term that is marked appears
 * in the body, never whether the sentence is true. The only defence is giving
 * the author real text to write from, which is why `CanvasRoute` searches
 * before it writes.
 *
 * The server did not. `authorConcept` has taken sources since it was written
 * and `/api/ask` passed `[]`, so the seam was never even asked -- a server with
 * a provider configured could still not have grounded a single lesson. These
 * checks are about the SEAM: that the search is asked, that what it returns
 * reaches the author, and that its failure costs a citation rather than a
 * lesson.
 */

import { describe, expect, it } from 'vitest'

import { createHandler, type ModelPort, type SearchPort } from './handler.ts'

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
const QUESTION = 'Why does a chameleon change colour?'
const A_REAL_SENTENCE =
  'Chameleons move pigment inside iridophore cells, changing the spacing of nanocrystals.'

function recordingModel() {
  const prompts: string[] = []
  const model: ModelPort = {
    lesson: async () => {
      throw new Error('the whole-lesson path must not be taken for a fresh question')
    },
    chat: async (system: string) => {
      prompts.push(system)
      return JSON.stringify(A_CONCEPT)
    },
  }
  return { model, prompts }
}

const ask = (body: Record<string, unknown>) => ({ method: 'POST', path: '/api/ask', body })

describe('a lesson the server writes', () => {
  it('is written from pages the web returned, not from the model alone', async () => {
    const asked: string[] = []
    const { model, prompts } = recordingModel()
    const search: SearchPort = {
      async search(query) {
        asked.push(query)
        return [{ url: 'https://example.org/chameleon', content: A_REAL_SENTENCE }]
      },
    }

    const res = await createHandler({ model, search, identitySecret: A_TEST_SECRET })(
      ask({ question: QUESTION }),
    )

    expect(res.status).toBe(200)
    expect(asked, 'the web was never asked, so the author wrote from nothing').toContain(QUESTION)
    expect(
      prompts[0],
      'the page came back and never reached the author, so searching bought nothing',
    ).toContain(A_REAL_SENTENCE)
    expect(
      prompts[0],
      'the source was handed over uncited, so nothing she reads can be followed back',
    ).toContain('https://example.org/chameleon')
  })

  it('is still written when the search provider is not configured', async () => {
    /* `index.ts` throws exactly this until Phase 4 wires a provider. A learner
       must not be refused a lesson because the machine has no search key. */
    const { model, prompts } = recordingModel()
    const search: SearchPort = {
      async search() {
        throw new Error('search is not configured')
      },
    }

    const res = await createHandler({ model, search, identitySecret: A_TEST_SECRET })(
      ask({ question: QUESTION }),
    )

    expect(res.status, 'an unconfigured search became a failure to teach').toBe(200)
    expect((res.body as { lesson?: unknown }).lesson).toBeDefined()
    expect(
      prompts[0],
      'an empty search still produced a grounding preamble, so the model was told it had sources it does not have',
    ).not.toContain('https://')
  })

  it('is still written when the web has nothing to say about the topic', async () => {
    const { model } = recordingModel()
    const search: SearchPort = { async search() { return [] } }

    const res = await createHandler({ model, search, identitySecret: A_TEST_SECRET })(
      ask({ question: QUESTION }),
    )

    expect(res.status).toBe(200)
  })
})
