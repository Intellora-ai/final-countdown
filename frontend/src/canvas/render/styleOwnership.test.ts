import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * A COMPONENT OWNS ITS STYLES. ITS ROUTE DOES NOT.
 *
 * `canvas.css` was imported by exactly one file: `CanvasRoute.tsx`. Every
 * renderer under `canvas/render/` emits `lc-*` class names that only that
 * stylesheet defines, and for as long as the canvas route was the only
 * consumer, that worked.
 *
 * Then the practice screen started drawing figures. `FigureView` renders on
 * `/practice`, which never imports `canvas.css`, so `lc-figure-scroll`,
 * `lc-caption` and `lc-refusal` resolved to nothing:
 *
 *   lc-figure-scroll   the wide-chart scroll container -- a wide figure
 *                      overflows the card instead of scrolling inside it
 *   lc-refusal         the box shown when a figure CONTRADICTS ITS OWN DATA.
 *                      Unstyled, a refusal renders as plain body text and
 *                      reads like part of the lesson. The one thing that must
 *                      never look normal is the thing that looked normal.
 *   lc-caption         the figure's caption
 *
 * NOTHING FAILED. A class with no rule is not an error in CSS, in TypeScript,
 * in the linter, or in any test. This is the same silent shape as the `--pm-*`
 * tokens written as `--c-*` earlier in this project: the markup was right, the
 * styles were absent, and only looking at the screen would have shown it.
 *
 * The fix is ownership. A renderer that emits `lc-*` imports the stylesheet
 * that defines `lc-*`, so any consumer -- this one and the next one -- gets it
 * by importing the component.
 */

const HERE = fileURLToPath(new URL('./', import.meta.url));

const sources = readdirSync(HERE)
  .filter((name) => name.endsWith('.tsx') && !name.includes('.test.'))
  .map((name) => ({ name, text: readFileSync(join(HERE, name), 'utf8') }));

const STYLESHEET = readFileSync(join(HERE, '..', 'design', 'canvas.css'), 'utf8');

describe('every renderer that emits lc- classes brings its own stylesheet', () => {
  it('finds renderers to check, so the sweep is not vacuous', () => {
    /*
     * A directory read that matched nothing would make every assertion below
     * pass over an empty list, which is indistinguishable from a clean result.
     */
    expect(sources.length).toBeGreaterThan(3);
    expect(sources.some(({ text }) => /className="lc-/.test(text))).toBe(true);
  });

  it('imports canvas.css wherever an lc- class is emitted', () => {
    const offenders = sources
      .filter(({ text }) => /className="lc-/.test(text))
      .filter(({ text }) => !/import\s+['"][^'"]*canvas\.css['"]/.test(text))
      .map(({ name }) => name);

    expect(offenders, `these emit lc- classes and import no stylesheet: ${offenders.join(', ')}`)
      .toEqual([]);
  });

  it('defines every lc- class that any renderer emits', () => {
    /*
     * The other direction. Importing a stylesheet that does not define the
     * class is the same defect wearing a different hat, and it is exactly as
     * silent.
     */
    const emitted = new Set(
      sources.flatMap(({ text }) =>
        [...text.matchAll(/className="(lc-[a-z-]+)"/g)].map((match) => match[1] ?? ''),
      ),
    );

    expect(emitted.size).toBeGreaterThan(3);

    const undefinedClasses = [...emitted].filter(
      (name) => !new RegExp(`\\.${name}\\b`).test(STYLESHEET),
    );

    expect(undefinedClasses, `emitted but never styled: ${undefinedClasses.join(', ')}`).toEqual([]);
  });
});
