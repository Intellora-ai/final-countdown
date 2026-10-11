import type { Lesson } from '../src/lesson.ts'

// Older turns need meaning, not copies of every vector stroke. Keep the newest
// board intact when it fits; never truncate XML into broken geometry.
export function compactContext(memory: { question: string; lesson: Lesson }[], previous?: Lesson, budget = 24000) {
  const turns = memory.map(turn => ({ ...turn, lesson: turn.lesson }))
  if (previous && !turns.some(turn => JSON.stringify(turn.lesson) === JSON.stringify(previous))) turns.push({ question: '', lesson: previous })
  const transcript = (lesson: Lesson) => ({ ...(lesson.title ? { title: lesson.title } : {}), explanation: lesson.explanation, blocks: [] })
  const compact = turns.map((turn, i) => ({ question: turn.question, lesson: i === turns.length - 1 ? turn.lesson : transcript(turn.lesson) }))
  if (compact.length && JSON.stringify(compact.at(-1)).length > budget) compact[compact.length - 1].lesson = transcript(compact.at(-1)!.lesson)
  while (compact.length > 1 && JSON.stringify(compact).length > budget) compact.shift()
  const geometryOmitted = turns.length > 0 && turns.at(-1)!.lesson.blocks.length > 0 && !compact.at(-1)?.lesson.blocks.length
  return { turns: compact, geometryOmitted }
}
