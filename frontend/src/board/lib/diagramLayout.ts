/* DIAGRAM LAYOUT — semantic cells to world coordinates, pure and deterministic.
 *
 * A diagram node may declare a position, and it is a GRID CELL, not pixels:
 * "column 2, row 0" is meaning (this sits after that), where "x: 417" would be
 * styling smuggled into data. Nodes without a position are placed by group —
 * each named group is a row, ungrouped nodes share a final row — which is
 * enough structure for concept maps without inventing a physics simulation.
 *
 * Deterministic on purpose: same nodes in, same layout out, every time. A
 * layout that shuffles between renders cannot be screenshot and cannot be
 * trusted by a learner who looked away.
 */

export interface DiagramNodeInput {
  id: string
  group?: string
  position?: { col: number; row: number }
}

export interface DiagramLayoutResult {
  pos: Record<string, { x: number; y: number }>
  width: number
  height: number
}

export const NODE_W = 168
export const NODE_H = 56
const COL_GAP = 48
const ROW_GAP = 64
const PAD = 24

export function layoutDiagram(nodes: DiagramNodeInput[]): DiagramLayoutResult {
  const cells: Record<string, { col: number; row: number }> = {}

  /* Pass 1 — explicit positions are honoured verbatim. */
  const auto: DiagramNodeInput[] = []
  for (const n of nodes) {
    if (n.position && Number.isFinite(n.position.col) && Number.isFinite(n.position.row)) {
      cells[n.id] = { col: Math.round(n.position.col), row: Math.round(n.position.row) }
    } else {
      auto.push(n)
    }
  }

  /* Pass 2 — group order is first-appearance order, so authors control rows by
   * ordering their nodes. Occupied cells from pass 1 are skipped. */
  const occupied = new Set(Object.values(cells).map((c) => `${c.col}/${c.row}`))
  const groups: string[] = []
  for (const n of auto) {
    const g = n.group ?? '__ungrouped__'
    if (groups.indexOf(g) < 0) groups.push(g)
  }
  const explicitRows = Object.values(cells).map((c) => c.row)
  let rowBase = explicitRows.length ? Math.max(...explicitRows) + 1 : 0
  for (const g of groups) {
    let col = 0
    for (const n of auto) {
      if ((n.group ?? '__ungrouped__') !== g) continue
      while (occupied.has(`${col}/${rowBase}`)) col++
      cells[n.id] = { col, row: rowBase }
      occupied.add(`${col}/${rowBase}`)
      col++
    }
    rowBase++
  }

  /* Cells to coordinates, normalised so the top-left cell is at the padding. */
  const all = Object.values(cells)
  const minCol = all.length ? Math.min(...all.map((c) => c.col)) : 0
  const minRow = all.length ? Math.min(...all.map((c) => c.row)) : 0
  const pos: Record<string, { x: number; y: number }> = {}
  let maxX = 0, maxY = 0
  for (const id of Object.keys(cells)) {
    const c = cells[id]
    const x = PAD + (c.col - minCol) * (NODE_W + COL_GAP)
    const y = PAD + (c.row - minRow) * (NODE_H + ROW_GAP)
    pos[id] = { x, y }
    maxX = Math.max(maxX, x + NODE_W)
    maxY = Math.max(maxY, y + NODE_H)
  }
  return { pos, width: maxX + PAD || PAD * 2, height: maxY + PAD || PAD * 2 }
}
