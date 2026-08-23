import { describe, expect, it } from 'vitest'

import type { Turn } from './contracts'
import { handle, NEW_SESSION, extractExpression, type ModelPort, type Ports, type Session } from './loop'
import { createStore, inMemoryPersistence } from '../memory/memory'
import { calculator, createRegistry, fileTools, type FileSource } from '../tools/tools'
import type { SearchHit, SearchPort } from '../knowledge/knowledge'
import { buildGraph, type Concept } from '../learn/learn'

/**
 * END-TO-END CAPABILITY VALIDATION.
 *
 * The brief's closing instruction: "validate that each capability actually
 * works end-to-end rather than merely existing as a code component."
 *
 * Every test below drives the REAL `handle()` --- the same function a request
 * would go through --- and asserts on what came out. Nothing here calls a
 * module directly. A unit test proves a component behaves; only this proves
 * the components are wired to each other, and wiring is where a system of
 * eleven correct modules still does the wrong thing.
 *
 * THE MODEL IS A SPY THAT RETURNS A FIXED STRING.
 *
 * That is not a compromise, it is the point. Every decision worth testing ---
 * what was understood, which capabilities woke, where the answer was sourced,
 * whether it verified, how it chose to communicate --- is made BEFORE
 * generation. If any of it required a real model, none of it could be asserted
 * about every run. The spy also records what it was handed, so "the model was
 * told to be brief" is checkable rather than hoped for.
 */

const NOW = '2026-08-24T00:00:00.000Z'

const CONCEPTS: Concept[] = [
  { id: 'arith', label: 'arithmetic', requires: [] },
  { id: 'pct', label: 'percentages', requires: ['arith'] },
  { id: 'rotational', label: 'rotational motion', requires: [] },
]

interface Spy extends ModelPort {
  calls: Parameters<ModelPort['generate']>[0][]
}

function spyModel(reply = 'ANSWER: inflation is a sustained rise in the general price level'): Spy {
  const calls: Parameters<ModelPort['generate']>[0][] = []
  return {
    calls,
    async generate(req) {
      calls.push(req)
      return reply
    },
  }
}

function searchPort(hits: readonly SearchHit[]): SearchPort {
  return { async search() { return hits } }
}

const FILES: Record<string, string> = {
  'report.md': 'Inflation in India was 6.2 percent\nMeasured by the CPI basket',
}
const files: FileSource = {
  async read(p) { return FILES[p] ?? null },
  async list() { return Object.keys(FILES) },
}

function ports(over: Partial<Ports> = {}): Ports & { model: Spy } {
  const model = (over.model as Spy | undefined) ?? spyModel()
  const base: Ports = {
    memory: createStore(inMemoryPersistence(), () => NOW),
    tools: createRegistry([calculator, ...fileTools(files)]),
    model,
    now: () => NOW,
    concepts: buildGraph(CONCEPTS),
  }
  /* `model` last and listed ONCE. An earlier version spread `over` and then
     re-stated `model`, which is a duplicate key --- TS1117. vitest transpiles
     without type-checking so the suite ran green while `npm run typecheck`
     failed, which is exactly why the Definition of Done is all three commands
     and not just the tests. */
  return { ...base, ...over, model }
}

function ask(text: string, ...extra: Turn['parts']): Turn {
  return { parts: [{ modality: 'text', content: text }, ...extra], at: NOW }
}

/* -------------------------------------------------------------------------- */

describe('CAPABILITY 1 — multimodal input', () => {
  it('an attached document reaches the file capability and resolves "this"', async () => {
    const p = ports()
    const out = await handle(
      ask('Summarise this', { modality: 'document', content: 'x', name: 'report.md' }),
      NEW_SESSION,
      p,
    )
    expect(out.trace.capabilities).toContain('files')
    /* And the attachment resolved the pronoun rather than triggering a
       clarifying question about which document was meant. */
    expect(out.result.question).toBeUndefined()
  })

  it('combines an image and text into one reading', async () => {
    const out = await handle(
      ask('what is wrong here', { modality: 'image', content: 'b64' }),
      NEW_SESSION,
      ports(),
    )
    expect(out.trace.context.hasAttachments).toBe(true)
  })
})

