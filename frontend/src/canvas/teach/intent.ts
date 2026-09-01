/**
 * WHAT THE LEARNER ACTUALLY ASKED FOR, WHICH IS NOT ALWAYS A LESSON.
 *
 * THE DEFECT THIS EXISTS TO FIX, IN THE OWNER'S WORDS: "the model is
 * considering everything as a lecture."
 *
 * `conceptRequest` opened with one sentence, unconditionally:
 *
 *   "Teach ONE atomic concept that moves a learner toward answering: <question>"
 *
 * That sentence is right for "explain photosynthesis" and wrong for every other
 * thing a person types into a box. "what is 7 x 8", "give me an example",
 * "quiz me on tenses", "I don't get step 3", "difference between mass and
 * weight" -- all four arrived at the model as a request for the same artifact:
 * an anchor, a definition, something shown, a checkpoint and two branches. A
 * learner who wanted one number got a lesson; a learner who was STUCK got the
 * same explanation that had just failed them, in the shape that had just failed
 * them.
 *
 * WHY THIS IS CODE AND NOT A PROMPT LINE. "Work out what they want" is exactly
 * the kind of instruction a model obeys inconsistently, and an inconsistent
 * classification is worse than none: the shape of the reply would change from
 * asking to asking for reasons no one could reproduce or test. This is pure,
 * total, and seeded by nothing, so `intent.test.ts` can pin every branch and a
 * misreading is a failing test rather than a bad lesson.
 *
 * WHAT IT DOES NOT DO. It does not decide what is TRUE, and it cannot: every
 * directive below is about the SHAPE of the reply -- what to open with, what to
 * end with, how long -- which is the same line `route.ts` draws for the same
 * reason. An axis that could alter content would be a machine for generating
 * confident falsehoods.
 *
 * IT NEVER REFUSES. Anything it cannot place is `teach`, which is the behaviour
 * that shipped before this file existed. A question this cannot read is still
 * taught; it is not turned away. That is invariant R3 -- every input gets a
 * reply -- and it is the reason the fallback is a real answer rather than a
 * "please rephrase".
 */

/** What kind of thing the learner is asking for. */
export type Ask =
  /** "explain X", "how does X work" — the full concept. The default. */
  | 'teach'
  /** "what is X", "define X" — the shortest true answer, then stop. */
  | 'define'
  /** "give me an example of X" — the instance is the answer, not an aside. */
  | 'example'
  /** "quiz me", "practice questions" — questions to answer, not prose to read. */
  | 'practice'
  /** "I don't get X", "I'm stuck" — a previous explanation already failed. */
  | 'stuck'
  /** "X vs Y", "difference between X and Y" — two things, side by side. */
  | 'compare'
  /** "why does X happen" — a chain of reasons, each licensed by the last. */
  | 'why'

export interface Intent {
  readonly ask: Ask
  /**
   * What to tell the model about the SHAPE of the reply. Never about content.
   *
   * Written as one imperative sentence because it is concatenated into a prompt
   * beside `route.ts`'s directive, and two paragraphs of guidance compete with
   * each other instead of composing.
   */
  readonly directive: string
}

/**
 * WHY THE ORDER OF THESE TESTS IS THE WHOLE ALGORITHM.
 *
 * Real questions match several patterns at once, and the FIRST match wins, so
 * the sequence encodes which reading beats which. Every ordering below was
 * chosen against a sentence that would otherwise be read wrong:
 *
 *   "what is the difference between mass and weight"
 *       matches `define` ("what is") and `compare` ("difference between").
 *       COMPARE WINS: answering it with a definition of "difference" is not an
 *       answer to anything anyone asked.
 *
 *   "why is the sky blue"
 *       matches `why`. Not `define`, because "why" asks for the mechanism and a
 *       definition of "sky" is not it.
 *
 *   "I don't understand what a logarithm is"
 *       matches `stuck` and `define`. STUCK WINS: they have already been given
 *       the definition -- that is what they are telling us -- so handing it back
 *       is the one reply guaranteed not to help.
 *
 *   "give me an example of a why question"
 *       matches `example` and `why`. EXAMPLE WINS, because the thing asked for
 *       is an instance; "why" is describing the instance, not the request.
 *
 * `stuck` is therefore first, `compare` and `example` before the wh-words, and
 * `define` last of the specific readings -- it is the broadest and would
 * swallow the others.
 */
