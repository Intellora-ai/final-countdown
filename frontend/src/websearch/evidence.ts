/**
 * PAGES IN, CLAIMS OUT. §20, §23, §33's evidence half.
 *
 * A CLAIM HERE IS A SPAN, NEVER A SENTENCE THIS FILE WROTE.
 * -------------------------------------------------------
 * This package has no model in it. Anything that "generates" a claim is
 * generating it from nothing, and that is exactly what §21 and invariant 4
 * forbid: search failure must not silently become fabricated information. A
 * generator with no model would not be a partial implementation of synthesis,
 * it would be the failure mode with a nicer interface.
 *
 * So a claim carries `offset` and `length` into the source text, and the
 * guarantee is mechanical rather than intended:
 *
 *     source.text.slice(offset, offset + length) === claim.text
 *
 * asserted over 150 generated inputs. If that ever fails, the claim did not
 * come from the page, and the whole citation chain above it is decoration.
 *
 * WHY A FAILED SOURCE SAYS NOTHING
 * --------------------------------
 * `gather` returns failures as entries rather than absences, which is right —
 * upstream needs to tell a dead host from a host with nothing to say. But an
 * entry with `ok: false` has an empty `text`, and a claim extractor that does
 * not check `ok` would happily mine that empty string and report zero claims
 * from a source that was never read. Zero claims from a read page and zero
 * claims from a dead page mean opposite things.
 *
 * WHY TAINT TRAVELS
 * -----------------
 * Invariant 5: a source's page instructions must never override system
 * instructions. `guard` flags a page that tries; that flag is useless if it
 * stops at the page boundary. Every claim from a flagged source is `tainted`,
 * ranking is forbidden from promoting a tainted claim over a clean one, and
 * both facts are asserted — a taint that ranking can quietly drop is a taint
 * that will be quietly dropped.
 */

import type { Retrieved } from './gather'
import type { SearchRequirements } from './interpret'
import { classify, tierOf, type SourceKind } from './select'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ClaimKind = 'numeric' | 'temporal' | 'statement'

export interface Claim {
  /** Verbatim from the source. Never composed. */
  text: string
  /** The URL the BYTES came from, after redirects. */
  sourceUrl: string
  sourceKind: SourceKind
  /** Index into `Retrieved.text`. */
  offset: number
  length: number
  kind: ClaimKind
  /** Aspects of the question this span actually mentions. Never empty. */
  aspects: readonly string[]
  /** When these bytes were obtained. Travels so freshness survives to the answer. */
  retrievedAt: string
  /** True when the source showed injection signals. */
  tainted: boolean
}

/**
 * Per-source cap.
 *
 * Exported so the test asserts the real bound rather than a number it also
 * guessed. Without a cap, one long page contributes more evidence than ten
 * short ones and cross-source agreement becomes a measure of page length.
 */
export const MAX_CLAIMS_PER_SOURCE = 12

/** Beyond this a "claim" is a paragraph, and quoting it cites nothing precisely. */
const MAX_CLAIM_CHARS = 600
/** Below this a span is a fragment that cannot support anything on its own. */
const MIN_CLAIM_CHARS = 12

/* -------------------------------------------------------------------------- */
/* Sentence splitting                                                         */
/* -------------------------------------------------------------------------- */

interface Span {
  text: string
  offset: number
}

/**
 * Split into sentence-ish spans, keeping each span's offset.
 *
 * Offsets are the entire point: they are what makes the extractive guarantee
 * checkable. A splitter that returns strings without positions produces claims
 * that cannot be verified against the source, which is the same as claims that
 * were invented — nobody can tell the difference afterwards.
 *
 * Deliberately not a full sentence tokeniser. Abbreviations and decimals will
 * occasionally split badly; the cost of that is a slightly awkward quote, and
 * the cost of the alternative is a dependency this brief does not name.
 */
function sentences(text: string): Span[] {
  const out: Span[] = []
  let start = 0
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '\n') continue
    /* A period between two digits is a decimal, not a sentence end. Splitting
       `7.8 percent` into `7` and `8 percent` would turn one true numeric claim
       into two false ones. */
    if (ch === '.' && /\d/.test(text[i - 1] ?? '') && /\d/.test(text[i + 1] ?? '')) continue
    const raw = text.slice(start, i + 1)
    if (raw.trim()) out.push({ text: raw, offset: start })
    start = i + 1
    if (out.length > MAX_CLAIMS_PER_SOURCE * 8) break
  }
  const tail = text.slice(start)
  if (tail.trim()) out.push({ text: tail, offset: start })
  return out
}

