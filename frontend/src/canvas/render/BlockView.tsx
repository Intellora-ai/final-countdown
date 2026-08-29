import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react'
import katex from 'katex'
/*
 * KATEX'S OWN STYLESHEET. WITHOUT IT, KATEX EMITS THE MARKUP AND NOTHING
 * POSITIONS IT.
 *
 * This import was missing, and the omission was invisible for as long as the
 * only shipped equation was `PV = nRT` — a formula with no subscript, no
 * superscript and no fraction, which looks correct with the layout CSS absent.
 *
 * The logarithms lesson has `\log_b x`, and the subscript rendered at the full
 * base size: measured 28.5px against a 28.5px base, with the element carrying
 * `katex-sizing reset-size6 size3` and no rule to match it. Every equation in
 * the product has been rendering unstyled since the feature shipped.
 */
import 'katex/dist/katex.min.css'

import { Caption, Panel, SectionLabel } from '../design/primitives'
import type { Block } from '../spec/spec'
/* The SAME split the gate counts against. If the renderer broke runs on a
   different rule, the gate would be measuring text nobody ever sees. */
import { segments } from '../teach/teaching'
import { FigureView } from './FigureView'
import { FlowView } from './FlowView'

/* The heavy renderers load only when a lesson actually contains one. A lesson
   of pure prose should not pay for ECharts, and almost none pay for three.js. */
const ChartView = lazy(() => import('./ChartView').then((m) => ({ default: m.ChartView })))
const TableView = lazy(() => import('./TableView').then((m) => ({ default: m.TableView })))
const SimulationView = lazy(() =>
  import('./SimulationView').then((m) => ({ default: m.SimulationView })),
)

/**
 * One block, rendered.
 *
 * THE DISPATCH IS EXHAUSTIVE ON PURPOSE
 * -------------------------------------
 * The `never` in the default arm means adding a block kind to the spec without
 * a renderer is a TYPE ERROR, not a blank space discovered by a reader. A
 * silent fallthrough is how a lesson ships with a hole in it.
 */
export function BlockView({
  block,
  marker,
  mode,
}: {
  block: Block
  /**
   * The number shown in the section marker, or null for a block with no title.
   *
   * NOT the block's index. An untitled block renders no marker, so counting by
   * index skipped a number — the page read ① ② ③ ⑤, which looks like a missing
   * section rather than a block that simply has no heading. The caller counts
   * only the blocks that actually show a marker.
   */
  marker: number | null
  mode: '2d' | '3d'
}) {
  return (
    <section className="lc-block" data-emphasis={block.emphasis} data-kind={block.kind}>
      {block.title && marker !== null && (
        <SectionLabel n={marker} sub={block.kind === 'simulation' ? 'Interactive' : undefined}>
          {block.title}
        </SectionLabel>
      )}
      <Body block={block} mode={mode} />
    </section>
  )
}

