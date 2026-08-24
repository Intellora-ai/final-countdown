/**
 * HOW GOOD WAS THE RETRIEVAL — measured, and only where measurement is honest.
 *
 * WHY THESE RETURN UNDEFINED SO OFTEN
 * -----------------------------------
 * Every measure here has an input for which it has no answer: precision with
 * nothing retrieved, recall with nothing relevant to find, coverage with no
 * aspects named. The tempting move is to return 0 or 1 and keep the
 * dashboard tidy. Both lie in a specific direction — 1 makes an empty
 * benchmark look solved, 0 makes a working search look broken — and the lie
 * survives because a number looks like a measurement. `undefined` is the
 * honest answer to "we did not measure this", and it is visibly different
 * from a bad score.
 *
 * WHY THERE IS NO OVERALL NUMBER
 * ------------------------------
 * Precision, recall, coverage and independence trade against each other.
 * Averaging them produces a figure that moves for reasons nobody can name and
 * that everybody quotes. The report exposes the parts; combining them is a
 * decision that belongs to whoever knows what the search was for.
 *
 * WHY INDEPENDENCE IS IN HERE AT ALL
 * ----------------------------------
 * Ten pages carrying one wire story are one piece of evidence, not ten.
 * Anything that counts sources to decide confidence is wrong by an order of
 * magnitude unless something collapses the copies first — and syndication is
 * rarely byte-identical, so exact matching does not do it.
 */

/* -------------------------------------------------------------------------- */
/* Ratios                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Fraction of returned results that were relevant.
 *
 * `judged` is one boolean per returned result, in any order — the caller has
 * already decided relevance, because that decision needs the question and
 * this function does not have it.
 */
export function precision(judged: readonly boolean[]): number | undefined {
  if (!judged.length) return undefined
  return judged.filter(Boolean).length / judged.length
}

/**
 * Fraction of the relevant documents that were actually found.
 *
 * Needs a denominator from outside — a labelled corpus, or a human count.
 * There is no way to compute "how much exists that we missed" from the
 * results alone, and a function that pretended otherwise would be measuring
 * its own output.
 */
export function recall(relevantFound: number, relevantTotal: number): number | undefined {
  if (!Number.isFinite(relevantFound) || !Number.isFinite(relevantTotal)) return undefined
  if (relevantFound < 0 || relevantTotal <= 0) return undefined
  /* More found than exist means the labels disagree with each other. That is
     a bug to fix, not a score above 1 to display. */
  if (relevantFound > relevantTotal) return undefined
  return relevantFound / relevantTotal
}

const normalise = (s: string) => s.trim().toLowerCase()

/**
 * Fraction of the aspects the QUESTION named that some source addressed.
 *
 * Deliberately about the question rather than the documents: ten thorough
 * pages on an adjacent topic cover nothing, and a measure computed from what
 * was retrieved would score them highly.
 */
export function coverage(
  aspectsCovered: readonly string[],
  aspectsRequired: readonly string[],
): number | undefined {
  const required = new Set(aspectsRequired.map(normalise).filter(Boolean))
  if (!required.size) return undefined
  const covered = new Set(aspectsCovered.map(normalise).filter((a) => required.has(a)))
  return covered.size / required.size
}

/* -------------------------------------------------------------------------- */
/* Independence                                                               */
/* -------------------------------------------------------------------------- */

export interface SourceText {
  url: string
  text: string
}

export interface SourceGroup {
  /** Every source judged to be the same voice. */
  members: readonly SourceText[]
  why: 'same-host' | 'near-duplicate-text'
}

/** Registrable-ish host, lowercased. Empty string when the URL is unparseable. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

/** Content words, deduplicated — the shape of a document, not its wording. */
function shingles(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9%.\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  )
}

/** Jaccard overlap of two token sets. */
function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const token of a) if (b.has(token)) shared += 1
  return shared / (a.size + b.size - shared)
}

/**
 * Above this overlap, two documents are the same story.
 *
 * Chosen to catch syndication, which shares nearly all of its content words
 * and differs by a dateline or a house-style edit, while leaving two
 * independent reports of the same event apart — those share the entities and
 * the numbers but very little else.
 */
const SAME_STORY = 0.7

/**
 * Collapse sources that are not independent of each other.
 *
 * Two reasons to merge, and they are reported separately because they mean
 * different things: same host is one publisher agreeing with itself, and
 * near-duplicate text is one story appearing in several places.
 */
