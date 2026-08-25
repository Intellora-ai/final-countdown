import { isPractisable } from '../../scripts/topic-quality.mjs';
import type { ExamPatternPaper, ExamSkillPaper, ExamSyllabus } from '../types';
import type { Chapter, Subject, Topic } from './curriculum';

/**
 * The four entrance exams, in the shape the practice map needs.
 *
 * `src/data/exams/` holds four generated files, each traced to an official PDF
 * by sha256, and all four had ZERO non-test importers. A student who picked JEE
 * at onboarding was shown their school syllabus and nothing else.
 *
 * THE THREE SHAPES ARE GENUINELY DIFFERENT, AND FLATTENING THEM WOULD BE A LIE
 * ---------------------------------------------------------------------------
 *   ExamSyllabus      JEE, NEET    subject -> unit -> topic strings
 *   ExamSkillPaper    CLAT         section -> skills. CLAT says outright that
 *                                  it tests aptitude rather than prior
 *                                  knowledge, so it publishes no syllabus.
 *   ExamPatternPaper  IPMAT        section names and question COUNTS, and
 *                                  nothing else. No topics exist in the
 *                                  document at any level.
 *
 * So there are three functions rather than one, and the third returns nothing.
 * See `fromPatternPaper`.
 */

/**
 * Ids are built from POSITION, never from the topic text.
 *
 * Topic phrases repeat across units -- the same wording appears under more than
 * one heading in the same PDF. An id derived from the text collides, and two
 * colliding topics then share one student's progress record with no error
 * anywhere. Position is unique by construction.
 */
const topicId = (examId: string, subjectId: string, unit: number, index: number): string =>
  `${examId}--${subjectId}--u${unit}--t${index}`;

export function fromSyllabus(exam: ExamSyllabus): Subject[] {
  const out: Subject[] = [];

  for (const subject of exam.subjects) {
    const chapters: Chapter[] = [];

    for (const unit of subject.units) {
      /*
       * Exam PDFs are extracted by the same pipeline as the school syllabus
       * PDFs, so they carry the same wreckage: marks rows, bare labels, half
       * sentences. The unit TITLE is held to the same bar as its topics --
       * a real topic sitting under a heading scraped out of a worked example
       * is still unreachable to a student browsing by chapter.
       */
      if (!isPractisable(unit.title, 'exam')) continue;

      const topics: Topic[] = unit.topics
        .map((name, index) => ({ name, index }))
        .filter(({ name }) => isPractisable(name, 'exam'))
        .map(({ name, index }) => ({
          id: topicId(exam.id, subject.id, unit.number, index),
          name,
        }));

      if (topics.length === 0) continue;

      chapters.push({
        id: `${exam.id}--${subject.id}--u${unit.number}`,
        /*
         * Numbered over the SURVIVORS. Dropping a unit must not leave a hole in
         * the sequence -- the number is what a student matches against their
         * own syllabus, and a gap reads as missing content rather than as
         * filtered content.
         */
        number: chapters.length + 1,
        name: unit.title,
        topics,
      });
    }

    if (chapters.length === 0) continue;

    /*
     * NAMESPACED, because both trees are drawn on one map. `mathematics` is a
     * subject id in class11.ts and in jee-main-2026.ts, and they are different
     * trees -- 45 units of exam scope against the CBSE course. Colliding the
     * ids merges two node sets under one heading with nothing able to notice.
     * The NAME stays plain: the id is not the label.
     */
    out.push({ id: `${exam.id}--${subject.id}`, name: titleCase(subject.id), chapters });
  }

  return out;
}

/**
 * CLAT, whose sections list SKILLS rather than chapters.
 *
 * The skills are the practisable grain here and they are real, quoted text --
 * "identify the arguments and conclusions in a passage" is something a question
 * can be built against. One subject, because CLAT is one paper.
 */
export function fromSkillPaper(paper: ExamSkillPaper): Subject[] {
  const chapters: Chapter[] = [];

  for (const section of paper.sections) {
    const topics: Topic[] = section.skills
      .map((name, index) => ({ name, index }))
      .filter(({ name }) => isPractisable(name, 'exam'))
      .map(({ name, index }) => ({
        id: `${paper.id}--${section.id}--s${index}`,
        name,
      }));

    if (topics.length === 0) continue;

    chapters.push({
      id: `${paper.id}--${section.id}`,
      number: chapters.length + 1,
      name: section.name,
      topics,
    });
  }

  if (chapters.length === 0) return [];

  return [{ id: paper.id, name: titleCase(paper.id), chapters }];
}

/**
 * IPMAT, and the reason this function returns nothing.
 *
 * The document publishes section names and question counts. It publishes no
 * topics, no units and no skills. Turning "Quantitative Ability, 40 questions"
 * into practisable topics means INVENTING A SYLLABUS and filing it where real
 * syllabus goes; a student would then practise against a curriculum no examiner
 * ever wrote, and nothing downstream could tell the difference.
 *
 * `sections` is still returned because the section names ARE real and traced to
 * the PDF. "Nothing to practise" and "nothing is known" are different facts,
 * and a blank screen states the wrong one.
 */
export function fromPatternPaper(paper: ExamPatternPaper): {
  subjects: Subject[];
  sections: string[];
  reason: string;
} {
  return {
    subjects: [],
    sections: paper.sections.map((section) => section.name),
    reason:
      `${paper.id} publishes an exam PATTERN -- section names and question counts -- ` +
      `and no topics at any level. Generating topics from it would invent a syllabus.`,
  };
}

/** `mathematics` -> `Mathematics`. Ids are lower-case in the generated files. */
function titleCase(id: string): string {
  return id
    .split(/[-_]/)
    .map((word) => (word.length === 0 ? word : word[0]!.toUpperCase() + word.slice(1)))
    .join(' ');
}
