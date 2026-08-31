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
  /**
   * Why the previous attempt was refused, verbatim from `validateLesson`.
   *
   * WHY THIS EXISTS RATHER THAN A LONGER SYSTEM PROMPT.
   *     There are 29 teaching rules. A model that has never seen them breaks
   *     one or two per lesson, and each one is a refusal the student reads as
   *     "the app is broken". Measured 2026-08-31 against gpt-oss-120b: five
   *     different rules broken across six attempts, no two the same.
   *
   *     Naming all 29 in the prompt is the obvious move and it is the wrong
   *     one: it makes every request larger and slower for every provider, and
   *     it still misses the thirtieth. Handing back the ACTUAL failure is
   *     smaller, exact, and covers a rule added next month for free.
   */
  readonly corrections?: readonly string[]
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
/*
 * `summary` IS HERE BECAUSE THE GATE REQUIRES ONE.
 *
 * `validateLesson` refuses a taught lesson that does not close with a summary
 * (`no-summary`) and one that never opens with a definition (`no-definition`).
 * Neither was expressible here: there was no `summary` kind and no `role`
 * field, so EVERY lesson this server asked a model for was refused on arrival
 * and `/api/lesson` answered 502 whatever the model wrote. A schema that
 * cannot express what the gate demands is a guaranteed 502, not a safeguard.
 *
 * `chart`, `flow`, `simulation` and `figure` stay closed for the reason given
 * below — they carry data a model would have to invent. `table` is open and is
 * a representation, so "show something rather than telling it" is reachable
 * without inviting an invented axis.
 */
export const ALLOWED_BLOCK_KINDS = ['prose', 'callout', 'metric', 'equation', 'table', 'summary'] as const

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
        /* `body` is no longer universally required: a `summary` carries a
           progression and a mental model instead, and demanding a body of it
           would make the one kind the gate insists on impossible to write.
           Zod still enforces the per-kind shape on arrival. */
        required: ['id', 'kind'],
        properties: {
          id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$', maxLength: 64 },
          kind: { type: 'string', enum: [...ALLOWED_BLOCK_KINDS] },
          title: { type: 'string', maxLength: 120 },
          /* What job the block does. The gate reads this to find the opening
             definition and the closing summary; without it neither can be
             located and both rules fire on every lesson. */
          role: {
            type: 'string',
            enum: [
              'anchor', 'definition', 'framework', 'classification', 'component',
              'example', 'misconception', 'rule', 'restriction', 'notation',
              'contrast', 'support', 'summary',
            ],
          },
          emphasis: { type: 'string', enum: ['primary', 'supporting', 'aside'] },
          tone: { type: 'string', enum: ['neutral', 'insight', 'warning', 'result'] },

          /* prose and callout */
          body: { type: 'string', minLength: 1, maxLength: 2000 },

          /* The words worth remembering. A block of more than ten words that
             marks nothing is refused: nothing in it survives a skim. */
          terms: {
            type: 'array', maxItems: 6,
            items: {
              type: 'object', additionalProperties: false,
              required: ['text', 'mark'],
              properties: {
                text: { type: 'string', minLength: 1, maxLength: 120 },
                mark: { type: 'string', enum: ['key', 'distinction'] },
              },
            },
          },

          /* summary — how to redo it, and the one sentence to keep. */
          progression: {
            type: 'array', minItems: 2, maxItems: 8,
            items: { type: 'string', minLength: 1, maxLength: 120 },
          },
          mentalModel: { type: 'string', minLength: 1, maxLength: 120 },

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
  '  prose     running explanation, and what to use when unsure',
  '  callout   one short point that must not be missed',
  '  metric    a single measured number that carries the idea',
  '  equation  mathematics, as LaTeX. Never write a formula out in a sentence',
  '            when it is the thing being taught.',
  '  table     two or more things compared on the same criteria',
  '  summary   the last block: how to redo it, and the one line to keep',
  '',
  'A comparison written as three paragraphs is harder to read than a table with',
  'three rows, and a formula spelled out in words is harder than the formula.',
  '',
  /*
   * THESE SIX ARE NOT STYLE ADVICE. Each is a rule `validateLesson` enforces,
   * and a lesson breaking any of them is refused before the student sees it —
   * so a prompt that does not state them is a prompt that produces 502s.
   */
  'The shape every lesson must have. A lesson missing any of these is rejected',
  'and the student sees nothing:',
  '',
  '  1. OPEN WITH A DEFINITION. The first block sets role "definition" and says',
  '     the simplest true sentence about the topic, in plain words, in under',
  '     thirty. Name the topic in that first sentence. Do not use a technical',
  '     term in it — the idea lands first, the vocabulary after.',
  '',
  '  2. CLOSE WITH A SUMMARY. The last block has kind "summary" and role',
  '     "summary": a progression of two to eight short steps, and one sentence',
  '     worth keeping as mentalModel.',
  '',
  '  3. SHOW SOMETHING, do not only tell it. At least one table. A lesson that',
  '     is all words is rejected.',
  '',
  '  4. JOIN WHAT YOU SHOW. Every table needs a relation connecting it to a',
  '     block that talks about it. A table nothing refers to is decoration.',
  '',
  '  5. BREAK LONG TEXT. Never more than thirty words in one go: put a blank',
  '     line in every two or three lines. Write as much as the idea needs, but',
  '     give the reader somewhere to breathe.',
  '',
  '  6. MARK WHAT MATTERS. In any block over ten words, mark the term worth',
  '     remembering with terms: [{text, mark: "key"}], or the one that',
  '     separates two confusable things with mark "distinction". The marked',
  '     text must appear in that block word for word.',
].join('\n')

/** What the previous attempt broke, phrased as work to do rather than blame. */
function corrective(brief: LessonBrief): string {
  const notes = brief.corrections ?? []
  if (notes.length === 0) return ''
  return (
    `\n\nYOUR PREVIOUS ATTEMPT WAS REFUSED. Fix every one of these and return ` +
    `the whole lesson again:\n${notes.map((note) => `- ${note}`).join('\n')}`
  )
}

export function briefFor(brief: LessonBrief): string {
  if (typeof brief.question === 'string' && brief.question.trim() !== '') {
    return `A student asked: ${brief.question}\n\nAnswer it directly and plainly.${corrective(brief)}`
  }
  const subject = brief.subject ? ` (${brief.subject})` : ''
  /* The strategy arrives as an INSTRUCTION, never as its own name. "Use the
   * strategy worked_example" tells a model nothing it can act on, and a brief
   * the model cannot act on is a strategy that was decided and then thrown
   * away. */
  const how =
    brief.strategy === undefined ? '' : `\n\nTeach it this way: ${instructionFor(brief.strategy)}`
  return `Teach this one concept${subject}: ${brief.concept}\n\nAssume nothing beyond it has been taught yet.${how}${corrective(brief)}`
}
