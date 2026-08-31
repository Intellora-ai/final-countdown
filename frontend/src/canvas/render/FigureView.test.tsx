// @vitest-environment jsdom

import type { ReactElement } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'

import { billBecomesLaw } from '../lessons/billBecomesLaw'
import { classifierEvaluation } from '../lessons/classifierEvaluation'
import { gasPressure } from '../lessons/gasPressure'
import type { FigureBlock } from '../spec/figure'
import type { Lesson, LessonInput } from '../spec/spec'
import { validateLesson, type TeachingLevel } from '../spec/validate'
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

/**
 * A BOX WITH A SIZE, BECAUSE ZERO IS NOT A SIZE ECHARTS SURVIVES.
 *
 * jsdom reports every element as 0x0. For most of this file that is fine and is
 * exactly why no assertion below reads a dimension. For echarts it is not: a
 * coordinate system built on a zero box leaves `View._rawTransformable.transform`
 * null, and the sankey view then hands that null straight to zrender:
 *
 *     TypeError: Cannot read properties of null (reading '0')
 *      at copy                       zrender/lib/core/matrix.js:14:15
 *      at legacyCopyOverallTrans     echarts/lib/coord/View.js:382:5
 *      at SankeyView._updateViewCoordSys
 *      at Task._doProgress           echarts/lib/core/task.js:167:10
 *
 * `Task._doProgress` is the reason this was so slippery. Progressive rendering
 * runs OUTSIDE the promise chain `settled()` awaits, so the throw never reaches
 * the test that caused it. Vitest counts it as an unhandled rejection instead:
 * the run printed `Test Files 29 passed (29)` and `Errors 1 error` and exited 1,
 * with no file and no line to annotate. It reddened main and two pull requests
 * before it was pinned down, and it looked like flake because the scheduling has
 * to land a certain way — measured here, it reproduces about two runs in three
 * with `--poolOptions.threads.maxThreads=4`, and almost never with the default
 * thread count on a larger machine, which is why CI saw it and laptops did not.
 *
 * THIS CHANGES WHAT IS MEASURED, NOT WHAT IS CLAIMED. The box now has a size, so
 * echarts builds a sane transform instead of a null one. Nothing below asserts
 * on that size, on a rendered bar, or on any painted geometry — those remain
 * claims only the browser harness is allowed to make. The size exists so the
 * chart engine does not throw while this file asks its actual question, which is
 * whether a shape reaches a renderer at all.
 */
const STUB_BOX = { width: 640, height: 360 }

beforeAll(() => {
  for (const [prop, value] of [
    ['clientWidth', STUB_BOX.width],
    ['clientHeight', STUB_BOX.height],
    ['offsetWidth', STUB_BOX.width],
    ['offsetHeight', STUB_BOX.height],
  ] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, {
      configurable: true,
      get() {
        return value
      },
    })
  }

  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: STUB_BOX.width,
      bottom: STUB_BOX.height,
      width: STUB_BOX.width,
      height: STUB_BOX.height,
      toJSON: () => ({}),
    } as DOMRect
  }
})

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

/**
 * @param teaching Which rules apply. The three real lessons are checked at
 * `'lesson'`, the full arc, because they are lessons and this file is one of
 * the places that would notice if they stopped teaching. The single-figure
 * fixtures below are checked at `'off'`: their subject is whether a SHAPE
 * reaches its renderer, and a one-block fixture cannot open with a definition
 * or close with a summary without becoming a different test. `'off'` is
 * documented in `validate.ts` for exactly this -- "a fixture round-trip, a
 * shape test" -- and it still runs every structural check, so the figure's own
 * invariants are as strictly enforced here as anywhere.
 */
function validated(input: LessonInput, name: string, teaching: TeachingLevel): Lesson {
  const result = validateLesson(input, { teaching })
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
      const lesson = validated(input, name, 'lesson')

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
    'off',
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

/* -------------------------------------------------------------------------- */
/* The last two shapes to get a renderer                                       */
/* -------------------------------------------------------------------------- */

/*
 * These two used to assert the PLACEHOLDER, and that was correct when written:
 * `geometry` and `logic` were the only shapes in the registry with nothing to
 * draw them. Both now have one, so the assertion is inverted rather than
 * deleted — the thing worth pinning is that every shape the registry declares
 * reaches a renderer, and that is only checked if something fails when one does
 * not.
 *
 * `geometry` is the interesting case. Its payload carries no coordinates at all
 * (Law 2 forbids the author from supplying any), so the renderer derives
 * position from `relation`, `magnitude` and `angleDegrees`. Where the data does
 * not determine a drawing it refuses in its own words. That refusal is a
 * DIFFERENT outcome from the placeholder and must not be confused with it: the
 * placeholder means "we never built this", the refusal means "this data does not
 * describe a figure".
 */
const NOW_DRAWN: { shape: string; representation: string; block: BlockInput }[] = [
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

describe('every shape in the registry reaches a renderer', () => {
  for (const drawn of NOW_DRAWN) {
    it(`${drawn.shape} is drawn, not deferred to the placeholder`, async () => {
      const container = await settled(<FigureView block={figure(drawn.block)} />)

      const text = container.textContent ?? ''
      expect(text, `${drawn.shape} still shows the "not built" placeholder`).not.toMatch(
        /cannot be drawn yet/i,
      )
      expect(
        container.querySelector('[data-representation]'),
        'the placeholder box is still being rendered',
      ).toBeNull()
    })

    it(`${drawn.shape} puts something on the page`, async () => {
      const container = await settled(<FigureView block={figure(drawn.block)} />)

      /* Either a drawing or an honest refusal in the renderer's own words. What
         must NOT happen is an empty box, which is what a wired-but-broken
         renderer produces and which no other assertion here would catch. */
      const painted =
        container.querySelector('svg') ??
        container.querySelector('table') ??
        container.querySelector('.lc-refusal')
      expect(painted, `${drawn.shape} rendered nothing at all`).not.toBeNull()
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