describe('CAPABILITY 2 & 3 — language and intent', () => {
  it.each([
    ['What is inflation?', 'explanation'],
    ['Search the latest inflation data', 'research'],
    ['Remember that I struggle with percentages', 'memory-write'],
    ['Plan my JEE revision', 'planning'],
    ['Why is my code failing?', 'troubleshooting'],
  ])('%s is read as %s end to end', async (text, kind) => {
    const out = await handle(ask(text), NEW_SESSION, ports())
    expect(out.trace.understanding.intents.map((i) => i.kind)).toContain(kind)
  })

  it('handles a multi-part request without dropping half of it', async () => {
    const out = await handle(
      ask('Search the latest RBI repo rate and explain it simply'),
      NEW_SESSION,
      ports({ search: searchPort([]) }),
    )
    const kinds = out.trace.understanding.intents.map((i) => i.kind)
    expect(kinds).toContain('research')
    expect(kinds).toContain('explanation')
  })
})

describe('CAPABILITY 4 & 5 — context and working memory across turns', () => {
  it('resolves "it" against the previous turn', async () => {
    const p = ports()
    let session: Session = NEW_SESSION
    const first = await handle(ask('What is inflation?'), session, p)
    session = first.session

    const second = await handle(ask("Explain it like I'm new to economics"), session, p)
    expect(second.result.question).toBeUndefined()
    expect(second.trace.understanding.entities.map((e) => e.id)).toContain('inflation')
  })

  it('carries constraints forward into working memory', async () => {
    const p = ports()
    let session = NEW_SESSION
    session = (await handle(ask('Explain inflation in 3 sentences'), session, p)).session
    session = (await handle(ask('And do it without jargon'), session, p)).session
    expect(session.working.constraints.join(' ')).toContain('3 sentences')
    expect(session.working.constraints.join(' ')).toContain('without')
  })

  it('does not treat every turn as independent', async () => {
    const p = ports()
    const first = await handle(ask('What is inflation?'), NEW_SESSION, p)
    expect(first.session.conversation.turnIndex).toBe(1)
    const second = await handle(ask('and how is it measured'), first.session, p)
    expect(second.session.conversation.turnIndex).toBe(2)
  })
})

describe('CAPABILITY 6 — long-term memory, across sessions', () => {
  it('writes a memory and retrieves it in a LATER, FRESH session', async () => {
    /* The point of long-term memory: a new session with no conversation
       history still knows this. */
    const store = createStore(inMemoryPersistence(), () => NOW)
    const p = ports({ memory: store })

    const write = await handle(ask('Remember that I struggle with percentages'), NEW_SESSION, p)
    expect(write.result.remembered).toHaveLength(1)
    expect(write.result.remembered[0]?.content).toContain('struggle')

    const later = await handle(ask('explain percentages to me'), NEW_SESSION, ports({ memory: store }))
    expect(later.trace.capabilities).toContain('memory-read')
    expect(later.result.claims.some((c) => c.statement.includes('struggle'))).toBe(true)
  })

  it('remembers NOTHING from an ordinary question', async () => {
    const p = ports()
    const out = await handle(ask('What is inflation?'), NEW_SESSION, p)
    expect(out.result.remembered).toEqual([])
  })

  it('the memory reaches the model as a claim it can use', async () => {
    const store = createStore(inMemoryPersistence(), () => NOW)
    await handle(ask('Remember that I prefer short answers'), NEW_SESSION, ports({ memory: store }))
    const p = ports({ memory: store })
    await handle(ask('give me short answers about inflation'), NEW_SESSION, p)
    expect(p.model.calls[0]?.claims.some((c) => c.sources[0]?.kind === 'memory')).toBe(true)
  })
})

describe('CAPABILITY 7 & 8 — knowledge access and research', () => {
  it('does NOT search a settled question', async () => {
    const p = ports({ search: searchPort([{ url: 'https://x.com/a', title: 't', snippet: 's' }]) })
    const out = await handle(ask('What is photosynthesis?'), NEW_SESSION, p)
    expect(out.trace.capabilities).not.toContain('search')
    expect(out.result.plan.rejected['search']).toBe('the answer does not change with time')
  })

  it('searches a time-sensitive question and cites what it found', async () => {
    const p = ports({
      search: searchPort([
        { url: 'https://rbi.org.in/a', title: 'Repo rate', snippet: 'The RBI repo rate is 6.5 percent', publishedAt: '2026-08-01T00:00:00Z' },
        { url: 'https://data.gov.in/b', title: 'Repo rate', snippet: 'The RBI repo rate is 6.5 percent', publishedAt: '2026-08-02T00:00:00Z' },
      ]),
    })
    const out = await handle(ask('What is the latest RBI repo rate?'), NEW_SESSION, p)
    expect(out.trace.capabilities).toContain('search')
    expect(out.result.claims.length).toBeGreaterThan(0)
    expect(out.result.claims[0]?.sources[0]?.ref).toContain('http')
  })

  it('QUALIFIES rather than asserting when sources disagree', async () => {
    /* The laundering failure, checked end to end: two different numbers must
       not become one confident answer. */
    const p = ports({
      search: searchPort([
        { url: 'https://rbi.org.in/a', title: 'Inflation', snippet: 'India inflation was 6.2 percent' },
        { url: 'https://news.example.com/b', title: 'Inflation', snippet: 'India inflation was 4.9 percent' },
      ]),
    })
    const out = await handle(ask('What is the latest India inflation?'), NEW_SESSION, p)
    expect(out.trace.action).toBe('qualify')
    expect(out.result.claims.some((c) => c.conflict)).toBe(true)
  })

  it('DECLINES after a search that returned nothing', async () => {
    const p = ports({ search: searchPort([]) })
    const out = await handle(ask('What is the latest RBI repo rate?'), NEW_SESSION, p)
    expect(out.trace.action).toBe('decline')
  })
})