export function independentSources(sources: readonly SourceText[]): SourceGroup[] {
  const groups: { members: SourceText[]; host: string; tokens: Set<string>; why: SourceGroup['why'] }[] =
    []

  for (const source of sources) {
    const host = hostOf(source.url)
    const tokens = shingles(source.text)

    const existing = groups.find(
      (g) =>
        (host !== '' && g.host === host) ||
        similarity(g.tokens, tokens) >= SAME_STORY,
    )

    if (existing) {
      existing.members.push(source)
      if (host !== '' && existing.host === host) existing.why = 'same-host'
      continue
    }
    groups.push({ members: [source], host, tokens, why: 'near-duplicate-text' })
  }

  return groups.map((g) => ({ members: g.members, why: g.why }))
}

/* -------------------------------------------------------------------------- */
/* Citation support                                                           */
/* -------------------------------------------------------------------------- */

/** Numbers, percentages and currency amounts — the parts a source must carry. */
const FIGURES = /\d+(?:[.,]\d+)*\s*%?/g

/**
 * Whether the cited text actually supports the claim.
 *
 * Checks the load-bearing parts rather than the wording: every FIGURE in the
 * claim must appear in the source, and the claim's distinctive content words
 * must substantially appear too. Paraphrase passes; a swapped number does not.
 *
 * A claim with nothing checkable in it — "this is significant" — returns
 * FALSE rather than true. It cannot be supported by any source, and passing
 * it would let exactly the vaguest claims through the one gate meant to
 * catch them.
 */
export function citationSupports(claim: string, sourceText: string): boolean {
  if (!claim.trim() || !sourceText.trim()) return false

  const source = sourceText.toLowerCase()
  const figures = claim.match(FIGURES) ?? []
  for (const figure of figures) {
    if (!source.includes(figure.toLowerCase().replace(/\s+/g, ''))
        && !source.includes(figure.toLowerCase())) {
      return false
    }
  }

  const claimTokens = [...shingles(claim)].filter((t) => !STOPWORDS.has(t))
  if (!claimTokens.length) return false

  const present = claimTokens.filter((t) => source.includes(t)).length
  const ratio = present / claimTokens.length

  /* Both conditions matter. Figures alone would accept "6.1%" cited to a page
     that happens to mention 6.1% about something unrelated; words alone would
     accept a claim whose number was changed. */
  return figures.length > 0 ? ratio >= 0.5 : ratio >= 0.8
}

/**
 * Words that carry no evidential weight.
 *
 * Kept short on purpose. A long stoplist starts removing words that ARE the
 * claim — "may", "up to", "estimated" — and those are precisely the ones the
 * extractor works to preserve.
 */
const STOPWORDS = new Set([
  'the', 'was', 'were', 'and', 'for', 'that', 'this', 'with', 'from', 'has',
  'had', 'are', 'its', 'his', 'her', 'their', 'been', 'being', 'into', 'than',
  'then', 'they', 'there', 'here', 'what', 'which', 'who', 'whom', 'you',
  'significant', 'important', 'notable', 'considerable', 'substantial',
])

/* -------------------------------------------------------------------------- */
/* Report                                                                     */
/* -------------------------------------------------------------------------- */

export interface RetrievalInput {
  judged: readonly boolean[]
  relevantFound: number
  relevantTotal: number
  aspectsCovered: readonly string[]
  aspectsRequired: readonly string[]
  sources: readonly SourceText[]
}

export interface RetrievalReport {
  precision?: number
  recall?: number
  coverage?: number
  /** Distinct voices, after copies and same-publisher pages are collapsed. */
  independentSources: number
  /** Raw count, kept beside the collapsed one so the gap is visible. */
  retrievedSources: number
}

/**
 * Every measure, side by side, with no combined figure.
 *
 * `retrievedSources` sits next to `independentSources` deliberately: the
 * distance between them is the number a confidence estimate would have got
 * wrong, and showing only the collapsed count hides that it was ever a
 * question.
 */
export function retrievalReport(input: RetrievalInput): RetrievalReport {
  const p = precision(input.judged)
  const r = recall(input.relevantFound, input.relevantTotal)
  const c = coverage(input.aspectsCovered, input.aspectsRequired)

  return {
    ...(p === undefined ? {} : { precision: p }),
    ...(r === undefined ? {} : { recall: r }),
    ...(c === undefined ? {} : { coverage: c }),
    independentSources: independentSources(input.sources).length,
    retrievedSources: input.sources.length,
  }
}
