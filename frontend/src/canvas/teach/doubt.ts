import type { Payload } from '../spec/figure'
import type { Block, Lesson } from '../spec/spec'
import { validateLesson } from '../spec/validate'
import type { Doubt, DoubtResolver, Resolution } from './contract'
import { deriveBeats } from './beats'

/**
 * Answering a doubt out of the lesson the learner is already looking at.
 *
 * THERE IS NO MODEL BEHIND THIS, AND THE DESIGN ADMITS IT
 * ------------------------------------------------------
 * Nothing here composes an explanation. Every answer is material the author
 * already wrote — a block, a caption, two rows of a table — found, cut out and
 * re-presented on its own. The only words this file contributes are column
 * headings and the sentence in a refusal. That boundary is the whole safety
 * argument: a resolver that cannot write a sentence about the subject matter
 * cannot write a wrong one.
 *
 * WHICH IS WHY REFUSING IS THE COMMON CASE, NOT THE ERROR CASE
 * -----------------------------------------------------------
 * A learner who has just admitted confusion is the worst possible audience for
 * a confident guess. So the matcher is built to say no: a doubt has to NAME
 * something the lesson names, by enough of its words that the match is not a
 * coincidence. "What does precision mean" is answered inside the classifier
 * lesson, where an axis is literally labelled Precision, and refused inside the
 * gas lesson, where the only overlap is the word "mean" inside "Mean particle
 * speed" — a match that would have produced a confident answer about the wrong
 * thing.
 *
 * THE ANSWER IS RARELY PROSE
 * --------------------------
 * `Resolution` carries a `Lesson`, so an answer can be any representation the
 * engine renders. Asked about a chart, this returns the chart. Asked to compare
 * two labels inside one chart, it returns a two-row table — the comparison the
 * chart was showing only implicitly. Prose appears only where the author wrote
 * prose: a caption, promoted so the sentence they already wrote becomes the
 * explanation.
 *
 * WHAT `atBeatId` IS NOT USED FOR
 * -------------------------------
 * The resolver is handed a `Lesson`, not the `Beats`, so it cannot tell which
 * blocks the learner has already been shown. Guessing would mean either
 * spoiling later material or refusing a question the lesson plainly answers.
 * The position is carried on the `Doubt` so that answering cannot advance the
 * lesson; that job is done by the type, not by this file.
 */

/* -------------------------------------------------------------------------- */
/* Words                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Function words, meta-requests and comparison markers.
 *
 * Three groups, and the third is the one worth explaining. "vs", "difference"
 * and "between" MARK a comparison; they are never the thing being compared. If
 * they survived into the matching tokens, "difference between X and Y" would
 * score against any block that happened to contain the word "difference".
 * They are still read from the raw words before this list is applied, because
 * that is exactly how the comparison strategy finds its two sides.
 */
const STOPWORDS = new Set([
  // Function and question words.
  'a', 'all', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'both', 'but', 'by',
  'can', 'could', 'each', 'even', 'every', 'only', 'very',
  'did', 'do', 'does', 'doesnt', 'doing', 'dont', 'for', 'from', 'had', 'has',
  'have', 'how', 'if', 'in', 'into', 'is', 'it', 'its', 'me', 'my', 'not', 'of',
  'on', 'or', 'our', 'out', 'shall', 'should', 'so', 'than', 'that', 'thats',
  'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those',
  'to', 'us', 'was', 'were', 'what', 'whats', 'when', 'where', 'which', 'while',
  'who', 'whom', 'why', 'will', 'with', 'would', 'you', 'your', 'yours',
  // The learner talking to the software rather than about the lesson.
  'about', 'again', 'also', 'any', 'ask', 'because', 'explain', 'get', 'got',
  'help', 'here', 'just', 'know', 'like', 'more', 'much', 'need', 'no', 'okay',
  'one', 'please', 'really', 'see', 'show', 'sorry', 'still', 'sure', 'tell',
  'thanks', 'think', 'understand', 'want', 'well', 'yes',
  // Chat shorthand. A learner types the way they text, and these carry no
  // subject at all. "wdym" reaching a search engine is the difference between
  // three real articles and none -- measured; see `webResolver.test.ts`.
  'wdym', 'idk', 'pls', 'plz', 'thx', 'ur', 'u', 'im', 'ive', 'dont', 'cant',
  'whats', 'hows', 'whys', 'lol', 'ok', 'oh', 'hmm', 'wait',
  // Light verbs and particles: they carry the sentence, never the subject.
  // "go up", "make", "take", "the way it works" — a lesson labelled "Change"
  // must not be pulled up by the "go" in "why does the pressure go up".
  'come', 'comes', 'go', 'goes', 'going', 'look', 'looks', 'make', 'makes',
  'put', 'say', 'says', 'take', 'takes', 'thing', 'things', 'up', 'down',
  'use', 'used', 'using', 'way', 'ways',
  // Comparison markers. See the note above.
  'vs', 'versus', 'compare', 'comparison', 'difference', 'differences', 'between',
])

/**
 * One-character tokens are dropped.
 *
 * They are units and stray letters — the "K" of "At 300 K", the "m" and "s" of
 * "(m/s)", the "n" of "n = 1 mol". Keeping them makes a name look longer than
 * it is, which drags its coverage down and hides a match the learner did make.
 */
const MIN_TOKEN_LENGTH = 2

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
}

/**
 * Words worth matching on, deduplicated, in the order they were written.
 *
 * Exported because the web rung needs exactly this list. A learner's question
 * carries filler that a search engine does not merely ignore -- it matches on
 * it. Measured against the live API: "can you explain photosynthesis to me
 * please" returns an article about a skateboarder, while "photosynthesis"
 * returns the right one. A second, private copy of this vocabulary in
 * `webResolver.ts` would drift, and the drift would show up as wrong answers
 * carrying citations.
 */
export function contentTokens(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const word of words(text)) {
    if (word.length < MIN_TOKEN_LENGTH || STOPWORDS.has(word)) continue
    if (seen.has(word)) continue
    seen.add(word)
    out.push(word)
  }
  return out
}

/**
 * The forms of a name a learner might have typed.
 *
 * Always the name itself; and where it carries a parenthesised unit, the name
 * without it. Nobody types "pressure kpa" — they type "pressure" — and
 * "Pressure (kPa)" would otherwise be a two-word name that a one-word question
 * can never reach.
 */
function tokenVariants(text: string): string[][] {
  const full = contentTokens(text)
  if (full.length === 0) return []
  if (!text.includes('(')) return [full]

  const bare = contentTokens(text.replace(/\([^)]*\)/g, ' '))
  if (bare.length === 0 || bare.length >= full.length) return [full]
  return [full, bare]
}

