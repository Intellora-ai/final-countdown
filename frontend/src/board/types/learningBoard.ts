/* THE CONTENT LANGUAGE.
 *
 * A LearningBoard is what an answer IS, expressed as data. The shell is
 * permanent; this is the part that changes per question.
 *
 * THE BOUNDARY THIS FILE DEFENDS. Nothing here describes appearance. There is
 * no colour, no font, no radius, no coordinate for ordinary content, no HTML
 * and no class name — and no field where one could be smuggled in. A block
 * says what it MEANS; the registry and stylesheet decide what that looks like.
 * The one spatial exception is a diagram node's optional grid position,
 * because WHERE a node sits in a concept map is meaning, not styling — and it
 * exists only inside the diagram type, so spatial data structurally cannot
 * reach a paragraph or a table.
 *
 * THREE TIERS OF TRUST.
 *   BoardSource      unknown. What a fixture module or a future generator
 *                    hands over. Nothing renders it directly.
 *   LearningBoard    the authoring type. Valid fixtures are written as this so
 *                    the compiler checks them, then exposed as BoardSource.
 *   ValidatedBoard   what validateBoard() emits and the renderer consumes.
 *                    Its blocks may include UnknownBlockData — a block whose
 *                    type this build cannot draw, preserved rather than lost.
 */

/* ── The catalogue ─────────────────────────────────────────────────────── */

/* Every block type this build implements. The union is read off the array so
 * the two cannot drift. */
export const ALL_BLOCK_TYPES = [
  'explanation', 'table', 'callout',
  'text', 'pie_chart', 'bar_chart', 'line_chart',
  'equation', 'process', 'timeline', 'comparison',
  'diagram', 'example', 'quiz',
  'image', 'simulation',
] as const

export type BlockType = (typeof ALL_BLOCK_TYPES)[number]

/* All 16 are implemented in Phase 1B; the alias remains because the registry
 * test asserts parity against it, and a future phase may again declare ahead
 * of implementing. */
export const IMPLEMENTED_BLOCK_TYPES = ALL_BLOCK_TYPES
export type ImplementedBlockType = BlockType

export const ALL_LAYOUT_MODES = ['flow', 'grid', 'spatial', 'stack'] as const
export type BoardLayoutMode = (typeof ALL_LAYOUT_MODES)[number]

export const ALL_BLOCK_WIDTHS = ['small', 'medium', 'wide', 'full'] as const
export type BlockWidth = (typeof ALL_BLOCK_WIDTHS)[number]

export interface BlockLayout {
  width?: BlockWidth
  /** Reserved. The grid renderer ignores it. */
  position?: 'auto'
}

export interface BlockBase {
  /** Stable and unique within the board. React key; connector anchor. */
  id: string
  type: BlockType
  title?: string
  /** Small mono label above the title, e.g. "STEP 2". */
  eyebrow?: string
  layout?: BlockLayout
}

/* ── Block payloads ───────────────────────────────────────────────────── */

export interface ExplanationBlock extends BlockBase {
  type: 'explanation'
  /** Blank lines separate paragraphs. No markup is interpreted. */
  content: string
}

/** Paragraphs of emphasised segments. Emphasis is a WORD ('strong'|'accent');
 *  the stylesheet decides what a word looks like. Never HTML. */
export interface TextBlock extends BlockBase {
  type: 'text'
  paragraphs: Array<Array<{ text: string; emphasis?: 'strong' | 'accent' }>>
}

export interface TableBlock extends BlockBase {
  type: 'table'
  columns: string[]
  rows: (string | number)[][]
}

export const ALL_CALLOUT_TONES = ['note', 'key', 'warning'] as const
export type CalloutTone = (typeof ALL_CALLOUT_TONES)[number]

export interface CalloutBlock extends BlockBase {
  type: 'callout'
  content: string
  tone?: CalloutTone
}

export interface PieChartBlock extends BlockBase {
  type: 'pie_chart'
  data: Array<{ label: string; value: number }>
}

export interface BarChartBlock extends BlockBase {
  type: 'bar_chart'
  data: Array<{ label: string; value: number; highlight?: boolean }>
  yLabel?: string
}

export interface LineChartBlock extends BlockBase {
  type: 'line_chart'
  points: Array<{ x: string | number; y: number }>
  /** Index into points; the renderer marks it. */
  highlightIndex?: number
  yLabel?: string
  xLabel?: string
}

export interface EquationBlock extends BlockBase {
  type: 'equation'
  /** Rendered as text with math typography. Never interpreted as HTML. */
  latex: string
  variables?: Array<{ symbol: string; meaning: string; unit?: string }>
}

