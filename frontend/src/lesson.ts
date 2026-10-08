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
export const lessonSchema = z.object({
  title: text,
  explanation: text,
  blocks: z.array(z.union([
    diagram,
    z.object({ kind: z.literal('steps'), title: text, items: z.array(text).min(2).max(8) }),
    z.object({ kind: z.literal('comparison'), title: text, columns: z.tuple([text, text]), rows: z.array(z.tuple([text, text])).min(2).max(8) }),
    z.object({ kind: z.literal('chart'), title: text, unit: text, points: z.array(z.object({ label: text, value: z.number().finite().nonnegative() })).min(2).max(8) }),
  ])).max(4).default([]),
  check: text.optional(),
})
export type Lesson = z.infer<typeof lessonSchema>
export const requestSchema = z.object({ question: text.max(1000), previous: lessonSchema.optional() })

export const lessonInstructions = `Answer the student's actual question accurately, using the shortest explanation that resolves it. Answer directly before adding teaching material. State uncertainty instead of guessing. Use the previous explanation as context for follow-ups.
Visual blocks are optional. Add a diagram, steps, comparison, or chart only when it makes the answer easier to understand. Use no visual for a simple factual answer. Connect diagram edges only to distinct node IDs that exist in that diagram.
Never invent quantitative data: chart values must follow from the question or an explicitly stated example. Text is plain text. Include a check question only if the student wants practice or it helps them learn; otherwise omit it. Do not force a lesson or quiz onto a simple question.`
