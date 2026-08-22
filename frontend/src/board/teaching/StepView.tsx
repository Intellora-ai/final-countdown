/* ONE STEP, PROGRESSIVELY — reveal by slicing DATA, not by hiding DOM.
 *
 * The invariant "future content must not exist in the tree" holds INSIDE a
 * step too: a block renders only after its block-mount event has applied,
 * and a structured visual receives only the pieces revealed so far — a
 * diagram gets nodes.slice(0, k), an equation gets its revealed variable
 * rows, a chart hides its data marks until the chart-data event. CSS never
 * hides unrevealed content, because the content is not there to hide.
 *
 * Prose is the one body this component renders itself (same DOM shape the
 * prose blocks produce) so the visible text can end mid-sentence at the
 * chunk cursor without the block component needing a "partial" mode.
 */
import React, { Suspense } from 'react'
import type { Block } from '../types/learningBoard'
import { BoardBlock } from '../shell/BoardBlock'
import { resolve } from '../renderer/blockRegistry'
import { proseOf } from './reveal'
import type { ReleasedStep } from './useTeachingSession'

interface BlockRevealState {
  mounted: boolean
  charEnd: number
  nodes: number
  edges: number
  equationGroups: number
  /** How many pieces of a worked example have arrived. */
  examplePieces: number
  chartAxes: boolean
  chartData: boolean
  visual: boolean
}

function revealStateFor(released: ReleasedStep): BlockRevealState[] {
  const states: BlockRevealState[] = released.step.blocks.map(() => ({
    mounted: false, charEnd: 0, nodes: 0, edges: 0, equationGroups: 0,
    examplePieces: 0, chartAxes: false, chartData: false, visual: false,
  }))
  for (let i = 0; i < released.applied; i++) {
    const e = released.timeline.events[i]
    const s = states[e.blockIndex]
    if (!s) continue
    switch (e.kind) {
      case 'block-mount': s.mounted = true; break
      case 'text-chunk': s.charEnd = Math.max(s.charEnd, e.charEnd ?? 0); break
      case 'diagram-node': s.nodes = Math.max(s.nodes, (e.pieceIndex ?? 0) + 1); break
      case 'diagram-edge': s.edges = Math.max(s.edges, (e.pieceIndex ?? 0) + 1); break
      case 'equation-group': s.equationGroups = Math.max(s.equationGroups, (e.pieceIndex ?? 0) + 1); break
      case 'example-piece': s.examplePieces = Math.max(s.examplePieces, (e.pieceIndex ?? 0) + 1); break
      case 'chart-axes': s.chartAxes = true; break
      case 'chart-data': s.chartData = true; break
      case 'visual': s.visual = true; break
    }
  }
  return states
}

/** The block data sliced down to what the reveal has released. */
function partialBlock(block: Block, s: BlockRevealState): Block | null {
  switch (block.type) {
    case 'diagram': {
      if (s.nodes === 0) return null
      const nodes = block.nodes.slice(0, s.nodes)
      const ids = new Set(nodes.map((n) => n.id))
      /* Edges appear in edge order, and only ever between revealed nodes. */
      const edges = block.edges.slice(0, s.edges).filter((e) => ids.has(e.from) && ids.has(e.to))
      return { ...block, nodes, edges }
    }
    case 'example': {
      /* Pieces arrive in the order a teacher writes them: the question, what
       * is given, each line of working, then the result. Slicing here rather
       * than hiding in CSS means an unreached line is ABSENT — a learner
       * cannot select the answer before it has been shown. */
      if (s.examplePieces === 0) return null
      let left = s.examplePieces - 1                       // the prompt is piece 0
      const input = block.input && left > 0 ? (left--, block.input) : undefined
      const working = block.working.slice(0, Math.max(0, Math.min(block.working.length, left)))
      left -= working.length
      const result = block.result && left > 0 ? block.result : undefined
      return {
        ...block,
        ...(input ? { input } : { input: undefined }),
        working,
        ...(result ? { result } : { result: undefined }),
      }
    }
    case 'equation': {
      if (s.equationGroups === 0) return null
      const vars = block.variables?.slice(0, Math.max(0, s.equationGroups - 1))
      return { ...block, ...(vars && vars.length ? { variables: vars } : { variables: undefined }) }
    }
    default:
      return block
  }
}

function ProseBody({ block, charEnd, done }: { block: Block; charEnd: number; done: boolean }) {
  const full = proseOf(block) ?? ''
  const visible = done ? full : full.slice(0, charEnd)
  const isCallout = block.type === 'callout'
  if (isCallout) {
    return (
      <p data-board="callout" data-tone={'tone' in block ? block.tone ?? 'note' : 'note'}>
        {visible}
        {!done && <span data-board="caret" aria-hidden="true" />}
      </p>
    )
  }
  const paragraphs = visible.split(/\n{2,}/)
  return (
    <div data-board="prose" aria-label={done ? undefined : 'Text is being written out'}>
      {paragraphs.map((p, i) => (
        <p key={i}>
          {p}
          {!done && i === paragraphs.length - 1 && <span data-board="caret" aria-hidden="true" />}
        </p>
      ))}
    </div>
  )
}

export function StepView({ released, isCurrent }: { released: ReleasedStep; isCurrent: boolean }) {
  const states = isCurrent ? revealStateFor(released) : null

  return (
    <div data-board="step-blocks">
      {released.step.blocks.map((block, i) => {
        const s = states?.[i]
        /* PAST steps are fully revealed; the CURRENT step mounts a block only
         * once its block-mount event has fired. Before that: nothing. */
        if (s && !s.mounted) return null
        const entry = resolve(block.type)
        const prose = proseOf(block)
        const fullText = prose ?? ''
        const proseDone = !s || s.charEnd >= fullText.length
        const body = (() => {
          if (prose !== null) {
            return <ProseBody block={block} charEnd={s?.charEnd ?? fullText.length} done={proseDone} />
          }
          const data = s ? partialBlock(block, s) : block
          if (data === null) return <div data-board="visual-pending" aria-hidden="true" />
          const Component = entry.Component
          const chartPhase = s && !s.chartData && (block.type === 'line_chart' || block.type === 'bar_chart' || block.type === 'pie_chart')
            ? (s.chartAxes ? 'axes' : 'pending')
            : 'full'
          return (
            <div data-reveal={chartPhase}>
              <Suspense fallback={<div data-board="block-loading" aria-label="Loading" />}>
                <Component block={data} />
              </Suspense>
            </div>
          )
        })()
        return (
          <BoardBlock
            key={block.id}
            blockId={block.id}
            width="full"
            treatment={entry.treatment}
            title={'title' in block ? block.title : undefined}
            eyebrow={'eyebrow' in block ? block.eyebrow : undefined}
          >
            {body}
          </BoardBlock>
        )
      })}
    </div>
  )
}
