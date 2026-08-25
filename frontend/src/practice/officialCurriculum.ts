import { isPractisable } from '../../scripts/topic-quality.mjs';
import type { Subject as OfficialSubject } from '../types';
import type { Chapter, Subject, Topic } from './curriculum';

/**
 * The official CBSE curriculum, in the shape practice needs.
 *
 * CBSE publishes `Subject -> Chapter -> Concept`. Practice needs
 * `Subject -> Chapter -> Topic`. Measured against the real data, the concept IS
 * the topic: `Sections of a cone` contains `circles`, `ellipse`, `parabola`,
 * `hyperbola` -- exactly the grain a student would click. So no layer is
 * invented here. One is renamed, and the unusable ones are dropped.
 *
 * THE FILTER IS THE JOB, NOT A DETAIL
 * -----------------------------------
 * 1,059 of 3,995 concepts cannot be practised -- marks-table rows, teacher
 * instructions, half-sentences. `Part A` is one of them. A student who clicks
 * `Part A` gets a question generated about nothing, so those never reach the map.
 *
 * DROPPING CASCADES UPWARDS, DELIBERATELY. A chapter whose topics were all
 * unusable is dropped, and a subject left with no chapters is dropped too. An
 * empty node is worse than an absent one: it renders on the map, opens onto
 * nothing, and the student cannot tell "not built yet" from "broken".
 *
 * IDS ARE CARRIED THROUGH UNCHANGED. Progress is persisted against them.
 * Re-slugging here would detach every student's saved history at once, and
 * silently.
 */
export function toPracticeCurriculum(subjects: readonly OfficialSubject[]): Subject[] {
  const out: Subject[] = [];

  for (const subject of subjects) {
    const chapters: Chapter[] = [];

    for (const chapter of subject.chapters) {
      /*
       * THE CHAPTER NAME IS HELD TO THE SAME BAR AS A TOPIC NAME.
       *
       * Found in a screenshot, not in a diff: the topic filter was working --
       * 523 topics, all clean -- while 24 of 84 CHAPTERS on screen read
       * "Example 1", "Hint", "Statement", "Proof". Grading concepts without
       * looking at the heading they hang under lets a real topic sit inside a
       * chapter scraped out of a worked example. A student browsing the map
       * reads chapter names FIRST, so this was the more visible half of the
       * defect and the half nothing checked.
       */
      if (!isPractisable(chapter.name)) continue;

      const topics: Topic[] = chapter.concepts
        .filter((concept) => isPractisable(concept.name))
        .map((concept) => ({ id: concept.id, name: concept.name }));

      if (topics.length === 0) continue;

      chapters.push({
        id: chapter.id,
        /*
         * Numbered over the SURVIVORS, not over the source array. Dropping
         * chapter 1 must not leave the map starting at "Chapter 2" -- the
         * number is what a student matches against their own syllabus, and a
         * hole in it reads as missing content rather than as filtered content.
         */
        number: chapters.length + 1,
        name: chapter.name,
        topics,
      });
    }

    if (chapters.length === 0) continue;

    out.push({ id: subject.id, name: subject.name, chapters });
  }

  return out;
}
