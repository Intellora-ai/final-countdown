/**
 * THE PROMPT AND THE SCHEMA MUST AGREE, IN BOTH DIRECTIONS.
 *
 * The author prompt prints a "LEGAL VALUES" block: closed lists the model is
 * told to choose from, under the sentence "A word outside them is refused."
 * The schema in `spec/` is the thing that refuses. Measured on live lessons
 * (2026-09-02): the prompt offered `tone: success` and `relations[].kind:
 * leads-to`, neither of which the schema accepts -- so a model that OBEYED
 * was refused -- and never mentioned `insight`, `result`, `aside` or
 * `derives`, so four legal values could never be written.
 *
 * This test reads both, so they cannot drift again. It does not know the
 * values itself: it asks the prompt what it offers, and asks the schema
 * whether it would accept each one -- and the other way round.
 */
import { describe, expect, it } from 'vitest'
import { conceptRequest } from './concept'
import { Block, Emphasis, ProseBlock, Relation, TableBlock, Tone } from '../spec/spec'
import { BlockRole } from '../spec/roles'
import { REPRESENTATION_NAMES, SHAPES } from '../spec/representations'

/** The prompt as the model reads it, one line at a time. */
function promptLines(): string[] {
  return conceptRequest('how does a magnet work').split('\n')
}

/** The lists the prompt offers, keyed by the field name it printed them under. */
function offered(): Map<string, string[]> {
  const lists = new Map<string, string[]>()
  const lines = promptLines()
  const start = lines.findIndex((line) => line.startsWith('LEGAL VALUES'))
  expect(start, 'the prompt no longer prints a LEGAL VALUES block').toBeGreaterThanOrEqual(0)
  let field: string | null = null
  for (const line of lines.slice(start + 1)) {
    const head = /^- (?:a table column )?"([^"]+)": (.*)$/.exec(line)
    if (head !== null) {
      field = head[1]!
      lists.set(field, head[2]!.split('|').map((v) => v.trim()).filter((v) => v !== ''))
      continue
    }
    if (line.startsWith(' ')) {
      /* A list continues on a two-space line; a gloss in brackets or deeper
         indentation belongs to the field but offers nothing. */
      if (field !== null && /^  [a-z]/.test(line)) {
        lists.get(field)!.push(...line.split('|').map((v) => v.trim()).filter((v) => v !== ''))
      }
      continue
    }
    field = null
    if (lists.size > 0 && !line.startsWith('- ')) break
  }
  return lists
}

/** An enum's values, through any `.default()` wrapper. */
function optionsOf(schema: unknown): string[] {
  let s = schema as { options?: string[]; _def?: { innerType?: unknown } }
  while (s.options === undefined && s._def?.innerType !== undefined) s = s._def.innerType as typeof s
  return s.options ?? []
}

const kinds: string[] = Block.options.map((option) => option.shape.kind.value)
const columnType = TableBlock.shape.columns.element.shape.type

const prose = { id: 'p1', kind: 'prose', role: 'definition', body: 'A magnet pulls iron towards itself.' }
const table = { id: 't1', kind: 'table', role: 'definition', columns: [{ key: 'a', label: 'A' }], rows: [{ a: 'x' }] }

/** What the schema says about one value of one field. */
function accepts(field: string, value: string): boolean {
  switch (field) {
    case 'kind':
      return kinds.includes(value)
    case 'relations[].kind':
      return Relation.safeParse({ from: 'p1', to: 'p2', kind: value }).success
    case 'type':
      return TableBlock.safeParse({ ...table, columns: [{ key: 'a', label: 'A', type: value }] }).success
    default:
      return ProseBlock.safeParse({ ...prose, [field]: value }).success
  }
}

/** What the schema accepts for one field, so the prompt can be asked to offer it all. */
const legal: Record<string, string[]> = {
  kind: kinds,
  role: BlockRole.options,
  depth: optionsOf(ProseBlock.shape.depth),
  emphasis: Emphasis.options,
  tone: Tone.options,
  type: optionsOf(columnType),
  'relations[].kind': Relation.shape.kind.options,
}

describe('the legal values the prompt offers', () => {
  const lists = offered()

  it('covers every field the schema closes', () => {
    expect([...lists.keys()].sort()).toEqual(Object.keys(legal).sort())
  })

  it('are all accepted by the schema -- a model that obeys is never refused', () => {
    const refused = [...lists].flatMap(([field, values]) =>
      values.filter((value) => !accepts(field, value)).map((value) => `${field}: ${value}`),
    )
    expect(refused, 'offered by the prompt, refused by the schema').toEqual([])
  })

  it('offer everything the schema accepts -- no legal value is unreachable', () => {
    const missing = Object.entries(legal).flatMap(([field, values]) =>
      values.filter((value) => !(lists.get(field) ?? []).includes(value)).map((value) => `${field}: ${value}`),
    )
    expect(missing, 'accepted by the schema, never offered to the model').toEqual([])
  })
})

describe('the 137 representations the model may draw', () => {
  /* E1/E2, measured 2026-09-02: the prompt named four representations as
     examples and told the model not to guess the rest -- so 133 of the 137
     were unreachable in practice, and the local models invented `data.shape`
     values instead and were refused. The registry is the contract; the prompt
     must carry it, and neither may drift from the other. */
  const prompt = conceptRequest('how does a magnet work')

  it('offers every name the registry has', () => {
    const missing = REPRESENTATION_NAMES.filter((name) => !new RegExp(`\\b${name}\\b`).test(prompt))
    expect(missing, 'names the schema accepts that the model is never shown').toEqual([])
  })

  it('offers no name the registry does not have', () => {
    const known = new Set<string>(REPRESENTATION_NAMES)
    const line = prompt.split('\n').find((one) => one.includes('freeBodyDiagram') || one.includes('flowchart')) ?? ''
    const offered = line.match(/\b[a-z][a-zA-Z0-9]{2,}\b/g) ?? []
    const invented = offered.filter((word) => /[A-Z]/.test(word) && !known.has(word))
    expect(invented, 'the prompt offers a representation that does not exist').toEqual([])
  })

  it('says what payload each shape needs, in the words the schema uses', () => {
    for (const shape of SHAPES) {
      expect(prompt, `nothing tells the model what a "${shape}" payload looks like`).toContain(shape)
    }
    /* The exact field names, so a model that follows the prompt is accepted. */
    for (const field of ['series', 'samples', 'parts', 'rows', 'columns', 'nodes', 'edges', 'links', 'items', 'steps', 'transitions', 'elements']) {
      expect(prompt, `the field "${field}" is never named`).toContain(field)
    }
  })
})
