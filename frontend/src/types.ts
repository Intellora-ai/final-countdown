export type ConceptState = 'notStarted' | 'inProgress' | 'completed' | 'mastered'
export type MasterySource = 'system' | 'declared' | 'session' | null

/* ── Semantic edges ─────────────────────────────────────────────────────────
 * The imported curriculum encoded one relationship — "B depends on A" — as an
 * untyped string. That is enough to lay out a chapter and enough to decide what
 * a learner may start next, and it is not enough to teach with: an arrow that
 * means "you must learn this first" and an arrow that means "this CAUSES that"
 * are different claims, and a board that draws them identically is lying about
 * one of them.
 *
 * So the type is added and the existing meaning is preserved exactly. `deps`
 * still lists every target, in the same order, so `layout()`, `prereqsMet()`
 * and the planner behave byte-for-byte as before; `edges` carries the type
 * alongside. Every row imported from the curriculum migrates to `prerequisite`,
 * because that is what it always meant.
 */
export type SemanticEdgeType =
  | 'prerequisite'      // must be learned before
  | 'causal'            // A brings about B
  | 'definitional'      // A is part of what B means
  | 'part_of'           // A is a component of B
  | 'example_of'        // A is an instance of B
  | 'contrasts_with'    // A is understood by how it differs from B
  | 'temporal'          // A happens before B
  | 'quantitative'      // A and B are related by a measurable law
  | 'supports'          // A is evidence for B
  | 'contradicts'       // A is evidence against B
  | 'misconception_of'  // A is a common wrong reading of B

export interface SemanticEdge { type: SemanticEdgeType; to: string }

export interface Concept {
  id: string
  name: string
  minutes: number
  /** Every edge target, untyped and in source order. The layout engine, the
   *  prerequisite check and the planner all read this and must keep seeing
   *  exactly what they saw before typing was introduced. */
  deps: string[]
  /** The same relationships, with their kind. `edges.map(e => e.to)` equals
   *  `deps`; `frontend/src/data/curriculum.semantics.test.ts` proves it. */
  edges: SemanticEdge[]
}
export interface Chapter { id: string; name: string; concepts: Concept[] }
export interface Subject { id: string; name: string; chapters: Chapter[] }

export interface Student {
  id: string; name: string; avatarHue: number
  cls: string | null; stream: string | null
  subjects: string[]; minutes: number | null
  deadlines: Record<string, string>
  createdAt: number; lastActiveAt: number
}

export interface ProgressRecord {
  state: ConceptState; source: MasterySource
  attempts: number; hints: number; revisits: number; secondsSpent: number
  firstSeenAt: number | null; lastTouchedAt: number | null
  completedAt: number | null; declaredAt: number | null
  prevState: ConceptState | null
}

export interface PlanItem {
  subject: Subject; chapter: Chapter; concept: Concept
  minutes: number; daysLeft: number; resume?: boolean; review?: boolean; fill?: boolean
}
export interface TodayPlan { items: PlanItem[]; allocated: number; capacity: number; reserve: number; usable: number }

export interface DB {
  students: Record<string, Student>
  progress: Record<string, Record<string, Record<string, ProgressRecord>>>
  activity: Record<string, ActivityEvent[]>
  currentId: string | null
}
export interface ActivityEvent { at?: number; type: string; chapterId?: string; conceptId?: string; from?: string; to?: string }

/* Adapter contract — swap LocalAdapter for Firebase/Supabase, keep the UI. */
export interface Adapter {
  load(): Promise<DB | null>
  subscribe(cb: (db: DB) => void): () => void
  commit(db: DB): Promise<void>
  commitPath?(path: string, value: unknown): Promise<void>
  close(): void
}

export interface PlanDraft {
  cls: string; stream: string | null; subjects: string[]
  minutes: number; deadlines: Record<string, string>
}
