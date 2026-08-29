import { lazy, Suspense, type ReactNode } from 'react'

import { Caption } from '../design/primitives'
import { checkFigure, type FigureBlock } from '../spec/figure'
import type {
  DistributionData,
  FlowWeightedData,
  GraphData,
  HierarchyData,
  IntervalsData,
  LogicData,
  MatrixData,
  PartsData,
  ProcessData,
  SeriesData,
} from '../spec/shapeInvariants'
/* `GeometryData` lives beside its renderer rather than in shapeInvariants,
   because geometry is one of the two shapes with no invariants to state —
   `UNCHECKED_SHAPES` names it — so there was never a payload type there to
   import. A type import is erased at build time, so naming the module costs
   the chunk nothing. */
import type { GeometryData } from './shapes/GeometryShape'
import type { TableBlock } from './TableView'

/**
 * One block kind, 137 representations.
 *
 * DISPATCH BY SHAPE, NOT BY NAME
 * ------------------------------
 * A switch over 137 names would be 137 arms all needing to be kept in step
 * with the design system. The registry collapses the name to one of twelve
 * shapes, and only the shape needs a renderer — the name arrives as a variant.
 * Adding a 138th representation is a registry row, not a component.
 *
 * REFUSAL IS PART OF RENDERING
 * ----------------------------
 * A figure whose data contradicts its own type is not drawn. The reader is
 * told which rule broke and where. Drawing it anyway would produce something
 * that looks authoritative and states a falsehood, which is strictly worse
 * than an empty space.
 */

/*
 * Static imports behind `lazy`, deliberately not a computed
 * `import(`./shapes/${shape}`)`. A template-literal import cannot be
 * statically analysed, so the bundler either inlines every shape into the main
 * chunk or fails to resolve them at all. Listing them keeps code-splitting
 * real: a lesson with one pie does not download the graph layout engine.
 *
 * Listed in `SHAPES` order so a missing renderer is visible as a gap in the
 * list rather than something you have to cross-reference to notice.
 */
const SeriesShape = lazy(() =>
  import('./shapes/SeriesShape').then((m) => ({ default: m.SeriesShape })),
)
const DistributionShape = lazy(() =>
  import('./shapes/DistributionShape').then((m) => ({ default: m.DistributionShape })),
)
const PartsShape = lazy(() =>
  import('./shapes/PartsShape').then((m) => ({ default: m.PartsShape })),
)
const MatrixShape = lazy(() =>
  import('./shapes/MatrixShape').then((m) => ({ default: m.MatrixShape })),
)
const GraphShape = lazy(() =>
  import('./shapes/GraphShape').then((m) => ({ default: m.GraphShape })),
)
const ProcessShape = lazy(() =>
  import('./shapes/ProcessShape').then((m) => ({ default: m.ProcessShape })),
)
const FlowWeightedShape = lazy(() =>
  import('./shapes/FlowWeightedShape').then((m) => ({ default: m.FlowWeightedShape })),
)
const IntervalsShape = lazy(() =>
  import('./shapes/IntervalsShape').then((m) => ({ default: m.IntervalsShape })),
)
const HierarchyShape = lazy(() =>
  import('./shapes/HierarchyShape').then((m) => ({ default: m.HierarchyShape })),
)
const GeometryShape = lazy(() =>
  import('./shapes/GeometryShape').then((m) => ({ default: m.GeometryShape })),
)
const LogicShape = lazy(() =>
  import('./shapes/LogicShape').then((m) => ({ default: m.LogicShape })),
)
/*
 * `tabular` has no shape module and should not get one. A tabular payload and a
 * `table` block carry the same columns and the same rows, so a second renderer
 * would be a second set of alignment, missing-value and scrolling rules to keep
 * in step with the first — and the day they drift, the same data reads two
 * different ways depending on which block kind an author happened to use.
 *
 * The TYPE is imported statically above and the component lazily here. A type
 * import is erased at build time, so it costs the chunk nothing.
 */
const TableView = lazy(() => import('./TableView').then((m) => ({ default: m.TableView })))

