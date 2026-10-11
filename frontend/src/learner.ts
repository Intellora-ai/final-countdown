import type { Lesson } from './lesson'

export const learnerKey = 'visual-canvas/learner'
export function mergeMemory(current: string, replacement?: string) {
  return replacement === undefined ? current : replacement.slice(0, 2000)
}
export function readLearner() {
  try { return localStorage.getItem(learnerKey) ?? '' } catch { return '' }
}
export function tokens(text: string) {
  return new Set(text.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])
}
export function retrieve(entries: { id: string; question: string; lesson: Lesson }[], question: string, exclude: Set<string>) {
  const indexed = entries.filter(e => !exclude.has(e.id)).map(e => ({ e, words: tokens(e.question + ' ' + e.lesson.explanation) }))
  const frequency = new Map<string, number>()
  indexed.forEach(({ words }) => words.forEach(word => frequency.set(word, (frequency.get(word) ?? 0) + 1)))
  // Ignore vocabulary common to this learner's whole archive, not a hardcoded
  // subject or language stop-list. Rare shared terms carry more evidence.
  const terms = [...tokens(question)].filter(word => indexed.length < 10 || (frequency.get(word) ?? 0) <= indexed.length / 2)
  return indexed.map(({ e, words }) => ({ e, score: terms.reduce((score, word) => score + (words.has(word) ? Math.log(1 + indexed.length / (frequency.get(word) ?? 1)) : 0), 0) }))
    .filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3)
    .map(({ e }) => `Earlier question: ${e.question}\nAnswer: ${e.lesson.explanation}`).join('\n\n').slice(0, 4000)
}
