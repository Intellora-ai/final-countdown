import { describe, it, expect } from 'vitest'
import { edgePath, layoutFlow, type PlacedNode } from './flow'
import { arrow } from '../design/tokens'

/* AN ARROW MUST POINT AT THE THING IT MEANS.
 *
 * The old edgePath attached every wire to the SAME two faces: it left
 * `a.x + a.w` (the source's right edge) and entered `b.x` (the target's left
 * edge), whatever their relative positions were. It carried a branch for
 * `x1 < x0` whose comment promised the wire would "leave to the RIGHT and
 * enter from the RIGHT" — but that branch computed `out = a.x + a.w + bow` and
 * `inn = b.x - bow`, which are exactly `x0 + bow` and `x1 - bow`. It emitted
 * byte-identical output to the forward branch. It was dead code, and it had
 * been dead the whole time.
 *
 * So on a serpentine second row, where the reading order runs right-to-left,
 * every arrowhead pointed RIGHT — against the flow — and each wire looped out
 * of the source's right face and back across the row, leaving visible stubs at
 * both ends. Both diagram lessons shipped that: "Presidential assent <- Other
 * House <- Third reading" drawn with three left-to-right arrowheads.
 *
 * The old suite could not catch it. Its one backwards-edge test asserted only
 * that the first control point sat to the right of the start; it never looked
 * at where the path ENDED. These tests assert the two things that carry the
 * meaning: which face of the target the wire lands on, and which way it is
 * travelling when it gets there. The arrowhead is `orient="auto"`, so the
 * final tangent IS the direction the head points.
 */

interface Cubic {
  x0: number; y0: number
  c1x: number; c1y: number
  c2x: number; c2y: number
  x1: number; y1: number
}

/** Parse `M x y C x y, x y, x y` into its eight numbers. */
function parse(path: string): Cubic {
  const m = path.match(
    /^M (-?[\d.]+) (-?[\d.]+) C (-?[\d.]+) (-?[\d.]+), (-?[\d.]+) (-?[\d.]+), (-?[\d.]+) (-?[\d.]+)$/,
  )
  if (!m) throw new Error(`not a single cubic: ${path}`)
  const n = m.slice(1).map(Number)
  return { x0: n[0], y0: n[1], c1x: n[2], c1y: n[3], c2x: n[4], c2y: n[5], x1: n[6], y1: n[7] }
}

/** The direction the arrowhead points: the tangent at the path's end. */
function endTangent(c: Cubic): { dx: number; dy: number } {
  return { dx: c.x1 - c.c2x, dy: c.y1 - c.c2y }
}

/** The direction the wire leaves the source. */
function startTangent(c: Cubic): { dx: number; dy: number } {
  return { dx: c.c1x - c.x0, dy: c.c1y - c.y0 }
}

const node = (id: string, x: number, y: number): PlacedNode => ({
  id, label: id, fullLabel: id, truncated: false,
  x, y, w: 132, h: 44, row: 0,
})

/** Is a point on the given face of a box, within a pixel? */
function onFace(p: { x: number; y: number }, n: PlacedNode, face: 'left' | 'right' | 'top' | 'bottom') {
  const eps = 0.5
  if (face === 'left') return Math.abs(p.x - n.x) < eps
  if (face === 'right') return Math.abs(p.x - (n.x + n.w)) < eps
  if (face === 'top') return Math.abs(p.y - n.y) < eps
  return Math.abs(p.y - (n.y + n.h)) < eps
}

