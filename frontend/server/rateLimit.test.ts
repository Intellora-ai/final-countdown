/* Tests for the request limiter.
 *
 * DESIRED OUTCOME
 *   A stranger cannot spend the project's model budget, and a classroom of real
 *   students sharing one school IP is not mistaken for that stranger.
 *
 * WHAT MUST BE TRUE
 *   1. Requests inside the limit pass; the one past it does not.
 *   2. THE WINDOW ACTUALLY ROLLS. A limiter that never forgets is an outage
 *      with extra steps — the first heavy minute would ban a school all day.
 *   3. KEYS ARE INDEPENDENT. One noisy address cannot exhaust another's budget.
 *   4. THE KEY TABLE IS BOUNDED. The map is keyed on an attacker-controlled
 *      value, so an unbounded one is the exact defect this codebase just closed
 *      in the ledger: unlimited growth from anonymous requests. A limiter that
 *      leaks memory is a denial of service wearing a safety vest.
 *   5. A GLOBAL CEILING EXISTS. Per-key alone cannot bound the bill, because
 *      the number of keys is not bounded by anything the server controls.
 *   6. TIME IS INJECTED. A limiter that reads the clock cannot be tested at a
 *      boundary, and the boundary is the whole behaviour.
 */

import { describe, expect, it } from 'vitest'

import { fixedWindow } from './rateLimit.ts'

describe('fixedWindow', () => {
  it('allows exactly the limit, then refuses', () => {
    const limiter = fixedWindow({ limit: 3, windowMs: 1000, globalLimit: 100 })
    expect(limiter.take('a', 0)).toBe(true)
    expect(limiter.take('a', 0)).toBe(true)
    expect(limiter.take('a', 0)).toBe(true)
    expect(limiter.take('a', 0)).toBe(false)
  })

  it('forgets once the window has rolled', () => {
    const limiter = fixedWindow({ limit: 2, windowMs: 1000, globalLimit: 100 })
    expect(limiter.take('a', 0)).toBe(true)
    expect(limiter.take('a', 999)).toBe(true)
    expect(limiter.take('a', 999)).toBe(false)
    /* One millisecond past the window, the budget is whole again. */
    expect(limiter.take('a', 1000)).toBe(true)
  })

  it('keeps one key from spending another key s budget', () => {
    const limiter = fixedWindow({ limit: 1, windowMs: 1000, globalLimit: 100 })
    expect(limiter.take('noisy', 0)).toBe(true)
    expect(limiter.take('noisy', 0)).toBe(false)
    expect(limiter.take('quiet', 0)).toBe(true)
  })

  it('bounds the key table rather than growing once per distinct caller', () => {
    const limiter = fixedWindow({ limit: 1, windowMs: 1000, globalLimit: 1_000_000, maxKeys: 50 })
    for (let i = 0; i < 5000; i += 1) limiter.take(`addr-${i}`, 0)
    expect(limiter.size()).toBeLessThanOrEqual(50)
  })

  it('cannot be escaped by flooding the table with fresh keys', () => {
    /* THE BYPASS THIS TEST WAS WRITTEN TO CATCH, AND WHAT ACTUALLY STOPS IT.
     *
     * The first version of this test asserted that a refused caller stays
     * refused after eviction. It does NOT, and the implementation was not at
     * fault: a bounded table keyed on a caller-controlled value can always be
     * flushed by inventing keys, so the throttled entry is evicted and the
     * caller returns with a full budget. That is inherent, not a bug to patch
     * -- pinning refused keys just moves the flood to a different victim.
     *
     * So the per-key limit is BEST EFFORT: it stops one impolite caller, not a
     * determined one. The GLOBAL ceiling is the guarantee, and it is the one
     * that protects the bill, because it counts requests rather than callers.
     * This asserts the guarantee that survives the attack. */
    const limiter = fixedWindow({ limit: 1, windowMs: 10_000, globalLimit: 20, maxKeys: 4 })

    let allowed = 0
    for (let i = 0; i < 500; i += 1) if (limiter.take(`flood-${i}`, i)) allowed += 1

    expect(allowed).toBe(20)
    expect(limiter.size()).toBeLessThanOrEqual(4)
    /* Every caller, invented or not, is refused once the ceiling is reached. */
    expect(limiter.take('brand-new', 600)).toBe(false)
  })

  it('refuses everyone once the global ceiling is reached, whatever the key', () => {
    const limiter = fixedWindow({ limit: 100, windowMs: 1000, globalLimit: 3 })
    expect(limiter.take('a', 0)).toBe(true)
    expect(limiter.take('b', 0)).toBe(true)
    expect(limiter.take('c', 0)).toBe(true)
    expect(limiter.take('d', 0)).toBe(false)
    /* A brand new key does not get past a ceiling that is already reached. */
    expect(limiter.take('never-seen', 0)).toBe(false)
  })

  it('rolls the global window too', () => {
    const limiter = fixedWindow({ limit: 100, windowMs: 1000, globalLimit: 2 })
    expect(limiter.take('a', 0)).toBe(true)
    expect(limiter.take('b', 0)).toBe(true)
    expect(limiter.take('c', 0)).toBe(false)
    expect(limiter.take('c', 1000)).toBe(true)
  })

  it('treats a classroom-sized burst from one address as legitimate at the shipped default', () => {
    /* THE NAT CASE, and the reason the default is not small. Thirty students in
     * one room reach this server from ONE public address. A limit tuned for a
     * single person would refuse most of a class, and the failure would look
     * like the product being broken at exactly the moment it was being used
     * properly. */
    const limiter = fixedWindow({ limit: 120, windowMs: 60_000, globalLimit: 10_000 })
    let allowed = 0
    for (let i = 0; i < 30 * 3; i += 1) if (limiter.take('school', i)) allowed += 1
    expect(allowed).toBe(90)
  })
})
