import { describe, it, expect, beforeEach } from 'vitest'
import { register, contractFor, registeredKinds, resetRegistry, select } from './registry'
import { textContract } from './representations/text'
import { tableContract } from './representations/table'
import { appearanceKeysDeep } from './validate'
import type { LessonElement, RepresentationContext } from './types'

/* THE CONTRACT LAYER'S GUARDS.
 *
 * Two claims are under test. That the lifecycle is honest — a payload that
 * arrives slightly wrong renders WITH its repair stated, rather than throwing
 * or silently changing. And that the plug-in property is real — the selector
 * knows nothing about what is registered, so a new representation costs one
 * file rather than an edit to the engine.
 */

const ctx = (over: Partial<RepresentationContext> = {}): RepresentationContext => ({
  element: { id: 'e', kind: 'text', purpose: 'explain', payload: {} },
  sourceDataProfile: {},
  viewport: { width: 1408, height: 768 },
  availableRenderers: ['TextPanel', 'TablePanel'],
  existingRelationships: [],
  accessibilityRequirements: { contrastRatio: 4.5, minTapTarget: 40, textAlternativeRequired: true },
  ...over,
})

const el = (kind: string, payload: unknown): LessonElement => ({
  id: 'x', kind: kind as never, purpose: 'explain', payload,
})

beforeEach(() => {
  resetRegistry()
  register(textContract)
  register(tableContract)
})

describe('the envelope refuses appearance', () => {
  it('rejects a payload carrying position, size, colour or markup — at any depth', () => {
    for (const bad of [
      { paragraphs: ['a'], x: 10 },
      { paragraphs: ['a'], color: '#fff' },
      { paragraphs: ['a'], style: { padding: 4 } },
      { columns: [{ key: 'a', label: 'A', type: 'text', width: 200 }], rows: [] },
      { columns: [{ key: 'a', label: 'A', type: 'text', align: 'center' }], rows: [] },
    ]) {
      expect(appearanceKeysDeep(bad), JSON.stringify(bad)).toBeTruthy()
    }
  })

  it('allows a payload that describes only meaning', () => {
    expect(appearanceKeysDeep({ paragraphs: ['a', 'b'], emphasis: ['pressure'] })).toBeNull()
    expect(appearanceKeysDeep({
      columns: [{ key: 'p', label: 'Pressure', type: 'number', unit: 'kPa' }],
      rows: [{ p: 165 }],
    })).toBeNull()
  })

  it('refuses an unknown field rather than stripping it', () => {
    /* A stripped key is a smuggling route: a generator that ships it and sees
     * it vanish will keep shipping it. */
    const r = textContract.validate({ paragraphs: ['a'], nonsense: 1 })
    expect(r.ok).toBe(false)
    expect(r.issues[0].message).toMatch(/refused, not stripped/)
  })
})

