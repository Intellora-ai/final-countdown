import { describe, expect, it } from 'vitest'

import type { Capability, Intent, IntentKind, Understanding } from './contracts'
import { NO_CONTEXT, route, type RouteContext } from './router'

/**
 * THE ROUTER'S ACCEPTANCE TESTS ARE THE BRIEF'S OWN EXAMPLES.
 *
 * Section 37 of the brief lists six requests and the capabilities each should
 * select. Those are not illustrations, they are the specification, so they are
 * transcribed here verbatim rather than paraphrased into something easier to
 * pass. If the router disagrees with one of them, the router is wrong.
 *
 * The assertions are written as "contains" plus "does not contain" on purpose.
 * Asserting the exact set would make every future capability a breaking change
 * to six tests; asserting only the positives would let the router select all
 * fifteen every time and stay green, which is the exact failure minimality
 * exists to prevent. The negatives are the half that has teeth.
 */

function intent(kind: IntentKind, confidence = 0.9): Intent {
  return { kind, confidence, because: 'test fixture' }
}

function reading(
  intents: readonly Intent[],
  over: Partial<Understanding> = {},
): Understanding {
  return {
    intents,
    goal: 'test goal',
    constraints: [],
    entities: [],
    language: 'en',
    topicShift: false,
    ambiguities: [],
    ...over,
  }
}

function ctx(over: Partial<RouteContext> = {}): RouteContext {
  return { ...NO_CONTEXT, ...over }
}

function expectSelected(
  plan: { selected: readonly Capability[] },
  present: readonly Capability[],
  absent: readonly Capability[],
) {
  for (const c of present) expect(plan.selected, `expected ${c}`).toContain(c)
  for (const c of absent) expect(plan.selected, `expected NOT ${c}`).not.toContain(c)
}

describe('the brief’s own routing examples', () => {
  it('"What is photosynthesis?" → knowledge + reasoning + communication', () => {
    const plan = route(reading([intent('explanation')]))
    expectSelected(
      plan,
      ['knowledge', 'reason', 'communicate'],
      // The whole point. A settled definition must not reach for the web, the
      // learner model, or the tool layer.
      ['search', 'learning', 'tools', 'memory-read', 'act', 'plan'],
    )
  })

  it('"What’s the latest JEE syllabus?" → search + verification + communication', () => {
    const plan = route(reading([intent('research')]), ctx({ freshnessSensitive: true }))
    expectSelected(plan, ['search', 'verify', 'communicate'], ['learning'])
  })

  it('"Remember that I struggle with integration." → memory write', () => {
    const plan = route(reading([intent('memory-write')]))
    expectSelected(
      plan,
      ['memory-write', 'communicate'],
      // Storing a fact is not an occasion to teach, search, or verify.
      ['search', 'learning', 'verify', 'reason', 'knowledge'],
    )
  })

  it('"What were we doing yesterday?" → memory retrieval + task continuity', () => {
    const plan = route(reading([intent('memory-read')]), ctx({ hasOpenTask: true }))
    expectSelected(plan, ['memory-read', 'communicate'], ['search', 'learning'])
  })

  it('"Fix this Python error." → code + reasoning + tools + verification', () => {
    const plan = route(
      reading([intent('troubleshooting'), intent('coding', 0.8)]),
      ctx({ hasCode: true }),
    )
    expectSelected(plan, ['code', 'reason', 'tools', 'verify', 'communicate'], ['learning'])
  })

  it('"Teach me rotational motion." → general + learning + communication', () => {
    const plan = route(reading([intent('learning')]))
    expectSelected(
      plan,
      // "general AI + learning intelligence + communication": the general
      // substrate still runs. Learning is layered ON it, not instead of it.
      ['knowledge', 'reason', 'learning', 'memory-read', 'communicate'],
      ['search', 'act'],
    )
  })
})

describe('the learning layer is a capability, not a cage', () => {
  it('leaves learning OFF for a request unrelated to education', () => {
    /* The brief's closing requirement: "Tell me something unrelated to
       education" must not become a lesson. */
    const plan = route(reading([intent('conversation')]))
    expect(plan.selected).not.toContain('learning')
    expect(plan.rejected['learning']).toBeTruthy()
  })

  it.each<IntentKind>([
    'information', 'explanation', 'action', 'research', 'calculation',
    'comparison', 'recommendation', 'troubleshooting', 'planning', 'coding',
    'conversation', 'memory-write', 'memory-read', 'continuation', 'correction',
  ])('leaves learning OFF for intent %s', (kind) => {
    expect(route(reading([intent(kind)])).selected).not.toContain('learning')
  })

  it('turns learning ON only for the learning intent', () => {
    expect(route(reading([intent('learning')])).selected).toContain('learning')
  })
})

