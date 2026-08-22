/* THE UNIVERSAL RUNTIME CONTRACT.
 *
 * Universal does NOT mean every representation shares a payload or a renderer.
 * A table and a 3D simulation have nothing in common at the data level and
 * should not be forced to pretend otherwise. Universal means every
 * representation plugs into the SAME validated lifecycle and the same token
 * system, so the engine can reason about any of them without knowing what any
 * of them are.
 *
 * The lifecycle, in order:
 *
 *   validate    is this payload the shape this representation claims?
 *   normalize   turn it into the one canonical form the renderer consumes
 *   fitness     how well does this representation serve THIS content, here?
 *   capacity    how much of it fits, and in what units?
 *   disclosure  when it does not fit, what changes — never the styling
 *   derive      the frontend decisions: scales, ticks, layout hints
 *   invariants  what must be true of the render, checked before paint
 *   degrade     if this cannot be shown honestly, what should be shown instead
 *
 * WHAT THE LLM SUPPLIES is the envelope and a semantic payload. What the
 * frontend decides is everything else: geometry, styling, rendering
 * technology, responsive behaviour, animation, and every calculation.
 */

/* ── the envelope ──────────────────────────────────────────────────────── */

export type RepresentationKind =
  | 'text' | 'table' | 'comparison' | 'equation' | 'chart'
  | 'diagram' | 'graph' | 'timeline' | 'quiz' | 'simulation'

export type LearningPurpose =
  | 'define' | 'explain' | 'compare' | 'derive' | 'demonstrate'
  | 'sequence' | 'quantify' | 'relate' | 'assess'

export type Priority = 'primary' | 'supporting' | 'optional'

/* THE ENVELOPE CANNOT CARRY APPEARANCE.
 *
 * There is no x, y, width, height, colour, font size, spacing, radius, stroke
 * width, CSS, HTML or JSX field here, and none can be added without changing
 * this type — which a test asserts. That absence is Laws 1-3 expressed as a
 * type rather than as a request. */
export interface LessonElement<P = unknown> {
  id: string
  kind: RepresentationKind
  purpose: LearningPurpose
  title?: string
  payload: P
  /** Where this came from, for citation. Never a URL the renderer fetches. */
  sourceRefs?: string[]
  /** Ids of elements this one reads. Drives ordering and the model graph. */
  dependsOn?: string[]
  priority?: Priority
}

export interface Relationship {
  from: string
  to: string
  kind?: 'causal' | 'sequence' | 'reference'
  label?: string
}

export interface Lesson {
  id: string
  question: string
  elements: LessonElement[]
  relationships?: Relationship[]
  /** Shared variables and formulas. See canvas/model. */
  model?: { vars: unknown[]; derived: unknown[] }
}

/* ── the context a decision is made in ─────────────────────────────────── */

export interface DataProfile {
  rows?: number
  cols?: number
  points?: number
  series?: number
  chars?: number
  items?: number
  /** Does the data have a natural order — time, rank, sequence? */
  ordered?: boolean
  /** Are the values parts of one whole? */
  compositional?: boolean
  /** Distinct categories, when categorical. */
  categories?: number
}

export interface ViewportState {
  width: number
  height: number
  /** Coarse pointer, reduced motion — decisions that change what is honest. */
  touch?: boolean
  reducedMotion?: boolean
}

export interface AccessibilityRequirements {
  /** Minimum contrast for text against its ground. */
  contrastRatio: number
  /** Minimum interactive target, in px. */
  minTapTarget: number
  /** Must every visual have a text equivalent? Always yes; stated so a
   *  contract cannot quietly opt out. */
  textAlternativeRequired: true
}

/* A representation must not decide from its payload alone. A three-point line
 * chart is fine on a wide desktop and dishonest in a 200px column; only the
 * context knows which one this is. */
export interface RepresentationContext {
  element: LessonElement
  lessonPurpose?: string
  sourceDataProfile: DataProfile
  viewport: ViewportState
  availableRenderers: string[]
  existingRelationships: Relationship[]
  accessibilityRequirements: AccessibilityRequirements
}

/* ── lifecycle results ─────────────────────────────────────────────────── */

export interface ValidationIssue {
  /** Empty when the issue is about the payload as a whole. */
  path: string
  message: string
  /** 'repair' changed something and said so; 'reject' means unusable. */
  level: 'repair' | 'reject'
}

export type ValidationResult<T> =
  | { ok: true; value: T; issues: ValidationIssue[] }
  | { ok: false; issues: ValidationIssue[] }

/** What a representation can hold before it must disclose rather than sprawl. */
export interface CapacityProfile {
  /** The unit this representation is measured in. */
  unit: 'chars' | 'rows' | 'items' | 'points' | 'series' | 'cols' | 'nodes'
  /** How much content there is. */
  demand: number
  /** How much fits in the space available, at the CURRENT type sizes. Never
   *  computed by shrinking text — that is the one adaptation forbidden. */
  supply: number
  /** Preferred and maximum column span on a 12-column grid. */
  span: { min: number; pref: number; max: number }
  /** Approximate rendered height in rows of the layout grid. */
  rows: { min: number; pref: number; max: number }
}

export type DisclosureStrategy =
  | 'truncate_expand'
  | 'paginate'
  | 'scroll_y'
  | 'split_block'
  | 'aggregate'
  | 'progressive_disclosure'

export interface DisclosurePlan {
  strategy: DisclosureStrategy
  /** How much is visible initially. Units match the CapacityProfile. */
  initiallyVisible: number
  /** Everything remains reachable — this states HOW. */
  reachableVia: 'expand' | 'pager' | 'scroll' | 'drawer' | 'next-section'
  /** Shown to the learner. Silence about hidden content is not disclosure. */
  notice?: string
}

/** Whatever the renderer needs that the payload did not state: scales, ticks,
 *  computed geometry, derived series. Deliberately opaque to the engine. */
export type DerivedRepresentationState = Record<string, unknown>

export interface Invariant {
  name: string
  /** Checked after layout, before paint. */
  holds: boolean
  detail?: string
}

export interface DegradationPlan {
  /** What to render instead, when this representation cannot be honest. */
  to: RepresentationKind
  reason: string
  /** The payload for the replacement, already in its shape. */
  payload: unknown
}

/* ── the contract ──────────────────────────────────────────────────────── */

export interface RepresentationContract<TPayload = unknown, TNormalized = unknown> {
  kind: RepresentationKind

  validate(payload: unknown): ValidationResult<TPayload>
  normalize(payload: TPayload, context: RepresentationContext): TNormalized

  /** 0..1. How well this representation serves this content in this context.
   *  0 means "would mislead"; it is a refusal, not a low score. */
  fitness(normalized: TNormalized, context: RepresentationContext): number

  capacity(normalized: TNormalized, context: RepresentationContext): CapacityProfile
  disclosure(normalized: TNormalized, context: RepresentationContext): DisclosurePlan[]
  derive(normalized: TNormalized, context: RepresentationContext): DerivedRepresentationState
  invariants(normalized: TNormalized, context: RepresentationContext): Invariant[]
  degrade(normalized: TNormalized, context: RepresentationContext): DegradationPlan | null

  /** Registry key of the component that draws this. The contract never
   *  imports the component — that is what keeps the engine free of React. */
  renderer: string
}
