/*
 * TEACHING CONTINUITY, THROUGH THE REAL AGENT.
 *
 * `ledger.test.ts` proves the data structure. This proves the WIRING, which is
 * the part that was missing before: an 11,117-line agent layer with a full
 * pause/resume vocabulary, and a `restore()` that put back only the task.
 *
 * Every case names the measurement that motivated it.
 */
import { describe, expect, it } from 'vitest'
import { createAgent, textTurn, type Agent } from '../index'
import type { GenerateRequest } from '../kernel/loop'
import type { Concept } from '../learn/learn'
import { established, isComplete } from './ledger'

const CONCEPTS: readonly Concept[] = [
  { id: 'arith', label: 'arithmetic', requires: [] },
  { id: 'frac', label: 'fractions', requires: ['arith'] },
  { id: 'algebra', label: 'algebra', requires: ['frac'] },
  { id: 'quad', label: 'quadratics', requires: ['algebra'] },
]

const model = { async generate(r: GenerateRequest): Promise<string> { return `A(${r.capabilities.length})` } }

let tick = 0
const clock = (): string => new Date(Date.UTC(2026, 0, 1, 0, tick++)).toISOString()

function agentWith(): Agent {
  return createAgent({ model, curriculum: CONCEPTS, now: clock })
}

function teaching(): Agent {
  const a = agentWith()
  a.teach({ objective: 'derive the quadratic formula', conceptId: 'quad' })
  return a
}

