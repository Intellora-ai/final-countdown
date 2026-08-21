import React, { useRef, useState, useCallback } from 'react'
import type { ValidatedBoard } from '../types/learningBoard'
import { BoardGrid } from '../shell/BoardGrid'
import { BoardBlock } from '../shell/BoardBlock'
import { ConnectorLayer } from '../shell/ConnectorLayer'
import { isRenderableBlock, resolve } from './blockRegistry'

/* THE RENDERER — a fold over validated blocks, and deliberately nothing more.
 *
 * READ THIS FILE LOOKING FOR A BLOCK TYPE BY NAME. There still isn't one.
 * Sixteen block types render through here and none is mentioned; the registry
 * decides which component, which frame, which span. That absence is what makes
 * "a new block type does not require rewriting the canvas" a property of the
 * code rather than a promise.
 *
 * IT NOW CONSUMES ValidatedBoard. The validator is the only door content comes
 * through, so the tolerant guards Phase 1 carried are demoted to belt-and-
 * braces: a preserved unknown block resolves to the fallback via the registry
 * exactly like any unregistered string.
 *
 * CONNECTORS WRAP, NEVER TOUCH. The grid renders exactly as it would without
 * them; the layer measures afterwards and draws on top. Each cell carries
 * data-block-id so the layer can find its anchors without owning any layout.
 */
export function BoardRenderer({ board }: { board: ValidatedBoard }) {
  const blocks = Array.isArray(board?.blocks) ? board.blocks : []
  const connectors = board.connectors ?? []
  const [gridEl, setGridEl] = useState<HTMLElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const gridRef = useCallback((el: HTMLElement | null) => setGridEl(el), [])

  return (
    <div ref={wrapRef} data-board="renderer" style={{ position: 'relative' }}>
      <BoardGrid ref={gridRef}>
        {blocks.map((block, index) => {
          const renderable = isRenderableBlock(block)
          const entry = resolve(renderable ? block.type : undefined)
          const width = (renderable && 'layout' in block && block.layout?.width) || entry.defaultWidth
          const key = (renderable && block.id) || `block-${index}`
          const Component = entry.Component
          return (
            <BoardBlock
              key={key}
              blockId={renderable ? block.id : undefined}
              width={width}
              treatment={entry.treatment}
              title={renderable && 'title' in block ? block.title : undefined}
              eyebrow={renderable && 'eyebrow' in block ? block.eyebrow : undefined}
            >
              <Component block={block} />
            </BoardBlock>
          )
        })}
      </BoardGrid>
      <ConnectorLayer connectors={connectors} blocks={blocks} gridEl={gridEl} />
    </div>
  )
}