function Body({ block, mode }: { block: Block; mode: '2d' | '3d' }) {
  switch (block.kind) {
    case 'prose':
      return <MarkedBody body={block.body} terms={block.terms} />

    case 'callout':
      return (
        <div className="lc-callout" data-tone={block.tone}>
          <MarkedBody body={block.body} terms={block.terms} />
        </div>
      )

    case 'misconception':
      return <MisconceptionView block={block} />

    case 'reasoning':
      return <ReasoningView block={block} />

    case 'summary':
      return <SummaryView block={block} />

    case 'metric':
      return <MetricView block={block} />

    case 'equation':
      return <EquationView block={block} />

    case 'flow':
      return (
        <>
          <FlowView block={block} />
          {block.caption && <Caption>{block.caption}</Caption>}
        </>
      )

    case 'chart':
      return (
        <Suspense fallback={<Loading label="chart" />}>
          <ChartView block={block} />
          {block.caption && <Caption>{block.caption}</Caption>}
        </Suspense>
      )

    case 'table':
      return (
        <Suspense fallback={<Loading label="table" />}>
          <TableView block={block} />
          {block.caption && <Caption>{block.caption}</Caption>}
        </Suspense>
      )

    case 'simulation':
      return (
        <Panel glow>
          <Suspense fallback={<Loading label="simulation" />}>
            <SimulationView block={block} mode={mode} />
          </Suspense>
          {block.caption && <Caption>{block.caption}</Caption>}
        </Panel>
      )

    /* The general case: any of the 137 named representations. `FigureView`
       dispatches on the SHAPE the registry maps the name to, so this arm does
       not grow when a new representation is added. */
    case 'figure':
      return <FigureView block={block} />


    default: {
      const exhaustive: never = block
      return exhaustive
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Marked terms                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A body with its key terms drawn out.
 *
 * ELEMENTS, NEVER HTML. The obvious implementation wraps the term in `<strong>`
 * inside a string and hands it to `dangerouslySetInnerHTML`. That would make
 * every lesson body an injection site, and lesson bodies arrive from a model
 * and from the web resolver — the two least trusted sources in the system. The
 * text is split and the pieces are returned as React children, so a body
 * containing `<script>` renders as the characters `<script>`.
 *
 * THE FIRST OCCURRENCE ONLY. Marking every occurrence of "tense" in a chunk
 * about tenses bolds half the sentence, and a page where everything is bold has
 * nothing emphasised. The first is where the reader meets the word.
 *
 * WHAT THE MARK MEANS, NOT WHAT IT LOOKS LIKE. `data-mark` carries `key` or
 * `distinction`; the stylesheet decides that one is bold and the other is bold
 * and underlined. Law 3 stays intact, and changing that decision is one rule in
 * one file rather than an edit to every lesson.
 */
type Terms = Extract<Block, { kind: 'prose' }>['terms']

/**
 * One run of text, with any of its terms drawn out.
 *
 * `used` is shared across runs so a term is marked at its FIRST appearance in
 * the block and nowhere after. Marking every occurrence of "tense" in a chunk
 * about tenses bolds half the block, and a page where everything is bold has
 * nothing emphasised.
 */
function markedRun(run: string, terms: Terms, used: Set<string>): ReactNode[] {
  const lower = run.toLowerCase()
  const spans: { start: number; end: number; mark: string }[] = []

  for (const term of terms) {
    const key = term.text.toLowerCase()
    if (used.has(key)) continue
    const start = lower.indexOf(key)
    /* A term that is nowhere in the body is a defect `checkTeaching` reports as
       `marked-term-absent`. Rendering skips it rather than throwing: one
       mis-marked word must not cost the reader the whole block. */
    if (start === -1) continue
    used.add(key)
    spans.push({ start, end: start + term.text.length, mark: term.mark })
  }

  spans.sort((a, b) => a.start - b.start)

  const out: ReactNode[] = []
  let at = 0
  spans.forEach((span, i) => {
    // Overlapping marks would double-wrap the same characters.
    if (span.start < at) return
    if (span.start > at) out.push(run.slice(at, span.start))
    out.push(
      <strong className="lc-term" data-mark={span.mark} key={`${span.start}-${i}`}>
        {run.slice(span.start, span.end)}
      </strong>,
    )
    at = span.end
  })
  if (at < run.length) out.push(run.slice(at))
  return out
}

/**
 * A body, rendered as the separated runs the author wrote.
 *
 * THE BLANK LINES ARE THE POINT, AND HTML EATS THEM.
 *
 * `<p>{body}</p>` collapses every run of whitespace, so a body carefully broken
 * every two or three lines arrives as one solid wall — the exact thing the
 * break was there to prevent. The author's blank lines are therefore turned
 * into real paragraphs here. `checkTeaching` refuses a run over thirty words,
 * and this is what makes obeying that rule visible rather than theoretical.
 *
 * ELEMENTS, NEVER HTML. The obvious implementation wraps the term in `<strong>`
 * inside a string and hands it to `dangerouslySetInnerHTML`. That would make
 * every lesson body an injection site, and bodies arrive from a model and from
 * the web resolver — the two least trusted sources in the system. The text is
 * split and returned as React children, so a body containing `<script>` renders
 * as the characters `<script>`.
 *
 * WHAT THE MARK MEANS, NOT WHAT IT LOOKS LIKE. `data-mark` carries `key` or
 * `distinction`; the stylesheet decides one is bold and the other bold and
 * underlined. Law 3 stays intact, and changing that decision is one rule in one
 * file rather than an edit to every lesson.
 */
function MarkedBody({ body, terms }: { body: string; terms: Terms }) {
  const runs = segments(body)
  const used = new Set<string>()

  return (
    <>
      {runs.map((run, i) => (
        <p className="lc-body" key={`${i}-${run.slice(0, 24)}`}>
          {markedRun(run, terms, used)}
        </p>
      ))}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Misconception                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The wrong form, the right one, and why — side by side.
 *
 * Side by side rather than stacked because the whole value of showing the error
 * is the comparison, and a reader who has to scroll between the two is
 * comparing from memory. The layout gives this block eight columns for exactly
 * that reason; the wrap to a stack on a narrow frame is the stylesheet's call.
 */
function MisconceptionView({ block }: { block: Extract<Block, { kind: 'misconception' }> }) {
  return (
    <div className="lc-misconception">
      <div className="lc-misconception__pair">
        <div className="lc-misconception__side" data-side="wrong">
          <span className="lc-misconception__tag">Wrong</span>
          <p className="lc-body">{block.wrong}</p>
        </div>
        <div className="lc-misconception__side" data-side="correct">
          <span className="lc-misconception__tag">Correct</span>
          <p className="lc-body">{block.correct}</p>
        </div>
      </div>
      {/* Through `MarkedBody` and not a bare `<p>`: the reason carries the same
          blank-line allowance every other body does, and rendering it flat threw
          the author's break away. Measured on the logarithms lesson, where
          "Counting, not sharing." was written as its own run and arrived glued
          to the sentence before it. */}
      <div className="lc-misconception__why">
        <MarkedBody body={block.why} terms={[]} />
      </div>
      {/* The reason persuades; the counterexample settles. Shown last, because
          it is what the reader should leave holding. */}
      {block.counterexample !== undefined && (
        <p className="lc-misconception__proof">
          <span className="lc-misconception__tag">Check it</span>
          {block.counterexample}
        </p>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* KaTeX trust                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The one KaTeX command this canvas allows, and nothing else.
 *
 * WHY THIS EXISTS: `trust: true` WAS A SCRIPT-INJECTION PATH.
 *
 * Verified against the installed KaTeX 0.18.4 types rather than from memory.
 * `trust` defaults to `false`; setting it to `true` enables the whole trusted
 * set — `\href`, `\url`, `\includegraphics`, `\htmlClass`, `\htmlId`,
 * `\htmlStyle`, `\htmlData`. This renderer had `trust: true`.
 *
 * That was survivable while every equation was hand-written in this repository.
 * It stopped being survivable when `authorLesson` began accepting a `latex`
 * string from a local model, and I widened it further by giving each
 * `reasoning` step its own `latex` field. A model-authored
 * `\href{javascript:…}{x}` is executable, and `\htmlStyle` is arbitrary CSS.
 * Model output is untrusted input (OWASP LLM05), and this was the one place in
 * the lesson path not treating it that way — the prose path is safe because it
 * renders as React children rather than HTML.
 *
 * A HANDLER RATHER THAN `false`, AND THAT IS THE POINT.
 *
 * `trust` also accepts `(context) => boolean`. Turning it off outright would
 * have taken `highlight` with it — the author names a term and the design
 * system draws it, which is a feature worth keeping. So exactly one command is
 * allowed, with exactly the one class this file emits. Everything else is
 * refused and KaTeX renders it inertly in `errorColor`.
 *
 * `strict` is deliberately left alone. It governs warnings about non-standard
 * LaTeX, not what may execute; tightening it here would change how existing
 * equations render without closing anything.
 */
const HIGHLIGHT_CLASS = 'lc-hl'

function trustOnlyOurHighlight(context: { command: string; class?: string }): boolean {
  return context.command === '\\htmlClass' && context.class === HIGHLIGHT_CLASS
}

/* -------------------------------------------------------------------------- */
/* Reasoning                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One step of an argument, and what licenses it.
 *
 * The formula, where there is one, is set by KaTeX; the `expression` is always
 * present underneath it as the readable form and as the accessible name. A
 * lesson that renders only LaTeX is unreadable to a screen reader, and a
 * `because` shown only on hover is a `because` nobody reads.
 */
function ReasoningStep({
  step,
  n,
  numbered,
}: {
  step: Extract<Block, { kind: 'reasoning' }>['steps'][number]
  n: number
  numbered: boolean
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host || step.latex === undefined) return
    katex.render(step.latex, host, {
      displayMode: false,
      throwOnError: false,
      trust: trustOnlyOurHighlight,
      strict: false,
      output: 'html',
    })
  }, [step.latex])

  return (
    <li className="lc-reasoning__step">
      {numbered && <span className="lc-reasoning__n">{n}</span>}
      <div className="lc-reasoning__state">
        {step.latex !== undefined ? (
          <div className="lc-reasoning__math" ref={hostRef} role="math" aria-label={step.expression} />
        ) : (
          <span className="lc-body">{step.expression}</span>
        )}
      </div>
      <div className="lc-reasoning__because">{step.because}</div>
    </li>
  )
}

/**
 * A claim, earned.
 *
 * WHY THE REASON IS A COLUMN AND NOT A FOOTNOTE.
 *
 * The whole value of a derivation is that the reader can check each step
 * against its justification without holding either in their head. Putting the
 * reasons in a paragraph underneath turns that into a memory exercise, which is
 * the thing the derivation was supposed to remove.
 *
 * A worked case is numbered and a justification is not, because the steps of a
 * worked case are a procedure the learner will repeat, and the steps of a proof
 * are not.
 */
function ReasoningView({ block }: { block: Extract<Block, { kind: 'reasoning' }> }) {
  return (
    <div className="lc-reasoning" data-mode={block.mode}>
      <p className="lc-reasoning__claim">{block.claim}</p>
      <ol className="lc-reasoning__steps">
        {block.steps.map((step, i) => (
          <ReasoningStep
            key={`${i}-${step.expression.slice(0, 20)}`}
            step={step}
            n={i + 1}
            numbered={block.mode === 'worked'}
          />
        ))}
      </ol>
      <p className="lc-reasoning__therefore">{block.therefore}</p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Summary                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The progression, then the one sentence worth keeping.
 *
 * The arrows between steps are drawn by the renderer, from the ORDER of the
 * array. The author writes a list; they never type "→", which is the same
 * division `flow` already keeps and the reason `checkTeaching` refuses an arrow
 * typed into prose.
 *
 * `aria-hidden` on the arrows because a screen reader announcing "right arrow"
 * five times is noise — the ordered list already carries the sequence.
 */
function SummaryView({ block }: { block: Extract<Block, { kind: 'summary' }> }) {
  return (
    <div className="lc-summary">
      <ol className="lc-summary__progression">
        {block.progression.map((step, i) => (
          <li className="lc-summary__step" key={step}>
            {i > 0 && (
              <span className="lc-summary__arrow" aria-hidden="true">
                →
              </span>
            )}
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <p className="lc-summary__model">{block.mentalModel}</p>
    </div>
  )
}

function Loading({ label }: { label: string }) {
  return (
    <p className="lc-caption" role="status">
      Loading {label}…
    </p>
  )
}

/* -------------------------------------------------------------------------- */
/* Metric                                                                     */
/* -------------------------------------------------------------------------- */

function MetricView({ block }: { block: Extract<Block, { kind: 'metric' }> }) {
  /* `deltaMeaning` is the author's; whether that renders as accent or warning
     is the design system's. Up is good for pressure and bad for error rate, and
     only the author knows which. */
  const good =
    block.delta === undefined || block.deltaMeaning === 'neutral'
      ? 'neutral'
      : block.deltaMeaning === 'up-is-good'
        ? String(block.delta >= 0)
        : String(block.delta < 0)

  return (
    <div>
      <div>
        <span className="lc-metric__value">
          {typeof block.value === 'number' ? formatNumber(block.value) : block.value}
        </span>
        {block.unit && <span className="lc-metric__unit">{block.unit}</span>}
      </div>
      {block.delta !== undefined && (
        <div className="lc-metric__delta" data-good={good}>
          {block.delta >= 0 ? '↑' : '↓'} {formatNumber(Math.abs(block.delta))}%
        </div>
      )}
      {block.caption && <Caption>{block.caption}</Caption>}
    </div>
  )
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (Math.abs(value) >= 1e6) return value.toExponential(2)
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

/* -------------------------------------------------------------------------- */
/* Equation                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * KaTeX, with the author's named terms underlined.
 *
 * `highlight` names a TERM ('RT'), never a position. Wrapping it in `\htmlClass`
 * before KaTeX runs is what lets the design system decide that a highlighted
 * term is an accent underline — the author never learns what it looks like.
 *
 * `throwOnError: false` is deliberate: a malformed formula renders visibly in
 * red rather than taking the whole lesson down with it. One broken equation
 * should cost one block, not the page.
 */
function EquationView({ block }: { block: Extract<Block, { kind: 'equation' }> }) {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let latex = block.latex
    for (const term of block.highlight) {
      /*
       * BRACED, BECAUSE A SUBSCRIPT TAKES ONE GROUP.
       *
       * Unbraced, highlighting `b` in `\log_b x` produced
       * `\log_\htmlClass{lc-hl}{b} x` — a subscript followed by a macro rather
       * than by a single group, which KaTeX rejects. With `throwOnError:false`
       * that surfaced as the whole formula printed in red, which is what the
       * logarithms lesson did on first render.
       *
       * The braces make the substitution one group wherever it lands. It does
       * not make the substitution SOUND in general — this is still a substring
       * replace over LaTeX, so a term matching inside a macro name would still
       * corrupt the formula. That is a pre-existing limit worth fixing
       * separately; this change removes the case that actually fires.
       */
      latex = latex.split(term).join(`{\\htmlClass{${HIGHLIGHT_CLASS}}{${term}}}`)
    }

    katex.render(latex, host, {
      displayMode: true,
      throwOnError: false,
      trust: trustOnlyOurHighlight,
      strict: false,
      output: 'html',
    })
  }, [block.latex, block.highlight])

  return (
    <>
      {/*
        AN EQUATION IS AS WIDE AS ITS LONGEST LINE, AND NOTHING CAN REFLOW IT.

        KaTeX lays out to an intrinsic width and there is no wrap point inside a
        formula: `PV = nRT` at the display size measures 313px, which fits a
        320px column with 7px to spare on macOS and does not fit the same column
        on Linux CI, where the fallback metrics differ. That 7px is the whole
        margin, so the same commit passes locally and fails in CI — which is
        exactly what it did.

        Rendered bare, that overflow had nowhere to go: it pushed the document
        to `scrollWidth` 334 against `clientWidth` 320 and could not be scrolled
        to. Same defect as the chart blocks one component over, and the same
        fix — the scroller `FigureView` already gives its figures.
      */}
      <div
        className="lc-figure-scroll"
        data-overflow="scroll"
        role="region"
        tabIndex={0}
        aria-label={`${block.title ?? 'equation'}, scrollable equation`}
      >
        <div className="lc-equation" ref={hostRef} role="math" aria-label={block.latex} />
      </div>
      {block.caption && <Caption>{block.caption}</Caption>}
    </>
  )
}
