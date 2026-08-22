import React from 'react'
import { TablePanel, type DerivedColumn } from './TablePanel'
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
export function TablePanelAdapter({ data, derived, disclosure }: PanelProps) {
  const d = data as { rows: Array<Record<string, unknown>>; caption?: string }
  const columns = (derived.columns ?? []) as DerivedColumn[]

  const strategy =
    disclosure?.strategy === 'paginate' ? 'paginate'
    : disclosure?.strategy === 'scroll_y' ? 'scroll_y'
    : 'none'

  return (
    <TablePanel
      columns={columns}
      rows={d.rows}
      caption={d.caption}
      initiallyVisible={disclosure?.initiallyVisible ?? d.rows.length}
      strategy={strategy}
      freezeFirstColumn={Boolean(derived.freezeFirstColumn)}
    />
  )
}
