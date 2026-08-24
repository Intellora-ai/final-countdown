/*
 * THE ACCEPTANCE CRITERIA FOR TEACHING CONTINUITY, AS EXECUTABLE TESTS.
 *
 * Written before `ledger.ts` existed. Every case here is one of the observed
 * current-state failures turned into a pass/fail criterion; the measurement
 * that motivated it is named in the test's own comment so a later reader can
 * tell a requirement from a preference.
 */
import { describe, expect, it } from 'vitest'
import {
  LEDGER_VERSION,
  advance,
  beginTurn,
  deserialize,
  established,
  interrupt,
  isComplete,
  mayClaim,
  openSession,
  record,
  resolveInterruption,
  serialize,
  type Ledger,
  type Position,
} from './ledger'

const T0 = '2026-01-01T00:00:00.000Z'
const at = (m: number) => new Date(Date.UTC(2026, 0, 1, 0, m)).toISOString()
const day = (d: number) => new Date(Date.UTC(2026, 0, 1 + d)).toISOString()

function session(): Ledger {
  return openSession({
    id: 's1',
    objective: 'derive the quadratic formula',
    conceptId: 'quad',
    at: T0,
  })
}

/* Deterministic randomness. `Math.random` would make a failure unreproducible,
   which is the one thing a property test must never be. */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