describe('minimality', () => {
  it('selects almost nothing for small talk', () => {
    const plan = route(reading([intent('conversation')]))
    /* A greeting that wakes six subsystems is the failure this router exists
       to prevent. Communication alone is the correct answer. */
    expect(plan.selected).toEqual(['communicate'])
  })

  it('never selects every capability for any single-intent request', () => {
    const all: IntentKind[] = [
      'information', 'explanation', 'action', 'research', 'calculation',
      'comparison', 'recommendation', 'troubleshooting', 'planning', 'coding',
      'learning', 'conversation', 'memory-write', 'memory-read',
      'continuation', 'correction',
    ]
    for (const kind of all) {
      const plan = route(reading([intent(kind)]))
      expect(plan.selected.length, `${kind} woke everything`).toBeLessThan(12)
    }
  })

  it('records a reason for every selection and every rejection', () => {
    const plan = route(reading([intent('explanation')]))
    for (const c of plan.selected) {
      expect(plan.rationale[c], `${c} selected with no reason`).toBeTruthy()
    }
    for (const [c, why] of Object.entries(plan.rejected)) {
      expect(why, `${c} rejected with no reason`).toBeTruthy()
    }
  })

  it('never both selects and rejects the same capability', () => {
    /* A ledger that contradicts itself makes `rejected` unreadable, and
       `rejected` is the only artifact that makes an absence debuggable. */
    const plan = route(
      reading([intent('learning'), intent('calculation')]),
      ctx({ hasComputation: true, memoryHits: 2 }),
    )
    for (const c of plan.selected) expect(plan.rejected).not.toHaveProperty(c)
  })
})

describe('search is chosen on freshness, not on curiosity', () => {
  it('does not search a settled question', () => {
    const plan = route(reading([intent('information')]))
    expect(plan.selected).not.toContain('search')
    expect(plan.rejected['search']).toBe('the answer does not change with time')
  })

  it('searches when the answer moves with time', () => {
    const plan = route(reading([intent('information')]), ctx({ freshnessSensitive: true }))
    expect(plan.selected).toContain('search')
  })

  it('always verifies a searched answer', () => {
    /* An uncited claim laundered through a search that nothing checked is
       worse than no search: it arrives wearing authority. */
    const plan = route(reading([intent('research')]))
    expect(plan.selected).toContain('verify')
  })
})

describe('calculation is executed, never estimated', () => {
  it('selects calculate and verify whenever arithmetic is present', () => {
    const plan = route(reading([intent('information')]), ctx({ hasComputation: true }))
    expect(plan.selected).toContain('calculate')
    expect(plan.selected).toContain('verify')
  })

  it('does not select calculate for a question that merely mentions numbers', () => {
    const plan = route(reading([intent('explanation')]))
    expect(plan.selected).not.toContain('calculate')
  })
})

describe('asking', () => {
  it('asks when the request is loose AND no reading is confident', () => {
    const plan = route(
      reading([intent('information', 0.3)], {
        ambiguities: [{ what: '"it" could be either file', blocking: false }],
      }),
    )
    expect(plan.selected).toContain('ask')
  })

  it('does NOT ask when loose but one reading is clearly intended', () => {
    /* Asking about every ambiguity is its own failure mode --- the agent that
       cannot proceed without a clarifying question is not being careful, it is
       being unusable. */
    const plan = route(
      reading([intent('information', 0.95)], {
        ambiguities: [{ what: '"it" is slightly loose', blocking: false }],
      }),
    )
    expect(plan.selected).not.toContain('ask')
  })

  it('asks on a BLOCKING ambiguity however confident the intent is', () => {
    /* THE BUG THIS SPLIT FIXED. "fix it" with nothing named scores a
       confident troubleshooting intent, and an ask-rule gated on intent
       confidence lets it straight through to act on a referent that does not
       exist. Certainty about the verb is not certainty about the noun. */
    const plan = route(
      reading([intent('troubleshooting', 0.95)], {
        ambiguities: [{ what: '"it" refers to something not yet named', blocking: true }],
      }),
    )
    expect(plan.selected).toContain('ask')
    expect(plan.rationale['ask']).toContain('cannot proceed')
  })

  it('does not ask when the request is clear', () => {
    expect(route(reading([intent('information')])).selected).not.toContain('ask')
  })
})

describe('capability ordering', () => {
  it('loads memory before reasoning and communicates last', () => {
    const plan = route(
      reading([intent('learning'), intent('calculation')]),
      ctx({ memoryHits: 3, hasComputation: true }),
    )
    const at = (c: Capability) => plan.selected.indexOf(c)
    expect(at('memory-read')).toBeLessThan(at('reason'))
    expect(at('calculate')).toBeLessThan(at('verify'))
    expect(at('communicate')).toBe(plan.selected.length - 1)
  })
})
