import { describe, expect, it } from 'vitest';

import { checkFigure } from '../../canvas/spec/figure';
import { REPRESENTATIONS } from '../../canvas/spec/representations';
import { figureFor } from './figure';
import { asChapterId, asSubjectId, asTopicId } from './ids';
import { legalRepresentations } from './representation';
import { REASONING_STRUCTURES, type NumericComputation, type QuestionSpec } from './types';

/**
 * THE FIGURE A QUESTION DRAWS, AND WHY IT MUST COME FROM THE SAME NUMBERS.
 *
 * `engine/representation.ts` decided which pictures a concept may legally use
 * and banned an all-text set. It was fully tested and had ZERO non-test
 * importers, so the ban never fired once: no question carried a figure at all,
 * and there was nothing for it to check.
 *
 * Wiring the ban without first giving questions a figure would have refused
 * every session in the product, which is why this comes first.
 *
 * THE ONE RULE THAT OUTRANKS EVERY OTHER HERE
 * -------------------------------------------
 * The figure is built from `computation.inputs` -- the SAME values the question
 * text is written from. A diagram showing different numbers from the question
 * beside it is worse than no diagram: it looks authoritative and contradicts
 * the thing it illustrates, and a student has no way to tell which half is
 * lying. Decoration drawn from fresh random numbers would pass a test that only
 * asked "is there a figure".
 */

const SPEC: QuestionSpec = {
  specId: 'gas-1',
  topicId: asTopicId('gas-laws'),
  chapterId: asChapterId('gases'),
  subjectId: asSubjectId('physics'),
  conceptId: 'gas-laws--pressure',
  conceptName: 'pressure',
  questionType: 'standard',
  difficultyTarget: 'medium',
  reasoningStructure: 'single_step_application',
  prerequisites: [],
  misconceptionTested: null,
};

const COMPUTATION: NumericComputation = {
  inputs: { a: 120, b: 5, c: 30 },
  steps: [
    { op: 'mul', left: 'a', right: 'b', into: 'scaled' },
    { op: 'sub', left: 'scaled', right: 'c', into: 'out' },
  ],
  expected: 570,
  tolerance: 0.001,
  unit: 'kPa',
};

/** Every number that appears anywhere in a figure's data. */
function numbersIn(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numbersIn);
  if (value && typeof value === 'object') return Object.values(value).flatMap(numbersIn);
  return [];
}

describe('a question draws a picture of its own numbers', () => {
  it('puts every input value into every figure that plots values', () => {
    /*
     * THE LOAD-BEARING ASSERTION. A generator that drew a nice-looking chart
     * from fresh random numbers would satisfy every other test in this file.
     *
     * RUN OVER EVERY REASONING STRUCTURE, because a mutant proved one was not
     * enough: dropping an input from the grouped-bar branch survived while this
     * only checked the default structure, which routes to a plain bar. Three
     * of the four branches were unmeasured.
     *
     * A flow diagram is excluded and only a flow diagram: it has no axis, so
     * its numbers travel in the step labels as text. That exclusion is checked
     * by the next test rather than assumed here.
     */
    for (const structure of REASONING_STRUCTURES) {
      const figure = figureFor({ ...SPEC, reasoningStructure: structure }, COMPUTATION);
      expect(figure, structure).not.toBeNull();
      if (figure!.data.shape === 'process') continue;

      const drawn = new Set(numbersIn(figure!.data));
      for (const value of Object.values(COMPUTATION.inputs)) {
        expect(drawn.has(value), `${structure}: input ${value} is not in the figure`).toBe(true);
      }
    }
  });

  it('carries the numbers in the labels when the shape has no axis', () => {
    /*
     * The other half of the exclusion above. Without this, a flow diagram could
     * quietly stop mentioning the given values and nothing would notice.
     */
    const figure = figureFor({ ...SPEC, reasoningStructure: 'multi_step_chain' }, COMPUTATION);
    const labels = JSON.stringify(figure!.data);

    for (const value of Object.values(COMPUTATION.inputs)) {
      expect(labels, `input ${value} is not named anywhere in the diagram`).toContain(String(value));
    }
  });

  it('never invents a number the question does not use', () => {
    /*
     * The other direction, and it needs saying separately. A figure containing
     * the right values PLUS three of its own is still contradicting the
     * question -- the student sees quantities that are nowhere in the text.
     *
     * Structural integers are allowed: an axis index or a colour index is not
     * a quantity being claimed.
     */
    const figure = figureFor(SPEC, COMPUTATION);
    const allowed = new Set<number>([
      ...Object.values(COMPUTATION.inputs),
      COMPUTATION.expected,
      0,
      1,
      2,
      3,
      4,
      5,
    ]);

    for (const value of numbersIn(figure!.data)) {
      expect(allowed.has(value), `${value} appears in the figure and not in the question`).toBe(true);
    }
  });

  it('draws no figure when there is nothing to draw', () => {
    /*
     * A question with no computation has no quantities. Drawing something
     * anyway is the decoration this whole file exists to prevent. `null` is
     * the honest answer, and `representation.ts` allows a single text-only
     * question -- what it bans is a whole SET of them.
     */
    expect(figureFor(SPEC, null)).toBeNull();
  });
});

