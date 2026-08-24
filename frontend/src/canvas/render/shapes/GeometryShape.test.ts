import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

/* The file as text, so the tests can check the rules the SOURCE is under and
   not only the numbers it produces. `?raw` rather than `fs` because this
   package has no Node types and does not need any. */
import geometrySource from './GeometryShape.tsx?raw'
import { namesForShape } from '../../spec/representations'
import {
  arcPath,
  buildGeometry,
  canonicalSlot,
  coordsFrom,
  describeGeometry,
  directionFrom,
  domainFor,
  extentOf,
  GEOMETRY_FAMILY,
  GeometryShape,
  geometryFamilyFor,
  namedAxes,
  namesIn,
  niceStep,
  numbersIn,
  regionAnchor,
  round,
  ticksOver,
  UNDRAWN_REASON,
  vennCircles,
} from './GeometryShape'
import type { GeometryData, GeometryElement, Mark } from './GeometryShape'

/**
 * A geometry figure fails in ways a data chart cannot, so this file looks at
 * the things that would actually be wrong on a page:
 *
 *   A POSITION THAT DOES NOT FOLLOW FROM THE MEANING. The payload has no
 *   coordinates, so every position here was derived — and a derivation is
 *   exactly the sort of thing that is plausible and wrong. The vector tests
 *   assert the geometry against the stated angle rather than against a
 *   snapshot, which would only pin whatever the code does today.
 *
 *   SOMETHING DRAWN OUTSIDE THE FRAME. The frames are constants, so this is a
 *   real claim about the construction rather than a tautology about a bounding
 *   box fitted afterwards.
 *
 *   A CONFIDENT PICTURE OF DATA THAT DOES NOT DETERMINE ONE. Three variants
 *   must refuse, and the Euler diagram must refuse when nothing states which
 *   regions exist. Those refusals are the point of the module, so they are
 *   tested as hard as the drawings.
 */

/* -------------------------------------------------------------------------- */
/* The names this renderer is responsible for                                 */
/* -------------------------------------------------------------------------- */

/* Taken from the registry, not typed out: a hand-copied list goes stale the
   first time somebody adds a name, and the failure is silent. */
const VARIANTS = namesForShape('geometry')

/** Every variant this renderer draws, and the ones it must refuse to draw. */
const DRAWN = [
  'numberLine',
  'coordinatePlane',
  'vectorDiagram',
  'freeBodyDiagram',
  'vennDiagram',
  'eulerDiagram',
  'geometricFigure',
]
const UNDRAWN = ['logicCircuit', 'circuitSchematic', 'experimentalSetup']

/* -------------------------------------------------------------------------- */
/* Fixtures — one payload per family that a teacher might really write         */
/* -------------------------------------------------------------------------- */

const element = (
  id: string,
  kind: GeometryElement['kind'],
  label: string,
  extra: Partial<GeometryElement> = {},
): GeometryElement => ({ id, kind, label, ...extra })

function numberLine(scale = 1): GeometryData {
  return {
    variant: 'numberLine',
    elements: [
      element('axis', 'axis', 'Temperature (°C)'),
      element('a', 'point', 'freezing', { magnitude: 0 }),
      element('b', 'point', 'boiling', { magnitude: 100 * scale }),
      element('c', 'point', 'body heat', { relation: 'at 37' }),
      element('span', 'region', 'liquid water', { relation: 'between 0 and 100' }),
    ],
  }
}

function coordinatePlane(): GeometryData {
  return {
    variant: 'coordinatePlane',
    elements: [
      element('ax', 'axis', 'x — time (s)'),
      element('ay', 'axis', 'y — height (m)'),
      element('p', 'point', 'P', { relation: 'at (3, 4)' }),
      element('q', 'point', 'Q', { relation: 'at (-2, -1)' }),
      element('o', 'point', 'O', { relation: 'at the origin' }),
    ],
  }
}

function vectors(variant: string, scale = 1): GeometryData {
  return {
    variant,
    elements: [
      element('body', 'body', 'the block'),
      element('w', 'force', 'weight', { magnitude: 10 * scale, angleDegrees: 270 }),
      element('n', 'force', 'normal', { magnitude: 10 * scale, angleDegrees: 90 }),
      element('f', 'force', 'friction', { magnitude: 4 * scale, angleDegrees: 180 }),
      element('p', 'force', 'push', { magnitude: 4 * scale, relation: 'rightward' }),
    ],
  }
}

function venn(count: number): GeometryData {
  const names = ['Mammals', 'Swimmers', 'Egg layers']
  return {
    variant: 'vennDiagram',
    elements: [
      ...names.slice(0, count).map((name, i) => element(`s${i}`, 'set', name)),
      element('r', 'region', 'the platypus', { relation: 'in Mammals and Egg layers' }),
    ],
  }
}

function euler(): GeometryData {
  return {
    variant: 'eulerDiagram',
    elements: [
      element('s0', 'set', 'Animals'),
      element('s1', 'set', 'Mammals', { relation: 'inside Animals' }),
      element('s2', 'set', 'Whales', { relation: 'inside Mammals' }),
    ],
  }
}

function triangle(): GeometryData {
  return {
    variant: 'geometricFigure',
    elements: [
      element('a', 'point', 'A'),
      element('b', 'point', 'B'),
      element('c', 'point', 'C'),
      element('m', 'point', 'M', { relation: 'the midpoint of AB' }),
      element('ab', 'line', 'AB'),
      element('bc', 'line', 'BC'),
      element('ca', 'line', 'CA'),
      element('angle', 'arc', 'angle at B', { relation: 'at B', angleDegrees: 60 }),
    ],
  }
}