/* -------------------------------------------------------------------------- */
/* The matching rule                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Half of a name's words must be words the learner typed.
 *
 * THE THRESHOLD, AND WHAT IT IS PROTECTING AGAINST ON EACH SIDE
 * ------------------------------------------------------------
 * LOOSER than this — accept any single overlapping word — and "what does
 * precision mean" matches "Mean particle speed (m/s)" in a physics lesson on
 * the word "mean" alone, then answers a question about precision with a row
 * about particle speed. A confident answer about the wrong thing is the exact
 * failure this file exists to prevent.
 *
 * STRICTER than this — require every word of the name — and "where do the
 * errors fall" misses the block titled "Where the errors actually fall",
 * because the learner did not type "actually". The lesson visibly contains the
 * answer and the software refuses it, which teaches the learner to phrase
 * questions for the machine.
 *
 * A one-word name is exempt from the fraction and needs only to have been
 * typed: "Precision", "Rotational", "Fraudulent" are already as specific as
 * they get, and there is no second word to require.
 *
 * Returns how many of the name's words were typed; 0 means no match.
 *
 * THERE IS NO `if (matched === 0) return 0` GUARD, AND THAT IS DELIBERATE.
 * It used to sit above the one-word case and it was dead code: every path
 * below already returns 0 when nothing matched. A one-word name returns
 * `matched`, which IS 0; a longer name fails `matched >= 2` and falls through
 * to `return 0`. Checked exhaustively over every reachable
 * (nameTokens.length, matched) pair for lengths 0..40 — 861 pairs, zero
 * differences with the guard and without it.
 *
 * That made it an EQUIVALENT MUTANT: deleting it could never turn a test red,
 * so it depressed the mutation score while protecting nothing. The honest fix
 * for an equivalent mutant is to remove the branch, not to invent a test that
 * cannot fail. Do not add it back.
 */
/**
 * Exported because the web rung shares this threshold, and only this threshold.
 *
 * `webResolver` asks the mirrored question — does this fetched PAGE cover the
 * words the learner typed — and a second `0.5` written down over there would be
 * two numbers meaning one decision, free to stop agreeing. What it does NOT
 * share is the `matched >= 2` clause below, and the reason it does not is
 * written where it is not shared: see `isAbout` in `webResolver.ts`.
 */
export const HALF = 0.5


function accepts(nameTokens: readonly string[], typed: ReadonlySet<string>): number {
  let matched = 0
  for (const token of nameTokens) if (typed.has(token)) matched += 1
  if (nameTokens.length === 1) return matched
  if (matched >= 2 && matched / nameTokens.length >= HALF) return matched
  return 0
}

/** True when any spelling of this name clears the rule above. */
function labelMatches(text: string, typed: ReadonlySet<string>): boolean {
  return tokenVariants(text).some((tokens) => accepts(tokens, typed) > 0)
}

/* -------------------------------------------------------------------------- */
/* What a lesson names                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A place where the lesson names something the learner could ask about.
 *
 * Titles and labels only — never a caption or a body. A caption is a sentence
 * ABOUT the thing; matching against sentences would mean any question sharing
 * two common words with a paragraph gets an answer. Captions are indexed
 * separately, and only for deciding what to offer as "did you mean".
 */
interface Mention {
  blockId: string
  blockIndex: number
  role: 'title' | 'label'
  /** Exactly as the lesson writes it, so an answer can quote it back. */
  text: string
  tokens: string[]
}

/**
 * The prose a block carries about itself: its caption, or its body.
 *
 * Matched by a different rule from a name, and only after every name has
 * failed. A caption is a sentence, so asking what fraction of it the learner
 * typed is meaningless — a good question will always be a small fraction of a
 * long sentence. What matters instead is the other direction: how much of what
 * the LEARNER said this sentence accounts for.
 */
interface Sentence {
  blockId: string
  blockIndex: number
  tokens: Set<string>
}

interface Indexed {
  mentions: Mention[]
  sentences: Sentence[]
  /** The lesson's own question, which is the one doubt it certainly answers. */
  question: Set<string>
  /** Every word each block uses anywhere, captions and bodies included. */
  vocabulary: Map<string, Set<string>>
  /**
   * For each block, the words the block says something ABOUT — its title, the
   * representation it declares itself to be, its caption, its body, and the
   * row names of any table that explains them (see `glossaryNames`).
   *
   * This is a NARROWER set than `vocabulary`, and the narrowing is the whole
   * point. A bare label is a name painted on one part of the block and nothing
   * more; every source above is the author putting words to a name. Only
   * `answersADefinition` reads this, and the distinction is the one thing it
   * decides on.
   */
  describes: Map<string, Set<string>>
  /** The union of all of it — the lesson's whole vocabulary. */
  known: Set<string>
}

type Column = { key: string; label: string; type: 'text' | 'number' | 'percent' | 'currency' }
type Row = Record<string, string | number | null>

/** The first text cell of a row, which is what a table calls that row. */
function firstTextCell(row: Row, columns: readonly Column[]): string | null {
  for (const column of columns) {
    if (column.type !== 'text') continue
    const value = row[column.key]
    if (typeof value === 'string' && value.trim().length > 0) return value
  }
  return null
}

/**
 * Rows and columns of whichever of the two tabular block kinds this is.
 *
 * Up here beside `firstTextCell` because two very different readers need it:
 * `glossaryNames` below asks what a table DEFINES, and `buildComparison` far
 * below asks which two of its rows the learner named. One accessor, so the two
 * can never disagree about what counts as a table.
 */
function tableOf(block: Block): { columns: Column[]; rows: Row[] } | null {
  if (block.kind === 'table') return { columns: block.columns, rows: block.rows }
  if (block.kind === 'figure' && block.data.shape === 'tabular')
    return { columns: block.data.columns, rows: block.data.rows }
  return null
}

function captionOf(block: Block): string | undefined {
  return 'caption' in block ? block.caption : undefined
}

function bodyOf(block: Block): string | undefined {
  return block.kind === 'prose' || block.kind === 'callout' ? block.body : undefined
}

/**
 * The representation's own name, spaced out, and only when it is more than one
 * word.
 *
 * "confusionMatrix" and "precisionRecall" are things a lesson is teaching and a
 * learner will type them. "line", "bar" and "table" are drawing words that
 * would match half the questions ever asked.
 *
 * ONE COPY, READ TWICE. `mentionsOf` uses it to decide what can be MATCHED;
 * `buildIndex` uses it to decide what a block SAYS ABOUT ITSELF. Those are two
 * different decisions and they must agree on which names are real, or a doubt
 * could match a name that the same block is then judged never to have used.
 */
function representationName(block: Block): string | null {
  if (block.kind !== 'figure') return null
  const spaced = block.as.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  return spaced.includes(' ') ? spaced : null
}

