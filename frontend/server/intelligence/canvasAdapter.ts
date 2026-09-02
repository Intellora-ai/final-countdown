/**
 * THE CANVAS ADAPTER: a learning action becomes the one thing the canvas
 * stores, an artifact -- or is refused in the canvas's own words.
 *
 * Pure. It never writes; whoever holds the artifact decides that (in shadow,
 * nobody). It runs the SAME gate the live path runs, `validateLesson`, so a
 * proposal can never reach a canvas as something the canvas would refuse to
 * draw. A kind it has no canvas form for is a loud gap, named, never a
 * stand-in.
 */
import type { NewArtifact } from '../../src/canvas/api/memoryClient.ts'
import type { LessonInput } from '../../src/canvas/spec/spec.ts'
import { validateLesson } from '../../src/canvas/spec/validate.ts'
import { asId } from '../../src/canvas/teach/mend.ts'
import { MAX_RUN_WORDS, words } from '../../src/canvas/teach/teaching.ts'
import type { LearningAction } from './ir.ts'

export type Adapted =
  | { readonly ok: true; readonly artifact: NewArtifact }
  | { readonly ok: false; readonly issues: readonly string[] }

export function toArtifact(action: LearningAction, request: { readonly question: string }): Adapted {
  switch (action.kind) {
    case 'explain': {
      const answer = action.payload?.['answer']
      if (typeof answer !== 'string') return { ok: false, issues: ['an explanation carries no answer'] }
      const input: LessonInput = {
        id: asId(request.question),
        question: request.question,
        blocks: [{ id: 'answer', kind: 'prose', body: breathe(answer) }],
      }
      const judged = validateLesson(input, { teaching: 'answer' })
      if (!judged.ok) return { ok: false, issues: judged.issues.map((i) => `${i.path}: ${i.message}`) }
      return { ok: true, artifact: { kind: 'lesson', question: request.question, payload: judged.lesson, teaching: 'answer' } }
    }
    case 'ask': {
      const question = action.payload?.['question']
      if (typeof question !== 'string' || question.length === 0) return { ok: false, issues: ['an ask carries no question'] }
      return { ok: true, artifact: { kind: 'note', question: request.question, payload: { question }, teaching: 'off' } }
    }
    default:
      return { ok: false, issues: [`no canvas form for a ${action.kind} action yet`] }
  }
}

/**
 * Put a blank line where a paragraph would breathe. Sentences are kept whole
 * and no word changes; a paragraph closes when the next sentence would push
 * it past the limit. A sentence longer than the limit on its own is opened
 * at its semicolons; one with none is left as it is, for the gate to refuse
 * in its own words.
 */
export function breathe(text: string): string {
  if (text.includes('\n\n')) return text
  const sentences = (text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) ?? [text])
    /* A sentence that is itself over the limit is opened at its semicolons:
       each clause is a whole thought, and no word changes. A sentence with no
       semicolon and too many words is left as it is, for the gate. */
    .flatMap((sentence) => (words(sentence).length > MAX_RUN_WORDS && sentence.includes('; ') ? sentence.split(/;\s+/).map((clause, i, all) => (i < all.length - 1 ? `${clause};\n` : clause)) : [sentence]))
  const paragraphs: string[] = []
  let current: string[] = []
  let count = 0
  for (const sentence of sentences) {
    /* Counted the way the gate counts, so the two can never disagree by one. */
    const n = words(sentence).length
    if (current.length > 0 && count + n > MAX_RUN_WORDS) {
      paragraphs.push(current.join('').trim())
      current = []
      count = 0
    }
    current.push(sentence)
    count += n
  }
  if (current.length > 0) paragraphs.push(current.join('').trim())
  return paragraphs.join('\n\n')
}