/* -------------------------------------------------------------------------- */
describe('the whole session survives suspend and restore', () => {
  /* MEASURED: restoring a real blob into a fresh agent reported turn 0, 0
     entities, 0 attempts, 0 recentGoals. Only the task came back, and there
     usually was no task. */
  it('carries the conversation, not only the task', async () => {
    const a = teaching()
    await a.ask(textTurn('teach me quadratics', clock()))
    await a.ask(textTurn('what is a discriminant', clock()))
    await a.ask(textTurn('and how do I factor them', clock()))
    const before = a.session()
    expect(before.conversation.turnIndex).toBe(3)

    const blob = a.suspend()
    expect(typeof blob).toBe('string')

    const tomorrow = agentWith()
    tomorrow.restore(blob as string)
    const after = tomorrow.session()

    expect(after.conversation.turnIndex).toBe(before.conversation.turnIndex)
    expect(after.conversation.entities.length).toBe(before.conversation.entities.length)
    expect(after.recentGoals).toEqual(before.recentGoals)
    expect(after.attempts).toEqual(before.attempts)
    expect(after.ledger?.objective).toBe('derive the quadratic formula')
  })

  it('still returns null when genuinely nothing has happened', () => {
    /* The pre-existing contract, kept deliberately. What changes is the
       MEANING of "nothing": it used to mean "no task", which threw away a
       fourteen-turn conversation. It now means "this session is
       indistinguishable from a new one". */
    expect(agentWith().suspend()).toBeNull()
  })

  it('refuses a corrupt blob and leaves the live session untouched', async () => {
    const a = teaching()
    await a.ask(textTurn('teach me quadratics', clock()))
    const before = a.session()
    for (const bad of ['', '{', 'null', '[]', '{"version":999}', '"nope"']) {
      const out = a.restore(bad)
      expect(out.ok).toBe(false)
      expect(a.session().conversation.turnIndex).toBe(before.conversation.turnIndex)
      expect(a.session().ledger?.objective).toBe('derive the quadratic formula')
    }
  })

  it('refuses a session envelope written by a different build', async () => {
    /* FOUND BY MUTATION TESTING, not by design. Deleting the envelope's version
       check left every test green: the corrupt-blob case above uses
       `{"version":999}`, which is the LEDGER's field name, so that blob was
       being refused for having no `conversation` rather than for its version.
       The suite was testing the ledger's version gate twice and the session
       envelope's not at all.

       It matters because the envelope is the outer shape --- a build that adds
       a field to `Session` and bumps `SESSION_VERSION` must not silently read
       yesterday's blob as if the field had always been absent. */
    const a = teaching()
    await a.ask(textTurn('teach me quadratics', clock()))
    const whole = JSON.parse(a.suspend() as string) as Record<string, unknown>

    for (const v of [0, 2, 99, '1', null, undefined]) {
      const fresh = agentWith()
      fresh.teach({ objective: 'untouched', conceptId: 'arith' })
      const out = fresh.restore(JSON.stringify({ ...whole, v }))
      expect(out.ok, `envelope version ${String(v)}`).toBe(false)
      expect(fresh.ledger()?.objective).toBe('untouched')
    }

    /* And the matching version is still accepted, or the check is just a wall. */
    const good = agentWith()
    expect(good.restore(JSON.stringify(whole)).ok).toBe(true)
  })

  it('a restored agent continues from the same teaching position', async () => {
    const a = teaching()
    await a.ask(textTurn('teach me quadratics', clock()))
    a.advanceTeaching({ conceptId: 'quad', phase: 'checking', unfinished: ['discriminant'] })
    const blob = a.suspend() as string

    const tomorrow = agentWith()
    tomorrow.restore(blob)
    expect(tomorrow.ledger()?.position).toEqual({
      conceptId: 'quad', phase: 'checking', unfinished: ['discriminant'],
    })
    expect(isComplete(tomorrow.ledger()!)).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
describe('a retry is not a second turn', () => {
  /* MEASURED: the identical `Turn` object applied twice took turnIndex 1 -> 2
     and appended the goal twice. */
  it('the same turn twice advances once', async () => {
    const a = teaching()
    const t = textTurn('teach me quadratics', '2026-01-01T00:00:00.000Z')
    const first = await a.ask(t)
    const second = await a.ask(t)
    expect(first.session.conversation.turnIndex).toBe(1)
    expect(second.session.conversation.turnIndex).toBe(1)
    expect(second.replayed).toBe(true)
    expect(a.session().recentGoals.length).toBe(1)
  })

  it('the same words at a different time are a genuine second turn', async () => {
    const a = teaching()
    await a.ask(textTurn('explain the discriminant', clock()))
    const second = await a.ask(textTurn('explain the discriminant', clock()))
    expect(second.replayed).toBe(false)
    expect(second.session.conversation.turnIndex).toBe(2)
  })

  it('a replayed turn returns the same answer it returned the first time', async () => {
    const a = teaching()
    const t = textTurn('teach me quadratics', '2026-01-01T00:00:00.000Z')
    const first = await a.ask(t)
    const second = await a.ask(t)
    expect(second.result.answer).toBe(first.result.answer)
  })
})

/* -------------------------------------------------------------------------- */
describe('interruption and return, through the loop', () => {
  /* MEASURED: "wait, what is a fraction" and "actually explain algebra
     instead" were indistinguishable --- both merely `topicShift`, with nothing
     recording that the first was a detour to come back from. */
  it('a change of subject pushes the teaching position onto the stack', async () => {
    const a = teaching()
    await a.ask(textTurn('teach me quadratics', clock()))
    a.advanceTeaching({ conceptId: 'quad', phase: 'checking', unfinished: ['discriminant'] })
    await a.ask(textTurn('wait, what is a fraction', clock()))
    expect(a.ledger()?.interrupted.length).toBe(1)
    expect(a.ledger()?.interrupted[0]?.position.conceptId).toBe('quad')
  })

  it('asking to continue pops it and restores the exact position', async () => {
    const a = teaching()
    await a.ask(textTurn('teach me quadratics', clock()))
    a.advanceTeaching({ conceptId: 'quad', phase: 'checking', unfinished: ['discriminant'] })
    await a.ask(textTurn('wait, what is a fraction', clock()))
    await a.ask(textTurn('ok continue', clock()))
    expect(a.ledger()?.interrupted.length).toBe(0)
    expect(a.ledger()?.position).toEqual({
      conceptId: 'quad', phase: 'checking', unfinished: ['discriminant'],
    })
  })

  it('nested detours unwind in order, over many depths', async () => {
    for (const depth of [1, 2, 3, 5, 8]) {
      const a = teaching()
      await a.ask(textTurn('teach me quadratics', clock()))
      a.advanceTeaching({ conceptId: 'quad', phase: 'practising', unfinished: ['roots'] })
      const origin = a.ledger()?.position

      const detours = ['what is a fraction', 'who invented algebra', 'what is a coefficient',
        'define a polynomial', 'what is a radical', 'explain exponents',
        'what is a variable', 'define an equation']
      for (let i = 0; i < depth; i++) {
        await a.ask(textTurn(detours[i] ?? 'what is a fraction', clock()))
      }
      expect(a.ledger()?.interrupted.length).toBe(depth)

      for (let i = 0; i < depth; i++) await a.ask(textTurn('continue', clock()))
      expect(a.ledger()?.interrupted.length).toBe(0)
      expect(a.ledger()?.position).toEqual(origin)
    }
  })

  it('continuing with nothing to return to does not invent a position', async () => {
    const a = teaching()
    await a.ask(textTurn('teach me quadratics', clock()))
    const before = a.ledger()?.position
    await a.ask(textTurn('continue', clock()))
    await a.ask(textTurn('continue', clock()))
    expect(a.ledger()?.position).toEqual(before)
    expect(a.ledger()?.interrupted.length).toBe(0)
  })

  it('the stack survives a suspend in the middle of a detour', async () => {
    const a = teaching()
    await a.ask(textTurn('teach me quadratics', clock()))
    a.advanceTeaching({ conceptId: 'quad', phase: 'checking', unfinished: ['discriminant'] })
    await a.ask(textTurn('wait, what is a fraction', clock()))
    const blob = a.suspend() as string

    const tomorrow = agentWith()
    tomorrow.restore(blob)
    expect(tomorrow.ledger()?.interrupted.length).toBe(1)
    await tomorrow.ask(textTurn('ok continue', clock()))
    expect(tomorrow.ledger()?.position.conceptId).toBe('quad')
    expect(tomorrow.ledger()?.position.phase).toBe('checking')
  })
})

/* -------------------------------------------------------------------------- */
describe('the objective does not drift', () => {
  it('survives a hundred turns of detours and returns', async () => {
    const a = teaching()
    for (let i = 0; i < 100; i++) {
      await a.ask(textTurn(i % 2 === 0 ? `what is topic ${i}` : 'continue', clock()))
    }
    expect(a.ledger()?.objective).toBe('derive the quadratic formula')
  })
})

/* -------------------------------------------------------------------------- */
describe('history is evidence, not assumption', () => {
  /* MEASURED: "you taught me quadratics last week, continue from there" was
     answered with 0 claims and an empty `unmet`. */
  it('a fresh session establishes nothing about any concept', () => {
    const a = teaching()
    for (const id of ['quad', 'frac', 'algebra', 'never-heard-of-it']) {
      expect(established(a.ledger()!, id)).toBe('unknown')
    }
  })

  it('a recorded attempt is the only thing that raises it', async () => {
    const a = teaching()
    await a.ask(textTurn('teach me quadratics', clock()))
    expect(established(a.ledger()!, 'quad')).toBe('unknown')
    a.recordAttempt({ conceptId: 'quad', correct: true, difficulty: 3, at: clock() })
    expect(established(a.ledger()!, 'quad')).toBe('partial')
  })

  it('attempts survive the round trip, so tomorrow knows what today proved', async () => {
    const a = teaching()
    a.recordAttempt({ conceptId: 'quad', correct: true, difficulty: 3, at: clock() })
    a.recordAttempt({ conceptId: 'quad', correct: true, difficulty: 3, at: clock() })
    const tomorrow = agentWith()
    tomorrow.restore(a.suspend() as string)
    expect(established(tomorrow.ledger()!, 'quad')).toBe('competent')
  })
})

/* -------------------------------------------------------------------------- */
describe('a session without a ledger behaves exactly as before', () => {
  /* The opt-in guarantee. Every one of the 2028 existing tests runs without
     calling `teach()`, so none of the above may change their behaviour. */
  it('no ledger means no interruption bookkeeping and no crash', async () => {
    const a = agentWith()
    const r = await a.ask(textTurn('teach me quadratics', clock()))
    expect(a.ledger()).toBeNull()
    await a.ask(textTurn('wait, what is a fraction', clock()))
    await a.ask(textTurn('continue', clock()))
    expect(a.ledger()).toBeNull()
    expect(r.session.conversation.turnIndex).toBe(1)
  })
})
