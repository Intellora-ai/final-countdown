import { z } from 'zod'
import { validPath } from './drawing'

export const MAX_REQUEST_BYTES = 64000

const text = z.string().trim().min(1).max(2000)
const node = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]+$/), label: text, detail: text.optional() })
const diagram = z.object({
  kind: z.literal('diagram'), title: text,
  nodes: z.array(node).min(2).max(64),
  edges: z.array(z.object({ from: text, to: text, label: text.optional() })).max(128),
}).superRefine((value, ctx) => {
  const ids = new Set(value.nodes.map(n => n.id))
  if (ids.size !== value.nodes.length || value.edges.some(e => !ids.has(e.from) || !ids.has(e.to))) {
    ctx.addIssue({ code: 'custom', message: 'Diagram connections must reference unique nodes.' })
  }
})
const coordinate = z.number().finite().min(-10000).max(10000)
const size = z.number().finite().positive().max(10000)
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const ink = { color: color.optional(), strokeWidth: z.number().min(0.5).max(20).optional() }
const label = { label: text.optional() }
const sceneElement = z.discriminatedUnion('type', [
  z.object({ type: z.literal('rect'), x: coordinate, y: coordinate, width: size, height: size, ...label, ...ink, fill: color.optional() }),
  z.object({ type: z.literal('circle'), x: coordinate, y: coordinate, radius: size, ...label, ...ink, fill: color.optional() }),
  z.object({ type: z.literal('line'), x1: coordinate, y1: coordinate, x2: coordinate, y2: coordinate, ...label, ...ink }),
  z.object({ type: z.literal('arrow'), x1: coordinate, y1: coordinate, x2: coordinate, y2: coordinate, ...label, ...ink }),
  z.object({ type: z.literal('text'), x: coordinate, y: coordinate, label: text, color: color.optional(), fontSize: z.number().min(12).max(96).optional(), width: size.optional() }),
  z.object({ type: z.literal('polygon'), x: coordinate, y: coordinate, radius: size, sides: z.number().int().min(3).max(100), rotation: z.number().finite().min(-360).max(360).optional(), ...label, ...ink, fill: color.optional() }),
  z.object({ type: z.literal('math'), x: coordinate, y: coordinate, latex: text, width: size.optional(), height: size.optional(), fontSize: z.number().min(12).max(96).optional() }),
  z.object({ type: z.literal('path'), d: z.string().max(20000).refine(validPath, 'Use valid SVG path geometry.'), ...ink, fill: color.optional() }),
  z.object({ type: z.literal('plot'), expression: z.string().trim().min(1).max(200), x: coordinate, y: coordinate, width: size, height: size, xMin: coordinate, xMax: coordinate, yMin: coordinate, yMax: coordinate, ...ink }),
])
const scene = z.object({ kind: z.literal('scene'), title: text, width: z.number().int().min(320).max(4000).default(800), height: z.number().int().min(200).max(8000).default(500), elements: z.array(sceneElement).min(1).max(200) }).superRefine((value, ctx) => {
  value.elements.forEach((element, i) => {
    if (element.type === 'plot' && (element.xMax <= element.xMin || element.yMax <= element.yMin)) ctx.addIssue({ code: 'custom', path: ['elements', i], message: 'Plot ranges must increase.' })
  })
})
export const lessonSchema = z.object({
  title: text.optional(),
  explanation: text,
  blocks: z.array(z.union([
    diagram,
    scene,
    z.object({ kind: z.literal('math'), title: text, latex: text }),
    z.object({ kind: z.literal('steps'), title: text, items: z.array(text).min(2).max(8) }),
    z.object({ kind: z.literal('comparison'), title: text, columns: z.tuple([text, text]), rows: z.array(z.tuple([text, text])).min(2).max(8) }),
    z.object({ kind: z.literal('chart'), title: text, unit: text, points: z.array(z.object({ label: text, value: z.number().finite().nonnegative() })).min(2).max(8) }),
  ])).max(12).default([]),
  check: text.optional(),
})
// Older saved templates remain readable, but new model output uses one drawing
// surface plus semantic layout and equation typesetting.
export const modelLessonSchema = lessonSchema.extend({
  blocks: z.array(z.union([diagram, scene, z.object({ kind: z.literal('math'), title: text, latex: text })])).max(12).default([]),
})
export type Lesson = z.infer<typeof lessonSchema>
export const requestSchema = z.object({
  question: text.max(1000),
  previous: lessonSchema.optional(),
  memory: z.array(z.object({ question: text.max(1000), lesson: lessonSchema })).max(8).default([]),
})

export const lessonInstructions = `Answer the person directly and naturally. Match their question and level; admit uncertainty. Casual conversation needs only a short explanation, without a title, drawing or quiz. Use visuals only when they clarify the answer or the person requests them. Do not repeat the drawing as a wall of prose or narrate the user's intent.
Return JSON matching the supplied schema. For a requested drawing, include real geometry rather than claiming to draw. For revisions return the complete updated board. Never invent measurements or claim unavailable search, file-reading or tools.
Use scene for freely composed drawings, diagram for connected ideas (the browser handles node placement), and math for TeX equations without dollar delimiters. Scenes support SVG paths and curves, shapes, arrows, text, computed plots and equations. Choose the composition from the content, not a subject template. Keep labels readable, leave whitespace and use colors contrasting with the dark board. Coordinates are pixels; text y is its baseline.
Use polygon for regular geometry: the browser computes its vertices. Use math for fractions, roots and matrices. Path d is numeric SVG geometry, never HTML or scripts. Plots support x, arithmetic, ^ or **, sin/cos/tan/abs/sqrt/exp/log/ln, pi and e; use explicit multiplication such as 2*x. The browser computes the curve.`