function payloadFor(variant: string): GeometryData {
  if (variant === 'numberLine') return numberLine()
  if (variant === 'coordinatePlane') return coordinatePlane()
  if (variant === 'vectorDiagram' || variant === 'freeBodyDiagram') return vectors(variant)
  if (variant === 'vennDiagram') return venn(3)
  if (variant === 'eulerDiagram') return euler()
  if (variant === 'geometricFigure') return triangle()
  return {
    variant,
    elements: [
      element('c1', 'component', 'a 9 V cell'),
      element('c2', 'component', 'a 220 Ω resistor'),
      element('c3', 'component', 'a lamp'),
    ],
  }
}

function marksOf(data: GeometryData): Mark[] {
  const built = buildGeometry(data)
  expect(built.ok, `${data.variant} did not build`).toBe(true)
  return built.ok ? built.figure.marks : []
}

/* -------------------------------------------------------------------------- */
/* 1. Coverage: every registered name is accounted for, one way or the other   */
/* -------------------------------------------------------------------------- */

describe('every geometry representation has a decided outcome', () => {
  it('covers all ten names in the registry, with none left over', () => {
    expect([...VARIANTS].sort()).toEqual([...DRAWN, ...UNDRAWN].sort())
    for (const name of VARIANTS) expect(GEOMETRY_FAMILY[name], name).toBeDefined()
  })

  it.each(DRAWN)('%s produces a figure', (variant) => {
    const built = buildGeometry(payloadFor(variant))
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.figure.marks.length).toBeGreaterThan(0)
  })

  it.each(UNDRAWN)('%s produces the honest cannot-draw state, not a figure', (variant) => {
    const built = buildGeometry(payloadFor(variant))
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.family).toBe('undrawn')
    /* The reason has to be specific enough to act on. "Unsupported" tells a
       reader nothing and a maintainer less. */
    expect(built.reason).toBe(UNDRAWN_REASON[variant])
    expect(built.reason.length).toBeGreaterThan(40)
  })

  it('keeps every element of an undrawn variant, so no content is lost', () => {
    for (const variant of UNDRAWN) {
      const data = payloadFor(variant)
      const built = buildGeometry(data)
      expect(built.ok).toBe(false)
      if (built.ok) return
      expect(built.elements).toEqual(data.elements)
    }
  })

  it('treats an unknown name as undrawn rather than guessing at it', () => {
    expect(geometryFamilyFor('somethingNobodyAdded')).toBe('undrawn')
  })
})

/* -------------------------------------------------------------------------- */
/* 2. Determinism and rounding                                                 */
/* -------------------------------------------------------------------------- */

