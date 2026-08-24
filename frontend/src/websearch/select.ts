/**
 * WHICH SOURCES ARE WORTH READING, AND IN WHAT ORDER. §8, §9, §33.
 *
 * `engine.ts` filtered on protocol alone: an `http(s)` URL was as good as any
 * other `http(s)` URL. That is not a source policy, it is the absence of one,
 * and it means a forum comment and a government notification arrive at the
 * fetcher with equal standing and get read in whatever order the engine
 * happened to return them.
 *
 * WHY NOTHING IS SILENTLY DROPPED
 * -------------------------------
 * Every input hit comes back, ranked or excluded-with-a-reason. A source
 * removed without a record is a source the report cannot explain, and
 * "we found four results" reads identically whether four existed or twelve did.
 * Filtering that leaves no trace is indistinguishable from retrieval that found
 * nothing, which is the same collapse `engineFailed` exists to prevent one
 * layer up.
 *
 * WHY THE SCORE IS NEVER THE ONLY ARTEFACT
 * ----------------------------------------
 * §44 forbids optimising quality with one number. A rank needs an order, so a
 * score exists — but every ranked hit carries the FACTORS that produced it, so
 * a surprising order can be explained rather than argued with. A number whose
 * inputs are not recoverable is a number nobody can be wrong about.
 *
 * WHY SUFFIX MATCHING IS DONE ON LABELS, NOT SUBSTRINGS
 * -----------------------------------------------------
 * `gov.uk.evil.com` contains `gov.uk`. A classifier written with `includes()`
 * hands an attacker the reputation of any name they care to embed, and the
 * result is worse than no classifier at all because the ranking now actively
 * promotes the hostile page. Matching is therefore on whole dot-separated
 * labels, anchored at the end of the hostname.
 */

import type { SearchRequirements } from './interpret'
import type { SearchHit } from './port'

/* -------------------------------------------------------------------------- */
/* Taxonomy                                                                   */
/* -------------------------------------------------------------------------- */

export type SourceKind =
  | 'official'
  | 'academic'
  | 'reference'
  | 'news'
  | 'forum'
  | 'commercial'
  | 'unknown'

/** Where a kind sits relative to the information's origin. §9. */
export type Tier = 'primary' | 'secondary' | 'tertiary'

export function tierOf(kind: SourceKind): Tier {
  switch (kind) {
    case 'official':
    case 'academic':
      return 'primary'
    case 'reference':
      return 'tertiary'
    default:
      return 'secondary'
  }
}

export interface QualityFactors {
  kind: SourceKind
  tier: Tier
  kindWeight: number
  /** Absent when the page declared no usable date. Never defaulted. */
  freshness?: number
  /** How much of the question's own vocabulary the title and snippet carry. */
  termOverlap: number
  /** Named, so a low score can be read rather than guessed at. */
  penalties: readonly string[]
}

export interface RankedHit {
  hit: SearchHit
  kind: SourceKind
  factors: QualityFactors
  /** In [0,1]. Meaningless alone — read it with `factors`. */
  score: number
  /** Present together with `excludedReason`, or neither. */
  excluded?: true
  excludedReason?: string
}

/* -------------------------------------------------------------------------- */
/* Classification                                                             */
/* -------------------------------------------------------------------------- */

/** Whole-label suffix match. `gov.uk.evil.com` does not end in the label `gov.uk`. */
function endsWithLabel(hostname: string, suffix: string): boolean {
  if (hostname === suffix) return true
  return hostname.endsWith(`.${suffix}`)
}

const OFFICIAL_SUFFIXES = ['gov', 'mil', 'gov.uk', 'gov.in', 'nic.in', 'europa.eu', 'un.org']
const OFFICIAL_HOSTS = ['nasa.gov', 'rbi.org.in', 'who.int', 'imf.org', 'worldbank.org']
const ACADEMIC_SUFFIXES = ['edu', 'ac.uk', 'edu.au', 'ac.in']
const ACADEMIC_HOSTS = ['arxiv.org', 'doi.org', 'pubmed.ncbi.nlm.nih.gov', 'nature.com', 'jstor.org']
const REFERENCE_HOSTS = ['wikipedia.org', 'britannica.com', 'wikidata.org', 'wiktionary.org']
const NEWS_HOSTS = [
  'reuters.com', 'apnews.com', 'bbc.co.uk', 'bbc.com', 'ft.com',
  'nytimes.com', 'theguardian.com', 'bloomberg.com', 'thehindu.com',
]
const FORUM_HOSTS = [
  'reddit.com', 'stackoverflow.com', 'stackexchange.com', 'quora.com',
  'news.ycombinator.com', 'medium.com', 'substack.com',
]

/**
 * Total. A URL that cannot be parsed is `unknown`, never an exception —
 * classification runs on engine output, and one malformed hit must not take
 * down the ranking of the eleven good ones beside it.
 */
export function classify(url: string): SourceKind {
  let hostname: string
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'unknown'
    hostname = parsed.hostname.toLowerCase().replace(/\.+$/, '')
  } catch {
    return 'unknown'
  }
  if (!hostname) return 'unknown'

  const any = (list: readonly string[]) => list.some((s) => endsWithLabel(hostname, s))

  if (any(OFFICIAL_HOSTS) || any(OFFICIAL_SUFFIXES)) return 'official'
  if (any(ACADEMIC_HOSTS) || any(ACADEMIC_SUFFIXES)) return 'academic'
  if (any(REFERENCE_HOSTS)) return 'reference'
  if (any(NEWS_HOSTS)) return 'news'
  if (any(FORUM_HOSTS)) return 'forum'
  /* A parseable http(s) host we do not recognise is commercial, not unknown.
     `unknown` is reserved for "we could not read this at all", so the two stay
     distinguishable in a report. */
  return hostname.includes('.') ? 'commercial' : 'unknown'
}

