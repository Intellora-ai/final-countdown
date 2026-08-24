/**
 * SHARED LEXICAL PRIMITIVES.
 *
 * These live in one place because two subsystems having their own stopword
 * list is how two subsystems drift. Memory ranking and request reading must
 * agree on what a content word is --- when they disagree, memory retrieves
 * things the reader never considered relevant, and the disagreement is
 * invisible because both are individually correct.
 *
 * The bug that produced this file: `tokens()` did not filter stopwords, so
 * "I am preparing for the JEE exam" scored 0.2 relevance against "who won the
 * 1998 World Cup" --- entirely on the word "the". A memory system whose
 * relevance signal is function words will confidently surface anything.
 */

export const STOPWORDS: ReadonlySet<string> = new Set([
  'the', 'and', 'are', 'was', 'were', 'for', 'with', 'that', 'this', 'these',
  'those', 'you', 'your', 'yours', 'our', 'ours', 'its', 'his', 'her', 'hers',
  'their', 'theirs', 'them', 'they', 'she', 'him', 'has', 'have', 'had',
  'been', 'being', 'but', 'not', 'can', 'could', 'should', 'would', 'will',
  'shall', 'may', 'might', 'must', 'from', 'into', 'onto', 'about', 'than',
  'then', 'there', 'here', 'when', 'where', 'what', 'which', 'who', 'whom',
  'why', 'how', 'all', 'any', 'some', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'such', 'only', 'own', 'same', 'too', 'very', 'just',
  'now', 'get', 'got', 'let', 'put', 'one', 'two', 'also', 'like', 'want',
  'need', 'make', 'made', 'does', 'did', 'doing', 'done', 'please', 'thanks',
  'yes', 'yeah', 'okay', 'sure', 'well', 'still', 'even', 'ever', 'never',
  'always', 'because', 'while', 'after', 'before', 'again', 'once',
])

/**
 * Content words, lowercased, three characters or more.
 *
 * Three is the floor because two-letter tokens are almost all function words
 * ("of", "in", "it") and the ones that are not ("AI", "JS") are better caught
 * by the named-entity path, which preserves their case.
 */
export function tokens(s: string): Set<string> {
  const out = new Set<string>()
  for (const raw of s.toLowerCase().match(/[a-z0-9']{3,}/g) ?? []) {
    const word = raw.replace(/'s$/, '')
    if (!STOPWORDS.has(word)) out.add(word)
  }
  return out
}

/**
 * How much of the smaller set the two share.
 *
 * Deliberately NOT Jaccard. Jaccard divides by the union, which punishes a
 * short query for matching a long memory --- "percentages" against a
 * forty-word stored note would score near zero even though the note is exactly
 * about percentages. Dividing by the smaller set asks the question actually
 * being asked: is the smaller thing contained in the larger one?
 */
export function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let hits = 0
  for (const t of a) if (b.has(t)) hits++
  return hits / Math.min(a.size, b.size)
}

/** Set difference, for removing a category of word before comparing. */
export function without(a: ReadonlySet<string>, b: ReadonlySet<string>): Set<string> {
  const out = new Set<string>()
  for (const t of a) if (!b.has(t)) out.add(t)
  return out
}
