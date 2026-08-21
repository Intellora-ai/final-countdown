/* TEACHING TYPES — a lesson as a sequence, never as a pile.
 *
 * The product invariant this file encodes: the system never mounts or reveals
 * an entire lesson in one operation. A TeachingPlan hands out ONE step at a
 * time through nextStep(); nothing upstream of the session ever holds "the
 * whole lesson" as mounted UI. The future AI slots in behind the same
 * interface — one step or a small action group per call, never a giant
 * completed board.
 */
import type { Block, Connector } from '../types/learningBoard'

export interface Checkpoint {
  /** e.g. "Is this clear?" — the learner must answer; silence never advances. */
  prompt: string
}

export interface TeachingStep {
  id: string
  /** The step's single primary idea, shown as its heading. */
  title?: string
  /** 1 primary + at most 2 supporting. Enforced by the plan compiler. */
  blocks: Block[]
  /** Connectors whose BOTH ends are within released content by this step. */
  connectors?: Connector[]
  checkpoint: Checkpoint | null
}

export interface TeachingPlan {
  /** Board-level header. */
  title: string
  subtitle?: string | null
  eyebrow?: string
  /** Pull the next step. null = lesson complete. One at a time, no lookahead. */
  nextStep(): Promise<TeachingStep | null>
}

/* ── step limits (split when exceeded) ─────────────────────────────────── */
export const MAX_STEP_WORDS = 120
export const MAX_STEP_EQUATIONS = 1
export const MAX_STEP_VISUALS = 1          // primary
export const MAX_STEP_SUPPORTING = 2

/* ── reveal pacing profiles ────────────────────────────────────────────── */
export type PaceProfileName = 'calm' | 'standard' | 'fast'

export interface PaceProfile {
  charsPerSecond: number
}

export const PACE_PROFILES: Record<PaceProfileName, PaceProfile> = {
  calm: { charsPerSecond: 16 },
  standard: { charsPerSecond: 24 },
  fast: { charsPerSecond: 40 },
}

export const CPS_MIN = 12
export const CPS_MAX = 48

export const TIMING = {
  commaPauseMs: 150,
  sentencePauseMs: 350,
  paragraphPauseMs: 700,
  minVisualRevealMs: 500,
  diagramNodeMs: 450,
  diagramEdgeMs: 300,
  equationGroupMs: 250,
  chartAxesMs: 400,
  chartDataMs: 700,
  postStepSettleMs: 800,
  chunkMinWords: 2,
  chunkMaxWords: 7,
} as const
