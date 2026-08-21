/* THE PLAN COMPILER — a board becomes a sequence, on demand.
 *
 * planFromBoard() turns a ValidatedBoard into a TeachingPlan whose steps are
 * computed ONE AT A TIME inside nextStep(). There is no pre-expanded array of
 * steps handed to the UI — the cursor advances through the block list and
 * cuts a step each call. That is the contract the future AI slots behind:
 * one step per request, never a finished lesson.
 *
 * THE LIMITS ARE CUTTING RULES, NOT VALIDATION. A block heavier than a step
 * allows does not fail — it becomes more steps. Long explanations split at
 * paragraph boundaries; a second equation starts a new step; a second primary
 * visual starts a new step. Every step ends with a checkpoint (the last one
 * included: a lesson should end by asking, not by stopping).
 */
import type { Block, Connector, ValidatedBoard } from '../types/learningBoard'
import {
  MAX_STEP_EQUATIONS, MAX_STEP_SUPPORTING, MAX_STEP_VISUALS, MAX_STEP_WORDS,
  type Checkpoint, type TeachingPlan, type TeachingStep,
} from './types'

export function wordCount(text: string): number {
  const m = text.trim().match(/\S+/g)
  return m ? m.length : 0
}

function isEquation(b: Block): boolean { return b.type === 'equation' }

/* Primary visuals demand attention; supporting ones frame it. */
function isPrimaryVisual(b: Block): boolean {
  return b.type === 'diagram' || b.type === 'simulation' || b.type === 'image' ||
    b.type === 'pie_chart' || b.type === 'bar_chart' || b.type === 'line_chart' ||
    b.type === 'table' || b.type === 'quiz' || b.type === 'comparison' || b.type === 'timeline'
}

function isSupporting(b: Block): boolean {
  return b.type === 'callout' || b.type === 'example'
}

function proseWords(b: Block): number {
  if (b.type === 'explanation' || b.type === 'callout') return wordCount(b.content)
  if (b.type === 'text') return wordCount(b.paragraphs.map((p) => p.map((s) => s.text).join('')).join(' '))
  return 0
}

/* Split an explanation whose content exceeds the word budget into several
 * explanation blocks at paragraph boundaries (a paragraph is never split —
 * mid-paragraph cuts read as glitches, not pacing). */
export function splitLongExplanation(b: Block): Block[] {
  if (b.type !== 'explanation' || proseWords(b) <= MAX_STEP_WORDS) return [b]
  const paragraphs = b.content.split(/\n{2,}/)
  const out: Block[] = []
  let bucket: string[] = []
  let words = 0
  let part = 1
  const flush = () => {
    if (!bucket.length) return
    out.push({ ...b, id: `${b.id}-part-${part}`, ...(part > 1 ? { title: undefined } : {}), content: bucket.join('\n\n') })
    part++; bucket = []; words = 0
  }
  for (const p of paragraphs) {
    const w = wordCount(p)
    if (words > 0 && words + w > MAX_STEP_WORDS) flush()
    bucket.push(p); words += w
  }
  flush()
  return out
}

interface StepDraft {
  blocks: Block[]
  words: number
  equations: number
  visuals: number
  supporting: number
}

function emptyDraft(): StepDraft { return { blocks: [], words: 0, equations: 0, visuals: 0, supporting: 0 } }

function fits(d: StepDraft, b: Block): boolean {
  if (!d.blocks.length) return true
  const w = proseWords(b)
  if (d.words + w > MAX_STEP_WORDS && w > 0) return false
  if (isEquation(b) && d.equations >= MAX_STEP_EQUATIONS) return false
  if (isPrimaryVisual(b) && d.visuals >= MAX_STEP_VISUALS) return false
  if (isSupporting(b) && d.supporting >= MAX_STEP_SUPPORTING) return false
  return true
}

function add(d: StepDraft, b: Block): void {
  d.blocks.push(b)
  d.words += proseWords(b)
  if (isEquation(b)) d.equations++
  else if (isPrimaryVisual(b)) d.visuals++
  else if (isSupporting(b)) d.supporting++
}

const DEFAULT_CHECKPOINTS = ['Is this clear?', 'Shall we move forward?']

/** Connectors whose ends are BOTH released once this step lands. */
function connectorsReleasedBy(connectors: Connector[], releasedIds: Set<string>): Connector[] {
  return connectors.filter((c) => releasedIds.has(c.from) && releasedIds.has(c.to))
}

export function planFromBoard(board: ValidatedBoard): TeachingPlan {
  /* Renderable-block queue. Unknown placeholders still teach ("something was
   * here"), so they ride along as supporting content. */
  const queue: Block[] = board.blocks
    .filter((b): b is Block => b.type !== 'unknown')
    .flatMap(splitLongExplanation)
  const connectors = board.connectors ?? []

  let cursor = 0
  let stepNo = 0
  const releasedIds = new Set<string>()
  const emittedConnectors = new Set<string>()

  return {
    title: board.title,
    subtitle: board.subtitle ?? null,
    nextStep(): Promise<TeachingStep | null> {
      /* Computed on demand: the step does not exist until it is asked for. */
      if (cursor >= queue.length) return Promise.resolve(null)
      const draft = emptyDraft()
      while (cursor < queue.length && fits(draft, queue[cursor])) {
        add(draft, queue[cursor])
        cursor++
      }
      stepNo++
      draft.blocks.forEach((b) => releasedIds.add(b.id))
      const ready = connectorsReleasedBy(connectors, releasedIds)
        .filter((c) => !emittedConnectors.has(c.id))
      ready.forEach((c) => emittedConnectors.add(c.id))
      const first = draft.blocks[0]
      const checkpoint: Checkpoint = {
        prompt: DEFAULT_CHECKPOINTS[(stepNo - 1) % DEFAULT_CHECKPOINTS.length],
      }
      return Promise.resolve({
        id: `step-${stepNo}`,
        title: ('title' in first && first.title) || undefined,
        blocks: draft.blocks,
        connectors: ready,
        checkpoint,
      })
    },
  }
}

/** A plan from authored steps (the scripted lesson). Same one-at-a-time
 *  contract; authored checkpoints win over defaults. */
export function planFromSteps(
  header: { title: string; subtitle?: string | null },
  steps: TeachingStep[],
): TeachingPlan {
  let cursor = 0
  return {
    title: header.title,
    subtitle: header.subtitle ?? null,
    nextStep(): Promise<TeachingStep | null> {
      if (cursor >= steps.length) return Promise.resolve(null)
      return Promise.resolve(steps[cursor++])
    },
  }
}
