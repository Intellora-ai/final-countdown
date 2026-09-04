import { z } from 'zod'

import { FigureBlock } from './figure'
import { BlockRole } from './roles'

export { BlockRole } from './roles'

/**
 * The LessonSpec — the only thing a model is allowed to emit.
 *
 * THE SCHEMA IS THE LAW
 * ---------------------
 * Laws 1-3 say the author never draws, never positions, never styles. Written
 * as prose in a brief, those are wishes. Written as a schema with `.strict()`,
 * they are the difference between a lesson that renders and one that is
 * refused — because `.strict()` makes an unknown key a parse ERROR rather than
 * a silently ignored field.
 *
 * That distinction is the whole design. A permissive schema that drops `color`
 * on the floor still lets a model believe it chose the colour, and the next
 * model trained on those transcripts learns to keep sending it. Refusing is
 * what keeps the contract honest in both directions.
 *
 * WHAT THE AUTHOR DECIDES:  what exists, what it means, how blocks relate
 * WHAT THE AUTHOR NEVER DECIDES:  where anything goes, or what it looks like
 */

/* -------------------------------------------------------------------------- */
/* Semantic vocabulary — roles, never values                                  */
/* -------------------------------------------------------------------------- */

/**
 * How much of the reader's attention a block is asking for.
 *
 * Deliberately three words and not a number: a scale invites "emphasis: 7",
 * which is a design decision wearing a semantic costume. Three roles force the
 * author to say what the block IS to the argument, and let the design system
 * decide what that looks like.
 */
export const Emphasis = z.enum(['primary', 'supporting', 'aside'])
export type Emphasis = z.infer<typeof Emphasis>

/** Meaning, not colour. `warning` may render amber here and red elsewhere. */
export const Tone = z.enum(['neutral', 'insight', 'warning', 'result'])
export type Tone = z.infer<typeof Tone>

/**
 * WHY `BlockRole` IS ONE FIELD AND NOT NINE CHECKS
 * ------------------------------------------------
 * "Framework before detail", "simple before technical", "definition first",
 * "summary last", "do not mix a definition with a formula" read as five
 * separate rules and are one: every block says what job it does, and the order
 * those jobs may appear in is fixed. Five unrelated checks can each rot on
 * their own; one ordering over one field cannot. `teach/teaching.ts` is where
 * that ordering is enforced.
 *
 * The enum itself lives in `roles.ts` so `figure.ts` can reach it without
 * importing back from this file. See the note there.
 */

/**
 * A word the reader should carry away, and why it matters.
 *
 * NOT `bold: true`. That would be Law 3 straight through the front door. The
 * author says a term is KEY or that it carries a DISTINCTION; the design system
 * decides that key renders bold and a distinction renders bold and underlined.
 * Change that decision once in the stylesheet and every lesson follows, which is
 * the whole reason roles beat values.
 *
 * `text` must appear verbatim in the block's own body — checked in
 * `validate.ts`, because a term marked but absent is a term the reader never
 * sees emphasised and the author believes they emphasised.
 */
export const TermMark = z.enum(['key', 'distinction'])
export type TermMark = z.infer<typeof TermMark>

const MarkedTerm = z
  .object({ text: z.string().min(1).max(60), mark: TermMark })
  .strict()

/** Which token in the fixed series a data series takes. An INDEX, never a hex. */
export const SeriesIndex = z.number().int().min(0).max(5)

/**
 * The most blocks one lesson may have.
 *
 * Named rather than inline because the streaming reader needs the same number:
 * words arriving from the server are filed by block index, and an index no
 * lesson could ever have is the difference between a lesson and an allocation
 * the size of the number sent. See `CanvasRoute.tsx`, where a single frame
 * naming block 50,000,000 cost 1.5 seconds of the learner's main thread and
 * one naming 200,000,000 exhausted the heap.
 */
export const MOST_BLOCKS = 24

export const Id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'ids are lowercase kebab-case')

const Label = z.string().min(1).max(120)
const Prose = z.string().min(1).max(2000)

/* -------------------------------------------------------------------------- */
/* Blocks                                                                     */
/* -------------------------------------------------------------------------- */

