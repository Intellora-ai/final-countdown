/**
 * IS THIS ENTRY SOMETHING A STUDENT CAN LEARN?
 *
 * WHY THIS HAD TO BE BUILT BEFORE ANYTHING DECOMPOSED A TOPIC.
 *
 *   The curriculum was read out of 37 official PDFs, and a PDF is a document,
 *   not a database. MEASURED 2026-09-03 across all 3,995 entries, these are
 *   really in there, as "topics" a student can click:
 *
 *     "Collect the following items: A spring, a stand, a weight hanger..."
 *     "Draw a straight 5-metre line on the ground and mark the starting point"
 *     "Microbiology - An introduction: Gerrard J. Tortora, Berdell R. Funke..."
 *     "Production of __________ using bacteria"
 *     "Record your observations and results in the following table"
 *
 *   The first is a shopping list, the second an instruction, the third a book's
 *   authors, the fourth an exam blank. Asked what is INSIDE "Microbiology - an
 *   introduction: Gerrard J. Tortora...", any decomposition worth the name
 *   returns nothing -- and a decomposition that returns something has invented
 *   three concepts out of a citation. That is the failure the whole knowledge
 *   layer exists to prevent, so it is stopped here, before a model is asked.
 *
 * HIGH PRECISION, DELIBERATELY LOW RECALL.
 *
 *   Only signals that are unambiguous. "Starts with a lower-case letter" trips
 *   984 entries and is NOT one of them: "mirror formula" and "mutable and
 *   immutable data types" are perfectly good maths and computing topics. A rule
 *   that called those unteachable would hide a third of the syllabus, which is
 *   far worse than letting a few oddities through to be caught by a person.
 *
 *   On the measured 3,995, the signals below trip roughly 370 entries -- about
 *   nine in a hundred.
 */

/** Why an entry is not something to teach, in words a person can act on. */
export interface NotTeachable {
  readonly reason: string
  /** The signal that fired, for counting and for arguing with. */
  readonly signal: string
}

/**
 * Each signal is a claim about MEANING, not about style, and each carries the
 * real entry that put it here.
 */
const SIGNALS: readonly { signal: string; reason: string; test: RegExp }[] = [
  {
    signal: 'an-instruction',
    reason: 'this tells someone to do something; it is a task, not an idea to understand',
    /* "Draw a straight 5-metre line on the ground", "Record your observations". */
    test: /^\s*(?:do|collect|draw|write|observe|perform|take|place|measure|record|repeat|plot|verify|prepare|arrange|paste|label)\b/i,
  },
  {
    signal: 'a-blank-to-fill',
    reason: 'this is an exercise with a blank in it, not something to be taught',
    /* "Production of __________ using bacteria". */
    test: /_{3,}/,
  },
  {
    signal: 'an-activity-or-figure',
    reason: 'this points at an activity, figure or table in a book rather than naming an idea',
    /* "Limitations of Newton's Laws ... Activity 3.1: Let us observe". */
    test: /\b(?:activity|fig\.?|figure|ch\.|table)\s*\d/i,
  },
  {
    signal: 'a-citation',
    reason: 'this is a book and its authors, not a thing to learn',
    /* "Microbiology - An introduction: Gerrard J. Tortora, Berdell R. Funke and Christine J. Case". */
    test: /\b[A-Z][a-z]+\s+[A-Z]\.\s*[A-Z][a-z]+/,
  },
  {
    signal: 'a-verification-task',
    reason: 'this is a practical to carry out, not an idea; the idea it tests is its own topic',
    /* "Verification of Newton's Second Law of Motion using a trolley, pulley..." */
    test: /^\s*verification of\b/i,
  },
  {
    signal: 'pdf-wreckage',
    reason: 'this came out of the document damaged and does not read as anything',
    /* "SQL queries (4 queries based on one or two tables) 4 2 Report file:",
       "required equation of the line is y  x  2. 2" */
    test: /(?<![\d.])\b\d+\s+\d+\s*(?:[A-Za-z]+\s*)?:?\s*$|\s\d\s\d\s/,
  },
  {
    signal: 'a-mark-scheme',
    reason: 'this is how the paper is marked, not something to understand',
    /* FOUND BY RUNNING THE GENERATOR: "30 Marks" was decomposed into
       Practical/Project, Viva and Project Evaluation Parameters, and a reading
       format into Word Count and Marks Allocation. A canvas offering to teach
       one of those is offering to teach a mark sheet. */
    test: /\b\d+\s*marks?\b|\bmarks?\s*[:)]|\b(?:theory|practical|project|viva)\s*[:\-]\s*\d/i,
  },
  {
    signal: 'a-sentence-fragment',
    reason: 'this is the middle of a sentence the document was cut across, not a whole idea',
    /* Two shapes, both real. A line opening on a relative pronoun is the tail of
       something: "whose first term is -3 and common difference is 4" produced
       "First Term" and "Common Difference" -- real ideas about a topic that is
       not there. And a full stop followed by one or two stray words is the head
       of the next line that came across with it: "luxury of goods and services.
       goods". */
    test: /^\s*(?:whose|which|that|who|whom|where|when|and|or|but|because|so)\b|\.\s+\S+\s*$/i,
  },
  {
    signal: 'longer-than-a-syllabus-line',
    reason: 'this is a paragraph, so it is prose from the document rather than the name of a topic',
    /* Measured: the median real entry is well under this; 178 entries are over. */
    test: /^[\s\S]{181,}$/,
  },
]

/**
 * Whether this curriculum entry names something a student could be taught.
 *
 * Returns `null` when it does -- the ordinary case -- and the reason when it
 * does not. Nothing is deleted anywhere on the strength of this: the entry
 * stays in the curriculum, keeps its place in the sidebar, and is simply not
 * handed to a decomposition that would have to invent something.
 */
export function notTeachable(name: string): NotTeachable | null {
  const said = name.trim()
  if (said.length < 3) {
    return { signal: 'too-short-to-be-anything', reason: 'there is not enough here to name a topic' }
  }
  for (const { signal, reason, test } of SIGNALS) {
    if (test.test(said)) return { signal, reason }
  }
  return null
}
