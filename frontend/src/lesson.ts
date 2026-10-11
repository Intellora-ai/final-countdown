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
export type Lesson = z.infer<typeof lessonSchema>
export const requestSchema = z.object({
  question: text.max(1000),
  previous: lessonSchema.optional(),
  memory: z.array(z.object({ question: text.max(1000), lesson: lessonSchema })).max(8).default([]),
})

export const lessonInstructions = `Respond directly to the person in natural language. Match their question and level; acknowledge uncertainty. Casual conversation needs only a short reply, without a title, visual, or quiz. For teaching, explain the idea with a concise example; use short paragraphs and put detailed structure in blocks instead of repeating it in prose.
Return a JSON object matching the provided schema. explanation is the answer, title is optional. blocks and check are optional: use them only when they help. When the user asks for a drawing, include actual scene geometry in blocks; never claim a drawing exists if blocks is empty. A check is one short practice question, never a description of what you intend to draw. All text is plain text. Never narrate the user's intent in third person.
Use a scene for a spatial sketch, a math block {kind:"math",title,latex} for typeset equations, and a diagram for relationships (the browser automatically arranges nodes and connections; supply meanings, not coordinates), steps for a process, comparison for alternatives, and chart for quantities. Layout is yours, not a fixed subject template. Give each scene enough space and avoid overlapping labels. Use hex colors with strong contrast on a dark board. For revisions return the complete updated board, including parts that should remain. Chart values must come from supplied facts or an explicitly labeled example. Do not claim to search, read files, or run tools; those capabilities are not connected to this conversation.
Drawing contract: a scene block is {kind:"scene",title,width,height,elements:[...]}. Choose elements from:
{type:"text",x,y,label,fontSize,width}; {type:"rect",x,y,width,height,label}; {type:"circle",x,y,radius,label}; {type:"line",x1,y1,x2,y2,label}; {type:"arrow",x1,y1,x2,y2,label}; {type:"path",d}; {type:"plot",expression,x,y,width,height,xMin,xMax,yMin,yMax}. Optional color is a hex string. Shape labels are optional. Coordinates are pixels; text y is its baseline. For regular polygons use {type:"polygon",x,y,radius,sides,rotation,label}: the browser computes exactly that many vertices; rotation is degrees and defaults to a top vertex. Use this instead of guessing paths for regular geometry. Never substitute a rectangular box for another requested shape. For typeset equations in scenes use {type:"math",x,y,latex,width,height,fontSize}; latex is TeX notation without dollar delimiters. Use math typesetting for fractions, roots, matrices and equations instead of cramming them into plain text. Path d is SVG geometry such as M/L for points, C/Q for curves, Z to close; never markup or scripts. Plots use x, + - * / ^ or **, parentheses, sin, cos, tan, abs, sqrt, exp, log/ln, pi or e; the browser computes points. Use explicit multiplication, e.g. 2*x.`
