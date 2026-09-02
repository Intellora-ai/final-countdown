/* Tests for the file-backed ledger store.
 *
 * DESIRED OUTCOME
 *   A student's days and everything they have finished survive a restart, and
 *   are never silently lost.
 *
 * WHY A CORRUPT FILE THROWS INSTEAD OF STARTING FRESH
 *   Returning an empty ledger for an unreadable file would wipe a student's
 *   whole history and re-plan today as if they had never used the app — with
 *   nothing anywhere saying so. An ABSENT file is a new student; a BROKEN file
 *   is a problem, and the two must not look the same.
 *
 * WHY THE WRITE IS ATOMIC
 *   A process killed halfway through writing would leave truncated JSON, which
 *   by the rule above stops the server. Writing to a temporary file and
 *   renaming means the real file is only ever whole.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { fileStore } from './fileStore.ts'
import { createLedger } from './ledger.ts'

let dir: string
let path: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'almanac-'))
  path = join(dir, 'almanac.json')
})

describe('fileStore', () => {
  it('starts empty when the file has never been written', async () => {
    expect(await fileStore(path).load()).toEqual({ days: {}, done: {} })
  })

  it('round-trips what it saved', async () => {
    const store = fileStore(path)
    await store.save({ days: { s1: {} }, done: { s1: ['m1'] } })
    expect(await store.load()).toEqual({ days: { s1: {} }, done: { s1: ['m1'] } })
  })

  it('is readable by a second store over the same file', async () => {
    await fileStore(path).save({ days: {}, done: { s1: ['m1'] } })
    expect((await fileStore(path).load()).done['s1']).toEqual(['m1'])
  })

  it('refuses to start fresh when the file is corrupt', async () => {
    /* Silently returning empty here erases a student's entire history. */
    await writeFile(path, '{ this is not json', 'utf8')
    await expect(fileStore(path).load()).rejects.toThrow(/almanac/i)
  })

  it('names the file in the error, so it can be found', async () => {
    await writeFile(path, 'nonsense', 'utf8')
    await expect(fileStore(path).load()).rejects.toThrow(/almanac\.json/)
  })

  it('refuses a file whose shape is wrong, not just its syntax', async () => {
    await writeFile(path, '[1,2,3]', 'utf8')
    await expect(fileStore(path).load()).rejects.toThrow()
  })

  it('leaves no temporary file behind after a successful save', async () => {
    await fileStore(path).save({ days: {}, done: {} })
    const left = await readdir(dir)
    expect(left).toEqual(['almanac.json'])
  })

  it('writes JSON a person can read', async () => {
    await fileStore(path).save({ days: {}, done: { s1: ['m1'] } })
    expect(await readFile(path, 'utf8')).toContain('\n')
  })
})

describe('a ledger on a real file', () => {
  it('remembers a day across a restart', async () => {
    const subjects = [{
      id: 'maths',
      name: 'maths',
      chapters: [{ id: 'ch1', name: 'c', concepts: [{ id: 'm1', name: 'm1', minutes: 15, deps: [] }] }],
    }]
    const request = { studentId: 'stu_1', date: '2026-08-25', dailyMinutes: 120, subjects }

    const before = await createLedger(fileStore(path)).dayFor(request)
    const after = await createLedger(fileStore(path)).read('stu_1', '2026-08-25')

    expect(after?.items).toEqual(before.items)
  })

  it('remembers what was finished across a restart', async () => {
    await createLedger(fileStore(path)).markDone('stu_1', 'm1')
    expect(await createLedger(fileStore(path)).doneFor('stu_1')).toEqual(new Set(['m1']))
  })
})