describe('CAPABILITY 9 & 21 — tools and computation', () => {
  it('EXECUTES the arithmetic instead of estimating it', async () => {
    const p = ports()
    const out = await handle(ask('Calculate 17.5% of 2400'), NEW_SESSION, p)
    expect(out.trace.capabilities).toContain('calculate')
    /* The exact number reaches the model, so the answer cannot invent one. */
    expect(Object.values(p.model.calls[0]?.computed ?? {})).toContain(420)
  })

  it('verifies the computed number in the same turn', async () => {
    const out = await handle(ask('Calculate 17.5% of 2400'), NEW_SESSION, ports())
    const arithmetic = out.result.verifications.find((v) => v.kind === 'arithmetic')
    expect(arithmetic?.passed).toBe(true)
  })

  it('reports a failed computation rather than answering around it', async () => {
    const out = await handle(ask('Calculate 5 / 0'), NEW_SESSION, ports())
    const arithmetic = out.result.verifications.find((v) => v.kind === 'arithmetic')
    expect(arithmetic?.passed).toBe(false)
  })

  it('extracts the expression, including bare percentages', () => {
    expect(extractExpression('what is 17.5% of 2400')).toBe('17.5 / 100 * 2400')
    expect(extractExpression('what is 2 + 3 * 4')).toBe('2 + 3 * 4')
    expect(extractExpression('what is inflation')).toBeNull()
  })
})

describe('CAPABILITY 23 — knowing when NOT to answer', () => {
  it('ASKS instead of answering when the referent is unknown', async () => {
    const p = ports()
    const out = await handle(ask('fix it'), NEW_SESSION, p)
    expect(out.trace.action).toBe('ask')
    expect(out.result.question).toBeTruthy()
    /* AND THE MODEL WAS NEVER CALLED. Handing an unanswerable request to a
       model invites it to answer anyway, which is the whole failure. */
    expect(p.model.calls).toHaveLength(0)
  })

  it('does not ask when the request is clear', async () => {
    const out = await handle(ask('What is inflation?'), NEW_SESSION, ports())
    expect(out.result.question).toBeUndefined()
  })
})

describe('CAPABILITY 24 & 31 — verification and self-monitoring', () => {
  it('verifies every answer against the goal', async () => {
    const out = await handle(ask('What is inflation?'), NEW_SESSION, ports())
    expect(out.result.verifications.some((v) => v.kind === 'logical')).toBe(true)
  })

  it('CATCHES an answer about something else entirely', async () => {
    const p = ports({ model: spyModel('The rover landed on Mars in 2021.') })
    const out = await handle(ask('What is inflation?'), NEW_SESSION, p)
    const relevance = out.result.verifications.find((v) => v.kind === 'logical')
    expect(relevance?.passed).toBe(false)
    expect(out.trace.selfChecks.find((c) => c.question.includes('actual question'))?.ok).toBe(false)
  })

  it('CATCHES a violated length constraint', async () => {
    const p = ports({ model: spyModel('One. Two. Three. Four. Five. Six.') })
    const out = await handle(ask('Explain inflation in 2 sentences'), NEW_SESSION, p)
    const constraint = out.result.verifications.find((v) => v.kind === 'constraint')
    expect(constraint?.passed).toBe(false)
  })

  it('runs the self-check list on every turn', async () => {
    const out = await handle(ask('What is inflation?'), NEW_SESSION, ports())
    expect(out.trace.selfChecks.length).toBeGreaterThanOrEqual(7)
  })
})

