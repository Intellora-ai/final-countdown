/**
 * KEEPING A CANVAS TRUE AFTER IT HAS BEEN SHOWN.
 *
 * THE OWNER'S DECISION, 2026-09-03: "VERIFY BEFORE -> MONITOR AFTER -> RECHECK
 * WHEN WARRANTED -> CORRECT TRANSPARENTLY."
 *
 * WHY A CANVAS NEEDS THIS AND A CHAT DOES NOT.
 *
 *   A wrong explanation in a chat scrolls away within the hour. A wrong
 *   explanation here is permanent -- that is the entire point of the canvas --
 *   so it sits in front of a student for months, and she may already have
 *   learnt it. Permanence raises the cost of every mistake that slipped past
 *   the checks made before the lesson was drawn.
 *
 * WHAT THIS FILE REFUSES TO DO, AND WHY EACH REFUSAL MATTERS.
 *
 *   It does not recheck on a timer. Re-reading every lesson every night spends
 *   compute re-confirming correct work, and hands a model repeated chances to
 *   "improve" something that was already right.
 *
 *   It does not act on a model's own second thoughts. A model asked "was that
 *   wrong?" will find something to say. Evidence comes first; the model is only
 *   ever asked about a lesson something real has already put in question.
 *
 *   It does not treat confusion as error. A student saying "I do not get it" is
 *   asking to be taught differently, which the diagnosis path already handles.
 *   Only a REPEATED pattern at the SAME point of the SAME lesson suggests the
 *   teaching, rather than the topic, is the problem.
 *
 *   It does not rewrite anything. A correction is a NEW artifact appended at
 *   the bottom of the canvas, where she actually is; the original keeps every
 *   word it had. See `src/canvas/api/memoryClient.ts` -- there is no operation
 *   in this product that can shorten or replace what is on a canvas.
 *
 * ALL SIX SIGNALS ARE HERE. Three were left out at first for reasons that
 * turned out to be answerable without any new machinery, and the answer in each
 * case was to narrow the question until it was checkable:
 *
 *   contradiction     Detecting disagreement in prose is genuinely hard. Detecting
 *                     THE SAME QUANTITY GIVEN TWO DIFFERENT VALUES is not, and it
 *                     is the case that actually hurts: "the sum of the zeros is
 *                     -b/a" in one lesson and "b/a" in another, weeks apart, with
 *                     no way for her to know which to believe.
 *
 *   failing after     Nothing here grades an answer, and it does not need to.
 *   being taught      Being ASKED and saying NOTHING, twice, on one lesson is
 *                     observable, is already recorded as `empty`, and means the
 *                     lesson failed whatever its facts were.
 *
 *   a source changed  Artifacts now record the addresses they were grounded on.
 *                     The caller says which of those have changed; this decides
 *                     which lessons that touches.
 *
 * WHAT IS STILL NOT DONE, and is a caller's job rather than a rule's: nothing
 * yet re-fetches cited pages to notice a change, so `sourcesThatChanged` is
 * empty in the running product. The rule is correct and proven; the watcher
 * that feeds it is not written.
 */

/** What a canvas artifact looks like to this file. Only what a signal reads. */
export interface OnCanvas {
  readonly seq: number
  readonly kind: 'scope' | 'lesson' | 'answer' | 'correction' | 'note'
  readonly question: string
  /** verified until something questions it; then suspect; then corrected. */
  readonly state: 'verified' | 'suspect' | 'corrected'
  /** The knowledge model version this was written against, when it is known. */
  readonly knowledgeVersion?: number
  /** The lesson's own words, flattened. What the content signals read. */
  readonly says: string
  /** The pages this lesson was grounded on, when it recorded any. */
  readonly sources?: readonly string[]
}

/** One thing she typed, as `memory/evidence.ts` already files it. */
export interface WhatSheSaid {
  readonly artifactSeq: number
  /** Which part of the lesson she was on. */
  readonly beat: string
  readonly kind: 'plea' | 'answer' | 'question' | 'empty'
}