/**
 * The row names of a table that says, in words, what each of those names IS.
 *
 * WHY A TABLE ROW IS NOT JUST ANOTHER LABEL
 * -----------------------------------------
 * `describes` exists to separate a block that EXPLAINS a term from a block that
 * merely has the term painted on one of its parts -- see `answersADefinition`.
 * A flow node, a pie slice and an axis tick are all the second kind: the label
 * stands alone and the block says nothing further about it, so handing the
 * block back to a learner who asked what the word means returns her own screen.
 *
 * A table row is the first kind, and it is the one shape of "label" that is.
 * The naming cell is a term and the cells beside it are the author's own words
 * about that term, written in the same row precisely so the two are read
 * together. `Base | 2 | the number doing the multiplying` is a definition of
 * "base" in the only form a table has; refusing "what is the base" on the
 * lesson whose job is to name the parts of a logarithm is the exact failure
 * `answersADefinition` was written to prevent, pointed the wrong way.
 *
 * MEASURED, on `logarithms`, before this existed: "what is the base" and "what
 * is the argument" -- two of the three parts the lesson exists to name -- both
 * came back as refusals offering `the-parts` as somewhere to look, while
 * `the-parts` is the block that answers them.
 *
 * WHAT KEEPS IT FROM BEING EVERY TABLE. The row has to say something the name
 * does not already say. Concretely: some other TEXT cell in the same row whose
 * content words are not already inside the name.
 *
 *   the-parts     Base | 2 | "the number doing the multiplying"     -> defines
 *   what-changes  Pressure (kPa) | 103.9 | 207.9 | 100              -> measures
 *   chambers      Ordinary bills | Yes | Yes                        -> tabulates
 *   three-at-once log3 81 = 4 | "3^4 = 81"                          -> restates
 *
 * Only the first gains the learner a word. A number is a measurement of the
 * thing, "Yes" is an answer about it, and a restatement is the same fact in
 * other notation -- none of the three is anybody saying what the thing IS. That
 * is why the test is content words rather than a non-empty cell: `2` and `Yes`
 * carry none (`yes` is a stopword, `2` is below `MIN_TOKEN_LENGTH`), and
 * `3^4 = 81` carries only `81`, which the name `log3 81 = 4` already contains.
 *
 * PER ROW, NOT PER TABLE. `chambers` above is not excluded -- its `Ordinary
 * bills` row is. The row two down reads `Term | 5 years | Permanent, 1/3 retire
 * every 2 years`, which does say what the term of each House is, and that one
 * counts. A table is free to explain some of its rows and merely tabulate the
 * rest, and the author decided that one row at a time.
 */
function glossaryNames(block: Block): string[] {
  const table = tableOf(block)
  if (!table) return []

  const out: string[] = []
  for (const row of table.rows) {
    const name = firstTextCell(row, table.columns)
    if (!name) continue
    const inTheName = new Set(contentTokens(name))

    /* The same two guards `firstTextCell` uses to pick the name, and for the
       same reason: a term and the author's words about it are both TEXT cells.
       A number, a percent or a currency beside the name is a measurement of the
       thing, and a measurement is not a definition however many digits it has.

       No `said.length > 0` in front of the `.some`: `[].some` is already false,
       so the guard could never change an outcome. */
    const explained = table.columns.some((column) => {
      if (column.type !== 'text') return false
      const value = row[column.key]
      if (typeof value !== 'string') return false
      return contentTokens(value).some((token) => !inTheName.has(token))
    })
    if (explained) out.push(name)
  }
  return out
}

function payloadLabels(data: Payload, add: (text: string) => void): void {
  switch (data.shape) {
    case 'series':
      if (data.xLabel) add(data.xLabel)
      if (data.yLabel) add(data.yLabel)
      for (const series of data.series) {
        add(series.name)
        for (const point of series.points) if (typeof point.x === 'string') add(point.x)
      }
      break
    case 'distribution':
      for (const group of data.groups) add(group.name)
      break
    case 'parts':
      for (const part of data.parts) add(part.label)
      break
    case 'matrix':
      for (const row of data.rows) add(row)
      for (const column of data.columns) add(column)
      break
    case 'graph':
      for (const node of data.nodes) add(node.label)
      for (const edge of data.edges) if (edge.label) add(edge.label)
      break
    case 'hierarchy':
      for (const node of data.nodes) add(node.label)
      break
    case 'flowWeighted':
      for (const node of data.nodes) add(node.label)
      break
    case 'intervals':
      for (const item of data.items) add(item.label)
      break
    case 'process':
      for (const step of data.steps) add(step.label)
      for (const transition of data.transitions) if (transition.label) add(transition.label)
      break
    case 'logic':
      for (const input of data.inputs ?? []) add(input)
      for (const step of data.steps ?? []) add(step.statement)
      break
    case 'tabular':
      for (const column of data.columns) add(column.label)
      for (const row of data.rows) {
        const name = firstTextCell(row, data.columns)
        if (name) add(name)
      }
      break
    case 'geometry':
      for (const element of data.elements) add(element.label)
      break
  }
}

function mentionsOf(block: Block, blockIndex: number, out: Mention[]): void {
  const push = (role: 'title' | 'label', text: string): void => {
    for (const tokens of tokenVariants(text)) {
      out.push({ blockId: block.id, blockIndex, role, text: text.trim(), tokens })
    }
  }
  const add = (text: string): void => push('label', text)

  if (block.title) push('title', block.title)

  switch (block.kind) {
    case 'prose':
    case 'callout':
    case 'metric':
      break
    case 'equation':
      /* A highlighted term is the author saying "this is the bit that matters",
         which makes it the most likely thing to be asked about. */
      for (const term of block.highlight) add(term)
      break
    case 'table':
      for (const column of block.columns) add(column.label)
      for (const row of block.rows) {
        const name = firstTextCell(row, block.columns)
        if (name) add(name)
      }
      break
    case 'chart':
      if (block.xLabel) add(block.xLabel)
      if (block.yLabel) add(block.yLabel)
      if (block.annotate) add(block.annotate.label)
      for (const series of block.series) {
        add(series.name)
        for (const point of series.points) if (typeof point.x === 'string') add(point.x)
      }
      break
    case 'flow':
      for (const node of block.nodes) add(node.label)
      for (const link of block.links) if (link.label) add(link.label)
      break
    case 'simulation':
      for (const control of block.controls) add(control.label)
      for (const readout of block.readouts) add(readout)
      break
    case 'figure': {
      /* See `representationName` for why a one-word `as` is not a name. */
      const named = representationName(block)
      if (named) add(named)
      payloadLabels(block.data, add)
      break
    }
  }
}

function buildIndex(lesson: Lesson): Indexed {
  const mentions: Mention[] = []
  const sentences: Sentence[] = []
  const vocabulary = new Map<string, Set<string>>()
  const describes = new Map<string, Set<string>>()
  const known = new Set<string>()

  lesson.blocks.forEach((block, blockIndex) => {
    const before = mentions.length
    mentionsOf(block, blockIndex, mentions)

    const vocab = new Set<string>()
    for (let i = before; i < mentions.length; i += 1) {
      for (const token of mentions[i]?.tokens ?? []) vocab.add(token)
    }

    const prose = new Set<string>()
    for (const token of contentTokens(captionOf(block) ?? '')) prose.add(token)
    for (const token of contentTokens(bodyOf(block) ?? '')) prose.add(token)
    if (prose.size > 0) sentences.push({ blockId: block.id, blockIndex, tokens: prose })

    /* What the block puts words to: its title, the representation it declares
       itself to be, the prose it carries, and any table row it explains in
       words. A node label, a pie slice and an axis tick name PARTS and stop
       there -- the block never says what they are.

       A COPY, and the two extra sources go on the copy only. `sentences` above
       holds `prose` by reference and must never gain a title: the sentence rule
       is far looser than the name rule, and letting it reach titles would undo
       the ordering in `resolve` that keeps a name match ahead of a caption. */
    const said = new Set(prose)
    for (const token of contentTokens(block.title ?? '')) said.add(token)
    for (const token of contentTokens(representationName(block) ?? '')) said.add(token)
    for (const name of glossaryNames(block))
      for (const token of contentTokens(name)) said.add(token)
    describes.set(block.id, said)

    for (const token of prose) vocab.add(token)
    vocabulary.set(block.id, vocab)
    for (const token of vocab) known.add(token)
  })

  return {
    mentions,
    sentences,
    question: new Set(contentTokens(lesson.question)),
    vocabulary,
    describes,
    known,
  }
}

/* -------------------------------------------------------------------------- */
/* Ranking                                                                    */
/* -------------------------------------------------------------------------- */

