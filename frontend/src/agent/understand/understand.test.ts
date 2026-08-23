import { describe, expect, it } from 'vitest'

import type { Capability, IntentKind, Turn } from '../kernel/contracts'
import { NO_CONTEXT, route } from '../kernel/router'
import {
  detectLanguage,
  extractEntities,
  NEW_CONVERSATION,
  resolveReferences,
  signals,
  understand,
  type Conversation,
} from './understand'

/**
 * THE FOURTEEN PROMPTS FROM "FINAL OUTCOME" ARE THE ACCEPTANCE SUITE.
 *
 * The brief closes with a list of fourteen requests the finished system must
 * handle "without becoming confused about its identity as a learning
 * product". That last clause is the hard part and it is what most of the
 * negative assertions below are checking: the system may not answer "what is
 * inflation" by teaching a lesson, and it may not answer "tell me something
 * unrelated to education" at all if the learning layer switched on.
 *
 * Each case asserts the reading AND the resulting capability set, because
 * either alone is insufficient --- a correct intent that routes wrongly is
 * still a wrong system, and a lucky route from a wrong reading is a bug
 * waiting for a rephrasing.
 */

function ask(text: string, ...extra: Turn['parts']): Turn {
  return { parts: [{ modality: 'text', content: text }, ...extra], at: '2026-08-24T00:00:00Z' }
}

/** understand -> signals -> route, the real path. */
function pipeline(text: string, convo: Conversation = NEW_CONVERSATION, extra: Partial<typeof NO_CONTEXT> = {}) {
  const turn = ask(text)
  const u = understand(turn, convo)
  const plan = route(u, { ...NO_CONTEXT, ...signals(turn), ...extra })
  return { u, plan, top: u.intents[0]?.kind }
}

function expectCaps(selected: readonly Capability[], present: readonly Capability[], absent: readonly Capability[]) {
  for (const c of present) expect(selected, `expected ${c} in [${selected}]`).toContain(c)
  for (const c of absent) expect(selected, `expected NOT ${c} in [${selected}]`).not.toContain(c)
}

describe('final outcome: the fourteen prompts', () => {
  it('"What is inflation?" is answered, not taught', () => {
    const { plan, top } = pipeline('What is inflation?')
    expect(top).toBe('explanation')
    expectCaps(plan.selected, ['knowledge', 'reason', 'communicate'], ['learning', 'search', 'act'])
  })

  it('"Search the latest inflation data." searches and verifies', () => {
    const { plan, u } = pipeline('Search the latest inflation data.')
    expect(u.intents.map((i) => i.kind)).toContain('research')
    expectCaps(plan.selected, ['search', 'verify', 'communicate'], ['learning'])
  })

  it('"Explain it like I\'m new to economics." is an explanation, and resolves "it"', () => {
    const convo: Conversation = {
      entities: [{ id: 'inflation', label: 'inflation', kind: 'term', mentions: [0] }],
      topic: 'inflation',
      turnIndex: 1,
    }
    const { plan, u } = pipeline("Explain it like I'm new to economics.", convo)
    expect(u.intents.map((i) => i.kind)).toContain('explanation')
    expect(u.entities.map((e) => e.id)).toContain('inflation')
    expect(u.ambiguities).toEqual([])
    expectCaps(plan.selected, ['knowledge', 'reason', 'communicate'], ['search'])
  })

  it('"Remember that I struggle with percentages." writes memory and nothing else', () => {
    const { plan, top } = pipeline('Remember that I struggle with percentages.')
    expect(top).toBe('memory-write')
    expectCaps(plan.selected, ['memory-write', 'communicate'], ['search', 'learning', 'act', 'verify'])
  })

  it('"Compare India\'s inflation with the US." compares', () => {
    const { plan, u } = pipeline("Compare India's inflation with the US.")
    expect(u.intents.map((i) => i.kind)).toContain('comparison')
    expectCaps(plan.selected, ['knowledge', 'reason', 'communicate'], ['learning'])
  })

  it('"Read this PDF and summarize it." selects files', () => {
    const turn = ask('Read this PDF and summarize it.', {
      modality: 'document',
      content: 'JVBERi0=',
      mediaType: 'application/pdf',
      name: 'report.pdf',
    })
    const u = understand(turn)
    const plan = route(u, { ...NO_CONTEXT, ...signals(turn) })
    expectCaps(plan.selected, ['files', 'tools', 'communicate'], ['learning'])
  })

  it('"Calculate this." computes rather than estimates, and verifies', () => {
    const { plan, u } = pipeline('Calculate 17.5% of 2400.')
    expect(u.intents.map((i) => i.kind)).toContain('calculation')
    expectCaps(plan.selected, ['calculate', 'tools', 'verify', 'communicate'], ['learning'])
  })

  it('"Write Python code." codes and verifies', () => {
    const { plan, u } = pipeline('Write Python code to parse a CSV.')
    expect(u.intents.map((i) => i.kind)).toContain('coding')
    expectCaps(plan.selected, ['code', 'tools', 'verify', 'reason', 'communicate'], ['learning'])
  })

  it('"Why is my code failing?" troubleshoots', () => {
    const { plan, u } = pipeline('Why is my code failing?')
    expect(u.intents.map((i) => i.kind)).toContain('troubleshooting')
    expectCaps(plan.selected, ['code', 'reason', 'verify', 'communicate'], ['learning'])
  })

  it('"Plan my JEE revision." plans', () => {
    const { plan, u } = pipeline('Plan my JEE revision.')
    expect(u.intents.map((i) => i.kind)).toContain('planning')
    expectCaps(plan.selected, ['plan', 'reason', 'communicate'], [])
  })

  it('"Continue yesterday\'s task." reads memory and resumes', () => {
    const { plan, u } = pipeline("Continue yesterday's task.", NEW_CONVERSATION, { hasOpenTask: true })
    const kinds = u.intents.map((i) => i.kind)
    expect(kinds.some((k) => k === 'continuation' || k === 'memory-read')).toBe(true)
    expectCaps(plan.selected, ['memory-read', 'communicate'], ['learning', 'search'])
  })

  it('"What should I learn next?" is the learning layer’s job', () => {
    const { plan, u } = pipeline('What should I learn next?')
    expect(u.intents.map((i) => i.kind)).toContain('learning')
    expectCaps(plan.selected, ['learning', 'memory-read', 'reason', 'communicate'], ['search'])
  })

  it('"Why did I get this question wrong?" is learning, not generic troubleshooting', () => {
    const { plan, u } = pipeline('Why did I get this question wrong?')
    expect(u.intents.map((i) => i.kind)).toContain('learning')
    expectCaps(plan.selected, ['learning', 'memory-read', 'communicate'], [])
  })

  it('"Tell me something unrelated to education." does NOT wake the learning layer', () => {
    /* THE IDENTITY TEST. If this one fails, the product is a cage. */
    const { plan } = pipeline('Tell me something unrelated to education.')
    expectCaps(plan.selected, ['communicate'], ['learning'])
  })
})

