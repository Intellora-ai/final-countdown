import { describe, expect, it } from 'vitest'

import { KnowledgeNode, LEVELS, STATES, SYSTEMS, TYPES } from './node.ts'

/**
 * THE SPINE'S ONE JOB: make the lies structurally impossible.
 *
 * This schema is the single shape every source compiles into — a book, a
 * repository, our own code, a past incident, a benchmark. If it can be filled
 * in dishonestly, everything above it inherits the dishonesty, so the tests
 * here are written as LIES SOMEBODY WOULD ACTUALLY TELL rather than as field
 * checks.
 *
 * They iterate the schema's own enums wherever they can, so a type or state
 * added tomorrow is covered the day it appears rather than the day someone
 * remembers this file.
 */

/** The smallest node that is honest: a source fact, known, with its source. */
function anHonestNode(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'wal-protects-crash-recovery',
    type: 'PRINCIPLE',
    system: 'knowledge',
    state: 'KNOWN',
    level: 'L0',
    statement: 'A write-ahead log lets a database recover a consistent state after a crash.',
    body: { problem: 'A crash between two writes can leave the store half-updated.' },
    evidence: [
      { kind: 'source', source: 'designing-data-intensive-applications', location: 'ch3', quote: 'the log is the primary place where durability happens', retrievedAt: '2026-09-03T00:00:00.000Z' },
    ],
    status: 'active',
    links: [],
    ...over,
  }
}

describe('every node is honest by construction', () => {
  it('accepts a plain, honest node', () => {
    const read = KnowledgeNode.safeParse(anHonestNode())
    expect(read.success, JSON.stringify(read.success ? {} : read.error.issues)).toBe(true)
  })

  it('LIE 1 — "we know this" with nothing behind it', () => {
    /* The rule the whole plan turns on: UNKNOWN must never silently become
       KNOWN. A node asserting KNOWN with no evidence is that lie, written
       down. The same applies to INFERRED, which must at least say what it was
       inferred from. */
    for (const state of ['KNOWN', 'INFERRED']) {
      const claim = KnowledgeNode.safeParse(anHonestNode({ state, evidence: [] }))
      expect(claim.success, `${state} with no evidence was accepted`).toBe(false)
    }
    /* And the honest halves of the same coin ARE allowed to stand alone: not
       knowing something is a real thing to record, not an error. */
    for (const state of ['UNKNOWN', 'HYPOTHESIS']) {
      const gap = KnowledgeNode.safeParse(anHonestNode({ state, evidence: [] }))
      expect(gap.success, `${state} with no evidence was refused, so "I don't know" has nowhere to live`).toBe(true)
    }
  })

  it('LIE 2 — "we measured it" with no measurement', () => {
    /* L3 is the only level a book cannot produce; it means the laboratory ran
       something. A node claiming L3 whose evidence is a quotation from a book
       is the most valuable lie in the system, because L3 outranks everything
       else at retrieval time. */
    const quoted = KnowledgeNode.safeParse(anHonestNode({ level: 'L3' }))
    expect(quoted.success, 'an L3 claim backed only by a quotation was accepted').toBe(false)

    const measured = KnowledgeNode.safeParse(anHonestNode({
      level: 'L3',
      evidence: [{ kind: 'experiment', experiment: 'bench-184', measurement: 'p99 fell 63% at 10M rows', at: '2026-09-03T00:00:00.000Z' }],
    }))
    expect(measured.success, JSON.stringify(measured.success ? {} : measured.error.issues)).toBe(true)
  })

  it('LIE 3 — "this replaced something" without saying what', () => {
    const orphan = KnowledgeNode.safeParse(anHonestNode({ status: 'superseded' }))
    expect(orphan.success, 'a superseded node named no successor, so the history is lost').toBe(false)

    const honest = KnowledgeNode.safeParse(anHonestNode({
      status: 'superseded',
      links: [{ relation: 'supersededBy', to: 'wal-plus-checkpointing' }],
    }))
    expect(honest.success).toBe(true)
  })

  it('LIE 4 — "this is distinct" from neighbours nobody listed', () => {
    /* The 11% failure this repo measured: a node with a perfect quotation
       attached to the wrong concept. A distinctiveness score claimed without
       naming what it was scored against is that failure wearing a number. */
    const unearned = KnowledgeNode.safeParse(anHonestNode({ distinct: 0.97 }))
    expect(unearned.success, 'a distinctiveness score was accepted with no neighbours to be distinct from').toBe(false)

    const earned = KnowledgeNode.safeParse(anHonestNode({ distinct: 0.97, neighbours: ['redo-log', 'shadow-paging'] }))
    expect(earned.success).toBe(true)
  })

  it('LIE 5 — "we worked it out" without saying from what', () => {
    /* INFERRED is the state that most easily launders a guess into knowledge:
       it sounds derived. So it has to name what it was derived from, or the
       chain back to evidence is broken and nothing can be audited. */
    const floating = KnowledgeNode.safeParse(anHonestNode({ state: 'INFERRED' }))
    expect(floating.success, 'an INFERRED node was accepted without saying what it came from').toBe(false)

    const traceable = KnowledgeNode.safeParse(anHonestNode({
      state: 'INFERRED',
      links: [{ relation: 'derived_from', to: 'wal-protects-crash-recovery' }],
    }))
    expect(traceable.success).toBe(true)
  })

  it('LIE 6 — padding empty fields to look complete', () => {
    /* A short node is better than one that fills every field to look thorough.
       Every optional field, if present, has to carry something. */
    const padded = KnowledgeNode.safeParse(anHonestNode({ body: { problem: 'A real problem.', whenNotToUse: '   ' } }))
    expect(padded.success, 'a body field padded with whitespace was accepted').toBe(false)
  })
})

describe('the vocabulary is fixed, and every value in it works', () => {
  it('accepts every declared type, system, state and level, and nothing else', () => {
    for (const type of TYPES) {
      expect(KnowledgeNode.safeParse(anHonestNode({ type })).success, type).toBe(true)
    }
    for (const system of SYSTEMS) {
      expect(KnowledgeNode.safeParse(anHonestNode({ system })).success, system).toBe(true)
    }
    for (const state of STATES) {
      /* Each state gets what it legitimately requires -- INFERRED must also
         say what it was inferred from. Supplying it here is the point: every
         declared state must be USABLE, not merely spellable. */
      const needed = state === 'INFERRED' ? { links: [{ relation: 'derived_from', to: 'wal-protects-crash-recovery' }] } : {}
      expect(KnowledgeNode.safeParse(anHonestNode({ state, ...needed })).success, state).toBe(true)
    }
    for (const level of LEVELS) {
      const evidence = level === 'L3'
        ? [{ kind: 'experiment', experiment: 'b1', measurement: 'x', at: '2026-09-03T00:00:00.000Z' }]
        : undefined
      expect(KnowledgeNode.safeParse(anHonestNode({ level, ...(evidence ? { evidence } : {}) })).success, level).toBe(true)
    }
    for (const field of ['type', 'system', 'state', 'level', 'status']) {
      expect(KnowledgeNode.safeParse(anHonestNode({ [field]: 'something-invented' })).success, field).toBe(false)
    }
  })

  it('refuses a field nobody declared, so the shape cannot drift quietly', () => {
    expect(KnowledgeNode.safeParse(anHonestNode({ importance: 'high' })).success).toBe(false)
  })

  it('requires a statement that says something', () => {
    for (const statement of ['', '   ', 'x']) {
      expect(KnowledgeNode.safeParse(anHonestNode({ statement })).success, JSON.stringify(statement)).toBe(false)
    }
  })
})
