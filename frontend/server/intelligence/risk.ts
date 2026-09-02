/**
 * RISK-TIERED VERIFICATION.
 *
 * The tier is read from the CONTENT, never taken from the proposer's word:
 *   0  deterministic checks are enough (schema, arithmetic)
 *   1  a claim resting on sources: the claim check must see the sources
 *   2  a stated value, a sum, a derivation or a dated fact: the critic too
 * A proposer may declare a higher tier; nothing here lowers one.
 *
 * Verified means every check the tier requires said SOUND. A check that
 * could not be made is could-not-check, and could-not-check is never a pass:
 * a risk-2 artifact with no critic is simply not verified, and says so.
 */
import { sumsIn, wrongSums } from '../../src/canvas/spec/arithmetic.ts'
import { statesAValue } from '../assurance.ts'

export type Risk = 0 | 1 | 2

export interface Explained {
  readonly answer: string
  readonly sources: readonly string[]
  /** What the proposer declared. A floor, never a ceiling. */
  readonly declared?: Risk
}

export type Verdict = 'sound' | 'unsound' | 'could-not-check'

export interface Checked {
  readonly check: 'arithmetic' | 'claim' | 'critic'
  readonly verdict: Verdict
  readonly because: string
}

export interface Verified {
  readonly risk: Risk
  readonly verdicts: readonly Checked[]
  readonly verified: boolean
}

export type Critic = (answer: string, context: { readonly classId: string | null }) => Promise<{ verdict: Verdict; because: string }>

export interface VerifyPorts {
  readonly critic?: Critic
  readonly classId?: string | null
  /** The text of each source, by URL, for the claim check. Absent: nothing can be checked against. */
  readonly sourceText?: (url: string) => string | undefined
}

const AN_EQUATION = /[a-z0-9)\]]\s*=\s*[-(\[a-z0-9]/i
const A_YEAR = /\b(?:1[0-9]{3}|20[0-9]{2})\b/
const A_URL = /^https?:\/\//i

function asBlocks(answer: string): Record<string, unknown>[] {
  return [{ kind: 'prose', body: answer }]
}

export function riskOf(explained: Explained): Risk {
  const text = explained.answer
  const derived: Risk = statesAValue(text) || sumsIn(asBlocks(text)).length > 0 || AN_EQUATION.test(text) || A_YEAR.test(text)
    ? 2
    : explained.sources.some((s) => A_URL.test(s))
      ? 1
      : 0
  return Math.max(derived, explained.declared ?? 0) as Risk
}

export async function verify(explained: Explained, ports: VerifyPorts): Promise<Verified> {
  const risk = riskOf(explained)
  const verdicts: Checked[] = []

  const wrong = wrongSums(asBlocks(explained.answer))
  verdicts.push(
    wrong.length === 0
      ? { check: 'arithmetic', verdict: 'sound', because: `${sumsIn(asBlocks(explained.answer)).length} sum(s) recomputed` }
      : { check: 'arithmetic', verdict: 'unsound', because: wrong.map((w) => w.why).join('; ') },
  )

  /* The claim check belongs where a claim rests on sources. A tier-2 answer
     that cites none is judged by the critic (floor 3: a claim check OR a
     critic verdict, neither could-not-check). */
  const urls = explained.sources.filter((s) => A_URL.test(s))
  if (urls.length > 0) {
    const texts = urls.map((u) => ports.sourceText?.(u)).filter((t): t is string => typeof t === 'string')
    verdicts.push(
      texts.length === 0
        ? { check: 'claim', verdict: 'could-not-check', because: 'no cited source could be read here' }
        : { check: 'claim', verdict: 'could-not-check', because: 'claim checking against source text is not wired for a shadow artifact yet' },
    )
  }

  if (risk >= 2) {
    if (ports.critic === undefined) {
      verdicts.push({ check: 'critic', verdict: 'could-not-check', because: 'no critic was available, so this stays unverified' })
    } else {
      try {
        const said = await ports.critic(explained.answer, { classId: ports.classId ?? null })
        verdicts.push({ check: 'critic', ...said })
      } catch (error: unknown) {
        verdicts.push({ check: 'critic', verdict: 'could-not-check', because: error instanceof Error ? error.message : String(error) })
      }
    }
  }

  return { risk, verdicts, verified: verdicts.every((v) => v.verdict === 'sound') }
}
