/*
 * WHAT A PERSON TYPED, AND WHAT THEY WANTED BACK.
 *
 * Every case below is a sentence somebody would actually type into a box that
 * says "Teach me anything…". None of them is a synthetic string built to match
 * a regex, because a classifier tested only against its own patterns measures
 * the patterns and not the reading.
 *
 * The ambiguous ones are the point. Four of these match two readings at once,
 * and `intent.ts` records which wins and why; the tests below are that argument
 * made executable, so reordering the readings breaks a test rather than quietly
 * changing what every learner is handed.
 */
import { describe, it, expect } from 'vitest'
import { ASKS, readTheAsk, type Ask } from './intent'
import { AXES } from './route'
import { conceptIssues, conceptRequest } from './concept'
import { BlockRole } from '../spec/roles'

const asked = (question: string): Ask => readTheAsk(question).ask

describe('the ask is read from what they typed', () => {
  it('treats a plain topic as something to teach', () => {
    expect(asked('photosynthesis')).toBe('teach')
    expect(asked('explain how a fridge works')).toBe('teach')
    expect(asked('teach me about the french revolution')).toBe('teach')
  })

  it('reads "what is X" as a request for the thing itself', () => {
    expect(asked('what is a logarithm')).toBe('define')
    expect(asked('What is inflation?')).toBe('define')
    expect(asked('define osmosis')).toBe('define')
    expect(asked('meaning of entropy')).toBe('define')
  })

  it('reads a request for an instance', () => {
    expect(asked('give me an example of a metaphor')).toBe('example')
    expect(asked('show me one worked integration')).toBe('example')
    expect(asked('examples of covalent bonds')).toBe('example')
  })

  it('reads a request to be tested', () => {
    expect(asked('quiz me on tenses')).toBe('practice')
    expect(asked('give me some questions on trigonometry')).toBe('practice')
    expect(asked('practice problems for balancing equations')).toBe('practice')
    expect(asked('let me practise integration')).toBe('practice')
  })

  it('does not read "in practice" as a request to be tested', () => {
    /* The opposite request: they want the real-world case, not a test. The
       bare word `practice` matched this and told the model to keep the
       explanation to "the smaller half of this reply". */
    expect(asked('how does this work in practice')).toBe('teach')
    expect(asked('what happens in practice with real gases')).toBe('teach')
  })

  it('does not read a manner as a second subject', () => {
    /* "rather than" names one thing and a manner as often as it names two
       things, and `compare` is tested early enough to win the sentence. */
    expect(asked('explain entropy simply rather than technically')).toBe('teach')
  })

  it('reads a request for a mechanism', () => {
    expect(asked('why is the sky blue')).toBe('why')
    expect(asked('how come ice floats')).toBe('why')
    expect(asked('what causes tides')).toBe('why')
  })

  it('reads a request to put two things side by side', () => {
    expect(asked('difference between mass and weight')).toBe('compare')
    expect(asked('mitosis vs meiosis')).toBe('compare')
    expect(asked('is a virus the same as a bacterium')).toBe('compare')
  })

  it('reads a learner an explanation has already failed', () => {
    expect(asked("I don't get why the answer is 3")).toBe('stuck')
    expect(asked('im still confused about pointers')).toBe('stuck')
    expect(asked('this makes no sense')).toBe('stuck')
  })
})

describe('when two readings are possible, the one that answers the question wins', () => {
  /*
   * Each of these is a real sentence that matches two patterns. The comment on
   * `READINGS` in `intent.ts` states the resolution; this asserts it.
   */
  it('"what is the difference between X and Y" is a comparison, not a definition', () => {
    /* Answering with a definition of "difference" answers nothing anyone asked. */
    expect(asked('what is the difference between mass and weight')).toBe('compare')
  })

  it('"I do not understand what X is" is a stuck learner, not a definition request', () => {
    /* They have HAD the definition. That is what they are telling us. */
    expect(asked("I don't understand what a derivative is")).toBe('stuck')
  })

  it('"give me an example of why X" is a request for an instance', () => {
    expect(asked('give me an example of why redundancy matters')).toBe('example')
  })

  it('"why is X the same as Y" is a comparison', () => {
    /* Two things are named, and putting them side by side IS the answer. */
    expect(asked('why is a square the same as a rhombus')).toBe('compare')
  })
})

