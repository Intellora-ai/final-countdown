import type { FigureBlock } from '../../canvas/spec/figure';
import type { NumericComputation, QuestionSpec, ReasoningStructure } from './types';

/**
 * THE PICTURE A QUESTION DRAWS.
 *
 * `engine/representation.ts` decided which pictures a concept may legally use
 * and banned an all-text set. It was fully tested and had ZERO non-test
 * importers, so the ban never fired once -- no question carried a figure at
 * all, and there was nothing for it to check. Wiring the ban before this
 * existed would have refused every session in the product.
 *
 * THE RULE THAT OUTRANKS EVERY OTHER DECISION HERE
 * ------------------------------------------------
 * The figure is built from `computation.inputs`: the SAME values the question
 * text is written from. A diagram showing different numbers from the question
 * beside it is worse than no diagram, because it looks authoritative and
 * contradicts the thing it illustrates, and a student cannot tell which half is
 * lying. That is why this takes the computation rather than the spec's seed --
 * there is no path here that can produce a number the question does not use.
 *
 * NO CHART IS BUILT HERE. `canvas/spec/representations.ts` names ~137 forms
 * across 12 shapes and `canvas/render/shapes/` draws all 12. This chooses one
 * and fills it in.
 */

/**
 * Which form suits which shape of reasoning.
 *
 * Chosen by REASONING STRUCTURE rather than at random, because the structure is
 * the thing the picture has to make visible. A chain of operations is a
 * sequence and reads as a flow; a comparison of quantities is a comparison and
 * reads as bars. Returning one chart for all ten would be the "diverse set"
 * failure this repository keeps finding, drawn instead of written.
 */
const FORM: Readonly<Record<ReasoningStructure, string>> = {
  direct_recall: 'bar',
  single_step_application: 'bar',
  classify_instance: 'bar',
  estimate_and_bound: 'bar',
  cause_to_effect: 'lollipop',
  effect_to_cause: 'lollipop',
  compare_and_contrast: 'groupedBar',
  counterexample: 'groupedBar',
  multi_step_chain: 'flowchart',
  diagnose_error: 'flowchart',
};

export function figureFor(
  spec: QuestionSpec,
  computation: NumericComputation | null,
): FigureBlock | null {
  /*
   * No computation means no quantities, and drawing something anyway is the
   * decoration this module exists to prevent. `representation.ts` permits a
   * single text-only question; what it bans is a whole SET of them.
   */
  if (computation === null) return null;

  const id = `fig-${spec.specId}`;
  const as = FORM[spec.reasoningStructure];
  const unit = computation.unit ?? '';
  const entries = Object.entries(computation.inputs);

  if (as === 'flowchart') {
    /*
     * The steps ARE the chain the question asks the student to follow, taken
     * from the computation the verifier recomputes the answer from. So the
     * diagram cannot drift from the arithmetic: they are the same object.
     *
     * The numbers travel in the LABELS here rather than as plotted values,
     * because a flow diagram has no axis to put them on.
     */
    /*
     * THE STEPS ARE COUNTED, NOT NAMED, and that is the whole design of this
     * branch.
     *
     * The first draft labelled them "multiply by b" then "subtract c" -- the
     * worked solution drawn as a picture. A student could have followed it to
     * the answer without understanding anything, and the question would still
     * have looked rigorous. A figure is part of the question; it may not answer
     * it.
     *
     * What survives is what a diagram is FOR here: that this is a three-step
     * chain and not a lookup. Knowing how far you have to travel is not the
     * same as being told the route.
     */
    const steps = [
      { id: 'given', label: labelFor(entries, unit), kind: 'start' as const },
      ...computation.steps.map((_step, index) => ({
        id: `s${index}`,
        label: `step ${index + 1}`,
        kind: 'action' as const,
      })),
      { id: 'answer', label: `the value of ${spec.conceptName}`, kind: 'end' as const },
    ];

    const order = steps.map((step) => step.id);
    const transitions = order
      .slice(0, -1)
      .map((from, index) => ({ from, to: order[index + 1]! }));

    return {
      kind: 'figure',
      id,
      emphasis: 'supporting',
      tone: 'neutral',
      as,
      data: { shape: 'process', steps, transitions },
    } as FigureBlock;
  }

  /*
   * One series per input for a grouped bar, one series holding every input for
   * a plain bar or a lollipop. Both put exactly the question's own numbers on
   * screen and nothing else.
   */
  const series =
    as === 'groupedBar'
      ? entries.map(([name, value], index) => ({
          name,
          colorIndex: index % 5,
          points: [{ x: spec.conceptName, y: value }],
        }))
      : [
          {
            name: spec.conceptName,
            colorIndex: 0,
            points: entries.map(([name, value]) => ({ x: name, y: value })),
          },
        ];

  return {
    kind: 'figure',
    id,
    emphasis: 'supporting',
    tone: 'neutral',
    as,
    data: { shape: 'series', series, continuousX: false, stacked: false },
    ...(unit === '' ? {} : { caption: `Values in ${unit}.` }),
  } as FigureBlock;
}

/** `a 120, b 5, c 30 kPa` — every given, in one readable line. */
function labelFor(entries: readonly (readonly [string, number])[], unit: string): string {
  const given = entries.map(([name, value]) => `${name} ${value}`).join(', ');
  return unit === '' ? given : `${given} ${unit}`;
}
