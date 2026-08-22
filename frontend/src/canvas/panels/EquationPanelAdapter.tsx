import React from 'react'
import { Katex } from './EquationPanel'
import { color, type, space, ink, typeLegacy } from '../design/tokens'
import type { PanelProps } from '../renderer/renderers'

/* MATHEMATICS, SET AS MATHEMATICS.
 *
 * Reuses the Katex primitive the gas scene already renders through, so an
 * equation composed by the engine and one placed by hand are typeset by the
 * same code with the same metrics. A second typesetting path would be a second
 * design system.
 *
 * A derivation is a SEQUENCE of steps, and the note beside each step is what
 * turns a wall of algebra into an argument. Rendering only the final line would
 * be showing the answer and hiding the reasoning.
 */
export function EquationPanelAdapter({ data, title }: PanelProps) {
  const d = data as {
    steps: Array<{ latex: string; note?: string }>
    variables?: Array<{ symbol: string; meaning: string; unit?: string }>
  }

  return (
    <div>
      {title && (
        <h3 style={{
          fontFamily: type.title.family, fontSize: type.title.size,
          fontWeight: type.title.weight, letterSpacing: type.title.tracking,
          textTransform: 'uppercase', color: color.text, margin: 0, marginBottom: space.md,
        }}>{title}</h3>
      )}

      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {d.steps.map((s, i) => (
          <li key={i} style={{ marginBottom: space.md }}>
            <div style={{ fontSize: type.display.size, color: color.text, lineHeight: typeLegacy.annotation.lineHeight }}>
              <Katex latex={s.latex} />
            </div>
            {s.note && (
              <p style={{
                fontFamily: type.label.family, fontSize: type.label.size,
                color: color.textMuted, margin: 0, marginTop: space.xs,
              }}>{s.note}</p>
            )}
          </li>
        ))}
      </ol>

      {/* An equation whose symbols are not named is a shape, not a statement. */}
      {d.variables?.length ? (
        <dl style={{
          display: 'grid', gridTemplateColumns: 'auto 1fr',
          gap: `${space.xs}px ${space.md}px`, margin: 0, marginTop: space.md,
        }}>
          {d.variables.map((v) => (
            <React.Fragment key={v.symbol}>
              <dt style={{ fontFamily: type.mono.family, fontSize: type.mono.size, color: color.accent }}>
                {v.symbol}
              </dt>
              <dd style={{ fontFamily: type.body.family, fontSize: type.label.size, color: ink.axis, margin: 0 }}>
                {v.meaning}{v.unit ? ` (${v.unit})` : ''}
              </dd>
            </React.Fragment>
          ))}
        </dl>
      ) : null}
    </div>
  )
}
