/*
 * WHAT SHOULD HAPPEN NEXT, AND WHO GETS TO DECIDE IT.
 *
 * Two things are under test and they are deliberately separate:
 *
 *   the MODEL decides    -- given a real message from a real learner, does the
 *                           right thing come back, including for messages
 *                           nobody wrote a rule for
 *   the APP controls     -- when the decision cannot be carried out, does the
 *                           application override it, and does the learner still
 *                           end up somewhere
 *
 * The second half is the one that matters most. A model with autonomy is only
 * safe if the thing executing its decisions can say no.
 */
import { describe, expect, it, vi } from 'vitest'

import {
  ACTIONS,
  decideNext,
  fallbackDecision,
  namesASubject,
  permitted,
  subjectWords,
  type Situation,
} from './controller.ts'

const atTheDoor: Situation = { said: 'hi', told: [] }

const midLesson: Situation = {
  said: 'i dont get it',
  lesson: 'Logarithms',
  topic: 'Change of base',
  told: ['definition-first'],
}

/** A controller that answers with whatever JSON the test names. */
const says = (json: object) =>
  vi.fn(async (_system: string, _user: string) => JSON.stringify(json))

describe('the model decides what happens next', () => {
  it('turns a greeting into a lesson rather than a reply about greetings', async () => {
    const chat = says({ action: 'START_LESSON', target: 'logarithms', reason: 'they arrived', source_needed: true })
    const decision = await decideNext(chat, atTheDoor)

    expect(decision.action).toBe('START_LESSON')
    expect(decision.target).toBe('logarithms')
  })

  it('is given where the learner is, not the whole system', async () => {
    const chat = says({ action: 'EXPLAIN', target: 'change of base', reason: 'confused', source_needed: true })
    await decideNext(chat, midLesson)

    const situation = chat.mock.calls[0]![1]
    expect(situation).toContain('LESSON: Logarithms')
    expect(situation).toContain('TOPIC ON SCREEN: Change of base')
    expect(situation).toContain('ALREADY EXPLAINED THIS TOPIC 1 TIME(S)')
    expect(situation).toContain('STUDENT SAID: i dont get it')
    /* And NOT the schema, the gate, or the curriculum. */
    expect(situation).not.toContain('blocks')
    expect(situation.length).toBeLessThan(600)
  })

  it('offers exactly five actions, so the model generalises instead of matching', async () => {
    const chat = says({ action: 'PRACTICE', target: 'logarithms', reason: 'asked', source_needed: true })
    await decideNext(chat, midLesson)

    const system = chat.mock.calls[0]![0]
    for (const action of ACTIONS) expect(system).toContain(action)
    expect(ACTIONS).toHaveLength(5)
  })

  it('tells it how these learners actually type', async () => {
    const chat = says({ action: 'EXPLAIN', target: 'x', reason: 'y', source_needed: true })
    await decideNext(chat, midLesson)

    const system = chat.mock.calls[0]![0]
    expect(system).toContain('samajh nahi aaya')
    expect(system).toContain('Read what they MEAN')
  })

  it('reads a decision out of a reply that is not only JSON', async () => {
    /* Models put prose around JSON. Refusing that would throw away a correct
       decision over punctuation. */
    const chat = vi.fn(async () => 'Sure! {"action":"ANSWER","target":"7x8","reason":"a sum","source_needed":false} hope that helps')
    const decision = await decideNext(chat, { said: 'what is 7x8', told: [] })

    expect(decision.action).toBe('ANSWER')
    expect(decision.sourceNeeded).toBe(false)
  })

  it('never turns their raw message into the subject to be taught', async () => {
    /*
     * THIS ASSERTED THE OPPOSITE, AND THE OPPOSITE WAS A BUG.
     *
     * When the controller named no target the app substituted `said`, and the
     * tutor taught it. MEASURED against a real model on this build:
     *
     *   "hi"                  -> lesson: "How do you say 'hi'?"
     *   "solve this"          -> lesson: "How do you find the atomic number..."
     *   "give me questions"   -> lesson: "How can you tell if a question is..."
     *
     * Each one taught the phrase instead of a subject. An empty target is not a
     * problem -- `permitted` turns it into a question, which is the honest reply
     * to somebody who has not named anything yet.
     */
    const chat = says({ action: 'START_LESSON', reason: 'they asked', source_needed: true })
    const decision = await decideNext(chat, { said: 'teach me osmosis', told: [] })

    expect(decision.target).toBe('')
  })

  it('uses the topic on screen when there is one and none was named', async () => {
    const chat = says({ action: 'EXPLAIN', reason: 'confused', source_needed: true })
    const decision = await decideNext(chat, midLesson)

    expect(decision.target).toBe('Change of base')
  })

  it('tells the model not to put a greeting in the target', async () => {
    const chat = says({ action: 'ASK_CLARIFICATION', target: '', reason: 'nothing named', source_needed: false })
    await decideNext(chat, atTheDoor)

    const system = chat.mock.calls[0]![0]
    expect(system).toContain('THE TARGET MUST BE A SUBJECT')
    expect(system).toContain('there is nothing to start')
  })
})

