/* THE REVEAL SCHEDULER — pacing as pure data.
 *
 * Given a step's blocks and a pace, this produces a TIMELINE: which piece
 * appears at which millisecond. Nothing here touches the DOM or a clock; the
 * session hook walks the timeline with one timer, StepView renders
 * "everything at or before the cursor", and the tests assert the arithmetic
 * directly. Pause is trivial by construction: stop advancing the cursor.
 * Finish-now is the same: jump the cursor to the end.
 *
 * REDUCED MOTION STAYS SEQUENTIAL. The spec's word is exact: decorative
 * motion goes, ORDER stays. reducedTimeline() keeps every event and its
 * order at zero delay — the lesson still arrives piece by piece, without
 * the theatre.
 */
import type { Block } from '../types/learningBoard'
import { CPS_MIN, CPS_MAX, TIMING, type PaceProfile } from './types'

export interface RevealEvent {
  /** ms offset from the step's reveal start. */
  at: number
  /** Which block this event belongs to (index into step.blocks). */
  blockIndex: number
  kind:
    | 'block-mount'      // the block's component mounts (lazy import may start here)
    | 'text-chunk'       // prose visible up to charEnd
    | 'diagram-node' | 'diagram-edge'
    | 'equation-group'
    | 'example-piece'    // prompt, given, one line of working, or the result
    | 'chart-axes' | 'chart-data'
    | 'visual'           // any other visual body appears whole
  /** For text-chunk: visible-character end index into the block's full text. */
  charEnd?: number
  /** For node/edge/equation-group/example-piece: which piece. */
  pieceIndex?: number
}

export interface RevealTimeline {
  events: RevealEvent[]
  /** Total reveal duration, ms — settle NOT included. */
  endMs: number
  /** endMs + post-step settle: when the checkpoint may appear. */
  checkpointAtMs: number
}

export function clampCps(cps: number): number {
  if (!Number.isFinite(cps)) return 24
  return Math.min(CPS_MAX, Math.max(CPS_MIN, cps))
}

export interface Chunk { end: number; chars: number; pauseMs: number }

/* Split text into chunks of 2-7 words, breaking early at punctuation so
 * pauses land where a voice would put them. `end` indexes the ORIGINAL text. */
export function chunkText(text: string): Chunk[] {
  const out: Chunk[] = []
  const words = [...text.matchAll(/\S+\s*/g)]
  let i = 0
  let prevEnd = 0
  while (i < words.length) {
    let take = 0
    let pause = 0
    while (take < TIMING.chunkMaxWords && i + take < words.length) {
      const trimmed = words[i + take][0].trimEnd()
      const last = trimmed[trimmed.length - 1]
      take++
      if (take >= TIMING.chunkMinWords) {
        if (last === ',' || last === ';' || last === ':') { pause = TIMING.commaPauseMs; break }
        if (last === '.' || last === '!' || last === '?') { pause = TIMING.sentencePauseMs; break }
      }
    }
    const lastWord = words[i + take - 1]
    const end = (lastWord.index ?? 0) + lastWord[0].length
    out.push({ end, chars: end - prevEnd, pauseMs: pause })
    prevEnd = end
    i += take
  }
  return out
}

/* ── per-block schedules ───────────────────────────────────────────────── */

function textEvents(blockIndex: number, text: string, cps: number, t0: number): { events: RevealEvent[]; end: number } {
  const events: RevealEvent[] = []
  let t = t0
  const paragraphs = text.split(/\n{2,}/)
  let offset = 0
  paragraphs.forEach((para, pi) => {
    const paraStart = text.indexOf(para, offset)
    if (pi > 0) t += TIMING.paragraphPauseMs
    for (const chunk of chunkText(para)) {
      t += (chunk.chars / cps) * 1000
      events.push({ at: t, blockIndex, kind: 'text-chunk', charEnd: paraStart + chunk.end })
      t += chunk.pauseMs
    }
    offset = paraStart + para.length
  })
  return { events, end: t }
}

