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

export type Turn = 'question' | 'answer' | 'empty' | 'unclear'

/**
 * Tokens people type instead of answering. Greetings, acknowledgement, noise.
 *
 * A LIST, AND SAID TO BE ONE. A list is exactly as good as the imagination of
 * whoever last edited it, so it is INCOMPLETE by construction and always will
 * be. It feeds the inert outcome rather than an active one for exactly that
 * reason: a spelling nobody thought of is treated as an answer, which is the
 * old behaviour, so nothing regresses when the list falls short.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT MAY NEVER BE IN HERE: A REPLY THE PRODUCT'S OWN QUESTION ASKS FOR.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * This set used to contain `yes`, `no`, `yeah`, `yep`, `nope`, `sure`, `ok`,
 * `okay`, `k` and `kk`, and every checkpoint this product asks is a YES/NO
 * QUESTION. All fifteen strings `beats.ts` can produce are closed:
 *
 *     ASK_BY_TONE   "Did that land?"   "That is the result -- is it clear?"
 *     ASK_BY_FORM   "Does that follow?"   "Making sense so far?"
 *                   "Can you see that in the numbers?"
 *     UNNAMED_NEXT  "There is a bit more -- shall we carry on?"
 *
 * So the learner read "Did that land?", typed "yes", and was told "I didn't
 * catch that." The beat did not move. `beats.ts:444` says of the depth offer
 * that "saying no here loses them nothing" -- the design EXPECTS "no", and this
 * refused it.
 *
 * That is the worse failure of the two, and the direction matters. Noise
 * getting through wastes one beat and the learner can still ask. A refused
 * answer strands them with nothing that works.
 *
 * The rule this leaves behind needs no new vocabulary, because the two sets are
 * different in kind. Noise is UNBOUNDED -- there are endlessly many ways to say
 * nothing, so this list can never be finished. The replies to a yes/no question
 * are BOUNDED BY THE QUESTION the product itself wrote. Anything in the second
 * set is not noise, whatever it looks like in isolation.
 */
const FILLER = new Set([
  'hi', 'hey', 'hello', 'yo', 'sup', 'hiya',
  'lol', 'haha', 'hmm', 'hm', 'huh', 'oh', 'ah', 'wow', 'nice', 'cool',
  'idk', 'dunno', 'asdf', 'test', 'testing', 'thanks', 'thank', 'ty', 'please',
])

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

export function classifyTurn(text: string): Turn {
  const trimmed = text.trim()
  if (trimmed === '') return 'empty'

  if (trimmed.includes('?')) return 'question'

  const lower = trimmed.toLowerCase()
  if (PLEAS.some((pattern) => pattern.test(lower))) return 'question'

  const first = lower.split(/[^a-z']+/).filter(Boolean)[0]
  if (first !== undefined && OPENERS.includes(first)) return 'question'

  /*
   * THE FOURTH OUTCOME, AND WHY IT HAD TO EXIST.
   *
   * This function used to end `return 'answer'`. It recognised a question three
   * ways and called EVERYTHING ELSE an answer -- so "hi" advanced the lesson,
   * and so did "ok", "lol" and "asdf". The learner had said nothing and the
   * lecture moved on. No gate could see it: the type was satisfied ('answer' is
   * a valid Turn), the pixels were correct, and the mutation gate cannot flip a
   * branch that was never written.
   *
   * A default arm is not a decision. It is a guess wearing a decision's
   * clothes, and this one guessed wrong every time somebody said hello.
   *
   * `unclear` is INERT by contract: it does not advance the beat and it does
   * not answer a doubt. The screen asks again instead of pretending.
   *
   * WHICH WAY THE REMAINING DOUBT FALLS, DELIBERATELY. Multi-word text is
   * treated as an answer, because refusing a genuine answer strands the learner
   * -- a cure worse than the defect. Only a SINGLE contentless token goes to
   * `unclear`. A number is content whatever its length: "8" answers a question,
   * "k" does not.
   */
  const words = lower.split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'unclear'
  if (words.length === 1) {
    const only = words[0] ?? ''
    const bare = only.replace(/[^a-z0-9']/g, '')
    if (bare === '') return 'unclear'
    if (/[0-9]/.test(bare)) return 'answer'
    /*
     * NO LENGTH RULE. This said `|| bare.length <= 2`, which refused every
     * two-letter token that was not a digit -- so `pi`, `pH`, `Na`, `eV` and
     * `CO` were all "unclear", and those are the names a science lesson asks
     * about by name. It also refused `ok`, `no` and `k` a second time, after
     * the list above already had them.
     *
     * Length is not evidence of emptiness. It was standing in for "I could not
     * think of every filler word", and that is what the list is for -- honestly
     * incomplete rather than dressed up as a measurement.
     */
    if (FILLER.has(bare)) return 'unclear'
  }

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
