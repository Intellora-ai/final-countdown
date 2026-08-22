import { describe, it, expect } from 'vitest'
import { diagramContract } from './diagram'
import { equationContract } from './equation'
import type { RepresentationContext } from '../types'

const ctx = (w = 1408, h = 768): RepresentationContext => ({
  element: { id: 'x', kind: 'diagram', purpose: 'sequence', payload: {} },
  sourceDataProfile: {}, viewport: { width: w, height: h },
  availableRenderers: [], existingRelationships: [],
  accessibilityRequirements: { contrastRatio: 4.5, minTapTarget: 40, textAlternativeRequired: true },
})

const chain = (n: number) => ({
  nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, label: `Step ${i}` })),
  edges: Array.from({ length: Math.max(0, n - 1) }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}` })),
})

describe('diagram — the contract that was missing', () => {
  it('accepts the 2008 crisis chain that previously resolved to null', () => {
    const r = diagramContract.validate({
      nodes: [
        { id: 'rates', label: 'Low interest rates' },
        { id: 'lending', label: 'Subprime lending' },
        { id: 'default', label: 'Borrowers default' },
      ],
      edges: [{ from: 'rates', to: 'lending', kind: 'causes' }, { from: 'lending', to: 'default', kind: 'causes' }],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.nodes).toHaveLength(3)
    expect(r.value.edges).toHaveLength(2)
  })

  it('drops a connector to a node that does not exist, and says which', () => {
    /* The layout validator refuses a frame with a dangling edge, so letting
     * one through here would guarantee a repair pass for a problem visible
     * right now. */
    const r = diagramContract.validate({
      nodes: [{ id: 'a', label: 'A' }],
      edges: [{ from: 'a', to: 'ghost' }],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.edges).toHaveLength(0)
    expect(r.issues[0].message).toMatch(/'ghost' is not a node/)
  })

  it('drops a self-referencing edge', () => {
    const r = diagramContract.validate({
      nodes: [{ id: 'a', label: 'A' }], edges: [{ from: 'a', to: 'a' }],
    })
    if (!r.ok) return
    expect(r.value.edges).toHaveLength(0)
    expect(r.issues[0].message).toMatch(/pointed at itself/)
  })

  it('refuses a payload carrying coordinates', () => {
    const r = diagramContract.validate({
      nodes: [{ id: 'a', label: 'A', x: 10, y: 20 }], edges: [],
    })
    expect(r.ok).toBe(false)
    expect(r.issues[0].message).toMatch(/carries appearance/)
  })

  it('hands the renderer the SHAPE so capacity and drawing cannot disagree', () => {
    for (const [count, shape] of [[4, 'row'], [7, 'serpentine'], [12, 'column'], [20, 'phases']] as const) {
      const parsed = diagramContract.validate(chain(count))
      if (!parsed.ok) throw new Error('should validate')
      const n = diagramContract.normalize(parsed.value, ctx())
      expect((diagramContract.derive(n, ctx()) as { shape: string }).shape, `${count} nodes`).toBe(shape)
    }
  })

  it('scores nodes without relationships as barely fit, and degrades them to prose', () => {
    const parsed = diagramContract.validate({
      nodes: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }], edges: [],
    })
    if (!parsed.ok) throw new Error('should validate')
    const n = diagramContract.normalize(parsed.value, ctx())
    expect(diagramContract.fitness(n, ctx())).toBeLessThan(0.3)
    const plan = diagramContract.degrade(n, ctx())
    expect(plan?.to).toBe('text')
    expect(plan?.reason).toMatch(/list, not a diagram/)
  })

  it('groups a long chain into phases rather than dropping nodes', () => {
    const parsed = diagramContract.validate(chain(20))
    if (!parsed.ok) throw new Error('should validate')
    const n = diagramContract.normalize(parsed.value, ctx())
    const plan = diagramContract.disclosure(n, ctx())[0]
    expect(plan.strategy).toBe('progressive_disclosure')
    expect(plan.notice).toMatch(/20 steps/)
    /* Every node still exists — grouping changes what is expanded. */
    expect(n.nodes).toHaveLength(20)
  })

  it('reports a dangling edge as a broken invariant', () => {
    const n = { nodes: [{ id: 'a', label: 'A' }], edges: [{ from: 'a', to: 'gone' }] }
    const inv = diagramContract.invariants(n, ctx())
    expect(inv.find((i) => i.name === 'everyEdgeResolves')?.holds).toBe(false)
  })
})

describe('equation — mathematics as an argument', () => {
  const quadratic = {
    steps: [
      { latex: 'ax^2 + bx + c = 0', note: 'Start with the general form.' },
      { latex: 'x^2 + \\frac{b}{a}x + \\frac{c}{a} = 0', note: 'Divide through by a.' },
      { latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}', note: 'Solve.' },
    ],
    variables: [{ symbol: 'a', meaning: 'Coefficient of the squared term' }],
  }

  it('accepts the quadratic derivation', () => {
    const r = equationContract.validate(quadratic)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.steps).toHaveLength(3)
  })

  it('knows a derivation from a single fact', () => {
    const parsed = equationContract.validate(quadratic)
    if (!parsed.ok) throw new Error('should validate')
    expect(equationContract.normalize(parsed.value, ctx()).isDerivation).toBe(true)

    const one = equationContract.validate({ steps: [{ latex: 'PV = nRT' }] })
    if (!one.ok) throw new Error('should validate')
    expect(equationContract.normalize(one.value, ctx()).isDerivation).toBe(false)
  })

  it('refuses LaTeX that can reach outside the equation', () => {
    /* KaTeX refuses these with trust:false; refusing them here too means a bad
     * payload fails at validation rather than depending on one renderer option
     * staying set. */
    for (const bad of ['\\href{http://x}{click}', '\\url{http://x}', '\\htmlClass{a}{b}', '\\includegraphics{x}']) {
      const r = equationContract.validate({ steps: [{ latex: bad }] })
      expect(r.ok, bad).toBe(false)
      expect(r.issues.some((i) => /reach outside the equation/.test(i.message)), bad).toBe(true)
    }
  })

  it('refuses an expression that is not one equation', () => {
    const r = equationContract.validate({ steps: [{ latex: 'x'.repeat(500) }] })
    expect(r.ok).toBe(false)
    expect(r.issues[0].message).toMatch(/not one equation/)
  })

  it('names symbols that are used but never defined', () => {
    const parsed = equationContract.validate({
      steps: [{ latex: 'E = mc^2' }],
      variables: [{ symbol: 'E', meaning: 'Energy' }],
    })
    if (!parsed.ok) throw new Error('should validate')
    const n = equationContract.normalize(parsed.value, ctx())
    const d = equationContract.derive(n, ctx()) as { undefinedSymbols: string[] }
    /* m and c are used and undefined — the learner should not have to notice. */
    expect(d.undefinedSymbols).toContain('m')
    expect(d.undefinedSymbols).toContain('c')
    expect(d.undefinedSymbols).not.toContain('E')
  })

  it('wants a narrow column, not the full width', () => {
    const parsed = equationContract.validate(quadratic)
    if (!parsed.ok) throw new Error('should validate')
    const n = equationContract.normalize(parsed.value, ctx())
    const cap = equationContract.capacity(n, ctx())
    expect(cap.span.pref).toBeLessThanOrEqual(6)
  })

  it('never degrades — nothing states a relationship more honestly', () => {
    const parsed = equationContract.validate(quadratic)
    if (!parsed.ok) throw new Error('should validate')
    const n = equationContract.normalize(parsed.value, ctx())
    expect(equationContract.degrade(n, ctx())).toBeNull()
  })

  it('refuses a payload carrying styling', () => {
    const r = equationContract.validate({ steps: [{ latex: 'x=1' }], color: '#fff' })
    expect(r.ok).toBe(false)
  })
})
