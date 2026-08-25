import { z } from 'zod'

import { FigureBlock } from './figure'

/**
 * The LessonSpec — the only thing a model is allowed to emit.
 *
 * THE SCHEMA IS THE LAW
 * ---------------------
 * Laws 1-3 say the author never draws, never positions, never styles. Written
 * as prose in a brief, those are wishes. Written as a schema with `.strict()`,
 * they are the difference between a lesson that renders and one that is
 * refused — because `.strict()` makes an unknown key a parse ERROR rather than
 * a silently ignored field.
 *
 * That distinction is the whole design. A permissive schema that drops `color`
 * on the floor still lets a model believe it chose the colour, and the next
 * model trained on those transcripts learns to keep sending it. Refusing is
 * what keeps the contract honest in both directions.
 *
 * WHAT THE AUTHOR DECIDES:  what exists, what it means, how blocks relate
 * WHAT THE AUTHOR NEVER DECIDES:  where anything goes, or what it looks like
 */

/* -------------------------------------------------------------------------- */
/* Semantic vocabulary — roles, never values                                  */
/* -------------------------------------------------------------------------- */

/**
 * How much of the reader's attention a block is asking for.
 *
 * Deliberately three words and not a number: a scale invites "emphasis: 7",
 * which is a design decision wearing a semantic costume. Three roles force the
 * author to say what the block IS to the argument, and let the design system
 * decide what that looks like.
 */
export const Emphasis = z.enum(['primary', 'supporting', 'aside'])
export type Emphasis = z.infer<typeof Emphasis>

/** Meaning, not colour. `warning` may render amber here and red elsewhere. */
export const Tone = z.enum(['neutral', 'insight', 'warning', 'result'])
export type Tone = z.infer<typeof Tone>

/** Which token in the fixed series a data series takes. An INDEX, never a hex. */
export const SeriesIndex = z.number().int().min(0).max(5)

const Id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'ids are lowercase kebab-case')

const Label = z.string().min(1).max(120)
/**
 * One idea, not one essay.
 *
 * This was 2000 for as long as the schema existed, and the guidance beside it
 * said "keep each block to one idea" — a request, which cannot fail a build.
 * The number is measured, and the first attempt at it was measured WRONG. 320
 * was taken from the generated lessons and the engine fixture alone, which is
 * where a model's output lands; it broke 24 tests, because the hand-authored
 * acceptance lessons are longer and nobody had looked at them. Across every
 * lesson in the repo the longest body is 394 characters, in
 * classifierEvaluation.ts, so 400 refuses nothing that exists.
 *
 * What changes is the ceiling. At 2000 a wall of text is expressible and a
 * model will eventually write one; at 400 it is not, and ideas that were being
 * fused into a paragraph have to become separate blocks instead.
 *
 * EXPORTED, and that matters. The web resolver clamped its own evidence to a
 * private 600 and built a prose block out of it. Two places holding the same
 * fact is how they disagree, and they did the moment this cap moved: the
 * resolver produced a 600-character body the schema then refused, so a real
 * answer turned into a refusal. Anything constructing prose reads THIS.
 *
 * That is the point. A block cap is the only part of "one idea per block" that
 * does not depend on the author agreeing with it.
 */
export const PROSE_MAX = 400
const Prose = z.string().min(1).max(PROSE_MAX)

/* -------------------------------------------------------------------------- */
/* Blocks                                                                     */
/* -------------------------------------------------------------------------- */

const BlockBase = {
  id: Id,
  /** Shown as the block's heading. Optional: not every block needs one. */
  title: Label.optional(),
  emphasis: Emphasis.default('supporting'),
  tone: Tone.default('neutral'),
}

/** Running text. The default block, and the one to prefer when unsure. */
export const ProseBlock = z
  .object({ ...BlockBase, kind: z.literal('prose'), body: Prose })
  .strict()

/** A single idea worth pulling out of the flow. */
export const CalloutBlock = z
  .object({ ...BlockBase, kind: z.literal('callout'), body: Prose })
  .strict()

/**
 * One number that matters, with its unit and an optional comparison.
 *
 * `delta` is the CHANGE, not a colour: the renderer decides that up-is-good
 * here and up-is-bad in a lesson about error rates, from `deltaMeaning`.
 */
export const MetricBlock = z
  .object({
    ...BlockBase,
    kind: z.literal('metric'),
    value: z.union([z.number(), z.string()]),
    unit: Label.optional(),
    delta: z.number().optional(),
    deltaMeaning: z.enum(['up-is-good', 'up-is-bad', 'neutral']).default('neutral'),
    caption: Label.optional(),
  })
  .strict()

/** LaTeX, rendered by KaTeX. `highlight` names TERMS, not glyph positions. */
export const EquationBlock = z
  .object({
    ...BlockBase,
    kind: z.literal('equation'),
    latex: z.string().min(1).max(600),
    /** Substrings to draw the eye to, e.g. ['RT']. Semantic, not coordinates. */
    highlight: z.array(z.string().min(1).max(40)).max(6).default([]),
    caption: Label.optional(),
  })
  .strict()

/**
 * Tabular data.
 *
 * `align` is NOT here on purpose — that is Law 3. The renderer aligns by
 * COLUMN TYPE: numbers right, text left. Letting the author align a column is
 * how a schema starts carrying layout one field at a time.
 */