export interface ProcessBlock extends BlockBase {
  type: 'process'
  steps: Array<{ title: string; detail?: string }>
}

export interface TimelineBlock extends BlockBase {
  type: 'timeline'
  events: Array<{ at: string; label: string; detail?: string }>
}

export interface ComparisonBlock extends BlockBase {
  type: 'comparison'
  /** The things being compared — column heads. 2 or 3. */
  subjects: string[]
  /** Shared criteria; values align with subjects by index. */
  criteria: Array<{ label: string; values: string[] }>
}

export type DiagramEdgeKind = 'causal' | 'sequence' | 'reference'

export interface DiagramBlock extends BlockBase {
  type: 'diagram'
  nodes: Array<{
    id: string
    label: string
    detail?: string
    group?: string
    /** Semantic grid cell, NOT pixels. Only diagram nodes may be spatial. */
    position?: { col: number; row: number }
  }>
  edges: Array<{ from: string; to: string; kind?: DiagramEdgeKind; label?: string }>
}

export interface ExampleBlock extends BlockBase {
  type: 'example'
  prompt: string
  input?: string
  working: string[]
  result?: string
}

export interface QuizBlock extends BlockBase {
  type: 'quiz'
  prompt: string
  options: Array<{ id: string; label: string; correct?: boolean }>
  explanation?: string
}

export interface ImageBlock extends BlockBase {
  type: 'image'
  /** data:image/* URI, relative local path, or imported asset. The validator
   *  refuses http(s), protocol-relative and javascript: sources outright. */
  src: string
  /** Required. An image nobody can hear described is dropped, not rendered. */
  alt: string
  caption?: string
  sourceNote?: string
}

export interface SimulationBlock extends BlockBase {
  type: 'simulation'
  kind: 'particle-box'
  /** Kelvin only — P ∝ T is false in Celsius. The validator enforces 'K'. */
  unit: 'K'
  minTemp: number
  maxTemp: number
  initialTemp: number
}

export type Block =
  | ExplanationBlock | TextBlock | TableBlock | CalloutBlock
  | PieChartBlock | BarChartBlock | LineChartBlock
  | EquationBlock | ProcessBlock | TimelineBlock | ComparisonBlock
  | DiagramBlock | ExampleBlock | QuizBlock
  | ImageBlock | SimulationBlock

/* ── Connectors and board ─────────────────────────────────────────────── */

export const ALL_CONNECTOR_KINDS = ['causal', 'sequence', 'reference'] as const
export type ConnectorKind = (typeof ALL_CONNECTOR_KINDS)[number]

export interface Connector {
  id: string
  /** Block id. */
  from: string
  /** Block id. */
  to: string
  kind?: ConnectorKind
  label?: string
}

export interface BoardMetadata {
  chapterId?: string
  conceptId?: string
  /** Provenance. 'fixture' content is never presented as learner data. */
  source?: 'fixture' | 'authored' | 'ai'
}

export interface LearningBoard {
  type: 'learning_board'
  version: 1
  id: string
  title: string
  subtitle?: string | null
  /** Defaults to 'grid'. */
  layout?: BoardLayoutMode
  blocks: Block[]
  connectors?: Connector[]
  metadata?: BoardMetadata
}

/* ── The trust boundary ───────────────────────────────────────────────── */

/** What a fixture module or a future generator hands over. Untrusted. */
export type BoardSource = unknown

/* A block whose type this build cannot draw, preserved through validation
 * rather than erased. 'unknown' is OUTPUT-ONLY: it is not in ALL_BLOCK_TYPES
 * and the validator never accepts it as input. */
export interface UnknownBlockData {
  type: 'unknown'
  id: string
  originalType: string
  /** The safe fallback sentence UnknownBlock renders. Nothing else from the
   *  original payload survives — an unknown type cannot smuggle content. */
  message: string
}

export type ValidatedBlock = Block | UnknownBlockData

export interface ValidatedBoard extends Omit<LearningBoard, 'blocks'> {
  blocks: ValidatedBlock[]
}

/* Every repair, truncation or drop is a Notice the learner can see. Silence
 * is the one failure mode the validator is not allowed to have. */
export interface Notice {
  level: 'info' | 'warn'
  blockId?: string
  message: string
}

export type BoardResult =
  | { status: 'ok'; board: ValidatedBoard; notices: Notice[] }
  | { status: 'repaired'; board: ValidatedBoard; notices: Notice[] }
  | { status: 'failed'; error: string; notices: Notice[] }
