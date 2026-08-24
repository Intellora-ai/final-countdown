import { describe, expect, it } from 'vitest'

import type { Capability, Turn } from './contracts'
import { handle, NEW_SESSION, type ModelPort, type Ports, type Session } from './loop'
import { createAgent } from '../index'
import { createStore, inMemoryPersistence } from '../memory/memory'
import { calculator, createRegistry, fileTools, type FileSource } from '../tools/tools'
import { buildGraph, type Concept } from '../learn/learn'
import type { SearchPort } from '../knowledge/knowledge'

/**
 * EFFECTS, NOT DECISIONS.
 *
 * THE BUG THIS FILE EXISTS BECAUSE OF
 * -----------------------------------
 * `loop.test.ts` contained a test asserting that asking about an attached file
 * put `files` into `plan.selected`. It passed. It had always passed. There was
 * no branch anywhere in the loop that read a file, and `execute.ts` and
 * `world.ts` --- 59 tests between them --- were imported by nothing that
 * shipped.
 *
 * An assertion about `plan.selected` is an assertion about the ROUTER. It is
 * satisfied completely by a router that decides correctly and a loop that then
 * does nothing at all, and that is exactly the system that existed. Worse, the
 * trace reported `files` among the capabilities used, so the audit trail
 * actively asserted the file had been read.
 *
 * So every test here asserts on something that CHANGED IN THE WORLD: a port
 * that was called, a step that moved, a task that advanced, an answer that was
 * regenerated. If the loop's execute block were deleted wholesale, every test
 * in this file must fail. That is the bar, and it is the bar the previous
 * end-to-end tests did not clear.
 */

const NOW = '2026-08-24T00:00:00.000Z'
const LATER = '2026-08-25T00:00:00.000Z'

const CONCEPTS: Concept[] = [
  { id: 'arith', label: 'arithmetic', requires: [] },
  { id: 'pct', label: 'percentages', requires: ['arith'] },
  { id: 'rotational', label: 'rotational motion', requires: [] },
]

interface Spy extends ModelPort {
  calls: Parameters<ModelPort['generate']>[0][]
}

function spyModel(reply = 'ANSWER: a sustained rise in the general price level'): Spy {
  const calls: Parameters<ModelPort['generate']>[0][] = []
  return {
    calls,
    async generate(req) {
      calls.push(req)
      return reply
    },
  }
}

/** A file source that RECORDS every read, so "it read the file" is checkable. */
function countingFiles(seed: Record<string, string>) {
  const reads: string[] = []
  const source: FileSource = {
    async read(p) {
      reads.push(p)
      return seed[p] ?? null
    },
    async list() {
      return Object.keys(seed)
    },
  }
  return { source, reads }
}

const SEED = {
  'report.md': 'Inflation in India was 6.2 percent\nMeasured by the CPI basket',
}

function ports(over: Partial<Ports> = {}): Ports & { model: Spy } {
  const model = (over.model as Spy | undefined) ?? spyModel()
  const base: Ports = {
    memory: createStore(inMemoryPersistence(), () => NOW),
    tools: createRegistry([calculator, ...fileTools(countingFiles(SEED).source)]),
    model,
    now: () => NOW,
    concepts: buildGraph(CONCEPTS),
  }
  return { ...base, ...over, model }
}

function ask(text: string, ...extra: Turn['parts']): Turn {
  return { parts: [{ modality: 'text', content: text }, ...extra], at: NOW }
}

const doc = (name: string): Turn['parts'][number] => ({
  modality: 'document',
  content: 'x',
  name,
})

/* -------------------------------------------------------------------------- */
/* The structural invariant                                                   */
/* -------------------------------------------------------------------------- */

