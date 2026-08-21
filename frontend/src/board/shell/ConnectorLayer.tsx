import React, { useEffect, useState } from 'react'
import type { Connector, ValidatedBlock } from '../types/learningBoard'

/* RELATIONSHIPS, DRAWN FROM DATA AND MEASURED FROM THE REAL LAYOUT.
 *
 * The grid owns block positions; this layer asks the DOM where the blocks
 * ended up and draws between them. It holds no layout opinion of its own —
 * `pointer-events: none`, absolutely positioned over the grid, and removing
 * it changes nothing about where any block sits. That is the contract: a
 * connector may never move content.
 *
 * MEASUREMENT, NOT SUBSCRIPTION SOUP. One ResizeObserver on the grid re-reads
 * every anchor when anything resizes — fonts loading, drawer opening, viewport
 * changing. Reading offsetLeft/offsetTop relative to the grid avoids scroll
 * arithmetic entirely.
 *
 * SIGHT AND SOUND. The SVG is aria-hidden decoration; the visually-hidden list
 * below it states every relationship in words, at every width — including the
 * narrow ones where the stylesheet hides the lines because they would cross
 * stacked content.
 */
export function ConnectorLayer({
  connectors,
  blocks,
  gridEl,
}: {
  connectors: Connector[]
  blocks: ValidatedBlock[]
  gridEl: HTMLElement | null
}) {
  const [lines, setLines] = useState<Array<{ id: string; x1: number; y1: number; x2: number; y2: number; label?: string }>>([])
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    if (!gridEl || !connectors.length) { setLines([]); return }
    const measure = () => {
      const found: typeof lines = []
      for (const c of connectors) {
        const a = gridEl.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(c.from)}"]`)
        const b = gridEl.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(c.to)}"]`)
        if (!a || !b) continue
        const ar = { x: a.offsetLeft, y: a.offsetTop, w: a.offsetWidth, h: a.offsetHeight }
        const br = { x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight }
        /* Leave from the facing edges: nearest vertical edge pair. */
        const aBelow = ar.y + ar.h <= br.y
        const bBelow = br.y + br.h <= ar.y
        const x1 = ar.x + ar.w / 2, y1 = aBelow ? ar.y + ar.h : bBelow ? ar.y : ar.y + ar.h / 2
        const x2 = br.x + br.w / 2, y2 = aBelow ? br.y : bBelow ? br.y + br.h : br.y + br.h / 2
        found.push({ id: c.id, x1, y1, x2, y2, label: c.label })
      }
      setLines(found)
      setSize({ w: gridEl.scrollWidth, h: gridEl.scrollHeight })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(gridEl)
    return () => ro.disconnect()
  }, [gridEl, connectors])

  if (!connectors.length) return null
  const byId = new Map(blocks.map((b) => [b.id, b]))
  const nameOf = (id: string) => {
    const b = byId.get(id)
    return (b && 'title' in b && b.title) || id
  }
  const verb = (k?: Connector['kind']) =>
    k === 'causal' ? 'leads to' : k === 'sequence' ? 'is followed by' : 'references'

  return (
    <>
      {lines.length > 0 && size.w > 0 && (
        <svg
          data-board="connectors"
          aria-hidden="true"
          viewBox={`0 0 ${size.w} ${size.h}`}
          width={size.w}
          height={size.h}
          preserveAspectRatio="none"
        >
          {lines.map((l) => {
            const my = (l.y1 + l.y2) / 2
            return (
              <g key={l.id}>
                <path
                  d={`M ${l.x1} ${l.y1} C ${l.x1} ${my} ${l.x2} ${my} ${l.x2} ${l.y2}`}
                  data-board="connector-line"
                  fill="none"
                />
                <circle cx={l.x2} cy={l.y2} r={3} data-board="connector-end" />
                {l.label && (
                  <text x={(l.x1 + l.x2) / 2} y={my - 8} data-board="connector-label" textAnchor="middle">
                    {l.label}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      )}
      {/* The same relationships in words, at every width. */}
      <ul data-board="visually-hidden">
        {connectors.map((c) => (
          <li key={c.id}>
            {`${nameOf(c.from)} ${verb(c.kind)} ${nameOf(c.to)}${c.label ? ` (${c.label})` : ''}.`}
          </li>
        ))}
      </ul>
    </>
  )
}
