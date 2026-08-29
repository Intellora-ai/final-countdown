import { z } from 'zod'

import { REPRESENTATIONS, type RepresentationName, shapeOf } from './representations'
import { BlockRole } from './roles'
import { checkShape, type ShapeData, type ShapeIssue } from './shapeInvariants'

/**
 * The bridge between the registry and a lesson.
 *
 * ONE BLOCK KIND CARRIES ALL 137 REPRESENTATIONS
 * ----------------------------------------------
 * Adding a `kind` to the lesson schema for every named chart would mean 137
 * discriminated union members, 137 renderers to dispatch, and a schema nobody
 * can read. Instead a `figure` block names its representation and supplies the
 * data in that representation's SHAPE. The shape decides the renderer and the
 * invariants; the name decides the variant.
 *
 * WHY THE AUTHOR NAMES THE TYPE AND NOT THE SHAPE
 * -----------------------------------------------
 * "Draw this as a Sankey" is a thing a teacher can say. "Supply flowWeighted
 * data" is not. The registry translates one into the other, so the vocabulary
 * stays human while the machinery stays small.
 *
 * Note what is still absent: no width, no colour, no position. A figure says
 * WHAT it is and WHAT the data is. Everything else is downstream.
 */

const Id = z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*$/)
const Label = z.string().min(1).max(160)

/* -------------------------------------------------------------------------- */
/* Shape payloads                                                             */
/* -------------------------------------------------------------------------- */

const Point = z.object({ x: z.union([z.number(), z.string()]), y: z.number() }).strict()