export interface Suspicion {
  readonly artifactSeq: number
  readonly kind:
    | 'two-lessons-disagree'
    | 'repeated-confusion'
    | 'asked-and-could-not-answer'
    | 'a-source-has-changed'
    | 'written-against-an-older-syllabus'
    | 'carries-a-worked-number'
  /** Why, in words a person could argue with. */
  readonly why: string
}

export interface Watching {
  readonly canvas: readonly OnCanvas[]
  /** What she has said since the last time this ran. */
  readonly saidSince: readonly WhatSheSaid[]
  /** The version of the canonical knowledge model for this topic, now. */
  readonly knowledgeVersion: number
  /**
   * Whether to include the weakest signal, which flags any lesson resting on a
   * worked number. It is off by default because it fires on a great many
   * perfectly good lessons -- arithmetic is already checked before a lesson is
   * drawn -- and is worth spending on only when there is budget to spare.
   */
  readonly alsoTheRiskyOnes?: boolean
  /**
   * Addresses that are known to have changed since they were read.
   *
   * Supplied by whoever noticed; this file does not fetch anything. Empty means
   * "nothing is known to have changed", NOT "nothing has changed" -- the two
   * are different, and the second is not something anybody here can claim.
   */
  readonly sourcesThatChanged?: readonly string[]
}

/**
 * How many times she has to be lost at the same point before the LESSON, rather
 * than the topic, is what is in question.
 *
 * TWO IS TOO FEW. Being confused twice by a hard idea is ordinary, and a system
 * that suspects its own teaching that easily will suspect every hard topic in
 * the syllabus. Three times at the same beat is a pattern.
 */
const CONFUSED_ENOUGH_TIMES = 3

/** Only a lesson can be wrong in the way this file is about. */
const CAN_BE_WRONG = new Set(['lesson', 'answer'])

/**
 * How many times she can be asked and say nothing before the LESSON is what is
 * in question.
 *
 * TWO. Once is a doorbell, a sibling, a bus stop. Twice on the same lesson is
 * the lesson.
 */
const SILENT_ENOUGH_TIMES = 2

/** A number that has been worked out, rather than one that is just a number. */
const A_WORKED_NUMBER = /\d+(?:\.\d+)?\s*[+\-×x*÷/]\s*\d+(?:\.\d+)?\s*=\s*\d/

/**
 * Which lessons on this canvas something real has put in question.
 *
 * Strongest first, so a caller with budget for one recheck spends it on the
 * worst. At most one reason per lesson: one lesson is one piece of work, and a
 * reader given three reasons has to decide which matters, which is this
 * function's job and not theirs.
 */
