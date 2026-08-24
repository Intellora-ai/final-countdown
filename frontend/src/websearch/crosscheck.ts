/**
 * CLAIMS IN, FINDINGS OUT. §11, §22, and invariant 7.
 *
 * One finding per aspect of the question, carrying every claim that speaks to
 * it, how many INDEPENDENT sources stand behind it, and every contradiction
 * between them.
 *
 * WHY A MAJORITY IS NOT AN ANSWER
 * -------------------------------
 * The tempting rule is "two agree, one disagrees, report the two". That is the
 * silent collapse invariant 7 forbids, and it is worse than it looks: the
 * dissent is dropped at exactly the moment it is most informative, because two
 * sources agreeing is common and a third contradicting them is rare and
 * therefore load-bearing. A disagreement is a fact about the world, not noise
 * to be voted away. Any contradiction makes the finding `contradicted`,
 * regardless of how outnumbered the dissenter is, and every claim stays in the
 * finding so a reader can see what was disagreed about.
 *
 * WHY CORROBORATION COUNTS VOICES, NOT PAGES
 * ------------------------------------------
 * §11. Two pages on one host is one publisher agreeing with itself. If that
 * counted as corroboration, any single site could manufacture consensus with
 * two URLs and "three sources agree" would be a statement about our crawler
 * rather than about the world.
 *
 * Independence here is BY PUBLISHER. The first version of this reused
 * `quality.independentSources`, which also merges near-duplicate TEXT — correct
 * for whole documents, inverted for single-sentence claims. Two genuinely
 * independent sources stating the same fact share nearly all their words, so
 * that rule collapsed them into one voice: the more exactly two sources agreed,
 * the more certainly corroboration was refused. Syndication detection needs
 * whole page text and belongs where whole page text exists.
 *
 * WHY A TAINTED SOURCE CANNOT CORROBORATE
 * ---------------------------------------
 * Invariant 5. If a flagged page could be the second voice, an attacker who
 * controls one page upgrades any single-source claim to a corroborated one:
 * the strongest possible improvement for the lowest possible effort. Tainted
 * claims are still REPORTED — hiding them is its own failure — they simply do
 * not count toward independence.
 *
 * WHY AN ASPECT WITH NO EVIDENCE STILL GETS A FINDING
 * ---------------------------------------------------
 * Omission is indistinguishable from "we did not look". An `unsupported`
 * finding is the record that we asked and found nothing, and it is what stops
 * the answer builder above from quietly narrowing the question to the parts it
 * happens to have evidence for.
 */

import type { Claim } from './evidence'
import type { SearchRequirements } from './interpret'


/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type Agreement =
  /** Two or more independent, untainted sources say the same thing. */
  | 'corroborated'
  /** At least one pair disagrees. Outranks corroboration, always. */
  | 'contradicted'
  /** Exactly one independent untainted voice. */
  | 'single'
  /** Nothing usable: no claims, or only tainted ones. */
  | 'unsupported'

export interface Contradiction {
  kind: 'numeric' | 'temporal'
  a: Claim
  b: Claim
  /** Human-readable, because a flag nobody can act on gets ignored. */
  detail: string
}

export interface Finding {
  aspect: string
  /** Every claim mentioning this aspect, including tainted and dissenting ones. */
  claims: readonly Claim[]
  agreement: Agreement
  /** Distinct untainted voices. Never counts two pages of one publisher twice. */
  independentSources: number
  contradictions: readonly Contradiction[]
}

/* -------------------------------------------------------------------------- */
/* Number and date comparison                                                 */
/* -------------------------------------------------------------------------- */

const YEAR = /\b(1[0-9]{3}|20[0-9]{2})\b/g
const NUMBER = /-?\d+(?:\.\d+)?/g

/** Years mentioned, as numbers. */
function yearsIn(text: string): number[] {
  return (text.match(YEAR) ?? []).map(Number)
}

/**
 * Figures mentioned, EXCLUDING years.
 *
 * A year is a date, not a quantity. Leaving `2024` in the numeric set makes
 * "growth was 7.8 percent in 2024" and "growth was 7.8 percent in 2023"
 * contradict on the quantity axis, which is both wrong and the kind of wrong
 * that teaches a reader to ignore the field.
 */
function figuresIn(text: string): number[] {
  return (text.replace(YEAR, ' ').match(NUMBER) ?? []).map(Number).filter(Number.isFinite)
}

/**
 * Whether two figures are the same number.
 *
 * `7.8` and `7.80` are equal and reporting them as a contradiction is how a
 * correctness signal becomes noise. A relative tolerance rather than an
 * absolute one, so it behaves the same at 7.8 and at 7,800,000.
 */
