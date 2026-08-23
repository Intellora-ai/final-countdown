import { describe, expect, it } from 'vitest'

import type { MemoryRecord, Understanding } from '../kernel/contracts'
import { understand } from '../understand/understand'
import {
  absorb,
  conflicts,
  createStore,
  decayed,
  EMPTY_WORKING,
  inMemoryPersistence,
  note,
  openStep,
  closeStep,
  relevance,
  worthRemembering,
  type Store,
} from './memory'

const T0 = '2026-01-01T00:00:00.000Z'
const plus = (days: number) => new Date(Date.parse(T0) + days * 86_400_000).toISOString()

function ask(text: string): Understanding {
  return understand({ parts: [{ modality: 'text', content: text }], at: T0 })
}

function store(at: () => string = () => T0): Store {
  return createStore(inMemoryPersistence(), at)
}

async function put(s: Store, content: string, kind: MemoryRecord['kind'] = 'preference') {
  return s.capture({ kind, content, strength: 0.7, supersedes: [], source: 'user-stated' })
}

describe('working memory tracks the current interaction', () => {
  it('adopts the objective from the first turn and keeps it', () => {
    const w = absorb(EMPTY_WORKING, ask('Plan my JEE revision'))
    expect(w.objective).toContain('JEE')
    const later = absorb(w, ask('Also include chemistry'))
    expect(later.objective).toContain('JEE')
  })

  it('accumulates constraints across turns', () => {
    let w = absorb(EMPTY_WORKING, ask('Explain inflation in 3 sentences'))
    w = absorb(w, ask('And do it without jargon'))
    expect(w.constraints.join(' ')).toContain('3 sentences')
    expect(w.constraints.join(' ')).toContain('without')
  })

  it('clears assumptions on a topic change', () => {
    /* An assumption carried into an unrelated question is worse than none. */
    let w = absorb(EMPTY_WORKING, ask('What is inflation?'))
    w = { ...w, assumptions: ['user means Indian CPI'] }
    const shifted = absorb(w, {
      ...ask('Who won the 1998 World Cup?'),
      topicShift: true,
    })
    expect(shifted.assumptions).toEqual([])
  })

  it('NEVER drops corrections, even across a topic change', () => {
    /* Repeating a mistake after being corrected is the most damaging thing
       this system can do, and it would also generate its own frustration
       signal --- the user re-asking is what UserState.repeats counts. */
    let w = absorb(EMPTY_WORKING, ask("No, that's wrong, I meant nominal not real"))
    expect(w.corrections).toHaveLength(1)
    w = absorb(w, { ...ask('Who won the 1998 World Cup?'), topicShift: true })
    expect(w.corrections).toHaveLength(1)
  })

  it('tracks unfinished substeps', () => {
    let w = openStep(EMPTY_WORKING, 'fetch data')
    w = openStep(w, 'plot it')
    expect(w.open).toHaveLength(2)
    w = closeStep(w, 'fetch data')
    expect(w.open).toEqual(['plot it'])
  })

  it('keeps intermediate results between steps', () => {
    const w = note(EMPTY_WORKING, 'total', 420)
    expect(w.intermediates['total']).toBe(420)
  })
})

describe('deciding what is worth remembering', () => {
  it('captures an explicit instruction to remember', () => {
    const text = 'Remember that I struggle with percentages'
    const decision = worthRemembering(text, ask(text))
    expect(decision).not.toBeNull()
    expect(decision?.source).toBe('user-stated')
    /* Stored as a fact, not as the instruction that created it. */
    expect(decision?.content).not.toMatch(/^remember/i)
    expect(decision?.content).toContain('struggle')
  })

  it('captures a stated preference without being asked', () => {
    const text = 'I prefer short answers'
    expect(worthRemembering(text, ask(text))?.kind).toBe('preference')
  })

  it('classifies a struggle as a misconception and a strength as mastery', () => {
    expect(worthRemembering('I struggle with integration', ask('I struggle with integration'))?.kind)
      .toBe('misconception')
    expect(worthRemembering('I already know basic algebra', ask('I already know basic algebra'))?.kind)
      .toBe('mastery')
  })

  it('remembers NOTHING from an ordinary question', () => {
    /* The brief asks "What SHOULD I remember?" --- "all of it" is not an
       answer, and a store that captures every turn buries the real facts. */
    for (const text of ['What is inflation?', 'Compare LIFO and FIFO', 'hi', 'Calculate 2+2']) {
      expect(worthRemembering(text, ask(text)), text).toBeNull()
    }
  })

  it('does not mistake a one-off request for a durable preference', () => {
    expect(worthRemembering('Make this one short', ask('Make this one short'))).toBeNull()
  })
})

