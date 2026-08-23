import type { Claim, Source, Understanding } from '../kernel/contracts'
import type { RouteContext } from '../kernel/router'
import { overlap, tokens, without } from '../kernel/text'

/**
 * WHERE THE ANSWER COMES FROM.
 *
 * The brief's instruction is blunt: "Do not force the model to answer from
 * internal knowledge when another capability is more appropriate." The failure
 * it describes is the default behaviour of every language model --- asked
 * anything, produce a fluent answer from weights, because that path always
 * works and never reports that it was the wrong path.
 *
 * So source selection is a decision made BEFORE generation, by a function that
 * can say "I should not answer this from memory", and the six options are
 * genuinely different actions rather than six labels for "answer anyway".
 *
 * THE HARDEST RULE IN THIS FILE IS THAT DISAGREEMENT SURVIVES
 * ----------------------------------------------------------
 * When two sources conflict, the tempting move is to pick the better one and
 * present a single clean answer. That is laundering: the user receives a
 * confident claim and never learns the evidence was split. `detectConflicts`
 * therefore attaches the disagreement TO the claim, and nothing downstream is
 * allowed to drop it.
 */

/* -------------------------------------------------------------------------- */
/* Source selection --- Capability 7                                          */
/* -------------------------------------------------------------------------- */

export type Route =
  | 'know' // the model already knows this and it does not move
  | 'retrieve' // it is in something the user gave us
  | 'calculate' // it must be computed
  | 'search' // it must come from the live world
  | 'remember' // we were told this before
  | 'ask' // we cannot know it; only the user can say

export interface SourceDecision {
  /** Ordered. More than one is normal: search THEN calculate is one answer. */
  routes: readonly Route[]
  because: Readonly<Record<string, string>>
}

export function decideSource(u: Understanding, ctx: RouteContext): SourceDecision {
  const routes: Route[] = []
  const because: Record<string, string> = {}
  const take = (r: Route, why: string) => {
    if (!routes.includes(r)) routes.push(r)
    because[r] = why
  }

  const kinds = new Set(u.intents.map((i) => i.kind))

  /* ASK COMES FIRST AND IS EXCLUSIVE.
     If we do not know what is being referred to, every other route answers a
     question nobody asked. Searching for an unresolved "it" produces a
     well-sourced answer about the wrong thing, which is harder to spot than
     no answer at all. */
  const blocking = u.ambiguities.find((a) => a.blocking)
  if (blocking) {
    return { routes: ['ask'], because: { ask: `cannot proceed: ${blocking.what}` } }
  }

  if (kinds.has('memory-read') || kinds.has('continuation')) {
    take('remember', 'the question is about what was said or done before')
  }
  if (ctx.hasAttachments) {
    take('retrieve', 'the user supplied material the answer must be grounded in')
  }
  if (kinds.has('research') || ctx.freshnessSensitive) {
    take('search', 'the answer depends on the state of the world, which weights do not track')
  }
  if (kinds.has('calculation') || ctx.hasComputation) {
    take('calculate', 'a number is wanted, and a computed number beats a recalled one')
  }

  /* Model knowledge is the LAST resort among the information routes, not the
     first. It is added when nothing better applies, or alongside search to
     supply the framing that sources rarely state. */
  if (routes.length === 0) {
    take('know', 'the answer is settled, and no better source applies')
  } else if (kinds.has('explanation') || kinds.has('comparison')) {
    take('know', 'the sources supply facts; the framing comes from what the model knows')
  }

  return { routes, because }
}

/* -------------------------------------------------------------------------- */
/* Query generation --- Capability 8                                          */
/* -------------------------------------------------------------------------- */

/**
 * Several queries, not one.
 *
 * One query returns one slice of one ranking. The brief asks for multi-query
 * search and for conflict detection, and the second is impossible without the
 * first --- sources can only be found to disagree if more than one search
 * angle was taken. These angles are deliberately different in KIND (bare
 * subject, current-value, authority-scoped) rather than three rewordings,
 * because three rewordings return the same page three times.
 */
