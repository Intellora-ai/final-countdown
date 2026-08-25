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

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * §35 — MINIMUM NECESSARY REPRESENTATION.
 *
 * "A question must NEVER receive a graph, diagram, chart, table, image, or
 * other visual merely because it is available. A necessary visual MUST NOT be
 * omitted merely because text is easier to generate."
 *
 * What shipped violated the first half on every single question. `figureFor`
 * returned a chart whenever a computation existed, which is always, so every
 * question carried a figure whether or not it needed one.
 *
 * Measured on the real generator: the question says "One reads 65, the other
 * 4." The chart then plots 65 and 4. §35.3 asks "if I remove this visual, does
 * the question become materially worse?" -- and the answer is no, because the
 * text already states every number the chart draws. That is decoration, and
 * decoration on a practice question is cognitive load with no reasoning value.
 *
 * THE CHECKABLE FORM OF §35.3. A figure earns its place when it carries
 * information the text does not already hand over. When the question text
 * spells out every quantity, the chart is a restatement.
 *
 * WHAT THIS TEST CANNOT DECIDE, said plainly: whether a diagram would help a
 * student REASON -- a geometry sketch, a circuit, a trajectory. That is a
 * judgement about the task, not about the string, and §35.1 is explicit that
 * dropping a necessary visual is just as bad as adding a decorative one. The
 * rule below is the half that is decidable from the text, and the reasoning
 * structures that genuinely need a picture keep theirs.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe('a figure has to earn its place', () => {
  const spellsOutEveryNumber =
    'Two systems differ only in pressure. One reads 120, the next 5, the last 30. By how much does the first exceed the second?';

  it('draws nothing when the text already states every quantity', () => {
    /*
     * §35.3, run as a computation: remove the figure and nothing is lost,
     * because the numbers are in the sentence the student is already reading.
     */
    expect(figureFor(SPEC, COMPUTATION, spellsOutEveryNumber)).toBeNull();
  });

  it('draws the figure when the text withholds the quantities', () => {
    /*
     * THE PAIR, and §35.1 is the reason it has to be here. A rule that only
     * ever removed visuals would be satisfied by returning null forever, and
     * would strip the chart off every data-interpretation question in the
     * product.
     */
    const withholds = 'Compare the three readings shown. By how much does the first exceed the second?';
    const figure = figureFor(SPEC, COMPUTATION, withholds);

    expect(figure).not.toBeNull();
    expect(figure!.as).toBeTruthy();
  });

  it('keeps the figure when only SOME of the numbers are in the text', () => {
    /*
     * Partial disclosure is the interesting case. A chart that supplies the one
     * quantity the sentence left out is carrying real information, even though
     * it also restates two the student can already see.
     */
    const partial = 'One system reads 120 and another reads 5. How do they compare with the third?';
    expect(figureFor(SPEC, COMPUTATION, partial)).not.toBeNull();
  });

  it('still refuses to draw when there is nothing to draw', () => {
    expect(figureFor(SPEC, null, 'anything at all')).toBeNull();
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * §35.1 — A NECESSARY VISUAL MUST NOT BE OMITTED.
 *
 * §35 removed the decorative charts, and the fair question is whether it
 * removed all of them. Measured, on 15 questions across three concepts:
 *
 *     FIGURES 3/15
 *     direct_recall     FIGURE
 *     multi_step_chain  FIGURE
 *     the other eight   text
 *
 * So charts survive -- but BY ACCIDENT. Those two templates happen not to state
 * one of their numbers in the sentence, and the rule noticed. Nothing in the
 * design said "this question needs a picture"; a later wording change to either
 * template would silently delete its chart and no test would notice.
 *
 * §35.1 names the case that must be deliberate: "Data-analysis question →
 * table/chart may be the actual evidence required." A comparison question is
 * exactly that. Its data now lives ONLY in the figure, so the chart is
 * necessary by construction rather than by luck -- remove it and the question
 * cannot be answered at all.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe('a question whose evidence IS the figure', () => {
  const comparison = { ...SPEC, reasoningStructure: 'compare_and_contrast' as const };

  it('always carries a figure, whatever the wording does', () => {
    /*
     * Asserted for ANY question text, including one that happens to mention
     * every number. A data-interpretation question is defined by what it asks
     * the student to do, not by which digits its sentence contains -- and the
     * accidental version failed exactly there.
     */
    for (const text of [
      'Compare the readings shown and state the difference.',
      'The chart shows 120, 5 and 30. Compare the first two.',
      '',
    ]) {
      expect(figureFor(comparison, COMPUTATION, text), text).not.toBeNull();
    }
  });

  it('is unanswerable without it, which is what makes it necessary', () => {
    /*
     * §35.3 run in the direction that keeps a visual: remove the figure and the
     * quantities exist nowhere. That is the definition of a visual that carries
     * information rather than restating it.
     */
    const figure = figureFor(comparison, COMPUTATION, 'Compare the readings shown.');
    const drawn = new Set(numbersIn(figure!.data));

    for (const value of Object.values(COMPUTATION.inputs)) {
      expect(drawn.has(value), `${value} is not in the figure and not in the text`).toBe(true);
    }
  });

  it('still leaves the text-only structures alone', () => {
    /*
     * THE PAIR. Marking every structure as data-interpretation would satisfy
     * both tests above and reinstate the exact defect §35 removed -- a chart on
     * every question.
     */
    const spellsItOut =
      'Two systems differ only in pressure. One reads 120, the next 5, the last 30. Compare them.';

    expect(
      figureFor({ ...SPEC, reasoningStructure: 'single_step_application' }, COMPUTATION, spellsItOut),
    ).toBeNull();
    expect(
      figureFor({ ...SPEC, reasoningStructure: 'estimate_and_bound' }, COMPUTATION, spellsItOut),
    ).toBeNull();
  });
});