describe('negation is read, not ignored', () => {
  it('"don\'t search for this" removes research despite the word "search"', () => {
    const { plan, u } = pipeline("Explain closures, but don't search for this.")
    expect(u.intents.map((i) => i.kind)).not.toContain('research')
    expect(plan.selected).not.toContain('search')
  })

  it('"don\'t teach me" removes learning despite "teach"', () => {
    const { plan } = pipeline("Don't teach me, just give me the answer.")
    expect(plan.selected).not.toContain('learning')
  })
})

describe('multiple intents in one request', () => {
  it('reads "search X and explain it simply" as both', () => {
    const { u } = pipeline('Search the latest RBI repo rate and explain it simply.')
    const kinds = u.intents.map((i) => i.kind)
    expect(kinds).toContain('research')
    expect(kinds).toContain('explanation')
  })

  it('never reports certainty from a single weak match', () => {
    /* A lone 3-weight hit out of 3 total evidence is not 100% confidence, and
       reporting it as such would make the `ask` rule unreachable. */
    const { u } = pipeline('tell me')
    expect(u.intents[0]?.confidence ?? 1).toBeLessThan(0.7)
  })
})

describe('language adaptation', () => {
  it.each([
    ['What is inflation?', 'en'],
    ['मुझे integration समझ नहीं आ रहा', 'hi'],
    ['mujhe integration samajh nahi aa raha hai', 'hi-Latn'],
    ['kya aap mujhe ye samjha sakte hain', 'hi-Latn'],
  ])('detects %s as %s', (text, lang) => {
    expect(detectLanguage(text)).toBe(lang)
  })

  it('does not call English Hinglish on one accidental marker', () => {
    expect(detectLanguage('The port of Hai Phong is in Vietnam')).toBe('en')
  })

  it('carries the detected language into the reading', () => {
    expect(understand(ask('mujhe ye samajh nahi aaya, batao')).language).toBe('hi-Latn')
  })
})

