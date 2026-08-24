export type ConceptState = 'notStarted' | 'inProgress' | 'completed' | 'mastered'
export type MasterySource = 'system' | 'declared' | 'session' | null

/* Where a generated concept was read from. Optional because the original
 * hand-written curriculum predates provenance; every generated concept has it. */
export interface ConceptSource { pdf: string; page: number | null }

export interface Concept { id: string; name: string; minutes: number; deps: string[]; source?: ConceptSource }
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

/** One unit of an entrance-exam syllabus, traced to the page it was read from. */
export interface ExamUnit {
  number: number
  title: string
  topics: string[]
  source: ConceptSource
}

export interface ExamSubject {
  id: string
  units: ExamUnit[]
}

/** An entrance-exam syllabus, generated from the official PDF.
 *  `source.discoveredFrom` records the page the download link was READ off,
 *  because a guessed URL that 404s looks exactly like a withdrawn document. */
export interface ExamSyllabus {
  id: string
  source: { url: string; discoveredFrom: string; linkText: string; sha256: string }
  subjects: ExamSubject[]
}