export const TableBlock = z
  .object({
    ...BlockBase,
    kind: z.literal('table'),
    columns: z
      .array(
        z
          .object({
            key: Id,
            label: Label,
            type: z.enum(['text', 'number', 'percent', 'currency']).default('text'),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    rows: z.array(z.record(z.union([z.string(), z.number(), z.null()]))).min(1).max(200),
    caption: Label.optional(),
  })
  .strict()

/**
 * A relationship between numbers.
 *
 * `chartType` is a claim about the DATA's shape, not a picture: `line` says
 * "continuous over an ordered axis", `pie` says "parts of one whole". The
 * validator can therefore refuse a pie chart whose parts do not sum, which a
 * purely visual field could never support.
 */
export const ChartBlock = z
  .object({
    ...BlockBase,
    kind: z.literal('chart'),
    chartType: z.enum(['line', 'bar', 'scatter', 'pie', 'area']),
    xLabel: Label.optional(),
    yLabel: Label.optional(),
    series: z
      .array(
        z
          .object({
            name: Label,
            /** Index into the design system's fixed series palette. */
            colorIndex: SeriesIndex.default(0),
            points: z
              .array(
                z
                  .object({ x: z.union([z.number(), z.string()]), y: z.number() })
                  .strict(),
              )
              .min(1)
              .max(500),
          })
          .strict(),
      )
      .min(1)
      .max(6),
    /** A single point worth naming, by its x value. Not a pixel. */
    annotate: z
      .object({ atX: z.union([z.number(), z.string()]), label: Label })
      .strict()
      .optional(),
    caption: Label.optional(),
  })
  .strict()

/**
 * A causal or sequential chain.
 *
 * Nodes carry text and nothing else. The layout grammar decides whether this
 * becomes a left-to-right chain, a wrapped chain, or a vertical stack, based on
 * how many nodes there are and how much room the frame has.
 */
export const FlowBlock = z
  .object({
    ...BlockBase,
    kind: z.literal('flow'),
    nodes: z
      .array(z.object({ id: Id, label: Label, tone: Tone.default('neutral') }).strict())
      .min(2)
      .max(12),
    /** `from`/`to` reference node ids. Validated as a real graph, not free text. */
    links: z
      .array(z.object({ from: Id, to: Id, label: Label.optional() }).strict())
      .min(1)
      .max(24),
    caption: Label.optional(),
  })
  .strict()

/**
 * A physical system the reader can drive.
 *
 * The author names the MODEL and its controls, never the rendering. The same
 * spec drives the 2D schematic and the 3D scene — which is what makes the
 * 2D/3D switch a view toggle rather than two authored lessons.
 */
export const SimulationBlock = z
  .object({
    ...BlockBase,
    kind: z.literal('simulation'),
    model: z.enum(['ideal-gas']),
    controls: z
      .array(
        z
          .object({
            key: z.enum(['temperature', 'volume', 'moles']),
            label: Label,
            min: z.number(),
            max: z.number(),
            initial: z.number(),
            unit: Label.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(4),
    /** Which derived quantities to display. Order is the author's emphasis. */
    readouts: z.array(z.enum(['pressure', 'temperature', 'volume', 'moles'])).min(1).max(4),
    caption: Label.optional(),
  })
  .strict()

export const Block = z.discriminatedUnion('kind', [
  ProseBlock,
  CalloutBlock,
  MetricBlock,
  EquationBlock,
  TableBlock,
  ChartBlock,
  FlowBlock,
  SimulationBlock,
  /*
   * The general case. `chart`, `table` and `flow` above are the three shapes
   * common enough to deserve their own ergonomic block; `figure` reaches the
   * other 130-odd named representations through the registry.
   *
   * They are kept as separate kinds rather than collapsed into `figure`
   * because the short forms are what a teacher will actually write, and a
   * schema nobody wants to type is a schema nobody uses.
   */
  FigureBlock,
])
/** The rendered shape: defaults applied, so a renderer can trust every field. */
export type Block = z.output<typeof Block>
export type BlockKind = Block['kind']

/* -------------------------------------------------------------------------- */
/* The lesson                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * How blocks relate to each other — the author's ONE structural decision.
 *
 * Not a position. `supports` says block B is evidence for block A; the layout
 * grammar reads that and may place B beneath A, beside it, or behind a
 * disclosure, depending on the frame. The author states the relationship and
 * stops.
 */
export const Relation = z
  .object({
    from: Id,
    to: Id,
    kind: z.enum(['supports', 'derives', 'contrasts', 'exemplifies']),
  })
  .strict()

export const LessonSpec = z
  .object({
    id: Id,
    /** The question the lesson answers. Rendered as the title. */
    question: z.string().min(1).max(200),
    subject: Label.optional(),
    blocks: z.array(Block).min(1).max(24),
    relations: z.array(Relation).max(48).default([]),
  })
  .strict()

/*
 * TWO TYPES, AND THE DIFFERENCE MATTERS
 * -------------------------------------
 * `z.infer` is the OUTPUT type — every `.default()` already applied. Using it to
 * type an authored lesson demands `highlight: []` on an equation that highlights
 * nothing, and `relations: []` on a lesson with no relations. That is the schema
 * making the author do the parser's job.
 *
 * `LessonInput` is what a human or a model WRITES: defaults optional.
 * `Lesson` is what comes out of the validator: defaults filled, safe to render.
 * Renderers take `Lesson` and can therefore trust every field exists.
 */
export type LessonInput = z.input<typeof LessonSpec>
export type Lesson = z.output<typeof LessonSpec>
export type Relation = z.output<typeof Relation>
