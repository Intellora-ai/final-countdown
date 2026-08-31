/* A REAL SERVER, REALLY LISTENING, AND A REAL BROWSER TALKING TO IT.
 *
 * WHY M1-M3 GO THROUGH HTTP INSTEAD OF CALLING `canvasMemory()` DIRECTLY.
 *
 *   Calling the store from a test proves the store agrees with itself. It
 *   cannot prove the thing a student actually depends on, because a student
 *   never calls a function -- she loads a page, and something in between
 *   decides whose memory she gets. That "something in between" is exactly where
 *   the isolation defect lived: the store's keys were always separate, and
 *   `handler.ts` handed any caller any key they asked for. A store-level test
 *   would have been green throughout.
 *
 *   So the proofs drive the product the way a person does: over a socket, with
 *   cookies, through the real router, into the real SQLite file.
 *
 * WHY THE MODEL PORT THROWS INSTEAD OF RETURNING A CANNED LESSON.
 *
 *   A stub that returns something is a guess about what the model would say. A
 *   port that THROWS asserts something instead: no memory route may reach the
 *   model. If one ever does, these tests fail loudly rather than passing on a
 *   fake answer. It is a stronger claim than a mock, and it is free.
 *
 * WHY PORT 0.
 *
 *   The operating system chooses a free port and reports it back. A hardcoded
 *   port makes the suite fail when anything else is listening, and makes two
 *   copies of the suite unable to run at once -- which is the normal case in CI
 *   and on a developer's machine at the same time.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { createServer } from '../index.ts'
import type { ModelPort, SearchPort } from '../handler.ts'
import { canvasMemory } from './store.ts'
import { sqliteMemoryStore } from './sqliteStore.ts'

/** Loopback only. A test must never open a port to the network. */
const HOST = '127.0.0.1'

/**
 * The secret these proofs sign identities with.
 *
 * A CONSTANT HERE IS CORRECT AND IS NOT THE HARDCODING THE RULES FORBID: this
 * is a test fixture, it protects nothing, and the whole point of several proofs
 * below is that a DIFFERENT secret must not verify. It is named so that a
 * second value can be passed where a proof needs one.
 */
export const A_TEST_SECRET = 'test-secret-not-used-anywhere-real'

/** A model that must never be reached from a memory route. */
const refusingModel: ModelPort = {
  lesson() {
    throw new Error('a memory route reached the model, which it must never do')
  },
}

/** A search port under the same rule. */
const refusingSearch: SearchPort = {
  search() {
    throw new Error('a memory route reached search, which it must never do')
  },
}

export interface LiveServer {
  /** e.g. `http://127.0.0.1:54321` -- discovered, never assumed. */
  readonly origin: string
  /** The real SQLite file this server writes to. */
  readonly memoryPath: string
  close(): Promise<void>
}

export interface LiveServerOptions {
  /** Reuse an existing file to prove memory outlived a restart. */
  readonly memoryPath?: string
  /** Override to prove a different secret does not verify another's cookie. */
  readonly identitySecret?: string
}

/** A temp directory per suite, removed when it ends. */
export function aTemporaryDirectory(): string {
  return mkdtempSync(join(tmpdir(), 'almanac-memory-'))
}

/** Start a real server. The caller closes it. */
export async function startLiveServer(options: LiveServerOptions = {}): Promise<LiveServer> {
  const memoryPath = options.memoryPath ?? join(aTemporaryDirectory(), 'memory.db')
  const memory = canvasMemory({ store: sqliteMemoryStore(memoryPath) })

  const server = createServer({
    model: refusingModel,
    search: refusingSearch,
    memory,
    identitySecret: options.identitySecret ?? A_TEST_SECRET,
  })

  const origin = await new Promise<string>((resolve) => {
    server.listen(0, HOST, () => {
      const address = server.address()
      /* `address()` is typed as string | AddressInfo | null because a server can
       * be bound to a pipe. This one is bound to a port, and saying so out loud
       * is better than a cast that would hide the day it is not. */
      if (address === null || typeof address === 'string') {
        throw new Error('the test server did not bind to a port')
      }
      resolve(`http://${HOST}:${address.port}`)
    })
  })

  return {
    origin,
    memoryPath,
    close: () => new Promise<void>((resolve) => { server.close(() => { resolve() }) }),
  }
}