const READINGS: readonly { ask: Ask; test: RegExp; directive: string }[] = [
  {
    ask: 'stuck',
    /* The words a person uses when an explanation has already failed them.
       `still` is included on purpose: "still confused" is the second failure. */
    test: /\b(i (?:do ?n[o']?t|don't|dont|can ?n[o']?t|cannot|can't) (?:get|understand|follow|see)|i(?:'m| am)? ?(?:so |still |really )?(?:stuck|lost|confused)|makes? no sense|not making sense|still (?:confused|lost|stuck)|no idea what)\b/i,
    directive:
      'They have ALREADY been given an explanation of this and it did not land. Do not ' +
      'restate it — open on something concrete they can check, come at it a different ' +
      'way, and name the step people trip on.',
  },
  {
    ask: 'compare',
    /* `rather than` IS NOT HERE, and was. It appears in as many one-subject
       requests as two-subject ones -- "explain entropy simply rather than
       technically" names one thing and a manner -- and `compare` is tested
       before `why`, `define` and the default, so it won a sentence that is not
       a comparison and the model was told to tabulate a second thing that does
       not exist. The remaining forms all require two named things on either
       side of them. */
    test: /\b(difference between|differences between|compared? (?:to|with)|versus|vs\.?|as opposed to|which is better|same as)\b/i,
    directive:
      'They asked about TWO things. Put both in one table or figure, row by row on the ' +
      'same criteria, so the difference is visible rather than described. Name what ' +
      'they share first.',
  },
  {
    ask: 'practice',
    /* NOT the bare word. `practi[sc]e` alone matched "how does this work in
       practice", which asks for the real-world case and is the opposite of a
       request to be tested -- and the directive then told the model to keep the
       explanation to "the smaller half". Every form below either names practice
       AS the thing wanted or carries an object with it. */
    test: /\b(quiz me|test me|give me (?:some )?(?:questions|problems|exercises)|practi[sc]e (?:questions|problems|exercises|sums)|(?:questions|problems|exercises|sums) (?:on|for|about)|let me practi[sc]e|want to practi[sc]e|mock|worksheet|drill)\b/i,
    /*
     * WRITTEN TO FIT THE GATE, NOT TO FIGHT IT.
     *
     * This used to end "The explanation is the smaller half of this reply",
     * and `conceptIssues` does not allow that: it refuses any concept without
     * exactly one `definition` block, a block that SHOWS, and two named
     * branches. So the prompt asked for one shape and the gate demanded
     * another, and the learner paid for the disagreement -- measured on this
     * build, "quiz me on the water cycle" reached 200 only through the salvage
     * ladder and was shown "I could not put all of this together properly".
     *
     * The gate is the floor and is not loosened for an ask. What changes is
     * what is asked for: everything below is expressible INSIDE a concept --
     * a tight definition, a worked case as the thing shown, and a checkpoint
     * that is a real problem rather than "do you understand". That is a
     * practice reply and a valid concept at the same time.
     */
    directive:
      'They asked to PRACTISE, not to read. State only what they need to attempt it, show ' +
      'a WORKED case with real numbers, and make the checkpoint a problem they must ' +
      'solve. Both branches offer more problems.',
  },
  {
    ask: 'example',
    test: /\b(give me (?:an?|some|one) example|for example|an example of|examples of|show me (?:an?|one|some)|what(?:'s| is) an example|sample of)\b/i,
    directive:
      'The EXAMPLE is the answer, not an illustration of one. Open with one concrete ' +
      'worked instance, complete and checkable, and name the idea only afterwards.',
  },
  {
    ask: 'why',
    /* `how come` and `what causes` are the same question in other words. */
    test: /\b(why (?:do|does|is|are|did|was|were|would|can|can't|cannot)?|how come|what causes|what makes|reason (?:why|that|for))\b/i,
    directive:
      'They asked for a REASON, so the answer is a chain, not a fact. Ordered steps, each ' +
      'saying what licenses it, ending at the thing they asked about.',
  },
  {
    ask: 'define',
    /* Deliberately the narrow forms. "what is going on with X" is not a request
       for a definition, and `\b(a|an|the)?\s*\w` keeps this to a named thing. */
    test: /^(?:\s*)(?:what(?:'s| is| are)|define|definition of|meaning of|what do(?:es)? .{1,30} mean)\b/i,
    directive:
      'They asked WHAT something is. Lead with the shortest true statement of it in plain ' +
      'words, then show one instance. The definition is the first thing on the page.',
  },
]

/**
 * The default, and it is a real teaching instruction rather than an absence.
 *
 * Everything unrecognised lands here, so this is the single commonest thing the
 * model is told. It says what the reply owes: reach the learner before teaching
 * them, which `teaching-patterns.md` records as the biggest gap the canvas had
 * -- "every lesson began at the definition, which means every lesson began on
 * unfamiliar ground."
 */
const TEACH: Intent = {
  ask: 'teach',
  directive:
    'Open on ground they already hold — something they can already read or believe — ' +
    'and turn it into the question this idea answers, so the definition arrives as the ' +
    'answer rather than a fact to accept.',
}

/**
 * Read what the learner asked for.
 *
 * TOTAL. Every string returns an `Intent`, including the empty one, because the
 * caller is a teaching path and a classifier that can fail is a path that can
 * refuse. See the header: unrecognised is `teach`, which is what shipped before.
 */
export function readTheAsk(question: string): Intent {
  const said = question.trim()
  if (said === '') return TEACH
  for (const reading of READINGS) {
    if (!reading.test.test(said)) continue
    return { ask: reading.ask, directive: reading.directive }
  }
  return TEACH
}

/**
 * The directive for an ask, whoever decided it.
 *
 * `readTheAsk` returns a whole `Intent`, which is right when the regex is the
 * one deciding. When the MODEL decides -- see `readTheAskWithModel` -- what
 * comes back is one word, and the directive has to be looked up rather than
 * carried. One table, both callers, so the two can never drift into telling the
 * model two different things about the same ask.
 */
export function directiveFor(ask: Ask): string {
  if (ask === 'teach') return TEACH.directive
  return READINGS.find((reading) => reading.ask === ask)?.directive ?? TEACH.directive
}

/** Every ask, for the classifier prompt and for anything that must cover them all. */
export const ASKS: readonly Ask[] = [
  'teach',
  'define',
  'example',
  'practice',
  'stuck',
  'compare',
  'why',
]

/**
 * EVERY READING, AS THE MODEL IS SHOWN THEM.
 *
 * THE FRAME THIS BREAKS. The first design read the ask BEFORE the call and put
 * one directive in the prompt, because the prompt has to be built before the
 * request. That constraint is real; the conclusion drawn from it was not. It
 * forced the reading to be done by something that is not the model -- first a
 * regex, which got five of eight real student strings wrong, then a second
 * model call, which broke seven suites that count authoring turns and put a
 * question in front of every lesson the product writes.
 *
 * Both were solving "how do we tell the model which shape to write". The
 * question worth asking was "why are WE deciding at all". The model is already
 * being called, already reads the student's exact words, and already handles
 * misspellings, abbreviations and Hinglish. So it is shown all seven readings
 * and picks, inside the one call that was always going to happen: no second
 * request, no latency, no test double displaced, and gibberish is read by the
 * only thing in the system that can read gibberish.
 *
 * THE PATTERNS STAY, AS A HINT AND NEVER AS THE ANSWER. `readTheAsk` is exact
 * and free and it is right about clean English, so its reading is offered --
 * and explicitly overridable, because on "sir mujhe samajh nahi aaya" it is
 * wrong and the model is not.
 */
export function askMenu(hint: Ask): string {
  /*
   * THE MENU IS PAID FOR ONLY WHERE IT CAN HELP.
   *
   * MEASURED: this section is 477 of the prompt's 1,778 tokens -- 27% -- and it
   * is byte-identical on every request. It exists so the MODEL can read an ask
   * the patterns got wrong, and it earns that on "sir mujhe samajh nahi aaya",
   * where the patterns fall through to `teach` and a lecture is the wrong
   * reply. It earns nothing on "quiz me on tenses", where the patterns are
   * already right and seven worked directives are spent re-deriving a word the
   * code has in hand.
   *
   * SO THE FALLBACK IS THE SIGNAL. `readTheAsk` returns `teach` in exactly two
   * cases: a plain topic, and a question it could not read. Both are the cases
   * where the model's judgement is worth 477 tokens. Every other reading is one
   * the patterns matched explicitly, and there the model gets the directive
   * itself plus the other six names and permission to switch -- which is all it
   * needs to overrule a match, at roughly a fifth of the cost.
   *
   * NOTHING IS TAKEN AWAY FROM THE HARD CASE. The learners this product is for
   * are the ones who misspell and code-mix, they land on `teach`, and they get
   * the whole menu. The saving comes from the requests that never needed it.
   */
  if (hint !== 'teach') return oneReading(hint)
  return [
    'FIRST, WHAT KIND OF REPLY DID THEY ASK FOR?',
    '',
    'They may misspell, abbreviate ("diff b/w", "eg", "wat"), type phonetically, or mix',
    'English with an Indian language written in Latin script — Hindi, Tamil, Bengali,',
    'Marathi, Telugu, Punjabi, Gujarati ("samajh nahi aaya", "explain karo", "puriyala").',
    'Read what they MEAN. Someone who did not understand is "stuck", in any language.',
    '',
    ...ASKS.map((ask) => `- ${ask}: ${directiveFor(ask)}`),
    '',
    'A word-pattern check could not place this one, so it is on you to read it.',
    'Follow the one you pick for the rest of this reply.',
  ].join('\n')
}

/**
 * The short form: the reading the patterns matched, and the door out of it.
 *
 * The other six are named but not explained. A model does not need a paragraph
 * about `compare` in order to notice that a question names two things -- it
 * needs to know `compare` is available and that it may take it. The paragraph
 * is only worth its tokens when nothing has been matched at all.
 */
function oneReading(hint: Ask): string {
  return [
    `WHAT THEY ASKED FOR: ${directiveFor(hint)}`,
    '',
    `A word-pattern check reads this one as "${hint}". It knows only clean English, so`,
    'OVERRIDE IT whenever their actual words disagree — they may misspell, abbreviate',
    '("diff b/w", "eg", "wat") or mix in any Indian language written in Latin script',
    '("samajh nahi aaya", "puriyala", "bujhi nai"). Read what they MEAN.',
    `The other readings, if one fits better: ${ASKS.filter((a) => a !== hint).join(', ')}.`,
  ].join('\n')
}