/* -------------------------------------------------------------------------- */
/* Scoring                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * How much a kind is worth BEFORE the question is taken into account.
 *
 * Deliberately not a hierarchy of virtue. A forum answer is often the only
 * place a practical procedure is written down, so it scores low rather than
 * zero; zero would make it unreachable regardless of how well it matched.
 */
const KIND_WEIGHT: Readonly<Record<SourceKind, number>> = {
  official: 1,
  academic: 0.95,
  reference: 0.7,
  news: 0.65,
  commercial: 0.4,
  forum: 0.35,
  unknown: 0.2,
}

const DAY_MS = 24 * 60 * 60 * 1000
/** Beyond this, age stops discriminating: two-year-old and five-year-old are both old. */
const FRESHNESS_HORIZON_MS = 365 * DAY_MS

/**
 * 1 for today, decaying to 0 at the horizon, `undefined` for no usable date.
 *
 * A FUTURE date earns nothing. A page claiming tomorrow is wrong or lying, and
 * either way it must not sort above an honest one — the naive `now - published`
 * gives it a negative age and, clamped the obvious way, the best possible
 * score.
 */
function freshnessOf(publishedAt: string | undefined, now: number): number | undefined {
  if (!publishedAt) return undefined
  const at = Date.parse(publishedAt)
  if (!Number.isFinite(at)) return undefined
  const age = now - at
  if (age < 0) return 0
  if (age >= FRESHNESS_HORIZON_MS) return 0
  return 1 - age / FRESHNESS_HORIZON_MS
}

/** Share of the question's aspects that appear in the title or snippet. */
function overlap(hit: SearchHit, req: SearchRequirements): number {
  if (req.aspects.length === 0) return 0
  const text = `${hit.title} ${hit.snippet}`.toLowerCase()
  const found = req.aspects.filter((a) => text.includes(a)).length
  return found / req.aspects.length
}

const AFFILIATE = /[?&](ref|aff|affiliate|utm_source)=/i

function penaltiesFor(hit: SearchHit, kind: SourceKind): string[] {
  const out: string[] = []
  if (AFFILIATE.test(hit.url)) out.push('affiliate-parameter')
  if (kind === 'unknown') out.push('unclassifiable-host')
  if (!hit.snippet.trim()) out.push('no-snippet')
  return out
}

/* -------------------------------------------------------------------------- */
/* rankHits                                                                   */
/* -------------------------------------------------------------------------- */

/** Exclusions. A hit here is reported, never removed. */
function exclusionFor(hit: SearchHit): string | undefined {
  let parsed: URL
  try {
    parsed = new URL(hit.url)
  } catch {
    return 'unparseable-url'
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `unsupported-scheme:${parsed.protocol.replace(':', '')}`
  }
  return undefined
}

/**
 * Rank the engine's hits for THIS question.
 *
 * Output is the same length as input, always. Excluded hits sort last, in a
 * block, so a caller can `takeWhile(!excluded)` without re-checking.
 *
 * Ties break on URL rather than on input position. Without that, the engine's
 * arbitrary ordering would decide our ranking and §33 would be a function of
 * someone else's tie-break rather than of the question.
 */
export function rankHits(
  hits: readonly SearchHit[],
  req: SearchRequirements,
  now: () => number = Date.now,
): RankedHit[] {
  const at = now()

  const scored: RankedHit[] = hits.map((hit) => {
    const reason = exclusionFor(hit)
    const kind = classify(hit.url)
    const tier = tierOf(kind)
    const freshness = freshnessOf(hit.publishedAt, at)
    const termOverlap = overlap(hit, req)
    const penalties = penaltiesFor(hit, kind)

    const factors: QualityFactors = {
      kind,
      tier,
      kindWeight: KIND_WEIGHT[kind],
      ...(freshness === undefined ? {} : { freshness }),
      termOverlap,
      penalties,
    }

    if (reason) {
      return { hit, kind, factors, score: 0, excluded: true as const, excludedReason: reason }
    }

    /* Weights, stated rather than tuned: what the source IS dominates, what it
       appears to SAY is a strong secondary, and recency only matters as much as
       the question said it does. A question with no time sensitivity gives
       freshness zero weight rather than a small one, so an old authoritative
       page is not quietly demoted for being old. */
    const timeWeight = req.timeSensitivity === 'realtime' ? 0.35 : req.timeSensitivity === 'recent' ? 0.25 : 0
    const primaryBoost = req.requirePrimary && tier === 'primary' ? 0.15 : 0
    const tertiaryDrag = req.requirePrimary && tier === 'tertiary' ? 0.2 : 0

    const base =
      factors.kindWeight * (0.55 - timeWeight * 0.3) +
      termOverlap * 0.3 +
      (freshness ?? 0) * timeWeight

    const penalty = penalties.length * 0.05
    const score = Math.max(0, Math.min(1, base + primaryBoost - tertiaryDrag - penalty))

    return { hit, kind, factors, score }
  })

  return scored.sort((a, b) => {
    if (a.excluded !== b.excluded) return a.excluded ? 1 : -1
    if (b.score !== a.score) return b.score - a.score
    return a.hit.url < b.hit.url ? -1 : a.hit.url > b.hit.url ? 1 : 0
  })
}
