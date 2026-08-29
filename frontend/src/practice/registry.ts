import {
  CURRICULUM,
  type Chapter,
  type ChapterId,
  type Subject,
  type SubjectId,
  type Topic,
  type TopicId,
} from './curriculum'

/**
 * ONE CURRICULUM, READ BY EVERYTHING.
 *
 * THE BUG THIS EXISTS TO MAKE IMPOSSIBLE
 * --------------------------------------
 * The map was pointed at the official CBSE curriculum. Every lookup the rest of
 * practice does -- `TOPIC_BY_ID`, `CHAPTER_BY_ID`, `CHAPTER_OF_TOPIC` -- stayed
 * built from the hand-written class-12 commerce SEED, because they are
 * module-level constants derived from `CURRICULUM` at import time.
 *
 * So the map drew 523 real topics and NOT ONE OF THEM COULD BE PRACTISED.
 * `profileFor` returned null for every id on screen; `store.ts` dropped every
 * pin with `if (!CHAPTER_BY_ID.has(id)) return`. The session dialog opened,
 * said "this topic", and rendered nothing.
 *
 * Nothing failed. No error, no console message, no red test -- two sources of
 * truth for one fact and the screen quietly reading the wrong one. Found by
 * clicking a topic in a browser, which is the only thing that could have found
 * it.
 *
 * WHY A MUTABLE MODULE AND NOT A PROP
 * -----------------------------------
 * The alternative is threading the curriculum through every component and every
 * store action that resolves an id. That is a larger change with the same
 * outcome, and it leaves the same hazard behind: two callers can still be
 * handed different curricula. Here there is exactly one, so they cannot
 * disagree.
 *
 * THE INDEX IS REBUILT ON EVERY SET, NEVER CACHED AT IMPORT. Caching at import
 * is precisely what the old constants did.
 */

interface Index {
  readonly subjects: readonly Subject[]
  readonly topics: ReadonlyMap<string, Topic>
  readonly chapters: ReadonlyMap<string, Chapter>
  readonly chapterOfTopic: ReadonlyMap<string, ChapterId>
  readonly subjectOfChapter: ReadonlyMap<string, SubjectId>
}

function build(subjects: readonly Subject[]): Index {
  const topics = new Map<string, Topic>()
  const chapters = new Map<string, Chapter>()
  const chapterOfTopic = new Map<string, ChapterId>()
  const subjectOfChapter = new Map<string, SubjectId>()

  for (const subject of subjects) {
    for (const chapter of subject.chapters) {
      chapters.set(chapter.id, chapter)
      subjectOfChapter.set(chapter.id, subject.id)
      for (const topic of chapter.topics) {
        topics.set(topic.id, topic)
        chapterOfTopic.set(topic.id, chapter.id)
      }
    }
  }

  return { subjects, topics, chapters, chapterOfTopic, subjectOfChapter }
}

/*
 * Starts on the SEED so nothing is blank in the frame before the official data
 * has loaded -- one class file is 240-560 KB and arrives asynchronously.
 */
let current: Index = build(CURRICULUM)

export function setActiveCurriculum(next: readonly Subject[]): void {
  current = build(next)
}

export function activeCurriculum(): readonly Subject[] {
  return current.subjects
}

export function topicById(id: TopicId): Topic | undefined {
  return current.topics.get(id)
}

export function chapterById(id: ChapterId): Chapter | undefined {
  return current.chapters.get(id)
}

/** Which chapter a topic belongs to. Undefined for an id nobody knows. */
export function chapterOfTopic(id: TopicId): ChapterId | undefined {
  return current.chapterOfTopic.get(id)
}

export function subjectOfChapter(id: ChapterId): SubjectId | undefined {
  return current.subjectOfChapter.get(id)
}

/** Every topic in a chapter, or an empty list for an id nobody knows. */
export function topicsOfChapter(id: ChapterId): readonly Topic[] {
  return current.chapters.get(id)?.topics ?? []
}

/** Presence checks, so a caller never has to reach for the map itself. */
export function hasChapter(id: ChapterId): boolean {
  return current.chapters.has(id)
}

export function hasTopic(id: TopicId): boolean {
  return current.topics.has(id)
}
