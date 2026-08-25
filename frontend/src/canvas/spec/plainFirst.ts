/**
 * PLAIN FIRST — refuse an opening the learner cannot use on first reading.
 *
 * THE RULE
 * --------
 * The plain idea comes first, in words the learner already has. The term
 * arrives afterwards, to label an idea they are already holding. A name that
 * lands before the idea has nothing to attach to.
 *
 * WHY THIS IS A GATE AND NOT A GUIDELINE
 * --------------------------------------
 * The prompt already asks for plain language. Asking is a request, and a
 * request cannot fail a build. Measured in this repo on 2026-08-25, every
 * committed generated lesson was three prose blocks and opened by announcing
 * itself: "Here is one worked case of identify base case, start to finish."
 * Nothing in that sentence is technical. It is still unusable, because it tells
 * the learner what is about to happen rather than teaching them anything.
 *
 * WHAT IS CHECKED — SHAPE, NEVER QUALITY
 * --------------------------------------
 *   METAPHOR_DEFINITION  a figure of speech doing the defining
 *   ABSTRACT_NOUN        a thing named where an action belongs
 *   ANNOUNCEMENT         the opening describes the lesson instead of teaching
 *   TOO_LONG             more than the reader can hold at once
 *   ALL_PROSE            every block the same kind, so the lesson has one shape
 *
 * None of these judge whether the teaching is correct or well-aimed; a human
 * still has to read it. What they remove is the class of failure that survives
 * review because every individual word looked fine.
 *
 * WHY ALL_PROSE SITS HERE RATHER THAN IN ITS OWN CHECK
 * ---------------------------------------------------
 * Readable and non-generic are two different problems wearing one name.
 * Chunking fixes the first. Only varying the SHAPE fixes the second: a lesson
 * of three prose blocks has exactly one possible layout, however well written,
 * and twenty such lessons feel like a template because they are one.
 */

export type PlainViolation = {
  readonly code: string
  readonly path: string
  readonly evidence: string
  readonly fix: string
}

/** A figure of speech standing in for a definition — it has to be unpacked. */
const METAPHOR_MARKERS = [
  'waiting to',
  'is like a',
  'is like an',
  'think of it as',
  'think of it like',
  'at its core',
  'is essentially',
  'in a sense',
  'kind of like',
  'sort of like',
] as const

/** Container nouns that swallow a verb: "a count of parts" hides "count them". */
const CONTAINER_NOUNS = [
  'count',
  'set',
  'collection',
  'way',
  'form',
  'process',
  'matter',
  'means',
  'measure',
  'degree',
  'notion',
  'concept',
  'aspect',
  'act',
  'state',
  'kind',
  'sort',
  'manner',
  'case',
] as const

/** Endings that turn an action into a thing. "Multiplication" cannot be done. */
const NOMINAL_SUFFIXES = ['tion', 'sion', 'ment', 'ness', 'ity', 'ance', 'ence'] as const

/**
 * Openings that describe the lesson rather than teach it.
 *
 * Every one of these was in the generated corpus. They read as helpful and
 * carry no content: the learner cannot do anything with "here is one worked
 * case" that they could not do with silence.
 */
const ANNOUNCEMENT_MARKERS = [
  'here is',
  "here's",
  'here are',
  'in this lesson',
  'we will look at',
  'we will explore',
  'let us look at',
  "let's look at",
  'this lesson',
  'below you will find',
  'start to finish',
  'first we',
] as const

const MAX_WORDS = 25
const MAX_SENTENCES = 2

