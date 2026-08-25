import {
  REPRESENTATIONS,
  type RepresentationName,
  type Shape,
} from '../../canvas/spec/representations';

/**
 * WHICH PICTURE A QUESTION MAY DRAW, AND THE BAN ON DRAWING NONE.
 *
 * This adds no chart. `canvas/spec/representations.ts` already names ~130 forms
 * across 12 shapes and `canvas/render/shapes/` already draws all 12. This
 * decides which of them a given concept may legally use, and refuses a set that
 * used none of them.
 *
 * WHY LEGALITY IS PER CONCEPT AND NOT PER TOPIC
 * ---------------------------------------------
 * A topic holds both computational ideas and definitional ones. Handing the
 * generator the topic's whole menu lets it draw a scatter plot for a definition
 * -- which is worse than prose, because it looks rigorous and says nothing.
 */

/** A question that carries no figure. Legal alone, illegal for a whole set. */
export const TEXT_ONLY = 'text' as const;

/**
 * Shapes whose axes need numbers to mean anything.
 *
 * A definition rendered as a line chart has nothing to put on the axes, so the
 * chart is decoration. Split by SHAPE rather than by representation name: the
 * names number ~130 and grow, the shapes are 12 and are the thing that actually
 * determines whether numbers are required.
 */
const QUANTITATIVE_SHAPES: readonly Shape[] = ['series', 'distribution', 'parts', 'matrix'];

/**
 * Shapes that carry structure rather than magnitude.
 *
 * These are what a non-numeric concept gets. THE LIST MUST NOT BE EMPTY: a
 * filter that returned nothing would make every non-numeric question text-only
 * by construction, satisfying the ban by making it impossible to obey.
 */
const STRUCTURAL_SHAPES: readonly Shape[] = [
  'graph',
  'process',
  'hierarchy',
  'tabular',
  'geometry',
  'logic',
  'intervals',
  'flowWeighted',
];

/** Every representation this concept may legally be drawn as. */
export function legalRepresentations(concept: { numeric: boolean }): RepresentationName[] {
  const allowed = concept.numeric
    ? [...QUANTITATIVE_SHAPES, ...STRUCTURAL_SHAPES]
    : STRUCTURAL_SHAPES;

  return (Object.keys(REPRESENTATIONS) as RepresentationName[]).filter((name) =>
    allowed.includes(REPRESENTATIONS[name].shape),
  );
}

/**
 * Did this set fail the ban?
 *
 * ONE FIGURE IS THE BAR, deliberately. Requiring every question to carry one
 * would force a diagram onto questions that genuinely do not need one, and a
 * decorative chart is its own kind of noise.
 *
 * AN EMPTY SET IS ALL-TEXT, not compliant. Zero of zero questions carry a
 * figure; arithmetic says the ban is satisfied and usefulness says nothing was
 * delivered. Reading it as a pass is how a generator that produced nothing
 * reports success.
 */
export function setIsAllText(representations: readonly string[]): boolean {
  /*
   * `[].every()` is vacuously true, and that IS the answer wanted here: zero of
   * zero questions carry a figure. An explicit empty-set guard was written first
   * and mutation testing showed it was dead -- deleting it changed nothing,
   * because `every` already returned true. Removed rather than kept as comfort,
   * and the empty case is pinned by a test so the reliance is not silent.
   */
  return representations.every((each) => each === TEXT_ONLY);
}
