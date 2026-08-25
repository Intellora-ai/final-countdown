import { describe, expect, it } from 'vitest';

import { CURRICULUM } from './curriculum';
import { practiceCurriculumFor } from './mapSource';

/**
 * WHICH CURRICULUM THE PRACTICE MAP DRAWS.
 *
 * Three curricula exist in this repository and they describe different worlds:
 *
 *   src/data/curriculum/class{9..12}.ts   official CBSE, 50,504 generated lines
 *                                         from 37 hash-locked syllabus PDFs
 *   src/practice/curriculum.ts            hand-written, class-12 commerce only,
 *                                         4 subjects
 *   src/data/curriculum.ts                a mock the dashboard still reads
 *
 * The map drew the SECOND one. A class-10 student opened Practice and was shown
 * Accountancy and Business Studies -- subjects they do not take -- because the
 * only curriculum wired in was the commerce seed.
 *
 * `officialCurriculum.ts` was built to convert the first into the shape the map
 * needs, was fully tested, and had ZERO non-test importers. This is its caller.
 *
 * THE FALLBACK IS DELIBERATE AND IT IS NOT A SILENT ONE. A class with no
 * generated data yet falls back to the seed, and that is reported rather than
 * hidden, because an empty map and a map nobody has data for look identical to
 * a student and completely different to whoever has to fix it.
 */

describe('choosing the curriculum the map draws', () => {
  it('falls back to the seed when a class has no official data', async () => {
    const result = await practiceCurriculumFor(null);
    expect(result.source).toBe('seed');
    expect(result.subjects).toBe(CURRICULUM);
  });

  it('says which source it used, so an empty map is never a mystery', async () => {
    /*
     * `source` exists so the caller can tell "this class has no data yet" from
     * "this class has data and it is empty". Those need different fixes and
     * look the same on screen.
     */
    const result = await practiceCurriculumFor(null);
    expect(['official', 'seed']).toContain(result.source);
  });

  it('loads the OFFICIAL curriculum for a class that has one', async () => {
    /*
     * THE LOAD-BEARING ONE, and it was missing on the first draft.
     *
     * Every other test in this file passed against a stub that always returned
     * the seed. A test suite a stub satisfies proves nothing, so this asserts
     * the thing that can only be true if the official data was actually read:
     * Class 9 has nine subjects, and none of them is a commerce seed subject.
     */
    const result = await practiceCurriculumFor('Class 9');
    expect(result.source).toBe('official');
    expect(result.subjects.length).toBeGreaterThan(4);

    const names = result.subjects.map((s) => s.name);
    expect(names).toContain('Mathematics');
    /* Accountancy is class-12 commerce. Its presence would mean the seed. */
    expect(names).not.toContain('Accountancy');
  });

  it('never returns an empty map without saying why', async () => {
    const result = await practiceCurriculumFor('Class 9');
    if (result.subjects.length === 0) {
      expect(result.source).toBe('empty');
      expect(result.reason).toBeTruthy();
    } else {
      expect(result.subjects.length).toBeGreaterThan(0);
    }
  });

  it('drops every topic a student could not practise', async () => {
    /*
     * The filter is `officialCurriculum`'s job and is tested there. What is
     * asserted here is that this caller USES the filtered result -- a wire that
     * calls a filter and returns the unfiltered input is not a wire.
     */
    const result = await practiceCurriculumFor('Class 9');
    if (result.source !== 'official') return;

    for (const subject of result.subjects) {
      for (const chapter of subject.chapters) {
        expect(chapter.topics.length).toBeGreaterThan(0);
        for (const topic of chapter.topics) {
          expect(topic.name.trim().length).toBeGreaterThan(2);
          expect(topic.name).not.toMatch(/^(Part|Unit|Section|Theory)\s*[A-Z0-9]*$/i);
        }
      }
    }
  });
});
