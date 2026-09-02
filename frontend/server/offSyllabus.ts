/**
 * G4 — OFF-SYLLABUS IS TAUGHT, KEPT, AND NEVER COUNTED.
 *
 * A Class 10 student asks about black holes. She is taught properly, on the
 * canvas she was already on, and it stays there: nothing is deleted, and she
 * never sees a refusal. Decided 2026-09-02.
 *
 * The separation is in the BACKEND. An off-syllabus answer must not enter
 * mastery, prerequisites, exam weighting or the priority engine -- not because
 * it is worth less, but because mixing the two corrupts both. Her progress
 * picture would say she has covered ground she has not, and every later
 * decision about what she is ready for would be made from that.
 *
 * The test is simply whether the curriculum in front of her names the topic.
 * The free canvas, which has no topic id at all, is off-syllabus by the same
 * rule -- and that is right: nobody can say what a blank canvas was about.
 */
import type { Syllabus } from './priority.ts'

export function isOffSyllabus(topicId: string | null, syllabus: Syllabus): boolean {
  if (topicId === null || topicId.trim() === '') return true
  return !syllabus.topics.some((topic) => topic.id === topicId)
}
