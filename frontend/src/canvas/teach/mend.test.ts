/**
 * A LEARNER MEETS THE LOCAL MODEL'S SPELLING, NOT ITS REASONING.
 *
 * Each case is a lesson the 7B model actually produced on 2026-09-02, minus
 * the parts that were fine. The question in every case is the same: does the
 * learner see the lesson, or a refusal about a column key?
 */
import { describe, expect, it } from 'vitest'
import { asId, mendSpelling } from './mend'
import { validateBlock } from '../spec/validate'
import { authorConcept, EXAMPLE_FOR_ROUTE } from './concept'

const TABLE = {
  id: 'zeros-by-degree',
  kind: 'table',
  role: 'classification',
  columns: [
    { key: 'degree', label: 'Degree', type: 'number' },
    { key: 'Number of zeros', label: 'Number of zeros', type: 'number' },
  ],
  rows: [
    { degree: 1, 'Number of zeros': 1 },
    { degree: 2, 'Number of zeros': 2 },
  ],
}

function blocksOf(parsed: unknown): Record<string, unknown>[] {
  return (parsed as { blocks: Record<string, unknown>[] }).blocks
}

describe('a lesson whose only faults are spelling', () => {
  it('a column named with spaces is taught, not refused', () => {
    const mended = blocksOf(mendSpelling({ blocks: [TABLE] }))[0]!
    const verdict = validateBlock(mended, 0)
    expect(verdict.ok, JSON.stringify(verdict)).toBe(true)
    expect(mended['columns']).toEqual([
      { key: 'degree', label: 'Degree', type: 'number' },
      { key: 'number-of-zeros', label: 'Number of zeros', type: 'number' },
    ])
    /* The numbers she reads are exactly the numbers the model reasoned out. */
    expect(mended['rows']).toEqual([
      { degree: 1, 'number-of-zeros': 1 },
      { degree: 2, 'number-of-zeros': 2 },
    ])
  })

  it('a made-up role falls back to the default instead of refusing the block', () => {
    const block = { id: 'check', kind: 'prose', role: 'checkpoint', body: 'A zero is where the graph crosses the axis.' }
    const mended = blocksOf(mendSpelling({ blocks: [block] }))[0]!
    expect(mended).not.toHaveProperty('role')
    const verdict = validateBlock(mended, 0)
    expect(verdict.ok, JSON.stringify(verdict)).toBe(true)
    expect(verdict.ok && verdict.block.role).toBe('support')
  })

  it('a lesson that already spells everything right comes back untouched -- the same object', () => {
    const fine = {
      blocks: [
        { id: 'def', kind: 'prose', role: 'definition', body: 'A zero of a polynomial is a value that makes it zero.' },
        { ...TABLE, columns: [{ key: 'degree', label: 'Degree' }, { key: 'zeros', label: 'Zeros' }], rows: [{ degree: 1, zeros: 1 }] },
      ],
    }
    expect(mendSpelling(fine)).toBe(fine)
  })

  it('two columns that would spell to one id are left for the gate to refuse', () => {
    const ambiguous = {
      ...TABLE,
      columns: [{ key: 'Mass (kg)', label: 'Mass' }, { key: 'mass kg', label: 'Mass again' }],
      rows: [{ 'Mass (kg)': 1, 'mass kg': 2 }],
    }
    const mended = blocksOf(mendSpelling({ blocks: [ambiguous] }))[0]!
    expect(mended['columns']).toEqual(ambiguous.columns)
    expect(validateBlock(mended, 0).ok).toBe(false)
  })

  it('a lesson that forgot its id and question is filed under the question that was asked', () => {
    /* gemma3:12b, live 2026-09-02: `id: Required | question: Required` --
       both are known before the model writes a word. */
    const asked = 'how many zeros can a quadratic have'
    const mended = mendSpelling({ blocks: [{ id: 'p1', kind: 'prose', role: 'definition', body: 'At most two.' }] }, asked) as Record<string, unknown>
    expect(mended['id']).toBe('how-many-zeros-can-a-quadratic-have')
    expect(mended['question']).toBe(asked)
  })

  it('never overwrites an id or question the model did write', () => {
    const own = { id: 'zeros', question: 'How many?', blocks: [] }
    expect(mendSpelling(own, 'how many zeros can a quadratic have')).toBe(own)
  })

  it('relations written inside a block are hoisted to the lesson, from that block', () => {
    /* gemma3:12b, live 2026-09-02: `blocks.1: Unrecognized key(s): 'relations'` --
       the model said what relates to what; it put the sentence in the wrong place. */
    const mended = mendSpelling({
      blocks: [
        { id: 'a', kind: 'prose', role: 'definition', body: 'A zero makes the polynomial zero.', relations: [{ to: 'b', kind: 'supports' }] },
        { id: 'b', kind: 'prose', role: 'example', body: 'x = 2 for x - 2.', relations: [{ from: 'b', to: 'a', kind: 'exemplifies' }] },
      ],
    }) as { blocks: Record<string, unknown>[]; relations: unknown[] }
    expect(mended.blocks.map((block) => 'relations' in block)).toEqual([false, false])
    expect(mended.relations).toEqual([
      { from: 'a', to: 'b', kind: 'supports' },
      { from: 'b', to: 'a', kind: 'exemplifies' },
    ])
    for (const [index, block] of mended.blocks.entries()) expect(validateBlock(block, index).ok).toBe(true)
  })

  it('a relation inside a block that says nothing usable is left for the gate', () => {
    const block = { id: 'a', kind: 'prose', role: 'definition', body: 'A zero.', relations: [{ label: 'see also' }] }
    const mended = mendSpelling({ blocks: [block] }) as { blocks: Record<string, unknown>[] }
    expect(mended.blocks[0]).toBe(block)
  })

  it('a representation name written as the block kind becomes a figure of that name', () => {
    /* MEASURED live 2026-09-02, on the build that first showed the model all
       137 names: every block came back with `kind` set to a REPRESENTATION
       name -- "flowchart", "numberLine" -- and the whole lesson was refused
       for an invalid discriminator. The model said what to draw; it put the
       word in the neighbouring field. That is spelling, and the correct form
       is unambiguous: kind "figure", `as` that name. */
    const mended = blocksOf(
      mendSpelling({
        blocks: [
          { id: 'steps', kind: 'flowchart', role: 'framework', data: { shape: 'process', steps: [{ id: 'a', label: 'Start', kind: 'start' }, { id: 'b', label: 'Done', kind: 'end' }], transitions: [{ from: 'a', to: 'b' }] } },
        ],
      }),
    )[0]!
    expect(mended['kind']).toBe('figure')
    expect(mended['as']).toBe('flowchart')
    expect(validateBlock(mended, 0).ok, JSON.stringify(validateBlock(mended, 0))).toBe(true)
  })

  it('a role written where the kind belongs becomes prose in that role', () => {
    /* MEASURED live 2026-09-02, with the log that now names the value:
       `kinds written: ["prose","example","table"]`. "example" is a ROLE. The
       model said what the block IS to the argument and put the word one field
       to the left; the block is prose, in that role. Unambiguous. */
    const mended = blocksOf(
      mendSpelling({
        blocks: [{ id: 'shows-it', kind: 'example', body: 'Twelve is 2 x 2 x 3, and no other set of primes gives twelve.' }],
      }),
    )[0]!
    expect(mended['kind']).toBe('prose')
    expect(mended['role']).toBe('example')
  })

  it('a kind that contradicts a role already written is left for the gate', () => {
    const block = { id: 'x', kind: 'example', role: 'definition', body: 'Something.' }
    expect(blocksOf(mendSpelling({ blocks: [block] }))[0]).toBe(block)
  })

  it('a kind that is neither a block kind nor a representation is left for the gate', () => {
    const block = { id: 'x', kind: 'diagramme', role: 'support', body: 'Something.' }
    expect(blocksOf(mendSpelling({ blocks: [block] }))[0]).toBe(block)
  })

  it('spells the way an id is spelled', () => {
    expect(asId('Number of zeros')).toBe('number-of-zeros')
    expect(asId('  Mass (kg) ')).toBe('mass-kg')
    expect(asId('x²')).toBe('x')
    expect(asId('w'.repeat(70)).length, 'an id is at most 64 characters').toBe(64)
  })
})

