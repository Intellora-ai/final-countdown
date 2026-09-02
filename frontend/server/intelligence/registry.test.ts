import { describe, expect, it } from 'vitest'

import { capabilityRegistry, type Has } from './registry.ts'

/**
 * CAPABILITY CONTRACTS. Every capability the fabric can compose is described
 * the same way -- purpose, inputs, outputs, guarantees, cost, risk, side
 * effects, failure modes -- and says HONESTLY whether it is available on this
 * server. A contract that claims availability for a store that is not there
 * is a fake, and the tests iterate the registry itself so a contract added
 * tomorrow is held to the same bar the day it appears.
 */

const NOTHING: Has = { model: 'none', search: false, aliases: false, lessons: false, evidence: false, misconceptions: false, concepts: false, verifiedTopics: 0 }
const EVERYTHING: Has = { model: 'chat-and-decide', search: true, aliases: true, lessons: true, evidence: true, misconceptions: true, concepts: true, verifiedTopics: 3 }

describe('the capability registry', () => {
  it('describes every capability completely, in words a person can check', () => {
    const contracts = capabilityRegistry(EVERYTHING).list()
    expect(contracts.length).toBeGreaterThanOrEqual(10)
    for (const c of contracts) {
      for (const field of ['name', 'purpose', 'inputs', 'outputs'] as const) {
        expect(c[field].length, `${c.name}: ${field} is empty`).toBeGreaterThan(0)
      }
      expect(c.guarantees.length, `${c.name}: no guarantees`).toBeGreaterThan(0)
      expect(c.failureModes.length, `${c.name}: no failure modes named`).toBeGreaterThan(0)
      expect([0, 1, 2]).toContain(c.risk)
      expect(['none', 'writes memory', 'network', 'model']).toContain(c.sideEffects)
      expect(c.cost, `${c.name}: a cost was invented; costs are measured (M5)`).toBe('unknown')
    }
    expect(new Set(contracts.map((c) => c.name)).size, 'two contracts share a name').toBe(contracts.length)
  })

  it('with everything configured, every contract is available', () => {
    for (const c of capabilityRegistry(EVERYTHING).list()) {
      expect(c.available(), c.name).toEqual({ ok: true })
    }
  })

  it('with nothing configured, every contract that needs something says exactly what is missing', () => {
    const contracts = capabilityRegistry(NOTHING).list()
    const unavailable = contracts.filter((c) => !c.available().ok)
    expect(unavailable.length, 'a server with no model, no stores and no search still claimed every capability').toBeGreaterThan(0)
    for (const c of unavailable) {
      const why = c.available()
      if (why.ok) continue
      expect(why.because.length, c.name).toBeGreaterThan(0)
      /* The reason must name the thing that is missing, not just say "no". */
      expect(why.because, c.name).toMatch(/model|store|search|endpoint|knowledge|ollama|evidence|shelf|index|topic/i)
    }
    /* And the pure ones stay available: a contract with no side effects and no
       store cannot be missing anything. */
    for (const c of contracts.filter((cc) => cc.sideEffects === 'none' && !cc.needs.length)) {
      expect(c.available(), `${c.name} is pure and claimed to be unavailable`).toEqual({ ok: true })
    }
  })

  it('each need, taken away on its own, is named by exactly the contracts that need it', () => {
    for (const need of ['model', 'search', 'aliases', 'lessons', 'evidence', 'misconceptions', 'concepts', 'verifiedTopics'] as const) {
      const without: Has = { ...EVERYTHING, [need]: need === 'model' ? 'none' : need === 'verifiedTopics' ? 0 : false }
      for (const c of capabilityRegistry(without).list()) {
        const expectUnavailable = c.needs.includes(need)
        expect(c.available().ok, `${c.name} without ${need}`).toBe(!expectUnavailable)
      }
    }
  })
})
