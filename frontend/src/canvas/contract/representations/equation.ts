import type {
  RepresentationContract, CapacityProfile, DisclosurePlan, Invariant, DegradationPlan,
} from '../types'
import { Issues, isObj, isStr, isArr, unknownKey, appearanceKeysDeep } from '../validate'

/* EQUATION — mathematics as a sequence of steps, not a final answer.
 *
 * A derivation whose intermediate lines are hidden is a magic trick. The
 * payload is therefore a LIST of steps, each with an optional note saying what
 * happened, because "divide through by a" is the part that teaches and the
 * algebra is only the evidence.
 *
 * LaTeX IS DATA, NEVER MARKUP. The string reaches KaTeX with trust:false and
 * throwOnError:false, so \htmlClass, \url and \includegraphics are refused at
 * the source and a malformed expression costs one line rather than the page.
 * This contract additionally refuses the constructs outright, so a payload
 * carrying them fails validation rather than relying on a renderer flag.
 */

const KEYS = ['steps', 'variables', 'caption'] as const
const STEP_KEYS = ['latex', 'note'] as const
const VAR_KEYS = ['symbol', 'meaning', 'unit'] as const

/* LaTeX commands that can reach outside the equation. KaTeX refuses these with
 * trust:false, and refusing them here too means a bad payload is caught at
 * validation rather than depending on one renderer option staying set. */
const UNSAFE_LATEX = /\\(html[A-Za-z]*|url|href|includegraphics|input|write|def|catcode|expandafter)/

export interface EquationStep { latex: string; note?: string }
export interface EquationVariable { symbol: string; meaning: string; unit?: string }

export interface EquationPayload {
  steps: EquationStep[]
  variables?: EquationVariable[]
  caption?: string
}

export interface NormalizedEquation {
  steps: EquationStep[]
  variables: EquationVariable[]
  caption?: string
  /** True when there is more than one line — a derivation rather than a fact. */
  isDerivation: boolean
}

const MAX_LATEX = 400

