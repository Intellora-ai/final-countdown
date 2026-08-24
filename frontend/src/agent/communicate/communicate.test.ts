import { describe, expect, it } from 'vitest'

import type { MemoryRecord, Personalization, Understanding, UserState } from '../kernel/contracts'
import { understand, type Conversation } from '../understand/understand'
import {
  chooseRepresentations,
  DEFAULT_PERSONALIZATION,
  needsDefining,
  personalize,
  planCommunication,
  readStructure,
  readUserState,
  type CommunicationInput,
} from './communicate'

const AT = '2026-08-24T00:00:00.000Z'
const read = (t: string, convo?: Conversation): Understanding =>
  understand({ parts: [{ modality: 'text', content: t }], at: AT }, convo)

const CALM: UserState = { confusion: 0, frustration: 0, urgency: 0, repeats: 0 }

function plan(over: Partial<CommunicationInput> & { understanding: Understanding }) {
  return planCommunication({
    content: '',
    personalization: DEFAULT_PERSONALIZATION,
    userState: CALM,
    ...over,
  })
}

const mem = (content: string, kind: MemoryRecord['kind'] = 'preference'): MemoryRecord => ({
  id: 'm', kind, content, createdAt: AT, updatedAt: AT, strength: 0.9, supersedes: [], source: 'user-stated',
})

describe('structure is read from shape, not from subject', () => {
  it('reads a comparison as comparative whatever the topic', () => {
    /* The same structural read must fire for LIFO vs FIFO, two countries, and
       two sorting algorithms. Asking "is this chemistry?" leads straight back
       to subject templates. */
    for (const t of ['Compare LIFO and FIFO', 'Compare India and US inflation', 'quicksort versus mergesort']) {
      expect(readStructure('', read(t)).comparative, t).toBe(true)
    }
  })

  it('reads a mechanism as causal', () => {
    expect(readStructure('Heating raises pressure because molecules move faster', read('why?')).causal).toBe(true)
  })

  it('reads a process as sequential', () => {
    expect(readStructure('First the bill is introduced, then it is debated, finally it is voted on', read('x')).sequential).toBe(true)
  })

  it('reads numbers over time as quantitative', () => {
    expect(readStructure('GDP grew 7.2 percent over time', read('x')).quantitative).toBe(true)
  })

  it('reads an equation as formal', () => {
    expect(readStructure('x = (-b ± √(b²-4ac)) / 2a', read('x')).formal).toBe(true)
  })

  it('takes the intent as structural evidence before content exists', () => {
    /* The representation has to be chosen BEFORE the answer is written, which
       is exactly when the content is empty. */
    expect(readStructure('', read('Compare LIFO and FIFO')).comparative).toBe(true)
    expect(readStructure('', read('Plan my revision')).sequential).toBe(true)
  })
})

