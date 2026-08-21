/* CS-3 / DOD-5 — one value, many representations.
 *
 * The test that matters is `every dependent receives the same committed value`.
 * It is written so it cannot pass vacuously: the number of representations is
 * read from the store's own subscriber count, so removing a subscriber would
 * reduce what the assertion checks AND fail the count check beside it.
 */

import { describe, it, expect, vi } from 'vitest'
import { VariableStore, type VariableRecord } from './variables'
import { OperationLog } from './operations'

const CH = 'matter-in-our-surroundings'
const CO = 'change-of-state'

function makeStore() {
  let tick = 1_000
  const log = new OperationLog({ now: () => (tick += 1) })
  const store = new VariableStore({ now: () => (tick += 1), emit: (op) => log.append(op) })
  store.declare({
    variableId: 'temperature',
    chapterId: CH,
    conceptId: CO,
    name: 'Temperature',
    symbol: 'T',
    value: 273,
    unit: ' K',
    min: 173,
    max: 573,
    step: 1,
    source: 'curriculum',
  })
  return { store, log }
}

describe('CS-3 VariableStore', () => {
  it('gives every dependent the same committed value in the same commit', () => {
    const { store } = makeStore()
    const seen: VariableRecord[][] = [[], [], [], []]
    for (const bucket of seen) store.subscribe((r) => bucket.push(r))

    expect(store.subscriberCount()).toBe(4)
    const result = store.set('temperature', 450, 'learner')
    expect(result.ok).toBe(true)

    // Every dependent was notified exactly once, with the identical value.
    for (const bucket of seen) {
      expect(bucket).toHaveLength(1)
      expect(bucket[0].value).toBe(450)
    }
    // And there is one record, not four: they all read the same object.
    const unique = new Set(seen.map((b) => b[0]))
    expect(unique.size).toBe(1)
    expect(store.get('temperature')!.value).toBe(450)
  })

  it('refuses out-of-range, wrong-type and off-step values without corrupting the scene', () => {
    const { store } = makeStore()
    for (const [bad, fragment] of [
      [900, 'above maximum'],
      [10, 'below minimum'],
      ['hot', 'received string'],
      [300.5, 'steps of 1'],
    ] as const) {
      const result = store.set('temperature', bad as never, 'learner')
      expect(result.ok, `${String(bad)} should have been refused`).toBe(false)
      expect(result.reason).toContain(fragment)
      // The refusal left the previous value intact — no clamping, no partial write.
      expect(store.get('temperature')!.value).toBe(273)
    }
  })

  it('records an operation for every accepted write and none for a refused or no-op one', () => {
    const { store, log } = makeStore()
    store.set('temperature', 300, 'learner')
    store.set('temperature', 300, 'learner') // no-op: same value
    store.set('temperature', 9_000, 'learner') // refused
    expect(log.list().filter((o) => o.type === 'set_parameter')).toHaveLength(1)
  })

  it('undoes to the previous value and notifies dependents the same way', () => {
    const { store } = makeStore()
    const seen: number[] = []
    store.subscribe((r) => seen.push(r.value as number))
    store.set('temperature', 350, 'learner')
    store.set('temperature', 400, 'learner')
    expect(store.undo().ok).toBe(true)
    expect(store.get('temperature')!.value).toBe(350)
    expect(store.undo().ok).toBe(true)
    expect(store.get('temperature')!.value).toBe(273)
    expect(store.undo().ok).toBe(false) // nothing left
    expect(seen).toEqual([350, 400, 350, 273])
  })

  it('resets to the declared value and forgets history so undo cannot walk past it', () => {
    const { store } = makeStore()
    store.set('temperature', 500, 'learner')
    store.reset()
    expect(store.get('temperature')!.value).toBe(273)
    expect(store.undo().ok).toBe(false)
  })

  it('replays recorded changes to the same final value without re-emitting them', () => {
    const { store, log } = makeStore()
    store.set('temperature', 320, 'learner')
    store.set('temperature', 450, 'learner')
    const changes = log.parameterChanges()
    const before = log.length

    store.reset()
    expect(store.get('temperature')!.value).toBe(273)

    store.replay(changes as never)
    expect(store.get('temperature')!.value).toBe(450)
    // Replay must not append: the operations it replays already exist.
    expect(log.length).toBe(before)
  })

  it('keeps notifying the remaining dependents when one of them throws', () => {
    const { store } = makeStore()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const good: number[] = []
    store.subscribe(() => {
      throw new Error('representation blew up')
    })
    store.subscribe((r) => good.push(r.value as number))
    store.set('temperature', 400, 'learner')
    // A half-updated board is exactly the disagreement this store prevents.
    expect(good).toEqual([400])
    expect(spy).toHaveBeenCalledOnce()
    spy.mockRestore()
  })

  it('does not reset a learner value when a representation re-declares the variable', () => {
    const { store } = makeStore()
    store.set('temperature', 400, 'learner')
    store.declare({
      variableId: 'temperature',
      chapterId: CH,
      conceptId: CO,
      name: 'Temperature',
      value: 273,
      source: 'curriculum',
    })
    expect(store.get('temperature')!.value).toBe(400)
  })
})
