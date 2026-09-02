/* One input box, two meanings.
 *
 * A beat already ends with a question. A Continue button beside it asks the
 * learner to answer and then separately confirm that they answered -- a
 * control that exists to serve the code, not the person. So the beat advances
 * when they ANSWER it, and the same box carries their own questions.
 *
 * Nothing may be added to the screen to tell the two apart: no toggle, no
 * second box, no radio buttons. The text itself has to say which it is, and
 * English marks the difference three ways -- a question mark, an interrogative
 * opening word, and modal inversion. Those are the three signals here.
 *
 * WHY THE OPENING WORD AND NOT THE WHOLE STRING
 *   "That is why it rises" is an answer. Scanning anywhere for "why" would
 *   send it to the doubt resolver and the beat would never move.
 */

export type Turn = 'question' | 'answer' | 'empty'

/** Words that open a question. Modals included: "can you explain that again"
 *  carries no question word but is plainly a question. */
const OPENERS = [
  'what', 'why', 'how', 'when', 'where', 'which', 'who', 'whose', 'whom',
  'can', 'could', 'would', 'should', 'do', 'does', 'did', 'is', 'are', 'was', 'were', 'will',
]

/** Direct requests for help. Not questions grammatically; questions in every
 *  way that matters to a learner who has just typed one. */
const PLEAS = [
  /^i\s+(?:do\s*n[o']?t|don[o']?t|dont|can[o']?t|cannot)\b/,
  /^(?:explain|clarify|elaborate|rephrase|simplify)\b/,
  /^(?:no\s+idea|not\s+sure|confused|stuck)\b/,
]

/* A PLEA IS HEARD WHEREVER IT SITS. C3, decided 2026-09-02: a question is
   asked only when the learner did not understand, so the plea is the one
   signal the whole diagnosis depends on. The patterns above anchor at the
   start of the sentence; "i still dont get why there are two", typed on a
   live canvas, was read as an answer and advanced the lesson. */
const PLEAS_ANYWHERE = [
  /\b(?:do\s*n[o']?t|don[o']?t|dont|did\s*n[o']?t|didnt|can[o']?t|cannot|still\s+don[o']?t)\s+(?:get|understand|follow|see)\b/,
  /\b(?:not|never)\s+(?:get|understand|follow|getting|understanding)(?:\s+it|\s+this|\s+that)?\b/,
  /\b(?:makes?|making)\s+no\s+sense\b/,
  /\bconfus(?:ed|ing)\b/,
  /\b(?:lost|stuck)\b/,
  /\bno\s+idea\b/,
  /\bnever\s+(?:learnt|learned|seen|done|did|covered|taught|met)\b/,
  /\bwhat\s+does\s+(?:that|this|it)\s+mean\b/,
  /\b(?:huh|unclear)\b/,
]

/** True when the learner is saying, in any words, that it did not land. */
export function isPlea(text: string): boolean {
  const lower = text.trim().toLowerCase()
  if (lower === '') return false
  return PLEAS.some((pattern) => pattern.test(lower)) || PLEAS_ANYWHERE.some((pattern) => pattern.test(lower))
}

export function classifyTurn(text: string): Turn {
  const trimmed = text.trim()
  if (trimmed === '') return 'empty'

  if (trimmed.includes('?')) return 'question'

  const lower = trimmed.toLowerCase()
  if (isPlea(lower)) return 'question'

  const first = lower.split(/[^a-z']+/).filter(Boolean)[0]
  if (first !== undefined && OPENERS.includes(first)) return 'question'

  return 'answer'
}

/** What the screen has watched this learner do on this lesson. */
export interface TurnHistory {
  readonly questionsAsked: number
  readonly emptyAnswers: number
  readonly beatsSeen: number
}

/**
 * Whether to deepen the lesson without being asked.
 *
 * Depth is added when the learner ASKS for it and automatically when their
 * answers show a gap. This is the automatic half, and nothing on screen ever
 * says "difficulty" -- the learner is not being graded, they are being taught.
 *
 * Asking more than once per beat means the lesson is not landing, whatever the
 * raw count. Two empty submits is someone stuck for what to say.
 */
export function strugglingAfter(history: TurnHistory): boolean {
  if (history.emptyAnswers >= 2) return true
  if (history.questionsAsked >= 3) return true
  /* Guarded so the first beat cannot divide by zero. Questions before any beat
   * has been got through still count. */
  if (history.beatsSeen === 0) return history.questionsAsked > 0
  return history.questionsAsked / history.beatsSeen >= 2
}
