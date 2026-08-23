/**
 * A CAUSAL AND RELATIONAL WORLD MODEL --- Capabilities 29 and 30.
 *
 * WHY A GRAPH RATHER THAN A PILE OF SENTENCES
 * -------------------------------------------
 * "The system needs more than isolated facts." The difference is not storage,
 * it is what you can ASK. A pile of sentences answers "what do you know about
 * X". A graph answers "what would break if X changed", "what has to be true
 * before X", and "is this chain consistent" --- and those are the questions
 * reasoning is made of.
 *
 * So the relations below are not tags. Each one has a defined LOGIC:
 * direction, whether it composes transitively, and whether it can coexist with
 * its opposite. `enables` and `prevents` between the same pair is a genuine
 * contradiction and is reported as one; `causes` chains transitively while
 * `similar` does not. Getting those wrong turns the graph into decoration.
 */

export type RelationKind =
  | 'causes'
  | 'depends-on'
  | 'affects'
  | 'prevents'
  | 'enables'
  | 'constrains'
  | 'precedes'
  | 'part-of'
  | 'similar-to'
  | 'differs-from'

export interface Relation {
  from: string
  kind: RelationKind
  to: string
  /** 0..1. An inferred relation is weaker than a stated one. */
  strength: number
  /** Where this came from, so an inference can be traced back. */
  because: string
}

/**
 * The logic of each relation, stated once so nothing has to re-derive it.
 *
 *   symmetric   holds equally in both directions
 *   transitive  A->B->C implies A->C
 *   opposes     a relation that cannot hold for the same pair
 */
const LOGIC: Readonly<Record<RelationKind, { symmetric: boolean; transitive: boolean; opposes?: RelationKind }>> = {
  causes: { symmetric: false, transitive: true },
  'depends-on': { symmetric: false, transitive: true },
  affects: { symmetric: false, transitive: false },
  /* prevents/enables are the contradiction pair. Both stated for one ordered
     pair means the model has been told two incompatible things, which is worth
     surfacing rather than silently keeping the newer one. */
  prevents: { symmetric: false, transitive: false, opposes: 'enables' },
  enables: { symmetric: false, transitive: false, opposes: 'prevents' },
  constrains: { symmetric: false, transitive: false },
  precedes: { symmetric: false, transitive: true },
  'part-of': { symmetric: false, transitive: true },
  /* Similarity does NOT compose. A is like B and B is like C does not make A
     like C --- chaining it is how a knowledge graph drifts from "sparrow is
     like a robin" to "sparrow is like an aeroplane" in four hops. */
  'similar-to': { symmetric: true, transitive: false, opposes: 'differs-from' },
  'differs-from': { symmetric: true, transitive: false, opposes: 'similar-to' },
}

/* -------------------------------------------------------------------------- */
/* Knowledge structuring --- Capability 30                                    */
/* -------------------------------------------------------------------------- */

export interface Node {
  id: string
  label: string
  /** entity | event | category | rule | process | constraint | quantity */
  kind: string
  attributes: Readonly<Record<string, string>>
}

export interface World {
  nodes: ReadonlyMap<string, Node>
  relations: readonly Relation[]
}

export const EMPTY_WORLD: World = { nodes: new Map(), relations: [] }

export function addNode(w: World, node: Node): World {
  const nodes = new Map(w.nodes)
  const existing = nodes.get(node.id)
  nodes.set(
    node.id,
    /* Merge attributes rather than replacing the node. Two statements about
       the same thing are two facts about one thing, and clobbering means the
       later sentence silently erases the earlier one's detail. */
    existing ? { ...existing, ...node, attributes: { ...existing.attributes, ...node.attributes } } : node,
  )
  return { ...w, nodes }
}

export function relate(w: World, r: Relation): World {
  const world = ensureNodes(w, r.from, r.to)
  const same = world.relations.find((x) => x.from === r.from && x.to === r.to && x.kind === r.kind)
  if (same) {
    return {
      ...world,
      relations: world.relations.map((x) =>
        x === same ? { ...x, strength: Math.min(1, x.strength + 0.1), because: `${x.because}; ${r.because}` } : x,
      ),
    }
  }
  return { ...world, relations: [...world.relations, r] }
}

function ensureNodes(w: World, ...ids: string[]): World {
  let out = w
  for (const id of ids) {
    if (!out.nodes.has(id)) out = addNode(out, { id, label: id, kind: 'entity', attributes: {} })
  }
  return out
}

/* -------------------------------------------------------------------------- */
/* Extraction                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Relation-bearing phrases.
 *
 * Each pattern captures the two operands, so the DIRECTION is read from the
 * sentence rather than guessed. Direction is the part that is easy to get
 * backwards and expensive when wrong: "A prevents B" and "B prevents A" are
 * different claims about the world and reasoning will act on either.
 */
