/**
 * EVIDENCE: WHAT THE LEARNER TYPED, WHEN, AND WHAT KIND OF THING IT WAS.
 *
 * C3, decided 2026-09-02. Questions are rare on the canvas; a question is the
 * system's move only when the learner did not understand -- and the evidence
 * of that is what they typed. This is the record every later decision reasons
 * from: the eight-way diagnosis (D1), the misconception hypotheses (C4), the
 * priority engine (G3).
 *
 * THE SAME BOX EVERYTHING ELSE LIVES IN: the memory store of Phase 1, keyed by
 * `memoryKey`, written through the transactional `update`. Isolation and
 * durability are not re-argued here; they were proven there.
 *
 * WHAT IS NOT RECORDED, deliberately, as in `explanations.ts`: no mastery, no
 * confidence, no "how well she understood". A `kind` here is OBSERVABLE --
 * `plea` means she wrote that it did not land, `answer` means she wrote a
 * statement, `question` means she asked one, `empty` means she sent nothing.
 * Whether an answer was right is a judgement, and it is made later, by
 * something that can read it, and stored as a hypothesis, never as a fact.
 */
import { fittedLessonId, memoryKey, type MemoryOwner } from './key.ts'
import type { MemoryStore } from './sqliteStore.ts'

export interface Evidence {
  /** What she typed, whole. */
  readonly said: string
  readonly kind: 'plea' | 'answer' | 'question' | 'empty'
  /** ISO time. */
  readonly at: string
  /** The beat of the lesson she was at, when known. */
  readonly beat?: string
  /**
   * WHICH LESSON ON HER CANVAS she was reading, by its `seq`.
   *
   * Added 2026-09-03 for `assurance.ts`, which asks whether she has been lost
   * at the SAME point of the SAME lesson repeatedly. Without this, three pleas
   * across three different lessons look identical to three pleas about one, and
   * the first is an ordinary hard week while the second is a lesson that is not
   * working. Optional, because evidence filed before this existed has none and
   * must still be readable.
   */
  readonly artifactSeq?: number
  /** D2: the move served in answer to this plea, so it is never served again. */
  readonly strategy?: string
}

/** A term's worth of turns on one topic; older ones fall off the front. */
export const MOST_EVIDENCE_KEPT = 200

export interface EvidenceStore {
  recall(owner: MemoryOwner, topic: string): readonly Evidence[]
  record(owner: MemoryOwner, topic: string, one: Evidence): void
  /** Names the move served in answer to the last plea filed under this topic. */
  remember(owner: MemoryOwner, topic: string, strategy: string): void
}

/** Evidence is filed beside the topic's other memory, under its own suffix. */
export function keyFor(owner: MemoryOwner, topic: string): string {
  return memoryKey({ ...owner, lessonId: fittedLessonId('', `${topic}#evidence`, topic) })
}

function isEvidence(value: unknown): value is Evidence {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v['said'] === 'string' &&
    (v['kind'] === 'plea' || v['kind'] === 'answer' || v['kind'] === 'question' || v['kind'] === 'empty') &&
    typeof v['at'] === 'string' &&
    (v['beat'] === undefined || typeof v['beat'] === 'string') &&
    (v['artifactSeq'] === undefined || typeof v['artifactSeq'] === 'number') &&
    (v['strategy'] === undefined || typeof v['strategy'] === 'string')
  )
}

function historyFrom(text: string | undefined): Evidence[] {
  if (text === undefined) return []
  try {
    const parsed = JSON.parse(text) as { evidence?: unknown }
    return Array.isArray(parsed.evidence) ? parsed.evidence.filter(isEvidence) : []
  } catch {
    return []
  }
}

export function evidenceIn(store: MemoryStore): EvidenceStore {
  return {
    recall(owner, topic) {
      return historyFrom(store.read(keyFor(owner, topic)))
    },
    remember(owner, topic, strategy) {
      const at = new Date().toISOString()
      store.update(keyFor(owner, topic), at, (current) => {
        const kept = historyFrom(current)
        for (let i = kept.length - 1; i >= 0; i -= 1) {
          if (kept[i]!.kind !== 'plea') continue
          kept[i] = { ...kept[i]!, strategy }
          break
        }
        return JSON.stringify({ evidence: kept })
      })
    },
    record(owner, topic, one) {
      store.update(keyFor(owner, topic), one.at, (current) => {
        const after = [...historyFrom(current), one]
        return JSON.stringify({ evidence: after.slice(Math.max(0, after.length - MOST_EVIDENCE_KEPT)) })
      })
    },
  }
}
