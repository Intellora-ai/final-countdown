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

    subject.chapters.forEach((chapter, index) => {
      const topics: Topic[] = chapter.concepts
        .filter((concept) => isPractisable(concept.name))
        .map((concept) => ({ id: concept.id, name: concept.name }));

      if (topics.length === 0) return;

      chapters.push({
        id: chapter.id,
        /* The number the student sees on their syllabus, not an array index. */
        number: index + 1,
        name: chapter.name,
        topics,
      });
    });

    if (chapters.length === 0) continue;

    out.push({ id: subject.id, name: subject.name, chapters });
  }

  return out;
}