interface Match {
  mention: Mention
  matched: number
  coverage: number
}

/**
 * The best-named thing in the lesson, or nothing.
 *
 * Every tie-break is total and content-based, so the same doubt always lands on
 * the same block. Most of the learner's words accounted for wins first — a
 * doubt naming two of a title's words means more than one naming one word of a
 * shorter label. A title beats an inner label at equal score because a title is
 * the block's own claim about itself. Position is the last resort, and the
 * honest reading of it is: when several blocks name the same thing, this picks
 * the first and has no way to know which the learner meant.
 */
function bestMatch(mentions: readonly Mention[], typed: ReadonlySet<string>): Match | null {
  const scored: Match[] = []
  for (const mention of mentions) {
    const matched = accepts(mention.tokens, typed)
    if (matched > 0) scored.push({ mention, matched, coverage: matched / mention.tokens.length })
  }
  if (scored.length === 0) return null

  scored.sort((a, b) => {
    if (a.matched !== b.matched) return b.matched - a.matched
    if (a.coverage !== b.coverage) return b.coverage - a.coverage
    const rank = (m: Match): number => (m.mention.role === 'title' ? 0 : 1)
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    if (a.mention.blockIndex !== b.mention.blockIndex)
      return a.mention.blockIndex - b.mention.blockIndex
    return a.mention.text < b.mention.text ? -1 : a.mention.text > b.mention.text ? 1 : 0
  })

  return scored[0] ?? null
}

/**
 * The rule for matching a sentence rather than a name.
 *
 * Measured against what the LEARNER typed, not against the sentence: two of
 * their words, and at least half of them. "Why do the two curves cross" puts
 * all three of its words into one caption — "The two curves cross near 0.45" —
 * and that caption is the answer, written by the author, about that block.
 *
 * The floor of two is what keeps it from being a search box. One shared word
 * with a paragraph is a coincidence; "explain how cross validation works" finds
 * the word "cross" in exactly that caption and must still be refused, because
 * the lesson has nothing whatever to say about cross validation.
 */
const HALF_OF_DOUBT = 0.5
const MIN_SENTENCE_WORDS = 2

function acceptsSentence(tokens: ReadonlySet<string>, typed: ReadonlySet<string>): number {
  let matched = 0
  for (const token of typed) if (tokens.has(token)) matched += 1
  if (matched < MIN_SENTENCE_WORDS) return 0
  if (matched / typed.size < HALF_OF_DOUBT) return 0
  return matched
}

function bestSentence(sentences: readonly Sentence[], typed: ReadonlySet<string>): Sentence | null {
  let best: Sentence | null = null
  let bestScore = 0
  for (const sentence of sentences) {
    const score = acceptsSentence(sentence.tokens, typed)
    // Strictly greater, so the earliest block wins a tie. Deterministic.
    if (score > bestScore) {
      best = sentence
      bestScore = score
    }
  }
  return best
}

/**
 * One matched word, and another word the lesson has never heard of.
 *
 * That combination is a coincidence wearing the shape of an answer. "How does
 * humidity change this" hits the single-word column heading "Change" in a
 * physics lesson that says nothing about humidity, and would come back as a
 * confident table of pressures. The word the learner actually asked about is
 * the one the lesson does not contain, and that is the word that decides.
 *
 * It only applies to a one-word match. Two matched words are already too much
 * to be an accident.
 */
function isGuess(best: Match, typed: ReadonlySet<string>, known: ReadonlySet<string>): boolean {
  if (best.matched >= MIN_SENTENCE_WORDS) return false
  for (const token of typed) if (!known.has(token)) return true
  return false
}

/* -------------------------------------------------------------------------- */
/* Building the answer                                                        */
/* -------------------------------------------------------------------------- */

const MAX_QUESTION = 200
const MAX_LABEL = 120
const MAX_ID = 64

function clamp(text: string, limit: number): string {
  return text.length > limit ? text.slice(0, limit) : text
}

function makeId(parts: readonly string[]): string {
  return clamp(['doubt', ...parts].join('-'), MAX_ID)
}

/**
 * A block of the original lesson, on its own.
 *
 * The caption comes off here and goes back on as prose, so the sentence the
 * author already wrote becomes the explanation rather than a footnote under a
 * picture the learner is looking at because they did not understand it.
 * `emphasis` is a semantic role, and in an answer of one block that block is
 * the point — this is the resolver authoring its own small lesson, not
 * restyling somebody else's.
 */
function represent(
  block: Block,
  emphasis: 'primary' | 'supporting',
  keepCaption = false,
): Record<string, unknown> {
  const copy: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(block)) {
    if (key === 'caption' && !keepCaption) continue
    copy[key] = value
  }
  copy.emphasis = emphasis
  return copy
}

function captionNote(block: Block): Record<string, unknown> | null {
  const caption = captionOf(block)
  if (!caption) return null
  return {
    id: clamp(`${block.id}-note`, MAX_ID),
    kind: 'prose',
    body: caption,
    emphasis: 'supporting',
    tone: 'neutral',
  }
}

/**
 * The only way a `Lesson` leaves this file.
 *
 * Answers go through the same gate as authored lessons — no hand-built object
 * is cast into shape. A null return means the construction above was wrong,
 * and the strategy that asked for it falls through to the next one and
 * eventually to a refusal. That is deliberate: a broken answer must never
 * reach a learner, and every strategy has a test asserting it produces one, so
 * a construction bug surfaces in CI as a refusal rather than in the interface
 * as a crash.
 */
function buildAnswer(
  idParts: readonly string[],
  question: string,
  blocks: readonly unknown[],
  relations: readonly unknown[],
): Lesson | null {
  const result = validateLesson({
    id: makeId(idParts),
    question: clamp(question.trim(), MAX_QUESTION),
    blocks,
    relations,
  }, { teaching: 'answer' })
  return result.ok ? result.lesson : null
}

/* -------------------------------------------------------------------------- */
/* Strategy: compare two things the lesson already lists                      */
/* -------------------------------------------------------------------------- */

/**
 * The two sides of a comparison, as the learner wrote them.
 *
 * Read from the RAW words, before stopwords are removed, because the markers
 * that separate the sides are themselves stopwords. Only three phrasings are
 * recognised, and each needs an explicit marker — inferring a comparison from a
 * bare "and" would turn "pressure and temperature" into a demand for a table
 * when the learner was asking about the relationship between them.
 */
function comparisonSides(raw: readonly string[]): [Set<string>, Set<string>] | null {
  const split = (left: readonly string[], right: readonly string[]): [Set<string>, Set<string>] | null => {
    const a = new Set(contentTokens(left.join(' ')))
    const b = new Set(contentTokens(right.join(' ')))
    if (a.size === 0 || b.size === 0) return null
    return [a, b]
  }

  const marker = raw.findIndex((w) => w === 'vs' || w === 'versus')
  if (marker > 0 && marker < raw.length - 1) {
    const found = split(raw.slice(0, marker), raw.slice(marker + 1))
    if (found) return found
  }

  const between = raw.indexOf('between')
  if (between >= 0 && raw.slice(0, between).some((w) => w === 'difference' || w === 'differences')) {
    const after = raw.slice(between + 1)
    const joiner = after.indexOf('and')
    if (joiner > 0 && joiner < after.length - 1) {
      const found = split(after.slice(0, joiner), after.slice(joiner + 1))
      if (found) return found
    }
  }

  const compare = raw.indexOf('compare')
  if (compare >= 0) {
    const after = raw.slice(compare + 1)
    const joiner = after.findIndex((w) => w === 'and' || w === 'with' || w === 'to' || w === 'against')
    if (joiner > 0 && joiner < after.length - 1) {
      const found = split(after.slice(0, joiner), after.slice(joiner + 1))
      if (found) return found
    }
  }

  return null
}