const SeriesPayload = z
  .object({
    shape: z.literal('series'),
    series: z
      .array(
        z
          .object({
            name: Label,
            /** An INDEX into the design system's fixed palette. Never a colour. */
            colorIndex: z.number().int().min(0).max(5).default(0),
            points: z.array(Point).min(1).max(2000),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    continuousX: z.boolean().default(false),
    stacked: z.boolean().default(false),
    xLabel: Label.optional(),
    yLabel: Label.optional(),
  })
  .strict()

const DistributionPayload = z
  .object({
    shape: z.literal('distribution'),
    groups: z
      .array(z.object({ name: Label, samples: z.array(z.number()).min(1).max(5000) }).strict())
      .min(1)
      .max(12),
    /* Stated because they CHANGE THE ANSWER: a different bin width reports a
       different shape, and the reader cannot tell which came from the data. */
    binWidth: z.number().positive().optional(),
    bandwidth: z.number().positive().optional(),
  })
  .strict()

const PartsPayload = z
  .object({
    shape: z.literal('parts'),
    parts: z.array(z.object({ label: Label, value: z.number() }).strict()).min(1).max(40),
    /** When given, the parts must sum to it — a falsifiable claim, so checked. */
    whole: z.number().optional(),
  })
  .strict()

const MatrixPayload = z
  .object({
    shape: z.literal('matrix'),
    rows: z.array(Label).min(1).max(80),
    columns: z.array(Label).min(1).max(80),
    /** null is genuinely absent, which is a different claim from zero. */
    values: z.array(z.array(z.number().nullable())).min(1),
    symmetric: z.boolean().default(false),
  })
  .strict()

const GraphPayload = z
  .object({
    shape: z.literal('graph'),
    nodes: z.array(z.object({ id: Id, label: Label, group: Label.optional() }).strict()).min(1).max(200),
    edges: z
      .array(
        z.object({ from: Id, to: Id, label: Label.optional(), weight: z.number().optional() }).strict(),
      )
      .max(600),
    directed: z.boolean().default(false),
    /** Declared, not inferred. A cycle then becomes a contradiction, not a warning. */
    acyclic: z.boolean().default(false),
    bipartite: z.boolean().default(false),
  })
  .strict()

const HierarchyPayload = z
  .object({
    shape: z.literal('hierarchy'),
    nodes: z
      .array(
        z.object({ id: Id, label: Label, parent: Id.nullable(), value: z.number().optional() }).strict(),
      )
      .min(1)
      .max(400),
    sizedByValue: z.boolean().default(false),
  })
  .strict()

const FlowWeightedPayload = z
  .object({
    shape: z.literal('flowWeighted'),
    nodes: z.array(z.object({ id: Id, label: Label }).strict()).min(2).max(80),
    links: z.array(z.object({ from: Id, to: Id, value: z.number() }).strict()).min(1).max(400),
    /** False for a deliberately lossy diagram (drop-off, attrition, waste). */
    conserved: z.boolean().default(false),
  })
  .strict()

const IntervalsPayload = z
  .object({
    shape: z.literal('intervals'),
    items: z
      .array(
        z
          .object({
            id: Id,
            label: Label,
            start: z.number(),
            end: z.number(),
            lane: Label.optional(),
            dependsOn: z.array(Id).max(20).default([]),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict()

const ProcessPayload = z
  .object({
    shape: z.literal('process'),
    steps: z
      .array(
        z
          .object({
            id: Id,
            label: Label,
            kind: z.enum(['start', 'action', 'decision', 'end']),
            lane: Label.optional(),
          })
          .strict(),
      )
      .min(2)
      .max(120),
    transitions: z
      .array(z.object({ from: Id, to: Id, label: Label.optional() }).strict())
      .min(1)
      .max(300),
  })
  .strict()

const LogicPayload = z
  .object({
    shape: z.literal('logic'),
    inputs: z.array(Label).max(6).optional(),
    rows: z.array(z.array(z.boolean())).max(64).optional(),
    steps: z
      .array(
        z
          .object({
            id: Id,
            statement: Label,
            rule: Label.optional(),
            from: z.array(Id).max(8).default([]),
          })
          .strict(),
      )
      .max(80)
      .optional(),
  })
  .strict()

const TabularPayload = z
  .object({
    shape: z.literal('tabular'),
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
      .max(12),
    rows: z.array(z.record(z.union([z.string(), z.number(), z.null()]))).min(1).max(500),
  })
  .strict()

const GeometryPayload = z
  .object({
    shape: z.literal('geometry'),
    /** A construction is described by its parts, never by its coordinates. */
    elements: z
      .array(
        z
          .object({
            id: Id,
            kind: z.enum(['point', 'line', 'vector', 'arc', 'set', 'body', 'force', 'component', 'axis', 'region']),
            label: Label,
            /** Semantic anchors: "at the origin", "on AB". Not pixels. */
            relation: Label.optional(),
            magnitude: z.number().optional(),
            angleDegrees: z.number().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(60),
  })
  .strict()

export const Payload = z.discriminatedUnion('shape', [
  SeriesPayload,
  DistributionPayload,
  PartsPayload,
  MatrixPayload,
  GraphPayload,
  HierarchyPayload,
  FlowWeightedPayload,
  IntervalsPayload,
  ProcessPayload,
  LogicPayload,
  TabularPayload,
  GeometryPayload,
])

export type Payload = z.output<typeof Payload>

/* -------------------------------------------------------------------------- */
/* The figure block                                                           */
/* -------------------------------------------------------------------------- */

const RepresentationEnum = z.enum(
  Object.keys(REPRESENTATIONS) as [RepresentationName, ...RepresentationName[]],
)

export const FigureBlock = z
  .object({
    kind: z.literal('figure'),
    id: Id,
    title: Label.optional(),
    emphasis: z.enum(['primary', 'supporting', 'aside']).default('supporting'),
    tone: z.enum(['neutral', 'insight', 'warning', 'result']).default('neutral'),
    /** The teaching job this block does. Imported rather than re-declared: see `roles.ts`. */
    role: BlockRole.default('support'),
    /** Core answer, or material offered beyond it. See `BlockBase.depth` in `spec.ts`. */
    depth: z.enum(['core', 'deeper']).default('core'),
    /** One of the 137 names. The registry turns it into a shape and a variant. */
    as: RepresentationEnum,
    data: Payload,
    caption: Label.optional(),
  })
  .strict()

export type FigureBlock = z.output<typeof FigureBlock>

/* -------------------------------------------------------------------------- */
/* Checking                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A figure is wrong two ways, and both are caught here.
 *
 * The first is a MISMATCH: asking for a Sankey and supplying series data. The
 * registry knows which shape each name needs, so this is decidable rather than
 * a rendering surprise.
 *
 * The second is the shape's own invariants — a cycle in a declared DAG, parts
 * that do not sum, a decision with one outcome.
 */
export function checkFigure(block: FigureBlock, at: string): ShapeIssue[] {
  const required = shapeOf(block.as)

  if (block.data.shape !== required) {
    return [
      {
        path: `${at}.data.shape`,
        message: `"${block.as}" needs ${required} data, but ${block.data.shape} was supplied`,
        level: 'reject',
      },
    ]
  }

  /* Two shapes are drawn constructions rather than datasets — there is no
     arithmetic in a free-body diagram to be wrong about. */
  if (required === 'tabular' || required === 'geometry') return []

  return checkShape({ ...block.data, variant: block.as } as ShapeData, `${at}.data`)
}

/** What this figure is for, from the registry. Used by the layout grammar. */
export function intentOf(block: FigureBlock) {
  return REPRESENTATIONS[block.as].intent
}

/** When this representation is the wrong tool, in the registry's words. */
export function avoidWhen(block: FigureBlock): string {
  return REPRESENTATIONS[block.as].avoidWhen
}
