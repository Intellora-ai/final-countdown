/**
 * MISCONCEPTIONS ARE HYPOTHESES, NOT VERDICTS. C4, decided 2026-09-02.
 *
 *   Concept:                Free fall
 *   Observed misconception: heavier objects fall faster
 *   Evidence:               predicted the 10 kg ball lands first, in a vacuum
 *   Confidence:             high
 *   Status:                 active
 *   Interventions tried:    concrete demonstration → counterexample
 *   Outcome:                partially resolved
 *   Last observed:          <when>
 *   Next action:            reassess with a novel scenario
 *
 * Revisable: confidence rises with evidence and a resolved belief seen again
 * comes back active. Evidence-backed: nothing is here without the words that
 * put it here. Carried across topics: one record per LEARNER, because
 * "heavier falls faster" shows up in gravity, momentum and density alike.
 *
 * Nothing here is shown to the learner (decided: uncertainty is invisible).
 * It is read by the tutor's brief, so the next explanation can state the
 * wrong belief plainly, show where it fails, and give the rule instead.
 *
 * The same memory box as everything else: `memoryKey`, transactional `update`.
 */
import { memoryKey, type MemoryOwner } from './key.ts'
import type { MemoryStore } from './sqliteStore.ts'

export type Confidence = 'low' | 'medium' | 'high'
export type Status = 'active' | 'partially-resolved' | 'resolved' | 'dismissed'

export interface Sighting {
  readonly said: string
  readonly at: string
  readonly beat?: string
}

export interface Hypothesis {
  readonly id: string
  readonly concept: string
  readonly observed: string
  readonly evidence: readonly Sighting[]
  readonly confidence: Confidence
  readonly status: Status
  readonly interventions: readonly { readonly kind: string; readonly at: string }[]
  readonly outcome?: string
  readonly lastObserved: string
  readonly nextAction: string
}

export const MOST_HYPOTHESES_KEPT = 100
const REASSESS = 'reassess with a novel scenario'

export interface MisconceptionStore {
  /** Every hypothesis this learner has, across topics, most recently observed last. */
  recall(owner: MemoryOwner): readonly Hypothesis[]
  /** The active ones for one concept: what the tutor should state plainly and repair. */
  activeFor(owner: MemoryOwner, concept: string): readonly Hypothesis[]
  /** A belief seen in what she said: new at low confidence, or the same one strengthened. */
  observe(owner: MemoryOwner, seen: { concept: string; observed: string; evidence: Sighting }): Hypothesis
  intervened(owner: MemoryOwner, id: string, kind: string, at: string): void
  concluded(owner: MemoryOwner, id: string, verdict: { status: Status; outcome: string; at: string }): void
}

/** One record per learner, whatever the topic. */
export function keyFor(owner: MemoryOwner): string {
  return memoryKey({ ...owner, lessonId: 'misconceptions' })
}

function plain(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Stable across wording: the same belief in the same concept is one hypothesis. */
export function idFor(concept: string, observed: string): string {
  return `${plain(concept).replace(/ /g, '-')}|${plain(observed).replace(/ /g, '-')}`.slice(0, 160)
}

const NEXT: Record<Confidence, Confidence> = { low: 'medium', medium: 'high', high: 'high' }

function isHypothesis(value: unknown): value is Hypothesis {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v['id'] === 'string' &&
    typeof v['concept'] === 'string' &&
    typeof v['observed'] === 'string' &&
    Array.isArray(v['evidence']) &&
    (v['confidence'] === 'low' || v['confidence'] === 'medium' || v['confidence'] === 'high') &&
    typeof v['status'] === 'string' &&
    Array.isArray(v['interventions']) &&
    typeof v['lastObserved'] === 'string' &&
    typeof v['nextAction'] === 'string'
  )
}

function historyFrom(text: string | undefined): Hypothesis[] {
  if (text === undefined) return []
  try {
    const parsed = JSON.parse(text) as { hypotheses?: unknown }
    return Array.isArray(parsed.hypotheses) ? parsed.hypotheses.filter(isHypothesis) : []
  } catch {
    return []
  }
}

function stored(list: readonly Hypothesis[]): string {
  const byRecency = [...list].sort((a, b) => (a.lastObserved < b.lastObserved ? -1 : a.lastObserved > b.lastObserved ? 1 : 0))
  return JSON.stringify({ hypotheses: byRecency.slice(Math.max(0, byRecency.length - MOST_HYPOTHESES_KEPT)) })
}

export function misconceptionsIn(store: MemoryStore): MisconceptionStore {
  const read = (owner: MemoryOwner): Hypothesis[] => historyFrom(store.read(keyFor(owner)))
  function change(owner: MemoryOwner, at: string, edit: (list: Hypothesis[]) => Hypothesis[]): void {
    store.update(keyFor(owner), at, (current) => stored(edit(historyFrom(current))))
  }
  return {
    recall: read,
    activeFor(owner, concept) {
      return read(owner).filter((h) => h.concept === concept && h.status === 'active')
    },
    observe(owner, seen) {
      const id = idFor(seen.concept, seen.observed)
      let result: Hypothesis | undefined
      change(owner, seen.evidence.at, (list) => {
        const found = list.find((h) => h.id === id)
        if (found === undefined) {
          result = {
            id,
            concept: seen.concept,
            observed: seen.observed.trim(),
            evidence: [seen.evidence],
            confidence: 'low',
            status: 'active',
            interventions: [],
            lastObserved: seen.evidence.at,
            nextAction: REASSESS,
          }
          return [...list, result]
        }
        result = {
          ...found,
          evidence: [...found.evidence, seen.evidence],
          confidence: NEXT[found.confidence],
          status: 'active',
          lastObserved: seen.evidence.at,
          nextAction: REASSESS,
        }
        return list.map((h) => (h.id === id ? result! : h))
      })
      return result!
    },
    intervened(owner, id, kind, at) {
      change(owner, at, (list) =>
        list.map((h) => (h.id === id ? { ...h, interventions: [...h.interventions, { kind, at }], nextAction: 'check whether it landed' } : h)),
      )
    },
    concluded(owner, id, verdict) {
      change(owner, verdict.at, (list) =>
        list.map((h) => (h.id === id ? { ...h, status: verdict.status, outcome: verdict.outcome, nextAction: verdict.status === 'active' ? REASSESS : 'none until seen again' } : h)),
      )
    },
  }
}
