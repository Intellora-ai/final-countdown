/**
 * THE KNOWLEDGE NODE — the one shape every source compiles into.
 *
 * A book, a repository, this repo's own code, a past incident and a benchmark
 * all become this. There is deliberately no second schema per source type:
 * the whole value of the substrate is that a principle from a book and a
 * measurement from our own laboratory can sit in one graph and be compared.
 *
 * WHY THE REFINEMENTS MATTER MORE THAN THE FIELDS. The fields are a shape;
 * anybody can fill a shape in dishonestly. The `superRefine` block below is
 * the part that makes the lies impossible — a claim of KNOWN with nothing
 * behind it, a claim of "we measured it" with no measurement, a node that
 * replaced something without saying what, a distinctiveness score with no
 * neighbours to be distinct from. Each of those is a real failure this
 * repository has already met, not a hypothetical.
 *
 * It is `.strict()` throughout for the same reason `src/knowledge/schema.ts`
 * is: a field nobody declared is a shape drifting quietly, and drift in the
 * thing that decides what counts as known is the worst place for it.
 */
import { z } from 'zod'

/** What kind of thing this node is. The vocabulary of engineering knowledge. */
export const TYPES = [
  'PRINCIPLE', 'CONCEPT', 'PATTERN', 'ANTI_PATTERN', 'TRADEOFF', 'DECISION',
  'FAILURE_MODE', 'INVARIANT', 'ALGORITHM', 'TECHNIQUE', 'HEURISTIC',
  'IMPLEMENTATION', 'EXAMPLE', 'COUNTEREXAMPLE', 'TEST_STRATEGY',
  'CONSTRAINT', 'ASSUMPTION', 'OBSERVATION',
] as const

/** Which system it belongs to. These are never mixed; see the plan's five systems. */
export const SYSTEMS = ['knowledge', 'lab', 'memory', 'reality', 'mission'] as const

/**
 * WHETHER WE KNOW IT AT ALL — distinct from how strong the evidence is.
 *
 * The rule the whole environment turns on: UNKNOWN must never silently become
 * KNOWN. When something is not known there are four honest moves — search,
 * experiment, ask, or stay uncertain — and these two states are where the
 * last of those lives. A schema with no home for "I don't know" forces the
 * lie by omission.
 */
export const STATES = ['KNOWN', 'INFERRED', 'UNKNOWN', 'HYPOTHESIS'] as const

/**
 * HOW STRONG THE EVIDENCE IS.
 *
 * L0 the source says it · L1 this appears to mean it · L2 it tends to hold
 * under stated conditions · L3 we ran it and measured it.
 *
 * L3 outranks L0 when the decision is about this repo, which is the opposite
 * of what similarity search would do, and is the point.
 */
export const LEVELS = ['L0', 'L1', 'L2', 'L3'] as const

/** Raw history is not current truth; every node says which it is. */
export const STATUSES = [
  'active', 'historical', 'superseded', 'invalidated', 'uncertain', 'needs-revalidation',
] as const

/** Semantic relations. `similar_to` is deliberately absent — similarity is not a reason. */
export const RELATIONS = [
  'requires', 'supports', 'implements', 'demonstrates', 'contradicts',
  'generalises', 'specialises', 'alternative_to', 'causes', 'prevents',
  'fails_under', 'validated_by', 'derived_from', 'supersedes', 'supersededBy',
] as const

/** A string that actually says something. Whitespace padding is not content. */
const Says = (min: number) => z.string().trim().min(min)

const Id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'ids are lowercase kebab-case')

/**
 * WHERE A CLAIM CAME FROM. Three kinds, because three genuinely different
 * things can support a claim and collapsing them loses the distinction that
 * makes the substrate trustworthy.
 *
 * `source` a book, a document, a file — quoted word for word.
 * `code`   a machine-verifiable fact about a repository.
 * `experiment` something the laboratory actually ran and measured.
 */
export const Evidence = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('source'),
    source: Says(1),
    location: Says(1),
    quote: Says(1),
    retrievedAt: Says(1),
  }).strict(),
  z.object({
    kind: z.literal('code'),
    path: Says(1),
    symbol: Says(1).optional(),
    at: Says(1),
  }).strict(),
  z.object({
    kind: z.literal('experiment'),
    experiment: Says(1),
    measurement: Says(1),
    at: Says(1),
  }).strict(),
])

