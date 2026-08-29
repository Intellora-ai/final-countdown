/* /api/lesson carries a TEACHING DECISION, not just a topic.
 *
 * WHAT MUST BE TRUE
 *   1. The server picks the strategy. The browser sends what it knows about
 *      the student; it cannot ask for a strategy the server does not support.
 *   2. The chosen strategy comes BACK with the lesson. A decision nobody can
 *      observe is a decision nobody can debug -- this repo already shipped a
 *      trace that reported capabilities as used which had done nothing.
 *   3. The strategy reaches the MODEL as an instruction it can act on. The
 *      test asserts the effect on the brief, not that a function was called.
 *   4. Nothing about the student's history can reach the browser bundle or an
 *      error message.
 */

import { describe, expect, it } from 'vitest'

import { createHandler, type ModelPort, type SearchPort } from './handler.ts'
import { STRATEGIES } from './teaching.ts'

const VALID_LESSON = {
  id: 'photosynthesis',
  question: 'How does a leaf make food?',
  /*
   * A WHOLE LESSON, BECAUSE `/api/lesson` HOLDS THE MODEL TO ONE.
   *
   * This was a single prose block, which the browser gate refuses: a taught
   * lesson opens with a definition, closes with a summary, and shows something
   * rather than only telling it. A stub that could not pass the real gate made
   * this test assert a 200 the product could never produce.
   */
  blocks: [
    {
      id: 'intro',
      kind: 'prose',
      emphasis: 'primary',
      role: 'definition',
      body: 'A leaf turns light into sugar.',
      terms: [{ text: 'sugar', mark: 'key' }],
    },
    {
      id: 'ingredients',
      kind: 'table',
      emphasis: 'primary',
      title: 'What goes in and what comes out',
      columns: [
        { key: 'side', label: 'Side', type: 'text' },
        { key: 'what', label: 'What', type: 'text' },
      ],
      rows: [
        { side: 'In', what: 'Light, water, carbon dioxide' },
        { side: 'Out', what: 'Sugar, oxygen' },
      ],
      caption: 'Read across one row to see one side of the swap.',
    },
    {
      id: 'keep-this',
      kind: 'summary',
      emphasis: 'primary',
      tone: 'result',
      role: 'summary',
      progression: ['Light arrives', 'The leaf combines water and carbon dioxide', 'Sugar is stored'],
      mentalModel: 'A leaf is a kitchen that cooks with light instead of heat.',
    },
  ],
  relations: [{ from: 'ingredients', to: 'intro', kind: 'supports' }],
}

const search: SearchPort = { search: async () => [] }

/** Captures the brief the handler hands the model. */
function recordingModel() {
  const seen: unknown[] = []
  const port: ModelPort = {
    lesson: async (request) => {
      seen.push(request)
      return VALID_LESSON
    },
  }
  return { port, seen }
}

const ask = (body: Record<string, unknown>) => ({ method: 'POST', path: '/api/lesson', body })

describe('the server decides how to teach', () => {
  it('chooses a worked example the first time, and says so in the reply', async () => {
    const { port } = recordingModel()
    const res = await createHandler({ model: port, search })(ask({ concept: 'Photosynthesis' }))

    expect(res.status).toBe(200)
    expect(res.body['strategy']).toBe('worked_example')
  })

  it('changes tactics when the concept has already been attempted twice', async () => {
    const { port } = recordingModel()
    const res = await createHandler({ model: port, search })(
      ask({ concept: 'Photosynthesis', attempts: 2 }),
    )
    expect(res.body['strategy']).toBe('change_representation')
  })

  it('breaks a carried-over concept down instead of repeating it', async () => {
    const { port } = recordingModel()
    const res = await createHandler({ model: port, search })(
      ask({ concept: 'Photosynthesis', attempts: 1, carriedFrom: '2026-08-24' }),
    )
    expect(res.body['strategy']).toBe('decomposition')
  })

  it('repairs a named misconception rather than reteaching', async () => {
    const { port } = recordingModel()
    const res = await createHandler({ model: port, search })(
      ask({ concept: 'Photosynthesis', diagnosis: 'misconception' }),
    )
    expect(res.body['strategy']).toBe('misconception_repair')
  })

  it('passes the strategy to the model as an INSTRUCTION it can act on', async () => {
    /* The effect, not the call. A handler that recorded the strategy in its
     * reply and told the model nothing would satisfy every check above. */
    const { port, seen } = recordingModel()
    await createHandler({ model: port, search })(ask({ concept: 'Photosynthesis', attempts: 3 }))

    const brief = seen[0] as { strategy?: string }
    expect(brief.strategy).toBe('analogy')
  })

  it('ignores a strategy the browser tries to choose for itself', async () => {
    /* Teaching policy is the server's. Accepting it from the request would let
     * a page pick "transfer_challenge" for a student meeting a topic for the
     * first time. */
    const { port } = recordingModel()
    const res = await createHandler({ model: port, search })(
      ask({ concept: 'Photosynthesis', strategy: 'transfer_challenge' }),
    )
    expect(res.body['strategy']).toBe('worked_example')
  })

  it('survives junk in every history field, and still teaches', async () => {
    const { port } = recordingModel()
    const handle = createHandler({ model: port, search })
    for (const history of [
      { attempts: 'lots' }, { attempts: -5 }, { attempts: null }, { attempts: Infinity },
      { diagnosis: 'marmalade' }, { diagnosis: 42 }, { carriedFrom: 999 },
      { attempts: {}, diagnosis: [], carriedFrom: {} },
    ]) {
      const res = await handle(ask({ concept: 'Photosynthesis', ...history }))
      expect(res.status, JSON.stringify(history)).toBe(200)
      expect(STRATEGIES, JSON.stringify(history)).toContain(res.body['strategy'] as string)
    }
  })

  it('still refuses a request with no concept', async () => {
    const { port } = recordingModel()
    const res = await createHandler({ model: port, search })(ask({ attempts: 2 }))
    expect(res.status).toBe(400)
  })

  it('reports the strategy even when the model fails, so the decision is not lost', async () => {
    const failing: ModelPort = { lesson: async () => { throw new Error('upstream down') } }
    const res = await createHandler({ model: failing, search })(ask({ concept: 'X', attempts: 2 }))

    expect(res.status).toBe(502)
    expect(res.body['strategy']).toBe('change_representation')
    /* And the upstream message still never escapes: it routinely carries the
     * credential that was rejected. */
    expect(JSON.stringify(res.body)).not.toContain('upstream down')
  })
})

describe('/api/ask is a question, not a taught concept', () => {
  it('carries no strategy, because there is no concept being taught', async () => {
    const { port } = recordingModel()
    const res = await createHandler({ model: port, search })({
      method: 'POST', path: '/api/ask', body: { question: 'why is the sky blue?' },
    })
    expect(res.status).toBe(200)
    expect(res.body['strategy']).toBeUndefined()
  })
})
