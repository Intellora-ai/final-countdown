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
const parameter = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,30}$/).refine(id => !['pi', 'e', 'sin', 'cos', 'tan', 'abs', 'sqrt', 'exp', 'log', 'ln'].includes(id)),
  label: text, min: coordinate, max: coordinate, value: coordinate, step: size,
}).refine(p => p.min < p.max && p.value >= p.min && p.value <= p.max && p.step <= p.max - p.min, 'Control ranges and defaults must be valid.')
const artwork = z.object({ kind: z.literal('svg'), title: text, source: z.string().trim().min(1).max(40000), parameters: z.array(parameter).max(12).optional() })
  .refine(block => new Set(block.parameters?.map(p => p.id)).size === (block.parameters?.length ?? 0), 'Control IDs must be unique.')
export const lessonSchema = z.object({
  title: text.optional(),
  explanation: text,
  blocks: z.array(z.union([
    diagram,
    scene,
    artwork,
    z.object({ kind: z.literal('math'), title: text, latex: text }),
    z.object({ kind: z.literal('steps'), title: text, items: z.array(text).min(2).max(8) }),
    z.object({ kind: z.literal('comparison'), title: text, columns: z.tuple([text, text]), rows: z.array(z.tuple([text, text])).min(2).max(8) }),
    z.object({ kind: z.literal('chart'), title: text, unit: text, points: z.array(z.object({ label: text, value: z.number().finite().nonnegative() })).min(2).max(8) }),
  ])).max(12).default([]),
  check: text.optional(),
})
// Saved boards retain their original renderers. New replies are only text and
// optional general SVG canvases: the model decides when a visual is useful.
export const modelLessonSchema = z.object({
  title: text.optional(), explanation: text,
  blocks: z.array(artwork).max(12).default([]),
})
export type Lesson = z.infer<typeof lessonSchema>
export const requestSchema = z.object({
  question: text.max(1000),
  previous: lessonSchema.optional(),
  memory: z.array(z.object({ question: text.max(1000), lesson: lessonSchema })).max(8).default([]),
})

export const lessonInstructions = `Respond naturally to the person and their request. You decide whether to converse, explain, teach or draw; no lesson format, quiz or visual is mandatory. Be accurate and acknowledge uncertainty. Do not claim unavailable tools or actions.
Return JSON matching the response schema: explanation is a readable transcript for accessibility and spoken output, not a separate visible chat answer. title is optional. Place the complete visible answer—words, equations, annotations and drawings—on the SVG canvas. For short conversational replies, a few handwritten words are enough. Do not omit the actual written explanation from the canvas. For visuals use svg blocks with a complete SVG source and finite positive viewBox. Draw actual content, not promises to draw. Revisions contain the complete updated artwork. Use clear composition, readable handwritten text (font-family="cursive"), annotations, varied line weights and meaningful color on an explicit warm-paper background. Keep SVG definitions local; use presentation attributes, not scripts, HTML, CSS stylesheets, external resources or animation.
Optional parameters define sliders {id,label,min,max,value,step}. Numeric {{expressions}} in SVG attributes/text may reference those IDs, arithmetic, sin/cos/tan/abs/sqrt/exp/log/ln, pi and e. They run locally without JavaScript. Use controls only when helpful.`