describe('validation repairs out loud, and never in silence', () => {
  it('drops an unusable paragraph and says so', () => {
    const r = textContract.validate({ paragraphs: ['good', '', 42] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.paragraphs).toEqual(['good'])
    expect(r.issues).toHaveLength(2)
    expect(r.issues.every((i) => i.level === 'repair')).toBe(true)
  })

  it('fills a missing cell with a stated repair rather than a silent blank', () => {
    const r = tableContract.validate({
      columns: [{ key: 'a', label: 'A', type: 'text' }, { key: 'b', label: 'B', type: 'number' }],
      rows: [{ a: 'x' }],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.issues.some((i) => i.path === 'rows[0].b')).toBe(true)
  })

  it('repairs an unknown column type to text with a notice', () => {
    const r = tableContract.validate({
      columns: [{ key: 'a', label: 'A', type: 'hologram' }],
      rows: [{ a: '1' }],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.columns[0].type).toBe('text')
    expect(r.issues[0].message).toMatch(/hologram/)
  })
})

describe('capacity discloses — it never shrinks and never clips', () => {
  it('400 words of prose discloses rather than overflowing', () => {
    const words = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ')
    const parsed = textContract.validate({ paragraphs: [words] })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const n = textContract.normalize(parsed.value, ctx())
    const c = ctx({ viewport: { width: 420, height: 700 } })

    const cap = textContract.capacity(n, c)
    const plans = textContract.disclosure(n, c)

    expect(cap.demand).toBeGreaterThan(cap.supply)
    expect(plans).toHaveLength(1)
    expect(plans[0].strategy).toBe('truncate_expand')
    expect(plans[0].reachableVia).toBe('expand')
    /* Every character is still reachable. */
    expect(plans[0].initiallyVisible).toBeLessThan(cap.demand)
    expect(plans[0].notice).toBeTruthy()
  })

  it('a 60-row table paginates, and every row stays reachable', () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ a: `row ${i}`, b: i }))
    const parsed = tableContract.validate({
      columns: [{ key: 'a', label: 'Item', type: 'text' }, { key: 'b', label: 'Value', type: 'number' }],
      rows,
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const n = tableContract.normalize(parsed.value, ctx())
    const plans = tableContract.disclosure(n, ctx())

    expect(plans[0].strategy).toBe('paginate')
    expect(plans[0].reachableVia).toBe('pager')
    expect(plans[0].notice).toMatch(/60 rows/)
    expect(tableContract.invariants(n, ctx()).find((i) => i.name === 'everyRowReachable')?.holds).toBe(true)
  })

  it('200+ rows aggregate to a chart with an accessible data view', () => {
    const rows = Array.from({ length: 260 }, (_, i) => ({ a: `r${i}`, b: i }))
    const parsed = tableContract.validate({
      columns: [{ key: 'a', label: 'Item', type: 'text' }, { key: 'b', label: 'Value', type: 'number' }],
      rows,
    })
    if (!parsed.ok) throw new Error('should validate')
    const n = tableContract.normalize(parsed.value, ctx())
    const plan = tableContract.disclosure(n, ctx())[0]
    expect(plan.strategy).toBe('aggregate')
    expect(plan.reachableVia).toBe('drawer')
  })

  it('more than ten columns pivots instead of squeezing', () => {
    const columns = Array.from({ length: 14 }, (_, i) => ({ key: `c${i}`, label: `C${i}`, type: 'number' as const }))
    const parsed = tableContract.validate({ columns, rows: [Object.fromEntries(columns.map((c) => [c.key, 1]))] })
    if (!parsed.ok) throw new Error('should validate')
    const n = tableContract.normalize(parsed.value, ctx())
    const plans = tableContract.disclosure(n, ctx())
    expect(plans.some((p) => p.strategy === 'split_block')).toBe(true)
  })

  it('capacity never reduces a type size to make content fit', () => {
    /* The forbidden adaptation. Capacity may change how MUCH is visible; it
     * may never change how large anything is. */
    const small = ctx({ viewport: { width: 375, height: 600 } })
    const large = ctx({ viewport: { width: 1408, height: 900 } })
    const parsed = textContract.validate({ paragraphs: ['hello world'] })
    if (!parsed.ok) throw new Error('should validate')
    const n = textContract.normalize(parsed.value, small)
    const a = textContract.capacity(n, small)
    const b = textContract.capacity(n, large)
    /* Different supply, identical units and identical demand. */
    expect(a.unit).toBe(b.unit)
    expect(a.demand).toBe(b.demand)
    expect(a.supply).not.toBe(b.supply)
  })
})

describe('alignment is derived from column type, never authored', () => {
  const build = (type: string) => {
    const parsed = tableContract.validate({
      columns: [{ key: 'a', label: 'A', type }],
      rows: [{ a: 1 }],
    })
    if (!parsed.ok) throw new Error('should validate')
    const n = tableContract.normalize(parsed.value, ctx())
    return (tableContract.derive(n, ctx()) as any).columns[0]
  }

  it('right-aligns every numeric type and left-aligns text', () => {
    for (const t of ['number', 'currency', 'percent', 'formula']) {
      expect(build(t).align, t).toBe('right')
    }
    expect(build('text').align).toBe('left')
    expect(build('category').align).toBe('left')
    expect(build('date').align).toBe('left')
    expect(build('boolean').align).toBe('center')
  })

  it('puts tabular figures on every numeric column', () => {
    /* The one line that separates a real table from a fake one: proportional
     * digits jitter, tabular figures line up. */
    for (const t of ['number', 'currency', 'percent', 'formula']) {
      expect(build(t).tabularNums, t).toBe(true)
    }
    expect(build('text').tabularNums).toBe(false)
  })

  it('puts the unit in the header, once', () => {
    const parsed = tableContract.validate({
      columns: [{ key: 'p', label: 'Pressure', type: 'number', unit: 'kPa' }],
      rows: [{ p: 165 }],
    })
    if (!parsed.ok) throw new Error('should validate')
    const n = tableContract.normalize(parsed.value, ctx())
    expect((tableContract.derive(n, ctx()) as any).columns[0].header).toBe('Pressure (kPa)')
  })
})

describe('selection is deterministic and explains itself', () => {
  it('returns the same answer every run', () => {
    const e = el('text', { paragraphs: ['a stable answer'] })
    const results = Array.from({ length: 5 }, () => select(e, ctx()))
    expect(new Set(results.map((r) => r.selected)).size).toBe(1)
    expect(new Set(results.map((r) => r.fitness)).size).toBe(1)
  })

  it('names every candidate, its score, and why it lost', () => {
    const r = select(el('table', { columns: [], rows: [] }), ctx())
    expect(r.candidates.length).toBeGreaterThan(1)
    const table = r.candidates.find((c) => c.kind === 'table')
    expect(table?.rejected).toMatch(/at least one column/)
    expect(r.reason).toBeTruthy()
  })

  it('holds a tie in favour of the kind the lesson declared', () => {
    const r = select(el('text', { paragraphs: ['x'] }), ctx())
    expect(r.selected).toBe('text')
    expect(r.fallbackFrom).toBeUndefined()
  })

  it('only chooses among contracts that can read the SAME payload', () => {
    /* A boundary worth stating, because it is easy to expect otherwise.
     * select() compares representations that can all validate this payload —
     * it does not reshape data to see whether another kind might suit it. A
     * table payload is not valid text input, so text is REJECTED here rather
     * than outscored, and table wins by being the only reader.
     *
     * Converting between shapes is degrade()'s job, and the test below covers
     * it. Keeping the two apart is what stops the selector from silently
     * rewriting a lesson's data into a different form. */
    const r = select(el('table', {
      columns: [{ key: 'a', label: 'A', type: 'text' }],
      rows: [{ a: 'one' }, { a: 'two' }],
    }), ctx())
    expect(r.selected).toBe('table')
    const text = r.candidates.find((c) => c.kind === 'text')
    expect(text?.rejected, 'text cannot read a table payload').toBeTruthy()

    /* And the contract itself says this should not stay a table. */
    const parsed = tableContract.validate(r.candidates.length ? {
      columns: [{ key: 'a', label: 'A', type: 'text' }],
      rows: [{ a: 'one' }, { a: 'two' }],
    } : {})
    if (!parsed.ok) throw new Error('should validate')
    const n = tableContract.normalize(parsed.value, ctx())
    const plan = tableContract.degrade(n, ctx())
    expect(plan?.to).toBe('text')
    expect(plan?.reason).toMatch(/single-column table is a list/)
  })

  it('prefers a better-scoring kind when both can read the payload', () => {
    /* The genuine fallback path: two contracts, one payload, higher fitness
     * wins and the loser is named. */
    resetRegistry()
    register(textContract)
    register({
      ...textContract,
      kind: 'timeline' as never,
      renderer: 'TimelinePanel',
      fitness: () => 0.99,
    })
    const r = select(el('text', { paragraphs: ['a', 'b'] }), ctx())
    expect(r.selected).toBe('timeline')
    expect(r.fallbackFrom).toBe('text')
    expect(r.reason).toMatch(/serves this content better/)
  })

  it('reports honestly when nothing can render the content', () => {
    resetRegistry()
    const r = select(el('table', { columns: [], rows: [] }), ctx())
    expect(r.selected).toBeNull()
    expect(r.reason).toMatch(/Nothing could render/)
  })
})

describe('the registry is a plug-in point, not a switch statement', () => {
  it('knows only what was registered', () => {
    expect(registeredKinds()).toEqual(['table', 'text'])
    expect(contractFor('molecule')).toBeNull()
  })

  it('refuses a second contract for one kind', () => {
    /* Two contracts for a kind makes the selector's answer depend on import
     * order, which is a bug that only appears in production. */
    expect(() => register(textContract)).toThrow(/already registered/)
  })

  it('lets a new representation join without the engine knowing what it is', () => {
    register({
      kind: 'molecule' as never,
      renderer: 'MoleculePanel',
      validate: (p) => ({ ok: true, value: p, issues: [] }),
      normalize: (p) => p,
      fitness: () => 0.99,
      capacity: () => ({ unit: 'items', demand: 1, supply: 10, span: { min: 4, pref: 6, max: 12 }, rows: { min: 2, pref: 4, max: 8 } }),
      disclosure: () => [],
      derive: () => ({}),
      invariants: () => [],
      degrade: () => null,
    })
    expect(registeredKinds()).toContain('molecule')
    /* The selector picked it without a single line of engine code changing. */
    expect(select(el('molecule', {}), ctx()).selected).toBe('molecule')
  })
})

describe('degradation chooses honesty over spectacle', () => {
  it('turns 200-character cells back into prose', () => {
    const long = 'x'.repeat(240)
    const parsed = tableContract.validate({
      columns: [{ key: 'a', label: 'A', type: 'text' }, { key: 'b', label: 'B', type: 'text' }],
      rows: [{ a: long, b: 'short' }],
    })
    if (!parsed.ok) throw new Error('should validate')
    const n = tableContract.normalize(parsed.value, ctx())
    const plan = tableContract.degrade(n, ctx())
    expect(plan?.to).toBe('text')
    expect(plan?.reason).toMatch(/prose/)
  })

  it('never degrades text — it is the floor', () => {
    const parsed = textContract.validate({ paragraphs: ['anything'] })
    if (!parsed.ok) throw new Error('should validate')
    const n = textContract.normalize(parsed.value, ctx())
    expect(textContract.degrade(n, ctx())).toBeNull()
  })
})
