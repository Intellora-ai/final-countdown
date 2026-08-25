import { describe, expect, it } from 'vitest';

import { clat_2027 } from '../data/exams/clat-2027';
import { ipmat_2026_rohtak } from '../data/exams/ipmat-2026-rohtak';
import { jee_main_2026 } from '../data/exams/jee-main-2026';
import { neet_ug_2026 } from '../data/exams/neet-ug-2026';
import { fromPatternPaper, fromSkillPaper, fromSyllabus } from './examCurriculum';
import type { Subject } from './curriculum';

/**
 * THE FOUR ENTRANCE EXAMS, AND WHY ONE OF THEM YIELDS NOTHING.
 *
 * `src/data/exams/` holds four generated files, each traced to an official PDF
 * by sha256. All four had ZERO non-test importers: a student who picked JEE at
 * onboarding was shown their school syllabus and nothing else.
 *
 * The three shapes are genuinely different and flattening them would be a lie:
 *
 *   jee-main-2026    ExamSyllabus      subject -> unit -> topic strings
 *   neet-ug-2026     ExamSyllabus      same
 *   clat-2027        ExamSkillPaper    section -> skills; CLAT states outright
 *                                      that it tests aptitude, not a syllabus
 *   ipmat-2026       ExamPatternPaper  sections and question COUNTS. No topics
 *                                      exist anywhere in the document.
 *
 * IPMAT IS THE IMPORTANT CASE. Turning "Quantitative Ability, 40 questions"
 * into practisable topics would mean inventing a syllabus and filing it where
 * real syllabus goes. A student would then practise against a curriculum no
 * examiner ever published. So it returns nothing, and says why -- an empty
 * result with a reason is honest; a plausible one is not.
 */

function everyTopic(subjects: readonly Subject[]): string[] {
  return subjects.flatMap((s) => s.chapters.flatMap((c) => c.topics.map((t) => t.name)));
}

function everyId(subjects: readonly Subject[]): string[] {
  return subjects.flatMap((s) => [
    s.id,
    ...s.chapters.flatMap((c) => [c.id, ...c.topics.map((t) => t.id)]),
  ]);
}

describe('an exam that publishes a syllabus becomes practisable topics', () => {
  it('turns every JEE unit into a chapter carrying its own topics', () => {
    const subjects = fromSyllabus(jee_main_2026);

    expect(subjects.map((s) => s.name).sort()).toEqual(['Chemistry', 'Mathematics', 'Physics']);
    /*
     * 53 units are declared by the generated file itself (`unitCount`). Some
     * are dropped by the quality filter, so the assertion is that the surviving
     * chapters are a NON-EMPTY SUBSET -- pinning the exact number here would
     * pin the filter's current strictness rather than this converter.
     */
    const chapters = subjects.flatMap((s) => s.chapters);
    expect(chapters.length).toBeGreaterThan(30);
    expect(chapters.length).toBeLessThanOrEqual(53);
    for (const chapter of chapters) expect(chapter.topics.length).toBeGreaterThan(0);
  });

  it('carries real topic text through, not unit titles', () => {
    /*
     * The oracle is the source PDF: JEE unit 1 is SETS, RELATIONS AND FUNCTIONS
     * and lists "Power set" as a topic inside it. A converter that emitted one
     * topic per unit -- the easiest wrong implementation -- would produce the
     * title and never this.
     */
    expect(everyTopic(fromSyllabus(jee_main_2026))).toContain('Power set');
  });

  it('numbers chapters from 1 with no holes, whatever the filter dropped', () => {
    for (const subject of fromSyllabus(jee_main_2026)) {
      expect(subject.chapters.map((c) => c.number)).toEqual(
        subject.chapters.map((_, index) => index + 1),
      );
    }
  });

  it('gives NEET its own subjects rather than JEE\'s', () => {
    /*
     * Both are ExamSyllabus, so a converter that hardcoded JEE's three subject
     * ids would pass every test above and fail here. Biology is NEET-only.
     *
     * Asserted on the NAME rather than the id. Ids are namespaced by exam (see
     * the last block in this file) and the namespace is not what this test is
     * about; the name is the stable half.
     */
    expect(fromSyllabus(neet_ug_2026).map((s) => s.name)).toContain('Biology');
  });

  it('makes every id unique, because ids are what progress is saved against', () => {
    /*
     * Topic TEXT repeats across units -- the same phrase appears under more
     * than one heading. Deriving an id from the text alone collides, and two
     * colliding topics share one student's progress record silently.
     */
    const ids = everyId(fromSyllabus(jee_main_2026));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('drops the fragments the quality filter rejects', () => {
    /*
     * Exam PDFs are extracted the same way school syllabus PDFs are, so they
     * carry the same junk. A converter that skipped the filter would put
     * unpractisable fragments on the map.
     */
    for (const name of everyTopic(fromSyllabus(neet_ug_2026))) {
      expect(name.trim().length).toBeGreaterThan(2);
      expect(name).not.toMatch(/^(Unit|Section|Part)\s*[A-Z0-9IVX]*$/i);
    }
  });
});

describe('an exam that publishes skills instead of a syllabus', () => {
  it('turns each CLAT section into a chapter of its stated skills', () => {
    const subjects = fromSkillPaper(clat_2027);

    expect(subjects).toHaveLength(1);
    const chapters = subjects[0]?.chapters ?? [];
    expect(chapters.length).toBe(clat_2027.sections.length);
    for (const chapter of chapters) expect(chapter.topics.length).toBeGreaterThan(0);
  });

  it('keeps every id unique across sections', () => {
    const ids = everyId(fromSkillPaper(clat_2027));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('an exam that publishes only a pattern', () => {
  it('returns NO topics, and says why', () => {
    /*
     * THE LOAD-BEARING TEST IN THIS FILE.
     *
     * IPMAT publishes section names and question counts. It publishes no
     * topics. The tempting implementation makes "Quantitative Ability" a
     * chapter and invents topics under it; a student would then practise a
     * syllabus that does not exist, and every other test here would still pass.
     */
    const result = fromPatternPaper(ipmat_2026_rohtak);

    expect(result.subjects).toEqual([]);
    expect(result.reason).toMatch(/pattern|no topics|no syllabus/i);
  });

  it('still reports the sections it DOES know, so the screen is not blank', () => {
    /*
     * "Nothing to practise" and "nothing is known" are different facts. The
     * section names are real and traced to the PDF; withholding them would
     * throw away the only true thing the document says.
     */
    expect(fromPatternPaper(ipmat_2026_rohtak).sections).toEqual([
      'Quantitative Ability',
      'Logical Reasoning',
      'Verbal Ability',
    ]);
  });
});

describe('an exam sits on the same map as a school syllabus', () => {
  it('namespaces its subject ids so JEE Mathematics is not Class 11 Mathematics', () => {
    /*
     * Both trees are drawn on one map. `mathematics` is a subject id in
     * class11.ts AND in jee-main-2026.ts, and they are different trees -- the
     * exam one is 45 units of exam scope, the school one is the CBSE course.
     * Colliding those ids merges two node sets under one heading, and the map
     * has no way to notice.
     */
    for (const subject of fromSyllabus(jee_main_2026)) {
      expect(subject.id.startsWith('jee-main-2026--')).toBe(true);
    }
    expect(fromSyllabus(jee_main_2026).map((s) => s.id)).not.toContain('mathematics');
  });

  it('keeps the readable name un-namespaced, because the id is not the label', () => {
    expect(fromSyllabus(jee_main_2026).map((s) => s.name)).toContain('Mathematics');
  });
});