describe('a controller that cannot answer never stops the learner', () => {
  /* Invariant R3: every input gets a reply. A controller outage costs judgement
     and must never cost an answer. */
  it('decides anyway when the model is unreachable', async () => {
    const chat = vi.fn(async () => {
      throw new Error('the model could not be reached (429 ...)')
    })
    const decision = await decideNext(chat, atTheDoor)

    expect(ACTIONS).toContain(decision.action)
    expect(decision.reason).toContain('could not be reached')
  })

  it('decides anyway when the reply is not readable', async () => {
    for (const junk of ['', 'no idea', '{}', '{"action":"DANCE"}', '{"action":']) {
      const decision = await decideNext(vi.fn(async () => junk), atTheDoor)
      expect(ACTIONS).toContain(decision.action)
    }
  })

  it('teaches a newcomer and carries on with someone mid-lesson', () => {
    expect(fallbackDecision(atTheDoor).action).toBe('START_LESSON')
    expect(fallbackDecision(midLesson).action).toBe('EXPLAIN')
  })
})

describe('the application decides what a decision is allowed to mean', () => {
  it('lets a good decision through untouched', () => {
    const decision = { action: 'START_LESSON' as const, target: 'logarithms', reason: '', sourceNeeded: true, subjectNamed: true }
    const verdict = permitted(decision, atTheDoor)

    expect(verdict.ok).toBe(true)
  })

  it('refuses an action with nothing to act on, and asks instead', () => {
    /* A blank target would send the tutor to write a lesson about "". Asking
       costs no authoring call at all. */
    const verdict = permitted(
      { action: 'START_LESSON', target: '   ', reason: '', sourceNeeded: true, subjectNamed: false },
      { said: '', told: [] },
    )

    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.instead.action).toBe('ASK_CLARIFICATION')
  })

  it('will not explain again when nothing was explained the first time', () => {
    /* "I don't get it" from someone who has been told nothing is read
       correctly and reaches for the wrong action. `told` is the app's fact,
       not the model's, so the correction belongs to the app. */
    const verdict = permitted(
      { action: 'EXPLAIN', target: 'change of base', reason: 'confused', sourceNeeded: true, subjectNamed: true },
      { said: 'i dont get it', lesson: 'Logarithms', told: [] },
    )

    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.instead.action).toBe('START_LESSON')
  })

  it('does allow EXPLAIN once something has been explained', () => {
    expect(
      permitted(
        { action: 'EXPLAIN', target: 'change of base', reason: '', sourceNeeded: true, subjectNamed: true },
        midLesson,
      ).ok,
    ).toBe(true)
  })

  it('will not ask a second clarifying question in a row', () => {
    /* They answered, and were asked again. That is a loop the learner cannot
       get out of. */
    const verdict = permitted(
      { action: 'ASK_CLARIFICATION', target: '', reason: 'unclear', sourceNeeded: false, subjectNamed: true },
      { said: 'the base thing', lesson: 'Logarithms', told: ['definition-first'] },
    )

    expect(verdict.ok).toBe(false)
    if (!verdict.ok) {
      expect(verdict.instead.action).toBe('EXPLAIN')
      expect(verdict.instead.target).toBe('the base thing')
    }
  })

  it('does allow a first clarifying question', () => {
    expect(
      permitted(
        { action: 'ASK_CLARIFICATION', target: '', reason: 'unclear', sourceNeeded: false, subjectNamed: true },
        { said: 'idk', told: [] },
      ).ok,
    ).toBe(true)
  })

  it('never returns a dead end, whatever it refuses', () => {
    /* Invariant R3 at the level of actions: every decision leads somewhere. */
    const awkward: { decision: Parameters<typeof permitted>[0]; situation: Situation }[] = [
      { decision: { action: 'START_LESSON', target: '', reason: '', sourceNeeded: true, subjectNamed: true }, situation: { said: '', told: [] } },
      { decision: { action: 'EXPLAIN', target: 'x', reason: '', sourceNeeded: true, subjectNamed: true }, situation: { said: 'x', told: [] } },
      { decision: { action: 'ASK_CLARIFICATION', target: '', reason: '', sourceNeeded: false, subjectNamed: true }, situation: { said: 'y', told: ['a'] } },
      { decision: { action: 'PRACTICE', target: '', reason: '', sourceNeeded: true, subjectNamed: true }, situation: { said: '', told: ['a'] } },
    ]

    for (const { decision, situation } of awkward) {
      const verdict = permitted(decision, situation)
      const chosen = verdict.ok ? verdict.decision : verdict.instead
      expect(ACTIONS).toContain(chosen.action)
      /* And a refusal always says why, so a wrong override can be read back. */
      if (!verdict.ok) expect(verdict.why.length).toBeGreaterThan(10)
    }
  })
})

