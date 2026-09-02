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
        blocks: [{ id: 'answer', kind: 'prose', body: answer }],
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
