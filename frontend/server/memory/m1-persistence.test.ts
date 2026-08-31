/* M1 — PERSISTENCE. FOUR WORDS, FOUR DIFFERENT DEATHS.
 *
 * The requirement, verbatim: "memory survives reopen, restart, crash, network
 * drop." Every word in that sentence names a DIFFERENT way for a process to
 * stop, and a proof that covers one of them has not covered the others.
 *
 *   REOPEN        the file is closed politely and opened again. Nothing died.
 *   RESTART       the SERVER stopped and a new one took over the same file.
 *                 Memory has to outlive the process that stored it -- and so
 *                 does the IDENTITY, or the memory is still there and nobody
 *                 can reach it. A restart proof that only checks the bytes and
 *                 forgets the cookie proves the student's work exists and is
 *                 lost, which is not what "survives" means to her.
 *   CRASH         a real process is SIGKILLed. This is the one that is easy to
 *                 fake and the only one that matters most: `close()` is a
 *                 SHUTDOWN, and a shutdown gets to flush, commit, fsync and
 *                 tidy up. A crash gets none of that. So the proof below spawns
 *                 a REAL child process, waits for it to say its write RETURNED,
 *                 kills it with SIGKILL, and asserts on the exit SIGNAL -- if
 *                 the child exited with a code instead, it shut down cleanly
 *                 and the proof would be about the wrong thing entirely.
 *   NETWORK DROP  the process is fine; the CONNECTION is gone. Two claims, and
 *                 both are needed. A write the server ACKNOWLEDGED is durable
 *                 -- the 200 is a promise, not a hope. And a request cut
 *                 mid-flight leaves EITHER nothing OR the whole record. Never
 *                 half of one. "Half a record" is the failure a student cannot
 *                 detect and cannot recover from: it looks like her work.
 *
 * WHY THE ASSERTIONS COMPARE RAW TEXT AND NOT PARSED OBJECTS.
 *
 *   `record.ts` promises the value comes back BYTE FOR BYTE. A deep-equality
 *   check on parsed objects is a weaker claim than the one that was made: it
 *   would pass for a store that reordered keys, dropped a `__proto__` key into
 *   a prototype, or turned a large integer into a float. So the checks below
 *   compare the stored TEXT to `toStoredText(value)`, which is the exact
 *   promise, and only then look at the decoded value.
 *
 * WHY THERE IS A NEGATIVE BESIDE EVERY POSITIVE.
 *
 *   "It came back" is satisfied completely by a store that hands back the same
 *   thing for every key, and "the record is there" is satisfied by a server
 *   that hands any caller any record. So each proof below is paired with the
 *   input that must NOT come back: a key nobody wrote, a browser holding no
 *   cookie, a neighbouring memory the crashed child never touched.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { IDENTITY_COOKIE, readCookie, verifyIdentity } from '../identity.ts'
import { anOwner, aStorableValue, DRAWS, seededRandom } from './generate.test.ts'
import { BadMemoryKey, memoryKey, type MemoryOwner } from './key.ts'
import {
  A_TEST_SECRET,
  aBrowser,
  aTemporaryDirectory,
  startLiveServer,
  type Browser,
  type LiveServer,
} from './live.test.ts'
import { toStoredText } from './record.ts'
import { canvasMemory } from './store.ts'
import { sqliteMemoryStore, type MemoryStore } from './sqliteStore.ts'

/* -------------------------------------------------------------------------- */
/* Named numbers. Every one of these says what it is FOR, because a bare        */
/* literal in a persistence proof is a decision nobody can review later.        */
/* -------------------------------------------------------------------------- */

/**
 * The instant every write below is stamped with.
 *
 * `store.ts` exists to make a stored time a FACT rather than a guess, and it
 * offers `now` for exactly this reason. A real clock here would make two runs
 * of the same proof compare different bytes.
 */
const AN_INSTANT = '2026-01-01T00:00:00.000Z'

