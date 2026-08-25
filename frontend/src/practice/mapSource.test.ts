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

/**
 * THE ENTRANCE EXAM, DRAWN ON THE SAME MAP AS THE SCHOOL SYLLABUS.
 *
 * `src/data/exams/` holds four generated files traced to official PDFs by
 * sha256, and every one had ZERO non-test importers. A student who picked JEE
 * saw their school syllabus and nothing else -- the exam they are actually
 * sitting was absent from the product entirely.
 *
 * A student takes BOTH. Class 11 Physics and JEE Physics overlap but are not
 * the same scope, so the exam is added alongside the class rather than
 * replacing it, and its subject ids are namespaced so the two trees cannot
 * merge into one heading.
 */
describe('an entrance exam on the practice map', () => {
  it('adds the exam subjects to the class subjects, and keeps both', async () => {
    const withoutExam = await practiceCurriculumFor('Class 11', null);
    const withExam = await practiceCurriculumFor('Class 11', 'jee-main-2026');

    expect(withExam.subjects.length).toBeGreaterThan(withoutExam.subjects.length);
    /* Every school subject survives. The exam is added, never substituted. */
    for (const subject of withoutExam.subjects) {
      expect(withExam.subjects.map((s) => s.id)).toContain(subject.id);
    }
    expect(withExam.exam?.source).toBe('official');
  });

  it('never lets an exam subject collide with a school subject', async () => {
    /*
     * `mathematics` is a subject id in class11.ts AND in jee-main-2026.ts.
     * A collision merges two different trees under one node and the map has no
     * way to notice it happened.
     */
    const ids = (await practiceCurriculumFor('Class 11', 'jee-main-2026')).subjects.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reports IPMAT as having no topics rather than inventing them', async () => {
    /*
     * THE LOAD-BEARING ONE. IPMAT publishes section names and question counts
     * and no topics at any level. The tempting implementation makes
     * "Quantitative Ability" a chapter and fills it in; a student would then
     * practise a syllabus no examiner ever wrote, and every other assertion
     * here would still pass.
     */
    const result = await practiceCurriculumFor('Class 12', 'ipmat-2026-rohtak');

    expect(result.exam?.source).toBe('pattern-only');
    expect(result.exam?.reason).toBeTruthy();
    for (const subject of result.subjects) {
      expect(subject.id.startsWith('ipmat')).toBe(false);
    }
  });

  it('draws CLAT skills, which are the only thing CLAT publishes', async () => {
    const result = await practiceCurriculumFor('Class 12', 'clat-2027');
    const clat = result.subjects.filter((s) => s.id.startsWith('clat-2027'));

    expect(clat.length).toBe(1);
    expect(clat[0]?.chapters.length).toBeGreaterThan(0);
  });

  it('says so when an exam id is not one it has, instead of failing silently', async () => {
    const result = await practiceCurriculumFor('Class 11', 'gate-2099');

    expect(result.exam?.source).toBe('unknown');
    expect(result.exam?.reason).toMatch(/gate-2099/);
    /* The class map is unharmed. One unknown exam must not empty the screen. */
    expect(result.subjects.length).toBeGreaterThan(0);
  });
});
