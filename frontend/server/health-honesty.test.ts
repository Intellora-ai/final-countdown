/* Health must describe the server that exists, not the one that was configured.
 *
 * DESIRED OUTCOME
 *   An orchestrator can trust `/api/health` to decide whether to send a student
 *   to this replica.
 *
 * WHAT MUST BE TRUE
 *   1. A REPLICA THAT CANNOT REACH ITS LEDGER REPORTS UNHEALTHY. Measured on
 *      2026-08-30 by stopping PostgreSQL under a running replica: every write
 *      returned 500 and `/api/health` went on answering
 *      `{"ok":true,"planner":true,"model":true}`. A load balancer reading that
 *      keeps routing students to a copy that fails all of them, and a container
 *      healthcheck reading it never restarts.
 *   2. THE STATUS CODE CARRIES IT, NOT ONLY THE BODY. Orchestrators and the
 *      Docker HEALTHCHECK branch on the code; a 200 whose body says `ok:false`
 *      is a healthy replica to every one of them.
 *   3. IT STILL LEAKS NOTHING. A failing dependency's message can name a host,
 *      a user, or a credential, and health is the most public route there is.
 *      It reports THAT the ledger is unreachable, never why.
 *   4. HEALTH IS NEVER RATE LIMITED and never costs a paid call — checked
 *      elsewhere, and the probe added here must not change it.
 */

import { describe, expect, it } from 'vitest'

import { createHandler, type ModelPort, type SearchPort } from './handler.ts'
import type { Ledger } from './almanac/ledger.ts'

const model: ModelPort = {
  async lesson() {
    throw new Error('health must never reach the paid model')
  },
}
const search: SearchPort = {
  async search() {
    throw new Error('health must never reach the paid search')
  },
}

function ledgerThat(ready: () => Promise<boolean>): Ledger {
  return {
    ready,
    async dayFor() {
      throw new Error('not used')
    },
    async read() {
      return undefined
    },
    async markDone() {
      /* not used */
    },
    async doneFor() {
      return new Set<string>()
    },
  } as Ledger
}

const ask = (almanac?: Ledger) =>
  createHandler({ model, search, ...(almanac === undefined ? {} : { almanac }), secrets: [] })({
    method: 'GET',
    path: '/api/health',
  })

describe('health', () => {
  it('reports healthy when the ledger answers', async () => {
    const response = await ask(ledgerThat(async () => true))
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ ok: true, planner: true })
  })

  it('reports UNHEALTHY when the ledger is unreachable', async () => {
    const response = await ask(ledgerThat(async () => false))
    expect(response.status).toBe(503)
    expect(response.body).toMatchObject({ ok: false, planner: false })
  })

  it('reports unhealthy when probing the ledger throws', async () => {
    const response = await ask(
      ledgerThat(async () => {
        throw new Error('connect ECONNREFUSED 10.0.0.5:5432, user=almanac password=hunter2')
      }),
    )
    expect(response.status).toBe(503)
    expect(response.body).toMatchObject({ ok: false, planner: false })
  })

  it('never repeats what the dependency said', async () => {
    const response = await ask(
      ledgerThat(async () => {
        throw new Error('connect ECONNREFUSED 10.0.0.5:5432, user=almanac password=hunter2')
      }),
    )
    const serialised = JSON.stringify(response.body)
    for (const secret of ['ECONNREFUSED', '10.0.0.5', 'almanac', 'hunter2', '5432']) {
      expect(serialised).not.toContain(secret)
    }
  })

  it('still answers when there is no planner configured at all', async () => {
    /* A server with no ledger is not a broken server, it is a different one.
     * Reporting it as unhealthy would make every API-only deployment restart
     * for ever. */
    const response = await ask(undefined)
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ ok: true, planner: false })
  })
})