describe('the cheapest call is the one not made', () => {
  /*
   * THE ORDER OF TWO THINGS IN `conceptFor`, ASSERTED HERE BECAUSE IT IS A
   * PROPERTY OF THE SYSTEM AND NOT OF THIS FILE.
   *
   * The controller was placed ahead of the shared lesson shelf, and that undid
   * the shelf: a question whose answer was already stored -- previously zero
   * tokens and 2.7ms -- started costing a decision call every time. Nothing the
   * controller can decide changes whether a lesson this learner has never seen
   * is worth serving, so the lookup goes first.
   *
   * Asserted through the handler rather than by reading `handler.ts`, so a
   * later reordering fails a test instead of quietly costing money.
   */
  it('never asks the tutor when the shelf already has an unseen lesson', async () => {
    const { createHandler } = await import('./handler.ts')
    const { writtenLessons } = await import('./memory/lessons.ts')

    const rows = new Map<string, string>()
    const store = {
      read: (k: string) => rows.get(k),
      write: (k: string, v: string) => void rows.set(k, v),
      update: (k: string, _at: string, change: (c: string | undefined) => string) =>
        void rows.set(k, change(rows.get(k))),
    } as never

    const lessons = writtenLessons(store, 'r1')
    lessons.keep('photosynthesis', {
      route: 'contrast',
      lesson: { id: 'p', question: 'What is photosynthesis?', blocks: [{ id: 'a', body: 'x' }] },
      checkpoint: 'what did the leaf take in?',
      next: [{ id: 'a', label: 'deeper' }],
      at: '2026-09-01T10:00:00.000Z',
    })

    /* The controller answers; the tutor must never be reached. */
    const chat = vi.fn(async () =>
      JSON.stringify({
        action: 'START_LESSON',
        target: 'photosynthesis',
        reason: 'asked',
        source_needed: true,
        subject_named: true,
      }),
    )
    const handler = createHandler({
      model: { lesson: async () => ({}), chat },
      search: { async search() { return [] } },
      lessons,
      identitySecret: 'a-test-secret-that-is-long-enough-for-hmac',
    } as never)

    /* The same request shape every other server test uses. */
    const res = await handler({
      method: 'POST',
      path: '/api/ask',
      body: { question: 'photosynthesis', alreadyUsed: [] },
    } as never)

    expect(res.status).toBe(200)
    /*
     * ONE CALL, AND IT IS THE CHEAP ONE.
     *
     * This asserted zero, which held while the shelf was keyed by the raw
     * message and checked first. Keying by the SUBJECT needs the decision
     * first, and that trade was made deliberately: the decision costs ~250
     * tokens, the authoring call it avoids costs ~1,420 plus a 1,000-token
     * reservation, and every phrasing of a subject now shares one entry
     * instead of each spelling getting its own.
     *
     * So the assertion is not "no model" any more -- it is "not the tutor",
     * which is where the money is.
     */
    expect(chat).toHaveBeenCalledTimes(1)
    const firstCall: readonly string[] = chat.mock.calls[0] ?? []
    const firstSystem = firstCall[0] ?? ''
    expect(firstSystem, 'the tutor was asked to write a lesson despite a shelf hit').toContain(
      'You are the controller',
    )
  })
})

