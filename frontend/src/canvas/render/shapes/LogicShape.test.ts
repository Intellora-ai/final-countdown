import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

/* The file as text, so the tests can check the rules the SOURCE is under and
   not only the numbers it produces. `?raw` rather than `fs` because this
   package has no Node types and does not need any. */
import logicSource from './LogicShape.tsx?raw'
import { namesForShape } from '../../spec/representations'
import type { LogicData } from '../../spec/shapeInvariants'
import {
  buildLogic,
  buildTruthTable,
  depthsOf,
  describeLogic,
  FALSE_MARK,
  layoutProof,
  LogicShape,
  repeatedAssignments,
  round,
  supportPath,
  TRUE_MARK,
  wrapStatement,
} from './LogicShape'

/**
 * A truth table and a proof tree fail in opposite directions, so this file
 * pushes on both.
 *
 *   A TABLE FAILS BY LOOKING COMPLETE. Its content is which assignments hold,
 *   so a ragged row padded with anything, or a repeated assignment that keeps
 *   the row count right while losing another, produces a table that passes its
 *   own arithmetic and states something false.
 *
 *   A PROOF FAILS BY LOOKING SUPPORTED. A ring of steps justifying each other
 *   renders perfectly and proves nothing, and a step drawn above something it
 *   rests on shows a justification flowing the wrong way.
 *
 * Neither is a snapshot. A snapshot would pin whatever the code does today,
 * including the day it starts padding rows.
 */

const VARIANTS = namesForShape('logic')

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const T = true
const F = false

/** P and Q, all four assignments, in the order a textbook writes them. */
function truthTable(): LogicData {
  return {
    variant: 'truthTable',
    inputs: ['P', 'Q'],
    rows: [
      [T, T],
      [T, F],
      [F, T],
      [F, F],
    ],
  }
}

/**
 * A modus ponens with a shared lemma, so the layout meets a DAG rather than a
 * tree: `given` supports both `implies` and `conclusion`.
 */
function proof(variant: string): LogicData {
  return {
    variant: variant as LogicData['variant'],
    steps: [
      { id: 'p', statement: 'It is raining', from: [] },
      { id: 'pq', statement: 'If it rains the ground is wet', from: [] },
      { id: 'q', statement: 'The ground is wet', rule: 'modus ponens', from: ['p', 'pq'] },
      { id: 'r', statement: 'The match is cancelled', rule: 'ground rule', from: ['q', 'p'] },
    ],
  }
}

function payloadFor(variant: string): LogicData {
  return variant === 'truthTable' ? truthTable() : proof(variant)
}

/* -------------------------------------------------------------------------- */
/* 1. Coverage                                                                */
/* -------------------------------------------------------------------------- */

describe('every logic representation is drawn', () => {
  it('covers the three names in the registry', () => {
    expect([...VARIANTS].sort()).toEqual(['derivationTree', 'proofTree', 'truthTable'])
  })

  it.each(['truthTable', 'proofTree', 'derivationTree'])('%s builds', (variant) => {
    const built = buildLogic(payloadFor(variant))
    expect(built.ok, variant).toBe(true)
  })

  it('sends a table to the table form and a proof to the proof form', () => {
    const table = buildLogic(truthTable())
    const tree = buildLogic(proof('proofTree'))
    expect(table.ok && table.form).toBe('table')
    expect(tree.ok && tree.form).toBe('proof')
  })
})

/* -------------------------------------------------------------------------- */
/* 2. A ragged truth table is refused, never padded                            */
/* -------------------------------------------------------------------------- */

