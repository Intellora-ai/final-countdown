import { beforeAll, describe, expect, it } from 'vitest';

import { buildCentroids, driftsFrom, nearestTopic, type TopicCentroid } from './engine/drift';
import { toPracticeCurriculum } from './officialCurriculum';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE DRIFT GATE, AGAINST THE REAL CURRICULUM.
 *
 * `drift.test.ts` runs on a four-topic fixture, which is the right size for
 * asserting the CONTRACT and the wrong size for asserting that the weighting
 * works. Two mutants proved it: removing inverse-document-frequency entirely,
 * and removing the sibling-topic contribution, changed no result there. With
 * four topics no word is common enough for frequency to matter.
 *
 * Both exist for a corpus of 1,850 topics, so both are tested against one.
 * "equation" appears across a large part of a maths syllabus; "discriminant"
 * appears in a handful. Without IDF the common word decides more matches than
 * the rare one, and every algebra question lands on whichever topic happens to
 * have the most words.
 *
 * THIS FILE LOADS 1 MB OF GENERATED CURRICULUM. It is separate from
 * `drift.test.ts` for that reason -- the contract tests stay fast, and the
 * corpus test pays for itself by being the only place these two mechanisms can
 * be shown to do anything.
 * ═══════════════════════════════════════════════════════════════════════════
 */

let CENTROIDS: readonly TopicCentroid[] = [];
let byName: Map<string, string> = new Map();

beforeAll(async () => {
  const mod: Record<string, unknown> = await import('../data/curriculum/class10');
  const official = Object.values(mod).find((value) => Array.isArray(value)) as never;
  const subjects = toPracticeCurriculum(official);

  CENTROIDS = buildCentroids(subjects);
  byName = new Map(
    subjects.flatMap((subject) =>
      subject.chapters.flatMap((chapter) =>
        chapter.topics.map((topic) => [topic.name.toLowerCase(), topic.id] as const),
      ),
    ),
  );
});

describe('the real curriculum, not a fixture', () => {
  it('builds a centroid for every practisable topic', () => {
    /*
     * Non-vacuity. A corpus test over an empty corpus is indistinguishable from
     * a clean result, and this file exists precisely to have a large one.
     */
    expect(CENTROIDS.length).toBeGreaterThan(200);
  });

  it('puts each topic nearest to ITSELF when given its own heading', () => {
    /*
     * THE MEASUREMENT THAT MAKES THE WEIGHTING REAL.
     *
     * Every topic heading is fed back in and must find its own topic. This is
     * not trivially true: 254 topics share a vocabulary, and a scheme that let
     * common words dominate would collapse whole chapters onto one winner.
     *
     * A rate rather than a pass/fail, because a lexical method will not get
     * every one and pretending otherwise would mean tuning until it did. The
     * floor is asserted; the actual figure is printed by the failure message.
     */
    let correct = 0;
    let total = 0;

    for (const [name, id] of byName) {
      const near = nearestTopic(name, CENTROIDS);
      total += 1;
      if (near?.topicId === id) correct += 1;
    }

    /*
     * THE FAILURE COUNT, NOT THE SUCCESS COUNT, AND NOT A PERCENTAGE FLOOR.
     *
     * Two earlier versions of this line were wrong in opposite directions.
     *
     * `> 0.7` was a floor loose enough to survive the mechanism being removed,
     * so it tested nothing. Replacing it with `correct >= 249` was tight, and
     * it broke the moment three junk topics were correctly filtered OUT of the
     * curriculum: the corpus shrank from 251 to 248 and a passing suite went
     * red for a reason that was an improvement.
     *
     * An absolute success count is coupled to corpus size. The FAILURES are
     * not: at most one topic in the whole curriculum may fail to recognise its
     * own heading, however many topics there are.
     */
    const missed = total - correct;
    expect(missed, `self-identification ${correct}/${total}`).toBeLessThanOrEqual(1);
  });

  it('does not report a topic as drifting from itself', () => {
    /*
     * The false-positive direction, and the one that decides whether this gate
     * can ship. A gate that rejects real questions gets switched off, and then
     * it enforces nothing at all.
     */
    let flagged = 0;
    for (const [name, id] of byName) {
      if (driftsFrom(name, id, CENTROIDS)) flagged += 1;
    }

    const rate = flagged / byName.size;
    expect(rate, `${flagged}/${byName.size} topics flagged against themselves`).toBeLessThan(0.25);
  });

  it('flags a question written for a different topic in the same subject', () => {
    /*
     * THE CASE EVERY EXISTING CHECK MISSES. Both topics are mathematics, both
     * would be stamped with the session's topic id by the generator, and the
     * boundary check compares that stamp to itself.
     */
    const probability = [...byName.entries()].find(([name]) => name.includes('probability'));
    const circle = [...byName.entries()].find(([name]) => name.includes('circle'));

    expect(probability, 'no probability topic in class 10').toBeDefined();
    expect(circle, 'no circle topic in class 10').toBeDefined();

    const circleQuestion =
      'A sector of a circle of radius 15 cm subtends an angle of 120 degrees at the centre. Find the area of the sector.';

    /* It belongs to the circle topic, and it is drift inside a probability session. */
    expect(driftsFrom(circleQuestion, probability![1], CENTROIDS)).toBe(true);
  });
});
