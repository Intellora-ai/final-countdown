import { describe, it, expect } from 'vitest'
import { chunkText, clampCps, proseOf, reducedTimeline, stepTimeline } from './reveal'
import { PACE_PROFILES, TIMING } from './types'
import type { Block, DiagramBlock, EquationBlock, ExplanationBlock, LineChartBlock } from '../types/learningBoard'

const EXPLAIN: ExplanationBlock = {
  id: 'e1', type: 'explanation',
  content: 'Heating a solid adds energy. The particles vibrate harder, and at the melting point the arrangement breaks.',
}

describe('clampCps', () => {
  it('clamps to the 12-48 range and refuses junk', () => {
    expect(clampCps(5)).toBe(12)
    expect(clampCps(100)).toBe(48)
    expect(clampCps(Number.NaN)).toBe(24)
  })
})

describe('chunkText', () => {
  it('chunks of 2-7 words, covering the whole text in order', () => {
    const text = 'One two three four five six seven eight nine ten eleven twelve.'
    const chunks = chunkText(text)
    expect(chunks[chunks.length - 1].end).toBe(text.length)
    let prev = 0
    for (const c of chunks) {
      expect(c.end).toBeGreaterThan(prev)
      const words = text.slice(prev, c.end).trim().split(/\s+/)
      expect(words.length).toBeGreaterThanOrEqual(1)
      expect(words.length).toBeLessThanOrEqual(TIMING.chunkMaxWords)
      prev = c.end
    }
  })

  it('breaks at sentence punctuation with the sentence pause', () => {
    const chunks = chunkText('Short one. Then more words follow here')
    expect(chunks[0].pauseMs).toBe(TIMING.sentencePauseMs)
  })

  it('breaks at commas with the comma pause', () => {
    const chunks = chunkText('First clause, then the rest of it')
    expect(chunks[0].pauseMs).toBe(TIMING.commaPauseMs)
  })
})

describe('stepTimeline — text', () => {
  it('paces prose at the profile rate: more text, proportionally later end', () => {
    const short = stepTimeline([EXPLAIN], PACE_PROFILES.standard)
    const fast = stepTimeline([EXPLAIN], PACE_PROFILES.fast)
    expect(short.endMs).toBeGreaterThan(0)
    /* 40cps must finish sooner than 24cps on identical text. */
    expect(fast.endMs).toBeLessThan(short.endMs)
    /* Sanity: 105 chars at 24cps is ~4.4s of raw typing plus pauses; the
     * timeline must be in that neighbourhood, not off by an order. */
    expect(short.endMs).toBeGreaterThan(3000)
    expect(short.endMs).toBeLessThan(12000)
  })

  it('emits monotonically ordered events ending at the full text length', () => {
    const tl = stepTimeline([EXPLAIN], PACE_PROFILES.standard)
    const chunks = tl.events.filter((e) => e.kind === 'text-chunk')
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].at).toBeGreaterThanOrEqual(chunks[i - 1].at)
      expect(chunks[i].charEnd!).toBeGreaterThan(chunks[i - 1].charEnd!)
    }
    expect(chunks[chunks.length - 1].charEnd).toBe(EXPLAIN.content.length)
  })

  it('adds the paragraph pause between paragraphs', () => {
    const two: ExplanationBlock = { ...EXPLAIN, content: 'Para one is here.\n\nPara two follows on.' }
    const one: ExplanationBlock = { ...EXPLAIN, content: 'Para one is here. Para two follows on.' }
    const a = stepTimeline([two], PACE_PROFILES.standard)
    const b = stepTimeline([one], PACE_PROFILES.standard)
    expect(a.endMs).toBeGreaterThan(b.endMs + TIMING.paragraphPauseMs - 100)
  })
})

describe('stepTimeline — structured visuals', () => {
  const DIAGRAM: DiagramBlock = {
    id: 'd1', type: 'diagram',
    nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }],
    edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }],
  }

  it('diagram: nodes first at 450ms each, then edges at 300ms each', () => {
    const tl = stepTimeline([DIAGRAM], PACE_PROFILES.standard)
    const nodes = tl.events.filter((e) => e.kind === 'diagram-node')
    const edges = tl.events.filter((e) => e.kind === 'diagram-edge')
    expect(nodes).toHaveLength(3)
    expect(edges).toHaveLength(2)
    expect(nodes[0].at).toBe(TIMING.diagramNodeMs)
    expect(nodes[2].at).toBe(TIMING.diagramNodeMs * 3)
    expect(edges[0].at).toBe(TIMING.diagramNodeMs * 3 + TIMING.diagramEdgeMs)
    /* every edge after every node */
    expect(Math.min(...edges.map((e) => e.at))).toBeGreaterThan(Math.max(...nodes.map((n) => n.at)))
  })

  it('equation: one group per piece at 250ms', () => {
    const eq: EquationBlock = { id: 'q1', type: 'equation', latex: 'Q = m·L', variables: [{ symbol: 'Q', meaning: 'heat' }, { symbol: 'm', meaning: 'mass' }] }
    const tl = stepTimeline([eq], PACE_PROFILES.standard)
    const groups = tl.events.filter((e) => e.kind === 'equation-group')
    expect(groups).toHaveLength(3)
    expect(groups[0].at).toBe(TIMING.equationGroupMs)
  })

  it('chart: axes at 400ms then data at +700ms', () => {
    const chart: LineChartBlock = { id: 'c1', type: 'line_chart', points: [{ x: 0, y: 1 }, { x: 1, y: 2 }] }
    const tl = stepTimeline([chart], PACE_PROFILES.standard)
    const axes = tl.events.find((e) => e.kind === 'chart-axes')!
    const data = tl.events.find((e) => e.kind === 'chart-data')!
    expect(axes.at).toBe(TIMING.chartAxesMs)
    expect(data.at).toBe(TIMING.chartAxesMs + TIMING.chartDataMs)
  })

  it('no visual settles faster than the 500ms minimum', () => {
    const eq: EquationBlock = { id: 'q1', type: 'equation', latex: 'x' }
    const tl = stepTimeline([eq], PACE_PROFILES.standard)
    expect(tl.endMs).toBeGreaterThanOrEqual(TIMING.minVisualRevealMs)
  })
})