/** A label with a number attached — the only kind a two-row table can hold. */
interface Valued {
  text: string
  value: number
}

interface ValueSource {
  pairs: Valued[]
  nameLabel: string
  valueLabel: string
}

/**
 * Labelled values inside one block.
 *
 * One series only. With two series a label carries two numbers and the table
 * would have to pick one, which is inventing a claim the block never made.
 */
function valuesOf(block: Block): ValueSource | null {
  if (block.kind === 'chart' && block.series.length === 1) {
    const series = block.series[0]
    if (!series) return null
    const pairs = series.points
      .filter((point): point is { x: string; y: number } => typeof point.x === 'string')
      .map((point) => ({ text: point.x, value: point.y }))
    if (pairs.length === 0) return null
    return {
      pairs,
      nameLabel: block.xLabel ?? 'Item',
      valueLabel: block.yLabel ?? series.name,
    }
  }

  if (block.kind === 'figure' && block.data.shape === 'parts') {
    return {
      pairs: block.data.parts.map((part) => ({ text: part.label, value: part.value })),
      nameLabel: 'Item',
      valueLabel: 'Value',
    }
  }

  if (block.kind === 'figure' && block.data.shape === 'series' && block.data.series.length === 1) {
    const series = block.data.series[0]
    if (!series) return null
    const pairs = series.points
      .filter((point): point is { x: string; y: number } => typeof point.x === 'string')
      .map((point) => ({ text: point.x, value: point.y }))
    if (pairs.length === 0) return null
    return {
      pairs,
      nameLabel: block.data.xLabel ?? 'Item',
      valueLabel: block.data.yLabel ?? series.name,
    }
  }

  return null
}

/** The two positions a pair of sides picks out, or nothing. Never the same one. */
function twoOf(texts: readonly string[], sides: [Set<string>, Set<string>]): [number, number] | null {
  const first = texts.findIndex((text) => labelMatches(text, sides[0]))
  if (first < 0) return null
  const second = texts.findIndex((text, i) => i !== first && labelMatches(text, sides[1]))
  if (second < 0) return null
  return [first, second]
}

/* A TableBlock is narrower than a tabular figure. Rather than silently drop
   columns or rows to fit, a source that overflows is skipped and the doubt
   falls through to a strategy that shows the block whole. */
const MAX_ANSWER_COLUMNS = 8
const MAX_ANSWER_ROWS = 200

function comparisonStrategy(
  doubt: Doubt,
  lesson: Lesson,
  raw: readonly string[],
): Resolution | null {
  const sides = comparisonSides(raw)
  if (!sides) return null

  for (const block of lesson.blocks) {
    const table = buildComparison(block, sides)
    if (!table) continue

    const blocks: Record<string, unknown>[] = [table]
    const note = captionNote(block)
    if (note) blocks.push(note)

    const answer = buildAnswer([block.id], doubt.text, blocks, [])
    if (answer) return { kind: 'answer', lesson: answer, drawnFrom: [block.id] }
  }

  return null
}

function buildComparison(
  block: Block,
  sides: [Set<string>, Set<string>],
): Record<string, unknown> | null {
  const id = clamp(`${block.id}-comparison`, MAX_ID)

  const values = valuesOf(block)
  if (values) {
    const picked = twoOf(values.pairs.map((pair) => pair.text), sides)
    if (picked) {
      const [a, b] = [values.pairs[picked[0]], values.pairs[picked[1]]]
      if (a && b) {
        return {
          id,
          kind: 'table',
          title: clamp(`${a.text} and ${b.text}`, MAX_LABEL),
          emphasis: 'primary',
          tone: 'neutral',
          columns: [
            { key: 'item', label: clamp(values.nameLabel, MAX_LABEL), type: 'text' },
            { key: 'value', label: clamp(values.valueLabel, MAX_LABEL), type: 'number' },
          ],
          rows: [
            { item: a.text, value: a.value },
            { item: b.text, value: b.value },
          ],
        }
      }
    }
  }

  const table = tableOf(block)
  if (!table) return null
  if (table.columns.length > MAX_ANSWER_COLUMNS || table.rows.length > MAX_ANSWER_ROWS) return null

  /* Two rows of the same table: the comparison is already in the block, buried
     among the rows that were not asked about. */
  const names = table.rows.map((row) => firstTextCell(row, table.columns) ?? '')
  const rowPick = twoOf(names, sides)
  if (rowPick) {
    const [a, b] = [table.rows[rowPick[0]], table.rows[rowPick[1]]]
    if (a && b) {
      return {
        id,
        kind: 'table',
        title: clamp(`${names[rowPick[0]] ?? ''} and ${names[rowPick[1]] ?? ''}`, MAX_LABEL),
        emphasis: 'primary',
        tone: 'neutral',
        columns: table.columns,
        rows: [a, b],
      }
    }
  }

  /* Two columns of the same table, kept beside whatever names the rows —
     without that first column the two columns of answers have nothing to be
     answers about. */
  const columnPick = twoOf(table.columns.map((column) => column.label), sides)
  if (columnPick) {
    const [a, b] = [table.columns[columnPick[0]], table.columns[columnPick[1]]]
    if (a && b) {
      const label = table.columns.find(
        (column, i) => column.type === 'text' && i !== columnPick[0] && i !== columnPick[1],
      )
      const columns = label ? [label, a, b] : [a, b]
      return {
        id,
        kind: 'table',
        title: clamp(`${a.label} and ${b.label}`, MAX_LABEL),
        emphasis: 'primary',
        tone: 'neutral',
        columns,
        rows: table.rows.map((row) => {
          const projected: Row = {}
          for (const column of columns) projected[column.key] = row[column.key] ?? null
          return projected
        }),
      }
    }
  }

  return null
}

/* -------------------------------------------------------------------------- */
/* Strategy: the author already recorded what explains this                   */
/* -------------------------------------------------------------------------- */

/**
 * Which relation kinds explain, strongest first.
 *
 * `derives` is the author saying one block produces the other; `supports` that
 * one is evidence for the other. `contrasts` is last and weakest — it explains
 * by saying what the thing is not, which is a real answer but the one to reach
 * for only when nothing better was recorded.
 */
const EXPLAINS = ['derives', 'supports', 'exemplifies', 'contrasts'] as const

function isWhy(raw: readonly string[]): boolean {
  return raw.includes('why') || raw.includes('how')
}

