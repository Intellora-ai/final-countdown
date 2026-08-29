import { describe, expect, it } from 'vitest';

import { REPRESENTATIONS, SHAPES } from '../../canvas/spec/representations';
import { legalRepresentations, setIsAllText, TEXT_ONLY } from './representation';

/**
 * TEXT-ONLY QUESTION SETS ARE BANNED.
 *
 * Not "discouraged". A practice set where every question is a wall of prose is
 * the failure mode this product exists to avoid: the student reads, does not
 * see, and cannot check their own reasoning against a picture.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is not a new chart library. `canvas/spec/representations.ts` already names
 * ~130 forms across 12 shapes, and `canvas/render/shapes/` already draws all 12.
 * This decides WHICH of them a given question may legally use, and refuses a set
 * that used none.
 *
 * WHY LEGALITY IS PER CONCEPT, NOT PER TOPIC
 * ------------------------------------------
 * A topic can hold both a computational idea and a definitional one. Handing the
 * generator the topic's whole menu lets it draw a scatter plot for a definition,
 * which is worse than prose -- it looks rigorous and says nothing.
 */

describe('which representations a question may use', () => {
  it('offers a numeric concept the quantitative shapes', () => {
    const legal = legalRepresentations({ numeric: true });
    expect(legal.length).toBeGreaterThan(0);
    /* Every name it offers must be one the renderer actually knows. */
    for (const name of legal) {
      expect(Object.keys(REPRESENTATIONS)).toContain(name);
    }
  });

  it('never offers a non-numeric concept a shape that needs numbers', () => {
    /*
     * A definition rendered as a line chart is worse than prose: it looks
     * rigorous and carries no information. The axes would have nothing to hold.
     */
    const legal = legalRepresentations({ numeric: false });
    expect(legal).not.toContain('line');
    expect(legal).not.toContain('histogram');
    expect(legal).not.toContain('scatter');
  });

  it('offers a non-numeric concept something it can actually use', () => {
    /*
     * The rule has to leave a way through. A filter that returned nothing would
     * make every non-numeric question text-only by construction -- passing the
     * ban by making it impossible to satisfy.
     */
    expect(legalRepresentations({ numeric: false }).length).toBeGreaterThan(0);
  });

  it('only ever names a shape the renderer can draw', () => {
    for (const numeric of [true, false]) {
      for (const name of legalRepresentations({ numeric })) {
        expect(SHAPES).toContain(REPRESENTATIONS[name].shape);
      }
    }
  });
});

describe('the ban on an all-text set', () => {
  it('refuses a set where every question is prose', () => {
    const set = [TEXT_ONLY, TEXT_ONLY, TEXT_ONLY];
    expect(setIsAllText(set)).toBe(true);
  });

  it('accepts a set with one real representation in it', () => {
    /*
     * One is the bar, deliberately. Requiring every question to carry a figure
     * would force a diagram onto questions that genuinely do not need one, and
     * a decorative chart is its own kind of noise.
     */
    const set = [TEXT_ONLY, 'scatter', TEXT_ONLY];
    expect(setIsAllText(set)).toBe(false);
  });

  it('treats an empty set as all-text rather than as compliant', () => {
    /*
     * Zero of zero questions carry a figure. Arithmetic says the ban is
     * satisfied; usefulness says nothing was delivered. An empty set must never
     * read as a pass -- that is how a generator that produced nothing reports
     * success.
     */
    expect(setIsAllText([])).toBe(true);
  });
});
