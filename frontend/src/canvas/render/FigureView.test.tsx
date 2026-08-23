// @vitest-environment jsdom

import type { ReactElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'

import { billBecomesLaw } from '../lessons/billBecomesLaw'
import { classifierEvaluation } from '../lessons/classifierEvaluation'
import { gasPressure } from '../lessons/gasPressure'
import type { FigureBlock } from '../spec/figure'
import type { Lesson, LessonInput } from '../spec/spec'
import { validateLesson } from '../spec/validate'
import { BlockView } from './BlockView'
import { FigureView } from './FigureView'

/**
 * Does a figure actually REACH a renderer?
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Six shape modules — distribution, flowWeighted, graph, hierarchy, intervals,
 * process — were complete, and 246 tests across their six suites passed, while
 * every one of them was unreachable: `FigureView` routed three shapes and sent
 * the rest to a placeholder. Each suite imports its own module directly, so not
 * one of them crossed the dispatch that was broken. The civics lesson rendered
 * four grey boxes in a real browser with the whole gate green.
 *
 * The first describe below is the test whose absence allowed that. It renders
 * every block of all three real lessons and asserts that no placeholder and no
 * refusal appears anywhere — which fails the moment a lesson names a
 * representation nothing can draw, whether that is a new representation or a
 * renderer that quietly stopped being wired up.
 *
 * WHAT jsdom CAN AND CANNOT PROVE HERE
 * ------------------------------------
 * jsdom performs no layout, so an echarts figure mounts into a box measured as
 * zero and paints nothing into its SVG. That makes "the chart drew the right
 * bars" a claim about the stub, and it is not made anywhere below. What jsdom
 * answers honestly is which elements exist: the placeholder is ABSENT and the
 * shape's own wrapper is PRESENT — which is precisely the question that was
 * being got wrong. The four SVG-drawn shapes — process, intervals, graph,
 * hierarchy — and the table build their content in plain TypeScript rather than
 * in a chart engine, so those are checked a little harder: their labels have to
 * be in the document, not merely their wrapper.
 */

afterEach(cleanup)

/** The placeholder, in both its wordings, so a revert fails here too. */
const PLACEHOLDER = /cannot be drawn yet|No renderer yet/i

/** Every Suspense fallback on this path — `FigureView`'s and `BlockView`'s. */
const FALLBACK = /Loading /

/** Enough turns for the heaviest shape module; far short of a hung test. */
const TURNS = 200

/**
 * Render, and do not return until every Suspense fallback has been replaced.
 *
 * A single `await act(...)` is NOT enough here, and the difference matters more
 * than it looks. The shape modules are large — several pull in echarts — so one
 * turn of the loop leaves the document holding "Loading series…" and nothing
 * else. Every "no placeholder appears" assertion below would then pass against
 * an empty tree, which is the same false green that let six unreachable
 * renderers ship in the first place. So the fallback going away is a
 * precondition, and a fallback that never resolves fails the test rather than
 * quietly satisfying it.
 */
async function settled(ui: ReactElement): Promise<HTMLElement> {
  const { container } = render(ui)

  for (let turn = 0; turn < TURNS; turn += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    if (!FALLBACK.test(container.textContent ?? '')) return container
  }

  throw new Error(`a lazy renderer never arrived: ${container.textContent ?? ''}`)
}

function validated(input: LessonInput, name: string): Lesson {
  const result = validateLesson(input)
  if (!result.ok) throw new Error(`${name} does not validate: ${JSON.stringify(result.issues)}`)
  return result.lesson
}

/* -------------------------------------------------------------------------- */
/* The regression: three real lessons, every block, no holes                   */
/* -------------------------------------------------------------------------- */

const LESSONS: [string, LessonInput][] = [
  ['gasPressure', gasPressure],
  ['billBecomesLaw', billBecomesLaw],
  ['classifierEvaluation', classifierEvaluation],
]

describe('the three real lessons render with no holes in them', () => {
  for (const [name, input] of LESSONS) {
    it(`${name}: every block renders, and none of them is a placeholder`, async () => {
      const lesson = validated(input, name)

      /* Through `BlockView`, not `FigureView` directly. A figure reaches a
         learner through the block dispatch, and a placeholder that only appears
         on that path is still a placeholder on the page. */
      const container = await settled(
        <>
          {lesson.blocks.map((block, i) => (
            <BlockView key={block.id} block={block} marker={i + 1} mode="2d" />
          ))}
        </>,
      )

      const text = container.textContent ?? ''

      expect(text).not.toMatch(PLACEHOLDER)
      expect(container.querySelector('[data-representation]')).toBeNull()

      /* A shape that is wired but then refuses its own data is the same hole
         wearing a different sign, so it is caught here rather than in a
         browser. */
      expect(container.querySelector('.lc-refusal')).toBeNull()

      /*
       * Two anchors, because "no placeholder" is satisfied by an empty document
       * and this file's whole point is not to be reassured by one. Every titled
       * block put its heading on the page, and every figure block produced one
       * of the three things a shape renderer can leave behind: an echarts host,
       * a laid-out SVG, or a table.
       */
      for (const block of lesson.blocks) if (block.title) expect(text).toContain(block.title)

      const figures = lesson.blocks.filter((block) => block.kind === 'figure')
      const drawn = container.querySelectorAll('.lc-chart, svg.lc-flow, table.lc-table')
      expect(drawn.length).toBeGreaterThanOrEqual(figures.length)
    })
  }
})

/* -------------------------------------------------------------------------- */
/* One minimal figure per wired shape                                          */
/* -------------------------------------------------------------------------- */

type BlockInput = LessonInput['blocks'][number]

/**
 * A single figure block, put through the real validator.
 *
 * Hand-casting a `FigureBlock` would test the renderer against data the schema
 * has never seen — including the defaults it fills in, which the shape modules
 * read. Everything below is what `validateLesson` actually emits.
 */
function figure(block: BlockInput): FigureBlock {
  const lesson = validated(
    { id: 'fixture', question: 'Does this figure reach a renderer?', blocks: [block] },
    'the fixture',
  )
  const only = lesson.blocks[0]
  if (only === undefined || only.kind !== 'figure')
    throw new Error('the fixture did not come back as a figure block')
  return only
}

interface Wired {
  /** The shape under test, used only to name the case. */
  shape: string
  block: BlockInput
  /** Something only this shape's renderer puts in the document. */
  selector: string
  /** Text the renderer must have drawn, where jsdom can honestly see it. */
  text?: string
}

const WIRED: Wired[] = [
  {
    shape: 'series',
    selector: '.lc-chart',
    block: {
      id: 'a-series',
      kind: 'figure',
      as: 'line',
      data: {
        shape: 'series',
        continuousX: true,
        series: [{ name: 'Signal', points: [{ x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 9 }] }],
      },
    },
  },
  {
    shape: 'distribution',
    selector: '.lc-chart',
    block: {
      id: 'a-distribution',
      kind: 'figure',
      as: 'boxPlot',
      data: {
        shape: 'distribution',
        groups: [{ name: 'Batch', samples: [1, 2, 3, 4, 5, 6, 7] }],
      },
    },
  },
  {
    shape: 'parts',
    selector: '.lc-chart',
    block: {
      id: 'a-part',
      kind: 'figure',
      as: 'donut',
      data: {
        shape: 'parts',
        whole: 100,
        parts: [{ label: 'Kept', value: 60 }, { label: 'Lost', value: 40 }],
      },
    },
  },
  {
    shape: 'matrix',
    selector: '.lc-chart',
    block: {
      id: 'a-matrix',
      kind: 'figure',
      as: 'heatMap',
      data: {
        shape: 'matrix',
        rows: ['Morning', 'Evening'],
        columns: ['Weekday', 'Weekend'],
        values: [[1, 2], [3, 4]],
      },
    },
  },
  {
    shape: 'graph',
    selector: 'svg.lc-flow',
    text: 'Compiler',
    block: {
      id: 'a-graph',
      kind: 'figure',
      as: 'dependencyGraph',
      data: {
        shape: 'graph',
        directed: true,
        acyclic: true,
        nodes: [
          { id: 'source', label: 'Source' },
          { id: 'compiler', label: 'Compiler' },
          { id: 'binary', label: 'Binary' },
        ],
        edges: [{ from: 'source', to: 'compiler' }, { from: 'compiler', to: 'binary' }],
      },
    },
  },
  {
    shape: 'process',
    selector: 'svg.lc-flow',
    text: 'Review',
    block: {
      id: 'a-process',
      kind: 'figure',
      as: 'flowchart',
      data: {
        shape: 'process',
        steps: [
          { id: 'begin', label: 'Begin', kind: 'start' },
          { id: 'review', label: 'Review', kind: 'action' },
          { id: 'done', label: 'Done', kind: 'end' },
        ],
        transitions: [{ from: 'begin', to: 'review' }, { from: 'review', to: 'done' }],
      },
    },
  },
  {
    shape: 'flowWeighted',
    selector: '.lc-chart',
    block: {
      id: 'a-flow',
      kind: 'figure',
      as: 'sankey',
      data: {
        shape: 'flowWeighted',
        nodes: [
          { id: 'applied', label: 'Applied' },
          { id: 'shortlisted', label: 'Shortlisted' },
          { id: 'rejected', label: 'Rejected' },
        ],
        links: [
          { from: 'applied', to: 'shortlisted', value: 30 },
          { from: 'applied', to: 'rejected', value: 70 },
        ],
      },
    },
  },
  {
    shape: 'intervals',
    selector: 'svg.lc-flow',
    text: 'Drafting',
    block: {
      id: 'an-interval',
      kind: 'figure',
      as: 'gantt',
      data: {
        shape: 'intervals',
        items: [
          { id: 'draft', label: 'Drafting', start: 0, end: 2 },
          { id: 'review', label: 'Reviewing', start: 2, end: 5, dependsOn: ['draft'] },
        ],
      },
    },
  },
  {
    shape: 'hierarchy',
    selector: 'svg.lc-flow',
    text: 'Mammal',
    block: {
      id: 'a-hierarchy',
      kind: 'figure',
      as: 'taxonomy',
      data: {
        shape: 'hierarchy',
        nodes: [
          { id: 'animal', label: 'Animal', parent: null },
          { id: 'mammal', label: 'Mammal', parent: 'animal' },
          { id: 'bird', label: 'Bird', parent: 'animal' },
        ],
      },
    },
  },
  {
    shape: 'tabular',
    selector: 'table.lc-table',
    text: 'Lok Sabha',
    block: {
      id: 'a-table',
      kind: 'figure',
      as: 'comparisonTable',
      title: 'Powers',
      data: {
        shape: 'tabular',
        columns: [
          { key: 'power', label: 'Power', type: 'text' },
          { key: 'lok', label: 'Lok Sabha', type: 'text' },
        ],
        rows: [{ power: 'Money bills', lok: 'Yes' }],
      },
    },
  },
]

describe('every shape with a renderer reaches it through FigureView', () => {
  for (const wired of WIRED) {
    it(`${wired.shape} draws instead of showing the placeholder`, async () => {
      const container = await settled(<FigureView block={figure(wired.block)} />)

      expect(container.textContent ?? '').not.toMatch(PLACEHOLDER)
      expect(container.querySelector('.lc-refusal')).toBeNull()
      expect(container.querySelector(wired.selector)).not.toBeNull()
      if (wired.text !== undefined) expect(container.textContent ?? '').toContain(wired.text)
    })
  }

  it('covers every shape the registry can produce, minus the two with no renderer', () => {
    /* The list above is only worth anything if it is complete. `logic` and
       `geometry` are named here rather than silently missing, so adding a shape
       to the registry breaks this line instead of slipping past unrendered. */
    const covered = new Set(WIRED.map((w) => w.shape))
    expect([...covered].sort()).toEqual(
      [
        'distribution',
        'flowWeighted',
        'graph',
        'hierarchy',
        'intervals',
        'matrix',
        'parts',
        'process',
        'series',
        'tabular',
      ],
    )
  })
})

/* -------------------------------------------------------------------------- */
/* The two shapes that genuinely have no renderer                              */
/* -------------------------------------------------------------------------- */

const UNDRAWN: { shape: string; representation: string; block: BlockInput }[] = [
  {
    shape: 'logic',
    representation: 'truthTable',
    block: {
      id: 'a-truth-table',
      kind: 'figure',
      as: 'truthTable',
      data: { shape: 'logic', inputs: ['p'], rows: [[true], [false]] },
    },
  },
  {
    shape: 'geometry',
    representation: 'numberLine',
    block: {
      id: 'a-number-line',
      kind: 'figure',
      as: 'numberLine',
      data: {
        shape: 'geometry',
        elements: [{ id: 'origin', kind: 'point', label: 'Zero' }],
      },
    },
  },
]

describe('the placeholder, for the two shapes nothing can draw yet', () => {
  for (const undrawn of UNDRAWN) {
    it(`${undrawn.shape} says so in words a learner can use`, async () => {
      const container = await settled(<FigureView block={figure(undrawn.block)} />)

      const text = container.textContent ?? ''
      expect(text).toMatch(/cannot be drawn yet/i)

      /*
       * The old placeholder read "No renderer yet for processdecisionFlow — for
       * sequence. Avoid it when the branches are not labelled." Two names run
       * together with no separator, a shape name and an intent the reader has
       * never met, and authoring advice aimed at someone who is not there. None
       * of it may come back.
       */
      expect(text).not.toContain(undrawn.shape)
      expect(text).not.toContain(undrawn.representation)
      expect(text.toLowerCase()).not.toContain('avoid')
    })

    it(`${undrawn.shape} still tells a developer which figure it was`, async () => {
      const container = await settled(<FigureView block={figure(undrawn.block)} />)

      const box = container.querySelector('[data-representation]')
      expect(box?.getAttribute('data-representation')).toBe(undrawn.representation)
      expect(box?.getAttribute('data-shape')).toBe(undrawn.shape)
    })
  }
})

/* -------------------------------------------------------------------------- */
/* Refusal still outranks drawing                                              */
/* -------------------------------------------------------------------------- */

it('a figure whose data contradicts its name is refused, not drawn', async () => {
  const table = figure({
    id: 'a-table',
    kind: 'figure',
    as: 'comparisonTable',
    data: {
      shape: 'tabular',
      columns: [{ key: 'power', label: 'Power', type: 'text' }],
      rows: [{ power: 'Money bills' }],
    },
  })

  /* Valid data, wrong name for it — the arrival a validator never sees, which
     is the only reason `FigureView` checks again at all. */
  const container = await settled(<FigureView block={{ ...table, as: 'sankey' }} />)

  expect(container.textContent ?? '').toContain('This figure was refused')
  expect(container.querySelector('table.lc-table')).toBeNull()
  expect(container.textContent ?? '').not.toMatch(PLACEHOLDER)
})
