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
export function chooseStrategy(state: TeachingState): Strategy {
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
