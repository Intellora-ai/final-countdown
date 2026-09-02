/**
 * ONE canvas per TOPIC, and this is how its address becomes its name.
 *
 * A topic's id is the canvas's address (`#/canvas/<topicId>`), and the canvas
 * needs the topic's NAME to teach it -- sending the id would ask the model to
 * teach a database key. This is the one reader that turns the address back
 * into words, across every subject the student planned.
 *
 * NULL, NEVER A GUESS. `ChapterView` answered an unmatched address with
 * `return null` -- a main area with nothing in it at all, which is exactly
 * the "truly empty" page a learner reported at `#/chapter/…`. A topic this
 * device does not know must become a sentence on screen, and that starts with
 * this function saying so rather than falling through to the first thing it
 * has.
 */

import type { SubjectLike } from './resolve'

export interface NamedTopic {
  readonly id: string
  readonly name: string
  readonly chapter: string
  readonly subject: string
}

export function topicNamed(subjects: readonly SubjectLike[], topicId: string): NamedTopic | null {
  if (topicId === '') return null
  for (const subject of subjects) {
    for (const chapter of subject.chapters) {
      const concept = chapter.concepts.find((c) => c.id === topicId)
      if (concept !== undefined) {
        return { id: concept.id, name: concept.name, chapter: chapter.name, subject: subject.name }
      }
    }
  }
  return null
}

/**
 * D3 — WHAT THE CURRICULUM SAYS COMES FIRST, scoped to its own subject.
 *
 * Every concept in `src/data/curriculum/` carries `deps`: 506 of Class 10's
 * 612 concepts name at least one. That is a PRIOR -- what the book says comes
 * first, not what is stopping this learner; the server checks it against her
 * own evidence (`server/prerequisites.ts`). Here it is only read.
 *
 * SUBJECT-SCOPED, because a prerequisite relation in physics never applies to
 * biology. A dep id that does not resolve inside this topic's OWN subject is
 * dropped rather than guessed at: an unresolvable id is a data fault, and
 * teaching a biology concept to answer a physics plea is worse than silence.
 */
export function prerequisitesOf(
  subjects: readonly SubjectLike[],
  topicId: string,
): readonly { readonly id: string; readonly name: string }[] {
  if (topicId === '') return []
  for (const subject of subjects) {
    const here = new Map<string, string>()
    let listed: readonly string[] | undefined
    for (const chapter of subject.chapters) {
      for (const concept of chapter.concepts) {
        here.set(concept.id, concept.name)
        if (concept.id === topicId) {
          const deps = (concept as { deps?: unknown }).deps
          listed = Array.isArray(deps) ? deps.filter((one): one is string => typeof one === 'string') : []
        }
      }
    }
    if (listed === undefined) continue
    return listed.flatMap((id) => {
      const name = here.get(id)
      return name === undefined ? [] : [{ id, name }]
    })
  }
  return []
}
