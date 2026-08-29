import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * THE HALF OF THE PRACTICE STAGE THAT LIVES IN CSS.
 *
 * `hexStage.test.tsx` asserts the DOM contract: four options, four distinct
 * `data-slot` values, sane reading order. That is exactly half the claim. A
 * page that emits four correctly-numbered slots and stacks them in a column
 * passes every one of those assertions.
 *
 * The other half is here, and it is deliberately a SEPARATE FILE running in
 * NODE rather than jsdom. Two reasons, both measured:
 *
 *   1. jsdom applies no CSS at all. `getComputedStyle` returns the initial
 *      value for every property, so "option B is left of option C" is not a
 *      question jsdom can answer -- it would pass against a column.
 *   2. `import.meta.url` under the jsdom environment is an `http://` URL, so
 *      `fileURLToPath` throws "The URL must be of scheme file". The stylesheet
 *      cannot be read from inside that file.
 *
 * `?raw` was tried first and is worse than either: Vite's CSS plugin claims a
 * `.css` file before the raw loader sees it and returns an EMPTY STRING, which
 * made every assertion here vacuously pass. Measured -- `CSS.length` was 0.
 * A test that passes because it read nothing is the failure mode this whole
 * repository keeps paying for, so the mechanism is named here.
 *
 * Real geometry is verified in a browser. That is stated rather than implied.
 */

const CSS = readFileSync(
  join(fileURLToPath(new URL('./', import.meta.url)), 'practice.css'),
  'utf8',
);

/**
 * The bodies of EVERY rule with this selector, joined.
 *
 * Every, not the first. A selector legitimately appears more than once -- the
 * option card is a full-width row on a narrow screen and a hexagon on the
 * stage, which is two rules for one element by design. Reading only the first
 * match reported "no clip-path" while the clip-path was three lines further
 * down, inside the media query where it belongs.
 */
function ruleBody(selector: string): string | undefined {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const bodies = [...CSS.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))].map(
    (match) => match[1] ?? '',
  );
  return bodies.length === 0 ? undefined : bodies.join('\n');
}

describe('every option slot has its own place on the stage', () => {
  const slots = [0, 1, 2, 3];

  it('declares a rule for all four slots', () => {
    for (const slot of slots) {
      expect(ruleBody(`.pm-q-slot[data-slot='${slot}']`), `slot ${slot}`).toBeDefined();
    }
  });

  it('gives each slot a different coordinate', () => {
    /*
     * THE ASSERTION THAT SEPARATES A STAGE FROM A LIST. Four slots, four
     * coordinates. A stacked column has one `left` for all four, so this is
     * the check a column cannot pass.
     */
    const coords = slots.map((slot) => {
      const body = ruleBody(`.pm-q-slot[data-slot='${slot}']`) ?? '';
      const left = /(?:^|\s)left:\s*([^;]+);/.exec(body)?.[1]?.trim();
      const top = /(?:^|\s)top:\s*([^;]+);/.exec(body)?.[1]?.trim();
      expect(left, `slot ${slot} has no left`).toBeDefined();
      expect(top, `slot ${slot} has no top`).toBeDefined();
      return `${left}|${top}`;
    });

    expect(new Set(coords).size, JSON.stringify(coords)).toBe(4);
  });

  it('uses at least two heights, so the four are not one row either', () => {
    /*
     * The pair to the test above. Four different `left` values at one `top` is
     * a row -- still not the arrangement, and still passes a bare uniqueness
     * check on the combined coordinate.
     */
    const tops = slots.map((slot) =>
      /(?:^|\s)top:\s*([^;]+);/.exec(ruleBody(`.pm-q-slot[data-slot='${slot}']`) ?? '')?.[1]?.trim(),
    );
    expect(new Set(tops).size).toBeGreaterThan(1);

    const lefts = slots.map((slot) =>
      /(?:^|\s)left:\s*([^;]+);/.exec(ruleBody(`.pm-q-slot[data-slot='${slot}']`) ?? '')?.[1]?.trim(),
    );
    expect(new Set(lefts).size).toBeGreaterThan(1);
  });
});

describe('the card is a hexagon', () => {
  it('clips the option to six sides', () => {
    const body = ruleBody('.pm-q-option') ?? '';
    const polygon = /clip-path:\s*polygon\(([^)]*)\)/.exec(body)?.[1];

    expect(polygon, '.pm-q-option has no clip-path polygon').toBeDefined();
    /* Six vertices. A rounded rectangle written as a polygon would have four. */
    expect((polygon ?? '').split(',').length).toBe(6);
  });
});

describe('the stage never traps the narrow screen in it', () => {
  it('applies the positioning only above a width where four cards fit', () => {
    /*
     * Fallback first. Without the media query the page is the readable column
     * it always was; four hexagons around a figure on a phone would overlap
     * into something unusable, and "make the text smaller so it fits" is
     * explicitly not an option in this project.
     */
    const guard = /@media\s*\(min-width:\s*\d+px\)\s*\{[\s\S]*?\.pm-q-slot\[data-slot='0'\]/.exec(
      CSS,
    );
    expect(guard, 'slot positioning is not behind a min-width media query').not.toBeNull();
  });
});
