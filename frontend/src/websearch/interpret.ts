/**
 * QUERY IN, SEARCH REQUIREMENTS OUT. The first stage of the pipeline.
 *
 * Everything downstream — which queries to issue, how many sources to demand,
 * whether the cache may answer, what "covered" means — is a consequence of what
 * the question actually asked for. Until this file existed, those were defaults
 * chosen once and applied to every question equally, which is the same as not
 * choosing.
 *
 * WHY THIS INVENTS NOTHING
 * ------------------------
 * Every `entity` and every `aspect` is a SUBSTRING OF THE QUERY. Not a synonym,
 * not an expansion, not a guess at what the user meant. That constraint is
 * asserted over generated input rather than trusted, because a fabrication here
 * is the most expensive kind: it enters as a field on a typed object, and every
 * later stage treats it as something the user asked for. No downstream check
 * can recover the difference, since by then the invention is indistinguishable
 * from the request.
 *
 * WHY REFUSING TO SEARCH IS NOT FREE
 * ----------------------------------
 * §42 asks the system to know when not to search. The tempting implementation —
 * "contains digits and an operator, so it is arithmetic" — refuses
 * `population of India in 2024`, `1939-1945`, and `COVID-19 case numbers`. A
 * false refusal is a wrong answer with better manners, and it is invisible in
 * testing because nobody writes a test for a question they did not ask.
 *
 * So the rule is deliberately narrow: the WHOLE query must be an arithmetic
 * expression, containing no letters at all. Anything with a word in it is a
 * question for the web, even when it is dense with numbers.
 *
 * WHY AMBIGUITY IS REPORTED RATHER THAN RESOLVED
 * ----------------------------------------------
 * Invariant §45.6: ambiguity that materially changes the answer must not be
 * silently assumed. `mercury` is a planet, a metal, and a god, and picking one
 * silently produces a confident answer to a question nobody asked. But
 * surfacing ambiguity has its own cost — a system that demands clarification
 * for `python programming language tutorial` is unusable. So an ambiguity is
 * dropped the moment the query itself disambiguates it.
 */

import { stripInvisible } from './guard'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type Intent =
  | 'factual'
  | 'temporal'
  | 'comparison'
  | 'procedural'
  | 'causal'
  | 'enumerative'
  | 'opinion'

export type TimeSensitivity = 'none' | 'recent' | 'realtime'

/**
 * Only the two refusals this file can actually detect.
 *
 * "self-referential" and "tautological" belong here in principle and are
 * deliberately absent: a reason the code cannot produce is a reason a caller
 * will write a branch for and never reach.
 */
export type NoSearchReason = 'arithmetic' | 'empty'

export interface Ambiguity {
  term: string
  /** At least two, because one reading is not an ambiguity. */
  readings: readonly string[]
  /** True when the readings would produce different answers. */
  material: boolean
}

export interface SearchRequirements {
  query: string
  /** Lowercased, invisible-stripped, whitespace-collapsed. */
  normalized: string
  intent: Intent
  /** Substrings of the query. Never expansions of it. */
  entities: readonly string[]
  /** What must be covered for an answer to be complete. Substrings too. */
  aspects: readonly string[]
  timeSensitivity: TimeSensitivity
  /** Present only when staleness is bounded but the cache may still answer. */
  maxAgeMs?: number
  requireFresh: boolean
  /** §10 — how many independent sources this question needs. */
  minSources: number
  /** §9 — whether a primary source is required rather than merely preferred. */
  requirePrimary: boolean
  ambiguities: readonly Ambiguity[]
  /** §42. False exactly when `noSearchReason` is set. */
  shouldSearch: boolean
  noSearchReason?: NoSearchReason
}

/* -------------------------------------------------------------------------- */
/* Normalisation                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Every Unicode space becomes a plain space before collapsing.
 *
 * A non-breaking space is invisible to a reader and is NOT matched by `\s` in
 * every engine and locale; leaving one in means two spellings of the same query
 * miss each other in the cache and count as two questions.
 */