describe('a message that names nothing teachable', () => {
  /*
   * MEASURED AGAINST A REAL MODEL, and the reason this check is code rather
   * than a prompt line: the prompt already forbids it in capitals and a 7B
   * model did it anyway.
   *
   *   "hi"                -> lesson titled "How do you say 'hi'?"
   *   "solve this"        -> lesson titled "How do you find the atomic number..."
   *   "give me questions" -> lesson titled "How can you tell if a question is..."
   */
  it('recognises a request with no subject in it', () => {
    for (const nothing of ['hi', 'hello', 'hey there', 'solve this', 'give me questions', 'ok', 'please help', 'shuru karo', 'i want something']) {
      expect(namesASubject(nothing), nothing).toBe(false)
    }
  })

  it('recognises a real subject however it is wrapped', () => {
    for (const something of ['photosynthesis', 'teach me logarithms', 'explain osmosis please', 'sir mujhe samajh nahi aaya about photosynthesis', 'diff b/w mass n weight', 'give me questions on trigonometry']) {
      expect(namesASubject(something), something).toBe(true)
    }
  })

  it('asks instead of teaching the greeting back', () => {
    const verdict = permitted(
      { action: 'START_LESSON', target: 'hi', reason: 'they arrived', sourceNeeded: true, subjectNamed: false },
      { said: 'hi', told: [] },
    )
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.instead.action).toBe('ASK_CLARIFICATION')
  })

  it('uses the topic on screen rather than interrogating someone mid-lesson', () => {
    /* "solve this" inside a lesson has an obvious subject: the thing on screen. */
    const verdict = permitted(
      { action: 'ANSWER', target: 'solve this', reason: '', sourceNeeded: true, subjectNamed: false },
      { said: 'solve this', lesson: 'Logarithms', topic: 'Change of base', told: ['definition-first'] },
    )
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) {
      expect(verdict.instead.action).toBe('ANSWER')
      expect(verdict.instead.target).toBe('Change of base')
    }
  })

  it('lets a real subject straight through', () => {
    expect(
      permitted(
        { action: 'START_LESSON', target: 'logarithms', reason: '', sourceNeeded: true, subjectNamed: true },
        { said: 'teach me logarithms', told: [] },
      ).ok,
    ).toBe(true)
  })
})

describe('nothing in the prompt can be mistaken for a value', () => {
  /*
   * A model copied `LESSON: none — they are at the door` out of the situation
   * text and used it as the subject to teach. It was not misreading: it was
   * handed prose in the shape of a value.
   */
  it('omits the lesson line entirely when there is no lesson', async () => {
    const chat = says({ action: 'ASK_CLARIFICATION', target: '', reason: 'nothing named', source_needed: false })
    await decideNext(chat, { said: 'hi', told: [] })

    const situation = chat.mock.calls[0]![1]
    expect(situation).not.toContain('LESSON:')
    expect(situation).not.toContain('at the door')
    expect(situation).toContain('STUDENT SAID: hi')
  })

  it('names the lesson only when there is one', async () => {
    const chat = says({ action: 'EXPLAIN', target: 'x', reason: 'y', source_needed: true })
    await decideNext(chat, midLesson)

    expect(chat.mock.calls[0]![1]).toContain('LESSON: Logarithms')
  })
})

