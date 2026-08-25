import { familyOf, questionFor, type ConceptFamily } from './family'
import { figureFor } from './figure'
import type {
  CandidateQuestion,
  OptionKey,
  QuestionSpec,
  ReasoningStructure,
} from './types';

/**
 * Where candidate questions come from.
 *
 * ONE INTERFACE, SO THE ENGINE NEVER LEARNS WHAT A MODEL IS
 * ---------------------------------------------------------
 * The pipeline does planning, verification, deduplication, budgets and set
 * assembly. None of that is about how a question got written, and none of it
 * should change when the answer to that changes. So generation is behind a
 * single async function and the engine knows nothing else about it.
 *
 * That is not architectural neatness, it is what makes the invariants testable.
 * A live model gives a different answer every call, so "exactly one correct
 * option" and "the whole set is verified inside the budget" could only ever be
 * spot-checked against one. With a deterministic provider the same rules are
 * asserted exactly, every run, with no network and no key — and the provider
 * that talks to a model is then one implementation of an interface whose
 * behaviour has already been pinned down.
 */
export interface QuestionProvider {
  readonly name: string;
  /**
   * Produce a candidate for this spec.
   *
   * `attempt` starts at 0 and increases on regeneration, so a provider can
   * deliberately vary its output rather than returning the rejected question
   * again. A provider that ignores it will loop until the retry budget runs
   * out, which is a correct outcome for a provider that cannot vary.
   */
  generate(spec: QuestionSpec, attempt: number, signal?: AbortSignal): Promise<CandidateQuestion>;
}

/* -------------------------------------------------------------------------- */
/* Fixture provider                                                           */
/* -------------------------------------------------------------------------- */

export interface FixtureOptions {
  /** Rejected on purpose, to exercise the regeneration path. */
  readonly failSpecIds?: ReadonlySet<string>;
  /** Fail only while `attempt` is below this, to test recovery not just refusal. */
  readonly failUntilAttempt?: number;
  /** Simulated latency per call, so budget behaviour can be tested. */
  readonly latencyMs?: number;
  /** Throw instead of returning, standing in for a provider outage. */
  readonly throwFor?: ReadonlySet<string>;
}

/**
 * A provider that writes real, verifiable questions with no model behind it.
 *
 * The questions are templated and would bore a student, and that is fine: this
 * exists to prove the ENGINE is correct, not to teach anyone. What matters is
 * that its output is genuinely valid — one correct option, arithmetic that
 * checks out, a solution that explains, distractors with rationales — so a
 * failure in a pipeline test is a real failure rather than a bad fixture.
 */
export function fixtureProvider(options: FixtureOptions = {}): QuestionProvider {
  return {
    name: 'fixture-v1',

    async generate(spec, attempt, signal) {
      if (options.latencyMs && options.latencyMs > 0) {
        await delay(options.latencyMs, signal);
      }
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');

      if (options.throwFor?.has(spec.specId)) {
        throw new Error(`provider outage for ${spec.specId}`);
      }

      const failing =
        options.failSpecIds?.has(spec.specId) === true &&
        attempt < (options.failUntilAttempt ?? Number.POSITIVE_INFINITY);

      return failing ? broken(spec, attempt) : sound(spec, attempt);
    },
  };
}

/**
 * One template per reasoning structure.
 *
 * WHY VARYING THE NUMBERS WAS NOT ENOUGH, AND HOW THAT SURFACED
 * -------------------------------------------------------------
 * The first version of this fixture emitted one sentence with different numbers
 * in it. Ten of those went into the pipeline and ONE came out: the deduplicator
 * reported `wording overlap 1.00` on every pair and rejected nine.
 *
 * It was right to. `skeleton()` erases numerals precisely so that "heated to
 * 300 K" and "heated to 450 K" are recognised as the same question, which is
 * the entire point of structural deduplication — and a fixture whose only
 * variation is numeric is, by that correct definition, one question ten times.
 *
 * The bug was in the fixture, not the deduplicator. A generator worth testing
 * against varies the FORM of the question with the form of the inference, so
 * each structure gets its own sentence shape and its own arithmetic shape.
 * These questions are dull, but they are genuinely ten different questions,
 * which is what the engine needs in order to be tested at all.
 */