export const equationContract: RepresentationContract<EquationPayload, NormalizedEquation> = {
  kind: 'equation',
  renderer: 'EquationPanel',

  validate(payload) {
    const issues = new Issues()
    if (!isObj(payload)) return issues.fail('', 'An equation payload must be an object.')

    const bad = unknownKey(payload, KEYS)
    if (bad) return issues.fail(bad, `Unrecognised field '${bad}'. Unknown fields are refused, not stripped.`)

    const appearance = appearanceKeysDeep(payload)
    if (appearance) {
      return issues.fail(appearance, `'${appearance}' carries appearance. Mathematics is typeset by the design system, not styled by the lesson.`)
    }

    if (!isArr(payload.steps) || !payload.steps.length) {
      return issues.fail('steps', 'An equation needs at least one step.')
    }

    const steps: EquationStep[] = []
    payload.steps.forEach((s, i) => {
      if (!isObj(s)) { issues.repair(`steps[${i}]`, 'A step was not an object and was omitted.'); return }
      const sk = unknownKey(s, STEP_KEYS)
      if (sk) { issues.repair(`steps[${i}].${sk}`, `Step carried unrecognised '${sk}' and was omitted.`); return }
      if (!isStr(s.latex) || !s.latex.trim()) { issues.repair(`steps[${i}]`, 'A step had no expression and was omitted.'); return }

      if (s.latex.length > MAX_LATEX) {
        return issues.reject(`steps[${i}].latex`, `An expression of ${s.latex.length} characters is not one equation.`)
      }
      if (UNSAFE_LATEX.test(s.latex)) {
        return issues.reject(`steps[${i}].latex`, 'This expression contains a LaTeX command that can reach outside the equation. Mathematics only.')
      }

      steps.push({ latex: s.latex.trim(), ...(isStr(s.note) ? { note: s.note } : {}) })
    })

    if (issues.rejected) return issues.ok({ steps: [] }) as never
    if (!steps.length) return issues.fail('steps', 'An equation had no readable steps.')

    const variables: EquationVariable[] = []
    const rawVars = isArr(payload.variables) ? payload.variables : []
    rawVars.forEach((v, i) => {
      if (!isObj(v)) { issues.repair(`variables[${i}]`, 'A variable was not an object and was omitted.'); return }
      const vk = unknownKey(v, VAR_KEYS)
      if (vk) { issues.repair(`variables[${i}].${vk}`, `Variable carried unrecognised '${vk}' and was omitted.`); return }
      if (!isStr(v.symbol) || !isStr(v.meaning)) { issues.repair(`variables[${i}]`, 'A variable needed a symbol and a meaning.'); return }
      variables.push({ symbol: v.symbol, meaning: v.meaning, ...(isStr(v.unit) ? { unit: v.unit } : {}) })
    })

    return issues.ok({
      steps, variables,
      ...(isStr(payload.caption) ? { caption: payload.caption } : {}),
    })
  },

  normalize(payload) {
    return {
      steps: payload.steps,
      variables: payload.variables ?? [],
      ...(payload.caption ? { caption: payload.caption } : {}),
      isDerivation: payload.steps.length > 1,
    }
  },

  fitness(n) {
    /* Mathematics has no competitor. Nothing else can state a relationship
     * this precisely, so an equation scores high whenever it is well formed. */
    if (!n.steps.length) return 0
    return n.isDerivation ? 0.95 : 0.85
  },

  capacity(n, ctx): CapacityProfile {
    /* A derivation reads down a narrow column so the eye tracks one line of
     * reasoning; it does not want twelve columns of width. */
    return {
      unit: 'items',
      demand: n.steps.length,
      supply: ctx.viewport.height > 700 ? 8 : 4,
      span: { min: 4, pref: n.isDerivation ? 6 : 5, max: 8 },
      rows: { min: 2, pref: Math.min(n.steps.length + 1, 8), max: 12 },
    }
  },

  disclosure(n, ctx): DisclosurePlan[] {
    const cap = this.capacity(n, ctx)
    if (n.steps.length <= cap.supply) return []
    /* Steps reveal one at a time. A derivation the learner scrolls past is a
     * derivation they did not follow. */
    return [{
      strategy: 'progressive_disclosure',
      initiallyVisible: cap.supply,
      reachableVia: 'expand',
      notice: `${n.steps.length} steps. The rest continue below.`,
    }]
  },

  derive(n) {
    /* Every symbol the steps use, so a missing definition is visible rather
     * than something the learner has to notice for themselves. */
    const used = new Set<string>()
    for (const s of n.steps) {
      /* Strip LaTeX commands FIRST, then take every remaining letter.
       *
       * The first version required each letter to stand alone, which missed
       * implicit multiplication entirely: in E = mc^2 the m is followed by a
       * letter and the c is preceded by one, so neither matched and the
       * check silently reported nothing undefined. Removing \commands and
       * then reading single letters treats mc as the two variables it is. */
      const bare = s.latex.replace(/\\[A-Za-z]+/g, ' ')
      for (const m of bare.matchAll(/[A-Za-z]/g)) used.add(m[0])
    }
    const defined = new Set(n.variables.map((v) => v.symbol))
    return {
      isDerivation: n.isDerivation,
      stepCount: n.steps.length,
      undefinedSymbols: [...used].filter((s) => !defined.has(s)).sort(),
    }
  },

  invariants(n): Invariant[] {
    return [
      { name: 'hasSteps', holds: n.steps.length > 0 },
      { name: 'orderedDerivation', holds: !n.isDerivation || n.steps.every((s) => s.latex.length > 0),
        detail: 'Every step of a derivation must carry an expression; a gap breaks the argument.' },
      { name: 'hasTextAlternative', holds: n.steps.every((s) => s.latex.length > 0),
        detail: 'KaTeX emits a MathML twin for screen readers; the source string is the alternative.' },
    ]
  },

  degrade(): DegradationPlan | null {
    /* Nothing renders an equation more honestly than an equation. Falling back
     * to prose would mean describing algebra in words, which is worse. */
    return null
  },
}