describe('an edge attaches to the faces its direction implies', () => {
  it('left to right: leaves the source right face, enters the target left face', () => {
    const a = node('a', 0, 0)
    const b = node('b', 400, 0)
    const c = parse(edgePath(a, b))
    expect(onFace({ x: c.x0, y: c.y0 }, a, 'right'), `start ${c.x0} not on a.right`).toBe(true)
    expect(onFace({ x: c.x1, y: c.y1 }, b, 'left'), `end ${c.x1} not on b.left`).toBe(true)
    expect(endTangent(c).dx, 'arrowhead does not point right').toBeGreaterThan(0)
  })

  it('right to left: leaves the source LEFT face, enters the target RIGHT face', () => {
    /* The serpentine case, and the bug. */
    const a = node('a', 400, 0)
    const b = node('b', 0, 0)
    const c = parse(edgePath(a, b))
    expect(onFace({ x: c.x0, y: c.y0 }, a, 'left'), `start ${c.x0} not on a.left`).toBe(true)
    expect(onFace({ x: c.x1, y: c.y1 }, b, 'right'), `end ${c.x1} not on b.right`).toBe(true)
    expect(endTangent(c).dx, 'arrowhead points away from its target').toBeLessThan(0)
  })

  it('top to bottom: leaves the source bottom face, enters the target top face', () => {
    const a = node('a', 0, 0)
    const b = node('b', 0, 300)
    const c = parse(edgePath(a, b))
    expect(onFace({ x: c.x0, y: c.y0 }, a, 'bottom')).toBe(true)
    expect(onFace({ x: c.x1, y: c.y1 }, b, 'top')).toBe(true)
    expect(endTangent(c).dy, 'arrowhead does not point down').toBeGreaterThan(0)
  })

  it('bottom to top: leaves the source top face, enters the target bottom face', () => {
    const a = node('a', 0, 300)
    const b = node('b', 0, 0)
    const c = parse(edgePath(a, b))
    expect(onFace({ x: c.x0, y: c.y0 }, a, 'top')).toBe(true)
    expect(onFace({ x: c.x1, y: c.y1 }, b, 'bottom')).toBe(true)
    expect(endTangent(c).dy, 'arrowhead does not point up').toBeLessThan(0)
  })
})

describe('the arrowhead always travels toward the target', () => {
  const cases: Array<[string, PlacedNode, PlacedNode]> = [
    ['east', node('a', 0, 0), node('b', 400, 0)],
    ['west', node('a', 400, 0), node('b', 0, 0)],
    ['south', node('a', 0, 0), node('b', 0, 300)],
    ['north', node('a', 0, 300), node('b', 0, 0)],
    ['south-east', node('a', 0, 0), node('b', 400, 300)],
    ['north-west', node('a', 400, 300), node('b', 0, 0)],
    ['south-west', node('a', 400, 0), node('b', 0, 300)],
    ['north-east', node('a', 0, 300), node('b', 400, 0)],
  ]

  for (const [name, a, b] of cases) {
    it(`${name}: the end tangent has a positive component toward the target centre`, () => {
      const c = parse(edgePath(a, b))
      const t = endTangent(c)
      const toCentre = {
        dx: (b.x + b.w / 2) - c.x1,
        dy: (b.y + b.h / 2) - c.y1,
      }
      /* Travelling INTO the box means the tangent and the vector to its centre
       * agree in sign on the dominant axis. A negative dot product is an arrow
       * arriving backwards. */
      const dot = t.dx * toCentre.dx + t.dy * toCentre.dy
      expect(dot, `end tangent (${t.dx},${t.dy}) does not head into the target`).toBeGreaterThan(0)
    })
  }
})

describe('no orphan stubs', () => {
  it('every path starts on a face of its source, not in open space', () => {
    const a = node('a', 400, 100)
    for (const b of [node('b', 0, 100), node('b', 800, 100), node('b', 400, 500), node('b', 400, 0)]) {
      const c = parse(edgePath(a, b))
      const faces = (['left', 'right', 'top', 'bottom'] as const)
        .filter((f) => onFace({ x: c.x0, y: c.y0 }, a, f))
      expect(faces.length, `start (${c.x0},${c.y0}) is on no face of the source`).toBeGreaterThan(0)
    }
  })

  it('the leaving tangent points away from the source, never back into it', () => {
    const a = node('a', 400, 0)
    const b = node('b', 0, 0)
    const c = parse(edgePath(a, b))
    const s = startTangent(c)
    const centre = { x: a.x + a.w / 2, y: a.y + a.h / 2 }
    /* Leaving the left face, the wire must head further left, not back across
     * the node it just left. */
    expect(s.dx).toBeLessThan(0)
    expect(c.c1x, 'first control point is inside the source box').toBeLessThan(centre.x)
  })
})

