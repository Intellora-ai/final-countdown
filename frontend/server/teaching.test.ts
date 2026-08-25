/* Which teaching strategy this attempt should use.
 *
 * WHY A POLICY AND NOT A PROMPT
 *   `learning-os` holds eleven strategies and ten diagnoses that have never
 *   run: the Python engine is instantiated nowhere outside its own tests. Its
 *   THINKING is what is worth keeping, so the vocabulary moves here and becomes
 *   the thing the server tells the model to do.
 *
 * WHY DETERMINISTIC
 *   A student who opens the same concept twice in the same state must get the
 *   same teaching. A strategy picked at random cannot be explained to them, and
 *   cannot be debugged when it teaches badly.
 *
 * THE ORACLE -- how do we know a choice is RIGHT?
 *   Not "whatever the function returned". Each rule below is a claim about
 *   teaching that can be argued with:
 *     first meeting            -> show a worked example before asking for work
 *     came back unfinished     -> it was too big; break it down
 *     seen twice and still not -> the words are not landing; change the form
 *     a named misconception    -> repair that, not the topic in general
 */

import { describe, expect, it } from 'vitest'
import { STRATEGIES, DIAGNOSES, chooseStrategy, instructionFor } from './teaching.ts'

describe('the vocabulary is the one learning-os defined', () => {
  it('carries all eleven strategies', () => {
    expect([...STRATEGIES]).toEqual([
      'worked_example', 'broken_example_repair', 'transfer_challenge',
      'change_representation', 'contrast', 'decomposition', 'analogy',
      'guided_reasoning', 'prerequisite_repair', 'misconception_repair', 'new_context',
    ])
  })

  it('carries all ten diagnoses', () => {
    expect([...DIAGNOSES]).toEqual([
      'term_gap', 'concept_gap', 'prerequisite_gap', 'misconception',
      'causal_reasoning_failure', 'procedural_failure', 'representation_failure',
      'language_failure', 'cognitive_overload', 'transfer_failure',
    ])
  })
})

describe('choosing a strategy', () => {
  it('shows a worked example the first time a concept is met', () => {
    expect(chooseStrategy({})).toBe('worked_example')
    expect(chooseStrategy({ attempts: 0 })).toBe('worked_example')
    expect(chooseStrategy({ attempts: 1 })).toBe('worked_example')
  })

  it('breaks a carried-over concept down instead of repeating it', () => {
    /* It came back because it was not finished. Teaching it the same way again
     * is the definition of the thing that already did not work. */
    expect(chooseStrategy({ attempts: 1, carriedFrom: '2026-08-24' })).toBe('decomposition')
  })

  it('changes the representation when the same words have failed twice', () => {
    expect(chooseStrategy({ attempts: 2 })).toBe('change_representation')
  })

  it('reaches for an analogy once form alone has not worked', () => {
    expect(chooseStrategy({ attempts: 3 })).toBe('analogy')
    expect(chooseStrategy({ attempts: 9 })).toBe('analogy')
  })

  it('repairs a NAMED misconception rather than reteaching the topic', () => {
    /* The most specific signal wins over every count-based rule: a student who
     * believes something wrong is not helped by a fourth explanation. */
    expect(chooseStrategy({ attempts: 3, diagnosis: 'misconception' })).toBe('misconception_repair')
    expect(chooseStrategy({ attempts: 0, diagnosis: 'misconception' })).toBe('misconception_repair')
  })

  it('repairs the prerequisite when that is what is missing', () => {
    expect(chooseStrategy({ attempts: 1, diagnosis: 'prerequisite_gap' })).toBe('prerequisite_repair')
  })

  it('changes the representation for a representation failure', () => {
    expect(chooseStrategy({ attempts: 0, diagnosis: 'representation_failure' })).toBe('change_representation')
  })

  it('decomposes when the student is overloaded, however many attempts', () => {
    expect(chooseStrategy({ attempts: 0, diagnosis: 'cognitive_overload' })).toBe('decomposition')
  })

  it('always returns a strategy from the vocabulary, for any input', () => {
    /* A strategy the model has no instruction for would produce a lesson with
     * no teaching shape at all. */
    for (const attempts of [-1, 0, 1, 2, 3, 50, 1e9]) {
      for (const diagnosis of [undefined, ...DIAGNOSES]) {
        const chosen = chooseStrategy({ attempts, diagnosis })
        expect(STRATEGIES, `attempts=${attempts} diagnosis=${diagnosis}`).toContain(chosen)
      }
    }
  })

  it('is deterministic: the same state teaches the same way', () => {
    const state = { attempts: 2, carriedFrom: '2026-08-24', diagnosis: 'concept_gap' } as const
    const first = chooseStrategy(state)
    for (let i = 0; i < 20; i += 1) expect(chooseStrategy(state)).toBe(first)
  })
})

describe('the instruction handed to the model', () => {
  it('gives every strategy a real instruction, not its own name', () => {
    /* "Use the strategy worked_example" tells the model nothing it can act on.
     * Each one has to say what to actually DO. */
    for (const strategy of STRATEGIES) {
      const instruction = instructionFor(strategy)
      expect(instruction.length, strategy).toBeGreaterThan(30)
      expect(instruction, strategy).not.toContain(strategy)
    }
  })

  it('gives different strategies different instructions', () => {
    const all = STRATEGIES.map(instructionFor)
    expect(new Set(all).size).toBe(STRATEGIES.length)
  })

  it('never tells the model how anything should LOOK', () => {
    /* Law 3: the model chooses meaning, never presentation. An instruction
     * mentioning colour or size would invite a lesson that gets rejected. */
    for (const strategy of STRATEGIES) {
      expect(instructionFor(strategy)).not.toMatch(/colou?r|font|pixel|size|width|spacing|bold|red\b/i)
    }
  })
})

describe('the strategy reaches the model, not just the reply', () => {
  it('puts the instruction into the brief the model is sent', async () => {
    /* MUTATION EVIDENCE, before the mutant existed. Every check in
     * `lesson-strategy.test.ts` uses a recording double, so they prove the
     * HANDLER passes a strategy along -- and would all still pass if the model
     * client dropped it on the floor. This drives the real brief builder. */
    const { createModel } = await import('./model.ts')
    const sent: string[] = []
    const model = createModel({
      apiKey: 'sk-ant-test',
      fetchImpl: async (_url, init) => {
        sent.push(init.body)
        return {
          ok: true,
          status: 200,
          json: async () => ({ content: [{ type: 'text', text: '{}' }] }),
        }
      },
    })

    await model.lesson({ concept: 'Photosynthesis', strategy: 'analogy' }).catch(() => undefined)

    const brief = JSON.parse(sent[0]).messages[0].content as string
    expect(brief).toContain('Photosynthesis')
    expect(brief).toContain(instructionFor('analogy'))
    expect(brief, 'the strategy name is not an instruction').not.toContain('analogy')
  })

  it('sends no teaching instruction when no strategy was decided', async () => {
    const { createModel } = await import('./model.ts')
    const sent: string[] = []
    const model = createModel({
      apiKey: 'sk-ant-test',
      fetchImpl: async (_url, init) => {
        sent.push(init.body)
        return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: '{}' }] }) }
      },
    })

    await model.lesson({ concept: 'Photosynthesis' }).catch(() => undefined)
    expect(JSON.parse(sent[0]).messages[0].content).not.toContain('Teach it this way')
  })
})
