import { describe, expect, it } from 'vitest'

import { authorConcept, conceptRequest } from './concept'
import type { LessonModel } from './authorLesson'
import { AXES, nextRoute } from './route'
import { itemTable, summarise } from './matrix'

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
