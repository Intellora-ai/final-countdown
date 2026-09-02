/**
 * WHAT IS INSIDE A TOPIC — the canonical knowledge model.
 *
 * WHY THIS LAYER EXISTS AT ALL.
 *
 *   The curriculum in this repository goes `Subject -> Chapter -> Concept`, and
 *   the concept is a LEAF. Measured: 3,995 of them across four classes, and the
 *   only keys any of them carries are `deps`, `id`, `minutes`, `name`, `source`.
 *   `practice/officialCurriculum.ts` writes it down plainly -- "the concept IS
 *   the topic". So when a student opens a topic, nothing in this product knows
 *   what is inside it, and the only way to find out was to ask a model at the
 *   moment she asked -- which gives a different answer every time, to every
 *   student, at the cost of a model call, with nothing checkable.
 *
 *   This is the missing layer. It is generated ONCE, offline, verified, given a
 *   version, and committed. At runtime it is read, never written.
 *
 * THE INVARIANT THIS FILE ENFORCES.
 *
 *   No component, including a model, may be the sole source of truth for what a
 *   topic contains. A model may PROPOSE; only a checked, versioned, committed
 *   file may be shown to a student. `status` is how that is enforced: a
 *   `candidate` never reaches a canvas.
 *
 * SHAPE IS DATA, NOT A TEMPLATE.
 *
 *   Some topics genuinely are one idea. Manufacturing three sub-parts to fill a
 *   list is the exact hallucination this layer exists to prevent, so `atomic`
 *   is a first-class answer and an atomic model is REQUIRED to have no concepts.
 *   A schema that made `concepts` non-empty would force the lie.
 */

import { z } from 'zod'

/** Where a piece of knowledge came from. Every concept must carry at least one. */
export const Provenance = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('syllabus'),
    /** The locked source document, e.g. "maths-x". */
    pdf: z.string().min(1),
    page: z.number().int().positive(),
    /** The words on that page this was read from, verbatim. */
    quote: z.string().min(1),
  }),
  z.object({
    kind: z.literal('web'),
    url: z.string().url(),
    title: z.string().min(1),
    retrievedAt: z.string().min(1),
    /** The sentence that confirmed this concept exists and is named this way. */
    quote: z.string().min(1),
  }),
])
export type Provenance = z.infer<typeof Provenance>

const Named = {
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'ids are lowercase kebab-case'),
  name: z.string().min(2).max(200),
}

/** One thing inside a concept. Depth stops here, deliberately: see `Concept`. */
export const SubConcept = z.object({
  ...Named,
  evidence: z.array(Provenance).min(1),
}).strict()
export type SubConcept = z.infer<typeof SubConcept>

/**
 * One thing inside a topic.
 *
 * TWO LEVELS AND NO MORE. A knowledge graph is the right INTERNAL model and a
 * tree is the right thing to show a student; three levels of nesting is neither.
 * Anything deeper than a sub-concept is a topic of its own, and the curriculum
 * already has a place for those.
 */
export const Concept = z.object({
  ...Named,
  subConcepts: z.array(SubConcept).max(12).optional(),
  /** Ids of concepts, in this topic or another, that must come first. */
  requires: z.array(z.string()).optional(),
  evidence: z.array(Provenance).min(1),
}).strict()
export type Concept = z.infer<typeof Concept>

/**
 * How a topic is shaped. Read off the content, never imposed.
 *
 *   atomic        one idea; `concepts` MUST be empty
 *   flat          several concepts, none of which needs breaking down
 *   hierarchical  at least one concept has sub-concepts
 */
export const Shape = z.enum(['atomic', 'flat', 'hierarchical'])
export type Shape = z.infer<typeof Shape>

/**
 * `candidate` was produced and not yet checked by a person; it must never be
 * shown. `verified` has passed the deterministic checks AND been read.
 */
export const Status = z.enum(['candidate', 'verified'])
export type Status = z.infer<typeof Status>

export const KnowledgeModel = z.object({
  /** The curriculum topic id this belongs to, exactly as the curriculum spells it. */
  topicId: z.string().min(1),
  topicName: z.string().min(1),
  /** Which curriculum: "cbse-class-10", "jee-main-2026". Scope differs by level. */
  curriculum: z.string().min(1),
  subjectId: z.string().min(1),
  chapterId: z.string().min(1),

  version: z.number().int().positive(),
  status: Status,
  shape: Shape,

  concepts: z.array(Concept).max(20),

  /** What produced this: "syllabus-extraction", or a model's name. Never blank. */
  generatedBy: z.string().min(1),
  verifiedAt: z.string().optional(),
}).strict()
  .refine((m) => (m.shape === 'atomic' ? m.concepts.length === 0 : m.concepts.length > 0), {
    message: 'an atomic topic has no concepts, and any other shape has at least one',
    path: ['concepts'],
  })
  .refine(
    (m) =>
      m.shape !== 'hierarchical' || m.concepts.some((c) => (c.subConcepts?.length ?? 0) > 0),
    { message: 'a hierarchical topic has at least one concept with sub-concepts', path: ['shape'] },
  )
  .refine(
    (m) => m.shape !== 'flat' || m.concepts.every((c) => (c.subConcepts?.length ?? 0) === 0),
    { message: 'a flat topic has no sub-concepts; call it hierarchical', path: ['shape'] },
  )
  .refine((m) => new Set(m.concepts.map((c) => c.id)).size === m.concepts.length, {
    message: 'two concepts share an id',
    path: ['concepts'],
  })
  .refine((m) => m.status !== 'verified' || typeof m.verifiedAt === 'string', {
    message: 'a verified model records when it was verified',
    path: ['verifiedAt'],
  })

export type KnowledgeModel = z.infer<typeof KnowledgeModel>

/** One file holds every model for one subject in one curriculum. */
export const KnowledgeFile = z.object({
  curriculum: z.string().min(1),
  subjectId: z.string().min(1),
  models: z.array(KnowledgeModel),
}).strict()
export type KnowledgeFile = z.infer<typeof KnowledgeFile>