const PATTERNS: readonly { re: RegExp; kind: RelationKind; flip?: boolean }[] = [
  { re: /(.+?)\s+causes?\s+(.+)/i, kind: 'causes' },
  { re: /(.+?)\s+leads? to\s+(.+)/i, kind: 'causes' },
  { re: /(.+?)\s+results? in\s+(.+)/i, kind: 'causes' },
  { re: /(.+?)\s+(?:is|are) caused by\s+(.+)/i, kind: 'causes', flip: true },
  { re: /(.+?)\s+(?:because of|due to)\s+(.+)/i, kind: 'causes', flip: true },
  { re: /(.+?)\s+depends? on\s+(.+)/i, kind: 'depends-on' },
  { re: /(.+?)\s+requires?\s+(.+)/i, kind: 'depends-on' },
  { re: /(.+?)\s+affects?\s+(.+)/i, kind: 'affects' },
  { re: /(.+?)\s+influences?\s+(.+)/i, kind: 'affects' },
  { re: /(.+?)\s+prevents?\s+(.+)/i, kind: 'prevents' },
  { re: /(.+?)\s+blocks?\s+(.+)/i, kind: 'prevents' },
  { re: /(.+?)\s+enables?\s+(.+)/i, kind: 'enables' },
  { re: /(.+?)\s+allows?\s+(.+)/i, kind: 'enables' },
  { re: /(.+?)\s+constrains?\s+(.+)/i, kind: 'constrains' },
  { re: /(.+?)\s+limits?\s+(.+)/i, kind: 'constrains' },
  { re: /(.+?)\s+(?:precedes|comes before|happens before)\s+(.+)/i, kind: 'precedes' },
  { re: /(.+?)\s+(?:is|are) part of\s+(.+)/i, kind: 'part-of' },
  { re: /(.+?)\s+(?:consists? of|comprises?|contains?)\s+(.+)/i, kind: 'part-of', flip: true },
  { re: /(.+?)\s+(?:is|are) similar to\s+(.+)/i, kind: 'similar-to' },
  { re: /(.+?)\s+(?:differs? from|is different from|unlike)\s+(.+)/i, kind: 'differs-from' },
]

const NOISE = /^(the|a|an|this|that|it|they|there|when|if|because|so|and|but)\s+/i

function clean(s: string): string {
  return s
    .trim()
    .replace(/^[^a-z0-9]+|[^a-z0-9)]+$/gi, '')
    .replace(NOISE, '')
    .trim()
    .toLowerCase()
}

/**
 * Pull relations out of prose.
 *
 * One relation per clause, and clauses are split on sentence boundaries first
 * --- a greedy pattern run over a paragraph captures half of one sentence and
 * half of the next, producing a relation between two things that were never
 * mentioned together.
 */
export function extract(text: string): Relation[] {
  const out: Relation[] = []
  for (const raw of text.split(/(?<=[.;!?])\s+|\n+/)) {
    const clause = raw.trim()
    if (clause.length < 5) continue
    for (const p of PATTERNS) {
      const m = clause.match(p.re)
      if (!m) continue
      const a = clean(m[1] ?? '')
      const b = clean(m[2] ?? '')
      if (a.length < 2 || b.length < 2) continue
      out.push({
        from: p.flip ? b : a,
        kind: p.kind,
        to: p.flip ? a : b,
        strength: 0.7,
        because: `stated: "${clause.slice(0, 80)}"`,
      })
      /* First match only. Several patterns will fire on one clause ("A causes
         B because C") and taking them all produces overlapping, wrong pairs. */
      break
    }
  }
  return out
}

export function build(text: string): World {
  let w = EMPTY_WORLD
  for (const r of extract(text)) w = relate(w, r)
  return w
}

/* -------------------------------------------------------------------------- */
/* Queries --- what a graph buys that a pile of sentences does not            */
/* -------------------------------------------------------------------------- */

/** Everything reachable from `id` along one relation kind. Transitive kinds only. */
export function reach(w: World, id: string, kind: RelationKind, maxDepth = 6): string[] {
  const out: string[] = []
  const seen = new Set([id])
  let frontier = [id]
  const symmetric = LOGIC[kind].symmetric

  for (let d = 0; d < (LOGIC[kind].transitive ? maxDepth : 1); d++) {
    const next: string[] = []
    for (const node of frontier) {
      for (const r of w.relations) {
        if (r.kind !== kind) continue
        const target = r.from === node ? r.to : symmetric && r.to === node ? r.from : null
        if (target === null || seen.has(target)) continue
        seen.add(target)
        out.push(target)
        next.push(target)
      }
    }
    if (next.length === 0) break
    frontier = next
  }
  return out
}

