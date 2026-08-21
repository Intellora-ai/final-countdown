import React from 'react'
import type { LearningBoard } from '../types/learningBoard'
import { BoardGrid } from '../shell/BoardGrid'
import { BoardBlock } from '../shell/BoardBlock'
import { isRenderableBlock, resolve } from './blockRegistry'

/* THE RENDERER — a fold over blocks, and deliberately nothing more.
 *
 * READ THIS FILE LOOKING FOR A BLOCK TYPE BY NAME. There isn't one. No switch,
 * no if-chain, no 'table' string anywhere. That absence is the feature: it is
 * what makes "a new block type does not require rewriting the canvas" a
 * property of the code rather than a promise in a document.
 *
 * WHAT IT DECIDES: which component, which frame treatment, which grid span,
 * which React key. All four come from the registry or from a semantic hint,
 * never from the component being rendered.
 *
 * WHY IT TOLERATES MALFORMED INPUT WITHOUT VALIDATING IT. Phase 1 has no
 * validator, and a renderer that assumes well-formed data would crash the whole
 * board on one bad block. So a block with no id gets a positional key, and a
 * block with no recognisable type gets the fallback component. That is the
 * minimum needed for the fallback path to be real. It is not, and must not be
 * mistaken for, the Phase 2 validator.
 */
export function BoardRenderer({ board }: { board: LearningBoard }) {
  const blocks = Array.isArray(board?.blocks) ? board.blocks : []

  return (
    <BoardGrid>
      {blocks.map((block, index) => {
        const renderable = isRenderableBlock(block)
        const entry = resolve(renderable ? block.type : undefined)
        const width = (renderable && block.layout?.width) || entry.defaultWidth
        /* A missing id must not collapse two blocks onto one key. */
        const key = (renderable && block.id) || `block-${index}`
        const Component = entry.Component

        return (
          <BoardBlock
            key={key}
            width={width}
            treatment={entry.treatment}
            title={renderable ? block.title : undefined}
            eyebrow={renderable ? block.eyebrow : undefined}
          >
            <Component block={block} />
          </BoardBlock>
        )
      })}
    </BoardGrid>
  )
}