describe('stepTimeline — composition', () => {
  it('blocks reveal strictly in order and the checkpoint waits for the settle', () => {
    const eq: EquationBlock = { id: 'q1', type: 'equation', latex: 'Q = m·L' }
    const tl = stepTimeline([EXPLAIN, eq], PACE_PROFILES.standard)
    const explainLast = Math.max(...tl.events.filter((e) => e.blockIndex === 0).map((e) => e.at))
    const eqFirst = Math.min(...tl.events.filter((e) => e.blockIndex === 1 && e.kind !== 'block-mount').map((e) => e.at))
    expect(eqFirst).toBeGreaterThanOrEqual(explainLast)
    expect(tl.checkpointAtMs).toBe(tl.endMs + TIMING.postStepSettleMs)
  })

  it('every block gets a mount event at its start', () => {
    const tl = stepTimeline([EXPLAIN], PACE_PROFILES.standard)
    expect(tl.events[0]).toMatchObject({ kind: 'block-mount', blockIndex: 0, at: 0 })
  })
})

describe('reducedTimeline', () => {
  it('keeps every event and its order, at zero delay — sequential, not simultaneous-by-accident', () => {
    const tl = stepTimeline([EXPLAIN], PACE_PROFILES.standard)
    const red = reducedTimeline(tl)
    expect(red.events).toHaveLength(tl.events.length)
    expect(red.events.map((e) => e.kind)).toEqual(tl.events.map((e) => e.kind))
    expect(red.events.every((e) => e.at === 0)).toBe(true)
    expect(red.checkpointAtMs).toBe(0)
  })
})

describe('proseOf', () => {
  it('extracts prose from prose blocks and null from visuals', () => {
    expect(proseOf(EXPLAIN)).toBe(EXPLAIN.content)
    expect(proseOf({ id: 'q', type: 'equation', latex: 'x' } as Block)).toBeNull()
  })
})

describe('a worked example arrives one move at a time', () => {
  const EXAMPLE: Block = {
    id: 'ex', type: 'example',
    prompt: 'How much heat melts 0.5 kg of ice?',
    input: 'm = 0.5 kg, L = 334,000 J/kg',
    working: ['Q = m · L', 'Q = 0.5 × 334,000', 'Q = 167,000 J'],
    result: 'Q = 167 kJ',
  } as Block

  it('emits one piece per move, in writing order', () => {
    const tl = stepTimeline([EXAMPLE], PACE_PROFILES.standard)
    const pieces = tl.events.filter((e) => e.kind === 'example-piece')
    /* prompt + given + three lines of working + result */
    expect(pieces).toHaveLength(6)
    expect(pieces.map((e) => e.pieceIndex)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('counts only the moves the example actually has', () => {
    const bare = { id: 'ex2', type: 'example', prompt: 'Why?', working: ['because'] } as Block
    const pieces = stepTimeline([bare], PACE_PROFILES.standard).events
      .filter((e) => e.kind === 'example-piece')
    /* No given, no result: prompt plus one line. Emitting placeholders for
     * absent fields would reveal blanks the learner has to wait through. */
    expect(pieces).toHaveLength(2)
  })

  it('never shows the answer before the working', () => {
    /* The whole reason this is progressive. Every piece is strictly ordered,
     * so the result cannot arrive before the lines that justify it. */
    const tl = stepTimeline([EXAMPLE], PACE_PROFILES.standard)
    const pieces = tl.events.filter((e) => e.kind === 'example-piece')
    for (let i = 1; i < pieces.length; i++) {
      expect(pieces[i].at).toBeGreaterThan(pieces[i - 1].at)
    }
  })

  it('mounts before it reveals, like every other block', () => {
    const tl = stepTimeline([EXAMPLE], PACE_PROFILES.standard)
    const first = tl.events[0]
    expect(first.kind).toBe('block-mount')
    expect(tl.events.filter((e) => e.kind === 'example-piece')[0].at)
      .toBeGreaterThan(first.at)
  })

  it('keeps its order under reduced motion', () => {
    const red = reducedTimeline(stepTimeline([EXAMPLE], PACE_PROFILES.standard))
    const pieces = red.events.filter((e) => e.kind === 'example-piece')
    expect(pieces.map((e) => e.pieceIndex)).toEqual([0, 1, 2, 3, 4, 5])
    expect(pieces.every((e) => e.at === 0)).toBe(true)
  })
})