describe('the subject must be the learner’s, not one the model invented', () => {
  /*
   * MEASURED THROUGH THE REAL UI on a local model:
   *
   *   typed  "bhai yaar mujhe kuch samajh nahi aa raha photosynthesis mein"
   *   chose  START_LESSON target="introduction to algebra"
   *
   * `photosynthesis` was in the message. The veto approved algebra because it
   * only asked whether the target IS a subject, never whether it is THEIRS.
   */
  it('refuses a subject that appears nowhere in what they said', () => {
    const verdict = permitted(
      { action: 'START_LESSON', target: 'introduction to algebra', reason: 'entry point', sourceNeeded: true, subjectNamed: true },
      { said: 'bhai yaar mujhe kuch samajh nahi aa raha photosynthesis mein', told: [] },
    )
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) {
      expect(verdict.instead.action).toBe('START_LESSON')
      expect(verdict.instead.target).toContain('photosynthesis')
    }
  })

  it('allows a rephrasing that shares their words', () => {
    for (const [said, target] of [
      ['teach me logarithms', 'logarithms'],
      ['diff b/w mass n weight', 'mass and weight'],
      ['sir mujhe samajh nahi aaya about photosynthesis', 'photosynthesis'],
    ] as const) {
      const verdict = permitted(
        { action: 'START_LESSON', target, reason: '', sourceNeeded: true, subjectNamed: true },
        { said, told: [] },
      )
      expect(verdict.ok, `${said} -> ${target}`).toBe(true)
    }
  })

  it('allows the model to suggest something when they named nothing', () => {
    /* A bare greeting has nothing to be grounded in, so a suggestion is the
       model doing its job rather than inventing over the learner. */
    expect(
      permitted(
        { action: 'START_LESSON', target: 'place value', reason: 'a starting point', sourceNeeded: true, subjectNamed: true },
        { said: 'hi', told: [] },
      ).ok,
    ).toBe(true)
  })

  it('counts the topic on screen as theirs', () => {
    expect(
      permitted(
        { action: 'EXPLAIN', target: 'change of base', reason: '', sourceNeeded: true, subjectNamed: true },
        { said: 'i still dont get it', lesson: 'Logarithms', topic: 'Change of base', told: ['definition-first'] },
      ).ok,
    ).toBe(true)
  })
})

describe('a corrected misspelling is still their word', () => {
  /*
   * MEASURED, and it broke the feature this product exists for:
   *
   *   typed    "wat is fotosynthesis"
   *   decided  ANSWER target="photosynthesis"   <- the model corrected it
   *   refused  "appears nowhere in what they said"
   *   result   a lesson titled "wat is fotosynthesis"
   */
  it('keeps the correction instead of the typo', () => {
    for (const [said, target] of [
      ['wat is fotosynthesis', 'photosynthesis'],
      ['explain trignometry', 'trigonometry'],
      ['algibra pls', 'algebra'],
      ['fotosynthasis kya hai', 'photosynthesis'],
    ] as const) {
      const verdict = permitted(
        { action: 'START_LESSON', target, reason: '', sourceNeeded: true, subjectNamed: true },
        { said, told: [] },
      )
      expect(verdict.ok, `${said} -> ${target}`).toBe(true)
    }
  })

  it('still refuses a subject that is genuinely different', () => {
    for (const [said, target] of [
      ['bhai yaar mujhe kuch samajh nahi aa raha photosynthesis mein', 'introduction to algebra'],
      ['teach me logarithms', 'the french revolution'],
    ] as const) {
      const verdict = permitted(
        { action: 'START_LESSON', target, reason: '', sourceNeeded: true, subjectNamed: true },
        { said, told: [] },
      )
      expect(verdict.ok, `${said} -> ${target}`).toBe(false)
    }
  })

  it('does not treat short words as interchangeable', () => {
    /* At three letters almost everything is one edit from everything else. */
    const verdict = permitted(
      { action: 'START_LESSON', target: 'cat', reason: '', sourceNeeded: true, subjectNamed: true },
      { said: 'teach me about a bat', told: [] },
    )
    expect(verdict.ok).toBe(false)
  })
})

describe('two real words are not the same word', () => {
  /*
   * One-edit-per-four allowed `physics` and `physical` to collide.
   *
   * NOT `formula` / `formulae`, which was raised alongside it and is the
   * opposite case: they are one word in two numbers, and matching them is
   * correct. A learner who typed "formula" and got a lesson about formulae got
   * their subject. The rule has to separate two WORDS, not two spellings.
   */
  it('keeps subjects apart that merely look alike', () => {
    for (const [said, target] of [
      ['explain physics', 'physical'],
      ['teach me algebra', 'algorithm'],
    ] as const) {
      expect(
        permitted(
          { action: 'START_LESSON', target, reason: '', sourceNeeded: true, subjectNamed: true },
          { said, told: [] },
        ).ok,
        `${said} -> ${target}`,
      ).toBe(false)
    }
  })
})