/** Edge kinds along which a change propagates. */
const IMPACT_KINDS = new Set<RelationKind>(['causes', 'affects', 'enables', 'constrains'])

/**
 * What breaks if this changes --- the question a fact-pile cannot answer.
 *
 * A SINGLE WALK ACROSS MIXED EDGE KINDS, not a union of per-kind walks.
 *
 * That distinction was a real bug here. "Heating CAUSES expansion" and
 * "expansion AFFECTS density" plainly means changing heating reaches density,
 * but no single-kind traversal ever crosses from a `causes` edge onto an
 * `affects` one --- so the union reported only `expansion` and the second hop
 * was invisible. Impact does not care which verb carried it; it cares that the
 * change propagates at all.
 *
 * `depends-on` is walked in REVERSE and merged into the same frontier: if B
 * depends on A, changing A hits B. Following it forwards would report what A
 * needs, which is the opposite question.
 */
export function impactOf(w: World, id: string, maxDepth = 6): string[] {
  const hit = new Set<string>()
  const seen = new Set([id])
  let frontier = [id]

  for (let d = 0; d < maxDepth && frontier.length > 0; d++) {
    const next: string[] = []
    for (const node of frontier) {
      for (const r of w.relations) {
        const target =
          IMPACT_KINDS.has(r.kind) && r.from === node
            ? r.to
            : r.kind === 'depends-on' && r.to === node
              ? r.from
              : null
        if (target === null || seen.has(target)) continue
        seen.add(target)
        hit.add(target)
        next.push(target)
      }
    }
    frontier = next
  }
  return [...hit]
}

/**
 * Is this node reachable from itself along `kind`?
 *
 * A separate function because `reach` deliberately seeds its visited set with
 * the start node --- it answers "what ELSE can I get to", which is the right
 * semantics for every caller except this one, and is why an earlier cycle
 * check built on it could never fire.
 */
export function inCycle(w: World, id: string, kind: RelationKind, maxDepth = 12): boolean {
  const seen = new Set<string>()
  let frontier = [id]
  for (let d = 0; d < maxDepth && frontier.length > 0; d++) {
    const next: string[] = []
    for (const node of frontier) {
      for (const r of w.relations) {
        if (r.kind !== kind || r.from !== node) continue
        if (r.to === id) return true
        if (seen.has(r.to)) continue
        seen.add(r.to)
        next.push(r.to)
      }
    }
    frontier = next
  }
  return false
}

/** What must hold first. */
export function prerequisitesOf(w: World, id: string): string[] {
  const out = new Set(reach(w, id, 'depends-on'))
  for (const r of w.relations) {
    if (r.kind === 'precedes' && r.to === id) out.add(r.from)
  }
  return [...out]
}

export interface Inconsistency {
  message: string
  relations: readonly Relation[]
}

/**
 * Contradictions the graph can find on its own --- Capability 10's "logical
 * consistency", made mechanical.
 */
export function inconsistencies(w: World): Inconsistency[] {
  const out: Inconsistency[] = []

  for (const r of w.relations) {
    const against = LOGIC[r.kind].opposes
    if (!against) continue
    const clash = w.relations.find(
      (o) =>
        o.kind === against &&
        ((o.from === r.from && o.to === r.to) ||
          (LOGIC[r.kind].symmetric && o.from === r.to && o.to === r.from)),
    )
    if (clash && !out.some((x) => x.relations.includes(clash))) {
      out.push({
        message: `"${r.from}" is recorded as both ${r.kind} and ${against} "${r.to}"`,
        relations: [r, clash],
      })
    }
  }

  /* A causal loop is not automatically wrong --- feedback loops are real --- so
     it is reported as something to look at rather than as an error. What IS
     wrong is treating it as a plain chain, because transitive reach through it
     never terminates without the depth cap. */
  for (const node of w.nodes.keys()) {
    if (inCycle(w, node, 'causes')) {
      out.push({
        message: `"${node}" causes itself through a cycle; treat as feedback, not as a chain`,
        relations: w.relations.filter((r) => r.kind === 'causes'),
      })
      break
    }
  }

  return out
}

/**
 * The causal chain from one node to another, or null.
 *
 * Breadth-first, so the shortest explanation wins. A longer chain that happens
 * to be found first is a worse explanation of the same thing.
 */
export function explain(w: World, from: string, to: string): string[] | null {
  const queue: string[][] = [[from]]
  const seen = new Set([from])
  while (queue.length > 0) {
    const path = queue.shift() as string[]
    const tail = path[path.length - 1] as string
    if (tail === to) return path
    for (const r of w.relations) {
      if (r.kind !== 'causes' || r.from !== tail || seen.has(r.to)) continue
      seen.add(r.to)
      queue.push([...path, r.to])
    }
  }
  return null
}
