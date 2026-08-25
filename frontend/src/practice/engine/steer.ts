import type { TopicProfile } from './plan';
import { DIFFICULTIES, type Difficulty } from './types';

/**
 * THE FOUR CONTROLS IN THE CORNER OF THE PRACTICE SCREEN.
 *
 *     More Like This    Different    Harder    Easier
 *
 * Every engine these need was already built and had ZERO callers.
 * `difficulty.ts` knows the bands; `fingerprint.ts` knows `DUPLICATE_AT` and
 * `NEAR_DUPLICATE_AT`. Neither was reachable from the product -- green tests on
 * code nothing ran. This is the seam between a button press and those engines.
 *
 * IT DECIDES WHAT THE NEXT REQUEST ASKS FOR. It does not generate and it does
 * not render, so it can be tested without a browser or a model.
 *
 * §17 OUTRANKS ALL FOUR. Steering never leaves the topic. "Harder" means a
 * harder question about THIS topic, not a question from a harder topic. A
 * control that could wander would be a topic leak with a friendly label, which
 * is worse than one nobody asked for.
 */
export const STEERS = ['more-like-this', 'different', 'harder', 'easier'] as const;
export type Steer = (typeof STEERS)[number];

/**
 * What the next question should be like.
 *
 * `similarityTarget` is `null` for a difficulty steer ON PURPOSE. Pinning it
 * would make Harder secretly also mean Different, and a student would never get
 * a second attempt at the shape that just beat them.
 */
export interface SteerResult {
  readonly profile: TopicProfile;
  readonly difficulty: Difficulty;
  readonly similarityTarget: 'near' | 'novel' | null;
  /** True when the student asked to move past the top or bottom band. */
  readonly atLimit: boolean;
}

export function steer(
  profile: TopicProfile,
  difficulty: Difficulty,
  requested: Steer,
): SteerResult {
  /*
   * The profile is returned UNCHANGED for every steer. That is §17 expressed as
   * code rather than as a comment: there is no branch in which topic, chapter or
   * subject could be rewritten, so a leak cannot be introduced by editing one.
   */
  if (requested === 'more-like-this' || requested === 'different') {
    return {
      profile,
      difficulty,
      /*
       * "More like this" is the one place a near-duplicate is the GOAL rather
       * than a defect: same shape, new numbers, so a student can drill a
       * structure they have just met.
       */
      similarityTarget: requested === 'more-like-this' ? 'near' : 'novel',
      atLimit: false,
    };
  }

  const bands = DIFFICULTIES;
  const current = bands.indexOf(difficulty);
  const step = requested === 'harder' ? 1 : -1;
  const wanted = current + step;

  /*
   * Clamp rather than error. A student pressing Harder on the hardest band
   * should get another hard question -- not a failure, and not a silent no-op
   * that reads as broken. `atLimit` is how the screen can say so.
   */
  const atLimit = wanted < 0 || wanted >= bands.length;
  const next = atLimit ? difficulty : bands[wanted]!;

  return { profile, difficulty: next, similarityTarget: null, atLimit };
}