/**
 * Is this a request for a DEFINITION -- "what is X", "what does X mean"?
 *
 * It matters because a definition is the one question shape a name on its own
 * cannot answer. See `answersADefinition` below.
 *
 * "WHAT DOES" IS NOT A DEFINITION FRAME. THE VERB ON THE END IS.
 * -------------------------------------------------------------
 * `does` used to sit beside `is` and `are` in the loop below, which made "what
 * does the confusion matrix SHOW" a definition ask. MEASURED, on the classifier
 * lesson: that doubt was then refused an answer the lesson plainly had.
 * `bestMatch` found the block whose representation is literally named
 * `confusionMatrix`; the definition gate threw the match away for not being a
 * title; and the doubt fell through to the summary PARAGRAPH. A learner asked
 * what a picture shows and was handed prose about something else. Three tests
 * fell with it, two of them the ones asserting that an answer about a chart is
 * a chart rather than a wall of text.
 *
 * "what does X mean" is still caught, by the `what` + `mean` clause below,
 * because the word that makes it a definition ask is `mean` and never `does`.
 * "what does X show", "what does X do", "what does X happen" carry no such
 * word. They ask what the thing DOES, and a picture answers that.
 */
function isWhatIs(raw: readonly string[]): boolean {
  for (let i = 0; i < raw.length - 1; i++) {
    const here = raw[i]
    const next = raw[i + 1]
    if ((here === 'what' || here === 'whats') && (next === 'is' || next === 'are')) return true
  }
  return raw.includes('define') || raw.includes('definition') || raw.includes('meaning')
    || raw.includes('whats') || (raw.includes('what') && raw.includes('mean'))
}

/**
 * A LABEL IS NOT A DEFINITION OF ITSELF.
 *
 * MEASURED, IN A BROWSER, BEFORE THIS FUNCTION EXISTED. A learner on the gas
 * lesson typed "what is kinetic energy? i dont understand it". The words
 * `kinetic` and `energy` both occur in the causal chain, as the text of one
 * node: "Increased kinetic energy". `bestMatch` found that node, `isGuess`
 * cleared it because two words had matched, and `aloneStrategy` handed back the
 * whole chain -- the diagram she was already looking at -- under the heading
 * "IN ANSWER TO YOUR QUESTION". She learned nothing and was told she had been
 * answered. Words gained: zero.
 *
 * `relationStrategy` above already draws exactly this distinction for "why",
 * and its comment states the principle: naming something INSIDE a block is
 * asking about a part. The rule was simply never applied to "what is", which is
 * the one question shape where the distinction decides between an explanation
 * and an echo.
 *
 * WHAT DECIDES IS NOT THE ROLE. IT IS WHETHER THE BLOCK SAYS THE WORD ITSELF.
 * ---------------------------------------------------------------------------
 * The first version of this rule asked `role === 'title'`, and that was blunt
 * in a way that was MEASURED too, in the opposite direction. On the classifier
 * lesson "what does precision mean" was REFUSED. `Precision` is the y axis of
 * the precision-recall figure, so the match carries role `label`; but that
 * block is TITLED "Precision-recall tells the truth" and captioned with a
 * sentence about the tradeoff precision buys. The author HAD written about
 * precision, in prose, on the very block that matched -- and the rule threw it
 * away because the word the learner typed happened to be painted on an axis
 * rather than in the heading. Same refusal for "what is precision recall",
 * which took three tests in `TeachView.test.tsx` down with it.
 *
 * So the question is not what ROLE the match carries. It is whether the block
 * SAYS the words the learner asked about when it is describing ITSELF -- in its
 * title, in the representation it declares itself to be, or in the prose it
 * carries. `buildIndex` collects exactly that, per block, as `describes`. That
 * is what separates the measured cases, and it is the same thing as asking
 * whether the learner gains any words she did not already have on screen:
 *
 *   pr            titled "Precision-recall tells the truth" + a caption  -> yes
 *   features      declares itself `as: 'featureImportance'`              -> yes
 *   causal-chain  titled "What actually happens", caption "Each step .." -> no
 *
 * `kinetic` and `energy` appear NOWHERE in what the causal chain says about
 * itself. They are painted on one node of the diagram she was already looking
 * at, which is precisely the echo this function exists to stop. A node, a pie
 * slice, a table row and an axis tick all name PARTS; the three sources above
 * are the only places a block speaks for the whole of itself.
 *
 * A TITLE MATCH STILL PASSES, BY CONSTRUCTION AND UNCONDITIONALLY: a title's
 * tokens are a subset of what the block says about itself, in both spellings of
 * it (`tokenVariants` only ever drops words). This rule is therefore a strict
 * WIDENING of the old one -- nothing the old one allowed is now refused -- and
 * the widening is held down at the other end by
 * "refuses a definition ask that only echoes a label back" in the tests, which
 * goes red the moment any block is allowed to answer a definition ask.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It does not try to write a definition,
 * and it does not lower the bar so something comes back. The doubt falls
 * through to the looser sentence strategies, and if the author never explained
 * the term anywhere, to `refuse` -- which says so, and says what the lesson IS
 * about. Being told the truth is worth more to a stuck child than being handed
 * her own screen back.
 */
function answersADefinition(
  best: Match,
  raw: readonly string[],
  typed: ReadonlySet<string>,
  describes: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  if (!isWhatIs(raw)) return true

  const said = describes.get(best.mention.blockId)
  if (!said) return false

  /* Only the words the learner actually typed are asked for. A mention of
     "Increased kinetic energy" answering a doubt about kinetic energy must not
     be held to the word "increased", which the learner never used and which
     says nothing about whether the block explains the term. */
  for (const token of best.mention.tokens) {
    if (!typed.has(token)) continue
    if (!said.has(token)) return false
  }
  return true
}

/**
 * Answer a "why" about a whole block with the block the author linked to it.
 *
 * TITLE MATCHES ONLY, AND THAT IS THE INTERESTING PART
 * ----------------------------------------------------
 * Naming a block by its title is asking why the block's claim holds, and the
 * relation is the recorded answer. Naming something INSIDE it — one node of a
 * flow, one slice of a pie — is asking about a part, and the block containing
 * that part is already the explanation. Without this distinction, "why does
 * pressure go up" matches a node of the causal chain and gets answered with the
 * misconception callout that contrasts with it, instead of with the chain that
 * spells the answer out step by step.
 */
function relationStrategy(doubt: Doubt, lesson: Lesson, asked: Block): Resolution | null {
  const incoming = lesson.relations.filter((relation) => relation.to === asked.id)
  if (incoming.length === 0) return null

  const byStrength = [...incoming].sort(
    (a, b) => EXPLAINS.indexOf(a.kind) - EXPLAINS.indexOf(b.kind),
  )
  const chosen = byStrength[0]
  if (!chosen) return null

  const reason = lesson.blocks.find((block) => block.id === chosen.from)
  if (!reason) return null

  const blocks: Record<string, unknown>[] = [represent(reason, 'primary')]
  const note = captionNote(reason)
  if (note) blocks.push(note)

  const answer = buildAnswer([reason.id], doubt.text, blocks, [])
  return answer ? { kind: 'answer', lesson: answer, drawnFrom: [reason.id] } : null
}

/* -------------------------------------------------------------------------- */
/* Strategy: a quantity, and where it comes from                              */
/* -------------------------------------------------------------------------- */

/**
 * A metric or an equation shown with the block it is derived from.
 *
 * A number on its own answers "what" and never "where from". When the author
 * has recorded a `derives` edge into it, that second block is the working, and
 * showing the pair together is the one case where an answer is worth more than
 * one block.
 */
