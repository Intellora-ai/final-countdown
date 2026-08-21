/* REPRESENTATION REGISTRY — every visual on the board must answer "why do you exist?"
 *
 * THE FIELD THAT DOES THE REAL WORK IS `cannotExplain`.
 *
 * `purpose` and `explains` are easy to write and easy to write carelessly. The
 * honest one is the negative: a pressure-temperature graph shows that the two
 * rise together and cannot show WHY, because a straight line contains no
 * mechanism. Saying so converts a vague instinct — "maybe add a simulation
 * here?" — into a lookup: find a representation whose `explains` covers what
 * the current one declared it cannot explain. That is why the particle
 * simulation follows the graph rather than sitting beside it from the start.
 *
 * It is also the guard against the board overclaiming. If a representation
 * declares it cannot explain mechanism, nothing may present it as an
 * explanation of mechanism. `assertCanClaim` makes that checkable rather than
 * a matter of authorial restraint.
 *
 * AN EMPTY PURPOSE IS A REFUSAL, NOT A DEFAULT. `register` throws. A visual
 * nobody can justify is decoration, and decoration on a learning board is
 * noise competing with the thing being taught.
 */

export type RendererKind =
  | 'handwriting'
  | 'svg'
  | 'html'
  | 'katex'
  | 'pixi'
  | 'three'
  | 'table'

export interface RepresentationDefinition {
  representationId: string
  name: string
  renderer: RendererKind
  /** Why this object exists, in terms of what the learner will understand. */
  purpose: string
  /** Claims this representation genuinely supports. */
  explains: string[]
  /** Claims it structurally cannot support. Drives what the board offers next. */
  cannotExplain: string[]
  /** Wrong readings this representation invites. Used to pair it with a contrast. */
  misconceptionRisk?: string[]
  /** Variable and data keys it needs before it can render at all. */
  requiredData: string[]
  supportedZoomLevels: Array<1 | 2 | 3>
  supportsInteraction: boolean
  supportsAnimation: boolean
}

/* Optional fields rather than a discriminated union, for the same reason as
 * SetResult in variables.ts: the imported tsconfig has `strict: false`, so a
 * boolean discriminant does not narrow and `result.reason` would be a type
 * error at every call site. */
export interface LookupResult {
  ok: boolean
  definition?: RepresentationDefinition
  reason?: string
  nearest?: RepresentationDefinition
}

export class RepresentationRegistry {
  private definitions = new Map<string, RepresentationDefinition>()

  register(definition: RepresentationDefinition): RepresentationDefinition {
    if (!definition.purpose.trim()) {
      throw new Error(
        `${definition.representationId}: representationPurpose is empty. A representation that ` +
          'cannot say what it explains is decoration, and decoration is not registered.',
      )
    }
    if (!definition.explains.length) {
      throw new Error(`${definition.representationId}: explains[] is empty`)
    }
    if (this.definitions.has(definition.representationId)) {
      throw new Error(`${definition.representationId}: already registered`)
    }
    this.definitions.set(definition.representationId, definition)
    return definition
  }

  get(representationId: string): RepresentationDefinition | undefined {
    return this.definitions.get(representationId)
  }

  all(): RepresentationDefinition[] {
    return [...this.definitions.values()]
  }

  /** Representations that can render with the data actually available. A
   *  missing key is why an offer is withheld, not why a broken object appears. */
  availableWith(dataKeys: Iterable<string>): RepresentationDefinition[] {
    const have = new Set(dataKeys)
    return this.all().filter((d) => d.requiredData.every((k) => have.has(k)))
  }

  /* The core of "show me another way". The best alternative is the one that
   * explains what the current representation just admitted it cannot, so the
   * switch answers the learner's actual confusion rather than restating the
   * same content in a different shape. */
  alternativesFor(currentId: string, dataKeys: Iterable<string>): RepresentationDefinition[] {
    const current = this.definitions.get(currentId)
    const available = this.availableWith(dataKeys).filter((d) => d.representationId !== currentId)
    if (!current) return available
    const gaps = new Set(current.cannotExplain)
    const covers = (d: RepresentationDefinition) =>
      d.explains.filter((claim) => gaps.has(claim)).length
    return [...available].sort((a, b) => covers(b) - covers(a))
  }

  /** What the board says when the learner asks for something that is not there.
   *  Never a generic fallback object: an honest refusal plus the nearest real
   *  alternative, which is DOD-4. */
  request(representationId: string, dataKeys: Iterable<string>, fromId?: string): LookupResult {
    const definition = this.definitions.get(representationId)
    if (!definition) {
      const nearest = fromId
        ? this.alternativesFor(fromId, dataKeys)[0]
        : this.availableWith(dataKeys)[0]
      return { ok: false, reason: `no representation registered as "${representationId}"`, nearest }
    }
    const have = new Set(dataKeys)
    const missing = definition.requiredData.filter((k) => !have.has(k))
    if (missing.length) {
      const nearest = this.alternativesFor(fromId ?? representationId, dataKeys)[0]
      return {
        ok: false,
        reason: `${definition.name} needs ${missing.join(', ')}, which this concept has not defined`,
        nearest,
      }
    }
    return { ok: true, definition }
  }

  /** Refuses to let a caller present a representation as explaining something
   *  its own declaration rules out. */
  assertCanClaim(representationId: string, claim: string): void {
    const definition = this.definitions.get(representationId)
    if (!definition) throw new Error(`unknown representation: ${representationId}`)
    if (definition.cannotExplain.includes(claim)) {
      throw new Error(
        `${definition.name} declares it cannot explain "${claim}"; presenting it as one would ` +
          'tell the learner something this board knows is false',
      )
    }
  }
}

/* The claims this lesson trades in. Keeping them as constants means a typo is a
 * compile error rather than an edge that silently never matches. */
export const CLAIM = {
  correlation: 'that two quantities rise together',
  mechanism: 'why one quantity changes the other',
  magnitude: 'how large the effect is',
  particleMotion: 'how individual particles move',
  algebraicForm: 'the exact algebraic relationship',
  spatialStructure: 'how the parts sit in space',
} as const