const words = (text: string): string[] => text.match(/[A-Za-z][A-Za-z'-]*/g) ?? []

const findMarker = (text: string, markers: readonly string[]): string | null => {
  const low = text.toLowerCase()
  return markers.find((m) => low.includes(m)) ?? null
}

const findAbstract = (text: string): string | null => {
  const container = new RegExp(`\\b(?:a|an|the)\\s+(?:${CONTAINER_NOUNS.join('|')})\\s+of\\b`, 'i')
  const hit = container.exec(text)
  if (hit) return hit[0]

  /*
   * A Latin suffix is NOT enough on its own.
   *
   * The first version of this scanned for any long word ending -tion/-sion and
   * refused "It is not a division problem." — a sentence written by the repo
   * owner as the CORRECT plain version of one of mine. "Division", "question"
   * and "attention" are ordinary words; nouning is only a problem when the
   * nouned verb is carrying the definition.
   *
   * So it is graded by POSITION, not by spelling. Two shapes do the damage:
   *
   *   "Multiplication is ..."      the nouned verb is the subject being defined
   *   "the repetition of ..."      the nouned verb is the thing being pointed at
   *
   * Both are the sentence naming an action instead of showing it. A
   * nominalisation sitting anywhere else in the sentence is left alone, which
   * is what keeps this from refusing ordinary English.
   */
  /* Bound to a const before use. A capture group is `string | undefined` to
     TypeScript even when the pattern guarantees it, and indexing the match
     inside the callback loses the narrowing. */
  const subject = /^\s*([A-Za-z]{7,})\s+(?:is|are|means)\b/.exec(text)?.[1]
  if (subject && NOMINAL_SUFFIXES.some((s) => subject.toLowerCase().endsWith(s)))
    return subject

  const target = /\bthe\s+([A-Za-z]{7,})\s+of\b/i.exec(text)?.[1]
  if (target && NOMINAL_SUFFIXES.some((s) => target.toLowerCase().endsWith(s)))
    return target

  return null
}

const tooLong = (text: string): string | null => {
  const n = words(text).length
  if (n > MAX_WORDS) return `${n} words (max ${MAX_WORDS})`
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim() !== '')
  if (sentences.length > MAX_SENTENCES)
    return `${sentences.length} sentences (max ${MAX_SENTENCES})`
  return null
}

type LooseBlock = { readonly kind?: unknown; readonly body?: unknown }
type LooseLesson = { readonly blocks?: unknown }

/**
 * Check a lesson's opening, and the variety of its blocks.
 *
 * Takes an unknown rather than a `Lesson` on purpose: this runs inside
 * `validateLesson`, where the input has not been parsed yet on the failure
 * path, and a checker that demanded a valid lesson could never report on an
 * invalid one.
 */
export function checkPlainFirst(input: unknown): PlainViolation[] {
  const lesson = (input ?? {}) as LooseLesson
  const blocks = Array.isArray(lesson.blocks) ? (lesson.blocks as LooseBlock[]) : []
  if (blocks.length === 0) return []

  const found: PlainViolation[] = []
  const first = blocks[0]
  const body = typeof first?.body === 'string' ? first.body : ''
  const path = 'blocks[0].body'

  if (body !== '') {
    const metaphor = findMarker(body, METAPHOR_MARKERS)
    if (metaphor !== null)
      found.push({
        code: 'METAPHOR_DEFINITION',
        path,
        evidence: metaphor,
        fix: 'say it directly; an image has to be decoded before it can be used',
      })

    const announcement = findMarker(body, ANNOUNCEMENT_MARKERS)
    if (announcement !== null)
      found.push({
        code: 'ANNOUNCEMENT',
        path,
        evidence: announcement,
        fix: 'open with the thing itself, not with what the lesson is about to do',
      })

    const abstract = findAbstract(body)
    if (abstract !== null)
      found.push({
        code: 'ABSTRACT_NOUN',
        path,
        evidence: abstract,
        fix: `turn "${abstract}" back into something the learner does`,
      })

    const length = tooLong(body)
    if (length !== null)
      found.push({
        code: 'TOO_LONG',
        path,
        evidence: length,
        fix: 'cut it to one idea the reader can hold at once',
      })
  }

  /* One block cannot vary from itself. Firing here would refuse every short
     lesson, and a gate that cries wolf gets switched off within a week. */
  if (blocks.length > 1) {
    const kinds = new Set(blocks.map((b) => String(b?.kind ?? '')))
    if (kinds.size === 1 && kinds.has('prose'))
      found.push({
        code: 'ALL_PROSE',
        path: 'blocks',
        evidence: `${blocks.length} blocks, all prose`,
        fix: 'a number is a metric, a comparison is a table, a formula is an equation',
      })
  }

  return found
}

export const codesOf = (violations: readonly PlainViolation[]): string[] =>
  violations.map((v) => v.code)