describe('two servers on one ledger file: a day plan and a mark at the same moment', () => {
  /* THE RACE, MADE DETERMINISTIC.
   *
   * Replica A is planning a day: load, plan, save the whole file. Replica B
   * marks a concept done in between. With no lock around A's read-modify-write,
   * A's save writes the file it loaded BEFORE the mark existed, and the mark is
   * gone -- while B was told "saved".
   *
   * The interleaving is forced rather than hoped for: A's store is wrapped so
   * its `load` waits on a gate the test holds. While A is held after its load,
   * B runs a full `addDone` through a second store on the same file. Then the
   * gate opens and A saves. If the mark survives, A's whole span was under the
   * same lock B needs. */
  const subject = {
    id: 'maths',
    name: 'maths',
    chapters: [{
      id: 'maths-ch1',
      name: 'c',
      concepts: ['m1', 'm2', 'm3'].map((c) => ({ id: c, name: c, minutes: 15, deps: [] })),
    }],
  }
  const request = { studentId: 'stu_1', date: '2026-09-02', dailyMinutes: 60, subjects: [subject] }

  it('keeps the mark that landed while the day was being planned', async () => {
    const raw = fileStore(path)
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    let loaded!: () => void
    const loadedOnce = new Promise<void>((resolve) => { loaded = resolve })
    /* Replica A: the same store, with a load that pauses after reading. The
       `exclusively` lock and everything else pass straight through. */
    const slow = {
      ...raw,
      async load() {
        const data = await raw.load()
        loaded()
        await held
        return data
      },
    }
    const replicaA = createLedger(slow)
    const replicaB = fileStore(path)

    const planning = replicaA.dayFor(request)
    await loadedOnce

    /* Replica B marks while A is holding its loaded copy. This must either
       finish (no lock held by A: the old bug) or WAIT for A (the fix); the
       gate is released on a timer so a waiting B is never a hung test. */
    const marking = replicaB.addDone?.('stu_1', 'm1') ?? Promise.resolve()
    setTimeout(release, 50)

    await Promise.all([planning, marking])

    const after = await fileStore(path).load()
    expect(after.done['stu_1'], 'the mark written during the day plan was lost').toEqual(['m1'])
    expect(after.days['stu_1']?.['2026-09-02'], 'the day plan itself was lost').toBeDefined()
  })

  it('and the reverse: a day planned while a mark is being written survives too', async () => {
    const replicaA = createLedger(fileStore(path))
    const replicaB = fileStore(path)
    /* Twenty rounds, because this direction is not gated: the lock either
       serialises every interleaving or it does not. */
    for (let round = 0; round < 20; round += 1) {
      const date = `2026-10-${String(round + 1).padStart(2, '0')}`
      await Promise.all([
        replicaA.dayFor({ ...request, date }),
        replicaB.addDone?.('stu_1', `m${round}`),
      ])
    }
    const after = await fileStore(path).load()
    expect(after.done['stu_1']?.length, 'a mark was lost under a day plan').toBe(20)
    expect(Object.keys(after.days['stu_1'] ?? {}).length, 'a day plan was lost under a mark').toBe(20)
  })
})

describe('the very first write, on a machine that has never run this', () => {
  it('creates the directory instead of failing', async () => {
    /* THE DEFECT THIS PINS. The server starts, prints "listening", and then
     * returns 500 "internal error" to the FIRST student who opens their day --
     * because `data/` did not exist relative to the working directory, and
     * nothing created it. Reproduced against the real built server before this
     * was written.
     *
     * "Starts fine, dies on first use" is the worst shape of failure: it looks
     * healthy to everything that checks whether it is up. */
    const root = await mkdtemp(join(tmpdir(), 'almanac-first-'))
    const path = join(root, 'nested', 'deeper', 'ledger.json')

    const store = fileStore(path)
    await store.save({ days: { s: {} }, done: {} })

    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ days: { s: {} }, done: {} })
  })

  it('still reads back what it wrote through a directory it created', async () => {
    const root = await mkdtemp(join(tmpdir(), 'almanac-first-'))
    const path = join(root, 'made', 'ledger.json')
    const store = fileStore(path)

    await store.save({ days: {}, done: { s: ['c1'] } })
    expect(await fileStore(path).load()).toEqual({ days: {}, done: { s: ['c1'] } })
  })
})