export function needsAnotherLook(watching: Watching): readonly Suspicion[] {
  const confusionAt = new Map<string, number>()
  /* Counted per LESSON only: being asked and saying nothing is about the lesson
     as a whole, not about the paragraph she happened to be on. */
  const silenceAt = new Map<number, number>()
  for (const said of watching.saidSince) {
    if (said.kind === 'empty') {
      silenceAt.set(said.artifactSeq, (silenceAt.get(said.artifactSeq) ?? 0) + 1)
      continue
    }
    if (said.kind !== 'plea') continue
    /* Counted per LESSON AND PER BEAT together. Three pleas spread across three
       parts is a hard lesson; three at one part is a part that is not working. */
    const where = `${said.artifactSeq}::${said.beat}`
    confusionAt.set(where, (confusionAt.get(where) ?? 0) + 1)
  }

  const found: Suspicion[] = []
  for (const artifact of watching.canvas) {
    /* A correction cannot itself be corrected: that is a loop with a student
       inside it. The topic's scope is not a lesson and is not written by a
       model. And a lesson already suspect or corrected has had its turn --
       without this, an unsettled lesson is rechecked every time she opens the
       canvas, forever. */
    if (!CAN_BE_WRONG.has(artifact.kind)) continue
    if (artifact.state !== 'verified') continue

    const worstFirst = [
      /* Order is severity. Two lessons that cannot both be right is the worst
         thing on this list: she has been told two different answers and has no
         way to choose, and one of them is definitely wrong. */
      disagreesWithAnother(artifact, watching.canvas),
      lostAtTheSamePlace(artifact, confusionAt),
      askedAndSaidNothing(artifact, silenceAt),
      restsOnAChangedSource(artifact, watching.sourcesThatChanged ?? []),
      writtenAgainstAnOlderSyllabus(artifact, watching.knowledgeVersion),
      watching.alsoTheRiskyOnes === true ? restsOnAWorkedNumber(artifact) : null,
    ].filter((s): s is Suspicion => s !== null)

    if (worstFirst.length > 0) found.push(worstFirst[0]!)
  }

  /* The order the reasons are listed in above IS the order of severity, so
     sorting by it puts the worst reason for the worst lesson first. */
  const severity: Record<Suspicion['kind'], number> = {
    'two-lessons-disagree': 0,
    'repeated-confusion': 1,
    'asked-and-could-not-answer': 2,
    'a-source-has-changed': 3,
    'written-against-an-older-syllabus': 4,
    'carries-a-worked-number': 5,
  }
  return [...found].sort((a, b) => severity[a.kind] - severity[b.kind])
}

function lostAtTheSamePlace(
  artifact: OnCanvas,
  confusionAt: ReadonlyMap<string, number>,
): Suspicion | null {
  for (const [where, times] of confusionAt) {
    const [seq, beat] = where.split('::')
    if (Number(seq) !== artifact.seq || times < CONFUSED_ENOUGH_TIMES) continue
    return {
      artifactSeq: artifact.seq,
      kind: 'repeated-confusion',
      why: `she has said she does not follow the same part of this lesson ${times} times; the teaching may be at fault rather than the idea`,
    }
  }
  return null
}

function writtenAgainstAnOlderSyllabus(artifact: OnCanvas, now: number): Suspicion | null {
  if (artifact.knowledgeVersion === undefined || artifact.knowledgeVersion >= now) return null
  return {
    artifactSeq: artifact.seq,
    kind: 'written-against-an-older-syllabus',
    why: `this was written against version ${artifact.knowledgeVersion} of what the topic covers, and it is now version ${now}`,
  }
}

function restsOnAWorkedNumber(artifact: OnCanvas): Suspicion | null {
  if (!A_WORKED_NUMBER.test(artifact.says)) return null
  return {
    artifactSeq: artifact.seq,
    kind: 'carries-a-worked-number',
    why: 'this lesson works a number out, and a wrong number reads exactly like a right one',
  }
}

/* -------------------------------------------------------------------------- */
/* Two lessons that cannot both be right                                      */
/* -------------------------------------------------------------------------- */

/**
 * A claim of the form "<the thing> is <a value>", where the value is a number
 * or a formula.
 *
 * NARROW ON PURPOSE. This is not an attempt to read prose for disagreement,
 * which is genuinely hard and which a model would have to be trusted for. It
 * finds one shape -- a quantity stated as a value -- because that is the shape
 * that goes quietly wrong and the shape a student cannot resolve for herself.
 * "The sum of the zeros is -b/a" in September and "is b/a" in November is two
 * lessons on her own canvas, and nothing was comparing them.
 */
const A_STATED_VALUE = /\b(?:the\s+)?([a-z][a-z\s]{3,40}?)\s+is\s+((?:-?\d+(?:\.\d+)?(?:\s*[a-z]+)?)|(?:-?[a-z]\s*\/\s*[a-z]))\b/gi

/** Whether a text states a quantity as a value -- the one shape above, offered to the risk tiers so there is exactly one notion of it. */
export function statesAValue(text: string): boolean {
  return new RegExp(A_STATED_VALUE.source, 'i').test(text)
}