/**
 * The seed every property draw comes from.
 *
 * FIXED, AND PRINTED IN THE FAILURE MESSAGE. An unseeded property test that
 * fails once and passes on re-run teaches the reader to press the button again.
 * This number has no meaning beyond "a number somebody wrote down"; what makes
 * it load-bearing is that it reproduces the exact counterexample.
 */
const PROPERTY_SEED = 20260831

/** How long the crashing child gets to boot Node, open SQLite and write. */
const CHILD_MARKER_TIMEOUT_MS = 30_000

/** How often the parent looks for the child's marker while waiting. */
const CHILD_POLL_MS = 10

/** Whole-test budget for the crash proof: it spawns a real Node process. */
const CRASH_TEST_TIMEOUT_MS = 60_000

/** The line the child prints once -- and only once -- its write has RETURNED. */
const CHILD_ACKNOWLEDGED = 'M1-CRASH-CHILD-WRITE-RETURNED'

/**
 * How long a cut request is given to reach the disk before the proof gives up.
 *
 * Generous on purpose: this is a wait for a loopback round trip on a machine
 * that may be running the rest of the suite at the same time, and a tight
 * budget here would turn a slow machine into a red test about nothing.
 */
const LANDING_TIMEOUT_MS = 10_000

/**
 * When each blind cut happens, in milliseconds after the request was started.
 *
 * A SPREAD, NOT A CONSTANT, and that is the whole design of it. `0` cuts before
 * the body has finished leaving; the small values cut while the server is
 * reading it; the large ones cut long after the record has landed and while the
 * answer is on its way back. One fixed delay would only ever exercise whichever
 * of those the machine happened to be fast enough for that day.
 */
const CUT_DELAYS_MS: readonly number[] = [0, 0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144]

/**
 * Roughly how big a cut record is.
 *
 * Big enough that the body cannot leave the client in a single write, which is
 * what makes "cut mid-body" a real event rather than a thing the test hopes
 * for. Far below `MAX_RECORD_BYTES`, so a 413 never masquerades as a drop.
 */
const A_RECORD_TOO_BIG_FOR_ONE_PACKET = 64 * 1024

/* -------------------------------------------------------------------------- */
/* Fixtures.                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * An owner made entirely of the hazards `key.ts` claims to handle.
 *
 * The colon is the separator `memoryKey` joins with; `%3A` is what an already
 * encoded colon looks like; the emoji is two UTF-16 code units. If persistence
 * were tested with `student/tab/lesson` it would be a proof about the three
 * easiest strings in the world.
 */
const A_HOSTILE_OWNER: MemoryOwner = {
  studentId: 'a:b',
  tabId: 'tab%3A1',
  lessonId: 'gas-pressure 🧪',
}

/** A neighbour of the above that nothing below ever writes to. */
const AN_OWNER_NOBODY_WROTE: MemoryOwner = {
  studentId: 'a:b',
  tabId: 'tab%3A1',
  lessonId: 'gas-pressure 🧪 (never studied)',
}

/**
 * The owner ONLY the crashed child ever writes, and the neighbour it never does.
 *
 * SEPARATE FROM EVERY OTHER OWNER IN THIS FILE, AND THAT SEPARATION IS THE PROOF
 * RATHER THAN TIDINESS. Measured, with a mutant: a store that kept records in a
 * process-local map and only wrote them to disk on `close()` passed every proof
 * here -- including the crash proof -- because the crash proof read back the
 * hostile owner that the REOPEN proofs had already written in this same process.
 * It was reading another test's leftovers and calling it a survivor.
 *
 * Nothing in the parent process ever writes this key. So a value found under it
 * can only have come from a process that no longer exists, which is the entire
 * claim the word "crash" makes. The same mutant is caught now.
 */
const AN_OWNER_ONLY_THE_DEAD_CHILD_WROTE: MemoryOwner = {
  studentId: 'crashed:child',
  tabId: 'tab%3A9 🧪',
  lessonId: 'written once, by a process that was about to be killed',
}

const AN_OWNER_THE_DEAD_CHILD_NEVER_WROTE: MemoryOwner = {
  ...AN_OWNER_ONLY_THE_DEAD_CHILD_WROTE,
  lessonId: 'never written by anything, anywhere, at all',
}