/** Trim whitespace while keeping the offset honest. */
function tighten(span: Span): Span | undefined {
  const leading = span.text.length - span.text.trimStart().length
  const trimmed = span.text.trim()
  if (!trimmed) return undefined
  return { text: trimmed, offset: span.offset + leading }
}

/* -------------------------------------------------------------------------- */
/* Kind                                                                       */
/* -------------------------------------------------------------------------- */

const HAS_NUMBER = /\d/
const HAS_YEAR = /\b(1[0-9]{3}|20[0-9]{2})\b/

/**
 * Order matters: a year is a date before it is a number.
 *
 * `in 2024` and `7.8 percent` contradict in different ways — two dates
 * disagree about WHEN, two figures disagree about HOW MUCH — and collapsing
 * them means the cross-check compares a year against a percentage.
 */
function kindOf(text: string): ClaimKind {
  const withoutYears = text.replace(HAS_YEAR, '')
  if (HAS_NUMBER.test(withoutYears)) return 'numeric'
  if (HAS_YEAR.test(text)) return 'temporal'
  return 'statement'
}

/* -------------------------------------------------------------------------- */
/* extractClaims                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The spans of this page that speak to this question.
 *
 * Relevance is by construction: a span with none of the question's aspects in
 * it is not returned at all. The alternative — return everything and rank —
 * makes the evidence set a function of page length, and lets a long irrelevant
 * page outvote a short exact one.
 */
export function extractClaims(source: Retrieved, req: SearchRequirements): Claim[] {
  /* A failed fetch has an empty `text`, and mining it would report "zero
     claims" — which is what a successfully-read page with nothing to say also
     reports. Those mean opposite things. */
  if (!source.ok) return []
  if (!source.text.trim()) return []
  if (req.aspects.length === 0) return []

  const sourceUrl = source.finalUrl || source.hit.url
  const sourceKind = classify(sourceUrl)
  const out: Claim[] = []

  for (const raw of sentences(source.text)) {
    if (out.length >= MAX_CLAIMS_PER_SOURCE) break
    const span = tighten(raw)
    if (!span) continue
    if (span.text.length < MIN_CLAIM_CHARS) continue

    /* Truncate rather than skip. A long paragraph that answers the question is
       worth quoting the front of; dropping it entirely loses the evidence to
       satisfy a formatting rule. The offset stays valid because we cut from
       the end. */
    const text = span.text.slice(0, MAX_CLAIM_CHARS)
    const lower = text.toLowerCase()
    const aspects = req.aspects.filter((a) => lower.includes(a))
    if (aspects.length === 0) continue

    out.push({
      text,
      sourceUrl,
      sourceKind,
      offset: span.offset,
      length: text.length,
      kind: kindOf(text),
      aspects,
      retrievedAt: source.retrievedAt,
      tainted: source.suspicious,
    })
  }

  return out
}

/* -------------------------------------------------------------------------- */
/* rankEvidence                                                               */
/* -------------------------------------------------------------------------- */

const TIER_RANK: Readonly<Record<string, number>> = { primary: 0, secondary: 1, tertiary: 2 }

/**
 * Order the evidence. Neither invents nor loses a claim — the output is a
 * permutation of the input, asserted.
 *
 * TAINT IS THE FIRST KEY, ahead of source tier and coverage. A tainted claim
 * from a government domain must still sit below a clean claim from a forum:
 * the flag says this page tried to give US instructions, and reputation does
 * not answer that. Sorting by quality first and taint second would let a
 * high-reputation compromised page lead the evidence set, which is the exact
 * page an attacker works hardest to obtain.
 */
export function rankEvidence(claims: readonly Claim[], req: SearchRequirements): Claim[] {
  return [...claims].sort((a, b) => {
    if (a.tainted !== b.tainted) return a.tainted ? 1 : -1

    if (req.requirePrimary) {
      const ta = TIER_RANK[tierOf(a.sourceKind)]
      const tb = TIER_RANK[tierOf(b.sourceKind)]
      if (ta !== tb) return ta - tb
    }

    /* More of the question covered by one span is better than the same
       coverage spread over two, because a single span can be cited whole. */
    if (b.aspects.length !== a.aspects.length) return b.aspects.length - a.aspects.length

    const ta = TIER_RANK[tierOf(a.sourceKind)]
    const tb = TIER_RANK[tierOf(b.sourceKind)]
    if (ta !== tb) return ta - tb

    /* Total and deterministic. Falling through to input order would make the
       evidence ranking depend on fetch completion order, which is a race. */
    if (a.sourceUrl !== b.sourceUrl) return a.sourceUrl < b.sourceUrl ? -1 : 1
    return a.offset - b.offset
  })
}
