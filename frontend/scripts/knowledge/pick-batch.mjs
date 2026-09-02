/**
 * CHOOSING THE FIRST REAL BATCH.
 *
 * The owner's instruction: not 3,995 topics up front, but "50-100 carefully
 * selected topics across classes 9-12, subjects, easy topics, complex topics,
 * naturally atomic topics, hierarchical topics" -- because the question a first
 * batch answers is whether the decomposition works at all, and a hundred maths
 * topics cannot answer it.
 *
 * So: a spread across classes and subjects, only topics `teachable.ts` accepts,
 * only topics whose syllabus page can actually be read.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { notTeachable } from '../../src/knowledge/teachable.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const FRONTEND = join(HERE, '..', '..')

function curriculum(cls) {
  const source = readFileSync(join(FRONTEND, 'src', 'data', 'curriculum', `class${cls}.ts`), 'utf8')
  const at = source.indexOf('= [')
  return JSON.parse(source.slice(at + 2, source.lastIndexOf(']') + 1))
}

/** How many from any one subject, so no subject can dominate the batch. */
const MOST_FROM_ONE_SUBJECT = 6

const picked = []
for (const cls of ['9', '10', '11', '12']) {
  for (const subject of curriculum(cls)) {
    let fromThisSubject = 0
    for (const chapter of subject.chapters) {
      for (const topic of chapter.concepts) {
        if (fromThisSubject >= MOST_FROM_ONE_SUBJECT) break
        if (notTeachable(topic.name) !== null) continue
        if (topic.source?.pdf === undefined || typeof topic.source.page !== 'number') continue
        picked.push({
          cls,
          subjectId: subject.id,
          subjectName: subject.name,
          chapterId: chapter.id,
          chapterName: chapter.name,
          topicId: topic.id,
          topicName: topic.name,
          pdf: topic.source.pdf,
          page: topic.source.page,
        })
        fromThisSubject += 1
      }
    }
  }
}

console.log(JSON.stringify(picked))