/**
 * A record made of the shapes that break naive stores.
 *
 * `__proto__` and `constructor` are ORDINARY KEYS here, written with computed
 * syntax because `{ __proto__: x }` in a literal sets the prototype instead of
 * creating a key -- which is the same confusion the store must not fall into.
 */
const A_HOSTILE_RECORD = {
  what: 'why heating a gas raises its pressure',
  level: 3,
  big: Number.MAX_SAFE_INTEGER,
  negative: -Number.MAX_SAFE_INTEGER,
  nothing: null,
  empty: '',
  looksLikeJson: '{"not":"parsed"}',
  unicode: 'héllo 中 🧪',
  nested: { a: [1, 2, [3, { b: true }]], c: {}, d: [] },
  ['__proto__']: { polluted: true },
  ['constructor']: 'an ordinary key',
  ['']: 'an empty key is a key',
  [':']: 'the separator, as a key',
} as const

/**
 * What the crashing child writes, and only the crashing child.
 *
 * Carries the same hazards, plus a sentence no other proof in this process ever
 * stores. See `AN_OWNER_ONLY_THE_DEAD_CHILD_WROTE` for why that matters.
 */
const A_RECORD_ONLY_THE_DEAD_CHILD_WROTE = {
  ...A_HOSTILE_RECORD,
  writtenBy: 'a process that was SIGKILLed one moment later',
}

/** A record large enough that cutting the connection can land inside it. */
function aRecordOfAboutABlock(): Record<string, unknown> {
  const line = 'the quick brown fox jumps over the lazy dog 0123456789 é中🧪'
  const howMany = Math.ceil(A_RECORD_TOO_BIG_FOR_ONE_PACKET / line.length)
  return {
    note: 'cut me in half and I must not come back as half',
    lines: Array.from({ length: howMany }, (_, i) => `${i}:${line}`),
  }
}

/* -------------------------------------------------------------------------- */
/* Everything opened here is closed in one place, because a leaked server or a  */
/* child that waits forever does not fail the suite -- it HANGS it, which is    */
/* the failure nobody can read.                                                 */
/* -------------------------------------------------------------------------- */

const temporaryDirectories: string[] = []
const startedServers: LiveServer[] = []
const spawnedChildren: ChildProcess[] = []
const openedStores: MemoryStore[] = []

/** A fresh SQLite file, under a fresh temp directory. No path is ever fixed. */
function aFreshMemoryFile(name: string): string {
  const directory = aTemporaryDirectory()
  temporaryDirectories.push(directory)
  return join(directory, `${name}.db`)
}

/** Open a store and remember it, so an assertion failure cannot leak a handle. */
function openStore(path: string): MemoryStore {
  const store = sqliteMemoryStore(path)
  openedStores.push(store)
  return store
}

/**
 * A server on a chosen file, with the secret stated rather than defaulted.
 *
 * The secret is passed explicitly because the RESTART proof depends on it: a
 * cookie signed by the first server must verify at the second, and a default
 * doing that quietly is a coincidence the proof should not rest on.
 */
async function aServerOn(memoryPath: string): Promise<LiveServer> {
  const server = await startLiveServer({ memoryPath, identitySecret: A_TEST_SECRET })
  startedServers.push(server)
  return server
}

/**
 * The student id behind a browser's cookie.
 *
 * READ THE SAME WAY THE SERVER READS IT, through `readCookie` and
 * `verifyIdentity`, so the proof addresses the row the product addresses. A
 * test that split the cookie itself could drift from the server and then assert
 * confidently about a key nothing uses.
 */
function theStudentBehind(browser: Browser): string {
  const token = readCookie(browser.identity(), IDENTITY_COOKIE)
  expect(token).toBeDefined()
  const studentId = verifyIdentity(token as string, A_TEST_SECRET)
  expect(studentId).toBeDefined()
  return studentId as string
}