describe('a greeting in any advertised language is not a subject', () => {
  /*
   * The prompt advertises Hindi, Tamil, Bengali, Marathi, Telugu, Punjabi and
   * Gujarati. The veto knew English and a little Hindi, so `vanakkam` counted
   * as a subject and would have been taught -- the "How do you say 'hi'?"
   * defect, still live for every language not enumerated.
   */
  it('recognises them as naming nothing', () => {
    for (const greeting of ['vanakkam', 'namaskar', 'nomoskar', 'kem cho', 'sat sri akal', 'adaab']) {
      expect(namesASubject(greeting), greeting).toBe(false)
    }
  })

  it('still reads a subject inside a non-English request', () => {
    for (const asked of ['photosynthesis kya hai', 'vanakkam, teach me algebra', 'mujhe logarithms samjhao']) {
      expect(namesASubject(asked), asked).toBe(true)
    }
  })
})

describe('a guessed decision is marked as one', () => {
  /* A fallback target is the learner's sentence, not a subject, and the shared
     shelf is keyed by target -- so the caller has to be able to tell. */
  it('flags the fallback so a caller can refuse to file it', () => {
    const guessed = fallbackDecision({ said: 'bhai yaar samajh nahi aaya photosynthesis', told: [] })
    expect(guessed.guessed).toBe(true)
  })

  it('does not flag a decision the controller actually made', async () => {
    const chat = says({ action: 'START_LESSON', target: 'photosynthesis', reason: 'asked', source_needed: true })
    const decided = await decideNext(chat, { said: 'photosynthesis', told: [] })
    expect(decided.guessed).toBeUndefined()
  })
})

describe('one concept key for the history and the shelf', () => {
  /*
   * THE REPEAT THIS PREVENTS, REACHABLE BY REPHRASING.
   *
   *   ask "photosynthesis"        -> history and shelf both under that
   *   ask "wat is fotosynthesis"  -> history looked up the raw string, found
   *                                  nothing, and the shelf served the route
   *                                  they had already been given
   *
   * The shelf is keyed by the decided subject, so the history has to be too.
   */
  it('does not serve a route this learner already had, whatever they typed', async () => {
    const { createHandler } = await import('./handler.ts')
    const { writtenLessons } = await import('./memory/lessons.ts')
    const { explanationsIn } = await import('./memory/explanations.ts')

    const rows = new Map<string, string>()
    const store = {
      read: (k: string) => rows.get(k),
      write: (k: string, v: string) => void rows.set(k, v),
      update: (k: string, _at: string, change: (c: string | undefined) => string) =>
        void rows.set(k, change(rows.get(k))),
    } as never

    const lessons = writtenLessons(store, 'r1')
    const explanations = explanationsIn(store)
    lessons.keep('photosynthesis', {
      route: 'contrast',
      lesson: { id: 'p', question: 'What is photosynthesis?', blocks: [{ id: 'a', body: 'x' }] },
      at: '2026-09-01T10:00:00.000Z',
    })

    const chat = vi.fn(async () =>
      JSON.stringify({
        action: 'START_LESSON',
        target: 'photosynthesis',
        reason: 'asked',
        source_needed: true,
        subject_named: true,
      }),
    )
    const handler = createHandler({
      model: { lesson: async () => ({}), chat },
      search: { async search() { return [] } },
      lessons,
      explanations,
      identitySecret: 'a-test-secret-that-is-long-enough-for-hmac',
    } as never)

    /* THE SAME LEARNER, which is the whole point: two DIFFERENT learners both
       getting `contrast` is the shelf working. Her cookie comes back on the
       second request, exactly as a browser would send it. */
    const ask = (question: string, cookie?: string) =>
      handler({
        method: 'POST',
        path: '/api/ask',
        body: { question, alreadyUsed: [] },
        ...(cookie === undefined ? {} : { cookie }),
      } as never)

    const first = (await ask('photosynthesis')) as { status: number; setCookie?: string; body?: unknown }
    expect(first.status).toBe(200)
    expect((first.body as { route?: string }).route).toBe('contrast')
    const hers = (first.setCookie ?? '').split(';')[0] ?? ''

    /* Same learner, same subject, different spelling. */
    const second = (await ask('wat is fotosynthesis', hers)) as { body?: unknown }
    expect(
      (second.body as { route?: string }).route,
      'the same route was served twice by rephrasing',
    ).not.toBe('contrast')
  })
})

