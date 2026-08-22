// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { PanelSurface } from './PanelSurface'
import { SectionHeading, Badge } from './SectionHeading'
import { SceneLabel } from './SceneLabel'
import { RelationArrow, ArrowHead, relationPath } from './RelationArrow'
import { DiagramNode } from './DiagramNode'
import { color, ink, typeLegacy, arrow, radius } from '../design/tokens'

/* THE VISUAL LANGUAGE, TESTED AS COMPONENTS.
 *
 * These primitives were extracted out of GasPressureScene.tsx so a second
 * lesson can look like the first. That claim is only worth anything if they
 * render standalone -- outside the scene, without its CSS, without its
 * coordinates. So every test here mounts the primitive on its own.
 *
 * Assertions are behavioural: does the heading carry a number, does the label
 * use the serif face, does an arrow leave horizontally. Not snapshots, which
 * would lock in markup nobody chose and fail on every harmless edit.
 */

afterEach(cleanup)

const svg = (node: React.ReactNode) => render(<svg>{node}</svg>)

describe('PanelSurface', () => {
  it('renders its children and marks its tone', () => {
    const { container } = render(<PanelSurface tone="glass"><p>inside</p></PanelSurface>)
    expect(screen.getByText('inside')).toBeDefined()
    expect(container.querySelector('[data-tone="glass"]')).not.toBeNull()
  })

  it('gives glass a blur and a radius; gives bare neither', () => {
    /* Prose sits on the canvas itself. Framing everything identically is what
     * makes a board read as a dashboard rather than a lesson. */
    const glass = render(<PanelSurface tone="glass">x</PanelSurface>)
      .container.firstElementChild as HTMLElement
    expect(glass.style.backdropFilter).toContain('blur')
    expect(glass.style.borderRadius).toBe(`${radius.lg}px`)

    cleanup()
    const bare = render(<PanelSurface tone="bare">x</PanelSurface>)
      .container.firstElementChild as HTMLElement
    expect(bare.style.backdropFilter).toBe('')
    expect(bare.style.border).toBe('')
  })

  it('opts out of canvas panning only when interactive', () => {
    const { container } = render(<PanelSurface interactive>x</PanelSurface>)
    expect(container.querySelector('[data-no-pan]')).not.toBeNull()
    cleanup()
    const plain = render(<PanelSurface>x</PanelSurface>)
    expect(plain.container.querySelector('[data-no-pan]')).toBeNull()
  })
})

describe('SectionHeading', () => {
  it('renders a numbered badge, a title and a sub-label', () => {
    render(<SectionHeading index={3} title="Particle model" sub="(constant volume)" />)
    expect(screen.getByText('3')).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Particle model' })).toBeDefined()
    expect(screen.getByText('(constant volume)')).toBeDefined()
  })

  it('omits the badge when the panel is not part of a sequence', () => {
    const { container } = render(<SectionHeading title="Pressure vs Temperature" />)
    expect(container.querySelector('[data-canvas="badge"]')).toBeNull()
  })

  it('uses pure white for the title, not near-white', () => {
    /* This exact value shifted during extraction and no guard caught it. */
    const { container } = render(<SectionHeading title="x" />)
    const h = container.querySelector('[data-canvas="section-title"]') as HTMLElement
    /* jsdom normalises an inline colour to rgb(), so compare on that footing
     * rather than against the raw token string. */
    expect(h.style.color).toBe('rgb(255, 255, 255)')
    expect(ink.pure.toLowerCase()).toBe('#ffffff')
  })

  it('sets the badge at its own size, not the micro role', () => {
    const { container } = render(<Badge n={9} />)
    const b = container.firstElementChild as HTMLElement
    expect(b.style.fontSize).toBe(`${typeLegacy.badge.size}px`)
  })

  it('renders a real number, so a lesson may have more than six panels', () => {
    render(<SectionHeading index={27} title="x" />)
    expect(screen.getByText('27')).toBeDefined()
  })
})