describe('CAPABILITY 17 & 18 — communication and representation', () => {
  it('tells the model to be BRIEF for a greeting', async () => {
    const p = ports()
    const out = await handle(ask('hi'), NEW_SESSION, p)
    expect(out.result.communication.depth).toBe('brief')
    expect(p.model.calls[0]?.communication.depth).toBe('brief')
  })

  it('chooses a comparison for a comparison, and prose for a single fact', async () => {
    const cmp = await handle(ask('Compare LIFO and FIFO'), NEW_SESSION, ports())
    expect(cmp.result.communication.representations[0]).toBe('comparison')

    const one = await handle(ask('What is inflation?'), NEW_SESSION, ports())
    expect(one.result.communication.representations).toEqual(['prose'])
  })

  it('adapts to a stored density preference across sessions', async () => {
    const store = createStore(inMemoryPersistence(), () => NOW)
    await handle(ask('Remember that I prefer short answers'), NEW_SESSION, ports({ memory: store }))
    const out = await handle(ask('explain short answers on inflation'), NEW_SESSION, ports({ memory: store }))
    expect(out.result.communication.depth).toBe('brief')
  })

  it('mirrors the user’s language', async () => {
    const out = await handle(ask('mujhe ye samajh nahi aaya, batao'), NEW_SESSION, ports())
    expect(out.result.communication.language).toBe('hi-Latn')
  })

  it('changes FRAMING, not length, after repeated asking', async () => {
    const p = ports()
    let session = NEW_SESSION
    for (let i = 0; i < 3; i++) {
      session = (await handle(ask('explain inflation to me'), session, p)).session
    }
    const out = await handle(ask('explain inflation to me'), session, p)
    expect(out.result.communication.leadWith).toContain('different framing')
  })
})

describe('CAPABILITY 34 — the learning layer, layered ON the substrate', () => {
  it('activates ONLY for a request to be taught', async () => {
    const teach = await handle(ask('Teach me rotational motion'), NEW_SESSION, ports())
    expect(teach.trace.capabilities).toContain('learning')

    const askOnly = await handle(ask('What is rotational motion?'), NEW_SESSION, ports())
    expect(askOnly.trace.capabilities).not.toContain('learning')
  })

  it('THE IDENTITY TEST — an unrelated request never becomes a lesson', async () => {
    const out = await handle(ask('Tell me something unrelated to education.'), NEW_SESSION, ports())
    expect(out.trace.capabilities).not.toContain('learning')
    expect(out.result.plan.rejected['learning']).toBeTruthy()
  })

  it('the general substrate still runs underneath teaching', async () => {
    /* "general AI + learning intelligence + communication intelligence" ---
       learning is layered ON, not instead of. */
    const out = await handle(ask('Teach me rotational motion'), NEW_SESSION, ports())
    for (const c of ['knowledge', 'reason', 'communicate'] as const) {
      expect(out.trace.capabilities).toContain(c)
    }
  })

  it('adapts the teaching plan to a recorded misconception', async () => {
    const store = createStore(inMemoryPersistence(), () => NOW)
    await store.capture({
      kind: 'misconception',
      content: 'I struggle with percentages',
      strength: 0.9,
      supersedes: [],
      source: 'user-stated',
    })
    const out = await handle(ask('Teach me percentages'), NEW_SESSION, ports({ memory: store }))
    /* Contrast against the wrong belief rather than restating the right one. */
    expect(out.result.communication.representations[0]).toBe('comparison')
  })

  it('forces progressive disclosure for brand new material', async () => {
    const out = await handle(ask('Teach me rotational motion'), NEW_SESSION, ports())
    expect(out.result.communication.progressive).toBe(true)
  })
})

describe('MINIMALITY — the loop runs only what it selected', () => {
  it('a greeting wakes nothing but communication', async () => {
    const p = ports({ search: searchPort([{ url: 'https://x.com/a', title: 't', snippet: 's' }]) })
    const out = await handle(ask('hi'), NEW_SESSION, p)
    expect(out.trace.capabilities).toEqual(['communicate'])
  })

  it('never calls the search port when search was not selected', async () => {
    let searched = false
    const p = ports({
      search: { async search() { searched = true; return [] } },
    })
    await handle(ask('What is photosynthesis?'), NEW_SESSION, p)
    expect(searched).toBe(false)
  })

  it('records a reason for every rejection, on every turn', async () => {
    for (const text of ['hi', 'What is inflation?', 'Teach me percentages', 'Calculate 2+2']) {
      const out = await handle(ask(text), NEW_SESSION, ports())
      for (const [cap, why] of Object.entries(out.result.plan.rejected)) {
        expect(why, `${text}: ${cap} rejected with no reason`).toBeTruthy()
      }
    }
  })
})

