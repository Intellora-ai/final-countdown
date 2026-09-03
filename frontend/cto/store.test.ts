import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { readStore, summarise } from './store.ts'

/**
 * THE STORE'S PROMISE: it never lies about what it holds.
 *
 * Two failure shapes, both taken from this repo's own history rather than
 * imagination. `src/knowledge/load.ts` reports a malformed file instead of
 * skipping it, because a knowledge layer that quietly drops what it cannot
 * read reports health it does not have. And `gate:knowledge` once printed
 * "0 file(s) ... PASS" against an empty directory, which is the failure that
 * is worse than a red one, because nobody investigates a pass.
 */

let scratch = ''
afterEach(() => { if (scratch !== '') { rmSync(scratch, { recursive: true, force: true }); scratch = '' } })

function aStore(files: Record<string, unknown>): string {
  scratch = mkdtempSync(join(tmpdir(), 'cto-store-'))
  for (const [name, contents] of Object.entries(files)) {
    const path = join(scratch, name)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2))
  }
  return scratch
}

function aNode(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'read-failure-is-not-empty',
    type: 'INVARIANT',
    system: 'memory',
    state: 'KNOWN',
    level: 'L3',
    statement: 'A read that failed is never the same value as a canvas that is empty.',
    evidence: [{ kind: 'experiment', experiment: 'canvas-durability-laws', measurement: '18 laws, LAW D red before the fix', at: '2026-09-03T00:00:00.000Z' }],
    status: 'active',
    links: [],
    ...over,
  }
}

describe('the store', () => {
  it('reads good nodes from anywhere in the tree', () => {
    const dir = aStore({
      'memory/a.json': aNode(),
      'knowledge/nested/b.json': aNode({ id: 'wal-durability', system: 'knowledge', level: 'L0', evidence: [{ kind: 'source', source: 'ddia', location: 'ch3', quote: 'the log is where durability happens', retrievedAt: '2026-09-03T00:00:00.000Z' }] }),
    })
    const store = readStore(dir)
    expect(store.nodes.map((n) => n.id).sort()).toEqual(['read-failure-is-not-empty', 'wal-durability'])
    expect(store.broken).toEqual([])
  })

  it('REPORTS a file it cannot read, naming the file and the reason, and never drops it in silence', () => {
    const dir = aStore({ 'good.json': aNode(), 'bad.json': '{ not json', 'wrong.json': aNode({ state: 'KNOWN', evidence: [] }) })
    const store = readStore(dir)
    expect(store.nodes.map((n) => n.id)).toEqual(['read-failure-is-not-empty'])
    expect(store.broken).toHaveLength(2)
    for (const fault of store.broken) {
      expect(fault.path, 'a fault with no file is a fault nobody can fix').not.toBe('')
      expect(fault.why.length, `${fault.path} was refused with no reason`).toBeGreaterThan(0)
    }
    expect(store.broken.map((f) => f.path).join(' ')).toMatch(/bad\.json/)
    expect(store.broken.map((f) => f.why).join(' ')).toMatch(/evidence/i)
  })

  it('names the file correctly however the store directory was written', () => {
    /* Found by using it: the real CLI resolves its store with a trailing
       slash, and a fault came back as `-lie.json` instead of `a-lie.json`.
       A fault that names the wrong file is worse than one that names none,
       because it sends you to look at something innocent. */
    const dir = aStore({ 'a-lie.json': '{ not json' })
    for (const given of [dir, `${dir}/`, `${dir}//`]) {
      const store = readStore(given)
      expect(store.faults.map((f) => f.path), `store opened as ${JSON.stringify(given)}`).toEqual(['a-lie.json'])
    }
  })

  it('reports one id claimed by two files, rather than letting the last one win in silence', () => {
    const dir = aStore({ 'one.json': aNode(), 'two.json': aNode() })
    const store = readStore(dir)
    expect(store.broken.map((f) => f.why).join(' ')).toMatch(/described twice|already/i)
  })

  it('an empty store is EMPTY, not healthy', () => {
    /* The failure that is worse than a red one: a gate that prints PASS
       against nothing and exits 0, so nobody investigates. */
    const store = readStore(aStore({}))
    expect(store.nodes).toEqual([])
    expect(summarise(store).empty, 'an empty store did not report itself as empty').toBe(true)
  })

  it('a store that does not exist at all says so, rather than reading as empty', () => {
    const store = readStore(join(tmpdir(), 'cto-store-that-was-never-created'))
    expect(store.missing, 'a missing store read as an empty one, which is the same lie one layer down').toBe(true)
  })

  it('counts by every dimension the schema declares, so a new value cannot go uncounted', () => {
    const dir = aStore({
      'a.json': aNode(),
      'b.json': aNode({ id: 'b-node', system: 'knowledge', state: 'HYPOTHESIS', level: 'L1', status: 'uncertain', evidence: [] }),
    })
    const seen = summarise(readStore(dir))
    expect(seen.total).toBe(2)
    expect(seen.bySystem['memory']).toBe(1)
    expect(seen.bySystem['knowledge']).toBe(1)
    expect(seen.byState['KNOWN']).toBe(1)
    expect(seen.byState['HYPOTHESIS']).toBe(1)
    expect(seen.byLevel['L3']).toBe(1)
    expect(seen.byStatus['uncertain']).toBe(1)
    /* Every declared value appears as a key even at zero: a dimension that
       vanishes when empty hides the fact that nothing is there. */
    expect(Object.keys(seen.byState).sort()).toEqual(['HYPOTHESIS', 'INFERRED', 'KNOWN', 'UNKNOWN'])
  })
})