/** A memory writer over a store, silent and clock-fixed. See `AN_INSTANT`. */
function memoryOver(store: MemoryStore) {
  /* `log` is silenced, not because logging is unwanted, but because these
   * proofs write hundreds of records and four hundred log lines would bury the
   * one assertion that failed. The write is proven by reading it back, which is
   * a stronger statement than a line of text claiming it happened. */
  return canvasMemory({ store, now: () => AN_INSTANT, log: () => {} })
}

afterAll(async () => {
  for (const child of spawnedChildren) child.kill('SIGKILL')
  for (const store of openedStores) {
    /* Already-closed is the normal case: most proofs close as they go. Closing
     * twice must not be what turns a green suite red. */
    try {
      store.close()
    } catch {
      /* it was already closed */
    }
  }
  for (const server of startedServers) await server.close()
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true })
  }
})

/* ========================================================================== */
/* REOPEN                                                                     */
/* ========================================================================== */

describe('M1 — memory survives REOPEN', () => {
  it('gives back the exact bytes after the file is closed and a new store opens it', () => {
    const path = aFreshMemoryFile('reopen')

    const first = openStore(path)
    memoryOver(first).write(A_HOSTILE_OWNER, A_HOSTILE_RECORD)
    /* A POLITE CLOSE. This is the easy death, and it is here so that the crash
     * proof below can be compared against it: same file, same record, one of
     * them got to tidy up and the other did not. */
    first.close()

    const second = openStore(path)

    /* THE PROMISE AS IT WAS ACTUALLY MADE: byte for byte. */
    expect(second.read(memoryKey(A_HOSTILE_OWNER))).toBe(toStoredText(A_HOSTILE_RECORD))
    /* And the decoded value, so "the bytes match" is not the only thing said. */
    expect(memoryOver(second).read(A_HOSTILE_OWNER)).toEqual(A_HOSTILE_RECORD)

    second.close()
  })

  it('still has nothing for a memory nobody wrote, so "it came back" is not one answer for every key', () => {
    const path = aFreshMemoryFile('reopen-empty')

    const first = openStore(path)
    memoryOver(first).write(A_HOSTILE_OWNER, A_HOSTILE_RECORD)
    first.close()

    const second = openStore(path)
    const reopened = memoryOver(second)

    /* THE PAIR. Without this, a store whose `read` returned the same record for
     * every key would pass the proof above completely. */
    expect(reopened.read(AN_OWNER_NOBODY_WROTE)).toBeUndefined()
    expect(reopened.read(A_HOSTILE_OWNER)).toEqual(A_HOSTILE_RECORD)

    second.close()
  })
})

/* ========================================================================== */
/* RESTART                                                                    */
/* ========================================================================== */

describe('M1 — memory survives RESTART', () => {
  it('lets the same student read her work back through a second server on the same file', async () => {
    const path = aFreshMemoryFile('restart')
    const tabId = 'tab-one'
    const lessonId = 'why-heating-a-gas-raises-its-pressure'

    const before = await aServerOn(path)
    const person = aBrowser(before.origin)

    const saved = await person.writeMemory({ tabId, lessonId, record: A_HOSTILE_RECORD })
    expect(saved.status).toBe(200)
    expect(saved.body).toEqual({ saved: true })

    /* The identity the FIRST server minted. Carrying this across is the whole
     * second half of the claim: bytes on disk that no browser can address are
     * not memory that survived, they are memory that was lost quietly. */
    const herCookie = person.identity()
    expect(herCookie).toBeDefined()

    await before.close()

    const after = await aServerOn(path)
    /* A genuinely different socket. Port 0 twice cannot return the same port
     * while the first is still bound, and saying so out loud is what stops this
     * proof silently degrading into "the same server answered twice". */
    expect(after.origin).not.toEqual(before.origin)

    const returning = aBrowser(after.origin)
    returning.setIdentity(herCookie)
    const got = await returning.readMemory({ tabId, lessonId })

    expect(got.status).toBe(200)
    /* Byte-exact through the whole product: HTTP in, SQLite, restart, HTTP out. */
    expect(JSON.stringify(got.body['record'])).toBe(toStoredText(A_HOSTILE_RECORD))

    /* THE PAIR. A browser with no cookie is a different person and must see
     * nothing -- otherwise the read above proved only that the server hands any
     * caller any record, which is the defect `identity.ts` was written to close. */
    const stranger = aBrowser(after.origin)
    const strangerSaw = await stranger.readMemory({ tabId, lessonId })
    expect(strangerSaw.status).toBe(200)
    expect(strangerSaw.body).toEqual({ record: null })
  })
})