describe('the same construction draws the same picture', () => {
  it.each(DRAWN)('%s is byte-for-byte identical on a second build', (variant) => {
    expect(JSON.stringify(buildGeometry(payloadFor(variant)))).toBe(
      JSON.stringify(buildGeometry(payloadFor(variant))),
    )
  })

  /*
   * ROUNDING IS NOT COSMETIC. A coordinate that serialises as
   * 12.100000000000001 on one side of a hydration and 12.1 on the other is a
   * mismatch that costs an afternoon, and this codebase has already paid for
   * one. Two decimals is below a device pixel at every scale this canvas uses.
   */
  it.each(DRAWN)('%s rounds every generated coordinate to two decimals', (variant) => {
    for (const mark of marksOf(payloadFor(variant))) {
      for (const [key, value] of Object.entries(mark)) {
        if (typeof value !== 'number') continue
        expect(value, `${variant}.${mark.kind}.${key} = ${value}`).toBe(round(value))
      }
      if (mark.kind === 'arc')
        for (const number of [...mark.d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0])))
          expect(number, `${variant} arc path`).toBe(round(number))
    }
  })

  it('reaches only for finite numbers', () => {
    for (const variant of DRAWN)
      for (const mark of marksOf(payloadFor(variant)))
        for (const value of Object.values(mark))
          if (typeof value === 'number') expect(Number.isFinite(value), variant).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* 3. Nothing is drawn outside the frame                                       */
/* -------------------------------------------------------------------------- */

/**
 * The frames are CONSTANTS, chosen in the source, so this is a real claim.
 * A viewBox fitted to the marks it contains would make the test true by
 * definition and catch nothing at all.
 */
describe('nothing leaves the viewBox', () => {
  /* One very large, one very small, one negative, one flat — the four scales at
     which a linear mapping usually breaks. */
  const SCALES = [1, 1e-9, 1e9, -3]

  it.each(DRAWN)('%s stays inside its frame at every scale', (variant) => {
    for (const scale of SCALES) {
      const data = scaled(variant, scale)
      const built = buildGeometry(data)
      if (!built.ok) continue
      const { width, height, marks } = built.figure
      for (const mark of marks) {
        const box = extentOf(mark)
        expect(box.minX, `${variant} @${scale} ${mark.id} left`).toBeGreaterThanOrEqual(0)
        expect(box.minY, `${variant} @${scale} ${mark.id} top`).toBeGreaterThanOrEqual(0)
        expect(box.maxX, `${variant} @${scale} ${mark.id} right`).toBeLessThanOrEqual(width)
        expect(box.maxY, `${variant} @${scale} ${mark.id} bottom`).toBeLessThanOrEqual(height)
      }
    }
  })

  it('states the viewBox as the frame it actually used', () => {
    for (const variant of DRAWN) {
      const built = buildGeometry(payloadFor(variant))
      expect(built.ok).toBe(true)
      if (!built.ok) return
      expect(built.figure.viewBox).toBe(`0 0 ${built.figure.width} ${built.figure.height}`)
    }
  })
})

/** The same fixture with every magnitude multiplied, to stress the scaling. */
function scaled(variant: string, factor: number): GeometryData {
  if (variant === 'numberLine') return numberLine(factor)
  if (variant === 'vectorDiagram' || variant === 'freeBodyDiagram') return vectors(variant, factor)
  if (variant === 'coordinatePlane') {
    const data = coordinatePlane()
    return {
      ...data,
      elements: data.elements.map((e) =>
        e.relation?.includes('(') === true
          ? { ...e, relation: e.relation.replace(/-?\d+(\.\d+)?/g, (n) => String(Number(n) * factor)) }
          : e,
      ),
    }
  }
  return payloadFor(variant)
}

/* -------------------------------------------------------------------------- */
/* 4. Vectors: the angle on the page IS the angle in the data                   */
/* -------------------------------------------------------------------------- */

describe('a vector points where the data says it points', () => {
  function arrowsOf(data: GeometryData) {
    return marksOf(data)
      .filter((mark): mark is Extract<Mark, { kind: 'arrow' }> => mark.kind === 'arrow')
      .map((mark) => ({
        id: mark.id,
        length: Math.hypot(mark.x2 - mark.x1, mark.y2 - mark.y1),
        /* Screen y grows downward and an angle grows counter-clockwise, so the
           rise is negated on the way back out. Getting this wrong mirrors every
           diagram about the x axis, which looks plausible. */
        degrees: (((Math.atan2(mark.y1 - mark.y2, mark.x2 - mark.x1) * 180) / Math.PI) + 360) % 360,
      }))
  }

  it('reproduces every stated angle', () => {
    const arrows = new Map(arrowsOf(vectors('vectorDiagram')).map((a) => [a.id, a]))
    expect(arrows.get('vector-w')?.degrees).toBeCloseTo(270, 6)
    expect(arrows.get('vector-n')?.degrees).toBeCloseTo(90, 6)
    expect(arrows.get('vector-f')?.degrees).toBeCloseTo(180, 6)
  })

  it('derives an angle from a direction word when no angle is given', () => {
    /* "rightward" is an absolute direction, so it resolves. The point of the
       relation field is that words like this are the data. */
    expect(arrowsOf(vectors('vectorDiagram')).find((a) => a.id === 'vector-p')?.degrees).toBeCloseTo(0, 6)
  })

  it('scales length by magnitude, and never past the frame', () => {
    const arrows = arrowsOf(vectors('vectorDiagram'))
    const weight = arrows.find((a) => a.id === 'vector-w')?.length ?? 0
    const friction = arrows.find((a) => a.id === 'vector-f')?.length ?? 0
    /* 10 against 4: the ratio has to survive the mapping, or length is telling
       the reader something the data did not say. */
    expect(friction / weight).toBeCloseTo(0.4, 5)
    for (const arrow of arrows) expect(arrow.length).toBeLessThanOrEqual(100 + 1e-6)
  })

  it('keeps the longest arrow at the same length however big the numbers are', () => {
    for (const factor of [1e-6, 1, 1e6]) {
      const longest = Math.max(...arrowsOf(vectors('vectorDiagram', factor)).map((a) => a.length))
      expect(longest, `factor ${factor}`).toBeCloseTo(100, 5)
    }
  })

  it('says out loud when a magnitude was too small to draw honestly', () => {
    const built = buildGeometry({
      variant: 'vectorDiagram',
      elements: [
        element('big', 'vector', 'big', { magnitude: 1000, angleDegrees: 0 }),
        element('tiny', 'vector', 'tiny', { magnitude: 0.0001, angleDegrees: 90 }),
      ],
    })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.note).toContain('minimum length')
    expect(built.note).toContain('tiny')
  })

  it('refuses to invent a direction that is stated relative to something', () => {
    const built = buildGeometry({
      variant: 'freeBodyDiagram',
      elements: [
        element('body', 'body', 'the block'),
        element('w', 'force', 'weight', { relation: 'downward' }),
        element('n', 'force', 'normal force', { relation: 'perpendicular to the surface' }),
        element('g', 'force', 'gravity component', { relation: 'down the incline' }),
      ],
    })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.unplaced.map((u) => u.id).sort()).toEqual(['g', 'n'])
    for (const item of built.unplaced) expect(item.reason).toContain('direction')
  })

  it('warns when a free-body diagram shows more than one body', () => {
    const built = buildGeometry({
      variant: 'freeBodyDiagram',
      elements: [
        element('b1', 'body', 'block A'),
        element('b2', 'body', 'block B'),
        element('w', 'force', 'weight', { magnitude: 1, angleDegrees: 270 }),
      ],
    })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.warnings.some((w) => w.includes('isolates one'))).toBe(true)
    expect(built.unplaced.some((u) => u.id === 'b2')).toBe(true)
  })

  it('refuses the whole diagram when nothing states a direction', () => {
    const built = buildGeometry({
      variant: 'vectorDiagram',
      elements: [element('v', 'vector', 'a force', { magnitude: 7 })],
    })
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.reason).toContain('direction')
  })
})

