/**
 * The other half of the contract: does this server actually send it?
 *
 * A CONSUMER PACT ON ITS OWN PROVES NOTHING ABOUT THE PROVIDER.
 * `src/almanac/planner.pact.test.ts` records what the browser needs and drives
 * the real client against a mock that returns exactly that. Every assertion
 * there passes whether or not this server has ever sent such a body. The
 * contract only becomes a check when it is replayed against the real handler,
 * which is what this file does.
 *
 * THE REAL SERVER, NOT A DOUBLE OF IT. `createServer` from `index.ts` is booted
 * on an ephemeral port -- the same routing, the same body cap, the same
 * validation gate the product runs. Two things are substituted, and only two:
 *
 *   the model    a stub returning a lesson that passes the real gate. A live
 *                model would make this test cost money, need a key, and fail
 *                for reasons that have nothing to do with the contract.
 *   the store    in memory. The ledger logic is the real one; only the disk is
 *                not.
 *
 * WHY THIS BOUNDARY AND NOT THE EXTERNAL API. `server/provider.test.ts` is
 * about model providers. `src/api/client.pact.test.ts` contracts the external
 * Learning OS. Neither covers `/api/day`, `/api/lesson`, `/api/ask` or
 * `/api/done` -- which is every request a learner's browser actually makes, and
 * where the 502s were measured.
 */

import { Verifier } from '@pact-foundation/pact'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
/* `node:http`, not `node:net`. This project has no @types/node -- `server/node.d.ts`
   hand-declares exactly the calls the server makes, and both `Server` and
   `AddressInfo` are already there. Reaching for `node:net` and `path.resolve`
   failed typecheck for that reason, which is the declaration file working. */
import type { AddressInfo, Server } from 'node:http'

import { createServer } from './index.ts'
import { createLedger, type LedgerData, type LedgerStore } from './almanac/ledger.ts'
import type { ModelPort, SearchPort } from './handler.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const PACT = join(HERE, '..', '..', 'pacts', 'learning-canvas-canvas-planner.json')

/**
 * A lesson that passes the REAL browser gate.
 *
 * A single prose block is refused: a taught lesson opens with a definition,
 * closes with a summary, and shows something rather than only telling it. A
 * stub that could not pass the gate would make every interaction here assert a
 * 200 the product can never produce.
 */
const LESSON = {
  id: 'photosynthesis',
  question: 'How does a leaf make food?',
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

const model: ModelPort = { lesson: async () => LESSON }
const search: SearchPort = { search: async () => [] }

/** The ledger's logic, none of its disk. */
function memoryStore(): LedgerStore {
  let data: LedgerData = { days: {}, done: {} }
  return {
    load: async () => data,
    save: async (next) => {
      data = next
    },
  }
}

let server: Server
let port = 0

beforeAll(async () => {
  server = createServer({ model, search, almanac: createLedger(memoryStore()) })
  await new Promise<void>((ready) => {
    server.listen(0, '127.0.0.1', ready)
  })
  port = (server.address() as AddressInfo).port
})

afterAll(async () => {
  await new Promise<void>((closed) => {
    server.close(() => closed())
  })
})

describe('the canvas planner honours the contract the browser depends on', () => {
  it('answers every recorded interaction with the shape that was recorded', async () => {
    /*
     * `verifyProvider` REJECTS on a mismatch, so the assertion is that it
     * resolves. A field renamed on this side -- `done` to `ok`, `error` to
     * `message`, `items` to `rows` -- fails here rather than in a browser.
     *
     * The provider states are no-ops on purpose and that is worth saying out
     * loud rather than leaving as an empty object: this server holds its whole
     * world in the ledger it was constructed with, and every interaction in the
     * pact is reachable from the empty ledger created above. A state handler
     * that seeded data would be describing a setup the product does not have.
     */
    await expect(
      new Verifier({
        provider: 'canvas-planner',
        providerBaseUrl: `http://127.0.0.1:${port}`,
        pactUrls: [PACT],
        logLevel: 'warn',
        stateHandlers: {
          'a student with a plannable class and subjects': async () => 'ready',
          'the model answers': async () => 'ready',
          'the planner is configured': async () => 'ready',
        },
      }).verifyProvider(),
    ).resolves.toBeDefined()
  }, 120_000)
})