describe('representation is chosen to preserve the structure', () => {
  it('chooses a comparison for two things held against each other', () => {
    const u = read('Compare LIFO and FIFO')
    const reps = chooseRepresentations(readStructure('', u), u)
    expect(reps[0]).toBe('comparison')
  })

  it('does NOT choose a table for a single fact', () => {
    /* A grid around one number is scaffolding with nothing to hold. */
    const u = read('What is inflation?')
    expect(chooseRepresentations(readStructure('', u), u)).toEqual(['prose'])
  })

  it('does NOT compare when the language is comparative but there is ONE subject', () => {
    /* THE TEST THAT ACTUALLY EXERCISES THE CARDINALITY GATE.
     *
     * The test above looks like it covers this and does not. "What is
     * inflation?" never sets `comparative`, so `s.comparative && plural`
     * short-circuits on the first term and the gate is never reached --- it
     * passes identically with the gate removed. A mutation run proved it:
     * flipping `cardinality >= 2` to `true` survived.
     *
     * This is the case that needs the gate. "Better" and "worse" are
     * comparative markers, so the structure reads as comparative, but there is
     * only one subject on the table. Without the gate that produces a
     * comparison of a thing against nothing. */
    const u = read('Is inflation better or worse now?')
    const s = readStructure('', u)
    expect(s.comparative, 'precondition: the structure must read as comparative').toBe(true)
    expect(s.cardinality, 'precondition: there must be fewer than two subjects').toBeLessThan(2)

    const reps = chooseRepresentations(s, u)
    expect(reps).not.toContain('comparison')
    expect(reps).not.toContain('table')
    expect(reps).not.toContain('matrix')
  })

  it('DOES compare once a second subject is on the table', () => {
    /* The other half of the gate: it must not be so tight that a genuine
       comparison is refused. Without this, deleting the feature entirely
       would also pass the test above. */
    const u = read('Compare LIFO and FIFO')
    const s = readStructure('', u)
    expect(s.cardinality).toBeGreaterThanOrEqual(2)
    expect(chooseRepresentations(s, u)).toContain('comparison')
  })

  it('chooses an equation for a derivation', () => {
    const u = read('Derive the quadratic formula')
    expect(chooseRepresentations(readStructure('x = (-b ± √(b²-4ac)) / 2a', u), u)).toContain('equation')
  })

  it('chooses a chart for a quantity over time', () => {
    const u = read('India GDP growth over time')
    expect(chooseRepresentations(readStructure('GDP grew 7.2 percent', u), u)).toContain('chart')
  })

  it('chooses a flow for a causal sequence', () => {
    const u = read('How does a bill become law')
    const s = readStructure('First introduced, then debated, therefore it becomes law', u)
    expect(chooseRepresentations(s, u)).toContain('flow')
  })

  it('chooses code for a coding request', () => {
    const u = read('Write Python code to parse a CSV')
    expect(chooseRepresentations(readStructure('', u), u)).toContain('code')
  })

  it('offers a worked example when someone is learning', () => {
    const u = read('Teach me rotational motion')
    expect(chooseRepresentations(readStructure('', u), u)).toContain('worked-example')
  })

  it('ALWAYS includes prose, and always last', () => {
    for (const t of ['What is inflation?', 'Compare LIFO and FIFO', 'Write Python code']) {
      const u = read(t)
      const reps = chooseRepresentations(readStructure('', u), u)
      expect(reps).toContain('prose')
      expect(reps[reps.length - 1]).toBe('prose')
    }
  })

  it('never emits a representation the canvas cannot draw', () => {
    /* The overlap with the canvas registry is deliberate. A representation
       chosen here that no renderer supports is a decision that silently
       degrades to prose at the last moment. */
    const drawable = new Set([
      'prose', 'bullets', 'table', 'comparison', 'equation', 'flow', 'timeline',
      'chart', 'tree', 'matrix', 'sequence', 'decision-tree', 'worked-example',
      'code', 'simulation',
    ])
    for (const t of ['Compare A and B and C', 'Plan my revision', 'Why is my code failing?', 'Derive the formula']) {
      const u = read(t)
      for (const r of chooseRepresentations(readStructure('a - b - c', u), u)) {
        expect(drawable.has(r), `${r} is not drawable`).toBe(true)
      }
    }
  })

  it('lets a stated preference reorder but not override sense', () => {
    /* Honouring a preference into nonsense is not personalisation. */
    const u = read('What is inflation?')
    const prefs: Personalization = { ...DEFAULT_PERSONALIZATION, preferredRepresentations: ['table'] }
    expect(chooseRepresentations(readStructure('', u), u, prefs)).toEqual(['prose'])
  })
})