const RELATIVE_TOLERANCE = 1e-9

function sameNumber(a: number, b: number): boolean {
  if (a === b) return true
  const scale = Math.max(Math.abs(a), Math.abs(b))
  return scale > 0 && Math.abs(a - b) / scale < RELATIVE_TOLERANCE
}

/** True when neither figure set contains any of the other's numbers. */
function figuresDisagree(a: readonly number[], b: readonly number[]): boolean {
  if (a.length === 0 || b.length === 0) return false
  return !a.some((x) => b.some((y) => sameNumber(x, y)))
}

/* -------------------------------------------------------------------------- */
/* crossCheck                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Publisher identity, with `www.` folded in.
 *
 * `www.reuters.com` and `reuters.com` are one newsroom. Counting them twice is
 * the same manufactured-consensus bug as counting two paths on one host.
 */
function publisherOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '').replace(/\.+$/, '')
  } catch {
    /* Unparseable is its own voice rather than a shared empty one, so two
       broken URLs do not silently corroborate each other. */
    return `unparseable:${url}`
  }
}

/**
 * Distinct untainted voices behind a set of claims.
 *
 * BY PUBLISHER, NOT BY TEXT SIMILARITY, and that distinction is the whole
 * correctness of this function. `quality.independentSources` also merges
 * near-duplicate TEXT, which is right for whole documents — 70% shared content
 * words means one syndicated story. Applied to single-sentence claims it
 * inverts: two genuinely independent sources stating the same fact share
 * nearly all their words, so the more exactly they agree, the more certainly
 * they get collapsed into one voice. Corroboration would become impossible in
 * precisely the case it exists to detect.
 *
 * Syndication is therefore a page-level judgement and belongs where whole text
 * is available, not here.
 */
function countVoices(claims: readonly Claim[]): number {
  const usable = claims.filter((c) => !c.tainted)
  if (usable.length === 0) return 0
  return new Set(usable.map((c) => publisherOf(c.sourceUrl))).size
}

/**
 * Every pair that disagrees, not the first one.
 *
 * Stopping at the first contradiction would report one disagreement in a
 * three-way split and make a badly contested claim look mildly contested.
 * Pairs are compared once each, in a stable order, so the output is
 * deterministic rather than a function of claim arrival.
 */
function contradictionsAmong(claims: readonly Claim[]): Contradiction[] {
  const out: Contradiction[] = []
  for (let i = 0; i < claims.length; i += 1) {
    for (let j = i + 1; j < claims.length; j += 1) {
      const a = claims[i]
      const b = claims[j]
      /* Same page disagreeing with itself is a parsing artefact, not a
         cross-source contradiction, and reporting it would fill the field with
         noise from long documents that restate figures. */
      if (a.sourceUrl === b.sourceUrl) continue

      const fa = figuresIn(a.text)
      const fb = figuresIn(b.text)
      if (figuresDisagree(fa, fb)) {
        out.push({
          kind: 'numeric',
          a,
          b,
          detail: `figures disagree: ${fa.join(', ')} vs ${fb.join(', ')}`,
        })
        continue
      }

      const ya = yearsIn(a.text)
      const yb = yearsIn(b.text)
      if (ya.length > 0 && yb.length > 0 && !ya.some((y) => yb.includes(y))) {
        out.push({
          kind: 'temporal',
          a,
          b,
          detail: `dates disagree: ${ya.join(', ')} vs ${yb.join(', ')}`,
        })
      }
    }
  }
  return out
}

/**
 * One finding per aspect the question asked about.
 *
 * Aspect-keyed rather than claim-keyed, because the question defines what has
 * to be covered. A claim touching two aspects appears in both findings; that
 * is not duplication, it is the same evidence answering two things.
 */
export function crossCheck(claims: readonly Claim[], req: SearchRequirements): Finding[] {
  if (!req.shouldSearch) return []

  return req.aspects.map((aspect) => {
    const mine = claims.filter((c) => c.aspects.includes(aspect))
    const contradictions = contradictionsAmong(mine)
    const voices = countVoices(mine)

    /* Order is the policy. Contradiction outranks corroboration unconditionally
       — a claim that two independent sources support and a third denies is
       contested, and calling it corroborated would be true and useless. */
    const agreement: Agreement =
      contradictions.length > 0
        ? 'contradicted'
        : voices >= 2
          ? 'corroborated'
          : voices === 1
            ? 'single'
            : 'unsupported'

    return { aspect, claims: mine, agreement, independentSources: voices, contradictions }
  })
}