describe('SceneLabel', () => {
  it('uses the serif face in italic for an annotation', () => {
    /* On this surface sans is structure and serif is commentary. That contrast
     * is what lets a learner tell an aside from a heading without reading it. */
    const { container } = render(<SceneLabel>gas</SceneLabel>)
    const el = container.firstElementChild as HTMLElement
    expect(el.style.fontStyle).toBe('italic')
    expect(el.style.fontFamily).toMatch(/Fraunces/)
  })

  it('sets a caption upright and as a block', () => {
    const { container } = render(<SceneLabel variant="caption">shove the container</SceneLabel>)
    const el = container.firstElementChild as HTMLElement
    expect(el.style.fontStyle).toBe('normal')
    expect(el.style.display).toBe('block')
  })
})

describe('RelationArrow', () => {
  it('computes a cubic with horizontal tangents at both ends', () => {
    /* The single rule that makes six panels look deliberately wired rather
     * than joined by whatever straight line was shortest. */
    const d = relationPath({ x: 0, y: 10 }, { x: 200, y: 90 })
    const m = d.match(/M ([\d.-]+) ([\d.-]+) C ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+)/)
    expect(m).not.toBeNull()
    expect(Number(m![4])).toBeCloseTo(Number(m![2]), 6)   // leaves horizontally
    expect(Number(m![6])).toBeCloseTo(Number(m![8]), 6)   // arrives horizontally
  })

  it('never bows less than the token minimum, even for a vertical hop', () => {
    const d = relationPath({ x: 100, y: 0 }, { x: 100, y: 200 })
    const cp = Number(d.match(/C ([\d.-]+)/)![1])
    expect(cp - 100).toBeGreaterThanOrEqual(arrow.minBow)
  })

  it('routes a reverse edge outward instead of back through the chain', () => {
    const fwd = relationPath({ x: 0, y: 0 }, { x: 100, y: 0 })
    const rev = relationPath({ x: 0, y: 0 }, { x: 100, y: 0 }, { reverse: true })
    expect(fwd).not.toBe(rev)
  })

  it('changes stroke by relation kind, never geometry', () => {
    /* A causal arrow and a reference arrow take the same path; only weight and
     * dash differ, so the board's arrow language stays one language. */
    const causes = svg(<RelationArrow from={{ x: 0, y: 0 }} to={{ x: 90, y: 30 }} kind="causes" />)
    const causesPath = causes.container.querySelector('path')!.getAttribute('d')
    cleanup()
    const ref = svg(<RelationArrow from={{ x: 0, y: 0 }} to={{ x: 90, y: 30 }} kind="reference" />)
    const refEl = ref.container.querySelector('path')!
    expect(refEl.getAttribute('d')).toBe(causesPath)
    expect(refEl.getAttribute('stroke-dasharray')).not.toBeNull()
  })

  it('renders a label when the relation carries one', () => {
    svg(<RelationArrow from={{ x: 0, y: 0 }} to={{ x: 100, y: 0 }} label="increases" />)
    expect(screen.getByText('increases')).toBeDefined()
  })

  it('defines one shared arrowhead', () => {
    const { container } = svg(<defs><ArrowHead /></defs>)
    expect(container.querySelector('marker#relation-head')).not.toBeNull()
  })
})

describe('DiagramNode', () => {
  it('renders a labelled box', () => {
    svg(<DiagramNode x={0} y={0} w={120} h={40} label="Subprime lending" />)
    expect(screen.getByText('Subprime lending')).toBeDefined()
  })

  it('keeps the full text reachable when the label was shortened', () => {
    /* The layout validator's labelFits check refuses a truncated label with no
     * way to read it, so the primitive must supply the title itself. */
    const { container } = svg(
      <DiagramNode x={0} y={0} w={120} h={40} label="Loans bundled as…" fullLabel="Loans bundled as securities" />,
    )
    expect(container.querySelector('title')?.textContent).toBe('Loans bundled as securities')
  })

  it('adds no title when nothing was truncated', () => {
    const { container } = svg(<DiagramNode x={0} y={0} w={120} h={40} label="Short" fullLabel="Short" />)
    expect(container.querySelector('title')).toBeNull()
  })

  it('marks an emphasised node with the accent, not a different shape', () => {
    const { container } = svg(<DiagramNode x={0} y={0} w={120} h={40} label="x" emphasis />)
    const rect = container.querySelector('rect')!
    expect(rect.getAttribute('fill')).not.toBe(color.surfaceRaised)
    expect(rect.getAttribute('rx')).toBe(String(radius.md))
  })
})
