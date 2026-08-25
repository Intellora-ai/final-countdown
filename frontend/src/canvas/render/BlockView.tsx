import '../design/canvas.css'

/*
 * THE STYLESHEET IS IMPORTED BY THE COMPONENT, NOT BY THE ROUTE.
 *
 * `canvas.css` used to be imported by `CanvasRoute.tsx` alone. That worked
 * while the canvas route was the only consumer, and broke silently the moment
 * the practice screen started rendering figures: every `lc-*` class emitted
 * below resolved to no rule at all on `/practice`.
 *
 * Nothing failed. A class with no rule is not an error in CSS, in TypeScript,
 * in the linter, or in any test -- so the markup was right, the styles were
 * absent, and only looking at the screen would have shown it. `lc-refusal` was
 * the worst of them: the box that says a figure contradicts its own data
 * rendered as ordinary body text and read like part of the lesson.
 *
 * Enforced by `styleOwnership.test.ts`.
 */
import { lazy, Suspense, useEffect, useRef } from 'react'
import katex from 'katex'

import { Caption, Panel, SectionLabel } from '../design/primitives'
import type { Block } from '../spec/spec'
import { FigureView } from './FigureView'
import { FlowView } from './FlowView'

/* The heavy renderers load only when a lesson actually contains one. A lesson
   of pure prose should not pay for ECharts, and almost none pay for three.js. */
const ChartView = lazy(() => import('./ChartView').then((m) => ({ default: m.ChartView })))
const TableView = lazy(() => import('./TableView').then((m) => ({ default: m.TableView })))
const SimulationView = lazy(() =>
  import('./SimulationView').then((m) => ({ default: m.SimulationView })),
)

/**
 * One block, rendered.
 *
 * THE DISPATCH IS EXHAUSTIVE ON PURPOSE
 * -------------------------------------
 * The `never` in the default arm means adding a block kind to the spec without
 * a renderer is a TYPE ERROR, not a blank space discovered by a reader. A
 * silent fallthrough is how a lesson ships with a hole in it.
 */
export function BlockView({
  block,
  marker,
  mode,
}: {
  block: Block
  /**
   * The number shown in the section marker, or null for a block with no title.
   *
   * NOT the block's index. An untitled block renders no marker, so counting by
   * index skipped a number — the page read ① ② ③ ⑤, which looks like a missing
   * section rather than a block that simply has no heading. The caller counts
   * only the blocks that actually show a marker.
   */
  marker: number | null
  mode: '2d' | '3d'
}) {
  return (
    <section className="lc-block" data-emphasis={block.emphasis} data-kind={block.kind}>
      {block.title && marker !== null && (
        <SectionLabel n={marker} sub={block.kind === 'simulation' ? 'Interactive' : undefined}>
          {block.title}
        </SectionLabel>
      )}
      <Body block={block} mode={mode} />
    </section>
  )
}

function Body({ block, mode }: { block: Block; mode: '2d' | '3d' }) {
  switch (block.kind) {
    case 'prose':
      return <p className="lc-body">{block.body}</p>

    case 'callout':
      return (
        <div className="lc-callout" data-tone={block.tone}>
          <p className="lc-body">{block.body}</p>
        </div>
      )

    case 'metric':
      return <MetricView block={block} />

    case 'equation':
      return <EquationView block={block} />

    case 'flow':
      return (
        <>
          <FlowView block={block} />
          {block.caption && <Caption>{block.caption}</Caption>}
        </>
      )

    case 'chart':
      return (
        <Suspense fallback={<Loading label="chart" />}>
          <ChartView block={block} />
          {block.caption && <Caption>{block.caption}</Caption>}
        </Suspense>
      )

    case 'table':
      return (
        <Suspense fallback={<Loading label="table" />}>
          <TableView block={block} />
          {block.caption && <Caption>{block.caption}</Caption>}
        </Suspense>
      )

    case 'simulation':
      return (
        <Panel glow>
          <Suspense fallback={<Loading label="simulation" />}>
            <SimulationView block={block} mode={mode} />
          </Suspense>
          {block.caption && <Caption>{block.caption}</Caption>}
        </Panel>
      )

    /* The general case: any of the 137 named representations. `FigureView`
       dispatches on the SHAPE the registry maps the name to, so this arm does
       not grow when a new representation is added. */
    case 'figure':
      return <FigureView block={block} />


    default: {
      const exhaustive: never = block
      return exhaustive
    }
  }
}

