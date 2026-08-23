import ReactEChartsCore from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import {
  BarChart,
  BoxplotChart,
  CandlestickChart,
  FunnelChart,
  HeatmapChart,
  LineChart,
  ParallelChart,
  PieChart,
  RadarChart,
  SankeyChart,
  ScatterChart,
  ThemeRiverChart,
} from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  ParallelComponent,
  RadarComponent,
  SingleAxisComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'

/**
 * The ONE place echarts is pulled in, and the one place it is registered.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `import ReactECharts from 'echarts-for-react'` — which is what all six chart
 * modules used to write — reaches the package's convenience entry point, and
 * that entry imports the ENTIRE echarts library so that any chart type will
 * work without being asked for. Measured on this repo: 477 KB gzip. Registering
 * only the parts actually used brings the same six modules to 311 KB gzip, a
 * saving of about 167 KB on the first lesson a learner opens.
 *
 * It is worth being honest about the ceiling. This is a 35% cut, not a 90% one,
 * and no amount of care will do much better: the canvas renders 137 named
 * representations across twelve underlying shapes, so it genuinely needs twelve
 * chart types and nine components. echarts is heavy here because the feature is
 * broad, not because the import was careless. If the number has to come down
 * further, the lever is loading chart modules per shape rather than pruning
 * this list.
 *
 * WHY REGISTRATION LIVES HERE RATHER THAN IN EACH MODULE
 * ------------------------------------------------------
 * `echarts.use()` mutates a global registry. Six modules each registering their
 * own subset would mean the set of available charts depended on which modules
 * had been imported yet — so a chart would render in a lesson that happened to
 * also contain a pie, and silently fail in one that did not. That failure is
 * invisible in tests, which import their own module directly and therefore
 * always register what they need. One list, imported by all six, makes the
 * registry the same no matter what a lesson contains.
 *
 * ADDING A CHART TYPE
 * -------------------
 * A new named representation whose shape maps to a chart type NOT in this list
 * renders as an empty box with no error — echarts skips a series it does not
 * recognise rather than throwing. If a figure comes out blank, this list is the
 * first place to look.
 */
echarts.use([
  BarChart,
  BoxplotChart,
  CandlestickChart,
  FunnelChart,
  HeatmapChart,
  LineChart,
  ParallelChart,
  PieChart,
  RadarChart,
  SankeyChart,
  ScatterChart,
  ThemeRiverChart,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  ParallelComponent,
  RadarComponent,
  SingleAxisComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
  /*
   * SVG, not canvas. The renderer choice is not a performance preference here:
   * an SVG chart is real DOM, so its text is selectable, searchable and visible
   * to a screen reader, and the browser harness can assert on it. A canvas
   * chart is one opaque element to every one of those.
   */
  SVGRenderer,
])

/**
 * The registered core, which every call site must be handed.
 *
 * The convenience entry point wired this up invisibly. The core one does not:
 * it takes the library as a PROP, and omitting it fails at runtime with
 * `Cannot read properties of undefined (reading 'init')` rather than at compile
 * time. So it is exported beside the component and passed explicitly at all six
 * sites — verbose, but the verbosity is the thing that makes a missing wiring
 * visible in the JSX instead of at first paint.
 */
export { echarts }

/*
 * Default-exported as the class itself rather than wrapped in a component that
 * injects `echarts` for you. A wrapper would be tidier at the call sites and
 * would break `useRef<ReactECharts | null>` in ChartView, which uses this
 * binding as a TYPE to hold the chart instance for its ResizeObserver. Keeping
 * the class keeps the type.
 */
export default ReactEChartsCore