describe('the shape of the reply is steered, never its content', () => {
  it('gives every ask a directive', () => {
    for (const question of [
      'photosynthesis',
      'what is a logarithm',
      'quiz me on tenses',
      'why is the sky blue',
      'mitosis vs meiosis',
      'give me an example of a metaphor',
      "I don't get it",
    ]) {
      expect(readTheAsk(question).directive.length).toBeGreaterThan(40)
    }
  })

  it('never tells the model which way in to take', () => {
    /* THE ASK SHAPES THE REPLY; ROTATION OWNS THE OPENING. An earlier version
       let a comparison pin `contrast` and a "why" pin `problem-first`, and
       three route tests refused it: every first "why does X" would then have
       opened the same way for every learner for ever, which is the
       predictability `route.ts` exists to destroy. `Intent` carries no axis at
       all, and this asserts that it stays that way. */
    const anyAxis = new Set(AXES.map((axis) => axis.id))
    for (const question of [
      'what is a logarithm',
      'mitosis vs meiosis',
      'give me an example of a metaphor',
      'why is the sky blue',
      'photosynthesis',
    ]) {
      const intent = readTheAsk(question) as unknown as Record<string, unknown>
      for (const value of Object.values(intent)) {
        expect(typeof value === 'string' && anyAxis.has(value)).toBe(false)
      }
    }
  })
})

describe('it never refuses', () => {
  /* Invariant R3: every input gets a reply. A classifier that can fail is a
     teaching path that can turn a child away. */
  it('answers for the empty string, whitespace and punctuation', () => {
    for (const nothing of ['', '   ', '???', '\n\t']) {
      expect(readTheAsk(nothing).ask).toBe('teach')
      expect(readTheAsk(nothing).directive.length).toBeGreaterThan(40)
    }
  })

  it('answers for a question in no recognised shape', () => {
    expect(asked('the mitochondria thing my teacher mentioned on friday')).toBe('teach')
  })
})

/*
 * WHAT ACTUALLY REACHES THE MODEL.
 *
 * `readTheAsk` returning the right label proves nothing on its own -- the
 * classifier could be perfect and the prompt could ignore it, which is exactly
 * the shape of defect this repository keeps finding (a module measured at 5 of
 * 6 while the product called a different function). These assert the prompt
 * itself, which is the only artifact the model ever sees.
 */
describe('the ask reaches the prompt', () => {
  /*
   * THE MODEL PICKS, AND IS GIVEN EVERYTHING IT NEEDS TO PICK WITH.
   *
   * An earlier version put ONE directive in the prompt, chosen by the patterns
   * before the call. That made the regex's blind spots the product's blind
   * spots: "sir mujhe samajh nahi aaya" fell through to `teach` and the model
   * was told to give a lecture to somebody saying they were lost, with no way
   * to know better. Every reading is now in front of it, and the pattern's
   * guess is a hint it is told to override.
   */
  it('offers every reading, so a misread question can still be answered right', () => {
    const prompt = conceptRequest('sir mujhe samajh nahi aaya')
    for (const ask of ASKS) expect(prompt).toContain(`- ${ask}:`)
    /* Including the one the patterns missed. */
    expect(prompt).toContain('ALREADY been given an explanation')
  })

  it('says what the patterns guessed, and that it may be overridden', () => {
    const prompt = conceptRequest('quiz me on tenses')
    expect(prompt).toContain('reads this one as "practice"')
    expect(prompt).toContain('OVERRIDE IT whenever their actual words disagree')
  })

  it('tells the model how these learners actually type', () => {
    const prompt = conceptRequest('wat is fotosynthesis')
    expect(prompt).toContain('diff b/w')
    expect(prompt).toContain('samajh nahi')
    expect(prompt).toContain('Read what they MEAN')
  })

  it('lets a caller that has already decided pin the reading', () => {
    const prompt = conceptRequest('anything', [], [], 1, [], 'stuck')
    expect(prompt).toContain('reads this one as "stuck"')
  })
})