/**
 * The decision-shaped body. Every field optional, because a node that pads
 * every field to look thorough is worse than a short honest one — but any
 * field that IS present must carry something.
 */
export const Body = z.object({
  problem: Says(1).optional(),
  context: Says(1).optional(),
  mechanism: Says(1).optional(),
  whyItWorks: Says(1).optional(),
  whenToUse: Says(1).optional(),
  whenNotToUse: Says(1).optional(),
  assumptions: z.array(Says(1)).optional(),
  costs: z.array(Says(1)).optional(),
  tradeoffs: z.array(Says(1)).optional(),
  failureModes: z.array(Says(1)).optional(),
}).strict()

export const Link = z.object({
  relation: z.enum(RELATIONS),
  to: Says(1),
}).strict()

/**
 * Confidence stays in dimensions and is never collapsed into one number, so
 * "an established principle", "seen once in one repository" and "my own
 * inference" remain tellable apart at the moment of a decision.
 */
export const Confidence = z.object({
  sourceStrength: z.number().min(0).max(1).optional(),
  extraction: z.number().min(0).max(1).optional(),
  corroboration: z.number().min(0).max(1).optional(),
  scopeClarity: z.number().min(0).max(1).optional(),
  freshness: z.number().min(0).max(1).optional(),
}).strict()

export const KnowledgeNode = z.object({
  id: Id,
  type: z.enum(TYPES),
  system: z.enum(SYSTEMS),
  state: z.enum(STATES),
  level: z.enum(LEVELS),
  /** One sentence. Long enough to mean something; this is what retrieval shows. */
  statement: Says(10),
  body: Body.optional(),
  evidence: z.array(Evidence),
  status: z.enum(STATUSES),
  confidence: Confidence.optional(),
  links: z.array(Link),
  /** The nodes this one could be confused with. Phase 5 fills these. */
  neighbours: z.array(Says(1)).optional(),
  /** support(this) − max(support(neighbour)). Meaningless without neighbours. */
  distinct: z.number().min(-1).max(1).optional(),
  /** What would make this claim wrong. A claim that cannot be wrong is not a claim. */
  falsifiedBy: Says(1).optional(),
}).strict().superRefine((node, ctx) => {
  const fail = (message: string, path: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [path] })

  /* LIE 1 — "we know this" with nothing behind it.
     UNKNOWN and HYPOTHESIS may stand alone: not knowing is a real thing to
     record. KNOWN and INFERRED may not. */
  if ((node.state === 'KNOWN' || node.state === 'INFERRED') && node.evidence.length === 0) {
    fail(`state ${node.state} needs at least one piece of evidence; UNKNOWN is the honest state for a claim with none`, 'evidence')
  }

  /* INFERRED means derived from something. Say what. */
  if (node.state === 'INFERRED' && !node.links.some((l) => l.relation === 'derived_from')) {
    fail('an INFERRED node must link `derived_from` whatever it was inferred from', 'links')
  }

  /* LIE 2 — "we measured it" with no measurement.
     L3 is the only level a book cannot produce. It outranks every other level
     at retrieval time, which is exactly why it has to be earned. */
  if (node.level === 'L3' && !node.evidence.some((e) => e.kind === 'experiment')) {
    fail('L3 means the laboratory ran it: at least one piece of evidence must be an experiment with a measurement', 'evidence')
  }

  /* LIE 3 — "this replaced something" without saying what.
     A superseded node with no successor loses the history it exists to keep. */
  if (node.status === 'superseded' && !node.links.some((l) => l.relation === 'supersededBy')) {
    fail('a superseded node must link `supersededBy` to whatever replaced it', 'links')
  }

  /* LIE 4 — "this is distinct" from neighbours nobody listed.
     The 11% failure measured in this repo was a perfect quotation attached to
     the wrong concept. A distinctiveness score with no neighbours is that same
     failure wearing a number. */
  if (node.distinct !== undefined && (node.neighbours === undefined || node.neighbours.length === 0)) {
    fail('a distinctiveness score means nothing without the neighbours it was scored against', 'neighbours')
  }
})

export type KnowledgeNode = z.infer<typeof KnowledgeNode>
export type Evidence = z.infer<typeof Evidence>
export type Link = z.infer<typeof Link>
export type NodeType = (typeof TYPES)[number]
export type System = (typeof SYSTEMS)[number]
export type State = (typeof STATES)[number]
export type Level = (typeof LEVELS)[number]
export type Status = (typeof STATUSES)[number]