const BlockBase = {
  id: Id,
  /** Shown as the block's heading. Optional: not every block needs one. */
  title: Label.optional(),
  emphasis: Emphasis.default('supporting'),
  tone: Tone.default('neutral'),
  /** The teaching job this block does. See `BlockRole`. */
  role: BlockRole.default('support'),
  /**
   * Whether this is the lesson, or something offered beyond it.
   *
   * DEPTH IS OPT-IN, AND THAT IS THE WHOLE POINT OF THE FIELD.
   *
   * A lesson that answers "what is a logarithm?" with eighteen blocks — the
   * product law, its derivation, the domain restrictions, a worked equation —
   * has not answered the question. It has delivered a chapter at someone who
   * asked one thing, and the learner has no way to stop it.
   *
   * `core` is the answer to the question asked. `deeper` is everything the
   * lesson COULD go on to, and it is never shown unless the learner says yes to
   * it BY NAME: the checkpoint at the end of the core asks "shall I go into the
   * product law?", not "continue".
   *
   * The rule this enforces, from the owner, verbatim: *never go to depth
   * without telling.*
   */
  depth: z.enum(['core', 'deeper']).default('core'),
}

/** Running text. The default block, and the one to prefer when unsure. */
export const ProseBlock = z
  .object({
    ...BlockBase,
    kind: z.literal('prose'),
    body: Prose,
    terms: z.array(MarkedTerm).max(6).default([]),
  })
  .strict()

/** A single idea worth pulling out of the flow. */
export const CalloutBlock = z
  .object({
    ...BlockBase,
    kind: z.literal('callout'),
    body: Prose,
    terms: z.array(MarkedTerm).max(6).default([]),
  })
  .strict()

/**
 * The mistake people actually make, corrected.
 *
 * THREE FIELDS, ALL REQUIRED, AND THAT IS THE POINT.
 *
 * "Show wrong plus correct, then briefly explain why" written as guidance
 * produces blocks with two of the three parts, because the third is the one
 * that takes thought. Written as three required fields it cannot be written
 * incompletely — the schema refuses a correction with no reason before anyone
 * has to notice it is missing.
 *
 * `wrong` and `right` are `Label`, so the cap is 120 characters. A wrong form
 * that needs a paragraph is not the isolated error a learner can recognise.
 */
export const MisconceptionBlock = z
  .object({
    ...BlockBase,
    kind: z.literal('misconception'),
    /** The error, written as the learner would write it. */
    wrong: Label,
    /**
     * The same thing, done correctly.
     *
     * NAMED `correct` AND NOT `right`, AND THAT WAS NOT A STYLE CHOICE.
     * `right` was the first name, and `validate.ts` refused the whole lesson
     * for it: `right` is in the appearance blocklist because CSS uses it to
     * position things. The gate was not wrong — the WORD is ambiguous to a
     * human reader too, meaning both "correct" and "the right-hand side". The
     * fix is the unambiguous name, not a hole in the appearance check.
     */
    correct: Label,
    /** Why. Held to the same word budget as any other chunk. */
    why: Prose,
    /**
     * The concrete thing that proves the wrong version wrong.
     *
     * The reference explanation does not merely say "log does not distribute
     * over addition". It shows log(2+3)=log5 against log2+log3=log6 and lets
     * the reader see the two disagree. A reason persuades; a counterexample
     * settles.
     *
     * Optional because not every error has a clean one — but where it exists,
     * leaving it out is leaving out the part that convinces.
     */
    counterexample: Label.optional(),
  })
  .strict()

/**
 * A claim, earned one justified step at a time.
 *
 * ONE BLOCK FOR A PROOF, A CAUSAL CHAIN, A MECHANISM AND A WORKED CASE.
 *
 * A derivation of the logarithm product law and a five-step chain from
 * chemical dependence to lost soil fertility look nothing alike on the page and
 * are the same object: an ordered sequence in which every step names what
 * licenses it. Modelling them separately would put the machinery that makes a
 * maths lesson rigorous out of reach of a history one, which is how a system
 * ends up good at one subject and useless at the rest.
 *
 * `because` IS REQUIRED, AND THAT IS THE WHOLE POINT.
 *
 * "Show your reasoning" as guidance produces chains of assertions with the
 * reasons left out, because the reasons are the part that takes work. As a
 * required field, a step nobody can justify cannot be written down at all.
 *
 * The reference explanation states the payoff of this directly: after proving
 * the product law rather than asserting it — "you are not memorising a random
 * rule". That sentence is only available to a lesson that did the derivation.
 */