describe('retrieval ranks, and never dumps', () => {
  it('has no path that returns everything to the agent loop', () => {
    /* `all()` exists for tests and an explicit "what do you know about me"
       screen. `retrieve` is the only read the loop may use, and it requires a
       query. This is asserted structurally so the guarantee survives a
       refactor that adds a convenience method. */
    const s = store()
    expect(Object.keys(s).sort()).toEqual(['all', 'capture', 'forget', 'historyOf', 'retrieve'])
  })

  it('returns the on-topic memory and not the off-topic one', async () => {
    const s = store()
    await put(s, 'I struggle with percentages and fractions', 'misconception')
    await put(s, 'I am preparing for the JEE exam', 'fact')
    const hits = await s.retrieve({ goal: 'explain percentages to me', entities: ['percentages'], limit: 5 })
    expect(hits).toHaveLength(1)
    expect(hits[0]?.content).toContain('percentages')
  })

  it('returns nothing when nothing is relevant', async () => {
    /* Returning the top-N of an irrelevant corpus is how "relevant historical
       context" turns into noise the model then tries to justify. */
    const s = store()
    await put(s, 'I am preparing for the JEE exam', 'fact')
    expect(await s.retrieve({ goal: 'who won the 1998 world cup', entities: [], limit: 5 })).toEqual([])
  })

  it('respects the limit', async () => {
    const s = store()
    for (let i = 0; i < 10; i++) await put(s, `I prefer short answers about topic ${i}`)
    expect((await s.retrieve({ goal: 'short answers', entities: [], limit: 3 })).length).toBeLessThanOrEqual(3)
  })

  it('can be scoped to a kind', async () => {
    const s = store()
    await put(s, 'I struggle with percentages', 'misconception')
    await put(s, 'I prefer short percentages answers', 'preference')
    const hits = await s.retrieve({ goal: 'percentages', entities: [], kinds: ['misconception'], limit: 5 })
    expect(hits.every((r) => r.kind === 'misconception')).toBe(true)
  })
})

describe('decay', () => {
  it('weakens a memory as it ages', () => {
    const r: MemoryRecord = {
      id: 'x', kind: 'misconception', content: 'struggles with percentages',
      createdAt: T0, updatedAt: T0, strength: 1, supersedes: [], source: 'observed',
    }
    expect(decayed(r, T0)).toBeCloseTo(1)
    // 45-day half life for a misconception.
    expect(decayed(r, plus(45))).toBeCloseTo(0.5, 2)
    expect(decayed(r, plus(90))).toBeCloseTo(0.25, 2)
  })

  it('fades a misconception far faster than a preference', () => {
    /* Insisting someone is bad at percentages a year after they stopped being
       bad at them is worse than having forgotten. */
    const base = { id: 'x', content: 'percentages', createdAt: T0, updatedAt: T0, strength: 1, supersedes: [], source: 'observed' } as const
    const mis = decayed({ ...base, kind: 'misconception' }, plus(180))
    const pref = decayed({ ...base, kind: 'preference' }, plus(180))
    expect(pref).toBeGreaterThan(mis * 3)
  })

  it('a decayed memory stops surfacing', async () => {
    let clock = T0
    const s = createStore(inMemoryPersistence(), () => clock)
    await s.capture({ kind: 'episode', content: 'asked about percentages once', strength: 0.3, supersedes: [], source: 'observed' })
    expect(await s.retrieve({ goal: 'percentages', entities: [], limit: 5 })).toHaveLength(1)
    clock = plus(400)
    expect(await s.retrieve({ goal: 'percentages', entities: [], limit: 5 })).toEqual([])
  })

  it('does not mutate the record it decays', () => {
    /* Decay is a function of WHEN YOU ASK. Baking it in would make the same
       memory read differently depending on how often it was retrieved. */
    const r: MemoryRecord = {
      id: 'x', kind: 'episode', content: 'c', createdAt: T0, updatedAt: T0,
      strength: 1, supersedes: [], source: 'observed',
    }
    decayed(r, plus(100))
    expect(r.strength).toBe(1)
  })
})