/* ========================================================================== */
/* CRASH                                                                      */
/* ========================================================================== */

/**
 * The program the crashing child runs.
 *
 * WHY THE PAYLOAD TRAVELS AS BASE64. The owner contains a colon, a percent
 * sequence and an astral-plane emoji, and the record contains newlines and
 * quotes. Embedding those in a command-line argument makes the proof partly a
 * proof about shell and argv encoding. Base64 is pure ASCII, so what the child
 * writes is exactly what the parent meant, and the hazards are still in the
 * VALUE where they belong.
 *
 * WHY THE CHILD WAITS FOREVER AT THE END. It must be alive and idle when the
 * signal arrives. A child that was about to exit anyway would leave it unknown
 * whether the record survived the kill or simply beat it.
 */
function theProgramThatWritesThenWaits(payload: string): string {
  const storeModule = JSON.stringify(new URL('store.ts', import.meta.url).href)
  const sqliteModule = JSON.stringify(new URL('sqliteStore.ts', import.meta.url).href)

  return `
import { canvasMemory } from ${storeModule}
import { sqliteMemoryStore } from ${sqliteModule}

const asked = JSON.parse(Buffer.from(${JSON.stringify(payload)}, 'base64').toString('utf8'))

/* THE REAL PRODUCT, NOT A COPY OF IT. If this child wrote to SQLite itself, the
 * proof would be about the child. */
const memory = canvasMemory({
  store: sqliteMemoryStore(asked.path),
  now: () => asked.at,
  log: () => {},
})

memory.write(asked.owner, asked.record)

/* PRINTED ONLY AFTER write() RETURNED. That return is the acknowledgement, and
 * the acknowledgement is the thing the parent is about to test the durability
 * of. Printing first would claim a save that had not happened yet. */
console.log(${JSON.stringify(CHILD_ACKNOWLEDGED)})

/* Nothing closes the store. Nothing flushes. Nothing gets a chance to. */
setInterval(() => {}, 1000)
`
}

