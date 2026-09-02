/**
 * A TOPIC ID BELONGS TO EXACTLY ONE TOPIC.
 *
 * MEASURED 2026-09-03 on the real curricula: Class 11 has 1,404 topics and
 * 1,402 distinct ids, and Class 12 the same. Accountancy and Business Studies
 * each carry a chapter "Theory" with a topic "20 marks", and a chapter
 * "Unit 1" with a topic "Objectives"; the generated id is
 * `<chapter>--<topic>`, which is unique inside a subject and not across them.
 *
 * EVERYTHING THE CANVAS DOES IS KEYED BY THAT ID -- the address
 * `#/canvas/<topicId>`, the memory row, the evidence, the misconceptions, the
 * priority engine. Two topics sharing one means the Accountancy student and
 * the Business Studies student share a canvas, write over each other's memory,
 * and read each other's lessons; and `topicNamed` answers with whichever
 * subject the loader happened to put first.
 *
 * Fixed at the edge, where a curriculum is loaded, rather than in the
 * generated data: the data is traced to official PDFs and regenerating it is a
 * different job with different risks, and any FUTURE curriculum gets the same
 * guarantee for free. The first topic to claim an id keeps it -- so the
 * commonest addresses do not move -- and a later one is qualified by its
 * subject. Names are never touched, so nothing a learner reads changes.
 */
import type { Concept, Subject } from '../types'

export function withUniqueTopicIds(subjects: readonly Subject[]): Subject[] {
  const taken = new Set<string>()
  return subjects.map((subject) => {
    /* Prerequisites name topics inside their own subject, so a rename has to
       be carried into this subject's `deps` or a dependency would point at the
       other subject's topic -- which is the very collision being undone. */
    const renamed = new Map<string, string>()
    const chapters = subject.chapters.map((chapter) => ({
      ...chapter,
      concepts: chapter.concepts.map((concept): Concept => {
        if (!taken.has(concept.id)) {
          taken.add(concept.id)
          return concept
        }
        let id = `${subject.id}--${concept.id}`
        for (let n = 2; taken.has(id); n += 1) id = `${subject.id}-${n}--${concept.id}`
        taken.add(id)
        renamed.set(concept.id, id)
        return { ...concept, id }
      }),
    }))
    if (renamed.size === 0) return { ...subject, chapters }
    return {
      ...subject,
      chapters: chapters.map((chapter) => ({
        ...chapter,
        concepts: chapter.concepts.map((concept) => ({
          ...concept,
          deps: concept.deps.map((dep) => renamed.get(dep) ?? dep),
        })),
      })),
    }
  })
}
