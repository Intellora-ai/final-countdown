// @vitest-environment jsdom
/**
 * E2 — ALL 137 REPRESENTATIONS REACH A RENDERER, OR ARE REFUSED OUT LOUD.
 *
 * The registry names 137 ways of showing an idea; ECharts is configured with
 * twelve chart types. An unregistered type draws AN EMPTY BOX WITH NO ERROR --
 * the learner sees a blank rectangle where the explanation should be, and no
 * log anywhere says why. That is the one outcome this suite forbids.
 *
 * For every name: build the minimal payload its shape demands, validate it
 * through the real gate, render it through the real renderer, and require
 * something on screen. Refusal is acceptable and visible; blankness is not.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { REPRESENTATION_NAMES, shapeOf, type RepresentationName } from '../spec/representations'
import { validateBlock } from '../spec/validate'
import { BlockView } from './BlockView'

afterEach(cleanup)

/** The smallest payload each shape accepts, from the schemas in `figure.ts`. */
function payloadFor(name: RepresentationName): Record<string, unknown> {
  /* Three names carry an invariant of their own that a generic payload for
     their shape cannot satisfy, and the gate is right to say so: a population
     pyramid compares exactly two groups, a confusion matrix holds counts. */
  if (name === 'populationPyramid') {
    return { shape: 'distribution', groups: [{ name: 'Girls', samples: [1, 2, 3] }, { name: 'Boys', samples: [2, 3, 4] }] }
  }
  if (name === 'confusionMatrix') {
    return { shape: 'matrix', rows: ['Cat', 'Dog'], columns: ['Cat', 'Dog'], values: [[8, 2], [1, 9]] }
  }
  switch (shapeOf(name)) {
    case 'series':
      return { shape: 'series', series: [{ name: 'Measured', points: [{ x: 1, y: 2 }, { x: 2, y: 4 }] }] }
    case 'distribution':
      return { shape: 'distribution', groups: [{ name: 'Class', samples: [1, 2, 2, 3, 4, 5] }] }
    case 'parts':
      return { shape: 'parts', parts: [{ label: 'Water', value: 60 }, { label: 'Solids', value: 40 }] }
    case 'matrix':
      /* A correlation matrix must be square, symmetric and within [-1, 1]; a
         confusion matrix wants the same classes on both axes. One payload that
         satisfies every matrix name at once. */
      return { shape: 'matrix', rows: ['A', 'B'], columns: ['A', 'B'], values: [[1, 0.5], [0.5, 1]], symmetric: true }
    case 'graph':
      return {
        shape: 'graph',
        nodes: [{ id: 'a', label: 'Sun' }, { id: 'b', label: 'Leaf' }],
        edges: [{ from: 'a', to: 'b' }],
      }
    case 'hierarchy':
      return { shape: 'hierarchy', nodes: [{ id: 'root', label: 'Living things', parent: null, value: 2 }, { id: 'plant', label: 'Plants', parent: 'root', value: 1 }] }
    case 'flowWeighted':
      return {
        shape: 'flowWeighted',
        nodes: [{ id: 'in', label: 'Sunlight' }, { id: 'out', label: 'Sugar' }],
        links: [{ from: 'in', to: 'out', value: 10 }],
      }
    case 'intervals':
      return { shape: 'intervals', items: [{ id: 'one', label: 'Day', start: 0, end: 12 }] }
    case 'process':
      return {
        shape: 'process',
        steps: [
          { id: 'start', label: 'Light arrives', kind: 'start' },
          { id: 'end', label: 'Sugar made', kind: 'end' },
        ],
        transitions: [{ from: 'start', to: 'end' }],
      }
    case 'logic':
      /* A truth table needs rows that match its inputs: two inputs, four rows. */
      return {
        shape: 'logic',
        inputs: ['P', 'Q'],
        rows: [[false, false], [false, true], [true, false], [true, true]],
        steps: [{ id: 'one', statement: 'If it rains, the ground is wet' }],
      }
    case 'tabular':
      return { shape: 'tabular', columns: [{ key: 'mass', label: 'Mass' }], rows: [{ mass: 2 }] }
    case 'geometry':
      return { shape: 'geometry', elements: [{ id: 'p', kind: 'point', label: 'P' }] }
  }
}

describe('every one of the 137 representations', () => {
  it('is a name the registry can place, with a shape and a renderer', () => {
    expect(REPRESENTATION_NAMES).toHaveLength(137)
    for (const name of REPRESENTATION_NAMES) expect(shapeOf(name)).not.toBe(undefined)
  })

  const refused: string[] = []
  const blank: string[] = []

  it.each(REPRESENTATION_NAMES)('%s draws something, or is refused out loud -- never a blank box', async (name) => {
    const block = { id: 'figure-under-test', kind: 'figure', role: 'support', as: name, title: `A ${name}`, data: payloadFor(name) }
    const checked = validateBlock(block, 0)
    if (!checked.ok) {
      refused.push(`${name}: ${checked.issues.map((one) => one.message).join('; ')}`)
      expect(checked.issues.length, `${name} was refused with no reason given`).toBeGreaterThan(0)
      return
    }
    const view = render(<BlockView block={checked.block} marker={null} mode="2d" />)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const drawn = view.container.querySelector('svg, canvas, table, .lc-figure, [data-shape]')
    const text = view.container.textContent ?? ''
    if (drawn === null && text.trim() === '') blank.push(name)
    expect(drawn !== null || text.trim() !== '', `${name} rendered an empty box: nothing drawn and nothing said`).toBe(true)
  })

  it('reports what was refused, so a silent gap cannot hide behind a green suite', () => {
    expect(blank, `these drew nothing at all: ${blank.join(', ')}`).toEqual([])
    if (refused.length > 0) console.log(`[e2] refused (loudly, which is allowed): ${refused.length} of 137`)
    for (const one of refused) console.log(`[e2] ${one}`)
  })
})