/* -------------------------------------------------------------------------- */
describe('the objective survives', () => {
  /* MEASURED: `conversation.topic` was the last utterance verbatim --- after
     "lets pause here" the system's idea of the topic WAS "lets pause here". A
     session objective that any turn can overwrite is not an objective. */
  it('is not changed by recording turns, interruptions, or advances', () => {
    let l = session()
    for (let i = 0; i < 50; i++) {
      l = record(l, { kind: 'asked', detail: `unrelated question ${i}`, at: at(i) })
      l = interrupt(l, { reason: `detour ${i}`, at: at(i) })
      l = resolveInterruption(l, at(i)).ledger
      l = advance(l, { conceptId: 'quad', phase: 'explaining', unfinished: [] }, at(i))
    }
    expect(l.objective).toBe('derive the quadratic formula')
  })

  it('has no setter: the type carries no way to reassign it', () => {
    const l = session()
    /* A readonly field is a compile-time promise; this asserts the runtime one
       so the guarantee survives a `as any` somewhere else in the codebase. */
    expect(Object.isFrozen(l)).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
describe('position: no loss of place', () => {
  it('a new session has an explicit position, not an inferred one', () => {
    const l = session()
    expect(l.position.conceptId).toBe('quad')
    expect(l.position.phase).toBe('introducing')
  })

  it('advancing moves the position and logs that it moved', () => {
    const l = advance(session(), { conceptId: 'quad', phase: 'checking', unfinished: ['discriminant'] }, at(1))
    expect(l.position.phase).toBe('checking')
    expect(l.log.some((e) => e.kind === 'advanced')).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
describe('interruption: returning is a data operation, not a guess', () => {
  /* MEASURED: no task was ever created for a teaching request, so there was no
     place to return to at all. "wait, what is a fraction" and "actually explain
     algebra instead" were indistinguishable to the loop --- both `topicShift`. */
  it('one interruption then one return lands on the exact prior position', () => {
    const start = advance(session(), { conceptId: 'quad', phase: 'checking', unfinished: ['discriminant'] }, at(1))
    const away = interrupt(start, { reason: 'what is a fraction', at: at(2) })
    expect(away.position.conceptId).toBe('quad')
    const back = resolveInterruption(away, at(3))
    expect(back.returned).toEqual(start.position)
    expect(back.ledger.position).toEqual(start.position)
  })

  it('N nested interruptions then N returns land on the original position', () => {
    const pick = rng(20260824)
    for (let trial = 0; trial < 200; trial++) {
      const depth = 1 + Math.floor(pick() * 12)
      const origin: Position = {
        conceptId: `c${Math.floor(pick() * 5)}`,
        phase: 'practising',
        unfinished: [`u${Math.floor(pick() * 3)}`],
      }
      let l = advance(session(), origin, at(1))
      for (let i = 0; i < depth; i++) {
        l = interrupt(l, { reason: `q${i}`, at: at(10 + i) })
        /* A detour is allowed to move the position; that is what makes the
           stack necessary rather than decorative. */
        l = advance(l, { conceptId: `detour${i}`, phase: 'explaining', unfinished: [] }, at(30 + i))
      }
      expect(l.interrupted.length).toBe(depth)
      for (let i = 0; i < depth; i++) l = resolveInterruption(l, at(60 + i)).ledger
      expect(l.interrupted.length).toBe(0)
      expect(l.position).toEqual(origin)
    }
  })

  it('returning with nothing to return to is refused, not invented', () => {
    /* The dangerous alternative is a silent no-op: the caller believes it
       restored a position and continues from whatever happened to be current. */
    const out = resolveInterruption(session(), at(1))
    expect(out.returned).toBeNull()
    expect(out.ledger.position).toEqual(session().position)
  })

  it('interruption depth is observable, so a caller can tell how deep it is', () => {
    let l = session()
    for (let i = 0; i < 4; i++) l = interrupt(l, { reason: `q${i}`, at: at(i) })
    expect(l.interrupted.length).toBe(4)
  })
})

/* -------------------------------------------------------------------------- */
describe('idempotency: a retry is not a second turn', () => {
  /* MEASURED: the same `Turn` object applied twice took `turnIndex` 1 -> 2 and
     `recentGoals` to 2. A network retry therefore double-counted. */
  it('the same turn id twice leaves the ledger identical', () => {
    const first = beginTurn(session(), 'turn-1')
    expect(first.alreadySeen).toBe(false)
    const withWork = record(first.ledger, { kind: 'shown', detail: 'the formula', at: at(1) })
    const second = beginTurn(withWork, 'turn-1')
    expect(second.alreadySeen).toBe(true)
    expect(second.ledger).toBe(withWork)
  })

  it('different turn ids both advance', () => {
    const a = beginTurn(session(), 'turn-1')
    const b = beginTurn(a.ledger, 'turn-2')
    expect(b.alreadySeen).toBe(false)
    expect(b.ledger.turns.length).toBe(2)
  })

  it('the seen-turn list does not grow without bound', () => {
    let l = session()
    for (let i = 0; i < 5000; i++) l = beginTurn(l, `t${i}`).ledger
    expect(l.turns.length).toBeLessThanOrEqual(512)
    /* And the most recent must still be recognised, or dedup is useless. */
    expect(beginTurn(l, 't4999').alreadySeen).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
describe('the log is append-only', () => {
  it('no operation shortens or rewrites it, over random operation sequences', () => {
    const pick = rng(7)
    for (let trial = 0; trial < 300; trial++) {
      let l = session()
      let prior = l.log
      for (let step = 0; step < 40; step++) {
        const before = l.log
        const op = Math.floor(pick() * 6)
        if (op === 0) l = record(l, { kind: 'shown', detail: 's', at: at(step) })
        else if (op === 1) l = record(l, { kind: 'attempted', detail: 'a', at: at(step), conceptId: 'quad', correct: pick() > 0.5, difficulty: 3 })
        else if (op === 2) l = interrupt(l, { reason: 'r', at: at(step) })
        else if (op === 3) l = resolveInterruption(l, at(step)).ledger
        else if (op === 4) l = advance(l, { conceptId: 'quad', phase: 'explaining', unfinished: [] }, at(step))
        else l = beginTurn(l, `t${step}`).ledger

        expect(l.log.length).toBeGreaterThanOrEqual(before.length)
        /* Every entry that existed still exists, unchanged and in place. */
        for (let i = 0; i < before.length; i++) expect(l.log[i]).toEqual(before[i])
        prior = l.log
      }
      expect(prior.length).toBeGreaterThan(0)
    }
  })
})

/* -------------------------------------------------------------------------- */
describe('no hallucinated memory', () => {
  /* MEASURED: "you taught me quadratics last week, continue from there" was
     answered with 0 claims, `unmet` empty, and nothing anywhere marking that no
     such history existed. */
  it('a concept with no events is established at nothing', () => {
    expect(established(session(), 'frac')).toBe('unknown')
  })

  it('being shown something establishes exposure and never more', () => {
    const l = record(session(), { kind: 'shown', detail: 'fractions', at: T0, conceptId: 'frac' })
    expect(established(l, 'frac')).toBe('exposed')
  })

  it('mastery is refused unless logged attempts support it', () => {
    const shown = record(session(), { kind: 'shown', detail: 'x', at: T0, conceptId: 'frac' })
    expect(mayClaim(shown, { conceptId: 'frac', mastery: 'exposed' })).toBe(true)
    expect(mayClaim(shown, { conceptId: 'frac', mastery: 'competent' })).toBe(false)
    expect(mayClaim(shown, { conceptId: 'frac', mastery: 'mastered' })).toBe(false)
  })

  it('a claim about a concept never mentioned is always refused', () => {
    const l = session()
    for (const m of ['exposed', 'partial', 'competent', 'mastered'] as const) {
      expect(mayClaim(l, { conceptId: 'never-seen', mastery: m })).toBe(false)
    }
  })

  it('correct attempts across days can reach mastery; one sitting cannot', () => {
    const three = (times: readonly string[]) =>
      times.reduce<Ledger>(
        (l, t) => record(l, { kind: 'attempted', detail: 'q', at: t, conceptId: 'frac', correct: true, difficulty: 3 }),
        session(),
      )
    expect(established(three([at(1), at(2), at(3)]), 'frac')).toBe('competent')
    expect(established(three([day(0), day(2), day(4)]), 'frac')).toBe('mastered')
  })

  it('a wrong attempt cannot be claimed away', () => {
    let l = record(session(), { kind: 'attempted', detail: 'q', at: at(1), conceptId: 'frac', correct: true, difficulty: 3 })
    l = record(l, { kind: 'attempted', detail: 'q', at: at(2), conceptId: 'frac', correct: false, difficulty: 3 })
    expect(mayClaim(l, { conceptId: 'frac', mastery: 'competent' })).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
describe('resume: the whole session comes back, or the read is refused', () => {
  /* MEASURED: `Agent.restore()` put back only the task. A fresh agent restored
     from a real blob reported turn 0, 0 entities, 0 attempts, 0 recentGoals. */
  it('serialize then deserialize is identity, over random ledgers', () => {
    const pick = rng(99)
    for (let trial = 0; trial < 200; trial++) {
      let l = session()
      for (let step = 0; step < 25; step++) {
        const op = Math.floor(pick() * 5)
        if (op === 0) l = record(l, { kind: 'shown', detail: `d${step}`, at: at(step), conceptId: 'quad' })
        else if (op === 1) l = record(l, { kind: 'attempted', detail: 'q', at: at(step), conceptId: 'frac', correct: pick() > 0.4, difficulty: 1 + Math.floor(pick() * 5) })
        else if (op === 2) l = interrupt(l, { reason: `r${step}`, at: at(step) })
        else if (op === 3) l = advance(l, { conceptId: `c${step % 3}`, phase: 'practising', unfinished: [`u${step}`] }, at(step))
        else l = beginTurn(l, `t${step}`).ledger
      }
      const round = deserialize(serialize(l))
      expect(round.ok).toBe(true)
      if (round.ok) expect(round.ledger).toEqual(l)
    }
  })

  it('garbage is refused with a reason, never thrown and never guessed', () => {
    for (const bad of ['', '{', 'null', '[]', '{"version":1}', '"a string"', '{"objective":"x"}']) {
      const out = deserialize(bad)
      expect(out.ok).toBe(false)
      if (!out.ok) expect(out.why.length).toBeGreaterThan(0)
    }
  })

  it('a ledger from a newer version is refused rather than misread', () => {
    const forward = JSON.parse(serialize(session())) as Record<string, unknown>
    forward.version = LEDGER_VERSION + 1
    const out = deserialize(JSON.stringify(forward))
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.why).toContain('version')
  })

  it('a resumed ledger continues from the same position and keeps its evidence', () => {
    let l = advance(session(), { conceptId: 'quad', phase: 'checking', unfinished: ['discriminant'] }, at(1))
    l = record(l, { kind: 'attempted', detail: 'q', at: at(2), conceptId: 'quad', correct: true, difficulty: 3 })
    l = interrupt(l, { reason: 'what is a fraction', at: at(3) })
    const out = deserialize(serialize(l))
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.ledger.position).toEqual(l.position)
    expect(out.ledger.interrupted.length).toBe(1)
    expect(established(out.ledger, 'quad')).toBe('partial')
    /* And the interruption is still resolvable after the round trip, which is
       the whole point: the stack is data, not a closure. */
    expect(resolveInterruption(out.ledger, at(4)).returned).toEqual(l.interrupted[0]?.position)
  })
})

/* -------------------------------------------------------------------------- */
describe('completion is explicit, never inferred', () => {
  /* The brief: "A response ending and a lesson ending are different events." */
  it('a session with unfinished work is not complete', () => {
    const l = advance(session(), { conceptId: 'quad', phase: 'checking', unfinished: ['discriminant'] }, at(1))
    expect(isComplete(l)).toBe(false)
  })

  it('a session is not complete merely because nothing is left to do', () => {
    const l = advance(session(), { conceptId: 'quad', phase: 'practising', unfinished: [] }, at(1))
    expect(isComplete(l)).toBe(false)
  })

  it('completion requires the phase to say so AND nothing unfinished', () => {
    const done = advance(session(), { conceptId: 'quad', phase: 'done', unfinished: [] }, at(1))
    expect(isComplete(done)).toBe(true)
    const claimed = advance(session(), { conceptId: 'quad', phase: 'done', unfinished: ['discriminant'] }, at(1))
    expect(isComplete(claimed)).toBe(false)
  })

  it('an open interruption keeps the session incomplete even at phase done', () => {
    let l = advance(session(), { conceptId: 'quad', phase: 'done', unfinished: [] }, at(1))
    l = interrupt(l, { reason: 'one more thing', at: at(2) })
    expect(isComplete(l)).toBe(false)
  })
})