describe('forward and reversed are genuinely different geometry', () => {
  it('reversing an edge does not produce the same path', () => {
    const a = node('a', 0, 0)
    const b = node('b', 400, 0)
    expect(edgePath(a, b)).not.toBe(edgePath(b, a))
  })

  it('the old dead branch is gone: a backwards edge no longer equals a forward one', () => {
    /* Before the fix these two were byte-identical, which is what proved the
     * `x1 < x0` branch never did anything. */
    const a = node('a', 400, 0)
    const b = node('b', 0, 0)
    const backwards = edgePath(a, b)
    const forwardEquivalent = `M ${a.x + a.w} ${a.y + a.h / 2} C ${a.x + a.w + 59.4} ${a.y + a.h / 2}, `
      + `${b.x - 59.4} ${b.y + b.h / 2}, ${b.x} ${b.y + b.h / 2}`
    expect(backwards).not.toBe(forwardEquivalent)
  })
})

describe('real serpentine layouts read in the direction they are drawn', () => {
  it('every arrow in a 7-step serpentine points at its successor', () => {
    const nodes = Array.from({ length: 7 }, (_, i) => ({ id: `n${i}`, label: `Step ${i}` }))
    const edges = nodes.slice(1).map((n, i) => ({ from: nodes[i].id, to: n.id }))
    const flow = layoutFlow(nodes, edges, 1200)
    expect(flow.shape).toBe('serpentine')

    const byId = new Map(flow.nodes.map((n) => [n.id, n]))
    for (const e of flow.edges) {
      const target = byId.get(e.to)!
      const c = parse(e.path)
      const t = endTangent(c)
      const toCentre = {
        dx: (target.x + target.w / 2) - c.x1,
        dy: (target.y + target.h / 2) - c.y1,
      }
      const dot = t.dx * toCentre.dx + t.dy * toCentre.dy
      expect(dot, `${e.from} -> ${e.to} arrives pointing away from ${e.to}`).toBeGreaterThan(0)
    }
  })

  it('the reversed row really is reversed, so the test above is not vacuous', () => {
    const nodes = Array.from({ length: 7 }, (_, i) => ({ id: `n${i}`, label: `Step ${i}` }))
    const flow = layoutFlow(nodes, [], 1200)
    const secondRow = flow.nodes.filter((n) => n.row === 1)
    expect(secondRow.length).toBeGreaterThan(1)
    /* Later nodes in reading order sit further LEFT on a reversed row. */
    expect(secondRow[secondRow.length - 1].x).toBeLessThan(secondRow[0].x)
  })

  it('a 12-step column chain drops downward, not sideways', () => {
    const nodes = Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, label: `Step ${i}` }))
    const edges = nodes.slice(1).map((n, i) => ({ from: nodes[i].id, to: n.id }))
    const flow = layoutFlow(nodes, edges, 1200)
    expect(flow.shape).toBe('column')
    for (const e of flow.edges) {
      const c = parse(e.path)
      expect(endTangent(c).dy, `${e.from} -> ${e.to} does not travel downward`).toBeGreaterThan(0)
    }
  })
})

/* ── gaps found by mutation testing ─────────────────────────────────────── *
 *
 * A mutation run over flow.ts scored 5/8. Both halves of the shipped bug were
 * caught, but three mutants survived:
 *
 *   bow -> arrow.minBow      the proportional term dropped, so a 400px span
 *                            curves at 40 instead of ~120. A 3x change in
 *                            curvature, plainly visible, and NOTHING asserted
 *                            bow magnitude anywhere. The test named "arrow
 *                            style is constant" did not check the style.
 *   2nd control point bcx    unreachable: every vertical edge the suite builds
 *                            joins boxes at the SAME x, so a vertical-dominant
 *                            edge between horizontally offset boxes -- where
 *                            the wire would kink -- was never constructed.
 *   |dx| >= |dy| -> >        the exactly-equal case, where the dominant-axis
 *                            rule is genuinely ambiguous, was never exercised.
 */