describe('M1 — memory survives CRASH', () => {
  it(
    'keeps an acknowledged write after the process that made it is SIGKILLed with no chance to clean up',
    async () => {
      const path = aFreshMemoryFile('crash')
      const payload = Buffer.from(
        JSON.stringify({
          path,
          at: AN_INSTANT,
          owner: AN_OWNER_ONLY_THE_DEAD_CHILD_WROTE,
          record: A_RECORD_ONLY_THE_DEAD_CHILD_WROTE,
        }),
      ).toString('base64')

      const child = spawn(
        process.execPath,
        ['--input-type=module', '-e', theProgramThatWritesThenWaits(payload)],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      )
      spawnedChildren.push(child)

      const heard = { out: '', err: '' }
      child.stdout.on('data', (chunk) => {
        heard.out += String(chunk)
      })
      child.stderr.on('data', (chunk) => {
        heard.err += String(chunk)
      })

      const deadline = Date.now() + CHILD_MARKER_TIMEOUT_MS
      while (!heard.out.includes(CHILD_ACKNOWLEDGED)) {
        if (Date.now() > deadline) {
          /* Reported with the child's own output, because "it timed out" with
           * nothing else said is the least useful failure a spawned process can
           * produce. */
          throw new Error(
            `the crash child never acknowledged its write within ${CHILD_MARKER_TIMEOUT_MS}ms.\n` +
              `stdout: ${JSON.stringify(heard.out)}\nstderr: ${JSON.stringify(heard.err)}`,
          )
        }
        await new Promise<void>((resolve) => setTimeout(resolve, CHILD_POLL_MS))
      }

      /* Registered BEFORE the signal is sent. A listener attached afterwards can
       * miss an exit that already happened, and the test would then wait on a
       * promise nothing will ever settle. */
      const died = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
        child.on('exit', (code, signal) => {
          resolve({ code, signal })
        })
      })

      child.kill('SIGKILL')
      const how = await died

      /* THIS IS WHAT MAKES IT A CRASH AND NOT A SHUTDOWN, AND IT IS ASSERTED
       * RATHER THAN ASSUMED. A process that exits with a CODE ran to the end of
       * itself: handlers fired, buffers flushed, the database closed. SIGKILL
       * cannot be caught, handled or ignored, so a child reporting it was killed
       * by SIGKILL is a child that got none of that. If this ever reports a code
       * instead, every assertion below is about a polite close and the proof has
       * quietly stopped testing the word "crash". */
      expect(how.signal).toBe('SIGKILL')
      expect(how.code).toBeNull()

      /* The file, opened fresh, by a process that was never the writer -- and
       * under a key this process has never written. Both halves are load-bearing:
       * see `AN_OWNER_ONLY_THE_DEAD_CHILD_WROTE`. */
      const survivor = openStore(path)
      expect(survivor.read(memoryKey(AN_OWNER_ONLY_THE_DEAD_CHILD_WROTE))).toBe(
        toStoredText(A_RECORD_ONLY_THE_DEAD_CHILD_WROTE),
      )
      expect(memoryOver(survivor).read(AN_OWNER_ONLY_THE_DEAD_CHILD_WROTE)).toEqual(
        A_RECORD_ONLY_THE_DEAD_CHILD_WROTE,
      )

      /* THE PAIR. The dead child wrote one memory. A store that came back
       * claiming to hold a memory it was never given is not a store that
       * survived a crash; it is a store that is making things up. */
      expect(memoryOver(survivor).read(AN_OWNER_THE_DEAD_CHILD_NEVER_WROTE)).toBeUndefined()

      survivor.close()
    },
    CRASH_TEST_TIMEOUT_MS,
  )
})

/* ========================================================================== */
/* NETWORK DROP                                                               */
/* ========================================================================== */

/**
 * Send a real PUT and cut it after `afterMs`.
 *
 * `AbortController` on a real `fetch` destroys the underlying socket, which is
 * what a dropped network does to a request in flight. Nothing here is
 * simulated, and nothing about the server is stubbed out.
 */
