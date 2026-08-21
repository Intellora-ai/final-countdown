import React from 'react'
import type { TableBlock as TableBlockData } from '../types/learningBoard'

/* A table, in its own scroll container.
 *
 * THE OVERFLOW IS THE POINT. A wide table inside a page that scrolls
 * horizontally drags every other block sideways with it. So the scroll belongs
 * to the table and nothing else: `overflow-x: auto` on the wrapper, and the
 * page body never moves.
 *
 * RAGGED ROWS DO NOT BREAK THE GRID. Rows are read against the column count
 * rather than against their own length, so a row that is short renders empty
 * cells and a row that is long is not allowed to add a column nothing has a
 * header for. Phase 2's validator will report this as a repair; Phase 1 simply
 * refuses to render a broken grid.
 */
const EMPTY_CELL = '—' /* em dash */

export function TableBlock({ block }: { block: TableBlockData }) {
  const columns = Array.isArray(block.columns) ? block.columns : []
  const rows = Array.isArray(block.rows) ? block.rows : []

  if (!columns.length) return null

  return (
    <div data-board="table-scroll">
      <table data-board="table">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} scope="col">{String(c)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {columns.map((_, c) => {
                const cell = Array.isArray(row) ? row[c] : undefined
                const text = cell === undefined || cell === null || cell === '' ? EMPTY_CELL : String(cell)
                return <td key={c}>{text}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