describe('the shelf key is the model’s own naming', () => {
  /*
   * The key used to be derived by stripping framing words and joining what was
   * left, which made it ORDER-DEPENDENT: "difference between mass and weight"
   * filed as `mass weight` and the same question the other way round looked up
   * `weight mass` and missed. The model already returns a canonical name for
   * the subject -- that is what `target` is -- so nothing is derived any more.
   *
   * `subjectWords` survives only as the fallback used when nothing reported a
   * subject, and these pin that narrower job.
   */
  it('still recognises a message that names nothing', () => {
    for (const nothing of ['hi', 'vanakkam', 'solve this', 'shuru karo']) {
      expect(namesASubject(nothing), nothing).toBe(false)
    }
  })

  it('still recognises one that does', () => {
    for (const something of ['photosynthesis kya hai', 'teach me logarithms']) {
      expect(namesASubject(something), something).toBe(true)
    }
  })

  it('shares the framing list with the veto, and shares only that', () => {
    /* One strip, two callers, and they part company on purpose. Wherever the
       FRAMING decides the answer they agree, and that shared half is what
       stopped the two hand-copied chains from drifting. */
    for (const text of ['hi', 'photosynthesis', 'vanakkam, teach me algebra', '']) {
      expect(namesASubject(text), text).toBe(subjectWords(text).length > 0)
    }
    /* And they must differ where the LENGTH filter decides it. Defined as
       `subjectWords(text).length > 0`, the veto refused `pi`. */
    expect(namesASubject('what is pi')).toBe(true)
    expect(subjectWords('what is pi')).toEqual([])
  })
})

describe('a two-letter subject is still a subject', () => {
  /*
   * `namesASubject` was briefly defined as `subjectWords(text).length > 0`, and
   * `subjectWords` drops words of three characters or fewer because a stray
   * fragment is noise in an IDENTIFIER. Applied to the veto that filter refused
   * real questions: `pi`, `what is pi`, `pH` all stripped to nothing and the
   * learner was asked what they meant.
   */
  it('recognises pi and pH', () => {
    for (const short of ['pi', 'what is pi', 'pH', 'explain pH']) {
      expect(namesASubject(short), short).toBe(true)
    }
  })

  it('still drops them from the identifier, where they are noise', () => {
    /* The two callers want different things; only the framing list is shared. */
    expect(subjectWords('what is pi')).toEqual([])
  })

  it('still refuses a message that names nothing at all', () => {
    for (const nothing of ['hi', 'vanakkam', 'ok']) {
      expect(namesASubject(nothing), nothing).toBe(false)
    }
  })
})

describe('nothing over-claims a subject it never read', () => {
  it('does not claim one just because they typed something', () => {
    /* The outage path is where the app knows least; it used to assert most. */
    expect(fallbackDecision({ said: 'hi', told: [] }).subjectNamed).toBe(false)
    expect(fallbackDecision({ said: 'photosynthesis', told: [] }).subjectNamed).toBe(true)
  })

  it('does not read an omitted field as a refusal', async () => {
    /* Small models drop optional keys. Reading silence as "named nothing"
       turned a good decision into a clarifying question. */
    const chat = vi.fn(async () =>
      JSON.stringify({ action: 'START_LESSON', target: 'photosynthesis', reason: 'asked' }),
    )
    const decided = await decideNext(chat, { said: 'photosynthesis', told: [] })
    expect(decided.subjectNamed).toBe(true)
  })

  it('still believes an explicit false', async () => {
    const chat = vi.fn(async () =>
      JSON.stringify({ action: 'ASK_CLARIFICATION', target: '', reason: 'unclear', subject_named: false }),
    )
    const decided = await decideNext(chat, { said: 'photosynthesis', told: [] })
    expect(decided.subjectNamed).toBe(false)
  })
})
