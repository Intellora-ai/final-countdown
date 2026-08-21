/* THE CONTENT LANGUAGE.
 *
 * A LearningBoard is what an answer IS, expressed as data. The shell is
 * permanent; this is the part that changes per question.
 *
 * THE BOUNDARY THIS FILE DEFENDS. Nothing here describes appearance. There is
 * no colour, no font, no radius, no spacing, no coordinate, no HTML and no
 * class name — and there is no field where one could be smuggled in. A block
 * says what it MEANS (a table, a callout) and at most how important it is
 * (`layout.width`, a semantic word, not a pixel count). Everything visual is
 * decided by the block registry and the stylesheet, which a generator cannot
 * reach.
 *
 * WHY THE UNION IS DERIVED FROM AN ARRAY. `BlockType` and `ALL_BLOCK_TYPES`
 * describe the same set, and two hand-written copies of one set drift. The
 * array is the single declaration; the union is read off it. A type added in
 * one place cannot be missing from the other.
 *
 * PHASE 1 IMPLEMENTS THREE. The other eleven are declared here on purpose: it
 * means the registry's fallback path is exercised by values that will really
 * arrive, rather than by a string nobody would ever send.
 */

/* Every block type the product will ever accept. Phase 1 renders the first
 * three; the rest resolve to UnknownBlock until their component exists. */
export const ALL_BLOCK_TYPES = [
  'explanation', 'table', 'callout',                     // Phase 1
  'text', 'pie_chart', 'bar_chart', 'line_chart',        // future
  'equation', 'process', 'timeline', 'comparison',
  'diagram', 'example', 'quiz',
] as const

export type BlockType = (typeof ALL_BLOCK_TYPES)[number]

/* How a board arranges its blocks. Phase 1 implements 'grid' only; the union
 * exists so a future board can declare 'spatial' without changing this type. */
export const ALL_LAYOUT_MODES = ['flow', 'grid', 'spatial', 'stack'] as const
export type BoardLayoutMode = (typeof ALL_LAYOUT_MODES)[number]

/* Semantic importance, not a column count. The grid decides what each word is
 * worth at each size, and that mapping lives in board-theme.css. */
export const ALL_BLOCK_WIDTHS = ['small', 'medium', 'wide', 'full'] as const
export type BlockWidth = (typeof ALL_BLOCK_WIDTHS)[number]

export interface BlockLayout {
  width?: BlockWidth
  /** Reserved for spatial mode. The Phase 1 grid renderer ignores it. */
  position?: 'auto'
}

export interface BlockBase {
  /** Stable and unique within the board. Used as the React key and, later, as
   *  the anchor a connector points at. */
  id: string
  type: BlockType
  title?: string
  /** Small mono label above the title, e.g. "STEP 2". */
  eyebrow?: string
  layout?: BlockLayout
}

export interface ExplanationBlock extends BlockBase {
  type: 'explanation'
  /** Blank lines separate paragraphs. No markup is interpreted. */
  content: string
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

/* The Phase 1 union. Adding a future block interface here turns every
 * exhaustive switch over Block into a compile error until it is handled. */
export type Block = ExplanationBlock | TableBlock | CalloutBlock

/** Which of ALL_BLOCK_TYPES have a component today. Kept next to the union it
 *  describes so the registry test can assert the two agree. */
export const IMPLEMENTED_BLOCK_TYPES = ['explanation', 'table', 'callout'] as const
export type ImplementedBlockType = (typeof IMPLEMENTED_BLOCK_TYPES)[number]

/* Declared now so the JSON shape is final and no migration is needed later.
 * Always empty in Phase 1 — nothing renders connectors yet. */
export interface Connector {
  id: string
  /** Block id. */
  from: string
  /** Block id. */
  to: string
  kind?: 'causal' | 'sequence' | 'reference'
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