function derivationStrategy(doubt: Doubt, lesson: Lesson, asked: Block): Resolution | null {
  if (asked.kind !== 'metric' && asked.kind !== 'equation') return null

  const derivation = lesson.relations.find(
    (relation) => relation.to === asked.id && relation.kind === 'derives',
  )
  if (!derivation) return null

  const source = lesson.blocks.find((block) => block.id === derivation.from)
  if (!source) return null

  const blocks: Record<string, unknown>[] = [represent(asked, 'primary')]
  const askedNote = captionNote(asked)
  if (askedNote) blocks.push(askedNote)
  blocks.push(represent(source, 'supporting'))
  const sourceNote = captionNote(source)
  if (sourceNote) blocks.push(sourceNote)

  const answer = buildAnswer(
    [asked.id, source.id],
    doubt.text,
    blocks,
    [{ from: source.id, to: asked.id, kind: 'derives' }],
  )
  return answer
    ? { kind: 'answer', lesson: answer, drawnFrom: [asked.id, source.id] }
    : null
}

/* -------------------------------------------------------------------------- */
/* Strategy: the block, on its own                                            */
/* -------------------------------------------------------------------------- */

/**
 * The general case: show the named block and nothing else.
 *
 * Nothing else is what makes it an answer. The learner was looking at nine
 * blocks and could not find the one that addressed them; taking the other eight
 * away is the whole intervention.
 */
function aloneStrategy(doubt: Doubt, asked: Block): Resolution | null {
  const blocks: Record<string, unknown>[] = [represent(asked, 'primary')]
  const note = captionNote(asked)
  if (note) blocks.push(note)

  const answer = buildAnswer([asked.id], doubt.text, blocks, [])
  return answer ? { kind: 'answer', lesson: answer, drawnFrom: [asked.id] } : null
}

/* -------------------------------------------------------------------------- */
/* Strategy: the learner asked the lesson's own question                      */
/* -------------------------------------------------------------------------- */

/**
 * Enough of the argument to be an answer, few enough to still be shorter than
 * the lesson. Replaying all nine blocks is not an answer to "why is 97% bad" —
 * it is the thing the learner was already looking at when they got stuck.
 */
const MAX_WHOLE_LESSON_BLOCKS = 3

/**
 * The doubt IS the lesson's question.
 *
 * The worst case in the whole set, because it is the doubt a lost learner is
 * most likely to type, and the one where the software most obviously has the
 * answer: the lesson exists to answer exactly this. Refusing it would be
 * absurd.
 *
 * The blocks chosen are the ones the author marked `primary` — their own
 * ranking of what carries the argument — and the connecting callout says
 * plainly that this is a short version of the whole lesson, so the learner is
 * never left thinking these three blocks are all there is.
 */
function wholeLessonStrategy(doubt: Doubt, lesson: Lesson): Resolution | null {
  const primary = lesson.blocks.filter((block) => block.emphasis === 'primary')
  const chosen = (primary.length > 0 ? primary : lesson.blocks).slice(0, MAX_WHOLE_LESSON_BLOCKS)
  if (chosen.length === 0) return null

  let connectorId = 'doubt-whole-lesson'
  while (chosen.some((block) => block.id === connectorId)) connectorId = `${connectorId}-note`

  const blocks: Record<string, unknown>[] = [
    {
      id: clamp(connectorId, MAX_ID),
      kind: 'callout',
      /* The only sentence in this file that is shown to a learner as an
         explanation, and it deliberately makes no claim about the subject. */
      body: 'That is the question this whole lesson is answering. These are the parts of it that carry the answer.',
      emphasis: 'aside',
      tone: 'insight',
    },
    ...chosen.map((block) => represent(block, 'primary', true)),
  ]

  const answer = buildAnswer(['lesson', lesson.id], doubt.text, blocks, [])
  return answer
    ? { kind: 'answer', lesson: answer, drawnFrom: chosen.map((block) => block.id) }
    : null
}


/* -------------------------------------------------------------------------- */
/* Strategy: the learner said they are stuck, and named nothing               */
/* -------------------------------------------------------------------------- */

/**
 * The words people use when they are lost.
 *
 * A REGISTER, not a list of phrases, and universal on purpose: nothing here is
 * about any subject, so it works on accountancy and on logarithms without a
 * carve-out for either. Matching is on the whole trimmed text so "no sense"
 * catches "this makes no sense" without needing that sentence written down.
 *
 * It is deliberately small. Every word added widens what counts as being stuck,
 * and a register that matches everything answers everything -- which is the
 * failure the paired refusal test exists to catch.
 */