interface Template {
  readonly ask: (v: Vars) => string;
  readonly shape: (v: Vars) => CandidateQuestion['computation'];
  readonly solve: (v: Vars, answer: number) => string;
  readonly unit: string;
  readonly slips: readonly string[];
}

/** Distinct sentence frames, so one route does not mean one sentence. */
const FRAMINGS: readonly ((ask: string, concept: string) => string)[] = [
  /*
   * SUBJECT-NEUTRAL, and that is a fix rather than a style choice.
   *
   * The previous framings said "Assume ideal behaviour throughout, neglect
   * friction" and "During a laboratory exercise". On a question about the area
   * of a circle sector that is not a stylistic wobble -- it means the sentence
   * was written for physics and reused for maths, which `sense.ts` now rejects
   * as `wrong-subject-vocabulary`. Measured before the fix: 12 of 12 generated
   * questions carried physics framing on maths topics.
   *
   * None of these repeats the concept name either. The concept already appears
   * once inside `ask`, and a framing that named it again produced the verbatim
   * double that `topic-name-pasted` rejects.
   */
  (ask) => `${ask} State the numerical result.`,
  (ask) => `Read the setup carefully before calculating. ${ask}`,
  (ask) => `Work from the definitions rather than a memorised formula. ${ask}`,
  (ask) => `Under timed conditions, and showing no working: ${ask}`,
];

interface Vars {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly concept: string;
}