/**
 * Words that join clauses, and therefore end a subject.
 *
 * MEASURED, not guessed: the pattern above is greedy about where it starts, so
 * "Remember that the sum of the zeros is b/a" captured "Remember that the sum
 * of the zeros" and did not match "the sum of the zeros" from the sentence
 * beside it -- two lessons that plainly disagree looked like two lessons about
 * different things. A subject does not contain a conjunction, so the text after
 * the last one is the subject.
 */
const ENDS_A_SUBJECT = /\b(?:that|and|but|so|because|when|if|since|remember|note|recall|know)\b/gi

/** Words that carry no subject on their own, so a key made of them is dropped. */
const NOT_A_SUBJECT = new Set(['it', 'this', 'that', 'there', 'what', 'which', 'result', 'answer', 'value'])

function subjectOf(raw: string): string {
  const parts = raw.toLowerCase().split(ENDS_A_SUBJECT)
  return (parts[parts.length - 1] ?? '')
    /* So "the sum of the zeros" and "sum of zeros" are one key. */
    .replace(/\b(?:the|a|an|of|for|its|their)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function statedValues(says: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const match of says.matchAll(A_STATED_VALUE)) {
    const subject = subjectOf(match[1]!)
    if (subject.length < 4 || NOT_A_SUBJECT.has(subject)) continue
    const value = match[2]!.toLowerCase().replace(/\s+/g, '')
    /* FIRST STATEMENT WINS WITHIN ONE LESSON. A lesson that says a thing twice
       is repeating itself, and the later mention is usually the shorter one. */
    if (!found.has(subject)) found.set(subject, value)
  }
  return found
}

function disagreesWithAnother(artifact: OnCanvas, canvas: readonly OnCanvas[]): Suspicion | null {
  const mine = statedValues(artifact.says)
  if (mine.size === 0) return null

  for (const other of canvas) {
    if (other.seq === artifact.seq || !CAN_BE_WRONG.has(other.kind)) continue
    const theirs = statedValues(other.says)
    for (const [subject, value] of mine) {
      const alsoSaid = theirs.get(subject)
      if (alsoSaid === undefined || alsoSaid === value) continue
      return {
        artifactSeq: artifact.seq,
        kind: 'two-lessons-disagree',
        /* BOTH lessons are raised, each by its own turn through this loop.
           Nothing here knows which is wrong, and quietly preferring the newer
           would be a guess wearing a correction's clothes. */
        why: `this says ${subject} is ${value}, and lesson ${other.seq} on the same canvas says ${alsoSaid}; they cannot both be right`,
      }
    }
  }
  return null
}

/* -------------------------------------------------------------------------- */
/* Asked, and said nothing                                                    */
/* -------------------------------------------------------------------------- */

function askedAndSaidNothing(
  artifact: OnCanvas,
  silenceAt: ReadonlyMap<number, number>,
): Suspicion | null {
  const times = silenceAt.get(artifact.seq) ?? 0
  if (times < SILENT_ENOUGH_TIMES) return null
  return {
    artifactSeq: artifact.seq,
    kind: 'asked-and-could-not-answer',
    why: `she was asked about this lesson and said nothing ${times} times; a lesson she cannot say anything about has not taught her, whatever its facts are`,
  }
}

/* -------------------------------------------------------------------------- */
/* A page that has changed underneath a lesson                                */
/* -------------------------------------------------------------------------- */

function restsOnAChangedSource(
  artifact: OnCanvas,
  changed: readonly string[],
): Suspicion | null {
  if (artifact.sources === undefined || changed.length === 0) return null
  const moved = artifact.sources.find((url) => changed.includes(url))
  if (moved === undefined) return null
  return {
    artifactSeq: artifact.seq,
    kind: 'a-source-has-changed',
    why: `this was written from ${moved}, and that page has changed since; the lesson was true when it was written and may not be now`,
  }
}
