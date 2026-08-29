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