describe('the loop never throws, whatever the ports do', () => {
  /* THE NAME OF THIS BLOCK WAS A CLAIM THE BLOCK DID NOT CHECK.
   *
   * It faulted the search port, an empty turn, and a missing concept graph.
   * The search port is the ONE port with a boundary already --- `research()`
   * wraps `port.search` in the only try/catch reachable from here --- so the
   * single port that was fault-tested was the single port that could not fail
   * the test. `loop.ts` itself contained zero `try`.
   *
   * That left the model call unguarded, which is the worst one to miss: it is
   * the only network call in the loop and the most likely thing to 502, and a
   * provider error propagated out of `handle()` as an unhandled rejection.
   * The three tests below are the ones that were absent. */

  it('survives a MODEL port that rejects', async () => {
    /* A 502 from the provider must degrade to something the user can read,
       not take the turn down. Everything upstream --- the reading, the
       routing, the memory, the verification --- has already succeeded by the
       time this fails, and throwing discards all of it. */
    const p = ports({ model: { calls: [], async generate() { throw new Error('502 upstream') } } as Spy })
    const out = await handle(ask('What is inflation?'), NEW_SESSION, p)
    expect(out.result.answer.length).toBeGreaterThan(0)
    /* And it must SAY it failed rather than emitting a confident empty
       answer, which would be indistinguishable from a real one. */
    expect(out.result.answer.toLowerCase()).toContain('could not')
    expect(out.trace.capabilities.length).toBeGreaterThan(0)
  })

  it('survives a memory port whose retrieve rejects', async () => {
    /* Memory is an enhancement, not a precondition. A store that is down
       should cost personalisation, not the answer. */
    const p = ports()
    const broken = { ...p.memory, async retrieve() { throw new Error('store offline') } }
    const out = await handle(ask('What is inflation?'), NEW_SESSION, { ...p, memory: broken })
    expect(out.result.answer.length).toBeGreaterThan(0)
    expect(out.trace.capabilities).toContain('communicate')
  })

  it('survives a memory port whose capture rejects', async () => {
    /* Failing to WRITE a memory must not lose the turn that produced it. */
    const p = ports()
    const broken = { ...p.memory, async capture() { throw new Error('disk full') } }
    const out = await handle(
      ask('Remember that I struggle with percentages'),
      NEW_SESSION,
      { ...p, memory: broken },
    )
    expect(out.result.answer.length).toBeGreaterThan(0)
    /* Nothing was stored, and the result must not claim otherwise. */
    expect(out.result.remembered).toEqual([])
  })

  it('survives a search port that rejects', async () => {
    const p = ports({ search: { async search() { throw new Error('offline') } } })
    const out = await handle(ask('What is the latest repo rate?'), NEW_SESSION, p)
    expect(out.result.answer.length).toBeGreaterThan(0)
  })

  it('survives an empty turn', async () => {
    const out = await handle({ parts: [], at: NOW }, NEW_SESSION, ports())
    expect(out.result.answer.length).toBeGreaterThan(0)
  })

  it('survives a turn with no concept graph', async () => {
    const p = ports()
    const out = await handle(ask('Teach me rotational motion'), NEW_SESSION, { ...p, concepts: undefined })
    expect(out.result.answer.length).toBeGreaterThan(0)
  })
})

describe('the ten steps happen in order', () => {
  it('understands, routes, sources, executes, verifies and communicates before generating', async () => {
    const p = ports()
    const out = await handle(ask('Calculate 17.5% of 2400'), NEW_SESSION, p)

    /* Everything below was decided BEFORE the single model call --- which is
       what makes all of it assertable about every run. */
    expect(p.model.calls).toHaveLength(1)
    const req = p.model.calls[0]
    expect(req?.understanding.goal.length).toBeGreaterThan(0)   // 1,2
    expect(req?.capabilities.length).toBeGreaterThan(0)          // 4
    expect(req?.computed).toBeTruthy()                           // 6
    expect(req?.communication.depth).toBeTruthy()                // 8
    expect(out.trace.sources.length).toBeGreaterThan(0)          // 5
    expect(out.result.verifications.length).toBeGreaterThan(0)   // 7
    expect(out.session.conversation.turnIndex).toBe(1)           // 10
  })
})
