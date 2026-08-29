import { describe, expect, it } from 'vitest'

import { authorConcept, conceptRequest } from './concept'
import type { LessonModel } from './authorLesson'
import { AXES, nextRoute } from './route'
import { itemTable, neverReached, summarise } from './matrix'

describe('the route is a pure function of (question, seed)', () => {
  it('sends the directive the caller seeded, not one derived from the question', async () => {
    const seen: string[] = []
    const model: LessonModel = async (system) => {
      seen.push(system)
      return '{}'
    }
    const question = 'What is a base case?'
    const seed = 4242
    await authorConcept(model, question, [], [], seed)
    const wanted = nextRoute({ seed, alreadyUsed: [] })
    expect(seen[0], 'the seeded route directive never reached the model').toContain(wanted.directive)
  })

  it('gives a different way in for a different seed, same question', () => {
    const question = 'What is a base case?'
    const directives = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => {
        const prompt = conceptRequest(question, [], [], seed)
        return AXES.find((axis) => prompt.includes(axis.directive))?.id ?? 'none'
      }),
    )
    expect(directives.has('none'), 'a seeded prompt carried no route at all').toBe(false)
    expect(
      directives.size,
      'every seed produced the same route: the seed is not wired in',
    ).toBeGreaterThan(1)
  })

  it('is byte-identical when the seed repeats', () => {
    const a = conceptRequest('Teach me percent.', [], [], 99)
    const b = conceptRequest('Teach me percent.', [], [], 99)
    expect(a).toBe(b)
  })
})

describe('the per-item table, not the ratio', () => {
  it('names every item and the reason it failed', () => {
    const table = itemTable([
      { item: 'known syllabus topic', ok: true, why: '' },
      { item: 'unknown topic', ok: false, why: 'the definition is 32 words, and the cap is 30' },
    ])
    expect(table).toBe(
      'TAUGHT   known syllabus topic\n' +
        'REFUSED  unknown topic -- the definition is 32 words, and the cap is 30',
    )
  })
})

describe('n seeds, mean and spread', () => {
  it('reports the pass count per seed, the mean and the standard deviation', () => {
    const item = (ok: boolean): { item: string; ok: boolean; why: string } => ({
      item: 'x',
      ok,
      why: '',
    })
    const runs = [
      { seed: 1, items: [item(true), item(true), item(true), item(false)] },
      { seed: 2, items: [item(true), item(true), item(false), item(false)] },
    ]
    expect(summarise(runs)).toEqual({ passes: [3, 2], mean: 2.5, std: 0.5 })
  })
})


/*
 * A RUN THAT MEASURED NOTHING MUST NOT LOOK LIKE A RUN THAT MEASURED BADLY.
 *
 * Found by running the live matrix, not by reading it. Every one of sixteen
 * items came back `REFUSED ... the model could not be reached`, in under a
 * second, and the suite reported PASS.
 *
 * Two separate defects, both here:
 *
 * 1. The real cause was thrown away. `authorConcept` already returns it on an
 *    `unreachable` field -- the provider said `HTTP 404`, the model id in the
 *    config had been withdrawn -- and the harness printed only the generic
 *    issue instead. That sends a reader hunting a network fault for what is a
 *    dead string in a config file.
 *
 * 2. Nothing could fail. The suite's one assertion looks for CURRICULUM
 *    excuses, and "the model could not be reached" contains none, so a run that
 *    never reached the model passes it. Not asserting the SCORE is right -- a
 *    shape refusal is the gate working -- but "the instrument ran at all" is
 *    not a score, and it was never checked.
 *
 * `knowledge/README.md` states the rule this broke: for anything
 * time-sensitive, current official documentation supplies the truth, never a
 * pinned value. A model id is exactly that.
 */
describe('a run that never reached the model is not a result', () => {
  it('names the provider error instead of hiding it behind a generic one', () => {
    const table = itemTable([
      {
        item: '[known syllabus topic] Why does heating a gas raise its pressure?',
        ok: false,
        why: 'the model could not be reached',
        unreachable: 'openai/gpt-oss-120b: HTTP 404',
      },
    ])
    expect(table, 'the provider said why, and the table did not repeat it').toContain('HTTP 404')
  })

  it('reports every item that never reached the model', () => {
    const runs = [
      {
        seed: 1,
        items: [
          { item: 'a', ok: false, why: 'blocks[0]: too long' },
          { item: 'b', ok: false, why: 'nope', unreachable: 'HTTP 404' },
          { item: 'c', ok: true, why: '' },
        ],
      },
    ]
    expect(
      neverReached(runs).map((v) => v.item),
      'a transport failure was counted as a teaching verdict',
    ).toEqual(['b'])
  })

  it('does not count a shape refusal as a failure to reach the model', () => {
    /* The pair. A gate refusal IS a measurement -- the model answered and the
       answer was refused -- so treating it as unreachable would make the new
       check fire on exactly the runs it exists to let through. */
    const runs = [
      { seed: 1, items: [{ item: 'a', ok: false, why: 'blocks[0]: the definition is 32 words' }] },
    ]
    expect(neverReached(runs)).toEqual([])
  })
})