/* -------------------------------------------------------------------------- */
/* 5. Direction words: the guard that stops the confident wrong answer          */
/* -------------------------------------------------------------------------- */

describe('a direction word only counts when it is absolute', () => {
  it.each([
    ['upward', 90],
    ['vertically downwards', 270],
    ['to the left', 180],
    ['eastward', 0],
  ])('resolves %s', (text, degrees) => {
    expect(directionFrom(text)).toBe(degrees)
  })

  /*
   * THE TRAP. "down the incline" contains "down", and a bare word match points
   * the arrow at the floor — confidently, and at the wrong angle, because the
   * incline's own angle is nowhere in this shape.
   */
  it.each([
    'down the incline',
    'normal to the surface',
    'parallel to AB',
    'perpendicular to the plane',
    'up the slope',
    'along the ramp',
    'toward the centre',
  ])('refuses %s, which needs something this shape does not carry', (text) => {
    expect(directionFrom(text)).toBeNull()
  })

  it('returns null rather than a default when nothing is said', () => {
    expect(directionFrom(undefined)).toBeNull()
    expect(directionFrom('a force')).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* 6. Naming points: the one-letter problem                                    */
/* -------------------------------------------------------------------------- */

describe('a relation names the points it means and no others', () => {
  const NAMES = ['A', 'B', 'C', 'M']

  it('finds both ends of a segment written run together', () => {
    expect(namesIn('AB', NAMES)).toEqual(['A', 'B'])
    expect(namesIn('the segment CA', NAMES)).toEqual(['C', 'A'])
  })

  /*
   * THE TRAP, TWICE OVER. Matched with a word boundary, "AB" contains neither
   * name and the segment is never drawn. Matched without one, "A" is found in
   * the "a" of "at the origin" and the figure grows a segment nobody wrote.
   */
  it('does not find A in "at the origin" or in "Angle"', () => {
    expect(namesIn('at the origin', NAMES)).toEqual([])
    expect(namesIn('Angle marked here', NAMES)).toEqual([])
  })

  it('reports them in the order they are written', () => {
    expect(namesIn('from B to A', NAMES)).toEqual(['B', 'A'])
    expect(namesIn('the midpoint of AB', NAMES)).toEqual(['A', 'B'])
  })

  it('uses whole words for multi-character names, so Cat is not Ca', () => {
    expect(namesIn('inside Mammals', ['Mammals', 'Mam'])).toEqual(['Mammals'])
    expect(namesIn('Catfish', ['Cat'])).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */
/* 7. Number line: the scale is marked, and marked honestly                     */
/* -------------------------------------------------------------------------- */

describe('the number line marks its scale', () => {
  function tickValues(data: GeometryData): number[] {
    return marksOf(data)
      .filter((m): m is Extract<Mark, { kind: 'label' }> => m.kind === 'label' && m.id.startsWith('tick-label-'))
      .map((m) => Number(m.text))
  }

  it('produces monotonic, evenly spaced ticks over a range of scales', () => {
    for (const scale of [1e-6, 0.01, 1, 7, 1e6]) {
      const values = tickValues(numberLine(scale))
      expect(values.length, `scale ${scale}`).toBeGreaterThan(2)
      const gaps = values.slice(1).map((v, i) => v - (values[i] ?? 0))
      for (const gap of gaps) {
        expect(gap, `scale ${scale}`).toBeGreaterThan(0)
        expect(gap / (gaps[0] ?? 1), `scale ${scale}`).toBeCloseTo(1, 6)
      }
    }
  })

  it('never emits a float artefact as a tick label', () => {
    for (const tick of ticksOver(0, 1, 10)) expect(tick.text).toMatch(/^-?\d+(\.\d+)?$/)
    expect(ticksOver(0, 1, 10).map((t) => t.text)).not.toContain('0.30000000000000004')
  })

  it('picks steps from the 1-2-5 family', () => {
    for (const span of [0.4, 3, 47, 900, 1e7]) {
      const step = niceStep(span, 8)
      /* The nudge is there because log10 of an exact power of ten lands on the
         integer and `floor` would then drop a decade. */
      const mantissa = step / 10 ** Math.floor(Math.log10(step) + 1e-9)
      expect([1, 2, 5].some((m) => Math.abs(mantissa - m) < 1e-6), `span ${span} → ${step}`).toBe(true)
    }
  })

  it('places a point at the value it states, not at its position in the list', () => {
    const marks = marksOf(numberLine())
    const dots = marks.filter((m): m is Extract<Mark, { kind: 'dot' }> => m.kind === 'dot' && m.id === 'point-a')
    const freezing = dots[0]
    const boiling = marks.find((m) => m.id === 'point-b')
    expect(freezing).toBeDefined()
    expect(boiling).toBeDefined()
    if (!freezing || !boiling || boiling.kind !== 'dot') return
    /* 0 is left of 100, and 37 sits between them at the right fraction. */
    const body = marks.find((m) => m.id === 'point-c')
    expect(freezing.x).toBeLessThan(boiling.x)
    if (body && body.kind === 'dot')
      expect((body.x - freezing.x) / (boiling.x - freezing.x)).toBeCloseTo(0.37, 2)
  })

  /*
   * ZERO IS INCLUDED WHEN IT IS NEARBY AND NOT OTHERWISE. Forcing it always
   * would collapse 1000..1005 into a single smear at the right-hand end, which
   * hides the five values the figure exists to separate.
   */
  it('reaches for zero only when zero is close', () => {
    const [near] = domainFor([2, 5, 8])
    expect(near).toBeLessThanOrEqual(0)
    const [far, farMax] = domainFor([1000, 1005])
    expect(far).toBeGreaterThan(900)
    expect(farMax - far).toBeLessThan(50)
  })

  it('gives a single value a window rather than a zero-width scale', () => {
    const [min, max] = domainFor([42])
    expect(max).toBeGreaterThan(min)
    expect(Number.isFinite(min) && Number.isFinite(max)).toBe(true)
  })

  it('names a point it cannot place instead of dropping it', () => {
    const built = buildGeometry({
      variant: 'numberLine',
      elements: [
        element('a', 'point', 'start', { magnitude: 0 }),
        element('b', 'point', 'somewhere', { relation: 'further along' }),
      ],
    })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.unplaced.map((u) => u.id)).toEqual(['b'])
  })

  it('draws an interval as a bar with both ends marked', () => {
    const marks = marksOf(numberLine())
    const bar = marks.find((m) => m.id === 'span-span')
    expect(bar?.kind).toBe('segment')
    expect(marks.some((m) => m.id === 'span-a-span')).toBe(true)
    expect(marks.some((m) => m.id === 'span-b-span')).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* 8. Coordinate plane                                                         */
/* -------------------------------------------------------------------------- */

describe('the coordinate plane keeps one scale on both axes', () => {
  it('places a point at its stated coordinates, in the right quadrant', () => {
    const marks = marksOf(coordinatePlane())
    const origin = marks.find((m) => m.id === 'point-o')
    const p = marks.find((m) => m.id === 'point-p')
    const q = marks.find((m) => m.id === 'point-q')
    if (!origin || !p || !q || origin.kind !== 'dot' || p.kind !== 'dot' || q.kind !== 'dot') {
      expect.fail('the three points were not drawn')
      return
    }
    /* (3, 4) is right and up; (-2, -1) is left and down. Screen y is inverted,
       so "up" is a SMALLER y — the sign flip a plane gets wrong silently. */
    expect(p.x).toBeGreaterThan(origin.x)
    expect(p.y).toBeLessThan(origin.y)
    expect(q.x).toBeLessThan(origin.x)
    expect(q.y).toBeGreaterThan(origin.y)
  })

  /*
   * ONE SCALE, OR THE PLANE LIES ABOUT SHAPE. Stretching x to fill the wider
   * frame makes a right angle look acute and a circle look like an ellipse.
   */
  it('uses the same units per step horizontally and vertically', () => {
    const marks = marksOf(coordinatePlane())
    const origin = marks.find((m) => m.id === 'point-o')
    const p = marks.find((m) => m.id === 'point-p')
    if (!origin || !p || origin.kind !== 'dot' || p.kind !== 'dot') return
    /* P is at (3, 4): 3 across and 4 up must be 3 and 4 of the SAME unit. */
    expect(Math.abs(p.x - origin.x) / 3).toBeCloseTo(Math.abs(origin.y - p.y) / 4, 6)
  })

  it('derives a point from magnitude and angle when that is what was given', () => {
    const marks = marksOf({
      variant: 'coordinatePlane',
      elements: [
        element('o', 'point', 'O', { relation: 'at the origin' }),
        element('r', 'point', 'R', { magnitude: 5, angleDegrees: 90 }),
      ],
    })
    const origin = marks.find((m) => m.id === 'point-o')
    const r = marks.find((m) => m.id === 'point-r')
    if (!origin || !r || origin.kind !== 'dot' || r.kind !== 'dot') return
    expect(r.x).toBeCloseTo(origin.x, 6)
    expect(r.y).toBeLessThan(origin.y)
  })

  it('names all four quadrants', () => {
    const labels = marksOf(coordinatePlane())
      .filter((m): m is Extract<Mark, { kind: 'label' }> => m.kind === 'label')
      .filter((m) => m.id.startsWith('quadrant-'))
      .map((m) => m.text)
    expect(labels).toEqual(['I', 'II', 'III', 'IV'])
  })

  it('reads which axis is which from the words, not from the order', () => {
    const [x, y] = namedAxes([
      element('a', 'axis', 'y — pressure (kPa)'),
      element('b', 'axis', 'x — volume (L)'),
    ])
    expect(x).toBe('x — volume (L)')
    expect(y).toBe('y — pressure (kPa)')
  })

  it('falls back to declaration order when the words do not say', () => {
    const [x, y] = namedAxes([element('a', 'axis', 'time'), element('b', 'axis', 'distance')])
    expect(x).toBe('time')
    expect(y).toBe('distance')
  })

  it('says so when nothing names the axes', () => {
    const data = coordinatePlane()
    const built = buildGeometry({ ...data, elements: data.elements.filter((e) => e.kind !== 'axis') })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.warnings.some((w) => w.includes('names the axes'))).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* 9. Sets: a region label must land in the region it names                     */
/* -------------------------------------------------------------------------- */

describe('a Venn diagram puts every region label inside the region it names', () => {
  function inside(point: { x: number; y: number }, circle: { cx: number; cy: number; r: number }): boolean {
    return Math.hypot(point.x - circle.cx, point.y - circle.cy) < circle.r
  }

  /*
   * THE MEASURED TRAP. With three circles the plain midpoint of two centres
   * comes out 63 units from the third centre, and the third radius is 66 — so
   * "A and B" lands in the TRIPLE region and labels the wrong one. The anchor
   * walks away from the sets it did not name, and this pins that it works for
   * every subset of every arrangement the renderer draws.
   */
  it.each([1, 2, 3])('is right for all %i-set arrangements', (count) => {
    const circles = vennCircles(count)
    const centroid = {
      x: circles.reduce((s, c) => s + c.cx, 0) / circles.length,
      y: circles.reduce((s, c) => s + c.cy, 0) / circles.length,
    }
    const subsets = allSubsets(count)
    for (const subset of subsets) {
      const anchor = regionAnchor(subset, circles, centroid)
      circles.forEach((circle, i) => {
        expect(
          inside(anchor, circle),
          `${count} sets, region {${subset.join(',')}} against circle ${i}`,
        ).toBe(subset.includes(i))
      })
    }
  })

  it('resolves the region a relation names', () => {
    const built = buildGeometry(venn(3))
    expect(built.ok).toBe(true)
    if (!built.ok) return
    const label = built.figure.marks.find((m) => m.id === 'region-r')
    expect(label?.kind).toBe('label')
    expect(built.unplaced).toEqual([])
  })

  it('names a region it cannot resolve rather than putting it somewhere', () => {
    const built = buildGeometry({
      variant: 'vennDiagram',
      elements: [
        element('s0', 'set', 'Mammals'),
        element('s1', 'set', 'Swimmers'),
        element('r', 'region', 'the odd ones', { relation: 'somewhere in the middle' }),
      ],
    })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.unplaced.map((u) => u.id)).toEqual(['r'])
  })

  it('refuses a four-set Venn instead of drawing four circles', () => {
    const built = buildGeometry({
      variant: 'vennDiagram',
      elements: ['A', 'B', 'C', 'D'].map((name, i) => element(`s${i}`, 'set', name)),
    })
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.reason).toContain('ellipses')
  })

  it('gives a lone set a name that is still inside the frame', () => {
    const built = buildGeometry({ variant: 'vennDiagram', elements: [element('s', 'set', 'Primes')] })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    const label = built.figure.marks.find((m) => m.id === 'set-label-s')
    expect(label).toBeDefined()
  })
})

function allSubsets(count: number): number[][] {
  const out: number[][] = []
  for (let mask = 1; mask < 2 ** count; mask += 1) {
    const subset: number[] = []
    for (let i = 0; i < count; i += 1) if ((mask >> i) & 1) subset.push(i)
    out.push(subset)
  }
  return out
}

describe('an Euler diagram draws only the regions that are stated', () => {
  /*
   * THE REFUSAL THIS FAMILY EXISTS FOR. An Euler diagram's whole content is
   * which regions exist. With three sets and no relation between them,
   * overlapping circles claim intersections nobody wrote and separate circles
   * claim disjointness nobody wrote. Both are inventions.
   */
  it('refuses when nothing states a containment or a disjointness', () => {
    const built = buildGeometry({
      variant: 'eulerDiagram',
      elements: ['A', 'B', 'C'].map((name, i) => element(`s${i}`, 'set', name)),
    })
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.reason).toContain('inventions')
  })

  it('nests a set that states it is inside another', () => {
    const built = buildGeometry(euler())
    expect(built.ok).toBe(true)
    if (!built.ok) return
    const circles = new Map(
      built.figure.marks
        .filter((m): m is Extract<Mark, { kind: 'circle' }> => m.kind === 'circle')
        .map((m) => [m.id, m]),
    )
    const animals = circles.get('set-s0')
    const mammals = circles.get('set-s1')
    const whales = circles.get('set-s2')
    if (!animals || !mammals || !whales) {
      expect.fail('the three sets were not drawn')
      return
    }
    /* Contained means CONTAINED: the child's whole disc inside the parent's. */
    expect(Math.hypot(mammals.cx - animals.cx, mammals.cy - animals.cy) + mammals.r).toBeLessThanOrEqual(animals.r)
    expect(Math.hypot(whales.cx - mammals.cx, whales.cy - mammals.cy) + whales.r).toBeLessThanOrEqual(mammals.r)
  })

  it('refuses a containment chain that loops', () => {
    const built = buildGeometry({
      variant: 'eulerDiagram',
      elements: [
        element('a', 'set', 'Alpha', { relation: 'inside Beta' }),
        element('b', 'set', 'Beta', { relation: 'inside Alpha' }),
      ],
    })
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.reason).toContain('not a containment')
  })

  it('names a set nothing relates to, rather than parking it somewhere', () => {
    const built = buildGeometry({
      variant: 'eulerDiagram',
      elements: [
        element('a', 'set', 'Animals'),
        element('m', 'set', 'Mammals', { relation: 'inside Animals' }),
        element('x', 'set', 'Minerals'),
      ],
    })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.unplaced.map((u) => u.id)).toEqual(['x'])
  })
})

/* -------------------------------------------------------------------------- */
/* 10. Geometric figures                                                       */
/* -------------------------------------------------------------------------- */

describe('a figure is placed from its own relations', () => {
  it('draws a segment between exactly the two points it names', () => {
    const marks = marksOf(triangle())
    const a = marks.find((m) => m.id === 'point-a')
    const b = marks.find((m) => m.id === 'point-b')
    const ab = marks.find((m) => m.id === 'line-ab')
    if (!a || !b || !ab || a.kind !== 'dot' || b.kind !== 'dot' || ab.kind !== 'segment') {
      expect.fail('the segment AB was not drawn between A and B')
      return
    }
    expect([ab.x1, ab.y1]).toEqual([a.x, a.y])
    expect([ab.x2, ab.y2]).toEqual([b.x, b.y])
  })

  it('puts a midpoint at the actual midpoint', () => {
    const marks = marksOf(triangle())
    const a = marks.find((m) => m.id === 'point-a')
    const b = marks.find((m) => m.id === 'point-b')
    const m = marks.find((m2) => m2.id === 'point-m')
    if (!a || !b || !m || a.kind !== 'dot' || b.kind !== 'dot' || m.kind !== 'dot') return
    expect(m.x).toBeCloseTo((a.x + b.x) / 2, 1)
    expect(m.y).toBeCloseTo((a.y + b.y) / 2, 1)
  })

  /*
   * A DERIVED POINT MUST NOT TAKE A POLYGON SLOT. If it did, naming a midpoint
   * would change where A, B and C sit — so the same triangle would be drawn
   * differently depending on whether an extra point happened to be listed.
   */
  it('does not move the triangle when a midpoint is added to it', () => {
    const withM = triangle()
    const withoutM = { ...withM, elements: withM.elements.filter((e) => e.id !== 'm') }
    const positions = (data: GeometryData) =>
      marksOf(data)
        .filter((m) => ['point-a', 'point-b', 'point-c'].includes(m.id))
        .map((m) => JSON.stringify(m))
    expect(positions(withM)).toEqual(positions(withoutM))
  })

  it('marks an angle only where two segments actually meet', () => {
    const marks = marksOf(triangle())
    expect(marks.some((m) => m.kind === 'arc' && m.id === 'arc-angle')).toBe(true)

    const lonely = buildGeometry({
      variant: 'geometricFigure',
      elements: [
        element('a', 'point', 'A'),
        element('b', 'point', 'B'),
        element('ab', 'line', 'AB'),
        element('angle', 'arc', 'angle at A', { relation: 'at A' }),
      ],
    })
    expect(lonely.ok).toBe(true)
    if (!lonely.ok) return
    expect(lonely.unplaced.some((u) => u.id === 'angle')).toBe(true)
  })

  /*
   * `geometricFigure.avoidWhen` is "the figure is drawn to a scale it is not
   * actually at". So when a length is stated and the drawing cannot honour it,
   * the page has to say so — that warning IS the registry's rule, enforced.
   */
  it('says NOT TO SCALE whenever a length or an angle is stated', () => {
    const built = buildGeometry(triangle())
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.note).toContain('NOT TO SCALE')
    expect(built.warnings.some((w) => w.includes('NOT to scale'))).toBe(true)
  })

  /*
   * Coordinates belong to a coordinatePlane. Honouring them here would put two
   * incompatible placement systems in one drawing — some points pinned to a
   * grid, the rest on a polygon that knows nothing about it — so the figure
   * says which representation would honour them instead of half-doing it.
   */
  it('says so when a figure states coordinates it is not going to use', () => {
    const built = buildGeometry({
      variant: 'geometricFigure',
      elements: [
        element('a', 'point', 'A', { relation: 'at (0, 0)' }),
        element('b', 'point', 'B', { relation: 'at (4, 0)' }),
      ],
    })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.warnings.some((w) => w.includes('coordinatePlane'))).toBe(true)
  })

  it('does not raise that warning for "at the origin", which a figure does use', () => {
    const built = buildGeometry({
      variant: 'geometricFigure',
      elements: [element('o', 'point', 'O', { relation: 'at the origin' }), element('a', 'point', 'A')],
    })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.warnings.some((w) => w.includes('coordinatePlane'))).toBe(false)
  })

  it('says that a point stated only to be ON a segment is at a representative spot', () => {
    const built = buildGeometry({
      variant: 'geometricFigure',
      elements: [
        element('a', 'point', 'A'),
        element('b', 'point', 'B'),
        element('p', 'point', 'P', { relation: 'on AB' }),
        element('ab', 'line', 'AB'),
      ],
    })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.note).toContain('representative')
  })

  it('names a duplicate label instead of quietly overwriting the first point', () => {
    const built = buildGeometry({
      variant: 'geometricFigure',
      elements: [element('a', 'point', 'A'), element('a2', 'point', 'A')],
    })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.unplaced.map((u) => u.id)).toEqual(['a2'])
  })

  it('names a line whose ends it cannot resolve', () => {
    const built = buildGeometry({
      variant: 'geometricFigure',
      elements: [element('a', 'point', 'A'), element('zz', 'line', 'the base')],
    })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.unplaced.map((u) => u.id)).toEqual(['zz'])
  })

  it('refuses a figure with no points at all', () => {
    const built = buildGeometry({
      variant: 'geometricFigure',
      elements: [element('l', 'line', 'a line')],
    })
    expect(built.ok).toBe(false)
  })

  it('spreads canonical slots without putting two points in one place', () => {
    for (const count of [1, 2, 3, 4, 5, 6]) {
      const slots = Array.from({ length: count }, (_, i) => canonicalSlot(i, count))
      const seen = new Set(slots.map((s) => `${round(s.x)}|${round(s.y)}`))
      expect(seen.size, `${count} points`).toBe(count)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* 11. The small parsers                                                       */
/* -------------------------------------------------------------------------- */

describe('the parsers read what was written', () => {
  it('reads a coordinate pair and the origin', () => {
    expect(coordsFrom('at (3, -4)')).toEqual({ x: 3, y: -4 })
    expect(coordsFrom('at the origin')).toEqual({ x: 0, y: 0 })
    expect(coordsFrom('somewhere up there')).toBeNull()
    expect(coordsFrom(undefined)).toBeNull()
  })

  it('reads every number in order, negatives and decimals included', () => {
    expect(numbersIn('between -2.5 and 7')).toEqual([-2.5, 7])
    expect(numbersIn(undefined)).toEqual([])
  })

  it('draws the shorter arc between two directions', () => {
    /* The reflex arc would enclose the wrong angle, and an angle mark that
       shows the outside of the corner is a different claim. */
    const d = arcPath(0, 0, 10, 0, (3 * Math.PI) / 2)
    expect(d).toContain('A 10 10 0 0 0')
  })
})

/* -------------------------------------------------------------------------- */
/* 12. Words                                                                   */
/* -------------------------------------------------------------------------- */

describe('the construction is available as a sentence', () => {
  it('names the variant and every element it was given', () => {
    const text = describeGeometry(vectors('freeBodyDiagram'))
    expect(text).toContain('freeBodyDiagram')
    expect(text).toContain('weight')
    expect(text).toContain('270°')
  })

  it('says how many were left out rather than truncating in silence', () => {
    const many: GeometryData = {
      variant: 'numberLine',
      elements: Array.from({ length: 30 }, (_, i) => element(`p${i}`, 'point', `p${i}`, { magnitude: i })),
    }
    expect(describeGeometry(many)).toContain('and 6 more')
  })
})

/* -------------------------------------------------------------------------- */
/* 13. The rules the source itself is under                                    */
/* -------------------------------------------------------------------------- */

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

describe('the renderer obeys the rules it was written under', () => {
  it('strips comments the way these checks assume', () => {
    expect(withoutComments('a /* Math.random */ b')).toBe('a  b')
    expect(withoutComments('const x = Math.random()')).toContain('Math.random')
  })

  it('contains no raw colour anywhere — Law 4', () => {
    expect(geometrySource).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(geometrySource).not.toMatch(/\brgba?\(/)
    expect(geometrySource).not.toMatch(/\bhsla?\(/)
  })

  it('takes every painted value from the token layer or a role resolver', () => {
    const code = withoutComments(geometrySource)
    for (const match of code.matchAll(/(?:stroke|fill)=\{?"?([^"}\s]+)/g)) {
      const value = match[1] ?? ''
      expect(
        value === 'none' || value.startsWith('tokens.') || /^(strokeFor|fillFor)\(/.test(value),
        `painted with ${value}`,
      ).toBe(true)
    }
  })

  /* A comment saying "deterministic" survives the commit that breaks it; a grep
     does not. Comments are stripped first, so the file may explain the rule. */
  it('reaches for no clock, no random number and no measurement', () => {
    const code = withoutComments(geometrySource)
    expect(code).not.toMatch(/\bMath\.random\b/)
    expect(code).not.toMatch(/\bDate\.now\b/)
    expect(code).not.toMatch(/\bnew Date\b/)
    expect(code).not.toMatch(/\bperformance\.now\b/)
    expect(code).not.toMatch(/\bdocument\./)
    expect(code).not.toMatch(/getBoundingClientRect|getComputedStyle|measureText/)
  })

  it('never applies the bloom filter, which silently erases a flat path', () => {
    expect(geometrySource).not.toMatch(/url\(#lc-bloom\)/)
  })
})

/* -------------------------------------------------------------------------- */
/* 14. One smoke render                                                        */
/* -------------------------------------------------------------------------- */

/*
 * The builders are where the thinking is and where the rest of this file looks.
 * This is the one thing a pure-function test cannot catch: a component that
 * throws, or that puts a NaN into an attribute — which blanks the element with
 * no error in the console and no mark on the page.
 */
describe('the component', () => {
  it.each(VARIANTS)('renders %s to markup with no NaN in any attribute', (variant) => {
    const html = renderToStaticMarkup(
      createElement(GeometryShape, { data: payloadFor(variant), at: 'block-1' }),
    )
    expect(html, variant).not.toContain('NaN')
    expect(html.length, variant).toBeGreaterThan(0)
  })

  it.each(DRAWN)('draws %s inside an svg', (variant) => {
    const html = renderToStaticMarkup(createElement(GeometryShape, { data: payloadFor(variant) }))
    expect(html, variant).toContain('<svg')
  })

  it.each(UNDRAWN)('shows %s as a panel that still lists the elements', (variant) => {
    const html = renderToStaticMarkup(createElement(GeometryShape, { data: payloadFor(variant) }))
    expect(html, variant).not.toContain('<svg')
    expect(html, variant).toContain('lc-refusal')
    /* Goal 2: content stays accessible even when it cannot be drawn. */
    expect(html, variant).toContain('220 Ω resistor')
  })

  it('puts the unplaced elements on the page rather than swallowing them', () => {
    const html = renderToStaticMarkup(
      createElement(GeometryShape, {
        data: {
          variant: 'numberLine',
          elements: [
            element('a', 'point', 'start', { magnitude: 0 }),
            element('b', 'point', 'a mystery point', { relation: 'further along' }),
          ],
        },
      }),
    )
    expect(html).toContain('Stated, but not placed')
    expect(html).toContain('a mystery point')
  })
})
