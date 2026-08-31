/* The teaching vocabulary, and the policy that picks from it.
 *
 * WHERE THIS CAME FROM
 *   `learning-os/src/learning_os/llm/contract.py` defines eleven strategies and
 *   ten diagnoses. That engine has never run -- it is instantiated nowhere
 *   outside its own tests -- so the code is not reused, the THINKING is. The
 *   vocabulary lives here now and becomes what the server tells the model to
 *   do, which is the only way it reaches a student.
 *
 * WHY THE SERVER CHOOSES AND NOT THE BROWSER
 *   Teaching policy belongs next to the model that carries it out, and the
 *   browser should not be able to ask for a strategy the server does not
 *   support. The chosen strategy is RETURNED with the lesson, so what the
 *   server decided is observable rather than guessed at.
 *
 * WHY DETERMINISTIC
 *   A student who opens the same concept twice in the same state gets the same
 *   teaching. A strategy picked at random cannot be explained to them and
 *   cannot be debugged when it teaches badly.
 */

/** The eleven, in the order learning-os declares them. */
export const STRATEGIES = [
  'worked_example',
  'broken_example_repair',
  'transfer_challenge',
  'change_representation',
  'contrast',
  'decomposition',
  'analogy',
  'guided_reasoning',
  'prerequisite_repair',
  'misconception_repair',
  'new_context',
] as const

export type Strategy = (typeof STRATEGIES)[number]

/** The ten, in the order learning-os declares them. */
export const DIAGNOSES = [
  'term_gap',
  'concept_gap',
  'prerequisite_gap',
  'misconception',
  'causal_reasoning_failure',
  'procedural_failure',
  'representation_failure',
  'language_failure',
  'cognitive_overload',
  'transfer_failure',
] as const

export type Diagnosis = (typeof DIAGNOSES)[number]

/** What the server knows about this student and this concept, right now. */
export interface TeachingState {
  /** How many times this concept has been opened, including this one. */
  readonly attempts?: number
  /** Set when the concept was carried over from an earlier day unfinished. */
  readonly carriedFrom?: string
  /** A named failure, when something has identified one. */
  readonly diagnosis?: Diagnosis | string
  /**
   * Every approach this learner has ALREADY been taught this concept with.
   *
   * WHY A COUNT WAS NOT ENOUGH, AND THIS IS.
   *   Selection used to be `attempts` alone, so every attempt from the third
   *   onwards returned `analogy` -- ask four times, be taught by analogy four
   *   times. "Never repeat" is not a claim about how many times she asked; it
   *   is a claim about what she has already been shown, and no count can carry
   *   that.
   *
   * OPTIONAL, SO NOTHING THAT EXISTS CHANGES. A caller that does not know the
   * history gets exactly the answer it always got -- with nothing known about
   * what was tried, the count really is the only signal there is. Only a
   * caller that knows can do better, and now it can.
   *
   * Typed as plain strings because it arrives from stored data, which outlives
   * the code that wrote it. Anything unrecognised is ignored rather than
   * trusted; see `alreadyTried`.
   */
  readonly alreadyUsed?: readonly string[]
}

/**
 * A named diagnosis is the most specific thing anyone knows, so it outranks
 * every count-based rule. A student who believes something wrong is not helped
 * by a fourth explanation of the topic in general.
 */
const FOR_DIAGNOSIS: Partial<Record<Diagnosis, Strategy>> = {
  misconception: 'misconception_repair',
  prerequisite_gap: 'prerequisite_repair',
  term_gap: 'prerequisite_repair',
  representation_failure: 'change_representation',
  language_failure: 'change_representation',
  cognitive_overload: 'decomposition',
  procedural_failure: 'worked_example',
  causal_reasoning_failure: 'guided_reasoning',
  transfer_failure: 'new_context',
  concept_gap: 'decomposition',
}

function isDiagnosis(value: unknown): value is Diagnosis {
  return typeof value === 'string' && (DIAGNOSES as readonly string[]).includes(value)
}

/**
 * The strategy this attempt should use.
 *
 * Each rule is a claim about teaching that can be argued with, which is what
 * makes it testable:
 *
 *   first meeting              show the work before asking for it
 *   came back unfinished       it was too big; break it down
 *   twice and still not landing the words are not working; change the form
 *   three or more              reach outside the topic for something familiar
 */
function isStrategy(value: unknown): value is Strategy {
  return typeof value === 'string' && (STRATEGIES as readonly string[]).includes(value)
}

/**
 * What she has really been taught with, out of whatever was handed in.
 *
 * ANYTHING UNRECOGNISED IS DROPPED, NOT TRUSTED. This history comes from stored
 * data, and stored data outlives the code that wrote it: a strategy that was
 * renamed, or a half-written record, must never stop a learner being taught.
 */
function alreadyTried(state: TeachingState): ReadonlySet<Strategy> {
  return new Set((state.alreadyUsed ?? []).filter(isStrategy))
}