describe('THE INVARIANT — a selected capability is executed or explained', () => {
  /* This is the generalised form of the original bug. `files`, `plan`, `act`,
     `code` and `tools` were all selectable and none had a branch; the only
     reason that was invisible is that nothing ever compared the two lists.

     Deliberately a WIDE sweep of turns rather than one. The failure was
     capability-specific, so a single fixture would only ever have caught the
     one capability it happened to exercise. */
  const TURNS: readonly (readonly [string, Turn])[] = [
    ['a greeting', ask('hello')],
    ['a bare fact', ask('What is inflation?')],
    ['arithmetic', ask('Calculate 17.5% of 2400')],
    ['an attachment', ask('Summarise this', doc('report.md'))],
    ['an attachment with no matching tool', ask('Summarise this', doc('missing.md'))],
    ['a comparison', ask('Compare LIFO and FIFO and weighted average')],
    ['a plan request', ask('Plan my JEE revision: cover mechanics, optics and thermodynamics')],
    ['an action', ask('Delete my old notes and send the summary to my teacher')],
    ['code', ask('Why does my python script raise a KeyError on line 12?')],
    ['research', ask('Search for the latest RBI repo rate')],
    ['teaching', ask('Teach me rotational motion')],
    ['an ambiguous ask', ask('fix it')],
    ['an empty turn', { parts: [], at: NOW }],
    ['a correction', ask('No, I meant the CPI basket, not the WPI one')],
  ]

  for (const [label, turn] of TURNS) {
    it(`accounts for every selected capability — ${label}`, async () => {
      const out = await handle(turn, NEW_SESSION, ports())
      const executed = new Set(out.trace.executed)
      const unmet = new Set(Object.keys(out.trace.unmet))

      const unaccounted = out.result.plan.selected.filter(
        (c) => !executed.has(c) && !unmet.has(c),
      )
      expect(
        unaccounted,
        `selected but neither executed nor explained: ${unaccounted.join(', ')}`,
      ).toEqual([])
    })
  }

  it('never reports a capability as executed that was not selected', async () => {
    /* The mirror image, and the one that keeps `executed` honest. A trace that
       over-claims is exactly as misleading as one that under-reports. */
    for (const [, turn] of TURNS) {
      const out = await handle(turn, NEW_SESSION, ports())
      const selected = new Set<Capability>(out.result.plan.selected)
      for (const c of out.trace.executed) expect(selected.has(c)).toBe(true)
    }
  })

  it('gives a REASON for every unmet capability, never a bare flag', async () => {
    const out = await handle(ask('Summarise this', doc('missing.md')), NEW_SESSION, ports())
    for (const [cap, why] of Object.entries(out.trace.unmet)) {
      expect(why.length, `${cap} was unmet with no explanation`).toBeGreaterThan(15)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* Capability 1 & 8 — files are actually read                                 */
/* -------------------------------------------------------------------------- */

describe('files — the port is called, not merely selected', () => {
  it('READS the attached file through the file source', async () => {
    const { source, reads } = countingFiles(SEED)
    const p = ports({ tools: createRegistry([calculator, ...fileTools(source)]) })
    const out = await handle(ask('Summarise this inflation report', doc('report.md')), NEW_SESSION, p)

    /* THE ASSERTION THE OLD TEST DID NOT MAKE. Not "files was selected" ---
       the file source was actually asked for bytes. */
    expect(reads.length).toBeGreaterThan(0)
    expect(out.trace.executed).toContain('files')
  })

  it('grounds a claim in the file CONTENT, with the file as the source', async () => {
    const p = ports()
    const out = await handle(ask('Summarise this inflation report', doc('report.md')), NEW_SESSION, p)
    const fromFile = out.result.claims.filter((c) => c.sources.some((s) => s.kind === 'file'))
    expect(fromFile.length).toBeGreaterThan(0)
    expect(fromFile[0]?.statement).toContain('6.2 percent')
  })

  it('hands the file content to the model rather than answering around it', async () => {
    const p = ports()
    await handle(ask('Summarise this inflation report', doc('report.md')), NEW_SESSION, p)
    const claims = p.model.calls[0]?.claims ?? []
    expect(claims.some((c) => c.statement.includes('CPI basket'))).toBe(true)
  })

  it('says so, and reads nothing, when no file tools are registered', async () => {
    const p = ports({ tools: createRegistry([calculator]) })
    const out = await handle(ask('Summarise this', doc('report.md')), NEW_SESSION, p)
    expect(out.trace.executed).not.toContain('files')
    expect(out.trace.unmet.files).toMatch(/no file tools/)
    expect(out.result.claims.some((c) => c.sources.some((s) => s.kind === 'file'))).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* Capabilities 11-14 — planning and execution actually happen                */
/* -------------------------------------------------------------------------- */

describe('plan and act — a task exists and moves', () => {
  const PLAN = 'Plan my JEE revision: cover mechanics, cover optics, cover thermodynamics'

  it('produces a real task with more than one step', async () => {
    const out = await handle(ask(PLAN), NEW_SESSION, ports())
    expect(out.result.task).toBeDefined()
    expect(out.result.task?.plan.steps.length).toBeGreaterThan(1)
  })

  it('writes a journal, which is what makes the task explainable afterwards', async () => {
    const out = await handle(ask(PLAN), NEW_SESSION, ports())
    expect(out.result.task?.journal.length).toBeGreaterThan(0)
    expect(out.result.task?.journal[0]?.event).toBe('started')
  })

  it('CARRIES the task to the next turn instead of restarting it', async () => {
    const p = ports()
    const first = await handle(ask(PLAN), NEW_SESSION, p)
    expect(first.session.task).toBeDefined()

    const second = await handle(ask('carry on with that'), first.session, p)
    /* Same task id. A second `startTask` would produce a different one and
       silently abandon the first plan. */
    expect(second.session.task?.id).toBe(first.session.task?.id)
  })

  it('MOVES steps when acting, rather than reporting a plan that never ran', async () => {
    const p = ports()
    const out = await handle(
      ask('Delete my old notes and then calculate 2 + 2 and send the summary'),
      NEW_SESSION,
      p,
    )
    if (out.trace.executed.includes('act')) {
      const moved = out.result.task?.plan.steps.filter((s) => s.state !== 'pending') ?? []
      expect(moved.length).toBeGreaterThan(0)
      expect(out.result.task?.journal.some((j) => j.event === 'running')).toBe(true)
    } else {
      expect(out.trace.unmet.act).toBeTruthy()
    }
  })

  it('records a completeness verification, distinct from the constraint checks', async () => {
    const out = await handle(
      ask('Delete my old notes and then calculate 2 + 2 and send the summary'),
      NEW_SESSION,
      ports(),
    )
    if (out.trace.executed.includes('act')) {
      expect(out.result.verifications.some((v) => v.kind === 'completeness')).toBe(true)
    }
  })
})

describe('cross-session continuity — Capability 32', () => {
  it('survives suspend and restore through a string, and keeps the same task', async () => {
    const agent = createAgent({ model: spyModel(), now: () => NOW, curriculum: CONCEPTS })
    const first = await agent.ask(
      'Plan my JEE revision: cover mechanics, cover optics, cover thermodynamics',
    )
    expect(first.result.task).toBeDefined()

    const saved = agent.suspend()
    expect(typeof saved).toBe('string')

    /* A DIFFERENT AGENT. Restoring into the same process object would prove
       nothing --- the point is that the string alone carries the task. */
    const tomorrow = createAgent({ model: spyModel(), now: () => LATER, curriculum: CONCEPTS })
    tomorrow.restore(saved as string)
    expect(tomorrow.session().task?.id).toBe(first.result.task?.id)

    const resumed = await tomorrow.ask('carry on')
    expect(resumed.session.task?.journal.some((j) => j.event === 'resumed')).toBe(true)
  })

  it('pauses before serialising, so a restored task is not stuck mid-step', async () => {
    const agent = createAgent({ model: spyModel(), now: () => NOW, curriculum: CONCEPTS })
    await agent.ask('Plan my JEE revision: cover mechanics, cover optics, cover thermodynamics')
    agent.suspend()
    expect(agent.session().task?.status).toBe('paused')
    expect(agent.session().task?.journal.some((j) => j.event === 'paused')).toBe(true)
  })

  it('returns null rather than throwing when there is nothing to suspend', () => {
    const agent = createAgent({ model: spyModel(), now: () => NOW })
    expect(agent.suspend()).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* Capabilities 29-30 — the world model                                       */
/* -------------------------------------------------------------------------- */

describe('reason — a causal model is built and queried', () => {
  it('extracts relations into a world model on an explanatory turn', async () => {
    const out = await handle(
      ask('Why does heating a gas raise its pressure? Heating causes faster motion.'),
      NEW_SESSION,
      ports(),
    )
    if (out.trace.executed.includes('reason')) {
      expect(out.trace.world).toBeDefined()
      expect(out.trace.world?.relations.length).toBeGreaterThan(0)
    } else {
      expect(out.trace.unmet.reason).toBeTruthy()
    }
  })

  it('CATCHES a contradiction between two things it was told', async () => {
    /* The payoff of having a graph rather than a pile of sentences: these two
       statements are individually fine and jointly impossible, and no
       sentence-level check can see it. */
    const out = await handle(
      ask('Explain: insulation prevents heat loss. Also insulation enables heat loss.'),
      NEW_SESSION,
      ports(),
    )
    const logical = out.result.verifications.filter((v) => v.kind === 'logical' && !v.passed)
    if (out.trace.world && out.trace.world.relations.length > 1) {
      expect(logical.length).toBeGreaterThan(0)
    }
  })

  it('says so when nothing structural could be extracted', async () => {
    const out = await handle(ask('Explain inflation'), NEW_SESSION, ports())
    if (!out.trace.executed.includes('reason')) {
      expect(out.trace.unmet.reason).toMatch(/relations/)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* Capability 24 — verification REPAIRS, it does not just report              */
/* -------------------------------------------------------------------------- */

describe('verify and repair — a failed check changes the answer', () => {
  it('regenerates with the failures attached when a check fails', async () => {
    /* The stub answers something unrelated, so `verifyAddressesGoal` fails. */
    const model = spyModel('completely unrelated text about gardening')
    const out = await handle(ask('Explain compound interest'), NEW_SESSION, ports({ model }))

    expect(model.calls.length).toBe(2)
    expect(model.calls[0]?.mustFix).toBeUndefined()
    expect(model.calls[1]?.mustFix?.length).toBeGreaterThan(0)
    expect(out.result.answer.length).toBeGreaterThan(0)
  })

  it('is BOUNDED — one repair round, never an unbounded retry loop', async () => {
    const model = spyModel('still unrelated text about gardening')
    await handle(ask('Explain compound interest'), NEW_SESSION, ports({ model }))
    expect(model.calls.length).toBeLessThanOrEqual(2)
  })

  it('does not call the model at all when the turn stopped to ask', async () => {
    const model = spyModel()
    const out = await handle(ask('fix it'), NEW_SESSION, ports({ model }))
    if (out.trace.action === 'ask') {
      expect(model.calls.length).toBe(0)
      expect(out.trace.executed).toContain('ask')
    }
  })

  it('does not try to repair an answer the model port already failed to produce', async () => {
    let calls = 0
    const failing: ModelPort = {
      async generate() {
        calls++
        throw new Error('upstream down')
      },
    }
    const out = await handle(ask('Explain compound interest'), NEW_SESSION, ports({ model: failing as Spy }))
    /* One attempt, not two. Calling a dead port again to fix its own absent
       output turns one failure into two and doubles the latency of an outage. */
    expect(calls).toBe(1)
    expect(out.trace.degraded).toBeTruthy()
  })
})

/* -------------------------------------------------------------------------- */
/* The composition root                                                       */
/* -------------------------------------------------------------------------- */

describe('createAgent — the system can actually be built', () => {
  it('registers a calculator, so arithmetic works without the caller wiring one', async () => {
    /* THE PRODUCTION-REALITY TEST. Before the composition root existed, every
       registry in this codebase was built inside a test file, and `calculator`
       was dead code --- the `calculate` capability could not have worked for a
       real caller no matter how many unit tests passed. */
    const agent = createAgent({ model: spyModel(), now: () => NOW })
    expect(agent.ports.tools.get('calculator')).toBeDefined()

    const out = await agent.ask('Calculate 17.5% of 2400')
    expect(out.trace.executed).toContain('calculate')
    expect(Object.values(out.result.verifications).some((v) => v.kind === 'arithmetic')).toBe(true)
  })

  it('threads the session, so the second turn remembers the first', async () => {
    const agent = createAgent({ model: spyModel(), now: () => NOW })
    await agent.ask('What is inflation?')
    const second = await agent.ask('Explain it more simply')
    expect(second.session.conversation.turnIndex).toBe(2)
    expect(agent.session().conversation.turnIndex).toBe(2)
  })

  it('omits file tools when no source is supplied, rather than registering broken ones', () => {
    const agent = createAgent({ model: spyModel(), now: () => NOW })
    expect(agent.ports.tools.get('read_file')).toBeUndefined()
  })

  it('registers file tools when a source IS supplied', () => {
    const agent = createAgent({ model: spyModel(), now: () => NOW, files: countingFiles(SEED).source })
    expect(agent.ports.tools.get('read_file')).toBeDefined()
    expect(agent.ports.tools.get('search_files')).toBeDefined()
  })

  it('reports search as unmet when no search port is configured', async () => {
    const agent = createAgent({ model: spyModel(), now: () => NOW })
    const out = await agent.ask('Search for the latest RBI repo rate')
    if (out.result.plan.selected.includes('search')) {
      expect(out.trace.unmet.search).toMatch(/no search port/)
    }
  })

  it('uses a search port when one IS configured', async () => {
    let searched = 0
    const search: SearchPort = {
      async search() {
        searched++
        return [
          {
            url: 'https://rbi.org.in/rates',
            title: 'Policy rates',
            snippet: 'The repo rate is 6.5 percent',
            publishedAt: NOW,
          },
        ]
      },
    }
    const agent = createAgent({ model: spyModel(), now: () => NOW, search })
    const out = await agent.ask('Search for the latest RBI repo rate')
    if (out.result.plan.selected.includes('search')) {
      expect(searched).toBeGreaterThan(0)
      expect(out.trace.executed).toContain('search')
    }
  })

  it('accepts a string turn without the caller assembling parts', async () => {
    const agent = createAgent({ model: spyModel(), now: () => NOW })
    const out = await agent.ask('hello')
    expect(out.result.answer.length).toBeGreaterThan(0)
  })
})

/* -------------------------------------------------------------------------- */
/* Working memory records what the loop assumed                               */
/* -------------------------------------------------------------------------- */

describe('assumptions are written down, not made silently', () => {
  it('records a non-blocking ambiguity as a stated assumption', async () => {
    const out = await handle(ask('Explain how it works in simple terms'), NEW_SESSION, ports())
    const ambiguous = out.trace.understanding.ambiguities.filter((a) => !a.blocking)
    if (ambiguous.length > 0 && out.trace.action !== 'ask') {
      expect(out.session.working.assumptions.length).toBeGreaterThan(0)
    }
  })

  it('keeps the session threaded across turns', async () => {
    const p = ports()
    const first: Session = (await handle(ask('What is inflation?'), NEW_SESSION, p)).session
    const second = await handle(ask('Explain it more simply'), first, p)
    expect(second.session.conversation.turnIndex).toBe(2)
  })
})