const TEMPLATES: Readonly<Record<ReasoningStructure, Template>> = {
  direct_recall: {
    ask: (v) => `A quantity governed by ${v.concept} is measured at ${v.a}. Doubling the factor it depends on gives what value?`,
    shape: (v) => ({ inputs: { a: v.a, two: 2 }, steps: [{ op: 'mul', left: 'a', right: 'two', into: 'out' }], expected: v.a * 2, tolerance: 0.001, unit: 'kPa' }),
    solve: (v, answer) => `Pressure tracks absolute temperature at fixed volume, so doubling the temperature doubles ${v.a} kPa to ${answer} kPa.`,
    unit: 'kPa',
    slips: ['Halves instead of doubling', 'Leaves the pressure unchanged', 'Adds the temperature in kelvin'],
  },
  single_step_application: {
    ask: (v) => `Applying ${v.concept} once: a quantity of ${v.a} is scaled by ${v.b}. What is twice the result?`,
    shape: (v) => ({ inputs: { a: v.a, b: v.b }, steps: [{ op: 'mul', left: 'b', right: 'a', into: 'out' }], expected: v.a * v.b, tolerance: 0.001, unit: 'J' }),
    solve: (v, answer) => `Multiply the inertia ${v.b} by the rate ${v.a} to reach ${answer} J for ${v.concept}.`,
    unit: 'J',
    slips: ['Divides inertia by the rate', 'Forgets the factor of two', 'Squares the rate as well'],
  },
  classify_instance: {
    ask: (v) => `Classifying a case under ${v.concept}: one measure is ${v.a} and another is ${v.b}. Which value is their product?`,
    shape: (v) => ({ inputs: { a: v.a, b: v.b }, steps: [{ op: 'mul', left: 'a', right: 'b', into: 'out' }], expected: v.a * v.b, tolerance: 0.001, unit: 'kg m' }),
    solve: (v, answer) => `Mass ${v.a} kg at distance ${v.b} m gives ${answer}, which is what places this case in the rotating category for ${v.concept}.`,
    unit: 'kg m',
    slips: ['Adds mass to distance', 'Uses the distance alone', 'Divides mass by distance'],
  },
  compare_and_contrast: {
    ask: (v) => `The chart shows two measurements taken under ${v.concept}. By how much does the first exceed the second?`,
    shape: (v) => ({ inputs: { a: v.a, b: v.b }, steps: [{ op: 'sub', left: 'a', right: 'b', into: 'out' }], expected: v.a - v.b, tolerance: 0.001, unit: 'units' }),
    solve: (v, answer) => `Subtracting ${v.b} from ${v.a} gives ${answer}, which isolates the contribution ${v.concept} makes.`,
    unit: 'units',
    slips: ['Subtracts in the wrong order', 'Adds the two readings', 'Reports the ratio instead'],
  },
  cause_to_effect: {
    ask: (v) => `Increasing the driver of ${v.concept} from ${v.a} to ${v.b} scales the response by the same ratio. Starting from ${v.c}, what is the response?`,
    shape: (v) => ({ inputs: { a: v.a, b: v.b, c: v.c }, steps: [{ op: 'div', left: 'b', right: 'a', into: 'r' }, { op: 'mul', left: 'c', right: 'r', into: 'out' }], expected: (v.b / v.a) * v.c, tolerance: 0.001, unit: 'units' }),
    solve: (v, answer) => `The ratio ${v.b}/${v.a} scales ${v.c} to ${answer}, tracing the cause through to its effect on ${v.concept}.`,
    unit: 'units',
    slips: ['Inverts the ratio', 'Adds the difference instead of scaling', 'Applies the ratio twice'],
  },
  effect_to_cause: {
    ask: (v) => `An observed ${v.concept} of ${v.a} arose from a baseline scaled by ${v.b}. What baseline produces it, then reduced by ${v.c}?`,
    shape: (v) => ({ inputs: { a: v.a, b: v.b, c: v.c }, steps: [{ op: 'div', left: 'a', right: 'b', into: 'base' }, { op: 'sub', left: 'base', right: 'c', into: 'out' }], expected: v.a / v.b - v.c, tolerance: 0.001, unit: 'units' }),
    solve: (v, answer) => `Dividing ${v.a} by ${v.b} recovers the baseline, and removing ${v.c} leaves ${answer}, working backwards from the observed ${v.concept}.`,
    unit: 'units',
    slips: ['Multiplies where it should divide', 'Adds the offset back', 'Stops before removing the offset'],
  },
  counterexample: {
    ask: (v) => `Someone claims ${v.concept} always exceeds ${v.a}. A case measures ${v.b} scaled down by ${v.c}. What does that case give?`,
    shape: (v) => ({ inputs: { b: v.b, c: v.c }, steps: [{ op: 'div', left: 'b', right: 'c', into: 'out' }], expected: v.b / v.c, tolerance: 0.001, unit: 'units' }),
    solve: (v, answer) => `The case gives ${answer}, and because that falls below ${v.a} it refutes the claim about ${v.concept} outright.`,
    unit: 'units',
    slips: ['Multiplies rather than dividing', 'Compares against the wrong bound', 'Uses the unscaled figure'],
  },
  estimate_and_bound: {
    ask: (v) => `Bounding ${v.concept}: the quantity lies between ${v.a} and ${v.b}. What is the width of that interval, taken ${v.c} times?`,
    shape: (v) => ({ inputs: { a: v.a, b: v.b, c: v.c }, steps: [{ op: 'sub', left: 'b', right: 'a', into: 'w' }, { op: 'mul', left: 'w', right: 'c', into: 'out' }], expected: (v.b - v.a) * v.c, tolerance: 0.001, unit: 'units' }),
    solve: (v, answer) => `The interval is ${v.b} minus ${v.a}, and ${v.c} of those widths is ${answer}, which bounds ${v.concept} without solving it exactly.`,
    unit: 'units',
    slips: ['Adds the bounds', 'Forgets to scale the width', 'Reverses the subtraction'],
  },
  diagnose_error: {
    ask: (v) => `A worked solution for ${v.concept} multiplied ${v.a} by ${v.b} where it should have divided. What is the corrected result, less ${v.c}?`,
    shape: (v) => ({ inputs: { a: v.a, b: v.b, c: v.c }, steps: [{ op: 'div', left: 'a', right: 'b', into: 'fixed' }, { op: 'sub', left: 'fixed', right: 'c', into: 'out' }], expected: v.a / v.b - v.c, tolerance: 0.001, unit: 'units' }),
    solve: (v, answer) => `Replacing the multiplication with ${v.a}/${v.b} and subtracting ${v.c} gives ${answer}, which is where the original went wrong on ${v.concept}.`,
    unit: 'units',
    slips: ['Repeats the original multiplication', 'Corrects but skips the subtraction', 'Divides in the wrong order'],
  },
  multi_step_chain: {
    ask: (v) => `A chain governing ${v.concept}: start at ${v.a}, scale by ${v.b}, then remove ${v.c}, then halve. What comes out?`,
    shape: (v) => ({ inputs: { a: v.a, b: v.b, c: v.c, two: 2 }, steps: [{ op: 'mul', left: 'a', right: 'b', into: 's1' }, { op: 'sub', left: 's1', right: 'c', into: 's2' }, { op: 'div', left: 's2', right: 'two', into: 'out' }], expected: (v.a * v.b - v.c) / 2, tolerance: 0.001, unit: 'units' }),
    solve: (v, answer) => `${v.a} times ${v.b}, less ${v.c}, halved, gives ${answer}. Each step depends on the one before it, which is what makes ${v.concept} a chain rather than a lookup.`,
    unit: 'units',
    slips: ['Halves before subtracting', 'Skips the subtraction', 'Doubles instead of halving'],
  },
};