describe('every role the schema accepts is offered to the model', () => {
  /*
   * `spec/roles.ts` defines thirteen roles. The prompt named seven, under
   * "These are closed lists. A word outside them is refused" -- so six were
   * unreachable, including the three `teaching-patterns.md` added to the schema
   * on purpose so patterns 7, 9, 14-16, 19 and 20 could be expressed at all.
   */
  it('names all thirteen', () => {
    const prompt = conceptRequest('photosynthesis')
    for (const role of BlockRole.options) {
      expect(prompt, `the model is never told it may use role "${role}"`).toContain(role)
    }
  })

  it('names the roles the teaching patterns were added for', () => {
    const prompt = conceptRequest('photosynthesis')
    for (const role of ['notation', 'rule', 'restriction']) {
      expect(prompt).toContain(role)
    }
  })
})

describe('the model is shown what it already said', () => {
  const SAID_ONE = 'A logarithm is the missing exponent, and here is 2 cubed.'
  const SAID_TWO = 'Think of a bank balance doubling every year.'

  it('puts the previous wording in the prompt', () => {
    const prompt = conceptRequest('logarithms', [], [], 1, [SAID_ONE])
    expect(prompt).toContain('YOU HAVE ALREADY TAUGHT THIS LEARNER')
    expect(prompt).toContain(SAID_ONE)
  })

  it('says nothing about history on a first asking', () => {
    const prompt = conceptRequest('logarithms', [], [], 1, [])
    expect(prompt).not.toContain('YOU HAVE ALREADY TAUGHT THIS LEARNER')
  })

  it('keeps the newest tellings and drops the oldest', () => {
    /* Prompt budget is taken from the same reservation the reply is written
       out of, and a repeat resembles what was said RECENTLY. */
    const many = ['oldest one', 'second one', SAID_ONE, SAID_TWO]
    const prompt = conceptRequest('logarithms', [], [], 1, many)
    expect(prompt).toContain(SAID_TWO)
    expect(prompt).toContain(SAID_ONE)
    expect(prompt).not.toContain('oldest one')
  })

  it('clips one very long telling rather than spending the whole budget on it', () => {
    const huge = 'x'.repeat(5000)
    const prompt = conceptRequest('logarithms', [], [], 1, [huge])
    expect(prompt).not.toContain(huge)
    expect(prompt.length).toBeLessThan(20000)
  })
})

describe('the two rules the pattern document exists to keep', () => {
  it('states both, in every prompt', () => {
    const prompt = conceptRequest('photosynthesis')
    expect(prompt).toContain('Simplify the PATH, never the DESTINATION')
    expect(prompt).toContain('EARN every rule, or do not state it')
  })
})