/**
 * One browser: one cookie jar.
 *
 * THE COOKIE JAR IS THE WHOLE POINT. Two of these are two different people, in
 * exactly the way two real browsers are, because neither can see the other's
 * cookie. Sharing one `fetch` across both would quietly make them the same
 * student and every isolation proof would be meaningless.
 */
export interface Browser {
  readMemory(query: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> }>
  writeMemory(body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }>
  post(path: string, body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }>
  /** The identity this browser is holding, or undefined before its first request. */
  identity(): string | undefined
  /** Replace the jar, to impersonate or to corrupt a cookie on purpose. */
  setIdentity(cookie: string | undefined): void
}

export function aBrowser(origin: string): Browser {
  let jar: string | undefined

  const keep = (response: { headers: { getSetCookie?: () => string[]; get: (n: string) => string | null } }): void => {
    /* `getSetCookie` returns every Set-Cookie separately; `get` folds them into
     * one string. Both are used because runtimes differ, and reading only the
     * folded form loses the flags a later proof checks. */
    const all = response.headers.getSetCookie?.() ?? []
    const one = all.length > 0 ? all[0] : response.headers.get('set-cookie')
    if (one !== null && one !== undefined && one !== '') jar = one.split(';')[0]
  }

  const send = async (
    path: string,
    init: { method: string; body?: string },
  ): Promise<{ status: number; body: Record<string, unknown> }> => {
    const response = await fetch(`${origin}${path}`, {
      method: init.method,
      ...(init.body === undefined ? {} : { body: init.body }),
      headers: {
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(jar === undefined ? {} : { cookie: jar }),
      },
    })
    keep(response)
    return { status: response.status, body: (await response.json()) as Record<string, unknown> }
  }

  return {
    readMemory: (query) => send(`/api/memory?${new URLSearchParams(query).toString()}`, { method: 'GET' }),
    writeMemory: (body) => send('/api/memory', { method: 'PUT', body: JSON.stringify(body) }),
    post: (path, body) => send(path, { method: 'POST', body: JSON.stringify(body) }),
    identity: () => jar,
    setIdentity: (cookie) => { jar = cookie },
  }
}

/* -------------------------------------------------------------------------- */
/* The harness is load-bearing, so it is tested.                              */
/* -------------------------------------------------------------------------- */

describe('the harness these proofs run on', () => {
  const started: LiveServer[] = []
  afterAll(async () => {
    for (const server of started) {
      await server.close()
      rmSync(join(server.memoryPath, '..'), { recursive: true, force: true })
    }
  })

  it('really listens on a real port, chosen by the operating system', async () => {
    const server = await startLiveServer()
    started.push(server)

    /* Not a fixed port anywhere: the origin is read back from the socket. */
    expect(server.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)

    const health = await fetch(`${server.origin}/api/health`)
    expect(health.status).toBe(200)
  })

  it('gives two browsers two different identities, which is what makes them two people', async () => {
    const server = await startLiveServer()
    started.push(server)

    const one = aBrowser(server.origin)
    const other = aBrowser(server.origin)
    await one.readMemory({ tabId: 't', lessonId: 'l' })
    await other.readMemory({ tabId: 't', lessonId: 'l' })

    expect(one.identity()).toBeDefined()
    expect(other.identity()).toBeDefined()
    /* If this ever fails, every isolation proof below is vacuous. */
    expect(one.identity()).not.toEqual(other.identity())
  })

  it('keeps one browser as one person across requests', async () => {
    const server = await startLiveServer()
    started.push(server)

    const person = aBrowser(server.origin)
    await person.readMemory({ tabId: 't', lessonId: 'l' })
    const first = person.identity()
    await person.readMemory({ tabId: 't', lessonId: 'l' })

    /* A jar that changed every request would make persistence untestable: every
     * read would be a new student who has genuinely never stored anything. */
    expect(person.identity()).toEqual(first)
  })
})
