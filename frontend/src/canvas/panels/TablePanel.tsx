import React, { useState } from 'react'
import { color, ink, overlay, space, type, radius, stroke } from '../design/tokens'
import type { Column } from '../contract/representations/table'

/* THE TABLE, RENDERED — and the reason two tables in two subjects read alike.
 *
 * Every visual decision here comes from the column's TYPE via the contract's
 * derive(), never from the lesson. A generator cannot centre a number column
 * or widen a date column, because there is no field through which to ask.
 *
 * ROW HEIGHT IS A CONSTANT TOKEN. Disclosure changes how many rows are
 * VISIBLE; it never changes how tall one is. A table that squashed its rows
 * under pressure would have two row heights and therefore no design system.
 *
 * NO ZEBRA STRIPING. Alternating fills are a workaround for rows that are hard
 * to track, and hairline borders solve that without painting half the table a
 * different colour. Hover is the tracking aid; the stripe is not.
 */

const ROW_HEIGHT = 34

export interface DerivedColumn extends Column {
  align: 'left' | 'right' | 'center'
  role: 'body' | 'label' | 'mono'
  tabularNums: boolean
  header: string
}

export interface TablePanelProps {
  columns: DerivedColumn[]
  rows: Array<Record<string, unknown>>
  caption?: string
  /** From the disclosure plan. Rows beyond this paginate or scroll. */
  initiallyVisible?: number
  strategy?: 'paginate' | 'scroll_y' | 'none'
  freezeFirstColumn?: boolean
}

function formatCell(value: unknown, col: DerivedColumn): string {
  if (value === null || value === undefined || value === '') return '—'
  switch (col.type) {
    case 'number':
    case 'currency': {
      const n = Number(value)
      if (!Number.isFinite(n)) return '—'
      const s = n.toLocaleString(undefined, {
        minimumFractionDigits: col.precision ?? 0,
        maximumFractionDigits: col.precision ?? 0,
      })
      return col.type === 'currency' ? `₹${s}` : s
    }
    case 'percent': {
      const n = Number(value)
      return Number.isFinite(n) ? `${n.toFixed(col.precision ?? 1)}%` : '—'
    }
    /* Never the word TRUE. A glyph reads faster and translates. */
    case 'boolean': return value === true ? '✓' : value === false ? '–' : '—'
    default: return String(value)
  }
}

export function TablePanel({
  columns, rows, caption,
  initiallyVisible = rows.length,
  strategy = 'none',
  freezeFirstColumn = false,
}: TablePanelProps) {
  const [page, setPage] = useState(0)
  const perPage = Math.max(1, initiallyVisible)
  const pages = Math.max(1, Math.ceil(rows.length / perPage))

  const visible = strategy === 'paginate'
    ? rows.slice(page * perPage, (page + 1) * perPage)
    : rows

  const scrolls = strategy === 'scroll_y'

  const cellBase: React.CSSProperties = {
    height: ROW_HEIGHT,
    paddingLeft: space.md,
    paddingRight: space.md,
    borderBottom: `${stroke.hair}px solid ${color.border}`,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }

  return (
    <div>
      {/* Wide tables scroll INSIDE their own box. The page never scrolls
        * sideways — a horizontally scrolling document is a broken document. */}
      <div style={{
        overflowX: 'auto',
        ...(scrolls ? { maxHeight: ROW_HEIGHT * (perPage + 1), overflowY: 'auto' } : {}),
        border: `${stroke.hair}px solid ${color.border}`,
        borderRadius: radius.md,
      }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 'max-content' }}>
          {caption && (
            <caption style={{
              captionSide: 'top', textAlign: 'left',
              fontFamily: type.label.family, fontSize: type.label.size,
              color: color.textMuted, padding: space.md,
            }}>
              {caption}
            </caption>
          )}
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th
                  key={c.key}
                  scope="col"
                  style={{
                    ...cellBase,
                    textAlign: c.align,
                    /* Header: micro, uppercase, muted, wide tracking, a strong
                     * rule beneath. One treatment, every table. */
                    fontFamily: type.micro.family,
                    fontSize: type.micro.size,
                    fontWeight: type.micro.weight,
                    letterSpacing: type.micro.tracking,
                    textTransform: 'uppercase',
                    color: color.textMuted,
                    borderBottom: `${stroke.base}px solid ${color.borderStrong}`,
                    background: color.bg,
                    ...(scrolls ? { position: 'sticky', top: 0, zIndex: 2 } : {}),
                    ...(freezeFirstColumn && i === 0
                      ? { position: 'sticky', left: 0, zIndex: 3 }
                      : {}),
                  }}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, r) => (
              <tr
                key={r}
                style={{ background: 'transparent' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = overlay.soft }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    style={{
                      ...cellBase,
                      textAlign: c.align,
                      fontFamily: type[c.role].family,
                      fontSize: type[c.role].size,
                      color: c.type === 'formula' ? color.accent : color.text,
                      fontStyle: c.type === 'formula' ? 'italic' : 'normal',
                      /* THE LINE THAT MAKES IT A REAL TABLE. Proportional
                       * digits jitter column to column; tabular figures line
                       * up under each other. */
                      fontVariantNumeric: c.tabularNums ? 'tabular-nums' : 'normal',
                      ...(freezeFirstColumn && i === 0
                        ? { position: 'sticky', left: 0, background: color.bg, zIndex: 1 }
                        : {}),
                    }}
                  >
                    {c.type === 'category' ? (
                      <span style={{
                        background: color.surfaceRaised,
                        border: `${stroke.hair}px solid ${color.border}`,
                        borderRadius: radius.pill,
                        padding: `${space.xs}px ${space.md}px`,
                        fontFamily: type.label.family,
                        fontSize: type.label.size,
                        color: ink.node,
                      }}>
                        {formatCell(row[c.key], c)}
                      </span>
                    ) : formatCell(row[c.key], c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {strategy === 'paginate' && pages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: space.md, marginTop: space.md,
          fontFamily: type.mono.family, fontSize: type.mono.size, color: color.textMuted,
        }}>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            style={pagerStyle}
            aria-label="Previous rows"
          >
            ←
          </button>
          <span aria-live="polite">
            {page * perPage + 1}–{Math.min((page + 1) * perPage, rows.length)} of {rows.length}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            disabled={page >= pages - 1}
            style={pagerStyle}
            aria-label="Next rows"
          >
            →
          </button>
        </div>
      )}
    </div>
  )
}

/* 40px minimum, so the validator's minTapTarget check passes by construction
 * rather than by luck. */
const pagerStyle: React.CSSProperties = {
  minWidth: 40, minHeight: 40,
  background: color.surface,
  border: `${stroke.hair}px solid ${color.border}`,
  borderRadius: radius.sm,
  color: color.text,
  cursor: 'pointer',
}