function Loading({ label }: { label: string }) {
  return (
    <p className="lc-caption" role="status">
      Loading {label}…
    </p>
  )
}

/* -------------------------------------------------------------------------- */
/* Metric                                                                     */
/* -------------------------------------------------------------------------- */

function MetricView({ block }: { block: Extract<Block, { kind: 'metric' }> }) {
  /* `deltaMeaning` is the author's; whether that renders as accent or warning
     is the design system's. Up is good for pressure and bad for error rate, and
     only the author knows which. */
  const good =
    block.delta === undefined || block.deltaMeaning === 'neutral'
      ? 'neutral'
      : block.deltaMeaning === 'up-is-good'
        ? String(block.delta >= 0)
        : String(block.delta < 0)

  return (
    <div>
      <div>
        <span className="lc-metric__value">
          {typeof block.value === 'number' ? formatNumber(block.value) : block.value}
        </span>
        {block.unit && <span className="lc-metric__unit">{block.unit}</span>}
      </div>
      {block.delta !== undefined && (
        <div className="lc-metric__delta" data-good={good}>
          {block.delta >= 0 ? '↑' : '↓'} {formatNumber(Math.abs(block.delta))}%
        </div>
      )}
      {block.caption && <Caption>{block.caption}</Caption>}
    </div>
  )
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (Math.abs(value) >= 1e6) return value.toExponential(2)
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

/* -------------------------------------------------------------------------- */
/* Equation                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * KaTeX, with the author's named terms underlined.
 *
 * `highlight` names a TERM ('RT'), never a position. Wrapping it in `\htmlClass`
 * before KaTeX runs is what lets the design system decide that a highlighted
 * term is an accent underline — the author never learns what it looks like.
 *
 * `throwOnError: false` is deliberate: a malformed formula renders visibly in
 * red rather than taking the whole lesson down with it. One broken equation
 * should cost one block, not the page.
 */
function EquationView({ block }: { block: Extract<Block, { kind: 'equation' }> }) {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let latex = block.latex
    for (const term of block.highlight) {
      latex = latex.split(term).join(`\\htmlClass{lc-hl}{${term}}`)
    }

    katex.render(latex, host, {
      displayMode: true,
      throwOnError: false,
      trust: true,
      strict: false,
      output: 'html',
    })
  }, [block.latex, block.highlight])

  return (
    <>
      {/*
        AN EQUATION IS AS WIDE AS ITS LONGEST LINE, AND NOTHING CAN REFLOW IT.

        KaTeX lays out to an intrinsic width and there is no wrap point inside a
        formula: `PV = nRT` at the display size measures 313px, which fits a
        320px column with 7px to spare on macOS and does not fit the same column
        on Linux CI, where the fallback metrics differ. That 7px is the whole
        margin, so the same commit passes locally and fails in CI — which is
        exactly what it did.

        Rendered bare, that overflow had nowhere to go: it pushed the document
        to `scrollWidth` 334 against `clientWidth` 320 and could not be scrolled
        to. Same defect as the chart blocks one component over, and the same
        fix — the scroller `FigureView` already gives its figures.
      */}
      <div
        className="lc-figure-scroll"
        data-overflow="scroll"
        role="region"
        tabIndex={0}
        aria-label={`${block.title ?? 'equation'}, scrollable equation`}
      >
        <div className="lc-equation" ref={hostRef} role="math" aria-label={block.latex} />
      </div>
      {block.caption && <Caption>{block.caption}</Caption>}
    </>
  )
}