describe('a truth table is refused rather than repaired', () => {
  /*
   * THE ONE THAT MATTERS. A row with two values for three inputs is an
   * assignment to a different number of variables, and there is no fact about
   * which variable the missing value belonged to. Padding it with F invents a
   * claim about when the expression holds, which is the table's whole content.
   */
  it('refuses a ragged row, and says which row', () => {
    const ragged = truthTable()
    ragged.rows = [
      [T, T],
      [T],
      [F, T],
      [F, F],
    ]
    const built = buildLogic(ragged, 'block-2.data')
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.problems.some((p) => p.path === 'block-2.data.rows[1]')).toBe(true)
    expect(built.problems.some((p) => p.message.includes('1 values for 2 inputs'))).toBe(true)
  })

  it('never builds a table past a ragged row, so no padded row can reach a page', () => {
    expect(
      buildTruthTable({
        variant: 'truthTable',
        inputs: ['P', 'Q'],
        rows: [[T, T], [T], [F, T], [F, F]],
      }),
    ).toBeNull()
  })

  it('refuses a table that is missing rows', () => {
    const short = truthTable()
    short.rows = [
      [T, T],
      [F, F],
    ]
    const built = buildLogic(short)
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.problems.some((p) => p.message.includes('all 4 rows'))).toBe(true)
  })

  /*
   * THE ONE THE ROW COUNT CANNOT SEE. Four rows for two inputs is arithmetic
   * that adds up; if two of them are the same assignment then a fourth is
   * missing, and the completeness check passes on a table that is not complete.
   */
  it('refuses a repeated assignment, because it means another is missing', () => {
    const repeated = truthTable()
    repeated.rows = [
      [T, T],
      [T, F],
      [F, T],
      [T, T],
    ]
    const built = buildLogic(repeated)
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.problems.some((p) => p.message.includes('already appears above'))).toBe(true)
  })

  it('finds the repeats and nothing else', () => {
    expect(repeatedAssignments([[T], [F], [T]])).toEqual([2])
    expect(repeatedAssignments([[T, F], [F, T]])).toEqual([])
    expect(repeatedAssignments([])).toEqual([])
  })

  it('refuses a table with no inputs at all', () => {
    const built = buildLogic({ variant: 'truthTable', inputs: [], rows: [[]] })
    expect(built.ok).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* 3. What a truth table cannot say, said out loud                             */
/* -------------------------------------------------------------------------- */

describe('a truth table admits what this shape does not carry', () => {
  /*
   * `rows` holds exactly one value per input, so there is nowhere for the
   * expression's own value to live. A result column would have to be invented,
   * and a reader who is not told will read the enumeration as one.
   */
  it('says there is no result column', () => {
    const built = buildLogic(truthTable())
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.warnings.some((w) => w.includes('no result column'))).toBe(true)
  })

  it('renders T and F, not 1 and 0', () => {
    const table = buildTruthTable(truthTable())
    expect(table?.cells).toEqual([
      [TRUE_MARK, TRUE_MARK],
      [TRUE_MARK, FALSE_MARK],
      [FALSE_MARK, TRUE_MARK],
      [FALSE_MARK, FALSE_MARK],
    ])
  })

  it('says when derivation steps arrive on a table, rather than ignoring them silently', () => {
    const built = buildLogic({
      ...truthTable(),
      steps: [{ id: 'a', statement: 'unused', from: [] }],
    })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.warnings.some((w) => w.includes('steps are ignored'))).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* 4. A cycle is refused, not drawn                                            */
/* -------------------------------------------------------------------------- */

describe('a proof that justifies itself in a ring is refused', () => {
  /*
   * `checkLogic` does NOT catch this — it checks that every `from` names a step
   * that exists, which a ring satisfies perfectly. So a ring passes the shape's
   * own invariants, renders cleanly, and proves nothing: every statement in it
   * rests on another statement in it.
   */
  it('refuses a two-step ring and names the ring', () => {
    const built = buildLogic({
      variant: 'proofTree',
      steps: [
        { id: 'a', statement: 'A', rule: 'from B', from: ['b'] },
        { id: 'b', statement: 'B', rule: 'from A', from: ['a'] },
      ],
    })
    expect(built.ok).toBe(false)
    if (built.ok) return
    const ring = built.problems.find((p) => p.message.includes('ring'))
    expect(ring).toBeDefined()
    expect(ring?.message).toContain('a')
    expect(ring?.message).toContain('b')
  })

  it('refuses a longer ring too', () => {
    const built = buildLogic({
      variant: 'derivationTree',
      steps: [
        { id: 'a', statement: 'A', rule: 'r', from: ['c'] },
        { id: 'b', statement: 'B', rule: 'r', from: ['a'] },
        { id: 'c', statement: 'C', rule: 'r', from: ['b'] },
      ],
    })
    expect(built.ok).toBe(false)
  })

  it('refuses a step that rests on itself', () => {
    const built = buildLogic({
      variant: 'proofTree',
      steps: [{ id: 'a', statement: 'A', rule: 'itself', from: ['a'] }],
    })
    expect(built.ok).toBe(false)
  })

  it('does not mistake a shared lemma for a ring', () => {
    /* `p` supports both `q` and `r`, which is a DAG and perfectly ordinary. */
    expect(buildLogic(proof('proofTree')).ok).toBe(true)
  })

  it('refuses a derivation with no steps', () => {
    const built = buildLogic({ variant: 'proofTree', steps: [] })
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.problems.some((p) => p.message.includes('derives nothing'))).toBe(true)
  })

  it('leaves checkLogic’s own refusals in place', () => {
    const built = buildLogic({
      variant: 'proofTree',
      steps: [
        { id: 'a', statement: 'A', from: [] },
        /* A derived step with no named rule: an assertion, and a proof made of
           assertions proves nothing. */
        { id: 'b', statement: 'B', from: ['a'] },
      ],
    })
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.problems.some((p) => p.message.includes('name the rule'))).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* 5. Depth: longest chain, so nothing is drawn above its own support          */
/* -------------------------------------------------------------------------- */

describe('a step is drawn below everything it rests on', () => {
  /*
   * LONGEST CHAIN, NOT SHORTEST. `c` rests on `a` directly and on `a` through
   * `b`. Placed one row down it would sit level with `b`, and its supporting
   * line from `b` would run sideways or upward — a justification flowing
   * backwards, which reads as the opposite of what it is.
   */
  it('puts a step after everything that can reach it', () => {
    const depth = depthsOf([
      { id: 'a', statement: 'A', from: [] },
      { id: 'b', statement: 'B', rule: 'r', from: ['a'] },
      { id: 'c', statement: 'C', rule: 'r', from: ['a', 'b'] },
    ])
    expect(depth.get('a')).toBe(0)
    expect(depth.get('b')).toBe(1)
    expect(depth.get('c')).toBe(2)
  })

  it('gives every step that rests on nothing depth zero', () => {
    const layout = layoutProof(proof('proofTree').steps ?? [])
    for (const node of layout.nodes) expect(node.leaf).toBe(node.depth === 0)
  })

  it('places every node strictly below each of its premises', () => {
    const layout = layoutProof(proof('proofTree').steps ?? [])
    const byId = new Map(layout.nodes.map((n) => [n.id, n]))
    for (const node of layout.nodes)
      for (const parent of node.from) {
        const above = byId.get(parent)
        expect(above, `${parent} missing`).toBeDefined()
        if (above) expect(above.y + above.height, `${parent} above ${node.id}`).toBeLessThanOrEqual(node.y)
      }
  })

  /*
   * A LEMMA IS DRAWN ONCE. A proof is a DAG, so `p` supports two conclusions;
   * the tidy-tree walk the hierarchy shape uses assumes one parent per node and
   * would place it twice, at two different positions, claiming two premises
   * where there is one.
   */
  it('draws a shared premise once and links it twice', () => {
    const layout = layoutProof(proof('proofTree').steps ?? [])
    expect(layout.nodes.filter((n) => n.id === 'p')).toHaveLength(1)
    expect(layout.edges.filter((e) => e.from === 'p')).toHaveLength(2)
  })

  it('marks only what nothing rests on as the conclusion', () => {
    const layout = layoutProof(proof('proofTree').steps ?? [])
    expect(layout.finals).toEqual(['r'])
    expect(layout.nodes.filter((n) => n.final).map((n) => n.id)).toEqual(['r'])
  })

  it('centres a conclusion over the premises it rests on', () => {
    const layout = layoutProof([
      { id: 'a', statement: 'A', from: [] },
      { id: 'b', statement: 'B', from: [] },
      { id: 'c', statement: 'C', rule: 'and', from: ['a', 'b'] },
    ])
    const byId = new Map(layout.nodes.map((n) => [n.id, n]))
    const a = byId.get('a')
    const b = byId.get('b')
    const c = byId.get('c')
    if (!a || !b || !c) {
      expect.fail('the three steps were not laid out')
      return
    }
    expect(c.cx).toBeCloseTo((a.cx + b.cx) / 2, 6)
  })

  it('never lets two steps on the same row overlap', () => {
    const layout = layoutProof([
      { id: 'a', statement: 'A', from: [] },
      { id: 'b', statement: 'B', from: [] },
      { id: 'c', statement: 'C', from: [] },
      { id: 'd', statement: 'D', rule: 'r', from: ['a', 'b', 'c'] },
    ])
    const row = layout.nodes.filter((n) => n.depth === 0).sort((x, y) => x.x - y.x)
    for (let i = 1; i < row.length; i += 1) {
      const left = row[i - 1]
      const right = row[i]
      if (!left || !right) continue
      expect(right.x, `${left.id} overlaps ${right.id}`).toBeGreaterThanOrEqual(left.x + left.width)
    }
  })

  it('warns when more than one thing is left concluded', () => {
    const built = buildLogic({
      variant: 'proofTree',
      steps: [
        { id: 'a', statement: 'A', from: [] },
        { id: 'b', statement: 'B', from: [] },
      ],
    })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.warnings.some((w) => w.includes('nothing resting on them'))).toBe(true)
  })

  it('says a derivation tree carries no grammar to check against', () => {
    const built = buildLogic(proof('derivationTree'))
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.warnings.some((w) => w.includes('no grammar'))).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* 6. The inference bar                                                        */
/* -------------------------------------------------------------------------- */

describe('the inference bar spans everything the step rests on', () => {
  /*
   * A bar drawn only over the conclusion's own box would say the step follows
   * from one thing when it follows from three — the notation's single job is to
   * separate "all of this" from "therefore that".
   */
  it('reaches past both premises and the conclusion', () => {
    const layout = layoutProof(proof('proofTree').steps ?? [])
    const byId = new Map(layout.nodes.map((n) => [n.id, n]))
    const bar = layout.bars.find((b) => b.of === 'q')
    const p = byId.get('p')
    const pq = byId.get('pq')
    const q = byId.get('q')
    if (!bar || !p || !pq || !q) {
      expect.fail('the bar over q was not built')
      return
    }
    expect(bar.x1).toBeLessThanOrEqual(Math.min(p.x, pq.x, q.x))
    expect(bar.x2).toBeGreaterThanOrEqual(Math.max(p.x + p.width, pq.x + pq.width, q.x + q.width))
    expect(bar.y).toBeLessThan(q.y)
    expect(bar.rule).toBe('modus ponens')
  })

  it('gives no bar to a step that rests on nothing', () => {
    const layout = layoutProof(proof('proofTree').steps ?? [])
    expect(layout.bars.map((b) => b.of).sort()).toEqual(['q', 'r'])
  })

  it('bows a support line vertically, so it does not swing across a neighbour', () => {
    const d = supportPath({ x: 100, y: 40 }, { x: 100, y: 160 })
    const xs = [...d.matchAll(/(-?[\d.]+) -?[\d.]+/g)].map((m) => Number(m[1]))
    /* A straight drop between two steps in one column: every control point on
       the same x, so nothing bulges sideways over whatever sits between. */
    expect(new Set(xs).size).toBe(1)
    const ys = [...d.matchAll(/-?[\d.]+ (-?[\d.]+)/g)].map((m) => Number(m[1]))
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(40)
    expect(Math.max(...ys)).toBeLessThanOrEqual(160)
  })
})

/* -------------------------------------------------------------------------- */
/* 7. Determinism, rounding and the frame                                      */
/* -------------------------------------------------------------------------- */

describe('the same proof draws the same picture', () => {
  it.each(['truthTable', 'proofTree', 'derivationTree'])('%s is identical on a second build', (variant) => {
    expect(JSON.stringify(buildLogic(payloadFor(variant)))).toBe(
      JSON.stringify(buildLogic(payloadFor(variant))),
    )
  })

  /*
   * A coordinate that serialises as 12.100000000000001 on one side of a
   * hydration and 12.1 on the other is a mismatch that costs an afternoon, and
   * this codebase has already paid for one.
   */
  it('rounds every generated coordinate to two decimals', () => {
    const layout = layoutProof(proof('proofTree').steps ?? [])
    for (const node of layout.nodes)
      for (const value of [node.x, node.y, node.cx, node.cy]) expect(value).toBe(round(value))
    for (const bar of layout.bars)
      for (const value of [bar.x1, bar.x2, bar.y]) expect(value).toBe(round(value))
    for (const edge of layout.edges)
      for (const number of [...edge.d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0])))
        expect(number).toBe(round(number))
    expect(layout.width).toBe(round(layout.width))
    expect(layout.height).toBe(round(layout.height))
  })

  it('emits only finite numbers', () => {
    const layout = layoutProof(proof('derivationTree').steps ?? [])
    for (const node of layout.nodes)
      for (const value of [node.x, node.y, node.cx, node.cy, node.width, node.height])
        expect(Number.isFinite(value)).toBe(true)
    for (const edge of layout.edges)
      for (const number of [...edge.d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0])))
        expect(Number.isFinite(number)).toBe(true)
  })

  it('keeps every node, bar and support line inside the frame', () => {
    /* A wide fan and a deep chain: the two ways a layered layout overflows. */
    const wide = Array.from({ length: 8 }, (_, i) => ({ id: `l${i}`, statement: `Leaf ${i}`, from: [] }))
    const deep = [
      ...wide,
      { id: 'm', statement: 'Middle', rule: 'and', from: wide.map((w) => w.id) },
      { id: 'top', statement: 'Top', rule: 'therefore', from: ['m'] },
    ]

    for (const steps of [proof('proofTree').steps ?? [], deep]) {
      const layout = layoutProof(steps)
      for (const node of layout.nodes) {
        expect(node.x, node.id).toBeGreaterThanOrEqual(0)
        expect(node.y, node.id).toBeGreaterThanOrEqual(0)
        expect(node.x + node.width, node.id).toBeLessThanOrEqual(layout.width)
        expect(node.y + node.height, node.id).toBeLessThanOrEqual(layout.height)
      }
      for (const bar of layout.bars) {
        expect(bar.x1, bar.of).toBeGreaterThanOrEqual(0)
        expect(bar.x2, bar.of).toBeLessThanOrEqual(layout.width)
        expect(bar.y, bar.of).toBeGreaterThan(0)
      }
      for (const edge of layout.edges) {
        const numbers = [...edge.d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
        expect(numbers.length).toBeGreaterThan(0)
        for (const number of numbers) expect(number).toBeGreaterThanOrEqual(0)
      }
    }
  })
})

/* -------------------------------------------------------------------------- */
/* 8. Words                                                                    */
/* -------------------------------------------------------------------------- */

describe('the logic is available as a sentence', () => {
  it('reads a proof as prose, naming the rule at each step', () => {
    const text = describeLogic(proof('proofTree'))
    expect(text).toContain('It is raining is given')
    expect(text).toContain('follows from')
    expect(text).toContain('modus ponens')
  })

  it('reads a table as its assignments', () => {
    const text = describeLogic(truthTable())
    expect(text).toContain('P, Q')
    expect(text).toContain(`${TRUE_MARK} ${FALSE_MARK}`)
  })

  it('wraps a long statement onto exactly two lines, never three', () => {
    expect(wrapStatement('It rains')).toEqual(['It rains'])
    expect(wrapStatement('If it rains then the ground gets wet')).toHaveLength(2)
  })
})

/* -------------------------------------------------------------------------- */
/* 9. The rules the source itself is under                                     */
/* -------------------------------------------------------------------------- */

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

describe('the renderer obeys the rules it was written under', () => {
  it('strips comments the way these checks assume', () => {
    expect(withoutComments('a /* Math.random */ b')).toBe('a  b')
    expect(withoutComments('const x = Math.random()')).toContain('Math.random')
  })

  it('contains no raw colour anywhere — Law 4', () => {
    expect(logicSource).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(logicSource).not.toMatch(/\brgba?\(/)
    expect(logicSource).not.toMatch(/\bhsla?\(/)
  })

  it('takes every painted value from the token layer', () => {
    const code = withoutComments(logicSource)
    for (const match of code.matchAll(/(?:stroke|fill)=\{?"?([^"}\s]+)/g)) {
      const value = match[1] ?? ''
      expect(value === 'none' || value.startsWith('tokens.') || value.startsWith('node.'), `painted with ${value}`).toBe(true)
    }
  })

  it('reaches for no clock, no random number and no measurement', () => {
    const code = withoutComments(logicSource)
    expect(code).not.toMatch(/\bMath\.random\b/)
    expect(code).not.toMatch(/\bDate\.now\b/)
    expect(code).not.toMatch(/\bnew Date\b/)
    expect(code).not.toMatch(/\bperformance\.now\b/)
    expect(code).not.toMatch(/\bdocument\./)
    expect(code).not.toMatch(/getBoundingClientRect|getComputedStyle|measureText/)
  })

  /*
   * REGRESSION GUARD. An inference bar is horizontal, so its bounding box is
   * zero-height, and `lc-bloom`'s region is a PERCENTAGE of that box — 500% of
   * zero is zero, so the bar paints nothing while every attribute reads
   * correct. That is exactly how the flow connectors once shipped invisible.
   */
  it('never applies the bloom filter, which silently erases a flat path', () => {
    expect(logicSource).not.toMatch(/url\(#lc-bloom\)/)
  })

  it('glows connectors with the double stroke the design system provides', () => {
    expect(logicSource).toContain('lc-flow__link-glow')
  })

  it('reuses the shape layer’s cycle finder rather than writing a second one', () => {
    /* Two implementations of "is there a cycle" is two chances to disagree, and
       the graph shape's is already tested. */
    expect(logicSource).toContain('findCycle')
  })
})

/* -------------------------------------------------------------------------- */
/* 10. One smoke render                                                        */
/* -------------------------------------------------------------------------- */

/*
 * The builders are where the thinking is and where the rest of this file looks.
 * This is the one thing a pure-function test cannot catch: a component that
 * throws, or that puts a NaN into an attribute — which blanks the element with
 * no error in the console and no mark on the page.
 */
describe('the component', () => {
  it.each(VARIANTS)('renders %s with no NaN in any attribute', (variant) => {
    const html = renderToStaticMarkup(
      createElement(LogicShape, { data: payloadFor(variant), at: 'block-1' }),
    )
    expect(html, variant).not.toContain('NaN')
  })

  it('renders a truth table as a real table, with a header per input', () => {
    const html = renderToStaticMarkup(createElement(LogicShape, { data: truthTable() }))
    expect(html).toContain('<table')
    expect(html).toContain('<th')
    expect((html.match(/<tr>/g) ?? []).length).toBe(5) // one header row plus four
    expect((html.match(/>T</g) ?? []).length).toBe(4)
    expect((html.match(/>F</g) ?? []).length).toBe(4)
  })

  it('draws a proof as an svg with the Gentzen bars', () => {
    const html = renderToStaticMarkup(createElement(LogicShape, { data: proof('proofTree') }))
    expect(html).toContain('<svg')
    expect(html).toContain('<line')
    expect(html).toContain('modus ponens')
  })

  /*
   * A DERIVATION TREE GETS NO BAR. The bar means "everything above this line
   * entails what is below it", and a grammar expansion is not making a claim
   * about entailment.
   */
  it('draws a derivation tree without them', () => {
    const html = renderToStaticMarkup(createElement(LogicShape, { data: proof('derivationTree') }))
    expect(html).toContain('<svg')
    expect(html).not.toContain('<line')
  })

  it('shows the refusal instead of the diagram, never both', () => {
    const html = renderToStaticMarkup(
      createElement(LogicShape, {
        data: {
          variant: 'proofTree',
          steps: [
            { id: 'a', statement: 'A', rule: 'r', from: ['b'] },
            { id: 'b', statement: 'B', rule: 'r', from: ['a'] },
          ],
        },
      }),
    )
    expect(html).toContain('lc-refusal')
    expect(html).not.toContain('<svg')
  })
})