export function queries(u: Understanding, now: string): string[] {
  const subject = [...tokens(u.goal)].slice(0, 6).join(' ')
  if (subject.length === 0) return []
  const year = new Date(Date.parse(now)).getUTCFullYear()

  const out = [subject]
  const fresh = /\b(latest|current|now|today|recent)\b/i.test(u.goal)
  if (fresh) {
    out.push(`${subject} ${year}`)
    out.push(`${subject} latest official`)
  } else {
    out.push(`what is ${subject}`)
  }
  if (u.intents.some((i) => i.kind === 'comparison')) {
    out.push(`${subject} comparison differences`)
  }
  return [...new Set(out)]
}

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

export interface SearchHit {
  url: string
  title: string
  snippet: string
  /** ISO date the PAGE was published, when the engine reports one. */
  publishedAt?: string
}

export interface SearchPort {
  search(query: string): Promise<readonly SearchHit[]>
}

/**
 * Domains whose say-so is worth more, by kind rather than by name.
 *
 * A LIST OF SUFFIXES, NOT A LIST OF BRANDS. Ranking by named publisher bakes
 * one editorial worldview into the software and ages badly. Ranking by the
 * KIND of institution is a claim about accountability --- a government
 * statistics office is the primary source for its own statistics --- and that
 * stays true as the named sites change.
 */