export const ReasoningBlock = z
  .object({
    ...BlockBase,
    kind: z.literal('reasoning'),
    /**
     * `why` justifies a claim. `worked` applies it to one case.
     *
     * A mode, not a style: the renderer numbers a worked solution and does not
     * number a justification, because the steps of a worked case are things the
     * learner will repeat, and the steps of a proof are things they will not.
     */
    mode: z.enum(['why', 'worked']),
    /** What is being shown. The heading of the argument, not of the block. */
    claim: Label,
    steps: z
      .array(
        z
          .object({
            /** The state after this step, in words. Always present, and what a screen reader reads. */
            expression: Label,
            /** The same step as a formula, when it is one. Rendered by KaTeX. */
            latex: z.string().min(1).max(300).optional(),
            /** What licenses this step. Required: a step nobody can justify is not a step. */
            because: Label,
          })
          .strict(),
      )
      .min(2)
      .max(10),
    /** What the chain establishes. */
    therefore: Label,
  })
  .strict()

/**
 * The end of a lesson: how to redo it, and how to hold it.
 *
 * `progression` is ordered and needs at least two steps, because a
 * one-step progression is a restatement. `mentalModel` is the single sentence
 * the learner keeps once the detail has gone.
 */
export const SummaryBlock = z
  .object({
    ...BlockBase,
    kind: z.literal('summary'),
    /** The steps, in order. Rendered as a numbered progression with arrows. */
    progression: z.array(Label).min(2).max(6),
    /** One sentence to keep. Held to the same word budget as any other chunk. */
    mentalModel: Prose,
  })
  .strict()

/**
 * One number that matters, with its unit and an optional comparison.
 *
 * `delta` is the CHANGE, not a colour: the renderer decides that up-is-good
 * here and up-is-bad in a lesson about error rates, from `deltaMeaning`.
 */
export const MetricBlock = z
  .object({
    ...BlockBase,
    kind: z.literal('metric'),
    value: z.union([z.number(), z.string()]),
    unit: Label.optional(),
    delta: z.number().optional(),
    deltaMeaning: z.enum(['up-is-good', 'up-is-bad', 'neutral']).default('neutral'),
    caption: Label.optional(),
  })
  .strict()

/** LaTeX, rendered by KaTeX. `highlight` names TERMS, not glyph positions. */
export const EquationBlock = z
  .object({
    ...BlockBase,
    kind: z.literal('equation'),
    latex: z.string().min(1).max(600),
    /** Substrings to draw the eye to, e.g. ['RT']. Semantic, not coordinates. */
    highlight: z.array(z.string().min(1).max(40)).max(6).default([]),
    caption: Label.optional(),
  })
  .strict()

/**
 * Tabular data.
 *
 * `align` is NOT here on purpose — that is Law 3. The renderer aligns by
 * COLUMN TYPE: numbers right, text left. Letting the author align a column is
 * how a schema starts carrying layout one field at a time.
 */