export function FigureView({ block }: { block: FigureBlock }) {
  /*
   * Checked here as well as in the validator.
   *
   * The validator sees a whole lesson before anything renders, which is the
   * right place to refuse. But a figure can also arrive from a source that
   * never met the validator — a live edit, a fetch, a future authoring tool —
   * and a renderer that trusts its input will one day draw a lie. One call.
   */
  const rejected = checkFigure(block, block.id).filter((i) => i.level === 'reject')
  if (rejected.length > 0) {
    return (
      <div className="lc-refusal" role="alert">
        <h2>This figure was refused</h2>
        <ul>
          {rejected.map((issue, i) => (
            <li key={i}>
              <code>{issue.path}</code> — {issue.message}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const drawing = draw(block)

  if (drawing === null) {
    /*
     * WHAT A LEARNER IS TOLD, AND WHAT THEY ARE NOT
     * ---------------------------------------------
     * This box used to read "No renderer yet for processdecisionFlow — for
     * sequence. Avoid it when the branches are not labelled." Three defects in
     * one sentence: the shape and the representation ran together with no
     * separator, `intent` and the shape name are internal vocabulary a reader
     * has never met, and `avoidWhen` is advice to whoever AUTHORS the lesson
     * about picking a different chart — which the person reading it cannot do
     * anything with. Telling a learner to choose a better representation is
     * asking them to fix the product.
     *
     * So the page says the one true thing that is theirs to know: the lesson is
     * fine, the drawing does not exist yet. The diagnosis a maintainer needs
     * rides along as data attributes — visible in devtools and assertable in a
     * test, invisible to a reader and silent to a screen reader.
     */
    return (
      <div className="lc-refusal" data-shape={block.data.shape} data-representation={block.as}>
        <h2>This figure cannot be drawn yet</h2>
        <p className="lc-caption">
          Nothing is missing from the lesson — this kind of drawing has not been built.
        </p>
      </div>
    )
  }

  return (
    <>
      {/*
        THE FIGURE SCROLLS; THE TEXT INSIDE IT DOES NOT SHRINK.
        ------------------------------------------------------
        Every SVG shape now draws at 1:1 (see `FigureSvg`), so a wide diagram is
        genuinely wider than a narrow screen. That has to be reachable, and
        `data-overflow="scroll"` is the attribute this codebase already uses to
        say a scroller is DELIBERATE — the measurement layer reads it so an
        intentional scroll region is not counted as a layout fault. Without it
        the overflow check would report every wide figure as clipped content.
      */}
      <div
        className="lc-figure-scroll"
        data-overflow="scroll"
        /* `role` + `tabIndex` for the same reason `.lc-table-wrap` carries them:
           a region only a mouse can move hides half the figure from anyone using
           a keyboard (WCAG 2.1.1). Named, so a screen-reader list of regions does
           not read as several identical "scrollable" entries. */
        role="region"
        tabIndex={0}
        aria-label={`${block.title ?? block.as}, scrollable figure`}
      >
        <Suspense fallback={<p className="lc-caption">Loading {block.data.shape}…</p>}>
          {drawing}
        </Suspense>
      </div>
      {block.caption && <Caption>{block.caption}</Caption>}
    </>
  )
}

/**
 * The element that draws this figure, or null when nothing can draw it yet.
 *
 * ONE TABLE, NOT A SET BESIDE A SWITCH
 * ------------------------------------
 * This was a `Set` of "implemented" shapes consulted before a chain of
 * `shape === 'series' && <SeriesShape/>` conditionals — two lists stating the
 * same fact, which is how six finished renderers came to be unreachable. The
 * set said three shapes, the conditionals said three shapes, and
 * DistributionShape, FlowWeightedShape, GraphShape, HierarchyShape,
 * IntervalsShape and ProcessShape sat behind them with 246 passing tests and no
 * route in, because every one of those suites imports its shape module directly
 * and never comes through here. Now the answer to "can this be drawn?" IS the
 * thing that draws it, so there is nothing left for the two to disagree about.
 */
function draw(block: FigureBlock): ReactNode {
  /*
   * `variant` is folded in here rather than stored on the payload.
   *
   * The shape renderers and the invariant checks both key off the named type,
   * but the AUTHOR already stated it once as `as`. Carrying it a second time
   * inside `data` would be two fields that must agree, and the day they
   * disagree the chart renders as one type and is validated as another.
   */
  const data = { ...block.data, variant: block.as }

  /*
   * Switched on the PAYLOAD's own tag rather than `shapeOf(block.as)`.
   * `checkFigure` above has already refused every figure where those two
   * disagree, so they hold the same value here — and only the payload's tag
   * narrows `block.data`, which the tabular arm needs to read `columns` and
   * `rows` without casting away the one guarantee the schema gives it.
   */
  switch (block.data.shape) {
    case 'series':
      return <SeriesShape data={data as unknown as SeriesData} variant={block.as} />

    case 'distribution':
      return <DistributionShape data={data as unknown as DistributionData} at={block.id} />

    case 'parts':
      return <PartsShape data={data as unknown as PartsData} at={block.id} />

    case 'matrix':
      return <MatrixShape data={data as unknown as MatrixData} at={block.id} />

    case 'graph':
      return <GraphShape data={data as unknown as GraphData} variant={block.as} />

    case 'process':
      return <ProcessShape data={data as unknown as ProcessData} at={block.id} />

    case 'flowWeighted':
      return <FlowWeightedShape data={data as unknown as FlowWeightedData} at={block.id} />

    case 'intervals':
      return <IntervalsShape data={data as unknown as IntervalsData} at={block.id} />

    case 'hierarchy':
      return <HierarchyShape data={data as unknown as HierarchyData} variant={block.as} />

    case 'tabular': {
      /*
       * The caption is deliberately not passed through: `TableView` does not
       * render one, and `FigureView` already prints it below the figure. Handing
       * it over as well is how a caption ends up on the page twice.
       */
      const table: TableBlock = {
        kind: 'table',
        id: block.id,
        title: block.title,
        emphasis: block.emphasis,
        tone: block.tone,
        /* The teaching job travels with the block. A figure that IS the
           contrast must still be the contrast once it is drawn as a table. */
        role: block.role,
        depth: block.depth,
        columns: block.data.columns,
        rows: block.data.rows,
      }
      return <TableView block={table} />
    }

    /*
     * These two were the last shapes with no renderer, and the comment that
     * stood here said a solver was needed rather than a chart. That was right,
     * and it is now built.
     *
     * `geometry` is a construction described by its PARTS — axes, vectors,
     * bodies, forces — with no coordinates anywhere in the payload, because
     * Law 2 forbids the author from supplying any. So the renderer derives
     * position from the semantic `relation`, `magnitude` and `angleDegrees`
     * fields. Where the data does not determine a drawing it refuses in its own
     * words rather than inventing a plausible figure, which is the one outcome
     * worse than an empty box: a diagram that is confidently wrong.
     *
     * `logic` is truth tables and proof trees. A ragged truth table and a
     * cyclic proof are both refused rather than padded or drawn.
     */
    case 'geometry':
      return <GeometryShape data={data as unknown as GeometryData} at={block.id} />

    case 'logic':
      return <LogicShape data={data as unknown as LogicData} at={block.id} />

    default: {
      /* A thirteenth shape added to the registry is a compile error here, not a
         blank space a reader discovers. */
      const unreachable: never = block.data
      return unreachable
    }
  }
}
