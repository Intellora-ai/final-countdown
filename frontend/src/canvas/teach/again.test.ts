import { describe, expect, it } from 'vitest'

import { explainAgain, NOTHING_YET, type Remembered } from './again'
import type { LessonModel } from './authorLesson'
import { AXES } from './route'
import { sameAgain } from './sameAgain'

/*
 * NEVER THE SAME EXPLANATION TWICE -- asserted as an EFFECT, not as a call.
 *
 * `route.ts` can rotate twelve ways in and `sameAgain.ts` can spot a repeat,
 * but neither does anything unless something REMEMBERS what this learner was
 * already given and feeds it back. These tests hold that memory to its only
 * observable promise: ask the same question again, get a different explanation.
 */

/** Words unique to one route, laid between every word so no triple survives. */
function inVoice(tag: string, words: string): string {
  return words.split(' ').join(` ${tag} `)
}

/** A sound concept whose every phrase is stamped with the route that wrote it. */
function conceptFor(tag: string): string {
  return JSON.stringify({
    id: 'base-case',
    question: 'What is a base case?',
    technicalTerms: [{ term: 'recursion', introducedIn: 'shown' }],
    blocks: [
      {
        id: 'says-what',
        kind: 'prose',
        emphasis: 'primary',
        tone: 'neutral',
        role: 'definition',
        depth: 'core',
        body: `${inVoice(tag, 'A base case returns without calling itself')}.`,
        terms: [{ text: 'base', mark: 'key' }],
      },
      {
        id: 'shown',
        kind: 'table',
        emphasis: 'supporting',
        tone: 'neutral',
        role: 'framework',
        depth: 'core',
        columns: [
          { key: 'call', label: 'Call', type: 'text' },
          { key: 'does', label: 'What it does', type: 'text' },
        ],
        rows: [
          { call: 'fact(1)', does: inVoice(tag, 'returns one with no recursion') },
          { call: 'fact(4)', does: inVoice(tag, 'calls fact three below it') },
        ],
      },
    ],
    relations: [{ kind: 'supports', from: 'says-what', to: 'shown' }],
    checkpoint: `${inVoice(tag, 'Which of those two calls stops and how can you tell')}?`,
    next: [
      { id: 'deeper', label: inVoice(tag, 'Why a missing stop never ends') },
      { id: 'related', label: inVoice(tag, 'How recursion builds the answer up') },
    ],
  })
}

/** The route the prompt actually asked for, read back out of the system text. */
function routeAskedFor(system: string): string {
  const axis = AXES.find((a) => system.includes(a.directive))
  if (!axis) throw new Error('the prompt named no route at all')
  return axis.id
}

/*
 * A nonsense stamp, NOT the route id.
 *
 * The ids read 'definition-first', 'example-first', 'problem-first', and the
 * gate counts sequence words -- so stamping the prose with the id itself
 * refused every fixture for narrating a chain. The index carries the same
 * "which route wrote this" information and carries no English at all.
 */
function voiceOf(route: string): string {
  return `vox${AXES.findIndex((a) => a.id === route)}`
}

const QUESTION = 'What is a base case?'

describe('asking the same thing again is answered differently', () => {
  it('takes a different route and writes a genuinely different explanation', async () => {
    /*
     * THE LOAD-BEARING TEST. It asserts the EFFECT a learner would feel --
     * different words on the page -- not that any function was called.
     */
    const model: LessonModel = async (system) => conceptFor(voiceOf(routeAskedFor(system)))

    const first = await explainAgain(model, QUESTION, [], NOTHING_YET)
    const second = await explainAgain(model, QUESTION, [], first.memory)

    if (!first.written.ok) throw new Error(`first refused: ${JSON.stringify(first.written.issues)}`)
    if (!second.written.ok) throw new Error(`second refused: ${JSON.stringify(second.written.issues)}`)

    expect(second.written.route).not.toBe(first.written.route)
    expect(sameAgain(second.written.lesson, [first.written.lesson]).duplicate).toBe(false)
    expect(second.memory.routes).toEqual([first.written.route, second.written.route])
    expect(second.memory.shown).toHaveLength(2)
  })

  it('re-authors when the model repeats itself anyway', async () => {
    /*
     * A rerouted prompt is a request, not a guarantee. This model ignores the
     * route once and hands back word-for-word what the learner already read;
     * the only acceptable behaviour is to ask again, not to ship it.
     */
    let call = 0
    const model: LessonModel = async (system) => {
      call += 1
      if (call <= 2) return conceptFor('voxstuck')
      return conceptFor(voiceOf(routeAskedFor(system)))
    }

    const first = await explainAgain(model, QUESTION, [], NOTHING_YET)
    const second = await explainAgain(model, QUESTION, [], first.memory)

    if (!first.written.ok) throw new Error(`first refused: ${JSON.stringify(first.written.issues)}`)
    if (!second.written.ok) throw new Error(`second refused: ${JSON.stringify(second.written.issues)}`)

    expect(call).toBe(3)
    expect(sameAgain(second.written.lesson, [first.written.lesson]).duplicate).toBe(false)
  })

  it('remembers per topic, so a route already spent is not spent again', async () => {
    const model: LessonModel = async (system) => conceptFor(voiceOf(routeAskedFor(system)))
    const memory: Remembered = { routes: ['definition-first', 'example-first'], shown: [] }

    const written = (await explainAgain(model, QUESTION, [], memory)).written
    if (!written.ok) throw new Error('refused')
    expect(['definition-first', 'example-first']).not.toContain(written.route)
  })
})