/**
 * The order to reach for a fresh approach in, once the obvious one is spent.
 *
 * IT IS A TEACHING ORDER, NOT AN ARBITRARY ONE. It walks from showing, through
 * changing the form, to reaching outside the topic altogether -- the same
 * progression the count-based rules already encode, extended past where they
 * stopped. The two diagnosis-driven repairs sit last because they answer a
 * NAMED failure; reaching for them with no diagnosis is a guess.
 *
 * EVERY STRATEGY APPEARS HERE EXACTLY ONCE, AND THAT IS PROVEN RATHER THAN
 * PROMISED. `teaching.test.ts` "gives a genuinely new approach every time"
 * feeds each choice back as history for as many turns as there are strategies
 * and asserts the set of answers is the WHOLE vocabulary. A name missing from
 * this list would be a strategy the product could never reach, and the count
 * would come up short; a name listed twice would be a repeat wearing a
 * disguise, and the no-repeat assertion would catch it on the second visit.
 */
const WHEN_THE_OBVIOUS_ONE_IS_SPENT: readonly Strategy[] = [
  'worked_example',
  'decomposition',
  'change_representation',
  'guided_reasoning',
  'contrast',
  'analogy',
  'new_context',
  'broken_example_repair',
  'transfer_challenge',
  'prerequisite_repair',
  'misconception_repair',
]

/** The choice that ignores history — the rules exactly as they always were. */
function withoutHistory(state: TeachingState): Strategy {
  if (isDiagnosis(state.diagnosis)) {
    const named = FOR_DIAGNOSIS[state.diagnosis]
    if (named !== undefined) return named
  }

  const attempts = Number.isFinite(state.attempts) ? Math.max(0, Number(state.attempts)) : 0

  /* Backlog beats the attempt count. It came back because it was not finished,
   * and teaching it the same way again is exactly what already did not work. */
  if (state.carriedFrom !== undefined && attempts <= 1) return 'decomposition'

  if (attempts >= 3) return 'analogy'
  if (attempts === 2) return 'change_representation'
  return 'worked_example'
}

export function chooseStrategy(state: TeachingState): Strategy {
  const spent = alreadyTried(state)

  /* THE BEST ANSWER FIRST, AND ONLY REPLACED IF SHE HAS HAD IT.
   *
   * A named diagnosis still outranks everything, because it is the most
   * specific thing anyone knows. History only overrules it once that exact
   * repair has been given -- repairing the same misconception the same way
   * twice is precisely the repeat this rule exists to prevent. */
  const best = withoutHistory(state)
  if (!spent.has(best)) return best

  for (const candidate of WHEN_THE_OBVIOUS_ONE_IS_SPENT) {
    if (!spent.has(candidate)) return candidate
  }

  /* EVERY APPROACH HAS BEEN USED, AND SAYING SO HONESTLY MATTERS.
   *
   * There are eleven. A twelfth ask cannot have a new one, and inventing a
   * value outside the vocabulary would hand the model an instruction that does
   * not exist -- a lesson with no teaching shape at all.
   *
   * Past this point variation has to come from the WORDING rather than the
   * approach, which is a different mechanism and not this function's job. What
   * this function must never do is fail. */
  return best
}

/**
 * What to actually DO, in words the model can act on.
 *
 * Never the strategy's own name: "use the strategy worked_example" tells a
 * model nothing. And never a word about appearance -- Law 3 gives the model
 * meaning only, and a lesson carrying presentation is rejected before it
 * reaches the student.
 */
const INSTRUCTIONS: Record<Strategy, string> = {
  worked_example:
    'Work one complete example through from start to finish, showing every step and saying why each step follows from the one before it.',
  broken_example_repair:
    'Show an attempt that goes wrong at exactly one step, then find that step and explain what the mistake assumed.',
  transfer_challenge:
    'Teach the idea briefly, then apply it to a situation the student has not seen, so the idea is what carries rather than the example.',
  change_representation:
    'Explain the same idea a second way: if it was described in words, use a picture or a table; if in symbols, use plain language.',
  contrast:
    'Put the idea beside the thing it is most often confused with and make the one difference that separates them impossible to miss.',
  decomposition:
    'Break the idea into the smallest pieces that still mean something, teach each on its own, then put them back together.',
  analogy:
    'Begin with something ordinary the student already understands, map it part by part onto the idea, and say where the comparison stops being true.',
  guided_reasoning:
    'Ask a short chain of questions that leads the student to the conclusion, giving the reason after each step rather than the answer.',
  prerequisite_repair:
    'Teach the earlier idea this one depends on first, then connect it forward to the idea being studied.',
  misconception_repair:
    'State the wrong belief plainly, show the case where it gives the wrong answer, then give the correct rule and why it holds instead.',
  new_context:
    'Teach the idea inside a setting the student has not met before, so recognising it does not depend on remembering the original example.',
}

export function instructionFor(strategy: Strategy): string {
  return INSTRUCTIONS[strategy]
}