async function cutAWriteInFlight(
  origin: string,
  cookie: string,
  body: Record<string, unknown>,
  afterMs: number,
): Promise<'cut' | 'answered'> {
  const controller = new AbortController()
  const scissors = setTimeout(() => {
    controller.abort()
  }, afterMs)
  try {
    const response = await fetch(`${origin}/api/memory`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    /* Drained, so "answered" means the whole answer arrived rather than just
     * its headers. */
    await response.arrayBuffer()
    return 'answered'
  } catch {
    return 'cut'
  } finally {
    clearTimeout(scissors)
  }
}

describe('M1 — memory survives NETWORK DROP', () => {
  it('keeps a write the server acknowledged, even as later connections are cut underneath it', async () => {
    const path = aFreshMemoryFile('drop-acknowledged')
    const server = await aServerOn(path)
    const person = aBrowser(server.origin)
    const tabId = 'tab-one'
    const lessonId = 'acknowledged'

    const acknowledged = await person.writeMemory({ tabId, lessonId, record: A_HOSTILE_RECORD })
    /* THE ACKNOWLEDGEMENT. Everything below tests whether this 200 was a
     * promise or merely an opinion. */
    expect(acknowledged.status).toBe(200)
    expect(acknowledged.body).toEqual({ saved: true })

    const cookie = person.identity() as string
    /* The network now falls over repeatedly around the record that was already
     * saved: fourteen real requests to the same server, every one of them cut. */
    for (const afterMs of CUT_DELAYS_MS) {
      await cutAWriteInFlight(
        server.origin,
        cookie,
        { tabId: 'tab-being-cut', lessonId, record: aRecordOfAboutABlock() },
        afterMs,
      )
    }

    const stillThere = await person.readMemory({ tabId, lessonId })
    expect(stillThere.status).toBe(200)
    expect(JSON.stringify(stillThere.body['record'])).toBe(toStoredText(A_HOSTILE_RECORD))
  })

  it('leaves either nothing or the whole record when a request is cut mid-flight, never half of one', async () => {
    const path = aFreshMemoryFile('drop-midflight')
    const server = await aServerOn(path)
    const person = aBrowser(server.origin)
    const lessonId = 'cut-in-half'

    /* One ordinary request first, so this browser HAS an identity to sign the
     * cut ones with. A cut request that arrived with no cookie would be a
     * different student every time and the keys below would name nothing. */
    await person.readMemory({ tabId: 'warm-up', lessonId })
    const cookie = person.identity() as string
    const studentId = theStudentBehind(person)

    const record = aRecordOfAboutABlock()
    const expectedText = toStoredText(record)

    let cut = 0
    for (let attempt = 0; attempt < CUT_DELAYS_MS.length; attempt += 1) {
      const outcome = await cutAWriteInFlight(
        server.origin,
        cookie,
        { tabId: `cut-${attempt}`, lessonId, record },
        CUT_DELAYS_MS[attempt] as number,
      )
      if (outcome === 'cut') cut += 1
    }

    /* NON-VACUITY. If nothing was actually cut, the invariant below is a
     * statement about fourteen ordinary successful writes and proves nothing
     * whatever about a dropped network. */
    expect(cut).toBeGreaterThan(0)

    /* Read at the lowest level there is: the raw text in the row. A parsed
     * comparison would quietly accept a record that had been re-encoded, and
     * truncation is exactly the failure this proof exists to catch. */
    const inspector = openStore(path)
    const verdicts: string[] = []
    for (let attempt = 0; attempt < CUT_DELAYS_MS.length; attempt += 1) {
      const raw = inspector.read(memoryKey({ studentId, tabId: `cut-${attempt}`, lessonId }))
      if (raw === undefined) {
        verdicts.push('nothing')
      } else if (raw === expectedText) {
        verdicts.push('the whole record')
      } else {
        verdicts.push(
          `HALF A RECORD at attempt ${attempt}: ${raw.length} bytes, expected ${expectedText.length}: ` +
            `${JSON.stringify(raw.slice(0, 200))}`,
        )
      }
    }
    inspector.close()

    /* Every outcome must be one of the two the requirement allows. Named in
     * words rather than counted, so a failure says WHICH attempt went wrong and
     * what it found there. */
    for (const verdict of verdicts) {
      expect(verdict).toMatch(/^(nothing|the whole record)$/)
    }
  })

  it('leaves the whole record when the connection is cut in the instant after the record lands', async () => {
    const path = aFreshMemoryFile('drop-worst-moment')
    const server = await aServerOn(path)
    const person = aBrowser(server.origin)
    const tabId = 'tab-cut-at-the-worst-moment'
    const lessonId = 'worst-moment'

    await person.readMemory({ tabId, lessonId })
    const cookie = person.identity() as string
    const studentId = theStudentBehind(person)
    const key = memoryKey({ studentId, tabId, lessonId })

    const record = aRecordOfAboutABlock()
    const expectedText = toStoredText(record)

    /* THE WORST MOMENT IS FOUND, NOT GUESSED.
     *
     * A fixed delay would cut at whatever moment the machine happened to be at,
     * and on a fast machine that is "long after everything finished" -- which is
     * not the dangerous instant. So the request is started, the FILE is watched
     * until the record actually appears in it, and the connection is cut the
     * moment it does: after the write, before the answer could get home. That is
     * the case where the student is told nothing and the server believes it
     * saved, and it is produced deterministically rather than hoped for. */
    const controller = new AbortController()
    const inFlight = fetch(`${server.origin}/api/memory`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ tabId, lessonId, record }),
      signal: controller.signal,
    }).then(
      async (response) => {
        await response.arrayBuffer()
        return 'answered' as const
      },
      () => 'cut' as const,
    )

    const watcher = openStore(path)
    const deadline = Date.now() + LANDING_TIMEOUT_MS
    let landed: string | undefined
    while (landed === undefined) {
      if (Date.now() > deadline) {
        controller.abort()
        await inFlight
        throw new Error(
          `a well-formed PUT never reached the file within ${LANDING_TIMEOUT_MS}ms, so the ` +
            'moment this proof needs to cut at never arrived',
        )
      }
      landed = watcher.read(key)
      if (landed === undefined) {
        await new Promise<void>((resolve) => setTimeout(resolve, CHILD_POLL_MS))
      }
    }
    controller.abort()
    await inFlight
    watcher.close()

    /* What the server had already written, at the instant the wire was cut. */
    expect(landed).toBe(expectedText)

    /* And it is still whole afterwards: a cut connection must not reach back and
     * undo, truncate or half-rewrite a row that was already committed. Read from
     * a store that was not open when any of this happened. */
    const afterwards = openStore(path)
    expect(afterwards.read(key)).toBe(expectedText)
    afterwards.close()
  })
})