describe('the whole authoring turn', () => {
  it('teaches on the first attempt when the only faults were spelling', async () => {
    const sound = JSON.parse(JSON.stringify(EXAMPLE_FOR_ROUTE['contrast'])) as { blocks: Record<string, unknown>[] }
    const table = sound.blocks.find((block) => block['kind'] === 'table')!
    const first = (table['columns'] as { key: string }[])[0]!
    const spaced = `${first.key.replace(/-/g, ' ')} in words`
    ;(table['rows'] as Record<string, unknown>[]).forEach((row) => {
      row[spaced] = row[first.key]
      delete row[first.key]
    })
    first.key = spaced
    sound.blocks[sound.blocks.length - 1]!['role'] = 'checkpoint'
    const lesson = sound as unknown as Record<string, unknown>
    delete lesson['id']
    delete lesson['question']
    const relations = lesson['relations'] as Record<string, unknown>[]
    const misplaced = relations.pop()!
    const owner = sound.blocks.find((block) => block['id'] === misplaced['from'])!
    owner['relations'] = [{ to: misplaced['to'], kind: misplaced['kind'] }]
    let attempts = 0
    const model = async () => {
      attempts += 1
      return JSON.stringify(sound)
    }
    const written = await authorConcept(model, 'what is a zero of a polynomial', [], [], 0)
    expect(written.ok, JSON.stringify(written.ok ? null : written.issues)).toBe(true)
    expect(attempts, 'a repair turn was spent on spelling').toBe(1)
  })
})
