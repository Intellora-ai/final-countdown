import React, { useId, useLayoutEffect, useRef, useState } from 'react'
import { layoutFlow } from '../layout/flow'
import { color, type, space, radius, stroke, accentAlpha, ink } from '../design/tokens'
import { arrow } from '../design/tokens'
import type { PanelProps } from '../renderer/renderers'

/* THE DIAGRAM PANEL — placeholder in scope, real in behaviour.
 *
 * Phase 3 asked only for a diagram PLACEHOLDER, and there is no diagram
 * contract yet, so this reads its payload directly rather than a derived plan.
 * That is the honest limit of this slice and it is stated here rather than
 * discovered later.
 *
 * What it does NOT do is fake it. The node placement and every arrow path come
 * from layout/flow.ts, which is already built and has fifteen tests: shape
 * follows count, serpentine reverses alternate rows, labels truncate while
 * preserving their full text, and every bezier has horizontal tangents at both
 * ends. Drawing boxes with a hand-written path here would have made the panel
 * look finished while throwing that work away.
 */
export function DiagramPanel({ data, title }: PanelProps) {
  /* ONE MARKER ID PER INSTANCE.
   *
   * This was the literal string "dp-head". `url(#dp-head)` resolves to the
   * FIRST matching id in the document, so with three diagrams on a page all
   * three arrowheads pointed at panel one's marker -- and the document carried
   * three duplicate ids, which breaks every id-based reference an assistive
   * technology relies on. useId gives each mount its own. */
  const headId = `dp-head-${useId().replace(/:/g, '')}`

  /* THE LAYOUT WIDTH IS MEASURED, NOT GUESSED.
   *
   * This was `layoutFlow(nodes, edges, 900)`. Nine hundred pixels was never
   * the width of anything: a `column` flow centres each node inside the width
   * it is given, so the layout spread itself across a 900px canvas and the
   * grid then squeezed that viewBox into a 112px block. Everything scaled with
   * it, node labels included — 11.5px of `type.label` rendered at 2.3px.
   *
   * Measuring the host is what makes the viewBox and the box agree. */
  const hostRef = useRef<HTMLDivElement>(null)
  const [hostWidth, setHostWidth] = useState(0)

  useLayoutEffect(() => {
    const el = hostRef.current
    if (!el) return
    const read = () => setHostWidth(el.clientWidth)
    read()
    /* jsdom implements no layout and no ResizeObserver. The listener fallback
     * keeps this correct there and in any other environment without one; it is
     * never the path a browser takes. */
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', read)
      return () => window.removeEventListener('resize', read)
    }
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const d = data as {
    nodes?: Array<{ id: string; label: string }>
    edges?: Array<{ from: string; to: string; label?: string }>
  }
  const nodes = d.nodes ?? []
  const edges = d.edges ?? []

  if (!nodes.length) {
    return (
      <p style={{ fontFamily: type.mono.family, fontSize: type.mono.size, color: ink.axis }}>
        This diagram has no nodes.
      </p>
    )
  }

  const pad = space.lg
  const inner = Math.max(0, hostWidth - pad * 2)
  const flow = layoutFlow(nodes, edges, inner)

  /* ONE VIEWBOX UNIT IS ONE PIXEL, ALWAYS.
   *
   * The viewBox is never allowed to be narrower than the box drawing it, and
   * `minWidth` below never lets the box be narrower than the viewBox. Between
   * them the scale factor is pinned at 1, so `type.label.size` renders at
   * 11.5px whether the block is 112px wide or 1100 — the declared size is the
   * rendered size. Wider content scrolls; it does not shrink. */
  const W = Math.max(flow.width, inner) + pad * 2
  const H = flow.height + pad * 2

  return (
    <div ref={hostRef}>
      {title && (
        <h3 style={{
          fontFamily: type.title.family, fontSize: type.title.size,
          fontWeight: type.title.weight, letterSpacing: type.title.tracking,
          textTransform: 'uppercase', color: color.text, margin: 0, marginBottom: space.sm,
        }}>{title}</h3>
      )}

      {/* The scroll frame carries the same four attributes TablePanel's does,
        * for the same reasons. `data-overflow="scroll"` is read by
        * renderer/measure.ts:65 to tell deliberate scrolling apart from a
        * layout fault; `tabIndex`, the group role and the label keep a box
        * that scrolls by mouse reachable by keyboard (WCAG 2.1.1). */}
      <div
        data-overflow="scroll"
        tabIndex={0}
        role="group"
        aria-label={title ? `${title} (scrollable diagram)` : 'Scrollable diagram'}
        style={{ overflowX: 'auto' }}
      >
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        style={{ display: 'block', minWidth: W }}
        aria-label={`${flow.shape} diagram: ${nodes.map((n) => n.label).join(' then ')}.`}>
        <defs>
          <marker id={headId} markerWidth={arrow.headLength} markerHeight={arrow.headWidth * 2}
            refX={arrow.headLength} refY={arrow.headWidth} orient="auto">
            <path d={`M0,0 L${arrow.headLength},${arrow.headWidth} L0,${arrow.headWidth * 2} Z`} fill={color.accent} />
          </marker>
        </defs>

        <g transform={`translate(${pad},${pad})`}>
          {flow.edges.map((e, i) => (
            <path key={i} d={e.path} fill="none"
              stroke={accentAlpha.connector} strokeWidth={stroke.base}
              strokeLinecap={arrow.cap as 'round'} markerEnd={`url(#${headId})`} />
          ))}

          {flow.nodes.map((n) => (
            <g key={n.id}>
              <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={radius.md}
                fill={color.surfaceRaised} stroke={color.border} strokeWidth={stroke.hair} />
              <text x={n.x + n.w / 2} y={n.y + n.h / 2} textAnchor="middle" dominantBaseline="middle"
                fill={color.text} fontSize={type.label.size} fontFamily={type.label.family}>
                {n.label}
                {/* Truncated for display, never lost: the title is what the
                  * validator's labelFits check requires. */}
                {n.truncated && <title>{n.fullLabel}</title>}
              </text>
            </g>
          ))}
        </g>
      </svg>
      </div>

      {flow.wrongRepresentation && (
        <p style={{
          fontFamily: type.mono.family, fontSize: type.mono.size,
          color: color.warning, margin: 0, marginTop: space.xs,
        }}>{flow.wrongRepresentation}</p>
      )}
    </div>
  )
}