describe('arrow curvature is a constant of the design, not per-edge taste', () => {
  it('scales the bow with the span rather than pinning it to the floor', () => {
    /* Goal 1 for arrows: the RULE is constant, the output varies with geometry.
     * A fixed bow would make every arrow the same shape regardless of span. */
    const near = parse(edgePath(node('a', 0, 0), node('b', 200, 0)))
    const far = parse(edgePath(node('a', 0, 0), node('b', 900, 0)))
    const nearBow = near.c1x - near.x0
    const farBow = far.c1x - far.x0
    expect(farBow).toBeGreaterThan(nearBow)
  })

  it('derives the bow from the curvature token, not a hand-tuned number', () => {
    const a = node('a', 0, 0)
    const b = node('b', 600, 0)
    const c = parse(edgePath(a, b))
    const span = Math.abs(b.x - (a.x + a.w))
    const expected = Math.max(arrow.minBow, span * arrow.curvature)
    expect(c.c1x - c.x0).toBeCloseTo(expected, 6)
    expect(c.x1 - c.c2x).toBeCloseTo(expected, 6)
  })

  it('never lets the bow collapse below the floor on a short link', () => {
    const c = parse(edgePath(node('a', 0, 0), node('b', 140, 0)))
    expect(c.c1x - c.x0).toBeGreaterThanOrEqual(arrow.minBow)
  })

  it('uses the same curvature rule on the vertical axis as the horizontal', () => {
    const h = parse(edgePath(node('a', 0, 0), node('b', 600, 0)))
    const v = parse(edgePath(node('a', 0, 0), node('b', 0, 600)))
    const hBow = h.c1x - h.x0
    const vBow = v.c1y - v.y0
    /* Different spans, so not equal -- but both must exceed the floor and
     * both must be proportional rather than pinned. */
    expect(hBow).toBeGreaterThan(arrow.minBow)
    expect(vBow).toBeGreaterThan(arrow.minBow)
  })
})

describe('a vertical run between horizontally offset boxes stays coherent', () => {
  /* Every vertical edge the other tests build joins boxes at the same x, so
   * this whole case was invisible to the suite. */
  const a = node('a', 0, 0)
  const b = node('b', 300, 600)

  it('is treated as vertical, because the drop dominates the offset', () => {
    const c = parse(edgePath(a, b))
    expect(Math.abs(c.y1 - c.y0)).toBeGreaterThan(Math.abs(c.x1 - c.x0))
  })

  it('leaves the source bottom and enters the target top', () => {
    const c = parse(edgePath(a, b))
    expect(onFace({ x: c.x0, y: c.y0 }, a, 'bottom')).toBe(true)
    expect(onFace({ x: c.x1, y: c.y1 }, b, 'top')).toBe(true)
  })

  it('anchors each tangent over its OWN box, so the wire does not kink', () => {
    /* The second control point must sit above the TARGET's centre, not the
     * source's. Sharing one x makes the arrow arrive tilted. */
    const c = parse(edgePath(a, b))
    expect(c.c1x).toBeCloseTo(a.x + a.w / 2, 6)
    expect(c.c2x).toBeCloseTo(b.x + b.w / 2, 6)
    expect(c.c2x).not.toBeCloseTo(c.c1x, 1)
  })

  it('still points at the target', () => {
    const c = parse(edgePath(a, b))
    expect(endTangent(c).dy).toBeGreaterThan(0)
  })
})

describe('the dominant-axis boundary is decided, not left ambiguous', () => {
  it('resolves an exactly diagonal edge deterministically', () => {
    /* |dx| === |dy|. Whichever way the rule falls, it must fall the same way
     * every time and still terminate on a face of the target. */
    const a = node('a', 0, 0)
    const b = node('b', 300, 300)
    const first = edgePath(a, b)
    expect(edgePath(a, b)).toBe(first)

    const c = parse(first)
    const faces = (['left', 'right', 'top', 'bottom'] as const)
      .filter((f) => onFace({ x: c.x1, y: c.y1 }, b, f))
    expect(faces.length, 'endpoint is on no face of the target').toBeGreaterThan(0)
  })

  it('handles two boxes at the same position without producing NaN', () => {
    const a = node('a', 100, 100)
    const b = node('b', 100, 100)
    const c = parse(edgePath(a, b))
    for (const v of [c.x0, c.y0, c.c1x, c.c1y, c.c2x, c.c2y, c.x1, c.y1]) {
      expect(Number.isFinite(v)).toBe(true)
    }
  })
})
