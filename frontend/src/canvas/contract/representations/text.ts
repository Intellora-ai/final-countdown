import type {
  RepresentationContract, CapacityProfile,
  DisclosurePlan, Invariant, DegradationPlan,
} from '../types'
import { Issues, isObj, isStr, isArr, unknownKey, appearanceKeysDeep, clamp } from '../validate'

/* TEXT — prose, and the floor every other representation degrades to.
 *
 * It is the only contract that never degrades further: if text cannot render
 * something, nothing can, and the engine has a real problem rather than a
 * layout one. That makes it the safe terminus of every fallback chain.
 */

const MAX_PARA = 2000
const KEYS = ['paragraphs', 'emphasis'] as const

export interface TextPayload {
  paragraphs: string[]
  /** Words to mark. A WORD, never a colour — the recipe decides how a marked
   *  word looks, and it looks the same in every lesson. */
  emphasis?: string[]
}

export interface NormalizedText {
  paragraphs: string[]
  emphasis: string[]
  chars: number
}

export const textContract: RepresentationContract<TextPayload, NormalizedText> = {
  kind: 'text',
  renderer: 'TextPanel',

  validate(payload) {
    const issues = new Issues()
    if (!isObj(payload)) return issues.fail('', 'A text payload must be an object.')

    const bad = unknownKey(payload, KEYS)
    if (bad) return issues.fail(bad, `Unrecognised field '${bad}'. Unknown fields are refused, not stripped.`)

    const appearance = appearanceKeysDeep(payload)
    if (appearance) {
      return issues.fail(appearance, `'${appearance}' carries appearance. Content describes meaning; the design system decides how it looks.`)
    }

    if (!isArr(payload.paragraphs)) return issues.fail('paragraphs', 'Text needs a list of paragraphs.')

    const paragraphs: string[] = []
    payload.paragraphs.forEach((p, i) => {
      if (!isStr(p)) { issues.repair(`paragraphs[${i}]`, 'A paragraph was not text and was omitted.'); return }
      const t = p.trim()
      if (!t) { issues.repair(`paragraphs[${i}]`, 'An empty paragraph was omitted.'); return }
      paragraphs.push(clamp(issues, `paragraphs[${i}]`, t, MAX_PARA))
    })
    if (!paragraphs.length) return issues.fail('paragraphs', 'Text had no readable paragraphs.')

    const emphasis = isArr(payload.emphasis) ? payload.emphasis.filter(isStr) : []
    return issues.ok({ paragraphs, emphasis })
  },

  normalize(payload) {
    return {
      paragraphs: payload.paragraphs,
      emphasis: payload.emphasis ?? [],
      chars: payload.paragraphs.reduce((n, p) => n + p.length, 0),
    }
  },

  fitness(n, ctx) {
    /* Text always works. It scores modestly so a representation that shows
     * structure wins when structure exists, and wins outright when it does
     * not. */
    const structured = ctx.sourceDataProfile.rows || ctx.sourceDataProfile.points
    if (structured && structured > 3) return 0.35
    if (n.chars < 40) return 0.55
    return 0.7
  },

  capacity(n, ctx): CapacityProfile {
    /* Supply is derived from the column width at the BODY role's size — never
     * by shrinking type to make more fit. */
    const cols = ctx.viewport.width < 700 ? 12 : 7
    const charsPerLine = cols * 7.6
    const lines = Math.max(6, Math.floor((ctx.viewport.height * 0.45) / 20))
    return {
      unit: 'chars',
      demand: n.chars,
      supply: Math.floor(charsPerLine * lines),
      span: { min: 4, pref: cols, max: 12 },
      rows: { min: 2, pref: Math.ceil(n.chars / 420) + 1, max: 12 },
    }
  },

  disclosure(n, ctx): DisclosurePlan[] {
    const cap = this.capacity(n, ctx)
    if (cap.demand <= cap.supply) return []
    return [{
      strategy: 'truncate_expand',
      initiallyVisible: cap.supply,
      reachableVia: 'expand',
      notice: `Showing the first part of this explanation. The rest is one tap away.`,
    }]
  },

  derive(n) {
    /* Emphasis is resolved to positions here so the renderer does no parsing
     * and can never be handed markup. */
    return {
      marks: n.emphasis.map((word) => ({
        word,
        paragraphs: n.paragraphs
          .map((p, i) => (p.toLowerCase().includes(word.toLowerCase()) ? i : -1))
          .filter((i) => i >= 0),
      })),
    }
  },

  invariants(n): Invariant[] {
    return [
      { name: 'hasContent', holds: n.paragraphs.length > 0 },
      { name: 'noMarkup', holds: !n.paragraphs.some((p) => /<[a-z][\s\S]*>/i.test(p)),
        detail: 'Prose must never contain markup; it renders through the text path.' },
    ]
  },

  /* The terminus. Nothing is safer than prose. */
  degrade(): DegradationPlan | null { return null },
}
