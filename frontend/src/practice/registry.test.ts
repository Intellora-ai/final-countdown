import { beforeEach, describe, expect, it } from 'vitest';

import { CURRICULUM } from './curriculum';
import {
  activeCurriculum,
  chapterById,
  chapterOfTopic,
  setActiveCurriculum,
  subjectOfChapter,
  topicById,
  topicsOfChapter,
} from './registry';

/**
 * THE BUG THIS MODULE EXISTS TO MAKE IMPOSSIBLE.
 *
 * The practice map was pointed at the official CBSE curriculum. Every lookup
 * the rest of practice does -- `TOPIC_BY_ID`, `CHAPTER_BY_ID`,
 * `CHAPTER_OF_TOPIC` -- stayed built from the hand-written class-12 commerce
 * SEED, because they are module-level constants derived from `CURRICULUM`.
 *
 * So the map drew 523 real topics and not one of them could be practised.
 * `profileFor` returned null for every id on screen, and `store.ts` dropped
 * every pin with `if (!CHAPTER_BY_ID.has(id)) return`. The session dialog
 * opened, said "this topic", and rendered nothing at all.
 *
 * NOTHING FAILED. No error, no console message, no red test. Two sources of
 * truth for one fact, and the screen quietly using the wrong one -- which is
 * the exact failure the repository's own notes describe as "a fixture that does
 * not match reality", found once before and now found again in a new place.
 *
 * The repair is that there is ONE source. The map and the lookups read the same
 * object, so they cannot disagree.
 */

const OFFICIAL = [
  {
    id: 'sci',
    name: 'Science',
    chapters: [
      {
        id: 'sci-ch1',
        number: 1,
        name: 'Chemical Reactions',
        topics: [
          { id: 'sci-ch1-t1', name: 'Balancing equations' },
          { id: 'sci-ch1-t2', name: 'Types of reaction' },
        ],
      },
    ],
  },
];

beforeEach(() => setActiveCurriculum(CURRICULUM));

describe('one curriculum, read by everything', () => {
  it('starts on the seed, so nothing is blank before a class is known', () => {
    expect(activeCurriculum()).toBe(CURRICULUM);
  });

  it('finds a topic from whichever curriculum is active', () => {
    setActiveCurriculum(OFFICIAL);

    expect(topicById('sci-ch1-t1')?.name).toBe('Balancing equations');
    expect(chapterById('sci-ch1')?.name).toBe('Chemical Reactions');
    expect(chapterOfTopic('sci-ch1-t2')).toBe('sci-ch1');
    expect(subjectOfChapter('sci-ch1')).toBe('sci');
    expect(topicsOfChapter('sci-ch1').map((t) => t.id)).toEqual(['sci-ch1-t1', 'sci-ch1-t2']);
  });

  it('stops finding the OLD curriculum once a new one is active', () => {
    /*
     * THE LOAD-BEARING HALF. An implementation that merged every curriculum it
     * had ever seen would pass every assertion above, and would then let a
     * Class 10 student practise a class-12 commerce topic that is not on their
     * map -- the original bug, inverted.
     */
    const seedTopic = CURRICULUM[0]!.chapters[0]!.topics[0]!.id;
    expect(topicById(seedTopic)).toBeDefined();

    setActiveCurriculum(OFFICIAL);

    expect(topicById(seedTopic)).toBeUndefined();
  });

  it('returns undefined for an id nobody knows, rather than guessing', () => {
    expect(topicById('no-such-topic')).toBeUndefined();
    expect(chapterById('no-such-chapter')).toBeUndefined();
    expect(chapterOfTopic('no-such-topic')).toBeUndefined();
    expect(topicsOfChapter('no-such-chapter')).toEqual([]);
  });

  it('rebuilds its index when the curriculum changes, not once at import', () => {
    /*
     * The whole defect in one assertion. A cached index built at module load
     * is exactly what `TOPIC_BY_ID` was.
     */
    setActiveCurriculum(OFFICIAL);
    expect(topicById('sci-ch1-t1')).toBeDefined();

    setActiveCurriculum(CURRICULUM);
    expect(topicById('sci-ch1-t1')).toBeUndefined();
  });
});