describe('the gate judges the shape the model chose', () => {
  /*
   * THE LAST ASSUMPTION BROKEN: that every reply is a concept.
   *
   * `askMenu` lets the model read what the student wanted, and `conceptIssues`
   * then refused anything that was not a full lecture -- so "wat is 7x8" was
   * answered with a definition, a representation, a checkpoint and two
   * branches whatever the prompt said had been asked for.
   */
  const base = {
    id: 'x',
    question: 'What is a mole?',
    blocks: [
      {
        id: 'def',
        kind: 'prose',
        role: 'definition',
        emphasis: 'primary',
        tone: 'neutral',
        depth: 'core',
        body: 'A mole is a count of particles, fixed at 6.02 x 10^23.',
      },
    ],
    relations: [],
    checkpoint: 'How many particles are in two moles?',
    next: [
      { id: 'a', label: 'Why that particular number' },
      { id: 'b', label: 'Weighing a mole of a gas' },
    ],
  }

  const shownRules = (asked?: string) =>
    conceptIssues({ ...base, ...(asked === undefined ? {} : { asked }) } as never)
      .filter((issue) => issue.rule === 'nothing-is-shown')

  it('does not demand a diagram of a definition', () => {
    expect(shownRules('define')).toEqual([])
  })

  it('does not demand a diagram of a worked example', () => {
    expect(shownRules('example')).toEqual([])
  })

  it('still demands one of a learner who is stuck', () => {
    /* Someone lost is exactly who this rule was written for. */
    expect(shownRules('stuck')).toHaveLength(1)
  })

  it('still demands one for a mechanism, a comparison and practice', () => {
    for (const asked of ['why', 'compare', 'practice']) {
      expect(shownRules(asked), asked).toHaveLength(1)
    }
  })

  it('holds an undeclared reply to the strict reading', () => {
    /* A model that says nothing is judged exactly as every reply was judged
       before this existed. Nothing is loosened by silence. */
    expect(shownRules(undefined)).toHaveLength(1)
    expect(shownRules('teach')).toHaveLength(1)
  })

  it('is not fooled by casing or stray spaces in the declaration', () => {
    expect(shownRules('  Define ')).toEqual([])
  })

  it('asks the model to declare which shape it chose', () => {
    const prompt = conceptRequest('what is a mole')
    expect(prompt).toContain('"asked" is which of the readings above you chose')
    for (const ask of ASKS) expect(prompt).toContain(ask)
  })
})

describe('a declaration the model got slightly wrong', () => {
  const withAsked = (asked: string) =>
    conceptIssues({
      id: 'x',
      question: 'What is a mole?',
      blocks: [
        {
          id: 'def',
          kind: 'prose',
          role: 'definition',
          emphasis: 'primary',
          tone: 'neutral',
          depth: 'core',
          body: 'A mole is a fixed count of particles.',
        },
      ],
      relations: [],
      checkpoint: 'How many particles are in two moles?',
      next: [
        { id: 'a', label: 'Why that number' },
        { id: 'b', label: 'Weighing a mole of gas' },
      ],
      asked,
    } as never)

  it('says so, instead of silently refusing the answer for showing nothing', () => {
    /* "definition" for `define` used to fall through to the strict reading, so
       a good definition was refused for having no diagram and nothing said the
       one-word mismatch was why. */
    const issues = withAsked('definition')
    expect(issues.map((i) => i.rule)).toContain('unreadable-ask')
    expect(issues.find((i) => i.rule === 'unreadable-ask')?.message).toContain('define')
  })

  it('still holds it to the strict reading, so nothing is loosened by a typo', () => {
    expect(withAsked('definition').map((i) => i.rule)).toContain('nothing-is-shown')
  })

  it('says nothing when the word is right', () => {
    expect(withAsked('define').map((i) => i.rule)).not.toContain('unreadable-ask')
    expect(withAsked('define').map((i) => i.rule)).not.toContain('nothing-is-shown')
  })

  it('is a teaching issue, so a good answer can still be salvaged from it', () => {
    /* A `rule` is what `deliverable` requires before it will rescue anything.
       A vocabulary slip must never cost a learner the explanation. */
    for (const issue of withAsked('defining')) expect(issue.rule).toBeDefined()
  })
})