const UNICODE_SPACE = /[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g

/**
 * C0, C1 and DEL, which `stripInvisible` does not cover and `\s` does not match.
 *
 * A NUL surviving here is not cosmetic. `normalized` becomes a cache key and is
 * interpolated into an outbound engine URL, so a control character in the query
 * reaches a remote party and splits one question into two cache entries that can
 * never hit each other. Applied AFTER the space mapping, so tab, newline and
 * carriage return become spaces rather than vanishing and welding two words
 * together.
 */
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/g

function normalize(raw: string): string {
  return stripInvisible(raw)
    .replace(UNICODE_SPACE, ' ')
    .replace(CONTROL, '')
    .replace(/ +/g, ' ')
    .trim()
    .toLowerCase()
}

/** Word-ish tokens. Keeps digits so `covid-19` and `2024` survive as content. */
function tokenize(normalized: string): string[] {
  return normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
}

/**
 * Words that carry no aspect of their own.
 *
 * Kept small on purpose. An aggressive stopword list silently deletes the
 * subject of short questions, and the failure looks like "the search found
 * nothing" rather than "we threw the question away".
 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'of', 'in', 'on', 'at', 'to', 'for', 'with', 'about', 'from', 'by',
  'and', 'or', 'but', 'if', 'then', 'than', 'that', 'this', 'these', 'those',
  'what', 'which', 'who', 'whom', 'whose', 'when', 'where', 'why', 'how',
  'do', 'does', 'did', 'can', 'could', 'should', 'would', 'will', 'shall',
  'i', 'you', 'it', 'its', 'me', 'my', 'we', 'us', 'our', 'they', 'them',
  'as', 'so', 'not', 'no', 'yes', 'there', 'here',
])

/** A cap, so a pathological query cannot turn into a pathological plan. */
const MAX_TERMS = 12

const dedupe = (xs: readonly string[]): string[] => [...new Set(xs)]

/* -------------------------------------------------------------------------- */
/* §42 — when not to search                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Whole-query arithmetic, and nothing looser.
 *
 * Requires: at least one digit, at least one operator, and NO letters anywhere.
 * The letter check is the whole guard — it is what separates `12-5` from
 * `what happened in 1939-1945`, and dropping it turns a useful refusal into a
 * silent hole in coverage.
 */
function isArithmetic(normalized: string): boolean {
  if (!normalized) return false
  if (/\p{L}/u.test(normalized)) return false
  if (!/\d/.test(normalized)) return false
  if (!/[+\-*/^%]/.test(normalized)) return false
  return /^[\d\s+\-*/^%().,]+$/.test(normalized)
}

/* -------------------------------------------------------------------------- */
/* §12 / §13 — time sensitivity                                               */
/* -------------------------------------------------------------------------- */

/** Answers that are wrong the moment they are cached. */
const REALTIME = ['right now', 'current', 'currently', 'live', 'now', 'today', 'at the moment']
/** Answers with a shelf life measured in days. */
const RECENT = ['latest', 'recent', 'recently', 'news', 'this week', 'this month', 'update']

const DAY_MS = 24 * 60 * 60 * 1000
const RECENT_MAX_AGE_MS = 7 * DAY_MS

function timeSensitivity(normalized: string): TimeSensitivity {
  const has = (words: readonly string[]) =>
    words.some((w) =>
      w.includes(' ')
        ? normalized.includes(w)
        : new RegExp(`(^| )${w}( |$)`, 'u').test(normalized),
    )
  /* Realtime is checked first: "current" outranks "news" in
     "current news", and the stricter reading is the safe one. */
  if (has(REALTIME)) return 'realtime'
  if (has(RECENT)) return 'recent'
  return 'none'
}

/* -------------------------------------------------------------------------- */
/* Intent                                                                     */
/* -------------------------------------------------------------------------- */

const contains = (s: string, w: string) => new RegExp(`(^| )${w}( |$)`, 'u').test(s)

/**
 * Order is load-bearing.
 *
 * `best approach to X` is an opinion before it is a factual lookup, and
 * `TypeScript vs Python` is a comparison before either. Testing the generic
 * shapes first would swallow both.
 */
function classifyIntent(normalized: string): Intent {
  if (contains(normalized, 'vs') || contains(normalized, 'versus')) return 'comparison'
  if (/difference between|compare|compared to/.test(normalized)) return 'comparison'
  if (/\b(best|worst|better|should i|worth it|recommend)\b/.test(normalized)) return 'opinion'
  if (/\b(list|examples? of|types? of|kinds? of)\b/.test(normalized)) return 'enumerative'
  if (contains(normalized, 'how')) return 'procedural'
  if (contains(normalized, 'why')) return 'causal'
  if (/\b(latest|recent|news|current|today)\b/.test(normalized)) return 'temporal'
  return 'factual'
}

/* -------------------------------------------------------------------------- */
/* §45.6 — material ambiguity                                                 */
/* -------------------------------------------------------------------------- */

interface AmbiguousTerm {
  readings: readonly string[]
  /** Any of these appearing in the query settles it. */
  disambiguators: readonly string[]
}

/**
 * Terms whose readings are not merely different but ANSWER-CHANGING.
 *
 * The bar is deliberately high. A term with two readings that lead to the same
 * facts is not worth interrupting a user over, and a list that grows past that
 * bar turns every query into a clarification dialogue.
 */
const AMBIGUOUS: Readonly<Record<string, AmbiguousTerm>> = {
  mercury: {
    readings: ['the planet', 'the chemical element', 'the Roman god'],
    disambiguators: ['planet', 'orbit', 'solar', 'element', 'metal', 'thermometer', 'god', 'myth'],
  },
  python: {
    readings: ['the programming language', 'the snake'],
    disambiguators: ['programming', 'language', 'code', 'django', 'pip', 'snake', 'reptile', 'animal'],
  },
  java: {
    readings: ['the programming language', 'the island', 'coffee'],
    disambiguators: ['programming', 'language', 'jvm', 'island', 'indonesia', 'coffee', 'bean'],
  },
  apple: {
    readings: ['the company', 'the fruit'],
    disambiguators: ['company', 'iphone', 'mac', 'stock', 'fruit', 'orchard', 'tree', 'pie'],
  },
  amazon: {
    readings: ['the company', 'the river', 'the rainforest'],
    disambiguators: ['company', 'aws', 'shopping', 'river', 'rainforest', 'brazil', 'forest'],
  },
}

function findAmbiguities(tokens: readonly string[], normalized: string): Ambiguity[] {
  const out: Ambiguity[] = []
  for (const term of dedupe(tokens)) {
    const entry = AMBIGUOUS[term]
    if (!entry) continue
    /* Resolved by the query itself: report nothing. Surfacing an ambiguity a
       reader would not notice is how a correctness feature becomes a nuisance
       that gets switched off. */
    if (entry.disambiguators.some((d) => normalized.includes(d))) continue
    out.push({ term, readings: entry.readings, material: true })
  }
  return out
}

/* -------------------------------------------------------------------------- */
/* interpret                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Total: every input produces a value. Deterministic: the same query always
 * produces the same reading, which is what lets the cache key on it.
 */
export function interpret(query: string): SearchRequirements {
  const normalized = normalize(query)
  const tokens = tokenize(normalized)

  const refuse = (reason: NoSearchReason): SearchRequirements => ({
    query,
    normalized,
    intent: 'factual',
    entities: [],
    aspects: [],
    timeSensitivity: 'none',
    requireFresh: false,
    minSources: 0,
    requirePrimary: false,
    ambiguities: [],
    shouldSearch: false,
    noSearchReason: reason,
  })

  if (isArithmetic(normalized)) return refuse('arithmetic')
  if (tokens.length === 0) return refuse('empty')

  const content = tokens.filter((t) => !STOPWORDS.has(t))
  /* A question made entirely of stopwords still asked something. Falling back
     to the raw tokens keeps the promise that a searchable query always states
     what it needs covered, rather than searching for nothing. */
  const terms = dedupe(content.length > 0 ? content : tokens).slice(0, MAX_TERMS)

  const intent = classifyIntent(normalized)
  const sensitivity = timeSensitivity(normalized)

  return {
    query,
    normalized,
    intent,
    /* Entities and aspects are drawn from the SAME token set, so both inherit
       the substring guarantee. They differ in meaning, not in provenance:
       aspects are what an answer must cover, entities are what it is about. */
    entities: terms,
    aspects: terms,
    timeSensitivity: sensitivity,
    ...(sensitivity === 'recent' ? { maxAgeMs: RECENT_MAX_AGE_MS } : {}),
    requireFresh: sensitivity === 'realtime',
    /* §10 — a contested question cannot be settled by one source. A definition
       usually can, and demanding two would reject good answers for no gain. */
    minSources: intent === 'comparison' || intent === 'opinion' ? 2 : 1,
    /* §9 — a claim about right now, or a contested claim, needs the source that
       ORIGINATED it rather than a report about it. */
    requirePrimary: sensitivity === 'realtime' || intent === 'comparison',
    ambiguities: findAmbiguities(tokens, normalized),
    shouldSearch: true,
  }
}