const STUCK_SIGNALS: readonly RegExp[] = [
  /\bidk\b/,
  /\bhuh\b/,
  /\b(confused|lost|stuck|unclear)\b/,
  /\bno sense\b/,
  /\b(dont|don't|didnt|didn't|cant|can't|not|no)\b[^.?!]{0,20}\b(understand|get|follow|see|know)\b/,
]

/** Enough to be a second look, few enough that it is not the beat replayed. */
const MAX_STUCK_BLOCKS = 2

/** Does this doubt say "I am lost" without saying what about? */
function soundsStuck(text: string): boolean {
  const plain = text.toLowerCase().trim()
  return STUCK_SIGNALS.some((signal) => signal.test(plain))
}

/**
 * Answer a learner who is stuck at a beat.
 *
 * The doubt carries no subject, so the beat they are ON is the only honest
 * place to look: it is what they were reading when they got lost. `shown`
 * removes what already failed them, so saying it twice moves on rather than
 * repeating -- and when the beat is exhausted this returns null and the caller
 * refuses, because "I have nothing left for this beat" is information and a
 * fourth identical answer is not.
 */
function stuckStrategy(doubt: Doubt, lesson: Lesson): Resolution | null {
  const beat = deriveBeats(lesson).find((candidate) => candidate.id === doubt.atBeatId)
  if (!beat) return null

  const seen = new Set(doubt.shown ?? [])
  const fresh = beat.blockIds
    .filter((id) => !seen.has(id))
    .map((id) => lesson.blocks.find((block) => block.id === id))
    .filter((block): block is Block => block !== undefined)
    .slice(0, MAX_STUCK_BLOCKS)

  /* No `fresh.length === 0` guard: with nothing left, `buildAnswer` produces a
     lesson with no blocks, which does not validate, so this returns null and
     the caller refuses. A mutant proved an explicit guard changed no outcome,
     and a branch no test can reach is a branch that rots unnoticed. */

  const ids = new Set(fresh.map((block) => block.id))
  /* A block does not always stand alone. An `example` with no `exemplifies`
     relation is an example OF nothing, and the teaching gate refuses it -- as
     it should. Carrying every relation whose two ends are both inside the
     selection keeps what was taken intact, and drops the ones that would point
     out of it. */
  const joined = lesson.relations.filter((relation) => ids.has(relation.from) && ids.has(relation.to))

  const answer = buildAnswer(
    fresh.map((block) => block.id),
    doubt.text,
    fresh.map((block) => represent(block, 'primary')),
    joined,
  )
  return answer ? { kind: 'answer', lesson: answer, drawnFrom: fresh.map((block) => block.id) } : null
}

/* -------------------------------------------------------------------------- */
/* Refusal                                                                    */
/* -------------------------------------------------------------------------- */

/** Enough to point at, few enough to read. Beyond three it is a search result. */
const MAX_NEAREST = 3

function refuse(lesson: Lesson, index: Indexed, typed: ReadonlySet<string>): Resolution {
  /* "Nearest" is a much weaker test than matching — a single shared word,
     captions included. It has to be weak: its job is to offer somewhere to
     look, not to answer, and it is only ever rendered as a list of blocks the
     learner can judge for themselves. */
  const nearest = lesson.blocks
    .map((block, blockIndex) => {
      const vocab = index.vocabulary.get(block.id) ?? new Set<string>()
      let overlap = 0
      for (const token of typed) if (vocab.has(token)) overlap += 1
      return { id: block.id, overlap, blockIndex }
    })
    .filter((candidate) => candidate.overlap > 0)
    .sort((a, b) => (b.overlap !== a.overlap ? b.overlap - a.overlap : a.blockIndex - b.blockIndex))
    .slice(0, MAX_NEAREST)
    .map((candidate) => candidate.id)

  const reason =
    nearest.length > 0
      ? 'I could not find an answer to that in this lesson. The closest parts of it are below — one of them may be what you meant.'
      : `I could not find an answer to that in this lesson. This lesson is about: ${lesson.question}`

  return { kind: 'refusal', reason, nearest }
}

const NOTHING_NAMED =
  'I could not tell which part of the lesson that is about. Try naming the thing you are stuck on.'

/* -------------------------------------------------------------------------- */
/* The resolver                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The strategies, most specific trigger first.
 *
 * Order is by how much a strategy demands before it will fire, not by how good
 * its answers are. A comparison needs an explicit "vs" or "difference between"
 * AND two labelled values inside one block; a relation answer needs a "why" AND
 * a title match AND a recorded edge. Showing the block alone needs only a name.
 *
 * The last two run only when NOTHING in the lesson was named, and they are
 * ordered that way for a reason: matching a sentence is much looser than
 * matching a name, so it must never be allowed to outrank one. A doubt that
 * hits a real label is answered by that label's block, and the captions are
 * consulted only once every name has failed.
 */
export const lessonResolver: DoubtResolver = {
  name: 'lesson',

  resolve(doubt: Doubt, lesson: Lesson): Resolution {
    /*
     * WHAT THEY HAVE ALREADY READ IS REMOVED BEFORE ANYTHING ELSE RUNS.
     *
     * Every strategy below reads `lesson`, so filtering here is what makes all
     * of them vary rather than only the one that happened to be edited. A
     * learner asking a second time is telling us the first answer did not land;
     * handing back the same blocks answers a question they did not ask.
     *
     * `shown` empty or absent leaves `lesson` untouched, so this is invisible
     * to every caller that does not use it.
     */
    const seen = new Set(doubt.shown ?? [])
    const unseen =
      seen.size === 0
        ? lesson
        : { ...lesson, blocks: lesson.blocks.filter((b) => !seen.has(b.id)) }

    /*
     * RUNNING OUT IS INFORMATION, NOT A BUG. When every block has been shown,
     * `unseen` is empty, nothing can match, and the refusal below names what
     * the lesson was about. No special case is needed for it -- one was written
     * here and removed: a mutant proved the general path already covered it,
     * and a branch no test can reach is a branch that can rot unnoticed.
     */

    const raw = words(doubt.text)
    const typed = new Set(contentTokens(doubt.text))
    const index = buildIndex(unseen)

    /*
     * A LAST RESORT, NEVER A FIRST GUESS.
     *
     * "I can't follow what happens in the causal chain" says both that they are
     * lost AND what about, and the strategies below answer it far better than a
     * beat dump. Running the stuck path first stole three such doubts and was
     * caught by their tests -- so it runs only where the alternative is a
     * refusal: here, where the doubt named nothing at all, and again at the very
     * bottom where every strategy declined.
     *
     * The beats come from the FULL lesson, not `unseen`: a beat is a run of the
     * lesson as authored, and `stuckStrategy` does its own `shown` filtering.
     */
    if (typed.size === 0) {
      if (soundsStuck(doubt.text)) {
        const helped = stuckStrategy(doubt, lesson)
        if (helped) return helped
      }
      return { kind: 'refusal', reason: NOTHING_NAMED, nearest: [] }
    }

    const compared = comparisonStrategy(doubt, unseen, raw)
    if (compared) return compared

    /* A guessy name match is discarded rather than answered — but the doubt
       carries on to the looser strategies, because "the one name it hit was a
       coincidence" is not the same as "the lesson does not cover this". */
    const named = bestMatch(index.mentions, typed)
    const solid = named && !isGuess(named, typed, index.known) ? named : null
    /* A name match that cannot answer the SHAPE of the question is discarded
       here for the same reason a guessy one is discarded above: the doubt
       carries on to the looser strategies, because "this block names the thing"
       is not the same as "this block explains the thing". */
    const best = solid && answersADefinition(solid, raw, typed, index.describes) ? solid : null
    /* `unseen`, NOT `lesson`, AND THE MERGE IS WHY THIS COMMENT EXISTS.
       Both sides of this conflict were right about different things. This branch
       added the `answersADefinition` filter above; main changed the lookup from
       `lesson.blocks` to `unseen.blocks`. Taking either alone loses the other.
       `unseen` is what every neighbouring strategy already reads -- see the
       `comparisonStrategy`, `relationStrategy` and `derivationStrategy` calls
       around this block -- so indexing `lesson` here would have addressed a
       different array than the index was built from (`buildIndex(unseen)`). */
    const asked = best ? unseen.blocks[best.mention.blockIndex] : undefined

    if (best && asked) {
      if (isWhy(raw) && best.mention.role === 'title') {
        const explained = relationStrategy(doubt, unseen, asked)
        if (explained) return explained
      }

      const derived = derivationStrategy(doubt, unseen, asked)
      if (derived) return derived

      const alone = aloneStrategy(doubt, asked)
      if (alone) return alone
    }

    if (acceptsSentence(index.question, typed) > 0) {
      const whole = wholeLessonStrategy(doubt, unseen)
      if (whole) return whole
    }

    const sentence = bestSentence(index.sentences, typed)
    if (sentence) {
      const block = unseen.blocks[sentence.blockIndex]
      if (block) {
        const alone = aloneStrategy(doubt, block)
        if (alone) return alone
      }
    }

    /* Named something, and nothing above could answer it. If they also said
       they were lost, the beat they are on beats a refusal. */
    if (soundsStuck(doubt.text)) {
      const helped = stuckStrategy(doubt, lesson)
      if (helped) return helped
    }

    const refused = refuse(unseen, index, typed)

    /*
     * ON A RE-ASK, A NEAR MATCH IS BETTER THAN A REFUSAL.
     *
     * The strategies above answer only on a confident hit. First time round
     * that is right: pointing at three loosely related blocks when the lesson
     * plainly covers the thing is worse than saying so. But a learner with
     * `shown` has ALREADY had the confident hit, and it did not work. The
     * refusal is then saying "the one good answer is spent" while holding a
     * list of blocks about the same words -- which is a different angle on the
     * question, and the next honest move rather than a dead end.
     *
     * Guarded on `seen.size`, so the first ask is untouched.
     */
    if (seen.size > 0 && refused.kind === 'refusal' && refused.nearest.length > 0) {
      const near = refused.nearest
        .map((id) => unseen.blocks.find((b) => b.id === id))
        .filter((b): b is Block => b !== undefined)
      const answer = buildAnswer(
        near.map((b) => b.id),
        doubt.text,
        near.map((b) => represent(b, 'primary')),
        [],
      )
      if (answer) return { kind: 'answer', lesson: answer, drawnFrom: near.map((b) => b.id) }
    }

    return refused
  },
}
