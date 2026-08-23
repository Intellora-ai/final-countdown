import { useId, type ReactNode } from 'react'

import { tokens } from './tokens'

/**
 * The visual kit. Every renderer draws from here and nowhere else.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * A chart renderer, a table renderer and a simulation renderer written
 * independently will each invent their own heading, their own panel edge, their
 * own idea of a caption — and the page becomes three products stacked. That is
 * the exact failure mode "same design grammar, different composition" is meant
 * to prevent, and prose in a brief does not prevent it. A shared kit does.
 *
 * THE REFERENCE, READ AS RULES
 * ----------------------------
 * Reading the source composition, the grammar is:
 *  - a near-black field, lit from above, with almost no hard boxes on it
 *  - ONE accent (cyan), used for the eye's path and nothing else
 *  - numbered markers that let a reader walk the argument in order
 *  - letterspaced small-caps section labels, quiet and grey
 *  - glow, never fill: a lit node reads as energy, a filled one as a button
 *  - hairline connectors that curve, so the eye follows rather than jumps
 *  - a rule under the title that stops short of the full width
 * Every primitive below is one of those sentences made reusable.
 */

/* -------------------------------------------------------------------------- */
/* Section marker — the numbered circles that order the argument              */
/* -------------------------------------------------------------------------- */

/**
 * The ① ② ③ that let a reader walk the page in the author's order.
 *
 * The number comes from the block's position, never from the spec — an author
 * who could set it would eventually set two of them to 3.
 */
export function NumberMarker({ n }: { n: number }) {
  return (
    <span className="lc-marker" aria-hidden>
      {n}
    </span>
  )
}

/** The quiet letterspaced heading above a section. */
export function SectionLabel({
  children,
  n,
  sub,
}: {
  children: ReactNode
  n?: number
  sub?: string
}) {
  return (
    <div className="lc-section-label">
      {n !== undefined && <NumberMarker n={n} />}
      <span className="lc-section-label__text">
        {children}
        {sub && <span className="lc-section-label__sub">{sub}</span>}
      </span>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A frosted panel. Used sparingly.
 *
 * In the reference exactly ONE thing sits in a panel — the simulation — and
 * that is what makes it read as an instrument rather than a diagram. Panel
 * everything and the page becomes a dashboard, which is the look this is
 * deliberately not.
 */
export function Panel({ children, glow = false }: { children: ReactNode; glow?: boolean }) {
  return <div className={glow ? 'lc-panel lc-panel--glow' : 'lc-panel'}>{children}</div>
}

/** A pill node, as used in the concept map. Outline only — never filled. */
export function Pill({
  children,
  active = false,
}: {
  children: ReactNode
  active?: boolean
}) {
  return <span className={active ? 'lc-pill lc-pill--active' : 'lc-pill'}>{children}</span>
}

/** A lit point. Glow, not fill: energy rather than affordance. */
export function GlowDot({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return <span className={`lc-glow lc-glow--${size}`} aria-hidden />
}

/* -------------------------------------------------------------------------- */
/* Connectors                                                                 */
/* -------------------------------------------------------------------------- */

export interface Point {
  x: number
  y: number
}

/**
 * A curved connector between two points, as an SVG path `d`.
 *
 * Cubic rather than straight because the reference's connectors curve, and the
 * curve is doing work: it tells the eye these two things are related without
 * implying the rigid this-then-that of an arrow in a flowchart. The control
 * points push out horizontally, so a link never cuts diagonally across a label.
 */
export function curvePath(from: Point, to: Point): string {
  const dx = to.x - from.x
  const reach = Math.min(120, Math.max(24, Math.abs(dx) * 0.5))
  return `M ${r(from.x)} ${r(from.y)} C ${r(from.x + reach)} ${r(from.y)}, ${r(to.x - reach)} ${r(to.y)}, ${r(to.x)} ${r(to.y)}`
}

/**
 * The one arrowhead shape in the system.
 *
 * Defined once as a `<marker>` and referenced everywhere, so arrow STYLE is
 * constant while arrow COUNT is whatever the content needs. Two renderers
 * drawing their own heads is how a page ends up with two arrow languages.
 */
/**
 * A scope for one SVG's defs, unique per mounted component.
 *
 * WHY THESE IDS CANNOT BE CONSTANTS
 * ---------------------------------
 * `id` is document-global in SVG, and `url(#lc-arrow)` resolves against the
 * whole document — not the `<svg>` the reference sits in. The civics lesson
 * renders two diagrams that both mount `ArrowDefs`, so the page carried
 * `id="lc-arrow"` twice and every arrowhead on it, in BOTH diagrams, resolved
 * to whichever `<defs>` the browser parsed first.
 *
 * It looked correct, because both definitions were identical. It stops looking
 * correct the moment one diagram wants a different arrow — and a duplicate id
 * is also an accessibility-tree and validator failure that no visual check
 * would ever surface.
 *
 * `useId` is React's answer and is stable across server and client render, so
 * this cannot reintroduce a hydration mismatch. The colons React puts in its
 * ids are legal in an `id` attribute but are a fragment-syntax hazard inside
 * `url(#…)`, so they are stripped.
 */
export function useArrowScope(): string {
  return useId().replace(/:/g, '')
}

/** The `markerEnd` value for a scope. Never write `url(#lc-arrow)` by hand. */
export function arrowRef(scope: string): string {
  return `url(#${scope}-arrow)`
}

/** The `filter` value for a scope. Read the warning on the filter first. */
export function bloomRef(scope: string): string {
  return `url(#${scope}-bloom)`
}

export function ArrowDefs({ scope }: { scope: string }) {
  const h = tokens.arrow.head
  return (
    <defs>
      <marker
        id={`${scope}-arrow`}
        viewBox={`0 0 ${h} ${h}`}
        refX={h - 1}
        refY={h / 2}
        markerWidth={h}
        markerHeight={h}
        orient="auto-start-reverse"
      >
        <path d={`M 0 0 L ${h} ${h / 2} L 0 ${h} z`} fill="var(--c-accent)" />
      </marker>
      {/*
        NEVER APPLY THIS TO A FLAT PATH.
        --------------------------------
        The region below is in PERCENTAGES, which SVG resolves against the
        object bounding box. A horizontal line has a zero-height bbox, so the
        region collapses to zero area and the element renders as nothing —
        silently, with correct stroke and correct opacity. That is exactly how
        the flow connectors shipped invisible.

        Safe on anything with area (dots, glyphs, curves that actually curve).
        For lines, glow with a second wider stroke instead — see
        `.lc-flow__link-glow`.
      */}
      <filter id={`${scope}-bloom`} x="-200%" y="-200%" width="500%" height="500%">
        <feGaussianBlur stdDeviation="2.5" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  )
}

/* -------------------------------------------------------------------------- */
/* Text                                                                       */
/* -------------------------------------------------------------------------- */

/** A caption. The only place a renderer may put explanatory text. */
export function Caption({ children }: { children: ReactNode }) {
  return <p className="lc-caption">{children}</p>
}

/**
 * The lesson's question, with the rule beneath it.
 *
 * The rule stops short of the text's full width in the reference — a full-width
 * rule reads as a divider between sections, a short one reads as an underline
 * belonging to the title. Small difference, completely different meaning.
 */
export function Question({ children }: { children: ReactNode }) {
  return (
    <h1 className="lc-question">
      {children}
      <span className="lc-question__rule" aria-hidden />
    </h1>
  )
}

/** Two decimals is below one device pixel at every scale this canvas allows. */
function r(value: number): number {
  return Math.round(value * 100) / 100
}