describe('the menu is paid for where it can help, and only there', () => {
  /*
   * MEASURED: the full menu is 477 of the prompt's 1,778 tokens. It exists so
   * the MODEL can overrule a pattern check that got the ask wrong, and it earns
   * that on the questions these learners actually type. It earns nothing on a
   * question the patterns already read correctly.
   */
  const tok = (s: string) => Math.round(s.length / 4)

  it('spends the full menu on a question the patterns could not read', () => {
    /* The case it was bought for. Nothing is taken away from it. */
    const prompt = conceptRequest('sir mujhe samajh nahi aaya')
    for (const ask of ASKS) expect(prompt).toContain(`- ${ask}:`)
    expect(prompt).toContain('Read what they MEAN')
  })

  it('spends it on a bare topic too, because that is the same fallback', () => {
    const prompt = conceptRequest('photosynthesis')
    for (const ask of ASKS) expect(prompt).toContain(`- ${ask}:`)
  })

  it('does not spend it on a question the patterns already read', () => {
    const prompt = conceptRequest('quiz me on tenses')
    expect(prompt).toContain('They asked to PRACTISE, not to read.')
    /* The other six are named so the model can still switch... */
    for (const ask of ASKS) expect(prompt).toContain(ask)
    /* ...but not explained. That is where the tokens went. */
    expect(prompt).not.toContain('- compare: They asked about TWO things.')
  })

  it('still lets the model overrule a match', () => {
    /* Cheapness must not cost the override. A learner who typed something the
       patterns misread has to be reachable from the short form too. */
    const prompt = conceptRequest('quiz me on tenses')
    expect(prompt).toContain('OVERRIDE IT whenever their actual words disagree')
    expect(prompt).toContain('Read what they MEAN')
  })

  it('costs materially less on a read question than on an unread one', () => {
    /* The saving is the point, so it is asserted rather than described. */
    const read = tok(conceptRequest('quiz me on tenses'))
    const unread = tok(conceptRequest('sir mujhe samajh nahi aaya'))
    expect(read).toBeLessThan(unread - 200)
  })
})

describe('the unchanging half of the prompt comes first', () => {
  /*
   * WHY THE ORDER IS A TESTED PROPERTY AND NOT A STYLE CHOICE.
   *
   * Gemini, Anthropic and DeepSeek all discount a repeated PREFIX -- the
   * leading run identical to the previous request is billed at a fraction. It
   * only pays if the identical part LEADS.
   *
   * MEASURED before the reordering: two ordinary requests shared 64 characters,
   * 16 tokens of 1,735, because the grounding, question, ask menu and route all
   * came first and all vary. The ~800 tokens of rules and legal values behind
   * them could never match anything. After: 806 shared tokens.
   *
   * A future edit that moves a varying line above the static block would undo
   * that silently and nothing else would notice, so it is asserted here.
   */
  const sharedPrefix = (a: string, b: string): number => {
    let i = 0
    while (i < a.length && i < b.length && a[i] === b[i]) i += 1
    return i
  }

  it('shares most of the prompt between two unrelated requests', () => {
    const a = conceptRequest('photosynthesis', [], [], 1, [])
    const b = conceptRequest('logarithms', [], ['contrast'], 9, ['a prior telling'])

    /* Roughly 800 tokens. Asserted well below the measurement so a small
       wording change does not fail it, and well above the 16 it used to be. */
    expect(sharedPrefix(a, b)).toBeGreaterThan(2400)
  })

  it('keeps the rules and the legal values inside that shared part', () => {
    const a = conceptRequest('photosynthesis', [], [], 1, [])
    const b = conceptRequest('quiz me on tenses', [], [], 3, [])
    const shared = a.slice(0, sharedPrefix(a, b))

    expect(shared).toContain('LEGAL VALUES')
    expect(shared).toContain('Rules your reply must obey')
    expect(shared).toContain('Simplify the PATH, never the DESTINATION')
    expect(shared).toContain('IDS MUST MATCH')
  })

  it('still ends with what varies, so the question is read last', () => {
    const prompt = conceptRequest('photosynthesis', [], [], 1, [])
    expect(prompt.indexOf('LEGAL VALUES')).toBeLessThan(prompt.indexOf('photosynthesis'))
  })
})
