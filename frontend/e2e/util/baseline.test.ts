import { describe, expect, it } from 'vitest';

import { permittedFor, type Baseline } from './baseline';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A VIEWPORT-DEPENDENT FINDING IN A STRUCTURE WITH NO VIEWPORT.
 *
 * Found by GitHub, not locally. `scenes 2/2` failed:
 *
 *     ✘ [reduced-motion] the baseline records nothing that is already fixed
 *     Error: Recorded in ci/baselines/a11y.json and no longer occurring.
 *     + "today: color-contrast"
 *
 * `ci/baselines/a11y.json` is `Record<route, string[]>`. It records that the
 * `today` route has a contrast violation. It has nowhere to say WHERE.
 *
 * The a11y spec runs the same routes under five projects, and one of them sets
 * `prefers-reduced-motion`. Under reduced motion the contrast violation does
 * not appear -- an element that is mid-fade in the animated build is fully
 * opaque when the animation is off, and an opaque element passes contrast.
 *
 * So the finding is real on four projects and absent on the fifth, and the
 * staleness check -- which runs per project -- correctly reports it stale on
 * the fifth. The record is not wrong. The SHAPE of the record is: it asserts a
 * per-project fact in a project-agnostic field.
 *
 * THIS IS NOT A REGRESSION FROM THE CHANGE THAT SURFACED IT. The commit under
 * test added one standalone script that the application never imports, and the
 * previous run on the same branch failed identically.
 *
 * The repair keeps the flat shape as the DEFAULT -- most findings really are
 * viewport-independent and making every entry name five projects would be
 * noise -- and adds a per-project override for the ones that are not.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const FLAT: Baseline = { today: ['color-contrast'], canvas: [] };

const SCOPED: Baseline = {
  today: ['color-contrast'],
  canvas: [],
  byProject: {
    'reduced-motion': { today: [] },
  },
};

describe('what a project is permitted to report', () => {
  it('uses the flat list when no project override exists', () => {
    /*
     * The common case, and it must stay the common case. A finding that appears
     * on every viewport should be written once, not five times.
     */
    expect(permittedFor(FLAT, 'today', 'desktop-1440')).toEqual(['color-contrast']);
    expect(permittedFor(FLAT, 'today', 'reduced-motion')).toEqual(['color-contrast']);
  });

  it('lets one project say the finding does not occur there', () => {
    /*
     * THE FAILURE FROM CI, AS AN ASSERTION. `reduced-motion` genuinely does not
     * see this violation, and the baseline must be able to say so without
     * claiming it is fixed everywhere.
     */
    expect(permittedFor(SCOPED, 'today', 'reduced-motion')).toEqual([]);
    expect(permittedFor(SCOPED, 'today', 'desktop-1440')).toEqual(['color-contrast']);
  });

  it('an override REPLACES the flat list, never merges with it', () => {
    /*
     * Merging would make an override unable to REMOVE anything, which is the
     * only thing this override is for. Stated as a test because "replace or
     * merge" is invisible until the day it matters.
     */
    const both: Baseline = {
      today: ['color-contrast', 'link-name'],
      byProject: { 'mobile-375': { today: ['link-name'] } },
    };

    expect(permittedFor(both, 'today', 'mobile-375')).toEqual(['link-name']);
  });

  it('returns nothing for a route the baseline does not mention', () => {
    /*
     * An unlisted route permits NOTHING, so a new route's violations are new
     * and fail loudly. The alternative -- permitting everything until somebody
     * writes an entry -- is a gate that starts switched off.
     */
    expect(permittedFor(FLAT, 'practice', 'desktop-1440')).toEqual([]);
    expect(permittedFor(SCOPED, 'practice', 'reduced-motion')).toEqual([]);
  });

  it('ignores an override for a different route', () => {
    const other: Baseline = {
      today: ['color-contrast'],
      byProject: { 'reduced-motion': { canvas: [] } },
    };

    expect(permittedFor(other, 'today', 'reduced-motion')).toEqual(['color-contrast']);
  });

  it('survives a baseline with no byProject key at all', () => {
    /*
     * Every baseline written before this change has no such key. Reading one
     * must not throw, or this change breaks every existing checkout.
     */
    expect(permittedFor({ today: ['color-contrast'] }, 'today', 'keyboard')).toEqual([
      'color-contrast',
    ]);
    expect(permittedFor({}, 'today', 'keyboard')).toEqual([]);
  });
});