describe('depth is decided, not defaulted', () => {
  it('keeps a greeting brief', () => {
    /* An essay in reply to "hi" is the failure everyone recognises and few
       systems prevent. */
    expect(plan({ understanding: read('hi') }).depth).toBe('brief')
  })

  it('keeps a bare fact brief', () => {
    expect(plan({ understanding: read('when was the RBI founded') }).depth).toBe('brief')
  })

  it('goes thorough for a mechanism', () => {
    const p = plan({ understanding: read('Why does heating a gas raise its pressure?'), content: 'because molecules move faster and therefore collide more' })
    expect(p.depth).toBe('thorough')
  })

  it('goes thorough when the user is confused', () => {
    const p = plan({ understanding: read("I'm confused, I don't get it"), userState: { ...CALM, confusion: 0.8 } })
    expect(p.depth).toBe('thorough')
  })

  it('goes BRIEF under time pressure even for a complex question', () => {
    const p = plan({
      understanding: read('Why is my build failing? urgent'),
      userState: { ...CALM, urgency: 0.9 },
    })
    expect(p.depth).toBe('brief')
    expect(p.omit.join(' ')).toContain('alternatives')
  })

  it('explains why it chose the depth', () => {
    expect(plan({ understanding: read('hi') }).because.length).toBeGreaterThan(10)
  })
})

describe('user state changes strategy, never tone', () => {
  it('detects confusion from wording', () => {
    expect(readUserState("I'm confused, I don't get it", []).confusion).toBeGreaterThan(0.5)
  })

  it('counts repeats from history, not politeness', () => {
    /* A third polite phrasing of the same question is still the third time. */
    const state = readUserState('explain inflation to me', ['explain inflation to me', 'explain inflation please'])
    expect(state.repeats).toBe(2)
  })

  it('CHANGES THE FRAMING after two failed explanations', () => {
    /* Repeating the same explanation longer is the classic failure. The third
       attempt has to come at it differently and say so. */
    const p = plan({
      understanding: read('explain inflation to me'),
      userState: { confusion: 0.5, frustration: 0.6, urgency: 0, repeats: 2 },
    })
    expect(p.leadWith).toContain('different framing')
    expect(p.because).toContain('did not land')
  })

  it('produces no sympathy phrasing anywhere in the plan', () => {
    /* "This should affect communication strategy, not become fake emotional
       performance." A user who has asked three times wants the answer. */
    const p = plan({
      understanding: read('this is wrong AGAIN'),
      userState: { confusion: 0.8, frustration: 0.9, urgency: 0, repeats: 3 },
    })
    const all = JSON.stringify(p).toLowerCase()
    for (const word of ['sorry', 'apolog', 'frustrat', 'i understand how', 'i know this is', 'unfortunately']) {
      expect(all, `plan contains sympathy word "${word}"`).not.toContain(word)
    }
  })

  it('detects urgency', () => {
    expect(readUserState('need this asap', []).urgency).toBeGreaterThan(0.5)
  })
})

describe('leading with the right thing', () => {
  it.each([
    ['Why is my code failing?', 'the cause'],
    ['Compare LIFO and FIFO', 'separates them'],
    ['Should I use Postgres or MySQL?', 'the recommendation'],
  ])('%s leads with %s', (text, expected) => {
    expect(plan({ understanding: read(text) }).leadWith).toContain(expected)
  })
})

describe('personalization is separate from memory', () => {
  it('turns a stored preference into a behaviour', () => {
    /* Memory: "what do I know about them". This: "how should I act". */
    expect(personalize([mem('I prefer short answers')], 'en').density).toBe('brief')
  })

  it('reads technical level from what they said about themselves', () => {
    expect(personalize([mem("I'm new to economics")], 'en').technicalLevel).toBe('novice')
    expect(personalize([mem('I already know basic algebra', 'mastery')], 'en').technicalLevel).toBe('expert')
  })

  it('picks up a preferred representation', () => {
    expect(personalize([mem('I like tables')], 'en').preferredRepresentations).toContain('table')
  })

  it('defaults to standard when memory says nothing', () => {
    expect(personalize([], 'en')).toEqual(DEFAULT_PERSONALIZATION)
  })
})

