import { describe, expect, it } from 'vitest'

import { REPRESENTATIONS, REPRESENTATION_NAMES, SHAPES, namesForShape, shapeOf } from './representations'
import {
  checkDistribution,
  checkFlowWeighted,
  checkGraph,
  checkHierarchy,
  checkIntervals,
  checkLogic,
  checkMatrix,
  checkParts,
  checkProcess,
  checkSeries,
  findBipartiteConflict,
  findCycle,
} from './shapeInvariants'

/** Only the rules that refuse a block. Warnings are advice, not correctness. */
const rejects = <T extends { level: string }>(issues: T[]): T[] => issues.filter((i) => i.level === 'reject')

/* -------------------------------------------------------------------------- */
/* The registry itself                                                        */
/* -------------------------------------------------------------------------- */

describe('the registry', () => {
  it('maps every named type to a real shape', () => {
    for (const name of REPRESENTATION_NAMES) {
      expect(SHAPES).toContain(shapeOf(name))
    }
  })

  it('says when each type is the wrong choice', () => {
    /* The commonest visualisation defect is not a broken axis — it is a correct
       chart answering a question nobody asked. An empty or boilerplate
       `avoidWhen` would make the registry a lookup table instead of guidance. */
    for (const name of REPRESENTATION_NAMES) {
      const avoid = REPRESENTATIONS[name].avoidWhen
      expect(avoid.length, `${name} has no avoidWhen`).toBeGreaterThan(20)
    }
  })

  it('covers a wide surface without collapsing into one shape', () => {
    expect(REPRESENTATION_NAMES.length).toBeGreaterThan(120)
    // Every shape earns its place by carrying at least one named type.
    for (const shape of SHAPES) {
      if (shape === 'tabular' || shape === 'geometry') continue
      expect(namesForShape(shape).length, `${shape} has no types`).toBeGreaterThan(0)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* series                                                                     */
/* -------------------------------------------------------------------------- */

describe('series', () => {
  const ok = { series: [{ name: 'a', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }] }

  it('accepts a well-formed series', () => {
    expect(rejects(checkSeries(ok, 'b'))).toHaveLength(0)
  })

  it('refuses unordered x on a continuous axis', () => {
    /* Connecting (3,·) to (1,·) to (2,·) draws a zig-zag the reader takes for
       real structure. Sorting silently would hide the author's error. */
    const out = checkSeries(
      { series: [{ name: 'a', points: [{ x: 3, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 3 }] }], continuousX: true },
      'b',
    )
    expect(rejects(out)).toHaveLength(1)
    expect(rejects(out)[0]?.message).toMatch(/not in order/)
  })

  it('allows unordered x when the axis is categorical', () => {
    const out = checkSeries(
      { series: [{ name: 'a', points: [{ x: 'c', y: 1 }, { x: 'a', y: 2 }] }] },
      'b',
    )
    expect(rejects(out)).toHaveLength(0)
  })

  it('refuses a negative value in a stack', () => {
    const out = checkSeries({ series: [{ name: 'a', points: [{ x: 1, y: -1 }] }], stacked: true }, 'b')
    expect(rejects(out).length).toBeGreaterThan(0)
  })

  it('refuses stacked series that do not share every x', () => {
    // A missing x silently shifts every segment above it.
    const out = checkSeries(
      {
        stacked: true,
        series: [
          { name: 'a', points: [{ x: 1, y: 1 }, { x: 2, y: 1 }] },
          { name: 'b', points: [{ x: 1, y: 1 }] },
        ],
      },
      'b',
    )
    expect(rejects(out).some((i) => /share every x/.test(i.message))).toBe(true)
  })

  it('refuses duplicate series names and non-finite values', () => {
    expect(rejects(checkSeries({ series: [{ name: 'a', points: [{ x: 1, y: 1 }] }, { name: 'a', points: [{ x: 1, y: 1 }] }] }, 'b')).length).toBeGreaterThan(0)
    expect(rejects(checkSeries({ series: [{ name: 'a', points: [{ x: 1, y: NaN }] }] }, 'b')).length).toBeGreaterThan(0)
  })
})

/* -------------------------------------------------------------------------- */
/* parts                                                                      */
/* -------------------------------------------------------------------------- */

describe('parts of a whole', () => {
  it('refuses a negative part', () => {
    const out = checkParts({ parts: [{ label: 'a', value: -1 }], variant: 'pie' }, 'b')
    expect(rejects(out).length).toBeGreaterThan(0)
  })

  it('allows a negative in a waterfall, where a decrease is the point', () => {
    const out = checkParts({ parts: [{ label: 'a', value: -1 }], variant: 'waterfall' }, 'b')
    expect(rejects(out)).toHaveLength(0)
  })

  it('refuses parts that do not sum to the stated whole', () => {
    /* Slices summing to 87 of a stated 100 mean 13 is unaccounted for, and the
       chart is quietly asserting something false. */
    const out = checkParts(
      { parts: [{ label: 'a', value: 60 }, { label: 'b', value: 27 }], whole: 100, variant: 'pie' },
      'b',
    )
    expect(rejects(out)[0]?.message).toMatch(/sum to 87/)
  })

  it('accepts a sum within rounding tolerance', () => {
    const out = checkParts(
      { parts: [{ label: 'a', value: 33.33 }, { label: 'b', value: 33.33 }, { label: 'c', value: 33.34 }], whole: 100, variant: 'pie' },
      'b',
    )
    expect(rejects(out)).toHaveLength(0)
  })

  it('refuses a funnel stage that grows', () => {
    const out = checkParts(
      { parts: [{ label: 'a', value: 10 }, { label: 'b', value: 20 }], variant: 'funnel' },
      'b',
    )
    expect(rejects(out)[0]?.message).toMatch(/cannot be larger/)
  })

  it('warns, not refuses, on too many pie slices', () => {
    const parts = Array.from({ length: 12 }, (_, i) => ({ label: `p${i}`, value: 1 }))
    const out = checkParts({ parts, variant: 'pie' }, 'b')
    expect(rejects(out)).toHaveLength(0)
    expect(out.some((i) => i.level === 'warn')).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* matrix                                                                     */
/* -------------------------------------------------------------------------- */

describe('matrix', () => {
  it('refuses a ragged grid', () => {
    const out = checkMatrix({ rows: ['a', 'b'], columns: ['x', 'y'], values: [[1, 2], [3]], variant: 'heatMap' }, 'b')
    expect(rejects(out).length).toBeGreaterThan(0)
  })

  it('refuses a correlation outside [-1, 1]', () => {
    const out = checkMatrix({ rows: ['a'], columns: ['a'], values: [[1.4]], variant: 'correlationMatrix' }, 'b')
    expect(rejects(out)[0]?.message).toMatch(/outside \[-1, 1\]/)
  })

  it('refuses a confusion matrix whose axes disagree', () => {
    /* Different class orders silently transpose precision and recall. */
    const out = checkMatrix({ rows: ['cat', 'dog'], columns: ['dog', 'cat'], values: [[1, 0], [0, 1]], variant: 'confusionMatrix' }, 'b')
    expect(rejects(out)[0]?.message).toMatch(/identical class lists/)
  })

  it('refuses non-integer confusion counts', () => {
    const out = checkMatrix({ rows: ['a'], columns: ['a'], values: [[1.5]], variant: 'confusionMatrix' }, 'b')
    expect(rejects(out).some((i) => /counts/.test(i.message))).toBe(true)
  })

  it('refuses a matrix declared symmetric that is not', () => {
    const out = checkMatrix({ rows: ['a', 'b'], columns: ['a', 'b'], values: [[1, 2], [3, 1]], symmetric: true, variant: 'heatMap' }, 'b')
    expect(rejects(out).some((i) => /symmetric/.test(i.message))).toBe(true)
  })

  it('treats null as absent, not as zero', () => {
    const out = checkMatrix({ rows: ['a'], columns: ['a'], values: [[null]], variant: 'missingDataMap' }, 'b')
    expect(rejects(out)).toHaveLength(0)
  })
})

/* -------------------------------------------------------------------------- */
/* graph                                                                      */
/* -------------------------------------------------------------------------- */

describe('graph', () => {
  const nodes = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }]

  it('refuses an edge to a node that does not exist', () => {
    const out = checkGraph({ nodes, edges: [{ from: 'a', to: 'ghost' }], variant: 'nodeLink' }, 'b')
    expect(rejects(out)[0]?.message).toMatch(/no node "ghost"/)
  })

  it('refuses a cycle in a declared acyclic graph', () => {
    /* Bayesian networks, dependency graphs and build orders depend on
       acyclicity for their MEANING. A cycle says "A depends on B depends on A",
       which no layout can honestly draw. */
    const out = checkGraph(
      { nodes, edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' }], acyclic: true, variant: 'dag' },
      'b',
    )
    expect(rejects(out)[0]?.message).toMatch(/contains a cycle/)
  })

  it('accepts the same cycle when acyclicity was never claimed', () => {
    const out = checkGraph(
      { nodes, edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' }], variant: 'causalLoop' },
      'b',
    )
    expect(rejects(out)).toHaveLength(0)
  })

  it('refuses a bipartite graph that cannot be two-coloured', () => {
    const out = checkGraph(
      { nodes, edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' }], bipartite: true, variant: 'bipartiteGraph' },
      'b',
    )
    expect(rejects(out).some((i) => /bipartite/.test(i.message))).toBe(true)
  })

  it('warns about a node with no edges', () => {
    const out = checkGraph({ nodes, edges: [{ from: 'a', to: 'b' }], variant: 'nodeLink' }, 'b')
    expect(out.some((i) => i.level === 'warn' && /float/.test(i.message))).toBe(true)
  })
})

describe('findCycle', () => {
  it('names the cycle it found', () => {
    const cycle = findCycle(['a', 'b', 'c'], [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' }])
    expect(cycle).not.toBeNull()
    expect(cycle?.length).toBeGreaterThan(1)
  })

  it('returns null for a DAG, including a diamond', () => {
    // A diamond has two paths to the same node and is NOT a cycle — a naive
    // visited-set implementation reports one here.
    expect(findCycle(['a', 'b', 'c', 'd'], [
      { from: 'a', to: 'b' }, { from: 'a', to: 'c' },
      { from: 'b', to: 'd' }, { from: 'c', to: 'd' },
    ])).toBeNull()
  })

  it('catches a self-loop', () => {
    expect(findCycle(['a'], [{ from: 'a', to: 'a' }])).not.toBeNull()
  })
})

describe('findBipartiteConflict', () => {
  it('accepts an even cycle and rejects an odd one', () => {
    expect(findBipartiteConflict(['a', 'b', 'c', 'd'], [
      { from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd' }, { from: 'd', to: 'a' },
    ])).toBeNull()
    expect(findBipartiteConflict(['a', 'b', 'c'], [
      { from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' },
    ])).not.toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* hierarchy                                                                  */
/* -------------------------------------------------------------------------- */

describe('hierarchy', () => {
  it('refuses zero roots and more than one root', () => {
    expect(rejects(checkHierarchy({ nodes: [{ id: 'a', label: 'A', parent: 'b' }, { id: 'b', label: 'B', parent: 'a' }], variant: 'taxonomy' }, 'x')).length).toBeGreaterThan(0)
    expect(rejects(checkHierarchy({ nodes: [{ id: 'a', label: 'A', parent: null }, { id: 'b', label: 'B', parent: null }], variant: 'taxonomy' }, 'x')).some((i) => /2 roots/.test(i.message))).toBe(true)
  })

  it('refuses a parent that does not exist', () => {
    const out = checkHierarchy({ nodes: [{ id: 'a', label: 'A', parent: null }, { id: 'b', label: 'B', parent: 'ghost' }], variant: 'taxonomy' }, 'x')
    expect(rejects(out).some((i) => /no node "ghost"/.test(i.message))).toBe(true)
  })

  it('refuses a treemap whose children do not sum to their parent', () => {
    /* A treemap's AREA is the claim. A parent rectangle that disagrees with its
       children contradicts its own arithmetic. */
    const out = checkHierarchy(
      {
        sizedByValue: true,
        variant: 'treemap',
        nodes: [
          { id: 'root', label: 'R', parent: null, value: 100 },
          { id: 'a', label: 'A', parent: 'root', value: 40 },
          { id: 'b', label: 'B', parent: 'root', value: 30 },
        ],
      },
      'x',
    )
    expect(rejects(out).some((i) => /children sum to 70/.test(i.message))).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* flowWeighted                                                               */
/* -------------------------------------------------------------------------- */

describe('weighted flow', () => {
  const nodes = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }]

  it('refuses a conserved sankey whose flows do not balance', () => {
    /* Conservation is the sankey's ONE claim: the ribbons say this much went in
       and this much came out. */
    const out = checkFlowWeighted(
      { nodes, links: [{ from: 'a', to: 'b', value: 10 }, { from: 'b', to: 'c', value: 7 }], conserved: true, variant: 'sankey' },
      'x',
    )
    expect(rejects(out)[0]?.message).toMatch(/takes 10 and passes on 7/)
  })

  it('accepts the same flows when the diagram is declared lossy', () => {
    const out = checkFlowWeighted(
      { nodes, links: [{ from: 'a', to: 'b', value: 10 }, { from: 'b', to: 'c', value: 7 }], variant: 'sankey' },
      'x',
    )
    expect(rejects(out)).toHaveLength(0)
  })

  it('refuses a cycle in a sankey and a negative flow', () => {
    expect(rejects(checkFlowWeighted({ nodes, links: [{ from: 'a', to: 'b', value: 1 }, { from: 'b', to: 'a', value: 1 }], variant: 'sankey' }, 'x')).some((i) => /cycles/.test(i.message))).toBe(true)
    expect(rejects(checkFlowWeighted({ nodes, links: [{ from: 'a', to: 'b', value: -1 }], variant: 'sankey' }, 'x')).length).toBeGreaterThan(0)
  })
})

/* -------------------------------------------------------------------------- */
/* intervals and process                                                      */
/* -------------------------------------------------------------------------- */

describe('intervals', () => {
  it('refuses an item that ends before it starts', () => {
    const out = checkIntervals({ items: [{ id: 'a', label: 'A', start: 10, end: 5 }], variant: 'gantt' }, 'x')
    expect(rejects(out)[0]?.message).toMatch(/ends before it starts/)
  })

  it('refuses cyclic dependencies', () => {
    const out = checkIntervals(
      {
        variant: 'gantt',
        items: [
          { id: 'a', label: 'A', start: 0, end: 1, dependsOn: ['b'] },
          { id: 'b', label: 'B', start: 1, end: 2, dependsOn: ['a'] },
        ],
      },
      'x',
    )
    expect(rejects(out).some((i) => /cycle/.test(i.message))).toBe(true)
  })

  it('warns when a task starts before its dependency finishes', () => {
    const out = checkIntervals(
      {
        variant: 'gantt',
        items: [
          { id: 'a', label: 'A', start: 0, end: 10 },
          { id: 'b', label: 'B', start: 5, end: 12, dependsOn: ['a'] },
        ],
      },
      'x',
    )
    expect(out.some((i) => i.level === 'warn' && /starts before/.test(i.message))).toBe(true)
  })
})

describe('process', () => {
  it('refuses a decision with only one outcome', () => {
    /* A decision with one exit is an action wearing a diamond — it tells the
       reader a choice exists where none does. */
    const out = checkProcess(
      {
        variant: 'flowchart',
        steps: [
          { id: 's', label: 'Start', kind: 'start' },
          { id: 'd', label: 'Ready?', kind: 'decision' },
          { id: 'e', label: 'End', kind: 'end' },
        ],
        transitions: [{ from: 's', to: 'd' }, { from: 'd', to: 'e', label: 'yes' }],
      },
      'x',
    )
    expect(rejects(out).some((i) => /at least two/.test(i.message))).toBe(true)
  })

  it('refuses a dead end and demands exactly one entry', () => {
    const out = checkProcess(
      {
        variant: 'flowchart',
        steps: [
          { id: 's', label: 'Start', kind: 'start' },
          { id: 'a', label: 'Do', kind: 'action' },
          { id: 'e', label: 'End', kind: 'end' },
        ],
        transitions: [{ from: 's', to: 'a' }],
      },
      'x',
    )
    expect(rejects(out).some((i) => /no way out/.test(i.message))).toBe(true)
  })

  it('refuses an unlabelled branch out of a decision', () => {
    const out = checkProcess(
      {
        variant: 'decisionFlow',
        steps: [
          { id: 's', label: 'S', kind: 'start' },
          { id: 'd', label: 'D', kind: 'decision' },
          { id: 'e', label: 'E', kind: 'end' },
          { id: 'f', label: 'F', kind: 'end' },
        ],
        transitions: [
          { from: 's', to: 'd' },
          { from: 'd', to: 'e', label: 'yes' },
          { from: 'd', to: 'f' },
        ],
      },
      'x',
    )
    expect(rejects(out).some((i) => /which case/.test(i.message))).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* distribution and logic                                                     */
/* -------------------------------------------------------------------------- */

describe('distribution', () => {
  it('refuses a box plot with too few samples to summarise', () => {
    const out = checkDistribution({ groups: [{ name: 'a', samples: [1, 2, 3] }], variant: 'boxPlot' }, 'x')
    expect(rejects(out)[0]?.message).toMatch(/five statistics/)
  })

  it('warns when smoothing too few samples', () => {
    /* A smooth curve over eight points draws a shape the data does not have,
       and the reader cannot tell an estimate from a measurement. */
    const out = checkDistribution({ groups: [{ name: 'a', samples: [1, 2, 3, 4, 5, 6, 7, 8] }], variant: 'violin' }, 'x')
    expect(out.some((i) => i.level === 'warn')).toBe(true)
  })

  it('asks for the bin width, because it changes the answer', () => {
    const out = checkDistribution({ groups: [{ name: 'a', samples: [1, 2] }], variant: 'histogram' }, 'x')
    expect(out.some((i) => /bin width/.test(i.message))).toBe(true)
  })

  it('refuses a population pyramid without exactly two groups', () => {
    const out = checkDistribution({ groups: [{ name: 'a', samples: [1] }], variant: 'populationPyramid' }, 'x')
    expect(rejects(out).some((i) => /exactly two/.test(i.message))).toBe(true)
  })
})

describe('logic', () => {
  it('refuses an incomplete truth table', () => {
    /* A table with missing rows is not a smaller table; it is an incomplete
       claim about when the expression holds. */
    const out = checkLogic({ variant: 'truthTable', inputs: ['p', 'q'], rows: [[true, true], [true, false]] }, 'x')
    expect(rejects(out)[0]?.message).toMatch(/all 4 rows/)
  })

  it('accepts a complete one', () => {
    const out = checkLogic(
      { variant: 'truthTable', inputs: ['p', 'q'], rows: [[true, true], [true, false], [false, true], [false, false]] },
      'x',
    )
    expect(rejects(out)).toHaveLength(0)
  })

  it('refuses a derived proof step with no named rule', () => {
    const out = checkLogic(
      { variant: 'proofTree', steps: [{ id: 'a', statement: 'P' }, { id: 'b', statement: 'Q', from: ['a'] }] },
      'x',
    )
    expect(rejects(out).some((i) => /name the rule/.test(i.message))).toBe(true)
  })
})
