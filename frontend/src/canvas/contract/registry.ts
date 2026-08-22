import type {
  RepresentationContract, RepresentationKind, RepresentationContext,
  LessonElement, DegradationPlan,
} from './types'

/* THE REGISTRY — the reason a new representation costs one file.
 *
 * Adding `molecule`, `circuit`, `anatomy` or `map` must require: one contract,
 * one renderer, one registry entry, tests. It must NOT require editing the
 * tokens, the core renderer, the layout engine, the selector, or any existing
 * representation. That is checkable rather than aspirational — the selector
 * below reads this map and knows nothing about what is in it.
 *
 * There is no `if (kind === 'chart')` anywhere in this file, and no
 * `if (subject === 'physics')` anywhere in the engine. If one appears, the
 * plug-in property has already been lost.
 */

const registry = new Map<string, RepresentationContract<any, any>>()

export function register(contract: RepresentationContract<any, any>): void {
  if (registry.has(contract.kind)) {
    throw new Error(
      `A contract for '${contract.kind}' is already registered. Two contracts for one kind means the selector's answer depends on import order.`,
    )
  }
  registry.set(contract.kind, contract)
}

export function contractFor(kind: string): RepresentationContract<any, any> | null {
  return registry.get(kind) ?? null
}

export function registeredKinds(): string[] {
  return [...registry.keys()].sort()
}

/** Test seam. Never called by the app. */
export function resetRegistry(): void {
  registry.clear()
}

/* ── selection ─────────────────────────────────────────────────────────── */

export interface SelectionCandidate {
  kind: RepresentationKind
  fitness: number
  rejected?: string
}

export interface SelectionResult {
  /** null when nothing could render this honestly. */
  selected: RepresentationKind | null
  normalized?: unknown
  fitness: number
  /** Every candidate considered, in descending fitness, with reasons. A
   *  selection nobody can explain is a selection nobody can trust. */
  candidates: SelectionCandidate[]
  /** Set when the declared kind lost to a safer representation. */
  fallbackFrom?: RepresentationKind
  reason: string
}

/* DETERMINISTIC. No randomness, no model call, no clock. The same element in
 * the same context selects the same representation every run — which is what
 * makes a screenshot test meaningful and a bug reproducible. */
export function select(
  element: LessonElement,
  context: RepresentationContext,
): SelectionResult {
  const candidates: SelectionCandidate[] = []
  let best: { kind: RepresentationKind; fitness: number; normalized: unknown } | null = null

  /* The declared kind is tried first, then every other registered kind, so a
   * tie always resolves in favour of what the lesson asked for. */
  const order = [
    element.kind,
    ...registeredKinds().filter((k) => k !== element.kind),
  ] as RepresentationKind[]

  for (const kind of order) {
    const contract = contractFor(kind)
    if (!contract) {
      candidates.push({ kind, fitness: 0, rejected: 'no contract registered' })
      continue
    }

    const parsed = contract.validate(element.payload)
    if (!parsed.ok) {
      const why = parsed.issues.find((i) => i.level === 'reject')
      candidates.push({ kind, fitness: 0, rejected: why ? why.message : 'payload rejected' })
      continue
    }

    const normalized = contract.normalize(parsed.value, context)
    const fitness = contract.fitness(normalized, context)
    candidates.push({ kind, fitness })

    /* Strictly greater, so the declared kind holds a tie. */
    if (fitness > 0 && (best === null || fitness > best.fitness)) {
      best = { kind, fitness, normalized }
    }
  }

  candidates.sort((a, b) => b.fitness - a.fitness)

  if (!best) {
    return {
      selected: null, fitness: 0, candidates,
      reason: `Nothing could render '${element.kind}' honestly: ${
        candidates.map((c) => `${c.kind} (${c.rejected ?? c.fitness})`).join(', ')
      }`,
    }
  }

  const declaredLost = best.kind !== element.kind
  return {
    selected: best.kind,
    normalized: best.normalized,
    fitness: best.fitness,
    candidates,
    ...(declaredLost ? { fallbackFrom: element.kind } : {}),
    reason: declaredLost
      ? `'${element.kind}' scored ${
          candidates.find((c) => c.kind === element.kind)?.fitness ?? 0
        }; '${best.kind}' scored ${best.fitness} and serves this content better.`
      : `'${best.kind}' as declared, fitness ${best.fitness}.`,
  }
}

/** Follow a contract's own degradation advice. Separate from select() because
 *  degrading is a decision about honesty, not about preference. */
export function degradeIfNeeded(
  kind: RepresentationKind,
  normalized: unknown,
  context: RepresentationContext,
): DegradationPlan | null {
  const contract = contractFor(kind)
  return contract ? contract.degrade(normalized, context) : null
}