describe('terminology', () => {
  it('flags a term the answer introduced that the question did not', () => {
    /* A word the user typed is a word they have. A word only we introduced is
       one we owe them. */
    const u = read('What is inflation?')
    const defs = needsDefining('Inflation erodes purchasing power through monetary debasement', u, 'novice')
    expect(defs.join(' ')).toMatch(/purchasing|debasement|monetary/)
  })

  it('does NOT re-define a word the user already used', () => {
    const u = read('What is monetary debasement?')
    expect(needsDefining('Monetary debasement is a reduction in value', u, 'novice')).not.toContain('debasement')
  })

  it('defines NOTHING for an expert', () => {
    /* Defining "inflation" for an economist is as annoying as not defining it
       for a newcomer. */
    const u = read('What is inflation?')
    expect(needsDefining('Inflation erodes purchasing power through debasement', u, 'expert')).toEqual([])
  })

  it('skips concepts memory says they already hold', () => {
    const u = read('What is inflation?')
    const defs = needsDefining('Inflation erodes purchasing power', u, 'novice', ['purchasing power'])
    expect(defs).not.toContain('purchasing')
  })

  it('gives a novice more definitions than an intermediate', () => {
    const u = read('What is inflation?')
    const text = 'Inflation involves purchasing power monetary debasement stagflation deflationary spiralling'
    expect(needsDefining(text, u, 'novice').length).toBeGreaterThan(needsDefining(text, u, 'intermediate').length)
  })
})

describe('progressive disclosure is earned, not default', () => {
  it('is off for a one-line answer', () => {
    /* Applying it to a short reply turns an answer into a wizard. */
    expect(plan({ understanding: read('What is inflation?') }).progressive).toBe(false)
  })

  it('is on when teaching structured material', () => {
    const p = plan({
      understanding: read('Teach me how a bill becomes law'),
      content: 'First introduced, then debated, therefore it passes',
      teaching: true,
    })
    expect(p.progressive).toBe(true)
  })

  it('is off when the user is in a hurry, even while teaching', () => {
    const p = plan({
      understanding: read('Teach me how a bill becomes law urgently'),
      content: 'First introduced, then debated, therefore it passes',
      teaching: true,
      userState: { ...CALM, urgency: 0.9 },
    })
    expect(p.progressive).toBe(false)
  })
})

describe('language', () => {
  it('mirrors the user’s language', () => {
    expect(plan({ understanding: read('mujhe ye samajh nahi aaya, batao') }).language).toBe('hi-Latn')
  })

  it('falls back to the stored preference only when the user wrote English', () => {
    /* Answering Hinglish in English is a small rudeness. Answering English in
       Hinglish because of a stored preference is a larger one. */
    const hindiPref: Personalization = { ...DEFAULT_PERSONALIZATION, language: 'hi' }
    expect(plan({ understanding: read('What is inflation?'), personalization: hindiPref }).language).toBe('hi')
    expect(plan({ understanding: read('mujhe ye samajh nahi aaya batao'), personalization: hindiPref }).language).toBe('hi-Latn')
  })
})

describe('the plan carries no design values --- Four Laws', () => {
  it('contains no colour, size, spacing or position anywhere', () => {
    /* This layer chooses WHICH representation. The design system decides what
       it looks like; the layout grammar decides where it goes. There must be
       no field in which a pixel could be expressed. */
    const p = plan({
      understanding: read('Compare LIFO and FIFO in detail'),
      content: 'LIFO versus FIFO, 3 dimensions, 12 rows',
      teaching: true,
    })
    const serialized = JSON.stringify(p)
    expect(serialized).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(serialized).not.toMatch(/\brgba?\(|\bhsla?\(/i)
    expect(serialized).not.toMatch(/\b\d+(px|rem|em|pt)\b/)
    for (const key of ['x', 'y', 'top', 'left', 'width', 'height', 'color', 'colour', 'fontSize', 'padding', 'margin']) {
      expect(Object.keys(p)).not.toContain(key)
    }
  })
})
