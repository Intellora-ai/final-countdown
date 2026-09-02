import React, { useEffect, useMemo, useState } from 'react'

import { plan, type Frame, type Placed } from '../layout/layout'
import { BlockView } from '../render/BlockView'
import type { Block, Lesson } from '../spec/spec'
import { markerNumbers } from '../teach/TeachView'

/**
 * ONE THING SHE ALREADY LEARNED ON THIS TOPIC, KEPT ON THE CANVAS.
 *
 * The canvas builds up (decided 2026-09-02): everything learned on a topic
 * stays. The lesson being read now is `TeachView`'s -- beats, checkpoint,
 * the box. Everything before it is shown WHOLE and still, through the same
 * planner and the same block renderer, so an earlier lesson looks exactly
 * like it did when it was the one being read. No box, no checkpoint: it has
 * already been answered.
 */

const DEFAULT_WIDTH = 1200
const PLAN_HEIGHT = 900

function columnOf(placed: Placed, frame: Frame): string {
  if (frame.columns === 1) return '1 / -1'
  return `${placed.col + 1} / span ${placed.span}`
}

export function CanvasEntry({ question, lesson, mode }: { question: string; lesson: Lesson; mode: '2d' | '3d' }) {
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? DEFAULT_WIDTH : window.innerWidth))
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const frame = useMemo(() => plan(lesson, { width, height: PLAN_HEIGHT }), [lesson, width])
  const blockById = useMemo(() => new Map<string, Block>(lesson.blocks.map((block) => [block.id, block])), [lesson])
  const markers = useMemo(() => markerNumbers(frame, blockById), [frame, blockById])

  return (
    <section className="lc-entry" aria-label={question}>
      <h2 className="lc-entry__question">{question}</h2>
      <div className="lc-teach__answer-grid" style={{ gridTemplateColumns: `repeat(${frame.columns}, minmax(0, 1fr))` }}>
        {frame.blocks.map((placed) => {
          const block = blockById.get(placed.id)
          if (block === undefined) return null
          return (
            <div key={placed.id} className="lc-teach__cell" style={{ gridColumn: columnOf(placed, frame) }}>
              <BlockView block={block} marker={markers.get(placed.id) ?? null} mode={mode} />
            </div>
          )
        })}
      </div>
    </section>
  )
}
