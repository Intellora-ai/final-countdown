/* What the model is allowed to produce.
 *
 * THE GAP THIS CLOSES
 *   The canvas renders eight block kinds. The schema handed to the model
 *   allowed TWO: prose and callout. So every live lesson was paragraphs, on
 *   every subject -- a quadratic formula written out in a sentence, a
 *   comparison of three methods as three paragraphs, a measured value buried in
 *   prose. The canvas could draw all of it; the model was never allowed to ask.
 *
 * WHY THESE THREE AND NOT ALL SIX
 *   `metric`, `equation` and `table` are shapes a model can fill correctly from
 *   a topic alone. `chart`, `flow` and `simulation` carry data the model would
 *   have to invent -- series values, node graphs, physical parameters -- and an
 *   invented number rendered as an axis is a lie a student cannot detect. Those
 *   stay closed, deliberately, and this file says so rather than leaving it to
 *   be discovered.
 *
 * THE ORACLE
 *   Not "the schema has more keys". Every kind the schema offers must SURVIVE
 *   `validateLesson` -- the browser's own gate -- because a lesson the model is
 *   invited to write and the canvas then refuses is worse than one it was never
 *   allowed to attempt.
 */

import { describe, expect, it } from 'vitest'
/* Imported from `prompt.ts`, which is where the schema now lives: there are two
 * providers, and a lesson written by one must be the same KIND of thing as a
 * lesson written by the other. */
import { LESSON_SCHEMA, ALLOWED_BLOCK_KINDS } from './prompt.ts'
import { validateLesson } from '../src/canvas/spec/validate.ts'

const lessonWith = (block: Record<string, unknown>) => ({
  id: 'test-lesson',
  question: 'Does this shape survive the gate?',
  blocks: [block],
  relations: [],
})

describe('the kinds a model may produce', () => {
  it('offers more than prose and callout', () => {
    expect(ALLOWED_BLOCK_KINDS.length).toBeGreaterThan(2)
    expect([...ALLOWED_BLOCK_KINDS]).toEqual(['prose', 'callout', 'metric', 'equation', 'table'])
  })

  it('matches the enum the schema actually enforces', () => {
    /* Two lists that describe one rule is one rule and one future
     * disagreement. */
    const kinds = LESSON_SCHEMA.properties.blocks.items.properties.kind.enum
    expect(kinds).toEqual([...ALLOWED_BLOCK_KINDS])
  })

  it('leaves chart, flow and simulation closed, on purpose', () => {
    /* Those carry data a model would have to invent, and an invented number
     * drawn as an axis is a lie a student cannot detect. */
    for (const kind of ['chart', 'flow', 'simulation', 'figure']) {
      expect(ALLOWED_BLOCK_KINDS, kind).not.toContain(kind)
    }
  })
})

describe('every offered kind survives the browser gate', () => {
  it('accepts prose', () => {
    expect(validateLesson(lessonWith({ id: 'p', kind: 'prose', body: 'A sentence.' })).ok).toBe(true)
  })

  it('accepts a callout', () => {
    expect(
      validateLesson(lessonWith({ id: 'c', kind: 'callout', body: 'Careful here.', tone: 'warning' })).ok,
    ).toBe(true)
  })

  it('accepts a metric', () => {
    const result = validateLesson(lessonWith({ id: 'm', kind: 'metric', value: 273, unit: 'K', caption: 'Absolute zero offset' }))
    expect(result.ok, JSON.stringify('issues' in result ? result.issues : '')).toBe(true)
  })

  it('accepts an equation, which is the whole point for mathematics', () => {
    const result = validateLesson(lessonWith({
      id: 'e', kind: 'equation', latex: 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}', highlight: ['b^2-4ac'],
    }))
    expect(result.ok, JSON.stringify('issues' in result ? result.issues : '')).toBe(true)
  })

  it('accepts a table, which is the whole point for a comparison', () => {
    const result = validateLesson(lessonWith({
      id: 't', kind: 'table',
      columns: [
        { key: 'method', label: 'Method', type: 'text' },
        { key: 'cost', label: 'Cost', type: 'number' },
      ],
      rows: [{ method: 'LIFO', cost: 120 }, { method: 'FIFO', cost: 90 }],
    }))
    expect(result.ok, JSON.stringify('issues' in result ? result.issues : '')).toBe(true)
  })
})

describe('what the schema still refuses', () => {
  it('names no colour, size, position or spacing field anywhere', () => {
    /* Law 3. A field that could carry presentation is a field a model will
     * eventually fill with it. */
    const text = JSON.stringify(LESSON_SCHEMA)
    for (const banned of ['color', 'colour', 'fontSize', 'width', 'height', 'x', 'y', 'top', 'left', 'padding', 'margin', 'align']) {
      expect(text.includes(`"${banned}"`), `the schema offers a "${banned}" field`).toBe(false)
    }
  })

  it('still forbids extra properties on a block', () => {
    expect(LESSON_SCHEMA.properties.blocks.items.additionalProperties).toBe(false)
  })

  it('still bounds how much a single lesson may contain', () => {
    expect(LESSON_SCHEMA.properties.blocks.maxItems).toBeLessThanOrEqual(12)
  })
})

describe('the model is told the kinds exist', () => {
  it('names every allowed kind in the system prompt', async () => {
    /* A schema that PERMITS a table and a prompt that never mentions one gets
     * paragraphs forever: the model takes the easiest shape that validates. */
    const sent: string[] = []
    const { createModel } = await import('./model.ts')
    const model = createModel({
      apiKey: 'sk-ant-test',
      fetchImpl: async (_url, init) => {
        sent.push(init.body)
        return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: '{}' }] }) }
      },
    })
    await model.lesson({ concept: 'Quadratic formula' }).catch(() => undefined)

    const system = JSON.parse(sent[0]).system as string
    for (const kind of ALLOWED_BLOCK_KINDS) {
      expect(system, `the prompt never mentions "${kind}"`).toContain(kind)
    }
  })

  it('still forbids presentation in the prompt as well as the schema', async () => {
    const sent: string[] = []
    const { createModel } = await import('./model.ts')
    const model = createModel({
      apiKey: 'sk-ant-test',
      fetchImpl: async (_url, init) => {
        sent.push(init.body)
        return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: '{}' }] }) }
      },
    })
    await model.lesson({ concept: 'X' }).catch(() => undefined)

    const system = JSON.parse(sent[0]).system as string
    expect(system).toMatch(/do not decide how anything looks/i)
  })
})