describe('merge', () => {
  it('reinforces rather than duplicating', async () => {
    const s = store()
    const first = await put(s, 'I prefer short answers')
    const second = await put(s, 'I prefer short answers')
    expect(second.id).toBe(first.id)
    expect(second.strength).toBeGreaterThan(first.strength)
    expect(await s.all()).toHaveLength(1)
  })

  it('caps reinforcement at 1', async () => {
    const s = store()
    for (let i = 0; i < 20; i++) await put(s, 'I prefer short answers')
    const [only] = await s.all()
    expect(only?.strength).toBeLessThanOrEqual(1)
  })

  it('never downgrades a user-stated memory to observed', async () => {
    const s = store()
    await s.capture({ kind: 'preference', content: 'I prefer short answers', strength: 0.9, supersedes: [], source: 'user-stated' })
    const again = await s.capture({ kind: 'preference', content: 'I prefer short answers', strength: 0.5, supersedes: [], source: 'observed' })
    expect(again.source).toBe('user-stated')
  })
})

describe('conflict resolution distinguishes current from historical state', () => {
  it('detects opposite claims about the same subject', () => {
    const a = { id: 'a', kind: 'misconception', content: 'I struggle with percentages', createdAt: T0, updatedAt: T0, strength: 1, supersedes: [], source: 'user-stated' } as const
    const b = { id: 'b', kind: 'mastery', content: 'I understand percentages now', createdAt: T0, updatedAt: T0, strength: 1, supersedes: [], source: 'user-stated' } as const
    expect(conflicts(a, b)).toBe(true)
  })

  it('does not call two unrelated facts a conflict', () => {
    const a = { id: 'a', kind: 'mastery', content: 'I know calculus', createdAt: T0, updatedAt: T0, strength: 1, supersedes: [], source: 'user-stated' } as const
    const b = { id: 'b', kind: 'mastery', content: 'I know trigonometry', createdAt: T0, updatedAt: T0, strength: 1, supersedes: [], source: 'user-stated' } as const
    expect(conflicts(a, b)).toBe(false)
  })

  it('supersedes the old belief and stops returning it', async () => {
    const s = store()
    const old = await put(s, 'I struggle with percentages', 'misconception')
    await put(s, 'I understand percentages now', 'mastery')
    const hits = await s.retrieve({ goal: 'percentages', entities: [], limit: 5 })
    expect(hits.map((r) => r.id)).not.toContain(old.id)
    expect(hits[0]?.content).toContain('understand')
  })

  it('KEEPS the superseded record as history', async () => {
    /* "Distinguish current state from historical state" is impossible if the
       historical state was destroyed. This is also the record of a learner
       improving, which the learning layer reads. */
    const s = store()
    const old = await put(s, 'I struggle with percentages', 'misconception')
    const now = await put(s, 'I understand percentages now', 'mastery')
    const history = await s.historyOf(now.id)
    expect(history.map((r) => r.id)).toContain(old.id)
  })
})

describe('explicit deletion is honoured literally', () => {
  it('removes the record from storage, not merely from results', async () => {
    /* Telling a user something is deleted when it is only hidden is a lie
       with their data. Asserted against `all()`, which sees hidden records. */
    const s = store()
    const r = await put(s, 'I struggle with percentages', 'misconception')
    await s.forget(r.id)
    expect(await s.all()).toHaveLength(0)
    expect(await s.retrieve({ goal: 'percentages', entities: [], limit: 5 })).toEqual([])
  })

  it('deleting a superseded record leaves the current one intact', async () => {
    const s = store()
    const old = await put(s, 'I struggle with percentages', 'misconception')
    const now = await put(s, 'I understand percentages now', 'mastery')
    await s.forget(old.id)
    const hits = await s.retrieve({ goal: 'percentages', entities: [], limit: 5 })
    expect(hits.map((r) => r.id)).toEqual([now.id])
  })
})

describe('relevance needs both topic and strength', () => {
  it('scores an on-topic but dead memory below an on-topic live one', () => {
    const base = { content: 'percentages are hard', createdAt: T0, supersedes: [], source: 'observed' } as const
    const live = relevance({ ...base, id: 'a', kind: 'misconception', updatedAt: T0, strength: 0.9 }, { goal: 'percentages', entities: [], limit: 5 }, T0)
    const dead = relevance({ ...base, id: 'b', kind: 'misconception', updatedAt: T0, strength: 0.05 }, { goal: 'percentages', entities: [], limit: 5 }, T0)
    expect(live).toBeGreaterThan(dead)
  })

  it('scores a strong off-topic memory at zero', () => {
    const r: MemoryRecord = { id: 'a', kind: 'fact', content: 'lives in Chandigarh', createdAt: T0, updatedAt: T0, strength: 1, supersedes: [], source: 'user-stated' }
    expect(relevance(r, { goal: 'explain photosynthesis', entities: [], limit: 5 }, T0)).toBe(0)
  })
})