export const TableBlock = z
  .object({
    ...BlockBase,
    kind: z.literal('table'),
    columns: z
      .array(
        z
          .object({
            key: Id,
            label: Label,
            type: z.enum(['text', 'number', 'percent', 'currency']).default('text'),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    rows: z.array(z.record(z.union([z.string(), z.number(), z.null()]))).min(1).max(200),
    caption: Label.optional(),
  })
  .strict()

/**
 * A relationship between numbers.
 *
 * `chartType` is a claim about the DATA's shape, not a picture: `line` says
 * "continuous over an ordered axis", `pie` says "parts of one whole". The
 * validator can therefore refuse a pie chart whose parts do not sum, which a
 * purely visual field could never support.
 */
export const ChartBlock = z
  .object({
    ...BlockBase,
    kind: z.literal('chart'),
    chartType: z.enum(['line', 'bar', 'scatter', 'pie', 'area']),
    xLabel: Label.optional(),
    yLabel: Label.optional(),
    series: z
      .array(
        z
          .object({
            name: Label,
            /** Index into the design system's fixed series palette. */
            colorIndex: SeriesIndex.default(0),
            points: z
              .array(
                z
                  .object({ x: z.union([z.number(), z.string()]), y: z.number() })
                  .strict(),
              )
              .min(1)
              .max(500),
          })
          .strict(),
      )
      .min(1)
      .max(6),
    /** A single point worth naming, by its x value. Not a pixel. */
    annotate: z
      .object({ atX: z.union([z.number(), z.string()]), label: Label })
      .strict()
      .optional(),
    caption: Label.optional(),
  })
  .strict()

/**
 * A causal or sequential chain.
 *
 * Nodes carry text and nothing else. The layout grammar decides whether this
 * becomes a left-to-right chain, a wrapped chain, or a vertical stack, based on
 * how many nodes there are and how much room the frame has.
 */
export const FlowBlock = z
  .object({
    ...BlockBase,
    kind: z.literal('flow'),
    nodes: z
      .array(z.object({ id: Id, label: Label, tone: Tone.default('neutral') }).strict())
      .min(2)
      .max(12),
    /** `from`/`to` reference node ids. Validated as a real graph, not free text. */
    links: z
      .array(z.object({ from: Id, to: Id, label: Label.optional() }).strict())
      .min(1)
      .max(24),
    caption: Label.optional(),
  })
  .strict()

/**
 * A physical system the reader can drive.
 *
 * The author names the MODEL and its controls, never the rendering. The same
 * spec drives the 2D schematic and the 3D scene — which is what makes the
 * 2D/3D switch a view toggle rather than two authored lessons.
 */
export const SimulationBlock = z
  .object({
    ...BlockBase,
    kind: z.literal('simulation'),
    model: z.enum(['ideal-gas']),
    controls: z
      .array(
        z
          .object({
            key: z.enum(['temperature', 'volume', 'moles']),
            label: Label,
            min: z.number(),
            max: z.number(),
            initial: z.number(),
            unit: Label.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(4),
    /** Which derived quantities to display. Order is the author's emphasis. */
    readouts: z.array(z.enum(['pressure', 'temperature', 'volume', 'moles'])).min(1).max(4),
    caption: Label.optional(),
  })
  .strict()

export const Block = z.discriminatedUnion('kind', [
  ProseBlock,
  CalloutBlock,
  MisconceptionBlock,
  ReasoningBlock,
  SummaryBlock,
  MetricBlock,
  EquationBlock,
  TableBlock,
  ChartBlock,
  FlowBlock,
  SimulationBlock,
  /*
   * The general case. `chart`, `table` and `flow` above are the three shapes
   * common enough to deserve their own ergonomic block; `figure` reaches the
   * other 130-odd named representations through the registry.
   *
   * They are kept as separate kinds rather than collapsed into `figure`
   * because the short forms are what a teacher will actually write, and a
   * schema nobody wants to type is a schema nobody uses.
   */
  FigureBlock,
])
/** The rendered shape: defaults applied, so a renderer can trust every field. */
export type Block = z.output<typeof Block>
export type BlockKind = Block['kind']

/* -------------------------------------------------------------------------- */
/* The lesson                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * How blocks relate to each other — the author's ONE structural decision.
 *
 * Not a position. `supports` says block B is evidence for block A; the layout
 * grammar reads that and may place B beneath A, beside it, or behind a
 * disclosure, depending on the frame. The author states the relationship and
 * stops.
 */
export const Relation = z
  .object({
    from: Id,
    to: Id,
    kind: z.enum(['supports', 'derives', 'contrasts', 'exemplifies']),
  })
  .strict()

export const LessonSpec = z
  .object({
    id: Id,
    /** The question the lesson answers. Rendered as the title. */
    question: z.string().min(1).max(200),
    subject: Label.optional(),
    blocks: z.array(Block).min(1).max(MOST_BLOCKS),
    relations: z.array(Relation).max(48).default([]),
    /**
     * The lesson's technical vocabulary, and where each word is allowed to
     * start being used.
     *
     * "Define in the simplest correct language; introduce the technical term
     * only after the basic idea has landed" is unenforceable as advice and
     * trivial to enforce as data: name the term, name the block that earns it,
     * and any earlier appearance is a defect the gate can point at.
     *
     * Ids, plus the word itself. No sentences about the learner — the same rule
     * `llm/contract.py` states for `weak_subskills`, for the same reason.
     */
    technicalTerms: z
      .array(
        z
          .object({ term: z.string().min(1).max(60), introducedIn: Id })
          .strict(),
      )
      .max(12)
      .default([]),
  })
  .strict()

/*
 * TWO TYPES, AND THE DIFFERENCE MATTERS
 * -------------------------------------
 * `z.infer` is the OUTPUT type — every `.default()` already applied. Using it to
 * type an authored lesson demands `highlight: []` on an equation that highlights
 * nothing, and `relations: []` on a lesson with no relations. That is the schema
 * making the author do the parser's job.
 *
 * `LessonInput` is what a human or a model WRITES: defaults optional.
 * `Lesson` is what comes out of the validator: defaults filled, safe to render.
 * Renderers take `Lesson` and can therefore trust every field exists.
 */
export type LessonInput = z.input<typeof LessonSpec>
export type Lesson = z.output<typeof LessonSpec>
export type Relation = z.output<typeof Relation>
