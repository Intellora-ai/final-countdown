/**
 * WHAT A GIVEN PROJECT IS PERMITTED TO REPORT.
 *
 * FOUND BY GITHUB, NOT LOCALLY. `scenes 2/2` failed:
 *
 *     ✘ [reduced-motion] the baseline records nothing that is already fixed
 *     Error: Recorded in ci/baselines/a11y.json and no longer occurring.
 *     + "today: color-contrast"
 *
 * The baseline was `Record<route, string[]>`. It could record THAT the `today`
 * route has a contrast violation, and had nowhere to say WHERE.
 *
 * The a11y spec runs every route under five projects, one of which sets
 * `prefers-reduced-motion`. Under reduced motion that violation does not
 * appear: an element that is mid-fade in the animated build is fully opaque
 * when the animation is off, and an opaque element passes contrast.
 *
 * So the finding is real on four projects and absent on the fifth, and the
 * staleness check -- which runs per project -- correctly reported it stale on
 * the fifth. The RECORD was not wrong. The SHAPE of the record was: it asserted
 * a per-project fact in a project-agnostic field.
 *
 * THE FLAT LIST STAYS THE DEFAULT. Most findings genuinely are
 * viewport-independent, and making every entry name five projects would be
 * noise that nobody maintains. `byProject` is the exception, used only where a
 * finding really does differ.
 *
 * AN OVERRIDE REPLACES, IT DOES NOT MERGE. Merging would make an override
 * unable to REMOVE anything, and removing is the only thing it exists for.
 */

export interface Baseline {
  /** route -> violation ids permitted on every project, unless overridden. */
  readonly [route: string]: unknown;
  /** project -> route -> the ids permitted THERE, replacing the flat list. */
  readonly byProject?: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;
}

export function permittedFor(
  baseline: Baseline,
  route: string,
  project: string,
): readonly string[] {
  const override = baseline.byProject?.[project]?.[route];
  if (override !== undefined) return override;

  const flat = baseline[route];
  /*
   * An unlisted route permits NOTHING, so a new route's violations are new and
   * the run fails loudly. Permitting everything until somebody writes an entry
   * is a gate that starts switched off.
   */
  return Array.isArray(flat) ? (flat as readonly string[]) : [];
}
