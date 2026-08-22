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

      {/* A DERIVATION IS NOT REFLOWABLE TEXT, so it scrolls INSIDE its own box.
        *
        * `(x + b/2a)^2 = (b^2-4ac)/4a^2` is one unbreakable typeset object at
        * the display size, and on a 320px phone it is wider than the column.
        * The ancestor `.scene` computes `overflow-x: hidden`, so before this
        * box existed the right-hand side of every long step was AMPUTATED --
        * not scrolled past, not disclosed, simply gone. Sixty-four elements at
        * 320px, the worst cut by 112px, which is most of an equals sign and
        * everything after it.
        *
        * The fix is disclosure, never shrinking. Setting a smaller font-size
        * for narrow viewports would give mathematics two display sizes and
        * therefore two design systems, and would still fail on the next
        * equation one term longer. The type token is untouched; the box moved.
        *
        * Same three attributes TablePanel carries, for the same three reasons.
        * `data-overflow="scroll"` is what tells renderer/measure.ts:65 this box
        * scrolls ON PURPOSE -- without it the honest fix reads to the validator
        * as the very layout fault it repairs. `tabIndex={0}` and the group role
        * make the scroller reachable from a keyboard: it holds the only copy of
        * the terms it hides, and a box you can only reach with a mouse fails
        * WCAG 2.1.1. */}
      <div
        data-overflow="scroll"
        tabIndex={0}
        role="group"
        aria-label={title ? `${title} (scrollable)` : 'Scrollable derivation'}
        style={{ overflowX: 'auto' }}
      >
      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {d.steps.map((s, i) => (
          <li key={i} style={{ marginBottom: space.md }}>
            {/* `max-content` is a structural width, not a design value: it asks
              * the step to be exactly as wide as the mathematics inside it, so
              * the scroller has something to scroll to. Left at `auto` the step
              * shrinks to the column and the glyphs spill out of a box that
              * reports itself as full width. */}
            <div style={{
              fontSize: type.display.size, color: color.text,
              lineHeight: typeLegacy.annotation.lineHeight, width: 'max-content',
            }}>
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
      </div>

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
