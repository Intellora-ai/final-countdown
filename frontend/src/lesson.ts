import { z } from 'zod'

const text = z.string().trim().min(1).max(2000)
const node = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]+$/), label: text, detail: text.optional() })
const diagram = z.object({
  kind: z.literal('diagram'), title: text,
  nodes: z.array(node).min(2).max(8),
  edges: z.array(z.object({ from: text, to: text, label: text.optional() })).max(16),
}).superRefine((value, ctx) => {
  const ids = new Set(value.nodes.map(n => n.id))
  if (ids.size !== value.nodes.length || value.edges.some(e => !ids.has(e.from) || !ids.has(e.to))) {
    ctx.addIssue({ code: 'custom', message: 'Diagram connections must reference unique nodes.' })
  }
})
const sceneElement = z.discriminatedUnion('type', [
  z.object({ type: z.literal('rect'), x: z.number().finite().min(0).max(1200), y: z.number().finite().min(0).max(800), width: z.number().finite().positive().max(1200), height: z.number().finite().positive().max(800), label: text.optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }),
  z.object({ type: z.literal('circle'), x: z.number().finite().min(0).max(1200), y: z.number().finite().min(0).max(800), radius: z.number().finite().positive().max(400), label: text.optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }),
  z.object({ type: z.literal('line'), x1: z.number().finite().min(0).max(1200), y1: z.number().finite().min(0).max(800), x2: z.number().finite().min(0).max(1200), y2: z.number().finite().min(0).max(800), label: text.optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }),
  z.object({ type: z.literal('text'), x: z.number().finite().min(0).max(1200), y: z.number().finite().min(0).max(800), label: text, color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }),
])
const scene = z.object({ kind: z.literal('scene'), title: text, width: z.number().int().min(320).max(1200).default(800), height: z.number().int().min(200).max(800).default(500), elements: z.array(sceneElement).min(1).max(40) })
export const lessonSchema = z.object({
  title: text,
  explanation: text,
  blocks: z.array(z.union([
    diagram,
    scene,
    z.object({ kind: z.literal('steps'), title: text, items: z.array(text).min(2).max(8) }),
    z.object({ kind: z.literal('comparison'), title: text, columns: z.tuple([text, text]), rows: z.array(z.tuple([text, text])).min(2).max(8) }),
    z.object({ kind: z.literal('chart'), title: text, unit: text, points: z.array(z.object({ label: text, value: z.number().finite().nonnegative() })).min(2).max(8) }),
  ])).max(4).default([]),
  check: text.optional(),
})
export type Lesson = z.infer<typeof lessonSchema>
export const requestSchema = z.object({
  question: text.max(1000),
  previous: lessonSchema.optional(),
  memory: z.array(z.object({ question: text.max(1000), lesson: lessonSchema })).max(8).default([]),
})

export const lessonInstructions = `Solve the student's actual objective, not the loudest wording. Before answering, identify the objective, separate hard constraints from preferences, remove unnecessary assumptions, and use only the minimum context needed. Answer directly and naturally using the shortest response that fits the message. For greetings, jokes, thanks, or casual messages, reply like a person in one short sentence; never describe the student in third person, never say "the student responded", and never append a generic offer to help. Do not force a lesson onto casual conversation. State uncertainty instead of guessing. Use the previous explanation as context for follow-ups.
Visual blocks are optional. Add a diagram, scene, steps, comparison, or chart only when it makes the answer easier to understand. Use no visual for a simple factual answer. A scene is an editable native SVG made only from validated rect, circle, line, and text elements. For math or transformations, prefer a clean whiteboard layout: generous empty space, labeled axes or before/after regions, short handwritten-style labels, arrows, and highlighted rule cards. Never return HTML, CSS, JavaScript, or raw SVG markup. Connect diagram edges only to distinct node IDs that exist in that diagram.
Never invent quantitative data: chart values must follow from the question or an explicitly stated example. Text is plain text. Include a check question only if the student wants practice or it helps them learn; otherwise omit it. Do not force a lesson or quiz onto a simple question.`
