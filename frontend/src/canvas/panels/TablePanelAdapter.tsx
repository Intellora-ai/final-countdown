import React from 'react'
import { TablePanel, type DerivedColumn } from './TablePanel'
import { color, type, space } from '../design/tokens'
import type { PanelProps } from '../renderer/renderers'

/* THE ADAPTER THAT MAKES TablePanel REACHABLE — root cause B, in one file.
 *
 * TablePanel already existed, tested, with a props shape of its own. Rewriting
 * it to take the generic PanelProps would have meant editing a working
 * component to suit a new caller, which is exactly the coupling the registry is
 * supposed to prevent. An adapter translates instead: the contract's derived
 * output in, TablePanel's props out. TablePanel does not learn that a registry
 * exists, and the registry does not learn how tables are drawn.
 */
/* THE BLOCK TITLE IS NOT THE TABLE CAPTION.
 *
 * This adapter did not accept `title` at all, so every table block in every
 * lesson silently lost its heading while text, chart, diagram and equation
 * blocks kept theirs. "Three costing methods" and "The same 100 units, three
 * answers" were authored in the acceptance lessons and never reached a screen.
 *
 * They are two different things and both are kept. `title` is the block's
 * heading and is set in the same `type.title` treatment every other panel
 * uses, because Goal 1 is that a heading looks identical whatever kind of
 * block it sits above. `caption` is a payload-level note ABOUT the table and
 * keeps its quieter `type.label` treatment inside the table element. */
export function TablePanelAdapter({ data, derived, disclosure, title }: PanelProps) {
  const d = data as { rows: Array<Record<string, unknown>>; caption?: string }
  const columns = (derived.columns ?? []) as DerivedColumn[]

  const strategy =
    disclosure?.strategy === 'paginate' ? 'paginate'
    : disclosure?.strategy === 'scroll_y' ? 'scroll_y'
    : 'none'

  return (
    <div>
      {title && (
        <h3 style={{
          fontFamily: type.title.family, fontSize: type.title.size,
          fontWeight: type.title.weight, letterSpacing: type.title.tracking,
          textTransform: 'uppercase', color: color.text, margin: 0, marginBottom: space.sm,
        }}>{title}</h3>
      )}
      <TablePanel
        columns={columns}
        rows={d.rows}
        caption={d.caption}
        initiallyVisible={disclosure?.initiallyVisible ?? d.rows.length}
        strategy={strategy}
        freezeFirstColumn={Boolean(derived.freezeFirstColumn)}
      />
    </div>
  )
}