/* ========================================================================== */
/* THE PROPERTY                                                               */
/* ========================================================================== */

describe('M1 — memory survives every draw, not only the ones somebody thought of', () => {
  it('writes, closes, reopens and reads back byte for byte, for every generated owner and value', () => {
    const path = aFreshMemoryFile('property')
    const rng = seededRandom(PROPERTY_SEED)

    /* The last value written under each key, so the final sweep knows what it
     * should find even when two draws collide on one key -- which they can, and
     * a proof that assumed otherwise would fail on the generator rather than on
     * the store. */
    const expected = new Map<string, string>()
    let stored = 0
    let refused = 0

    for (let draw = 0; draw < DRAWS; draw += 1) {
      const owner = anOwner(rng)
      const value = aStorableValue(rng)

      const writer = openStore(path)
      let refusal: unknown
      try {
        memoryOver(writer).write(owner, value)
      } catch (thrown) {
        refusal = thrown
      }
      /* CLOSED EVERY DRAW. This is the reopen requirement applied four hundred
       * times: the writing connection is gone before anything reads. */
      writer.close()

      if (refusal !== undefined) {
        /* An owner whose parts trim to nothing cannot name a memory, so there is
         * no persistence question to ask about it. `key.ts` must refuse it --
         * and the refusal is asserted rather than skipped past, because a draw
         * silently dropped is a draw that stopped testing anything. */
        expect(
          refusal,
          `seed ${PROPERTY_SEED}, draw ${draw}: owner ${JSON.stringify(owner)} was refused, but not by key.ts`,
        ).toBeInstanceOf(BadMemoryKey)
        refused += 1
        continue
      }

      stored += 1
      const key = memoryKey(owner)
      const text = toStoredText(value)
      expected.set(key, text)

      const reader = openStore(path)
      const back = reader.read(key)
      reader.close()

      expect(
        back,
        `seed ${PROPERTY_SEED}, draw ${draw}: owner ${JSON.stringify(owner)} did not survive the reopen`,
      ).toBe(text)
    }

    /* The draws did both things they were supposed to do. Without these two the
     * loop above is satisfied by a generator that produced four hundred
     * unusable owners, or four hundred identical ones. */
    expect(stored).toBeGreaterThan(0)
    expect(refused).toBeGreaterThan(0)
    expect(expected.size).toBeGreaterThan(0)

    /* AND EVERY EARLIER DRAW IS STILL THERE. The per-draw check above proves a
     * record survives its own reopen; this proves it survived all the reopens
     * that came after it, which is what a term of schoolwork actually looks
     * like. */
    const finally_ = openStore(path)
    for (const [key, text] of expected) {
      expect(
        finally_.read(key),
        `seed ${PROPERTY_SEED}: a key written earlier in the run was lost by the end of it`,
      ).toBe(text)
    }

    /* THE PAIR, once, at the end: a key nothing ever drew must still be empty. */
    expect(finally_.read(memoryKey(AN_OWNER_NOBODY_WROTE))).toBeUndefined()
    finally_.close()
  })
})
