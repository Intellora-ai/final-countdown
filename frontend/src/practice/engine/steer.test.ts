import { describe, expect, it } from 'vitest';

import { asChapterId, asSubjectId, asTopicId } from './ids';
import { STEERS, steer } from './steer';
import type { TopicProfile } from './plan';

/**
 * THE FOUR CONTROLS IN THE CORNER OF THE PRACTICE SCREEN.
 *
 *     More Like This    Different    Harder    Easier
 *
 * Every engine they need was already built and had ZERO callers.
 * `difficulty.ts` knows `EASY_CEILING`, `HARD_FLOOR` and `bandDistance`.
 * `fingerprint.ts` knows `DUPLICATE_AT` and `NEAR_DUPLICATE_AT`. Neither was
 * reachable from the product: green tests on code nothing ran.
 *
 * This is the seam between a student pressing a button and those two engines.
 * It decides WHAT THE NEXT REQUEST SHOULD ASK FOR -- it does not generate, and
 * it does not render.
 *
 * THE ONE RULE THAT OUTRANKS ALL FOUR
 * -----------------------------------
 * §17. Steering never leaves the topic. "Harder" means a harder question about
 * THIS topic, not a question from a harder topic; "Different" means a different
 * structure within it, not a different subject. A control that could wander
 * would be a topic leak with a friendly label, which is worse than a leak
 * nobody asked for.
 */

const PROFILE: TopicProfile = {
  topicId: asTopicId('functions--graphs'),
  chapterId: asChapterId('functions'),
  subjectId: asSubjectId('mathematics'),
  quantitative: 0.7,
  concepts: [
    {
      id: 'functions--graphs--intercepts',
      name: 'Intercepts',
      topicId: asTopicId('functions--graphs'),
      numeric: true,
      prerequisites: [],
      commonMisconception: null,
    },
  ],
};

describe('every steer stays inside the topic', () => {
  it('keeps the topic, chapter and subject whatever the student pressed', () => {
    /*
     * §17, and the reason this test is first. If a control could change the
     * topic, every other property below would be describing a leak.
     */
    for (const each of STEERS) {
      const next = steer(PROFILE, 'medium', each);
      expect(next.profile.topicId).toBe(PROFILE.topicId);
      expect(next.profile.chapterId).toBe(PROFILE.chapterId);
      expect(next.profile.subjectId).toBe(PROFILE.subjectId);
    }
  });

  it('covers all four controls, so none is silently unimplemented', () => {
    expect([...STEERS].sort()).toEqual(['different', 'easier', 'harder', 'more-like-this'].sort());
  });
});

describe('harder and easier move one band, and stop at the ends', () => {
  it('steps up one band', () => {
    expect(steer(PROFILE, 'easy', 'harder').difficulty).toBe('medium');
    expect(steer(PROFILE, 'medium', 'harder').difficulty).toBe('hard');
  });

  it('steps down one band', () => {
    expect(steer(PROFILE, 'hard', 'easier').difficulty).toBe('medium');
    expect(steer(PROFILE, 'medium', 'easier').difficulty).toBe('easy');
  });

  it('holds at the ceiling rather than inventing a fourth band', () => {
    /*
     * `hard` is the top. Clamping is the honest answer: a student who presses
     * Harder on the hardest band should get another hard question, not an error
     * and not a silent no-op that looks broken.
     */
    expect(steer(PROFILE, 'hard', 'harder').difficulty).toBe('hard');
    expect(steer(PROFILE, 'easy', 'easier').difficulty).toBe('easy');
  });

  it('says when it could not move, so the screen can tell the student', () => {
    expect(steer(PROFILE, 'hard', 'harder').atLimit).toBe(true);
    expect(steer(PROFILE, 'medium', 'harder').atLimit).toBe(false);
  });
});

describe('more-like-this and different steer novelty, not difficulty', () => {
  it('leaves the band alone', () => {
    /*
     * Two independent axes. Asking for a different STRUCTURE must not quietly
     * make the question harder, or the student cannot tell which control did
     * what.
     */
    expect(steer(PROFILE, 'medium', 'different').difficulty).toBe('medium');
    expect(steer(PROFILE, 'medium', 'more-like-this').difficulty).toBe('medium');
  });

  it('asks for a near-duplicate when the student wants more of the same', () => {
    /*
     * "More like this" is the one place a near-duplicate is the GOAL rather
     * than a defect -- the same shape, new numbers, so a student can drill a
     * structure they just met.
     */
    const next = steer(PROFILE, 'medium', 'more-like-this');
    expect(next.similarityTarget).toBe('near');
  });

  it('asks for a novel structure when the student wants something different', () => {
    expect(steer(PROFILE, 'medium', 'different').similarityTarget).toBe('novel');
  });

  it('leaves novelty unconstrained for a difficulty steer', () => {
    /*
     * Pinning it to `novel` here would make Harder secretly also mean
     * Different, and the student would never get a second attempt at the shape
     * that just beat them.
     */
    expect(steer(PROFILE, 'medium', 'harder').similarityTarget).toBeNull();
  });
});