/** The full prose a block reveals progressively, or null for visual bodies. */
export function proseOf(block: Block): string | null {
  switch (block.type) {
    case 'explanation': return block.content
    case 'callout': return block.content
    case 'text': return block.paragraphs.map((p) => p.map((s) => s.text).join('')).join('\n\n')
    default: return null
  }
}

/* One block's reveal, appended at t0. Every visual respects the 500ms
 * minimum; structured visuals reveal piece by piece at their spec'd rates. */
function blockEvents(blockIndex: number, block: Block, cps: number, t0: number): { events: RevealEvent[]; end: number } {
  const events: RevealEvent[] = [{ at: t0, blockIndex, kind: 'block-mount' }]
  const prose = proseOf(block)
  if (prose !== null) {
    const r = textEvents(blockIndex, prose, cps, t0)
    return { events: [...events, ...r.events], end: r.end }
  }
  let t = t0
  switch (block.type) {
    case 'diagram': {
      for (let n = 0; n < block.nodes.length; n++) {
        t += TIMING.diagramNodeMs
        events.push({ at: t, blockIndex, kind: 'diagram-node', pieceIndex: n })
      }
      for (let e = 0; e < block.edges.length; e++) {
        t += TIMING.diagramEdgeMs
        events.push({ at: t, blockIndex, kind: 'diagram-edge', pieceIndex: e })
      }
      break
    }
    case 'equation': {
      const groups = 1 + (block.variables?.length ?? 0)
      for (let g = 0; g < groups; g++) {
        t += TIMING.equationGroupMs
        events.push({ at: t, blockIndex, kind: 'equation-group', pieceIndex: g })
      }
      break
    }
    case 'example': {
      /* A worked example is a sequence of moves, and showing all of them at
       * once is showing the answer. The pieces arrive in the order a teacher
       * would write them: the question, what is given, each line of working,
       * then the result — so a learner reading along has a moment to try the
       * next line before it appears.
       *
       * Spaced at the equation-group interval because a line of working IS an
       * equation step; giving it a different rhythm would say it was a
       * different kind of thing. */
      const pieces = 1                                     // the prompt
        + (block.input ? 1 : 0)
        + block.working.length
        + (block.result ? 1 : 0)
      for (let p = 0; p < pieces; p++) {
        t += TIMING.equationGroupMs
        events.push({ at: t, blockIndex, kind: 'example-piece', pieceIndex: p })
      }
      break
    }
    case 'line_chart': case 'bar_chart': case 'pie_chart': {
      t += TIMING.chartAxesMs
      events.push({ at: t, blockIndex, kind: 'chart-axes' })
      t += TIMING.chartDataMs
      events.push({ at: t, blockIndex, kind: 'chart-data' })
      break
    }
    default: {
      t += TIMING.minVisualRevealMs
      events.push({ at: t, blockIndex, kind: 'visual' })
    }
  }
  /* Nothing visual may appear-and-settle faster than the minimum. */
  t = Math.max(t, t0 + TIMING.minVisualRevealMs)
  return { events, end: t }
}

/** The whole step's timeline: blocks reveal in order, then settle. */
export function stepTimeline(blocks: Block[], pace: PaceProfile): RevealTimeline {
  const cps = clampCps(pace.charsPerSecond)
  const events: RevealEvent[] = []
  let t = 0
  blocks.forEach((b, i) => {
    const r = blockEvents(i, b, cps, t)
    events.push(...r.events)
    t = r.end
  })
  return { events, endMs: t, checkpointAtMs: t + TIMING.postStepSettleMs }
}

/** Reduced motion: same events, same ORDER, zero delay. Sequence survives. */
export function reducedTimeline(tl: RevealTimeline): RevealTimeline {
  return {
    events: tl.events.map((e) => ({ ...e, at: 0 })),
    endMs: 0,
    checkpointAtMs: 0,
  }
}
