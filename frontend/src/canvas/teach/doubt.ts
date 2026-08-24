import type { Payload } from '../spec/figure'
import type { Block, Lesson } from '../spec/spec'
import { validateLesson } from '../spec/validate'
import type { Doubt, DoubtResolver, Resolution } from './contract'

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
 */
const HALF = 0.5

function accepts(nameTokens: readonly string[], typed: ReadonlySet<string>): number {
  let matched = 0
  for (const token of nameTokens) if (typed.has(token)) matched += 1
  if (matched === 0) return 0
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

function captionOf(block: Block): string | undefined {
  return 'caption' in block ? block.caption : undefined
}

function bodyOf(block: Block): string | undefined {
  return block.kind === 'prose' || block.kind === 'callout' ? block.body : undefined
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
      /*
       * The representation's own name, but only when it is more than one word.
       * "confusionMatrix" and "precisionRecall" are things this lesson is
       * teaching and a learner will type them. "line", "bar" and "table" are
       * drawing words that would match half the questions ever asked.
       */
      const spaced = block.as.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      if (spaced.includes(' ')) add(spaced)
      payloadLabels(block.data, add)
      break
    }
  }
}

function buildIndex(lesson: Lesson): Indexed {
  const mentions: Mention[] = []
  const sentences: Sentence[] = []
  const vocabulary = new Map<string, Set<string>>()
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

    for (const token of prose) vocab.add(token)
    vocabulary.set(block.id, vocab)
    for (const token of vocab) known.add(token)
  })

  return { mentions, sentences, question: new Set(contentTokens(lesson.question)), vocabulary, known }
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
  })
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

/** Rows and columns of whichever of the two tabular block kinds this is. */
function tableOf(block: Block): { columns: Column[]; rows: Row[] } | null {
  if (block.kind === 'table') return { columns: block.columns, rows: block.rows }
  if (block.kind === 'figure' && block.data.shape === 'tabular')
    return { columns: block.data.columns, rows: block.data.rows }
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
    const raw = words(doubt.text)
    const typed = new Set(contentTokens(doubt.text))
    const index = buildIndex(lesson)

    if (typed.size === 0) return { kind: 'refusal', reason: NOTHING_NAMED, nearest: [] }

    const compared = comparisonStrategy(doubt, lesson, raw)
    if (compared) return compared

    /* A guessy name match is discarded rather than answered — but the doubt
       carries on to the looser strategies, because "the one name it hit was a
       coincidence" is not the same as "the lesson does not cover this". */
    const named = bestMatch(index.mentions, typed)
    const best = named && !isGuess(named, typed, index.known) ? named : null
    const asked = best ? lesson.blocks[best.mention.blockIndex] : undefined

    if (best && asked) {
      if (isWhy(raw) && best.mention.role === 'title') {
        const explained = relationStrategy(doubt, lesson, asked)
        if (explained) return explained
      }

      const derived = derivationStrategy(doubt, lesson, asked)
      if (derived) return derived

      const alone = aloneStrategy(doubt, asked)
      if (alone) return alone
    }

    if (acceptsSentence(index.question, typed) > 0) {
      const whole = wholeLessonStrategy(doubt, lesson)
      if (whole) return whole
    }

    const sentence = bestSentence(index.sentences, typed)
    if (sentence) {
      const block = lesson.blocks[sentence.blockIndex]
      if (block) {
        const alone = aloneStrategy(doubt, block)
        if (alone) return alone
      }
    }

    return refuse(lesson, index, typed)
  },
}