describe('the figure is one the concept is allowed to use', () => {
  it('chooses only from the legal list for a numeric concept', () => {
    const legal = new Set(legalRepresentations({ numeric: true }));

    for (const structure of REASONING_STRUCTURES) {
      const figure = figureFor({ ...SPEC, reasoningStructure: structure }, COMPUTATION);
      expect(figure, structure).not.toBeNull();
      expect(legal.has(figure!.as), `${structure} chose ${figure!.as}`).toBe(true);
    }
  });

  it('names a representation the registry actually knows', () => {
    for (const structure of REASONING_STRUCTURES) {
      const figure = figureFor({ ...SPEC, reasoningStructure: structure }, COMPUTATION);
      expect(REPRESENTATIONS[figure!.as], `${structure} chose ${figure!.as}`).toBeDefined();
    }
  });

  it('supplies data in the shape that representation requires', () => {
    /*
     * `checkFigure` is the canvas validator: it catches asking for a Sankey and
     * supplying series data, and it catches each shape's own invariants. Every
     * structure is checked, because a mismatch on one rarely-used route is
     * exactly the kind that ships.
     */
    for (const structure of REASONING_STRUCTURES) {
      const figure = figureFor({ ...SPEC, reasoningStructure: structure }, COMPUTATION);
      const rejects = checkFigure(figure!, figure!.id).filter((issue) => issue.level === 'reject');
      expect(rejects, `${structure}: ${JSON.stringify(rejects)}`).toEqual([]);
    }
  });
});

describe('two different questions do not get the same picture', () => {
  it('varies the representation across reasoning structures', () => {
    /*
     * A generator that returned a bar chart for all ten would pass every test
     * above. Ten identical charts is the "diverse set" failure this repository
     * keeps finding, in a new place.
     */
    const chosen = new Set(
      REASONING_STRUCTURES.map(
        (structure) => figureFor({ ...SPEC, reasoningStructure: structure }, COMPUTATION)!.as,
      ),
    );
    expect(chosen.size).toBeGreaterThan(2);
  });

  it('gives the same question the same figure every time', () => {
    /*
     * Deterministic, because a figure that changed between renders would make
     * a student's second look at a question disagree with their first.
     */
    expect(figureFor(SPEC, COMPUTATION)).toEqual(figureFor(SPEC, COMPUTATION));
  });
});

/*
 * ────────────────────────────────────────────────────────────────────────────
 * A FIGURE IS PART OF THE QUESTION, SO IT MAY NOT ANSWER IT.
 *
 * `DeliverableQuestion` is an allowlist with no field that can leak: no
 * correct option, no solution, no distractor rationales. Adding the figure to
 * it puts a new object in front of the student, and the first draft of this
 * module leaked through it twice.
 *
 * 1. THE ANSWER. Nothing may plot or name `computation.expected`. A chart with
 *    the result on it turns a question into a reading exercise.
 *
 * 2. THE METHOD, which is subtler and is the one that nearly shipped. The flow
 *    diagram labelled its steps "multiply by b", "subtract c" -- the exact
 *    recipe, in order. A student could follow it to the answer without
 *    understanding anything, and the question would still look rigorous.
 *
 * The fix keeps what a diagram is FOR. The shape of the reasoning is worth
 * seeing -- that this is a three-step chain and not a lookup -- and the
 * operations are not. So the steps are counted, not named.
 * ────────────────────────────────────────────────────────────────────────────
 */
describe('the figure never answers the question', () => {
  it('never contains the expected answer', () => {
    for (const structure of REASONING_STRUCTURES) {
      const figure = figureFor({ ...SPEC, reasoningStructure: structure }, COMPUTATION);
      expect(numbersIn(figure!.data), structure).not.toContain(COMPUTATION.expected);
      expect(JSON.stringify(figure!.data), structure).not.toContain(String(COMPUTATION.expected));
    }
  });

  it('never names the operations that get you there', () => {
    /*
     * THE ONE THAT NEARLY SHIPPED. `multi_step_chain` drew a flowchart reading
     * "multiply by b" then "subtract c" -- the worked solution as a picture.
     */
    for (const structure of REASONING_STRUCTURES) {
      const drawn = JSON.stringify(
        figureFor({ ...SPEC, reasoningStructure: structure }, COMPUTATION)!.data,
      ).toLowerCase();

      for (const word of ['multiply', 'subtract', 'divide', ' add ', 'power']) {
        expect(drawn, `${structure} names "${word.trim()}"`).not.toContain(word);
      }
    }
  });

  it('still shows how MANY steps the reasoning takes', () => {
    /*
     * The pair. Solving the leak by drawing nothing would pass both tests above
     * and destroy the point of the diagram: a student should be able to see
     * that this is a chain rather than a lookup before they start.
     */
    const chain = figureFor({ ...SPEC, reasoningStructure: 'multi_step_chain' }, COMPUTATION);
    const steps = (chain!.data as { steps: readonly unknown[] }).steps;

    /* Two operations, plus the givens and the unknown. */
    expect(steps.length).toBe(COMPUTATION.steps.length + 2);
  });
});