const AUTHORITY: readonly { test: RegExp; weight: number; why: string }[] = [
  /* `(\.[a-z]{2})?` before the boundary, not after the whole host. An earlier
     version anchored on `.gov/` or `.gov$` and therefore scored `data.gov.in`
     at the unclassified default --- every country-scoped government domain,
     which for an India-first product is most of the ones that matter. */
  { test: /\.gov(\.[a-z]{2})?(\/|$|\?)/i, weight: 1.0, why: 'government primary source' },
  { test: /\.(edu|ac)(\.[a-z]{2})?(\/|$|\?)/i, weight: 0.85, why: 'academic institution' },
  { test: /\b(who|un|imf|worldbank|oecd|rbi|sebi|nic)\.(int|org|in)\b/i, weight: 0.9, why: 'official body' },
  { test: /\.org(\.[a-z]{2})?$|\.org\//i, weight: 0.6, why: 'organisation' },
  { test: /\b(wikipedia)\.org\b/i, weight: 0.55, why: 'tertiary summary, good for orientation' },
  { test: /\b(blogspot|medium|substack|quora|reddit|answers)\b/i, weight: 0.25, why: 'user-generated' },
]

export function authorityOf(url: string): { weight: number; why: string } {
  for (const a of AUTHORITY) if (a.test.test(url)) return { weight: a.weight, why: a.why }
  return { weight: 0.5, why: 'unclassified source' }
}

const DAY = 86_400_000

/**
 * How much to trust this page's age for THIS question.
 *
 * Freshness is not universally good. A 2015 page about the Krebs cycle is not
 * stale, and preferring a 2026 blog post about it over a 2015 textbook makes
 * the answer worse. So decay only applies when the question is time-sensitive;
 * otherwise age is ignored entirely.
 *
 * An UNDATED page is treated as neither fresh nor stale (0.5) rather than as
 * fresh. Missing metadata is not evidence of recency, and defaulting it to
 * fresh is how an undated page outranks a dated one on a question where the
 * date is the whole point.
 */
export function freshness(hit: SearchHit, now: string, timeSensitive: boolean): number {
  if (!timeSensitive) return 1
  if (!hit.publishedAt) return 0.5
  const age = (Date.parse(now) - Date.parse(hit.publishedAt)) / DAY
  if (!Number.isFinite(age)) return 0.5
  if (age < 0) return 1 // future-dated; the engine is wrong, not the page
  return Math.max(0.05, Math.pow(0.5, age / 365))
}

export interface RankedHit extends SearchHit {
  score: number
  authority: number
  freshness: number
  why: string
}

export function rank(
  hits: readonly SearchHit[],
  u: Understanding,
  now: string,
  timeSensitive: boolean,
): RankedHit[] {
  const want = tokens(u.goal)
  return hits
    .map((h) => {
      const a = authorityOf(h.url)
      const f = freshness(h, now, timeSensitive)
      const relevance = overlap(want, tokens(`${h.title} ${h.snippet}`))
      return {
        ...h,
        authority: a.weight,
        freshness: f,
        /* Relevance gates the other two. An extremely authoritative page about
           something else must not outrank a merely decent page about the
           actual question --- which is what a weighted SUM would do. */
        score: relevance * (0.6 + 0.4 * a.weight) * f,
        why: `${a.why}${h.publishedAt ? `, published ${h.publishedAt.slice(0, 10)}` : ', undated'}`,
      }
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
}

export function toSource(hit: RankedHit, retrievedAt: string): Source {
  return {
    kind: 'web',
    ref: hit.url,
    /* `publishedAt` and `retrievedAt` are kept apart because freshness
       reasoning runs on the first and only the first. Collapsing them makes
       every page look freshly published the moment it is fetched. */
    ...(hit.publishedAt ? { publishedAt: hit.publishedAt } : {}),
    retrievedAt,
    excerpt: hit.snippet,
  }
}

/* -------------------------------------------------------------------------- */
/* Conflict                                                                   */
/* -------------------------------------------------------------------------- */

/** Numbers with their units, so "7%" and "7 million" are not compared. */
function numbers(text: string): { value: number; unit: string }[] {
  const out: { value: number; unit: string }[] = []
  for (const m of text.matchAll(/(-?\d+(?:\.\d+)?)\s*(%|percent|per cent|million|billion|crore|lakh|kg|km|°c|°f)?/gi)) {
    const raw = m[1]
    if (raw === undefined) continue
    out.push({ value: Number(raw), unit: (m[2] ?? '').toLowerCase().replace('per cent', 'percent').replace('%', 'percent') })
  }
  return out
}

/**
 * Unit words, excluded from the SUBJECT comparison.
 *
 * "India inflation was 6.2 percent" and "Brazil rainfall was 40 percent" share
 * exactly one content word --- `percent` --- which was enough to clear a 0.3
 * overlap threshold and get reported as sources disagreeing about inflation.
 * A unit is what the number is measured IN, never what it is ABOUT, so
 * counting it as subject evidence makes every percentage on the internet a
 * potential conflict with every other one.
 */
const UNIT_WORDS = new Set([
  'percent', 'percentage', 'million', 'billion', 'trillion', 'crore', 'lakh',
  'thousand', 'kilogram', 'kilometre', 'kilometer', 'degrees', 'celsius',
  'fahrenheit', 'rupees', 'dollars', 'euros', 'points', 'basis',
])

/**
 * Do these two snippets state different values for the same thing?
 *
 * Requires: same subject (lexical overlap EXCLUDING units), same unit,
 * materially different value. All three, because any two alone produce false
 * alarms --- two pages about inflation quoting 6% and 6.02% are not in
 * conflict, two pages quoting "7%" and "7 million" are not talking about the
 * same quantity, and two pages sharing only the word "percent" are not talking
 * about the same thing at all.
 */
export function disagree(a: string, b: string, tolerance = 0.02): string | null {
  const subjectA = without(tokens(a), UNIT_WORDS)
  const subjectB = without(tokens(b), UNIT_WORDS)
  if (overlap(subjectA, subjectB) < 0.3) return null
  const na = numbers(a)
  const nb = numbers(b)
  for (const x of na) {
    for (const y of nb) {
      if (x.unit !== y.unit) continue
      const scale = Math.max(Math.abs(x.value), Math.abs(y.value), 1e-9)
      if (Math.abs(x.value - y.value) / scale > tolerance) {
        return `sources differ: ${x.value}${x.unit ? ' ' + x.unit : ''} vs ${y.value}${y.unit ? ' ' + y.unit : ''}`
      }
    }
  }
  return null
}

/**
 * Turn ranked hits into claims, PRESERVING disagreement.
 *
 * The conflicting sources are attached to the same claim rather than split
 * into two claims, so there is no arrangement of the output in which a reader
 * sees one number and not the other. Confidence is reduced as well, but the
 * reduction is the lesser mechanism --- a merely-lower confidence still lets a
 * single number through, and the `conflict` string does not.
 */
export function synthesize(hits: readonly RankedHit[], retrievedAt: string): Claim[] {
  if (hits.length === 0) return []

  const claims: Claim[] = []
  const used = new Set<number>()

  hits.forEach((hit, i) => {
    if (used.has(i)) return
    const sources: Source[] = [toSource(hit, retrievedAt)]
    let conflict: string | undefined
    let agreements = 0

    hits.forEach((other, j) => {
      if (j <= i || used.has(j)) return
      const d = disagree(hit.snippet, other.snippet)
      if (d) {
        used.add(j)
        sources.push(toSource(other, retrievedAt))
        conflict = d
      } else if (overlap(tokens(hit.snippet), tokens(other.snippet)) > 0.5) {
        /* Independent corroboration. Only counted for sources that are not
           the same domain --- two pages of one site are one source wearing
           two URLs, and treating that as agreement manufactures consensus. */
        if (domain(other.url) !== domain(hit.url)) {
          used.add(j)
          sources.push(toSource(other, retrievedAt))
          agreements++
        }
      }
    })

    used.add(i)
    const base = Math.min(0.9, 0.45 + 0.15 * agreements + 0.3 * hit.authority)
    claims.push({
      statement: hit.snippet,
      sources,
      confidence: conflict ? Math.min(base, 0.4) : base,
      ...(conflict ? { conflict } : {}),
    })
  })

  return claims.sort((a, b) => b.confidence - a.confidence)
}

function domain(url: string): string {
  const m = url.match(/^https?:\/\/([^/]+)/i)
  return (m?.[1] ?? url).replace(/^www\./i, '').toLowerCase()
}

/* -------------------------------------------------------------------------- */
/* The research step                                                          */
/* -------------------------------------------------------------------------- */

export interface Research {
  claims: readonly Claim[]
  queriesRun: readonly string[]
  /** True when the evidence is too thin or too split to answer flatly. */
  insufficient: boolean
  why: string
}

/**
 * "Do I have enough evidence?" --- answered explicitly rather than assumed.
 *
 * The brief asks that question directly, and a research step that always
 * returns an answer has silently answered "yes" every time. `insufficient` is
 * what lets the loop choose to qualify, search again, or say it does not know.
 */
export async function research(
  port: SearchPort,
  u: Understanding,
  now: string,
  timeSensitive: boolean,
): Promise<Research> {
  const qs = queries(u, now)
  const seen = new Map<string, SearchHit>()

  for (const q of qs) {
    let hits: readonly SearchHit[] = []
    try {
      hits = await port.search(q)
    } catch {
      /* One failed query does not end the research. The others may still
         return enough, and `insufficient` reports honestly if they do not. */
      continue
    }
    for (const h of hits) if (!seen.has(h.url)) seen.set(h.url, h)
  }

  const ranked = rank([...seen.values()], u, now, timeSensitive)
  const claims = synthesize(ranked, now)

  const distinct = new Set(ranked.map((h) => domain(h.url))).size
  const conflicted = claims.some((c) => c.conflict)
  const insufficient = claims.length === 0 || distinct < 2 || conflicted

  return {
    claims,
    queriesRun: qs,
    insufficient,
    why:
      claims.length === 0
        ? 'no usable results'
        : conflicted
          ? 'sources disagree; the answer must carry the disagreement'
          : distinct < 2
            ? 'only one independent source; a single source is not corroboration'
            : 'multiple independent sources agree',
  }
}
