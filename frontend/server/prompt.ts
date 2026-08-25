/* The prompt and the schema, shared by EVERY model provider.
 *
 * WHY THIS IS ITS OWN FILE
 *   There are two providers now -- Anthropic and a local Ollama -- and a
 *   lesson written by one must be the same KIND of thing as a lesson written by
 *   the other. If each carried its own prompt and its own schema, the two would
 *   describe different products within a month.
 *
 *   That is not a hypothetical: this project has already fixed the same shape
 *   three times in one session -- a skill list copied into four hooks, a
 *   curriculum described twice, a wire contract declared on both sides. Two
 *   descriptions of one thing is one thing and one future disagreement.
 *
 *   So the prompt lives here, and a provider supplies only the transport.
 */

import type { Strategy } from './teaching.ts'
import { instructionFor } from './teaching.ts'

/** What a provider is asked to produce a lesson FROM. */
export interface LessonBrief {
  /** How to teach it. Decided by the server's policy, never by the browser. */
  readonly strategy?: Strategy
  readonly concept?: string
  readonly subject?: string
  readonly question?: string
}

/**
 * The block kinds a model may produce.
 *
 * The canvas renders eight. This offers five, and the two it leaves out of the
 * teaching-useful ones are left out on purpose:
 *
 *   chart, flow, simulation  carry data a model would have to INVENT -- series
 *                            values, node graphs, physical parameters -- and an
 *                            invented number drawn as an axis is a lie a
 *                            student has no way to detect.
 *
 *   metric, equation, table  are shapes a model can fill correctly from the
 *                            topic alone. Without them every live lesson was
 *                            paragraphs on every subject: a quadratic formula
 *                            written out in a sentence, a three-way comparison
 *                            as three paragraphs.
 */
export const ALLOWED_BLOCK_KINDS = ['prose', 'callout', 'metric', 'equation', 'table'] as const

/** The subset of LessonSpec a model is allowed to produce. */
export const LESSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'question', 'blocks'],
  properties: {
    id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$', maxLength: 64 },
    question: { type: 'string', minLength: 1, maxLength: 200 },
    subject: { type: 'string', maxLength: 120 },
    blocks: {
      type: 'array',
      minItems: 1,
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'kind', 'body'],
        properties: {
          id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$', maxLength: 64 },
          kind: { type: 'string', enum: [...ALLOWED_BLOCK_KINDS] },
          title: { type: 'string', maxLength: 120 },
          emphasis: { type: 'string', enum: ['primary', 'supporting', 'aside'] },
          tone: { type: 'string', enum: ['neutral', 'insight', 'warning', 'result'] },

          /* prose and callout */
          body: { type: 'string', minLength: 1, maxLength: 2000 },

          /* metric — one measured number, said once and clearly */
          value: { type: ['number', 'string'] },
          unit: { type: 'string', minLength: 1, maxLength: 120 },
          delta: { type: 'number' },
          deltaMeaning: { type: 'string', enum: ['up-is-good', 'up-is-bad', 'neutral'] },

          /* equation — LaTeX, with the TERMS to draw the eye to. `highlight`
             names substrings, never glyph positions: a position is a place on
             a screen, and the model is not allowed to know about places. */
          latex: { type: 'string', minLength: 1, maxLength: 600 },
          highlight: {
            type: 'array', maxItems: 6,
            items: { type: 'string', minLength: 1, maxLength: 40 },
          },

          /* table — no alignment field, deliberately. The renderer aligns by
             COLUMN TYPE, and letting the author align a column is how a schema
             starts carrying layout one field at a time. */
          columns: {
            type: 'array', minItems: 1, maxItems: 8,
            items: {
              type: 'object', additionalProperties: false,
              required: ['key', 'label'],
              properties: {
                key: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$', maxLength: 64 },
                label: { type: 'string', minLength: 1, maxLength: 120 },
                type: { type: 'string', enum: ['text', 'number', 'percent', 'currency'] },
              },
            },
          },
          rows: {
            type: 'array', minItems: 1, maxItems: 200,
            items: { type: 'object' },
          },

          /* shared by metric, equation and table */
          caption: { type: 'string', minLength: 1, maxLength: 120 },
        },
      },
    },
    relations: {
      type: 'array',
      maxItems: 24,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'to', 'kind'],
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          kind: { type: 'string', enum: ['supports', 'derives', 'contrasts', 'exemplifies'] },
        },
      },
    },
  },
} as const

export const SYSTEM = [
  'You write one short lesson that teaches a single idea to a school student.',
  '',
  'You do not decide how anything looks. No colour, no font size, no spacing,',
  'no position, no width. Those belong to the renderer, and a lesson carrying',
  'any of them is rejected before it reaches the student.',
  '',
  'Use emphasis to say what matters most and tone to say what kind of point it',
  'is. Keep each block to one idea. Never number the parts of the lesson and',
  'never say how many there are.',
  '',
  'Choose the block kind that MATCHES THE IDEA, not the one that is easiest:',
  '  prose     running explanation. THE LAST RESORT, not the default: use it',
  '            only when the idea is none of the shapes below.',
  '  callout   one short point that must not be missed',
  '  metric    a single measured number that carries the idea',
  '  equation  mathematics, as LaTeX. Never write a formula out in a sentence',
  '            when it is the thing being taught.',
  '  table     two or more things compared on the same criteria',
  '',
  'A comparison written as three paragraphs is harder to read than a table with',
  'three rows, and a formula spelled out in words is harder than the formula.',
  '',
  'PLAIN FIRST. The first block teaches; it never announces. Do not open with',
  '"Here is", "In this lesson", "We will look at" or "start to finish" — a',
  'learner cannot do anything with a description of what is about to happen.',
  'Open with the thing itself: the situation, the number, or the mistake.',
  '',
  'Say the idea in everyday words BEFORE you name it. The name is a label for an',
  'idea the learner is already holding; arriving first, it has nothing to attach',
  'to. "You take 3 of the 4 pieces you cut. That is called a fraction." — never',
  'the other way round.',
  '',
  'Plain does not mean clever. A metaphor and an abstract noun cost the reader',
  'exactly what a technical term costs, because both have to be decoded first:',
  '  NO   "a count of parts you already made"   "a sum waiting to happen"',
  '  YES  "how many parts you have out of the total"   "a division problem"',
  'Test every sentence: can the learner immediately point at something, count',
  'something, or answer something? If not, rewrite it.',
  '',
  'Vary the shape. A lesson whose blocks are all prose has one possible layout,',
  'and twenty such lessons read as a template however well written each one is.',
  'A number is a metric. A comparison is a table. A formula is an equation.',
].join('\n')

export function briefFor(brief: LessonBrief): string {
  if (typeof brief.question === 'string' && brief.question.trim() !== '') {
    return `A student asked: ${brief.question}\n\nAnswer it directly and plainly.`
  }
  const subject = brief.subject ? ` (${brief.subject})` : ''
  /* The strategy arrives as an INSTRUCTION, never as its own name. "Use the
   * strategy worked_example" tells a model nothing it can act on, and a brief
   * the model cannot act on is a strategy that was decided and then thrown
   * away. */
  const how =
    brief.strategy === undefined ? '' : `\n\nTeach it this way: ${instructionFor(brief.strategy)}`
  return `Teach this one concept${subject}: ${brief.concept}\n\nAssume nothing beyond it has been taught yet.${how}`
}