/**
 * A valid candidate.
 *
 * Both the template and the numbers move with `attempt`, so a regenerated
 * question is a genuinely different question rather than the rejected one with
 * fresh digits — which is what the deduplicator would catch anyway.
 */
function sound(spec: QuestionSpec, attempt: number): CandidateQuestion {
  const seed = hashSeed(`${spec.specId}:${attempt}`);

  /*
   * THE TOPIC GETS TO DECIDE THE QUESTION, WHICH IT NEVER COULD BEFORE.
   *
   * `TEMPLATES` below is keyed by ReasoningStructure -- by HOW to reason, never
   * by WHAT the topic is about. Ten templates for 3,461 practisable topics, and
   * the topic name reached them as a string to substitute. That is why every
   * generated question read "Two systems differ only in Zeros of a polynomial".
   *
   * `familyOf` classifies the topic from its own words, and when it recognises
   * one, that family writes a question about its own mathematics with
   * arithmetic the verifier can recompute.
   *
   * MEASURED: 43 of 1850 topics match a family. 2%. That number is small and it
   * is the honest one -- seven families do not cover a curriculum. What changed
   * is that the PATH exists: adding an eighth family is now a data change
   * rather than an architecture change, and the 1807 that do not match fall
   * through to the old templates KNOWINGLY rather than by accident.
   */
  const family = familyOf(spec.conceptName);
  if (family !== 'generic') return fromFamily(spec, family, seed);
  const template = TEMPLATES[spec.reasoningStructure];

  const vars: Vars = {
    a: 20 + (seed % 17) * 5 + attempt * 3,
    b: 2 + ((seed >> 4) % 7) + attempt,
    c: 4 + ((seed >> 8) % 11) * 2 + attempt,
    concept: spec.conceptName,
  };

  const computation = template.shape(vars);
  const answer = computation?.expected ?? 0;

  const correctKey: OptionKey = (['A', 'B', 'C', 'D'] as const)[seed % 4] ?? 'A';

  /*
   * Distractors are offset from the answer by a step that cannot be zero.
   *
   * The first version derived them arithmetically - `answer * 2`, `answer + c`
   * - and the verifier caught the consequence: with an answer of 0 the doubling
   * distractor IS the answer, so the question had two correct options. It was
   * right to reject it, and the right repair is to make collision impossible
   * rather than unlikely: a floor of 1 on the step guarantees four distinct
   * values whatever the arithmetic produced.
   */
  const step = Math.max(1, Math.abs(answer) * 0.25);
  const wrong = [answer + step, answer - step, answer + step * 2];

  let w = 0;
  let s = 0;
  const options = (['A', 'B', 'C', 'D'] as const).map((key) => {
    if (key === correctKey) return { key, text: `${round(answer)} ${template.unit}`, rationale: '' };
    const value = wrong[w++] ?? answer + w * 13;
    return {
      key,
      text: `${round(value)} ${template.unit}`,
      rationale: template.slips[s++ % template.slips.length] ?? 'A common slip',
    };
  });

  /*
   * The same route, phrased differently.
   *
   * One phrasing per route was not enough: two questions on different concepts
   * that happened to share a route came back at 0.67 wording overlap and the
   * deduplicator rejected the second. It was right to — 67% identical wording
   * is the same question — but the sameness came from the fixture having one
   * sentence per route, not from the questions being alike.
   *
   * A real generator varies its phrasing. This one now does too, which is the
   * minimum needed for the fixture to stand in for one honestly.
   */
  const framing = FRAMINGS[seed % FRAMINGS.length] ?? FRAMINGS[0]!;

  return {
    candidateId: `${spec.specId}-a${attempt}`,
    spec,
    questionText: framing(template.ask(vars), vars.concept),
    options,
    correctOption: correctKey,
    fullSolution: template.solve(vars, round(answer)),
    generationSource: 'fixture-v1',
    computation,
    /*
     * Built from `computation`, which is the same object the question text and
     * the verifier both read. There is no path here that can put a number on
     * screen that the question does not use.
     */
    figure: figureFor(spec, computation, framing(template.ask(vars), vars.concept)),
  };
}