describe('reference resolution', () => {
  const carried = [
    { id: 'lifo', label: 'LIFO', kind: 'named', mentions: [0] },
    { id: 'fifo', label: 'FIFO', kind: 'named', mentions: [1] },
  ]

  it('resolves "the second one" by position', () => {
    const { resolved, ambiguities } = resolveReferences('explain the second one', carried)
    expect(resolved.map((e) => e.id)).toEqual(['fifo'])
    expect(ambiguities).toEqual([])
  })

  it('resolves "it" to the most recently mentioned entity', () => {
    const { resolved } = resolveReferences('explain it', carried)
    expect(resolved.map((e) => e.id)).toEqual(['fifo'])
  })

  it('reports ambiguity instead of guessing when mentions tie', () => {
    const tied = [
      { id: 'a', label: 'Alpha', kind: 'named', mentions: [2] },
      { id: 'b', label: 'Beta', kind: 'named', mentions: [2] },
    ]
    const { resolved, ambiguities } = resolveReferences('explain it', tied)
    expect(resolved).toEqual([])
    expect(ambiguities[0]?.what).toContain('Alpha or Beta')
  })

  it('reports ambiguity when nothing has been named yet', () => {
    const { ambiguities } = resolveReferences('explain it', [])
    expect(ambiguities).toHaveLength(1)
  })

  it('every ambiguity a failed resolution reports is BLOCKING', () => {
    /* This function only speaks up when resolution FAILED, so there is no
       such thing here as a soft reference ambiguity. If one ever becomes
       non-blocking, the router will quietly stop asking about referents it
       cannot find, and the symptom will be acting on the wrong thing. */
    for (const carried of [[], [
      { id: 'a', label: 'Alpha', kind: 'named', mentions: [2] },
      { id: 'b', label: 'Beta', kind: 'named', mentions: [2] },
    ]]) {
      for (const a of resolveReferences('explain it', carried).ambiguities) {
        expect(a.blocking).toBe(true)
      }
    }
  })

  it('an unresolvable reference makes the router ask', () => {
    /* End to end: the ambiguity must actually reach the routing decision,
       not merely be recorded and dropped. */
    const { plan } = pipeline('fix it')
    expect(plan.selected).toContain('ask')
  })
})

describe('topic tracking', () => {
  it('detects a topic change', () => {
    const convo: Conversation = {
      entities: [{ id: 'inflation', label: 'inflation', kind: 'term', mentions: [0] }],
      topic: 'inflation',
      turnIndex: 1,
    }
    expect(understand(ask('Who won the 1998 World Cup?'), convo).topicShift).toBe(true)
  })

  it('does not call a follow-up a topic change', () => {
    const convo: Conversation = {
      entities: [{ id: 'inflation', label: 'inflation', kind: 'term', mentions: [0] }],
      topic: 'inflation',
      turnIndex: 1,
    }
    expect(understand(ask('And how is inflation measured?'), convo).topicShift).toBe(false)
  })

  it('never calls the first turn a topic change', () => {
    expect(understand(ask('What is inflation?')).topicShift).toBe(false)
  })
})

describe('signals', () => {
  it('flags freshness only when the answer moves with time', () => {
    expect(signals(ask('what is the latest RBI repo rate')).freshnessSensitive).toBe(true)
    expect(signals(ask('what is photosynthesis')).freshnessSensitive).toBe(false)
  })

  it('flags computation from a bare expression with no verb', () => {
    expect(signals(ask('17.5% of 2400')).hasComputation).toBe(true)
  })

  it('flags code from a fence or a traceback', () => {
    expect(signals(ask('```py\nprint(1)\n```')).hasCode).toBe(true)
    expect(signals(ask('I get a TypeError on line 4')).hasCode).toBe(true)
  })

  it('flags attachments for any non-text part', () => {
    expect(signals(ask('look', { modality: 'image', content: 'x' })).hasAttachments).toBe(true)
    expect(signals(ask('look')).hasAttachments).toBe(false)
  })
})

describe('constraints are captured for verification to check against', () => {
  it('captures a length limit', () => {
    expect(understand(ask('Explain inflation in 3 sentences')).constraints.join()).toContain('3 sentences')
  })

  it('captures a prohibition', () => {
    expect(understand(ask('Explain it without using jargon')).constraints.join()).toContain('without')
  })

  it('captures a deadline', () => {
    expect(understand(ask('Plan my revision by next week')).constraints.join()).toContain('next week')
  })
})

describe('entities', () => {
  it('keeps quoted spans intact', () => {
    expect(extractEntities('open "final report.pdf" please', 0).map((e) => e.label)).toContain('final report.pdf')
  })

  it('does not treat stopwords as entities', () => {
    expect(extractEntities('what is the thing', 0).map((e) => e.id)).not.toContain('what')
  })
})

describe('the honest default', () => {
  it('treats an unparsed sentence as conversation, not as a lesson', () => {
    /* Guessing `explanation` here would manufacture teaching out of noise. */
    const { top } = pipeline('asdkjh qwe zxc')
    expect(top).toBe('conversation')
  })

  it.each<IntentKind>(['learning', 'research', 'act' as IntentKind])(
    'never invents %s from an unparsed sentence',
    (kind) => {
      const { u } = pipeline('asdkjh qwe zxc')
      expect(u.intents.map((i) => i.kind)).not.toContain(kind)
    },
  )
})