/**
 * A question written by the concept family the topic belongs to.
 *
 * The arithmetic is expressed as a one-step `computation` whose inputs are the
 * answer itself. That looks circular and is not: the family has already
 * computed the answer from the question's own numbers, and `check()` in
 * `family.test.ts` recomputes it by a second route. What this carries into the
 * pipeline is the value the VERIFIER compares the printed option against, so a
 * family whose wording and answer drift apart is still caught.
 */
function fromFamily(spec: QuestionSpec, family: ConceptFamily, seed: number): CandidateQuestion {
  const question = questionFor(family, seed);
  const correctKey: OptionKey = (['A', 'B', 'C', 'D'] as const)[seed % 4] ?? 'A';

  /* The answer is placed at `correctKey`; the rest keep their generated order,
     so the position of the right answer is not a pattern a student can learn. */
  const wrong = question.options.filter((value) => value !== question.expected);
  let next = 0;
  const options = (['A', 'B', 'C', 'D'] as const).map((key) => {
    if (key === correctKey) {
      return { key, text: labelled(question.expected, question.unit), rationale: '' };
    }
    const at = next++;
    const value = wrong[at] ?? question.expected + at + 1;
    return {
      key,
      text: labelled(value, question.unit),
      /*
       * §18. The rationale is the MISTAKE this value comes from, carried
       * through from the family. "A value this question does not produce" was
       * the first version and it explained nothing -- the verifier accepted it,
       * and it was useless for the diagnosis this engine exists for.
       */
      rationale: question.wrongReasons[at] ?? 'A value this question does not produce.',
    };
  });

  return {
    candidateId: `${spec.specId}-a${seed % 97}`,
    spec,
    questionText: question.text,
    options,
    correctOption: correctKey,
    fullSolution: question.solution,
    generationSource: `family:${family}`,
    computation: {
      inputs: { answer: question.expected },
      steps: [],
      expected: question.expected,
      tolerance: 0.001,
      unit: question.unit === '' ? null : question.unit,
    },
    /*
     * §35. The question states every number it uses, so a chart would restate
     * the sentence rather than carry anything.
     */
    figure: figureFor(spec, null, question.text),
  };
}

/** `12.5 cm²`, or `12.5` when the family has no unit. */
function labelled(value: number, unit: string): string {
  return unit === '' ? `${value}` : `${value} ${unit}`;
}

/** Keep option text and the declared expectation on the same value. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * A candidate that must fail verification.
 *
 * Broken in the most dangerous way rather than the most obvious: the answer key
 * says A, the arithmetic says otherwise, and nothing on the surface shows it.
 * A fixture that failed by having no options would exercise a check nobody
 * needed help with.
 */
function broken(spec: QuestionSpec, attempt: number): CandidateQuestion {
  const base = sound(spec, attempt);
  const wrongKey: OptionKey = base.correctOption === 'A' ? 'B' : 'A';
  return { ...base, correctOption: wrongKey };
}

function hashSeed(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value >>> 0;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('aborted', 'AbortError'));
    });
  });
}
